// How the interceptors keep (or lose) the lead's aircraft: with their own radar and eyes they need
// a clear line of sight (terrain and the city block it; low over the open sea there is nothing to
// hide behind) and a range that shrinks with his radar signature and with flying low in the surface
// clutter; with ground guidance from the coastal radar they know where he is at any range. Pure.

/**
 * Whether one point sees another over the ground.
 * @param {number} ax @param {number} ay @param {number} az The eye.
 * @param {number} bx @param {number} by @param {number} bz The target.
 * @param {((x: number, z: number) => number) | null} heightAt Ground height (sea bed below 0 counts as the sea surface).
 * @param {number} samples Points tested along the line.
 * @param {number} clutterHeight Added on land for buildings and trees.
 * @returns {boolean}
 */
export function lineOfSight(ax, ay, az, bx, by, bz, heightAt, samples, clutterHeight) {
  if (!heightAt) return true;
  for (let i = 1; i < samples; i += 1) {
    const t = i / samples;
    const ground = heightAt(ax + (bx - ax) * t, az + (bz - az) * t);
    if (!(ground > 0.5)) continue; // the sea, or outside the plan: nothing stands there
    if (ground + clutterHeight > ay + (by - ay) * t) return false;
  }
  return true;
}

/**
 * How far an interceptor's own sensors reach against a target.
 * @param {number} signature The target's radar signature, 0..1.
 * @param {number} heightAboveSurface Metres over the ground or the sea.
 * @param {object} tracking AIR_GUARD_TUNING.tracking.
 * @returns {number} Metres.
 */
export function ownDetectionRange(signature, heightAboveSurface, tracking) {
  const s = signature < 0 ? 0 : signature > 1 ? 1 : signature;
  const radar = tracking.radarRange * s * (heightAboveSurface < tracking.lowHeight ? tracking.lowFactor : 1);
  return radar > tracking.eyesRange ? radar : tracking.eyesRange;
}

/**
 * Whether an interceptor holds the target by itself.
 * @param {{x: number, y: number, z: number}} craft
 * @param {{x: number, y: number, z: number, signature: number, heightAboveSurface: number}} lead
 * @param {((x: number, z: number) => number) | null} heightAt
 * @param {object} tracking AIR_GUARD_TUNING.tracking.
 * @returns {boolean}
 */
export function seesTarget(craft, lead, heightAt, tracking) {
  const dx = lead.x - craft.x;
  const dy = lead.y - craft.y;
  const dz = lead.z - craft.z;
  const range = ownDetectionRange(lead.signature, lead.heightAboveSurface, tracking);
  if (dx * dx + dy * dy + dz * dz > range * range) return false;
  return lineOfSight(craft.x, craft.y, craft.z, lead.x, lead.y, lead.z, heightAt, tracking.lineOfSightSamples, tracking.cityClutterHeight);
}

/**
 * The pair's track of the lead: 'guidance' while the ground radar guides them, 'own' while either
 * airborne interceptor sees him, null when nobody does.
 * @param {Array<{x: number, y: number, z: number, phase: string}>} interceptors
 * @param {object} lead
 * @param {{guidance?: boolean, heightAt?: Function | null}} env
 * @param {object} tracking
 * @returns {'guidance' | 'own' | null}
 */
export function trackSourceOf(interceptors, lead, env, tracking) {
  if (env.guidance) return 'guidance';
  for (let i = 0; i < interceptors.length; i += 1) {
    if (interceptors[i].phase === 'air' && seesTarget(interceptors[i], lead, env.heightAt ?? null, tracking)) return 'own';
  }
  return null;
}
