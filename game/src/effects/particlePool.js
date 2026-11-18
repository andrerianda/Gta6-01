// The particle pool of the world effects: a fixed number of particles kept as flat typed arrays
// (no object per particle, nothing allocated after creation), packed at the front so that the
// live ones are always indices 0..count-1. A particle has a position, a velocity, an age and a
// life, a size scale, a spin, a brightness tint, the height of the ground under it and a style:
// the shared description of how it moves (drag toward the air, rise, gravity, wind, bounce) and
// how it looks over its life (size, opacity, albedo, emission). Styles live in effectCatalogue.js;
// this module is pure and runs in Node.

/**
 * @typedef {Object} ParticleStyle How one kind of particle moves and looks (effectCatalogue.js).
 * @property {number} frame Atlas cell (0..15).
 * @property {number} [frames] Number of consecutive cells to pick from at random; default 1.
 * @property {number[]} size [start, end] size in metres (before the particle's scale).
 * @property {number} [sizeCurve] Exponent of the growth over life; < 1 grows fast early. Default 0.5.
 * @property {number} opacity Peak opacity 0..1.
 * @property {number} [fadeIn] Fraction of life spent fading in. Default 0.08.
 * @property {number} [fadeOut] Fraction of life spent fading out. Default 0.5.
 * @property {number[]} albedo [r, g, b] at birth, linear.
 * @property {number[]} [albedoEnd] [r, g, b] at death; default albedo.
 * @property {number[]} [emission] [r, g, b] HDR emission at birth; default none.
 * @property {number[]} [emissionEnd] [r, g, b] emission when it has cooled (at emissionFade).
 * @property {number} [emissionFade] Fraction of life after which the emission is gone. Default 1.
 * @property {number} [occlusion] How much the particle hides what is behind (1 smoke, 0 a glow). Default 1.
 * @property {number} [lit] 1 lit by sun and sky as a ball of smoke, 0 flat albedo. Default 1.
 * @property {number} [drag] Rate (1/s) at which the velocity relaxes toward the air. Default 0.
 * @property {number} [rise] Upward speed of the air the particle relaxes toward (buoyancy), m/s.
 * @property {number} [gravity] Downward acceleration, m/s². Default 0.
 * @property {number} [wind] How much the wind carries it, 0..1. Default 0.
 * @property {number} [bounce] Restitution on the ground; 0 lies on it. Default 0.
 * @property {number} [stretch] Seconds of motion a streak spans (sparks); 0 a round sprite.
 * @property {boolean} [upright] Keeps the sprite nearly upright and unspun (flames).
 * @property {number} [pull] Flame cards: drawn this share of their size nearer the camera (so a
 *   card is not cut by the body it rises from), and their glow flickers. Default 0.
 */

/** Floats per particle the renderer uploads (five vec4 attributes). */
export const PARTICLE_ATTRIBUTE_FLOATS = 20;

/**
 * Creates a particle pool.
 * @param {number} capacity The most particles alive at once (the quality tier's maxParticles).
 */
