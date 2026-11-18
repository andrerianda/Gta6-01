// Where a shot or a blow lands. The city, the ground, props and vehicles come from one physics
// ray (vehicles report their entity id as the body's userRef); people are tested here, each as an
// upright capsule from the shins to the shoulders and a sphere for the head, so a headshot is a
// real hit on the head. The nearest of the two wins. Nothing allocates per shot.
import { LAYER } from '../physics/collisionLayers.js';
import { HIT_KIND, createQueryHit } from '../physics/collision/worldQueries.js';
import { zoneAt } from './damageRules.js';

/** What a shot can hit in the collision world (people are tested apart). */
export const SHOT_MASK = LAYER.GROUND | LAYER.STATIC | LAYER.VEHICLE | LAYER.PROP;

/** A person's hit shapes, for a stature of 1.8 m (scaled by the entity's data.stature). */
const BODY = Object.freeze({ bottom: 0.12, top: 1.42, radius: 0.27, head: 1.64, headRadius: 0.14, stature: 1.8 });

/**
 * Creates a shot result.
 * @returns {{hit: boolean, kind: 'world'|'vehicle'|'character'|'', targetId: number|string|null,
 *   distance: number, x: number, y: number, z: number, nx: number, ny: number, nz: number, zone: string,
 *   surface: number}} surface: the SURFACE id of physics/surfaceTypes.js for world hits.
 */
export function createShotResult() {
  return { hit: false, kind: '', targetId: null, distance: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, zone: '', surface: 1 };
}

/**
 * Distance along a ray (unit direction) to a sphere, or Infinity.
 */
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, radius) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const along = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - along * along;
  const r2 = radius * radius;
  if (d2 > r2) return Infinity;
  const half = Math.sqrt(r2 - d2);
  const t = along - half >= 0 ? along - half : along + half;
  return t >= 0 ? t : Infinity;
}

/**
 * Distance along a ray (unit direction) to an upright cylinder from y0 to y1, or Infinity.
 */
export function rayUprightCylinder(ox, oy, oz, dx, dy, dz, cx, cz, y0, y1, radius) {
  const px = ox - cx, pz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return Infinity;
  const b = px * dx + pz * dz;
  const c = px * px + pz * pz - radius * radius;
  const disc = b * b - a * c;
  if (disc < 0) return Infinity;
  const root = Math.sqrt(disc);
  const near = (-b - root) / a, far = (-b + root) / a;
  if (near >= 0) {
    const y = oy + dy * near;
    if (y >= y0 && y <= y1) return near;
  }
  if (far >= 0) {
    const y = oy + dy * far;
    if (y >= y0 && y <= y1) return far;
  }
  return Infinity;
}

/**
 * Creates the hit detector.
 * @param {{physics: object | null, entities: object, fallen?: Set<unknown>}} parts The physics
 *   system (raycast), the entity registry and the ids of people already dead to combat (no hit).
 */
export function createHitDetector({ physics, entities, fallen = null }) {
  const worldHit = createQueryHit();

  /**
   * Casts one shot.
   * @param {ReturnType<typeof createShotResult>} out
   * @param {number} ox Origin.
   * @param {number} dx Unit direction.
   * @param {number} maxRange Metres.
   * @param {{shooterId?: unknown, ignore?: unknown[] | null}} [skip] The shooter's entity id
   *   (never hit) and physics userRefs to pass through (the car fired from).
   */
  function cast(out, ox, oy, oz, dx, dy, dz, maxRange, skip = {}) {
    out.hit = false; out.kind = ''; out.targetId = null; out.zone = '';
    let best = maxRange;
    if (physics && physics.raycast(ox, oy, oz, dx, dy, dz, maxRange, SHOT_MASK, skip.ignore ?? null, worldHit)) {
      best = worldHit.distance;
      out.hit = true;
      out.distance = best;
      out.x = worldHit.x; out.y = worldHit.y; out.z = worldHit.z;
      out.nx = worldHit.nx; out.ny = worldHit.ny; out.nz = worldHit.nz;
      const owner = worldHit.kind === HIT_KIND.BODY && worldHit.userRef !== null ? entities.get(worldHit.userRef) : null;
      out.kind = owner && owner.kind === 'vehicle' ? 'vehicle' : 'world';
      out.targetId = owner ? owner.id : null;
      out.surface = typeof worldHit.surface === 'number' ? worldHit.surface : 1;
    }
    for (const person of entities.ofKind('character')) {
      if (person.id === skip.shooterId || !person.alive || (person.tags && person.tags.has?.('dead'))) continue;
      if (fallen && fallen.has(person.id)) continue;
      const p = person.position;
      const scale = (person.data && person.data.stature ? person.data.stature : BODY.stature) / BODY.stature;
      // Cheap reject: the ray's closest approach to the person's axis.
      const lx = p.x - ox, lz = p.z - oz;
      if (lx * dx + lz * dz < -1) continue;
      const head = raySphere(ox, oy, oz, dx, dy, dz, p.x, p.y + BODY.head * scale, p.z, BODY.headRadius * scale);
      const trunk = rayUprightCylinder(ox, oy, oz, dx, dy, dz, p.x, p.z, p.y + BODY.bottom * scale, p.y + BODY.top * scale, BODY.radius * scale);
      const t = Math.min(head, trunk);
      if (!(t < best)) continue;
      best = t;
      out.hit = true;
      out.kind = 'character';
      out.targetId = person.id;
      out.distance = t;
      out.x = ox + dx * t; out.y = oy + dy * t; out.z = oz + dz * t;
      const nx = out.x - p.x, nz = out.z - p.z, n = Math.hypot(nx, nz) || 1;
      out.nx = nx / n; out.ny = 0; out.nz = nz / n;
      out.zone = head <= trunk ? 'head' : zoneAt(out.y - p.y, BODY.stature * scale);
    }
    return out;
  }

  return { cast };
}
