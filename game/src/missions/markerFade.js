// How visible a mission marker is from where the lead and the camera are: a glowing shell or a
// beam seen from inside (or from a step away) fills the picture with a flat slab of light, so a
// marker fades out as the lead or the camera comes within its radius plus a metre and back in
// over the next couple of metres. Pure; missionMarkers.js eases its opacity towards this.

/** Metres beyond the marker's radius where it is fully gone. */
export const MARKER_CLEAR_MARGIN = 1;
/** Metres over which it comes back beyond that. */
export const MARKER_FADE_BAND = 2.5;

/**
 * The marker's opacity factor (0 hidden, 1 full) for the nearer of the lead and the camera.
 * @param {number} distance Plane distance from the marker's axis to the nearer viewer, metres.
 * @param {number} radius The marker's footprint radius (shell, ring or beam), metres.
 */
export function markerFade(distance, radius) {
  const t = (distance - radius - MARKER_CLEAR_MARGIN) / MARKER_FADE_BAND;
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/**
 * Plane distance from a marker at (x, z) to the nearer of up to two viewers ({x, z} or null).
 * @returns {number} Infinity when there is no viewer.
 */
export function nearestViewerGap(x, z, lead, camera) {
  const a = lead ? Math.hypot(lead.x - x, lead.z - z) : Infinity;
  const b = camera ? Math.hypot(camera.x - x, camera.z - z) : Infinity;
  return Math.min(a, b);
}

/** Eases a current fade towards its target: about 0.25 s to settle, never a snap. */
export function easeFade(current, target, deltaSeconds) {
  const step = Math.min(1, Math.max(0, deltaSeconds) * 10);
  const next = current + (target - current) * step;
  return Math.abs(next - target) < 0.002 ? target : next;
}