export function createParticlePool(capacity) {
  const n = Math.max(1, capacity | 0);
  const pool = {
    capacity: n,
    count: 0,
    px: new Float32Array(n), py: new Float32Array(n), pz: new Float32Array(n),
    vx: new Float32Array(n), vy: new Float32Array(n), vz: new Float32Array(n),
    age: new Float32Array(n), life: new Float32Array(n), scale: new Float32Array(n),
    rot: new Float32Array(n), spin: new Float32Array(n), tint: new Float32Array(n),
    floorY: new Float32Array(n), frame: new Uint8Array(n), style: new Uint16Array(n),
    /** Particles refused because the pool was full, since creation. */
    dropped: 0,

    /**
     * Adds a particle; returns its index, or -1 when the pool is full.
     * A positive `delay` holds it unseen and still for that many seconds.
     */
    spawn(styleIndex, frame, x, y, z, vx, vy, vz, life, scale, rotation, spin, tint, floorY, delay) {
      if (pool.count >= n) { pool.dropped += 1; return -1; }
      const i = pool.count++;
      pool.px[i] = x; pool.py[i] = y; pool.pz[i] = z;
      pool.vx[i] = vx; pool.vy[i] = vy; pool.vz[i] = vz;
      pool.age[i] = -(delay > 0 ? delay : 0);
      pool.life[i] = life > 0.01 ? life : 0.01;
      pool.scale[i] = scale; pool.rot[i] = rotation; pool.spin[i] = spin;
      pool.tint[i] = tint; pool.floorY[i] = floorY;
      pool.frame[i] = frame; pool.style[i] = styleIndex;
      return i;
    },

    /** Removes particle `i` by moving the last one into its place. */
    kill(i) {
      const last = pool.count - 1;
      if (i < 0 || i > last) return;
      if (i !== last) copyParticle(pool, last, i);
      pool.count = last;
    },

    /**
     * Advances every particle by `dt` seconds through its style's motion, against the wind
     * (`windX`, `windZ` in m/s) and the ground height each particle carries.
     * @param {number} dt Seconds.
     * @param {ParticleStyle[]} styles The style table the indices refer to.
     */
    step(dt, styles, windX, windZ) {
      let i = 0;
      while (i < pool.count) {
        let age = pool.age[i];
        if (age < 0) {
          pool.age[i] = age + dt;
          i += 1;
          continue;
        }
        age += dt;
        if (age >= pool.life[i]) { pool.kill(i); continue; }
        pool.age[i] = age;
        const s = styles[pool.style[i]];
        let vx = pool.vx[i]; let vy = pool.vy[i]; let vz = pool.vz[i];
        const drag = s.drag ?? 0;
        if (drag > 0) {
          const k = Math.min(1, drag * dt);
          const w = s.wind ?? 0;
          vx += (windX * w - vx) * k;
          vz += (windZ * w - vz) * k;
          vy += ((s.rise ?? 0) - vy) * k;
        }
        vy -= (s.gravity ?? 0) * dt;
        let y = pool.py[i] + vy * dt;
        const floor = pool.floorY[i];
        if (y < floor) {
          y = floor;
          const bounce = s.bounce ?? 0;
          vy = vy < 0 ? -vy * bounce : vy;
          vx *= 0.55; vz *= 0.55;
          pool.spin[i] *= 0.5;
        }
        pool.px[i] += vx * dt; pool.py[i] = y; pool.pz[i] += vz * dt;
        pool.vx[i] = vx; pool.vy[i] = vy; pool.vz[i] = vz;
        pool.rot[i] += pool.spin[i] * dt;
        i += 1;
      }
    },

    /** Removes every particle. */
    clear() { pool.count = 0; },
  };
  return pool;
}

function copyParticle(pool, from, to) {
  pool.px[to] = pool.px[from]; pool.py[to] = pool.py[from]; pool.pz[to] = pool.pz[from];
  pool.vx[to] = pool.vx[from]; pool.vy[to] = pool.vy[from]; pool.vz[to] = pool.vz[from];
  pool.age[to] = pool.age[from]; pool.life[to] = pool.life[from]; pool.scale[to] = pool.scale[from];
  pool.rot[to] = pool.rot[from]; pool.spin[to] = pool.spin[from]; pool.tint[to] = pool.tint[from];
  pool.floorY[to] = pool.floorY[from]; pool.frame[to] = pool.frame[from]; pool.style[to] = pool.style[from];
}

/**
 * Writes the look of particle `i` at its present age into `out` at `offset`, in the renderer's
 * layout: [x, y, z, size,  vx, vy, vz, stretch,  albedo r, g, b, opacity,  emission r, g, b,
 * floorY,  rotation, frame, lit, occlusion]. A particle still waiting for its delay gets size 0.
 * @param {ReturnType<typeof createParticlePool>} pool
 * @param {ParticleStyle[]} styles
 * @param {number} i Particle index.
 * @param {Float32Array} out
 * @param {number} offset
 */
