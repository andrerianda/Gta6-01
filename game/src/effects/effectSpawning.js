// Turns one effect recipe (effectCatalogue.js) into particles in the pool: for each burst, a
// count of particles placed in its spawn volume and sent along its aim with a spread, each with
// its own life, size, spin, tint and delay drawn from the given random source. (Tracers are
// drawn by tracerStreaks.js.) Pure; runs in Node.

import { STYLE_INDEX, STYLE_LIST } from './effectCatalogue.js';

/**
 * Spawns the bursts of a recipe.
 * @param {ReturnType<import('./particlePool.js').createParticlePool>} pool
 * @param {{bursts: import('./effectCatalogue.js').BurstRecipe[]}} recipe
 * @param {number} x @param {number} y @param {number} z Where.
 * @param {number} dx @param {number} dy @param {number} dz Unit direction ('along' bursts follow it).
 * @param {number} scale Size of the effect (1 normal).
 * @param {number} floorY Ground height under it.
 * @param {() => number} random Uniform 0..1.
 * @returns {number} Particles spawned.
 */
export function spawnEffectBursts(pool, recipe, x, y, z, dx, dy, dz, scale, floorY, random) {
  let spawned = 0;
  const bursts = recipe.bursts;
  const big = scale > 1 ? Math.sqrt(scale) : 1;
  for (let b = 0; b < bursts.length; b += 1) {
    const burst = bursts[b];
    const styleIndex = STYLE_INDEX[burst.style];
    const style = STYLE_LIST[styleIndex];
    const count = Math.round(between(burst.count, random) * big);
    const aim = burst.aim ?? 'up';
    const cone = burst.cone ?? 0.4;
    const radius = (burst.radius ?? 0) * scale;
    const lift = (burst.lift ?? 0) * scale;
    // `ahead`: metres along the spawn's direction (a muzzle flash opens in front of the barrel)
    const ahead = (burst.ahead ?? 0) * scale;
    const bx = x + dx * ahead; const by = y + dy * ahead; const bz = z + dz * ahead;
    // `streak`: particles strewn over this many metres along the direction (a rocket's trail)
    const streak = (burst.streak ?? 0) * scale;
    for (let k = 0; k < count; k += 1) {
      // direction
      let ax = 0; let ay = 1; let az = 0;
      if (aim === 'along') { ax = dx; ay = dy; az = dz; } else if (aim === 'flat') {
        const a = random() * Math.PI * 2;
        ax = Math.cos(a); ay = 0.05; az = Math.sin(a);
      }
      let ox; let oy; let oz;
      if (aim === 'sphere') {
        // any direction, biased upward: the cone is measured from up and may reach below it
        const a = random() * Math.PI * 2;
        const polar = Math.acos(1 - random() * (1 - Math.cos(Math.min(Math.PI, cone * 1.6))));
        const sp = Math.sin(polar);
        ox = Math.cos(a) * sp; oy = Math.cos(polar); oz = Math.sin(a) * sp;
      } else {
        const v = spreadAround(ax, ay, az, aim === 'flat' ? 0.15 : cone, random);
        ox = v[0]; oy = v[1]; oz = v[2];
      }
      const speed = burst.speed ? between(burst.speed, random) * big : 0;
      // spawn volume
      let sx = 0; let sy = 0; let sz = 0;
      if (radius > 0) {
        const a = random() * Math.PI * 2;
        const r = Math.sqrt(random()) * radius;
        sx = Math.cos(a) * r; sz = Math.sin(a) * r; sy = (random() - 0.5) * radius * 0.5;
      }
      if (streak > 0) {
        const along = ((k + random()) / count) * streak;
        sx += dx * along; sy += dy * along; sz += dz * along;
      }
      const frame = style.frame + (style.frames > 1 ? Math.floor(random() * style.frames) : 0);
      const upright = style.upright === true;
      const spin = upright ? 0 : (random() * 2 - 1) * (burst.spin ?? 0.5);
      // upright flame cards lean up to ~16 degrees either way, so neighbours never stand parallel
      const rotation = upright ? (random() - 0.5) * 0.55 : random() * Math.PI * 2;
      const delay = burst.delay ? between(burst.delay, random) : 0;
      const s = between(burst.scale ?? DEFAULT_SCALE, random) * scale;
      const tint = between(burst.tint ?? DEFAULT_TINT, random);
      const index = pool.spawn(styleIndex, frame, bx + sx, by + lift + sy, bz + sz, ox * speed, oy * speed, oz * speed,
        between(burst.life, random) * (scale > 1 ? Math.pow(scale, 0.25) : 1), s, rotation, spin, tint, floorY, delay);
      if (index < 0) return spawned;
      spawned += 1;
    }
  }
  return spawned;
}

const DEFAULT_SCALE = [0.85, 1.15];
const DEFAULT_TINT = [0.9, 1.1];
const spread = [0, 0, 0];

function between(range, random) {
  return range[0] + (range[1] - range[0]) * random();
}

/** A unit vector within `cone` radians of (ax, ay, az), uniform over the cap. Reuses one array. */
function spreadAround(ax, ay, az, cone, random) {
  const cosMax = Math.cos(cone);
  const c = 1 - random() * (1 - cosMax);
  const s = Math.sqrt(Math.max(0, 1 - c * c));
  const phi = random() * Math.PI * 2;
  // basis perpendicular to the axis
  let ux; let uy; let uz;
  if (Math.abs(ay) < 0.9) { ux = az; uy = 0; uz = -ax; } else { ux = 0; uy = -az; uz = ay; }
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  const wx = ay * uz - az * uy; const wy = az * ux - ax * uz; const wz = ax * uy - ay * ux;
  const p = Math.cos(phi) * s; const q = Math.sin(phi) * s;
  spread[0] = ax * c + ux * p + wx * q;
  spread[1] = ay * c + uy * p + wy * q;
  spread[2] = az * c + uz * p + wz * q;
  return spread;
}
