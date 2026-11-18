// The damage rules of a vehicle, as pure maths (tested in tools/tests/vehicle-system/): how many
// points a crash takes, the stages a car goes through on its way to a wreck (dented, smoking,
// burning, exploded), how far the body panels dent around an impact, when a window cracks and
// shatters and when a bumper falls off. The fleet applies them to the models and the physics.

/** Energy per kilogram (J/kg) a crash may have before it does any damage (about 2 m/s). */
export const DAMAGE_DEAD_ZONE = 2;
/** Health points per J/kg beyond the dead zone: a 50 km/h wall crash takes about half a sports car. */
export const DAMAGE_PER_SPECIFIC_ENERGY = 4;
/** Health fraction below which the engine smokes. */
export const SMOKE_BELOW = 0.4;
/** Health fraction below which the engine burns (and keeps losing health until it explodes). */
export const FIRE_BELOW = 0.18;
/** Share of the maximum health a burning vehicle loses per second (about seven seconds to explode). */
export const BURN_RATE = 0.026;
/** Deepest a panel may be pushed in, metres. */
export const MAX_DENT = 0.22;
/** Damage points a bumper takes before it falls off. */
export const BUMPER_STRENGTH = 160;

/** Damage stages, in order. */
export const DAMAGE_STAGE = Object.freeze({ INTACT: 0, SMOKING: 1, BURNING: 2, WRECKED: 3 });

/**
 * The damage a crash does.
 * @param {number} energy The impact energy in joules (the physics' estimate).
 * @param {number} mass The vehicle's mass in kilograms.
 * @param {number} [scale] A multiplier (an armoured car takes less).
 * @returns {number} Health points to take away (0 for a tap).
 */
export function impactDamage(energy, mass, scale = 1) {
  if (!(energy > 0) || !(mass > 0)) return 0;
  const specific = energy / mass - DAMAGE_DEAD_ZONE;
  return specific > 0 ? specific * DAMAGE_PER_SPECIFIC_ENERGY * scale : 0;
}

/**
 * The stage of a vehicle with some health left.
 * @param {number} health Health points left.
 * @param {number} maxHealth Health when new.
 * @returns {number} A DAMAGE_STAGE value.
 */
export function damageStageOf(health, maxHealth) {
  if (health <= 0) return DAMAGE_STAGE.WRECKED;
  const fraction = health / maxHealth;
  if (fraction < FIRE_BELOW) return DAMAGE_STAGE.BURNING;
  if (fraction < SMOKE_BELOW) return DAMAGE_STAGE.SMOKING;
  return DAMAGE_STAGE.INTACT;
}

/**
 * How deep a crash dents the body at its centre.
 * @param {number} damage Health points the crash took.
 * @returns {number} Metres (0..MAX_DENT).
 */
export function dentDepthOf(damage) {
  return Math.min(MAX_DENT, damage * 0.0011);
}

/**
 * Dents a mesh: vertices within `radius` of the impact point move along `direction` (into the
 * car), most at the centre, none at the edge (smooth cubic falloff). The total push of a vertex
 * from where it was built is capped at MAX_DENT, so repeated hits crumple but never turn inside out.
 * @param {Float32Array | number[]} positions The mesh's vertex positions (x, y, z, ...), changed in place.
 * @param {Float32Array | number[]} original The positions as built, same layout.
 * @param {{x: number, y: number, z: number}} point The impact point in the mesh's space.
 * @param {{x: number, y: number, z: number}} direction Unit push direction in the mesh's space.
 * @param {number} radius Metres around the point that move.
 * @param {number} depth Metres the centre moves.
 * @returns {number} How many vertices moved.
 */
export function dentVertices(positions, original, point, direction, radius, depth) {
  if (!(depth > 0) || !(radius > 0)) return 0;
  const radiusSquared = radius * radius;
  let moved = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const dx = positions[i] - point.x;
    const dy = positions[i + 1] - point.y;
    const dz = positions[i + 2] - point.z;
    const distanceSquared = dx * dx + dy * dy + dz * dz;
    if (distanceSquared >= radiusSquared) continue;
    const t = 1 - Math.sqrt(distanceSquared) / radius;
    const push = depth * t * t * (3 - 2 * t);
    let x = positions[i] + direction.x * push;
    let y = positions[i + 1] + direction.y * push;
    let z = positions[i + 2] + direction.z * push;
    const ox = x - original[i];
    const oy = y - original[i + 1];
    const oz = z - original[i + 2];
    const total = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (total > MAX_DENT) {
      const k = MAX_DENT / total;
      x = original[i] + ox * k;
      y = original[i + 1] + oy * k;
      z = original[i + 2] + oz * k;
    }
    positions[i] = x;
    positions[i + 1] = y;
    positions[i + 2] = z;
    moved += 1;
  }
  return moved;
}

/**
 * The state of a window after a crash near it: 0 whole, 1 cracked, 2 shattered (gone).
 * @param {number} state The state before.
 * @param {number} distance Metres from the impact to the pane's centre.
 * @param {number} damage Health points the crash took.
 * @returns {number} The new state.
 */
export function windowStateAfter(state, distance, damage) {
  const felt = damage * Math.max(0, 1 - distance / 2.2);
  if (felt > 70 || (state === 1 && felt > 25)) return 2;
  if (felt > 18 && state < 1) return 1;
  return state;
}

/**
 * Which bumper a crash hits, from the impact point in model space (facing -Z).
 * @param {number} localZ The impact's z in model space.
 * @param {number} length The vehicle's length.
 * @returns {'front' | 'rear' | null} The bumper, or null for a side hit.
 */
export function bumperHitBy(localZ, length) {
  if (localZ < -length * 0.32) return 'front';
  if (localZ > length * 0.32) return 'rear';
  return null;
}
