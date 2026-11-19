// The ground and collider surface types the physics knows, with the numbers that depend on them:
// tyre grip, how much grip rain takes away, rolling resistance, and how hulls and props slide and
// bounce on each.

/** Surface type ids. A ground provider or a collider may give the id or the lower-case name. */
export const SURFACE = Object.freeze({
  ASPHALT: 0,
  CONCRETE: 1,
  SAND: 2,
  GRASS: 3,
  DIRT: 4,
  WOOD: 5,
  METAL: 6,
  WATER: 7,
});

/** Surface names by id. */
export const SURFACE_NAMES = Object.freeze([
  'asphalt', 'concrete', 'sand', 'grass', 'dirt', 'wood', 'metal', 'water',
]);

/** Tyre grip multiplier by surface id (dry). */
export const SURFACE_GRIP = Object.freeze([1.0, 0.97, 0.62, 0.72, 0.78, 0.9, 0.82, 0.45]);

/** The share of tyre grip a fully wet surface loses, by surface id. */
export const SURFACE_WET_LOSS = Object.freeze([0.22, 0.2, 0.05, 0.25, 0.3, 0.3, 0.35, 0]);

/** Rolling resistance multiplier by surface id (asphalt is 1). */
export const SURFACE_ROLLING = Object.freeze([1, 1, 9, 3.5, 2.5, 1.2, 1, 14]);

/** Sliding friction of hulls, props and debris on each surface. */
export const SURFACE_FRICTION = Object.freeze([0.62, 0.6, 0.85, 0.55, 0.6, 0.5, 0.35, 0.3]);

/** Bounce of hulls, props and debris on each surface (0 dead, 1 perfectly elastic). */
export const SURFACE_RESTITUTION = Object.freeze([0.22, 0.22, 0.04, 0.1, 0.1, 0.2, 0.28, 0]);

const SURFACE_ID_BY_NAME = new Map(SURFACE_NAMES.map((name, id) => [name, id]));

/**
 * The surface id of whatever a provider or a collider description gave.
 * @param {number | string | undefined | null} surface An id, a name such as "sand", or nothing.
 * @returns {number} A SURFACE id; asphalt when unknown.
 */
export function surfaceIdOf(surface) {
  if (typeof surface === 'number') return surface >= 0 && surface < SURFACE_NAMES.length ? surface | 0 : 0;
  if (typeof surface === 'string') return SURFACE_ID_BY_NAME.get(surface) ?? 0;
  return 0;
}

/**
 * Tyre grip on a surface at a wetness.
 * @param {number} surfaceId A SURFACE id.
 * @param {number} wetness 0 dry to 1 soaked.
 * @returns {number} The grip multiplier.
 */
export function surfaceGripAt(surfaceId, wetness) {
  return SURFACE_GRIP[surfaceId] * (1 - SURFACE_WET_LOSS[surfaceId] * wetness);
}
