// Spent cases thrown out of a gun's ejection port with each shot: small brass or lacquered-steel
// cylinders (a red plastic shell for the shotgun) that fly out to the side, tumble end over end,
// bounce with a few hops on the ground, lie still briefly and shrink away. One pooled InstancedMesh
// (one draw while any case is alive), lit like the scene; the oldest case is reused when the pool
// is full. Nothing is allocated per frame.

import * as THREE from 'three';

/** Size (diameter, length in metres) and colours of a case, by its kind. */
export const CASING_KINDS = Object.freeze({
  pistol: { diameter: 0.0105, length: 0.021, colours: [0xc9a04a, 0xb8913f] },
  steel: { diameter: 0.011, length: 0.021, colours: [0x5c6150, 0x4e5446] },
  rifle: { diameter: 0.011, length: 0.046, colours: [0xc79a43, 0xd2a955] },
  magnum: { diameter: 0.013, length: 0.062, colours: [0xc29745, 0xb58a3a] },
  shell: { diameter: 0.019, length: 0.066, colours: [0x9c1f1a, 0x7d1a16] },
});
const FLOATS = 12; // x y z, vx vy vz, yaw, pitch, spin, age, life, floor
const SHRINK_SECONDS = 0.25;
const GRAVITY = 9.8;

/**
 * Creates the case pool and adds its mesh to `parent`.
 * @param {THREE.Object3D} parent @param {() => number} random Uniform 0..1.
 * @param {number} [capacity] Cases alive at once.
 */
export function createShellCasings(parent, random, capacity = 40) {
  const state = new Float32Array(capacity * FLOATS);
  const kinds = new Uint8Array(capacity);
  const names = Object.keys(CASING_KINDS);
  // a short cylinder along +Z, unit size (scaled per instance)
  const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1);
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.85, roughness: 0.32 });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = 'effects-casings';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.visible = false;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const size = new THREE.Vector3();
  const colour = new THREE.Color();
  matrix.makeScale(0, 0, 0);
  for (let i = 0; i < capacity; i += 1) { mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, colour.setHex(0xffffff)); }
  parent.add(mesh);
  let cursor = 0;
  let alive = 0;

  return {
    mesh,
    /** Cases alive now. */
    get count() { return alive; },

    /**
     * Throws one case.
     * @param {string} kind A CASING_KINDS name.
     * @param {number} x @param {number} y @param {number} z The ejection port.
     * @param {number} ex @param {number} ey @param {number} ez Unit direction the cases fly.
     * @param {number} ax @param {number} az The aim, flat (cases fly a little back from it).
     * @param {number} floorY Ground under the port.
     */
    eject(kind, x, y, z, ex, ey, ez, ax, az, floorY) {
      const slot = cursor;
      cursor = (cursor + 1) % capacity;
      const o = slot * FLOATS;
      if (!(state[o + 10] > 0)) alive += 1;
      const k = Math.max(0, names.indexOf(kind));
      kinds[slot] = k;
      const out = 2.2 + random() * 1.6;
      const up = 1.4 + random() * 1.2;
      const back = 0.3 + random() * 0.6;
      state[o] = x; state[o + 1] = y; state[o + 2] = z;
      state[o + 3] = ex * out - ax * back + (random() - 0.5) * 0.5;
      state[o + 4] = ey * out * 0.5 + up;
      state[o + 5] = ez * out - az * back + (random() - 0.5) * 0.5;
      state[o + 6] = Math.atan2(ex, ez) + (random() - 0.5) * 0.8;
      state[o + 7] = random() * Math.PI;
      state[o + 8] = (18 + random() * 16) * (random() < 0.5 ? -1 : 1);
      state[o + 9] = 0;
      state[o + 10] = 1.9 + random() * 0.9;
      state[o + 11] = floorY;
      const look = CASING_KINDS[names[k]];
      mesh.setColorAt(slot, colour.setHex(look.colours[random() < 0.5 ? 0 : 1]));
      mesh.instanceColor.needsUpdate = true;
      mesh.visible = true;
      return slot;
    },

    /** Moves, bounces and ages the cases and writes the instance matrices. */
    update(dt) {
      if (alive === 0 || !(dt > 0)) return;
      for (let i = 0; i < capacity; i += 1) {
        const o = i * FLOATS;
        if (!(state[o + 10] > 0)) continue;
        state[o + 9] += dt;
        const age = state[o + 9];
        const life = state[o + 10];
        if (age >= life) {
          state[o + 10] = 0;
          alive -= 1;
          matrix.makeScale(0, 0, 0);
          mesh.setMatrixAt(i, matrix);
          continue;
        }
        const look = CASING_KINDS[names[kinds[i]]];
        state[o + 4] -= GRAVITY * dt;
        state[o] += state[o + 3] * dt; state[o + 1] += state[o + 4] * dt; state[o + 2] += state[o + 5] * dt;
        const restY = state[o + 11] + look.diameter * 0.5;
        if (state[o + 1] <= restY) {
          state[o + 1] = restY;
          if (state[o + 4] < -1.2) {
            // a hop or two, losing most of its speed each time
            state[o + 4] = -state[o + 4] * 0.3;
            state[o + 3] *= 0.55; state[o + 5] *= 0.55; state[o + 8] *= -0.6;
            state[o + 6] += (random() - 0.5) * 1.2;
          } else {
            // lying on its side: roll to a stop
            state[o + 4] = 0;
            const friction = Math.max(0, 1 - 7 * dt);
            state[o + 3] *= friction; state[o + 5] *= friction;
            state[o + 8] = 0;
            state[o + 7] += (Math.round(state[o + 7] / Math.PI) * Math.PI - state[o + 7]) * Math.min(1, 12 * dt);
          }
        }
        state[o + 7] += state[o + 8] * dt;
        const shrink = Math.min(1, (life - age) / SHRINK_SECONDS);
        euler.set(state[o + 7], state[o + 6], 0);
        rotation.setFromEuler(euler);
        position.set(state[o], state[o + 1], state[o + 2]);
        size.set(look.diameter * shrink, look.diameter * shrink, look.length * shrink);
        matrix.compose(position, rotation, size);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (alive === 0) mesh.visible = false;
    },

    /** Height of case `slot` above its ground, or -1 when it is not alive (tests). */
    heightOf(slot) {
      const o = slot * FLOATS;
      return state[o + 10] > 0 ? state[o + 1] - state[o + 11] : -1;
    },

    /** Removes every case. */
    clear() {
      matrix.makeScale(0, 0, 0);
      for (let i = 0; i < capacity; i += 1) { state[i * FLOATS + 10] = 0; mesh.setMatrixAt(i, matrix); }
      mesh.instanceMatrix.needsUpdate = true;
      alive = 0;
      mesh.visible = false;
    },

    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