export function writeParticleLook(pool, styles, i, out, offset) {
  const s = styles[pool.style[i]];
  const age = pool.age[i];
  const t = age <= 0 ? 0 : age / pool.life[i];
  const growth = Math.pow(t, s.sizeCurve ?? 0.5);
  const size = age < 0 ? 0 : (s.size[0] + (s.size[1] - s.size[0]) * growth) * pool.scale[i];
  const fadeIn = s.fadeIn ?? 0.08;
  const fadeOut = s.fadeOut ?? 0.5;
  let fade = 1;
  if (t < fadeIn) fade = t / fadeIn;
  else if (t > 1 - fadeOut) fade = (1 - t) / fadeOut;
  fade = fade * fade * (3 - 2 * fade);
  const tint = pool.tint[i];
  const a0 = s.albedo; const a1 = s.albedoEnd ?? a0;
  out[offset] = pool.px[i]; out[offset + 1] = pool.py[i]; out[offset + 2] = pool.pz[i]; out[offset + 3] = size;
  // w > 0: a streak's seconds of motion; w < 0: a flame card's pull toward the camera (of its size)
  out[offset + 4] = pool.vx[i]; out[offset + 5] = pool.vy[i]; out[offset + 6] = pool.vz[i];
  out[offset + 7] = s.stretch > 0 ? s.stretch : -(s.pull ?? 0);
  out[offset + 8] = (a0[0] + (a1[0] - a0[0]) * t) * tint;
  out[offset + 9] = (a0[1] + (a1[1] - a0[1]) * t) * tint;
  out[offset + 10] = (a0[2] + (a1[2] - a0[2]) * t) * tint;
  out[offset + 11] = s.opacity * fade;
  const e0 = s.emission;
  if (e0) {
    const e1 = s.emissionEnd ?? e0;
    const span = s.emissionFade ?? 1;
    const u = t >= span ? 1 : t / span;
    const strength = (1 - u) * (1 - u) * tint;
    out[offset + 12] = (e0[0] + (e1[0] - e0[0]) * u) * strength;
    out[offset + 13] = (e0[1] + (e1[1] - e0[1]) * u) * strength;
    out[offset + 14] = (e0[2] + (e1[2] - e0[2]) * u) * strength;
  } else {
    out[offset + 12] = 0; out[offset + 13] = 0; out[offset + 14] = 0;
  }
  out[offset + 15] = pool.floorY[i];
  out[offset + 16] = pool.rot[i]; out[offset + 17] = pool.frame[i];
  out[offset + 18] = s.lit ?? 1; out[offset + 19] = s.occlusion ?? 1;
}

/**
 * Orders the live particles far to near by squared distance from the eye, with a counting sort
 * over `buckets` distance bands (linear time, no allocation). Writes indices into `order`.
 * @param {ReturnType<typeof createParticlePool>} pool
 * @param {number} ex Eye x. @param {number} ey Eye y. @param {number} ez Eye z.
 * @param {Uint16Array} order Receives `pool.count` indices.
 * @param {Uint16Array} keys Scratch, capacity long.
 * @param {Uint32Array} buckets Scratch counts, its length is the number of bands.
 */
export function sortParticlesFarToNear(pool, ex, ey, ez, order, keys, buckets) {
  const count = pool.count;
  const bands = buckets.length;
  buckets.fill(0);
  for (let i = 0; i < count; i += 1) {
    const dx = pool.px[i] - ex; const dy = pool.py[i] - ey; const dz = pool.pz[i] - ez;
    // sqrt of distance spreads near particles over more bands than far ones
    const d = Math.sqrt(Math.sqrt(dx * dx + dy * dy + dz * dz));
    let band = bands - 1 - Math.floor(d * 3.2);
    if (band < 0) band = 0;
    keys[i] = band;
    buckets[band] += 1;
  }
  let running = 0;
  for (let b = 0; b < bands; b += 1) {
    const c = buckets[b];
    buckets[b] = running;
    running += c;
  }
  for (let i = 0; i < count; i += 1) order[buckets[keys[i]]++] = i;
}
