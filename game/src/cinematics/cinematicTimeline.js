// The cinematic timeline: plays a scene script's cues in time. Pure (no three.js, no DOM).
// advance(dt) returns the cues that became due, in order (time, then the order they were
// written); a cue with seconds is also a track from t to t + seconds, listed in `tracks` with
// its progress k (0..1) so a shot or a fade interpolates, and listed one last time with k = 1 and
// ended = true. A 'waitFor' cue holds the clock at its time until resume(token) or its timeout.
// skip() hands back the essential cues that had not fired; seek(t) jumps (captures).

/** The easings a track may name. */
export const EASINGS = Object.freeze({
  linear: (k) => k,
  smooth: (k) => k * k * (3 - 2 * k),
  in: (k) => k * k,
  out: (k) => 1 - (1 - k) * (1 - k),
});

/** k eased by name ('smooth' when the name is unknown). */
export function ease(name, k) {
  const clamped = k < 0 ? 0 : k > 1 ? 1 : k;
  return (EASINGS[name] ?? EASINGS.smooth)(clamped);
}

/**
 * Creates the timeline of a script.
 * @param {{cues: {kind: string, t: number, seconds?: number, essential?: boolean, order?: number}[], duration?: number}} script
 */
export function createCinematicTimeline(script) {
  const cues = (script.cues ?? []).map((cue, index) => ({ cue, index, order: cue.order ?? index }))
    .sort((a, b) => a.cue.t - b.cue.t || a.order - b.order);
  let duration = Number.isFinite(script.duration) ? script.duration : 0;
  for (const { cue } of cues) duration = Math.max(duration, cue.t + (cue.seconds ?? 0));
  let time = 0, next = 0, hold = null, skipped = false;
  /** @type {{cue: object, k: number, t: number, ended: boolean}[]} */
  let tracks = [];

  function refreshTracks() {
    for (const track of tracks) {
      const seconds = track.cue.seconds;
      track.t = Math.min(seconds, Math.max(0, time - track.cue.t));
      track.k = seconds > 0 ? track.t / seconds : 1;
      track.ended = time >= track.cue.t + seconds;
    }
  }

  function fire(entry, due) {
    due.push(entry.cue);
    if ((entry.cue.seconds ?? 0) > 0) tracks.push({ cue: entry.cue, k: 0, t: 0, ended: false });
  }

  /** Runs the clock to `target`, stopping at a wait; fills `due`. */
  function runTo(target, due) {
    while (next < cues.length && cues[next].cue.t <= target) {
      const entry = cues[next];
      next += 1;
      fire(entry, due);
      if (entry.cue.kind === 'waitFor') {
        time = entry.cue.t;
        hold = { token: entry.cue.token ?? null, left: entry.cue.timeout ?? Infinity };
        return;
      }
    }
    time = target;
  }

  const timeline = {
    get time() { return time; },
    get duration() { return duration; },
    /** The token the clock waits for, or null. */
    get waiting() { return hold ? hold.token ?? '' : null; },
    get done() { return skipped || (!hold && next >= cues.length && time >= duration); },
    /** The running tracks (and those that ended in the last advance, once). */
    get tracks() { return tracks; },
    /** How many cues have fired. */
    get fired() { return next; },

    /**
     * Moves the clock by dt seconds.
     * @returns {object[]} The cues that became due, in order.
     */
    advance(dt) {
      const due = [];
      if (skipped) return due;
      tracks = tracks.filter((track) => !track.ended);
      let left = dt > 0 ? dt : 0;
      if (hold) {
        if (hold.left > left) { hold.left -= left; refreshTracks(); return due; }
        left -= hold.left === Infinity ? left : hold.left;
        hold = null;
      }
      runTo(Math.min(duration, time + left), due);
      refreshTracks();
      return due;
    },

    /**
     * Lets a waiting clock run on. Without a token any wait is released.
     * @returns {boolean} Whether a wait was released.
     */
    resume(token = null) {
      if (!hold) return false;
      if (token !== null && token !== undefined && hold.token !== null && hold.token !== token) return false;
      hold = null;
      return true;
    },

    /**
     * Ends the timeline now.
     * @returns {object[]} The essential cues that had not fired, in order.
     */
    skip() {
      const essential = [];
      if (skipped) return essential;
      for (; next < cues.length; next += 1) if (cues[next].cue.essential) essential.push(cues[next].cue);
      skipped = true;
      hold = null;
      tracks = [];
      time = duration;
      return essential;
    },

    /**
     * Jumps to a time (waits are passed over).
     * @returns {object[]} Every cue from the start up to that time, in order, so the caller can
     *   rebuild the state there; `tracks` holds the tracks alive at that time.
     */
    seek(seconds) {
      const target = Math.min(duration, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
      const crossed = [];
      skipped = false;
      hold = null;
      tracks = [];
      next = 0;
      while (next < cues.length && cues[next].cue.t <= target) { fire(cues[next], crossed); next += 1; }
      time = target;
      refreshTracks();
      // A track that ended before the target is kept once (k = 1) so its end state is applied.
      return crossed;
    },
  };
  return timeline;
}
