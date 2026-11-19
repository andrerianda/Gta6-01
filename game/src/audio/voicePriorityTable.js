// The voice limit: a fixed table of sound slots shared by every positional one-shot. A new
// sound takes a free slot, or steals the least important busy one (lower priority first, then
// the farthest, then the one that ends soonest) when it outranks it; otherwise it is dropped.
// Pure bookkeeping with typed arrays, no WebAudio and no allocation after creation.

/** Priorities of the sound families (higher wins a slot). */
export const SOUND_PRIORITY = Object.freeze({
  footstep: 1,
  ambience: 2,
  impact: 4,
  horn: 5,
  gunshot: 6,
  crash: 7,
  explosion: 9,
  interface: 10,
});

/**
 * Creates a voice table.
 * @param {number} capacity Number of slots (the quality tier's audioVoices).
 */
export function createVoicePriorityTable(capacity) {
  const priority = new Float32Array(capacity);
  const distance = new Float32Array(capacity);
  const endTime = new Float64Array(capacity);
  let stolen = 0;
  let dropped = 0;

  return {
    capacity,
    /**
     * Picks a slot for a sound, or -1 when every slot is busy with something more important.
     * @param {number} soundPriority
     * @param {number} soundDistance metres from the listener
     * @param {number} now current audio time
     * @param {number} duration seconds the sound lasts
     */
    acquire(soundPriority, soundDistance, now, duration) {
      let victim = -1;
      let victimScore = Infinity;
      for (let i = 0; i < capacity; i += 1) {
        if (endTime[i] <= now) { victim = i; victimScore = -Infinity; break; }
        const score = priority[i] * 1000 - Math.min(distance[i], 999) - Math.max(0, endTime[i] - now) * 0.001;
        if (score < victimScore) { victimScore = score; victim = i; }
      }
      const myScore = soundPriority * 1000 - Math.min(soundDistance, 999);
      if (victimScore !== -Infinity) {
        if (victimScore >= myScore) { dropped += 1; return -1; }
        stolen += 1;
      }
      priority[victim] = soundPriority;
      distance[victim] = soundDistance;
      endTime[victim] = now + duration;
      return victim;
    },
    /** True when the slot is still sounding at `now`. */
    busy(slot, now) { return endTime[slot] > now; },
    /** Frees a slot early. */
    release(slot) { endTime[slot] = 0; },
    /** Number of slots sounding at `now`. */
    activeCount(now) {
      let n = 0;
      for (let i = 0; i < capacity; i += 1) if (endTime[i] > now) n += 1;
      return n;
    },
    get stolen() { return stolen; },
    get dropped() { return dropped; },
  };
}
