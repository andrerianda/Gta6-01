// Overhead cables: the wires of overheadCableLayout.js drawn as one city-wide instanced mesh (one
// draw call, no shadows). Each instance is a thin four-sided tube of unit length along +X; its
// matrix runs +X from one fixing point to the other (so both ends are exact on any slope), and a
// per-instance sag bends it down as a parabola in the vertex shader. Spans farther than
// CABLE_DISTANCE from the camera are dropped in the vertex shader (they would only alias). A
// sector adds its spans and takes them back on release; nothing is allocated per frame.
//
//   const cables = createOverheadCables();
//   pools.object3d.add(cables.object3d);
//   const handle = cables.addSector([{ax, ay, az, bx, by, bz, sag}, ...]);   // world metres; handle.dispose()
import * as THREE from 'three';

/** Spans beyond this distance (metres, from the span's middle) are not drawn. */
export const CABLE_DISTANCE = 140;
/** Tube radius (metres): a little fat for a power line, so it holds a pixel at 30 m. */
export const CABLE_RADIUS = 0.017;
const SEGMENTS = 14;

/** Creates the cable batch (empty until a sector adds spans). */
export function createOverheadCables() {
  const root = new THREE.Group();
  root.name = 'city_dressing_overhead_cables';
  const geometry = cableGeometry();
  const material = cableMaterial();
  let mesh = null;
  let sagAttribute = null;
  let capacity = 0;
  let count = 0;
  const ownerList = [];
  const ownerIndex = [];
  const matrix = new THREE.Matrix4();

  function grow(size) {
    const sag = new THREE.InstancedBufferAttribute(new Float32Array(size), 1);
    const next = new THREE.InstancedMesh(geometry, material, size);
    next.name = 'overhead_cables';
    next.frustumCulled = false;
    next.castShadow = false;
    next.receiveShadow = false;
    next.matrixAutoUpdate = false;
    if (mesh) {
      next.instanceMatrix.array.set(mesh.instanceMatrix.array.subarray(0, count * 16));
      sag.array.set(sagAttribute.array.subarray(0, count));
      mesh.removeFromParent();
      mesh.dispose();
    }
    // Shared geometry: the instanced attribute goes on it (one mesh at a time uses it).
    geometry.setAttribute('cableSag', sag);
    mesh = next;
    sagAttribute = sag;
    capacity = size;
    root.add(mesh);
  }
  function commit() {
    if (!mesh) return;
    mesh.count = count;
    mesh.visible = count > 0;
    mesh.instanceMatrix.needsUpdate = true;
    sagAttribute.needsUpdate = true;
  }

  return {
    object3d: root,
    /**
     * Adds a sector's spans.
     * @param {{ax: number, ay: number, az: number, bx: number, by: number, bz: number, sag: number}[]} spans World ends.
     * @returns {{count: number, dispose: () => void}}
     */
    addSector(spans) {
      const slots = [];
      for (const span of spans) {
        const dx = span.bx - span.ax;
        const dz = span.bz - span.az;
        const across = Math.hypot(dx, dz);
        if (!(across > 0.5)) continue;
        if (count >= capacity) grow(Math.max(256, capacity * 2));
        // Columns: +X to the far end, +Y straight up (the sag), +Z level across the span.
        matrix.set(
          dx, 0, -dz / across, span.ax,
          span.by - span.ay, 1, 0, span.ay,
          dz, 0, dx / across, span.az,
          0, 0, 0, 1,
        );
        matrix.toArray(mesh.instanceMatrix.array, count * 16);
        sagAttribute.array[count] = span.sag;
        ownerList[count] = slots;
        ownerIndex[count] = slots.length;
        slots.push(count);
        count += 1;
      }
      commit();
      return {
        count: slots.length,
        dispose() {
          while (slots.length) {
            const slot = slots.pop();
            const last = count - 1;
            if (slot !== last) {
              mesh.instanceMatrix.array.copyWithin(slot * 16, last * 16, last * 16 + 16);
              sagAttribute.array[slot] = sagAttribute.array[last];
              const owner = ownerList[last];
              owner[ownerIndex[last]] = slot;
              ownerList[slot] = owner;
              ownerIndex[slot] = ownerIndex[last];
            }
            ownerList[last] = null;
            count = last;
          }
          commit();
        },
      };
    },
    /** Spans held now (all in one draw call). */
    get count() {
      return count;
    },
    dispose() {
      mesh?.removeFromParent();
      mesh?.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

/** A four-sided tube from x = 0 to 1 along +X, radius CABLE_RADIUS, SEGMENTS long pieces. */
function cableGeometry() {
  const positions = [];
  const normals = [];
  const index = [];
  for (let i = 0; i <= SEGMENTS; i += 1) {
    const x = i / SEGMENTS;
    for (let k = 0; k < 4; k += 1) {
      const angle = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const y = Math.cos(angle);
      const z = Math.sin(angle);
      positions.push(x, y * CABLE_RADIUS, z * CABLE_RADIUS);
      normals.push(0, y, z);
    }
  }
  for (let i = 0; i < SEGMENTS; i += 1) {
    for (let k = 0; k < 4; k += 1) {
      const a = i * 4 + k;
      const b = i * 4 + ((k + 1) % 4);
      index.push(a, a + 4, b, b, a + 4, b + 4);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(index);
  return geometry;
}

/** Dark sheathed cable; sags by its instance's cableSag, dropped beyond CABLE_DISTANCE. */
function cableMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.6, metalness: 0.1 });
  material.name = 'overhead_cable';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float cableSag;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
	transformed.y -= cableSag * 4.0 * position.x * ( 1.0 - position.x );`)
      .replace('#include <project_vertex>', `#include <project_vertex>
	if ( distance( ( modelMatrix * instanceMatrix * vec4( 0.5, 0.0, 0.0, 1.0 ) ).xyz, cameraPosition ) > ${CABLE_DISTANCE.toFixed(1)} ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );`);
  };
  material.customProgramCacheKey = () => 'overhead_cable';
  return material;
}
