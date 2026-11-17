// Which of the many registered night lights deserve a real (shader-evaluated) light this frame.
// Pure arithmetic, no three.js: the local-light manager scores every candidate with
// scoreLocalLight() and keeps the best few with selectTopScores(); the rest stay as glow sprites
// and ground pools.
//
// A light scores high when it is close relative to its own reach, in front of the camera, bright,
// and marked important by its owner (the player's headlamps, a police light bar). A light that
// already holds a real slot gets a bonus, so two lamps at similar distances do not swap every frame.

/** Lights farther than this from the camera are never real; they are sprites only. */
export const MAX_REAL_LIGHT_DISTANCE = 150;

/** Score multiplier for a light that held a real slot in the previous frame. */
export const INCUMBENT_BONUS = 1.3;

/**
 * Scores one light for the real-light budget.
 * @param {number} lightX World position of the light.
 * @param {number} lightY
 * @param {number} lightZ
 * @param {number} range The distance the light reaches, metres.
 * @param {number} intensity Its current intensity (after blinking, dimming and day fading).
 * @param {number} importance The owner's priority; 1 is an ordinary street lamp.
 * @param {boolean} incumbent True when the light already holds a real slot.
 * @param {{x: number, y: number, z: number, forwardX: number, forwardY: number, forwardZ: number}} view
 *   The camera position and its unit forward vector.
 * @returns {number} 0 when the light must not be real; larger is more deserving.
 */
export function scoreLocalLight(lightX, lightY, lightZ, range, intensity, importance, incumbent, view) {
  if (intensity <= 0 || importance <= 0 || range <= 0) return 0;
  const dx = lightX - view.x;
  const dy = lightY - view.y;
  const dz = lightZ - view.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (distance > MAX_REAL_LIGHT_DISTANCE + range) return 0;

  // Closeness measured in units of the light's own reach: a floodlight matters from farther away
  // than a doorway lamp.
  const relative = distance / (range * 1.6);
  const proximity = 1 / (1 + relative * relative);

  // A light behind the camera still lights what the camera sees if the camera stands inside its
  // reach; otherwise it counts for little.
  let facing = 1;
  if (distance > range * 0.8) {
    const cosine = (dx * view.forwardX + dy * view.forwardY + dz * view.forwardZ) / distance;
    const t = clamp01((cosine + 0.25) / 0.75);
    facing = 0.2 + 0.8 * t * t * (3 - 2 * t);
  }

  // Brightness counts, but with diminishing returns, so one searchlight cannot starve the street.
  const brightness = 0.4 + 0.6 * Math.min(1, Math.sqrt(intensity / 300));

  // Fade the score to zero toward the distance cut-off instead of dropping it.
  const cutoff = clamp01((MAX_REAL_LIGHT_DISTANCE + range - distance) / 30);

  return importance * proximity * facing * brightness * cutoff * (incumbent ? INCUMBENT_BONUS : 1);
}

/**
 * Finds the indices of the highest scores.
 * @param {ArrayLike<number>} scores One score per candidate; zero or less means "never".
 * @param {number} count How many entries of `scores` are in use.
 * @param {number} budget How many to keep at most.
 * @param {Int32Array} outIndices Receives the kept candidate indices, best first; needs at least
 *   `budget` entries.
 * @returns {number} How many were kept (at most `budget`, fewer when fewer score above zero).
 */
export function selectTopScores(scores, count, budget, outIndices) {
  let kept = 0;
  if (budget <= 0) return 0;
  for (let i = 0; i < count; i += 1) {
    const score = scores[i];
    if (!(score > 0)) continue;
    if (kept === budget && score <= scores[outIndices[kept - 1]]) continue;
    // Insertion into the short sorted list: shift the weaker entries down one place.
    let slot = kept < budget ? kept : kept - 1;
    while (slot > 0 && scores[outIndices[slot - 1]] < score) {
      outIndices[slot] = outIndices[slot - 1];
      slot -= 1;
    }
    outIndices[slot] = i;
    if (kept < budget) kept += 1;
  }
  return kept;
}

/**
 * The real-light budgets of each quality level: how many spot lights and point lights are
 * evaluated in every lit material's shader. The counts are fixed per level so that shaders never
 * recompile when lights come and go.
 * @type {Readonly<Record<string, {spots: number, points: number}>>}
 */
export const LOCAL_LIGHT_BUDGETS = Object.freeze({
  low: Object.freeze({ spots: 2, points: 2 }),
  medium: Object.freeze({ spots: 4, points: 4 }),
  high: Object.freeze({ spots: 6, points: 6 }),
  ultra: Object.freeze({ spots: 8, points: 8 }),
});

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
