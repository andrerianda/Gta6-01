// Flying debris of explosions and crashes as small lit 3D chunks: bent body panels in the car's
// paint or charred, glass shards that catch the sun, a tyre, twisted metal bits and lumps of
// concrete. Each kind is one pooled InstancedMesh (one draw while any of its chunks is alive),
// lit by the scene like every other object. A chunk is thrown, tumbles about its own axis, falls,
// bounces and slides to rest on the ground, then shrinks away at the end of its life. When the
// pool of a kind is full the oldest chunk is reused. Nothing is allocated per frame. For its
// first second a chunk glows hot (an orange emission per instance that cools away), so pieces
// thrown against a bright sky read as burning metal instead of dark specks.

import * as THREE from 'three';

/** The kinds of chunk, in the order of the meshes. */
export const DEBRIS_KINDS = Object.freeze(['panel', 'glass', 'tyre', 'metal', 'rubble']);

const KIND = Object.freeze({
  // half thickness: how high its centre rests above the ground; restitution; surface
  panel: { rest: 0.03, bounce: 0.25, color: 0xffffff, metalness: 0.45, roughness: 0.38 },
  glass: { rest: 0.01, bounce: 0.2, color: 0x9cc2cc, metalness: 0.3, roughness: 0.05 },
  tyre: { rest: 0.11, bounce: 0.45, color: 0x151515, metalness: 0, roughness: 0.92 },
  metal: { rest: 0.07, bounce: 0.3, color: 0xffffff, metalness: 0.75, roughness: 0.42 },
  rubble: { rest: 0.09, bounce: 0.2, color: 0xffffff, metalness: 0, roughness: 0.95 },
});
const CHARRED = [0x1c1a18, 0x2a2622, 0x38302a];
const METALS = [0x6a6c6e, 0x4c4a48, 0x8a8478, 0x5a4232];
const CONCRETE = [0x8e897f, 0x77726a, 0xa39d92];
const FLOATS = 20; // x y z, vx vy vz, qx qy qz qw, ax ay az, spin, sx sy sz, age, life, floor
const SHRINK_SECONDS = 0.6;
/** Seconds a chunk glows hot after it is thrown, and how hot each kind starts (glass less). */
const HOT_SECONDS = 0.9;
const HOT_START = Object.freeze({ panel: 1, glass: 0.2, tyre: 0.6, metal: 1, rubble: 0.7 });
/** Emission of a chunk at full heat (HDR; a sunlit white wall is about 1.2). A deep orange,
 * strongest at the edges seen side on: a uniform pale glow made the chunks read as flat yellow
 * cards in the 768x480 picture (explo768.jpg, 09:33). */
const HOT_GLOW = '2.6, 0.62, 0.08';

/**
 * How a burst of chunks is thrown.
 * @typedef {Object} DebrisSpec
 * @property {number[]} count [min, max] chunks (more for bigger effects).
 * @property {number[]} speed [min, max] m/s.
 * @property {number[]} life [min, max] seconds.
 * @property {Record<string, number>} kinds Weight of each DEBRIS_KINDS name.
 * @property {number[]} [size] [min, max] size factor. Default [0.7, 1.3].
 * @property {number} [cone] Spread from straight up, radians (may reach below level). Default 1.
 * @property {number} [radius] Spawn volume radius, m. @property {number} [lift] Metres above the point.
 */

/**
 * Creates the debris pools and adds their meshes to `parent`.
 * @param {THREE.Object3D} parent @param {() => number} random Uniform 0..1.
 * @param {number} [perKind] Chunks of each kind alive at once.
 */
