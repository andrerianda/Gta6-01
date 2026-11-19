// The collision layers of the physics world. Every collider, body and character belongs to one
// layer, and every query takes a mask of the layers it wants to hit.

/**
 * Collision layers, one bit each.
 * GROUND is the terrain height field; STATIC is solid world geometry that also blocks sight
 * (buildings, walls, ramps); SEE_THROUGH is solid geometry that does not block sight (fences,
 * railings, glass, low curbs); VEHICLE, CHARACTER and PROP are the moving things (a knockable
 * prop stays on PROP while it is still standing); DEBRIS is small loose bodies that characters
 * walk through; TRIGGER volumes only report who enters and leaves.
 */
export const LAYER = Object.freeze({
  GROUND: 1,
  STATIC: 2,
  SEE_THROUGH: 4,
  VEHICLE: 8,
  CHARACTER: 16,
  PROP: 32,
  DEBRIS: 64,
  TRIGGER: 128,
});

/**
 * Ready-made query masks.
 * SOLID is everything a moving thing can bump into; SIGHT is what hides one thing from another;
 * SHOT is what stops a bullet; WORLD is the fixed world only (terrain and static geometry).
 */
export const MASK = Object.freeze({
  SOLID: LAYER.GROUND | LAYER.STATIC | LAYER.SEE_THROUGH | LAYER.VEHICLE | LAYER.PROP,
  SIGHT: LAYER.GROUND | LAYER.STATIC | LAYER.VEHICLE,
  SHOT: LAYER.GROUND | LAYER.STATIC | LAYER.VEHICLE | LAYER.CHARACTER | LAYER.PROP,
  WORLD: LAYER.GROUND | LAYER.STATIC | LAYER.SEE_THROUGH,
  ALL: 0x7fffffff & ~LAYER.TRIGGER,
});
