// The decal pool of the world effects: marks left on the world (scorch, skid marks, bullet holes,
// blood) in a fixed ring of slots. A new mark takes a free slot, or the oldest one when the ring
// is full, so the number of marks never passes the quality tier's maxDecals and nothing is
// allocated after creation. Each mark is a flat quad: centre, unit normal, angle about the normal,
// width and length, an atlas cell, an opacity, and a life after which it fades away. The renderer
// rebuilds an instance only when its slot changed (`dirtyFrom`..`dirtyTo`). Pure; runs in Node.

/**
 * Creates a decal pool.
 * @param {number} capacity The most marks at once.
 */
export function createDecalPool(capacity) {
  const n = Math.max(1, capacity | 0);
  const pool = {
    capacity: n,
    /** Marks alive. */
    count: 0,
    x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n),
    nx: new Float32Array(n), ny: new Float32Array(n), nz: new Float32Array(n),
    angle: new Float32Array(n), width: new Float32Array(n), length: new Float32Array(n),
    frame: new Uint8Array(n), opacity: new Float32Array(n), shade: new Float32Array(n),
    age: new Float32Array(n), life: new Float32Array(n), fade: new Float32Array(n),
    alive: new Uint8Array(n),
    /** The slot the next mark takes when no slot is free (the oldest). */
    cursor: 0,
    /** Range of slots changed since the renderer last looked (dirtyFrom > dirtyTo: none). */
    dirtyFrom: n, dirtyTo: -1,
    /** Slots whose opacity changes this frame (fading), for the renderer. */
    fading: 0,

    /**
     * Adds a mark and returns its slot.
     * @param {number} frame Atlas cell.
     * @param {number} x @param {number} y @param {number} z Centre.
     * @param {number} nx @param {number} ny @param {number} nz Unit normal of the surface.
     * @param {number} angle Rotation about the normal (radians; on the ground 0 points north).
     * @param {number} width Metres across. @param {number} length Metres along.
     * @param {number} opacity 0..1. @param {number} life Seconds before it fades (Infinity: until replaced).
     * @param {number} [fade] Seconds of the fade; default 2.
     * @param {number} [shade] Darkness factor the renderer may use (1 default).
     */
    add(frame, x, y, z, nx, ny, nz, angle, width, length, opacity, life, fade = 2, shade = 1) {
      let slot = -1;
      if (pool.count < n) {
        for (let k = 0; k < n; k += 1) {
          const s = (pool.cursor + k) % n;
          if (!pool.alive[s]) { slot = s; break; }
        }
      }
      if (slot < 0) slot = pool.cursor;
      if (!pool.alive[slot]) pool.count += 1;
      pool.cursor = (slot + 1) % n;
      pool.x[slot] = x; pool.y[slot] = y; pool.z[slot] = z;
      pool.nx[slot] = nx; pool.ny[slot] = ny; pool.nz[slot] = nz;
      pool.angle[slot] = angle; pool.width[slot] = width; pool.length[slot] = length;
      pool.frame[slot] = frame; pool.opacity[slot] = opacity; pool.shade[slot] = shade;
      pool.age[slot] = 0; pool.life[slot] = life; pool.fade[slot] = fade > 0 ? fade : 0.01;
      pool.alive[slot] = 1;
      markDirty(pool, slot);
      return slot;
    },

    /** Ages every mark; marks past their life fade, then free their slot. */
    step(dt) {
      let fading = 0;
      for (let s = 0; s < n; s += 1) {
        if (!pool.alive[s]) continue;
        const age = pool.age[s] + dt;
        pool.age[s] = age;
        const over = age - pool.life[s];
        if (over > 0) {
          fading += 1;
          markDirty(pool, s);
          if (over >= pool.fade[s]) { pool.alive[s] = 0; pool.count -= 1; }
        }
      }
      pool.fading = fading;
    },

    /** Opacity of slot `s` now (0 when free), with its fade. */
    visibleOpacity(s) {
      if (!pool.alive[s]) return 0;
      const over = pool.age[s] - pool.life[s];
      if (over <= 0) return pool.opacity[s];
      return pool.opacity[s] * Math.max(0, 1 - over / pool.fade[s]);
    },

    /** Called by the renderer once it has rebuilt the dirty range. */
    clean() { pool.dirtyFrom = n; pool.dirtyTo = -1; },

    /** Frees every slot. */
    clear() {
      pool.alive.fill(0);
      pool.count = 0;
      pool.cursor = 0;
      pool.dirtyFrom = 0; pool.dirtyTo = n - 1;
    },
  };
  return pool;
}

function markDirty(pool, slot) {
  if (slot < pool.dirtyFrom) pool.dirtyFrom = slot;
  if (slot > pool.dirtyTo) pool.dirtyTo = slot;
}
