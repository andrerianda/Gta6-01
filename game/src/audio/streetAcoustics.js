// The echo of the place the listener stands in, measured rather than guessed: eight level rays
// at ear height out to 60 m and one straight up (the director casts one ray a frame, round
// robin, against the static world). Walls close on both sides make a street canyon with a crisp
// slap-back timed by their distance (there and back at 343 m/s); a ceiling with walls around is
// indoors (a tight, dense flutter); open ground, a beach or a park is nearly dry. Pure.

export const ACOUSTIC_RAY_COUNT = 8;
export const ACOUSTIC_REACH = 60;
const SPEED_OF_SOUND = 343;

/** A fresh acoustics record (allocate once, refill with streetAcoustics). */
export function createAcoustics() {
  return { enclosure: 0, canyon: 0, indoor: false, slapSeconds: 0.12, slapFeedback: 0.2, slapGain: 0.15, dampingHz: 2800, reverbGain: 0.45 };
}

/**
 * Fills `out` from the ray distances.
 * @param {ReturnType<typeof createAcoustics>} out
 * @param {ArrayLike<number>} distances ACOUSTIC_RAY_COUNT level ray lengths, metres (>= reach: no wall)
 * @param {number} ceiling metres to a roof overhead (Infinity: open sky)
 * @param {{shoreDistance?: number|null}} [place]
 */
export function streetAcoustics(out, distances, ceiling, place = {}) {
  const n = distances.length;
  let hits = 0, sum = 0, pairs = 0;
  for (let i = 0; i < n; i += 1) {
    const d = distances[i];
    if (d < ACOUSTIC_REACH) { hits += 1; sum += d; }
    if (i < n / 2 && d < ACOUSTIC_REACH && distances[i + n / 2] < ACOUSTIC_REACH) pairs += 1;
  }
  const enclosure = hits / n;
  const canyon = pairs / (n / 2);
  const mean = hits > 0 ? sum / hits : ACOUSTIC_REACH;
  const indoor = ceiling < 12 && enclosure >= 0.6;
  out.enclosure = enclosure;
  out.canyon = canyon;
  out.indoor = indoor;
  if (indoor) {
    out.slapSeconds = clamp(2 * mean / SPEED_OF_SOUND, 0.012, 0.06);
    out.slapFeedback = 0.55;
    out.slapGain = 0.45;
    out.dampingHz = 3800;
    out.reverbGain = 0.3;
    return out;
  }
  out.slapSeconds = clamp(2 * mean / SPEED_OF_SOUND, 0.03, 0.35);
  out.slapFeedback = 0.12 + 0.33 * canyon;
  out.slapGain = 0.04 + 0.5 * canyon * (0.5 + 0.5 * enclosure) + (ceiling < 12 ? 0.1 : 0);
  out.dampingHz = 2200 + 1200 * canyon;
  out.reverbGain = 0.2 + 0.35 * enclosure;
  // By the sea the open water swallows the tail.
  const shore = place.shoreDistance;
  if (typeof shore === 'number' && shore < 80) {
    const open = 1 - Math.max(0, shore) / 80;
    out.slapGain *= 1 - 0.7 * open;
    out.reverbGain *= 1 - 0.5 * open;
  }
  return out;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