export function createDebrisChunks(parent, random, perKind = 24) {
  const kinds = DEBRIS_KINDS.map((name) => buildKind(name, perKind));
  for (const kind of kinds) parent.add(kind.mesh);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const turn = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const size = new THREE.Vector3();
  const colour = new THREE.Color();
  let alive = 0;

  function spawnChunk(kind, paint, x, y, z, vx, vy, vz, life, s, floor) {
    const slot = kind.cursor;
    kind.cursor = (slot + 1) % perKind;
    const o = slot * FLOATS;
    const st = kind.state;
    if (!(st[o + 18] > 0)) { kind.alive += 1; alive += 1; }
    st[o] = x; st[o + 1] = y; st[o + 2] = z;
    st[o + 3] = vx; st[o + 4] = vy; st[o + 5] = vz;
    axis.set(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
    rotation.setFromAxisAngle(axis, random() * Math.PI * 2);
    st[o + 6] = rotation.x; st[o + 7] = rotation.y; st[o + 8] = rotation.z; st[o + 9] = rotation.w;
    axis.set(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
    st[o + 10] = axis.x; st[o + 11] = axis.y; st[o + 12] = axis.z;
    st[o + 13] = (4 + random() * 10) * (random() < 0.5 ? -1 : 1);
    // uneven proportions so no two chunks look alike
    st[o + 14] = s * (0.7 + random() * 0.6); st[o + 15] = s * (0.7 + random() * 0.6); st[o + 16] = s * (0.7 + random() * 0.6);
    if (kind.name === 'tyre') { st[o + 14] = s; st[o + 15] = s; st[o + 16] = s; }
    st[o + 17] = 0; st[o + 18] = life; st[o + 19] = floor;
    colour.setHex(pickColour(kind.name, paint));
    kind.mesh.setColorAt(slot, colour);
    kind.mesh.instanceColor.needsUpdate = true;
    kind.mesh.visible = true;
  }

  function pickColour(name, paint) {
    if (name === 'panel') return random() < 0.55 ? paint : CHARRED[Math.floor(random() * CHARRED.length)];
    if (name === 'metal') return random() < 0.3 ? CHARRED[Math.floor(random() * CHARRED.length)] : METALS[Math.floor(random() * METALS.length)];
    if (name === 'rubble') return CONCRETE[Math.floor(random() * CONCRETE.length)];
    return KIND[name].color;
  }

  return {
    /** Chunks alive now. */
    get count() { return alive; },

    /**
     * Throws a burst of chunks from a point.
     * @param {DebrisSpec} spec @param {number} x @param {number} y @param {number} z
     * @param {number} scale Size of the effect. @param {number} floorY Ground under it.
     * @param {number} [paint] Body colour (hex) for panels; a random car paint otherwise.
     */
    burst(spec, x, y, z, scale, floorY, paint) {
      const big = scale > 1 ? Math.sqrt(scale) : 1;
      const count = Math.round((spec.count[0] + (spec.count[1] - spec.count[0]) * random()) * big);
      let total = 0;
      for (const name of DEBRIS_KINDS) total += spec.kinds[name] ?? 0;
      if (!(total > 0)) return 0;
      const body = paint ?? PAINTS[Math.floor(random() * PAINTS.length)];
      const cone = Math.min(Math.PI, (spec.cone ?? 1) * 1.6);
      const radius = (spec.radius ?? 0.6) * scale;
      const lift = (spec.lift ?? 0.4) * scale;
      const sizes = spec.size ?? [0.7, 1.3];
      for (let k = 0; k < count; k += 1) {
        let pick = random() * total;
        let kind = kinds[0];
        for (let i = 0; i < kinds.length; i += 1) {
          pick -= spec.kinds[kinds[i].name] ?? 0;
          if (pick <= 0) { kind = kinds[i]; break; }
        }
        const a = random() * Math.PI * 2;
        const polar = Math.acos(1 - random() * (1 - Math.cos(cone)));
        const sp = Math.sin(polar);
        const speed = (spec.speed[0] + (spec.speed[1] - spec.speed[0]) * random()) * big;
        const r = Math.sqrt(random()) * radius;
        spawnChunk(kind, body, x + Math.cos(a) * r, y + lift, z + Math.sin(a) * r,
          Math.cos(a) * sp * speed, Math.cos(polar) * speed, Math.sin(a) * sp * speed,
          spec.life[0] + (spec.life[1] - spec.life[0]) * random(),
          (sizes[0] + (sizes[1] - sizes[0]) * random()) * Math.min(1.4, big), floorY);
      }
      return count;
    },

    /** Moves, spins, bounces and ages every chunk, and writes the instance matrices. */
    update(dt) {
      if (alive === 0 || !(dt > 0)) return;
      for (const kind of kinds) {
        if (kind.alive === 0) continue;
        const st = kind.state;
        const look = KIND[kind.name];
        for (let i = 0; i < perKind; i += 1) {
          const o = i * FLOATS;
          if (!(st[o + 18] > 0)) continue;
          st[o + 17] += dt;
          const age = st[o + 17];
          const life = st[o + 18];
          if (age >= life) {
            st[o + 18] = 0;
            kind.alive -= 1; alive -= 1;
            matrix.makeScale(0, 0, 0);
            kind.mesh.setMatrixAt(i, matrix);
            continue;
          }
          st[o + 4] -= 9.8 * dt;
          st[o] += st[o + 3] * dt; st[o + 1] += st[o + 4] * dt; st[o + 2] += st[o + 5] * dt;
          const restY = st[o + 19] + look.rest * st[o + 15];
          if (st[o + 1] < restY) {
            st[o + 1] = restY;
            if (st[o + 4] < -1.2) {
              st[o + 4] = -st[o + 4] * look.bounce;
              st[o + 3] *= 0.6; st[o + 5] *= 0.6; st[o + 13] *= 0.55;
            } else {
              // resting: slide to a stop and stop tumbling
              st[o + 4] = 0;
              const friction = Math.max(0, 1 - 6 * dt);
              st[o + 3] *= friction; st[o + 5] *= friction; st[o + 13] *= friction;
            }
          }
          rotation.set(st[o + 6], st[o + 7], st[o + 8], st[o + 9]);
          axis.set(st[o + 10], st[o + 11], st[o + 12]);
          turn.setFromAxisAngle(axis, st[o + 13] * dt);
          rotation.premultiply(turn).normalize();
          st[o + 6] = rotation.x; st[o + 7] = rotation.y; st[o + 8] = rotation.z; st[o + 9] = rotation.w;
          const shrink = Math.min(1, (life - age) / SHRINK_SECONDS);
          const cooling = age < HOT_SECONDS ? 1 - age / HOT_SECONDS : 0;
          if (cooling > 0 || kind.heat.array[i] > 0) { kind.heat.array[i] = cooling * cooling * HOT_START[kind.name]; kind.heat.needsUpdate = true; }
          position.set(st[o], st[o + 1], st[o + 2]);
          size.set(st[o + 14] * shrink, st[o + 15] * shrink, st[o + 16] * shrink);
          matrix.compose(position, rotation, size);
          kind.mesh.setMatrixAt(i, matrix);
        }
        kind.mesh.instanceMatrix.needsUpdate = true;
        if (kind.alive === 0) kind.mesh.visible = false;
      }
    },

    /** Removes every chunk. */
    clear() {
      matrix.makeScale(0, 0, 0);
      for (const kind of kinds) {
        for (let i = 0; i < perKind; i += 1) { kind.state[i * FLOATS + 18] = 0; kind.mesh.setMatrixAt(i, matrix); }
        kind.alive = 0;
        kind.mesh.visible = false;
        kind.mesh.instanceMatrix.needsUpdate = true;
      }
      alive = 0;
    },

    dispose() {
      for (const kind of kinds) {
        kind.mesh.removeFromParent();
        kind.mesh.geometry.dispose();
        kind.mesh.material.dispose();
        kind.mesh.dispose();
      }
    },
  };
}

/** Car paints for panels when the sender gives none. */
const PAINTS = [0x2d4f7c, 0x8c1d1d, 0xd8d4cc, 0x1e2022, 0x9a9ea2, 0x2f5a3c, 0xc9a227];

function buildKind(name, perKind) {
  const look = KIND[name];
  const material = new THREE.MeshStandardMaterial({ color: look.color, metalness: look.metalness, roughness: look.roughness });
  if (name === 'glass') material.side = THREE.DoubleSide;
  // the per-instance heat (0 cold .. 1 just thrown) adds an orange glow
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aHeat;\nvarying float vHeat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeat = aHeat;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vHeat;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float hotRim = 1.0 - abs(dot(normal, normalize(-vViewPosition)));
totalEmissiveRadiance += vec3(${HOT_GLOW}) * vHeat * (0.3 + 0.7 * hotRim * hotRim);`);
  };
  material.customProgramCacheKey = () => 'effects-debris-hot';
  const geometry = geometryOf(name);
  const heat = new THREE.InstancedBufferAttribute(new Float32Array(perKind), 1);
  heat.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aHeat', heat);
  const mesh = new THREE.InstancedMesh(geometry, material, perKind);
  mesh.name = `effects-debris-${name}`;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = name === 'panel' || name === 'tyre';
  mesh.visible = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < perKind; i += 1) { mesh.setMatrixAt(i, zero); mesh.setColorAt(i, white); }
  return { name, mesh, heat, state: new Float32Array(perKind * FLOATS), cursor: 0, alive: 0 };
}

function geometryOf(name) {
  if (name === 'panel') {
    // a crumpled body panel: a thin plate with a bend across it and a buckled corner
    const g = new THREE.BoxGeometry(0.72, 0.035, 0.48, 3, 1, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i); const z = p.getZ(i);
      p.setY(i, p.getY(i) + 0.09 * Math.cos(x * 4.2) - 0.05 + (x > 0.2 && z > 0.1 ? 0.07 : 0));
    }
    g.computeVertexNormals();
    return g;
  }
  if (name === 'glass') return new THREE.BoxGeometry(0.24, 0.012, 0.17);
  if (name === 'tyre') {
    // a wide, squat tyre, not a thin ring
    const g = new THREE.TorusGeometry(0.22, 0.12, 8, 16);
    g.scale(1, 1, 1.7);
    return g;
  }
  if (name === 'metal') {
    const g = new THREE.DodecahedronGeometry(0.11, 0);
    g.scale(1.6, 0.6, 1);
    return g;
  }
  return new THREE.IcosahedronGeometry(0.13, 0);
}
