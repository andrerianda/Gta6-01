// Building shadows by cascade. The sun's near shadow cascade (a few tens of metres round the
// camera) draws the modelled buildings, so balconies, awnings and cornices shade the street at
// the player's feet; the far cascade (out to the skyline) draws one plain box per building
// instead, about ten triangles where the modelled level has thousands. The boxes never show in
// the picture: they are drawn only into far shadow maps.
//
//   const proxies = createBuildingShadowProxies();
//   scene.add(proxies.object3d);
//   const handle = proxies.addSector(plans);          // building massing plans of a sector
//   proxies.keepToNearCascades(batchedMesh);           // the modelled level's city-wide batches
//   proxies.update();                                  // once a frame: rebuilds after changes
//   handle.dispose();
//
// A cascade counts as far when its shadow camera is wider than FAR_CASCADE_WIDTH (high: the 96 m
// cascade; ultra: the 170 and 640 m ones), see render/lighting/sunShadowRig.js SHADOW_QUALITY.

import * as THREE from 'three';

/** Shadow cameras at least this wide (metres) are far cascades: boxes, no modelled level. */
export const FAR_CASCADE_WIDTH = 140;

/** True when the shadow camera belongs to a far cascade. */
export function isFarCascade(shadowCamera) {
  const width = (shadowCamera?.right ?? 0) - (shadowCamera?.left ?? 0);
  return width >= FAR_CASCADE_WIDTH;
}

/**
 * Builds the box geometry of some buildings (pure; Node-tested): four walls and a roof per
 * building from its footprint ring (four corners) and height, faces turned outward.
 * @param {{footprint: number[], y: number, height: number}[]} plans
 * @returns {{positions: Float32Array, indices: Uint32Array, boxes: number}}
 */
export function buildShadowBoxes(plans) {
  const usable = (plans ?? []).filter((plan) => plan?.footprint?.length >= 8 && plan.height > 0);
  const positions = new Float32Array(usable.length * 8 * 3);
  const indices = new Uint32Array(usable.length * 30);
  let vertex = 0;
  let index = 0;
  for (const plan of usable) {
    const ring = plan.footprint;
    let cx = 0;
    let cz = 0;
    for (let corner = 0; corner < 4; corner += 1) { cx += ring[corner * 2] / 4; cz += ring[corner * 2 + 1] / 4; }
    const base = vertex;
    const bottom = plan.y - 0.5;
    const top = plan.y + plan.height;
    for (let corner = 0; corner < 4; corner += 1) {
      positions.set([ring[corner * 2], bottom, ring[corner * 2 + 1]], (base + corner) * 3);
      positions.set([ring[corner * 2], top, ring[corner * 2 + 1]], (base + 4 + corner) * 3);
    }
    vertex += 8;
    const triangle = (a, b, c, nx, ny, nz) => {
      // Keep the winding whose normal points along (nx, ny, nz).
      const ax = positions[a * 3]; const ay = positions[a * 3 + 1]; const az = positions[a * 3 + 2];
      const ux = positions[b * 3] - ax; const uy = positions[b * 3 + 1] - ay; const uz = positions[b * 3 + 2] - az;
      const vx = positions[c * 3] - ax; const vy = positions[c * 3 + 1] - ay; const vz = positions[c * 3 + 2] - az;
      const dot = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
      indices.set(dot >= 0 ? [a, b, c] : [a, c, b], index);
      index += 3;
    };
    for (let corner = 0; corner < 4; corner += 1) {
      const next = (corner + 1) % 4;
      const ox = (ring[corner * 2] + ring[next * 2]) / 2 - cx;
      const oz = (ring[corner * 2 + 1] + ring[next * 2 + 1]) / 2 - cz;
      triangle(base + corner, base + next, base + 4 + next, ox, 0, oz);
      triangle(base + corner, base + 4 + next, base + 4 + corner, ox, 0, oz);
    }
    triangle(base + 4, base + 5, base + 6, 0, 1, 0);
    triangle(base + 4, base + 6, base + 7, 0, 1, 0);
  }
  return { positions, indices: indices.subarray(0, index), boxes: usable.length };
}

/**
 * Creates the city's building shadow boxes (one mesh, drawn only into far cascades).
 * @returns {{object3d: THREE.Mesh, addSector: (plans: object[]) => {dispose: () => void},
 *   keepToNearCascades: (mesh: THREE.BatchedMesh) => void, update: () => void,
 *   stats: () => {boxes: number, triangles: number}, dispose: () => void}}
 */
export function createBuildingShadowProxies() {
  const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
  material.name = 'building_shadow_boxes';
  let geometry = new THREE.BufferGeometry();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'building_shadow_boxes';
  mesh.castShadow = true;
  // For the engine's census (sceneCostCensus.js): a shadow-only stand-in, never a view draw.
  mesh.userData.shadowCascades = 'far';
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  let triangles = 0;
  let boxes = 0;
  // Never in the picture (the view, the wet-street mirror); in far shadow maps only.
  mesh.onBeforeRender = () => { geometry.setDrawRange(0, 0); };
  mesh.onBeforeShadow = (renderer, object, camera, shadowCamera) => {
    geometry.setDrawRange(0, isFarCascade(shadowCamera) ? triangles * 3 : 0);
  };
  const sectors = new Set();
  let dirty = false;
  const wrapped = new WeakSet();

  function rebuild() {
    dirty = false;
    let vertexCount = 0;
    let indexCount = 0;
    for (const sector of sectors) { vertexCount += sector.positions.length / 3; indexCount += sector.indices.length; }
    const positions = new Float32Array(vertexCount * 3);
    const indices = new Uint32Array(indexCount);
    let vertex = 0;
    let index = 0;
    boxes = 0;
    for (const sector of sectors) {
      positions.set(sector.positions, vertex * 3);
      for (let i = 0; i < sector.indices.length; i += 1) indices[index + i] = sector.indices[i] + vertex;
      vertex += sector.positions.length / 3;
      index += sector.indices.length;
      boxes += sector.boxes;
    }
    const next = new THREE.BufferGeometry();
    next.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    next.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.dispose();
    geometry = next;
    mesh.geometry = next;
    triangles = indexCount / 3;
    mesh.visible = triangles > 0;
  }

  return {
    object3d: mesh,
    addSector(plans) {
      const built = buildShadowBoxes(plans);
      if (!built.boxes) return { dispose() {} };
      sectors.add(built);
      dirty = true;
      return { dispose() { if (sectors.delete(built)) dirty = true; } };
    },
    /** The modelled level's batches draw into near cascades only (once per batch). */
    keepToNearCascades(batched) {
      if (!batched?.isBatchedMesh || wrapped.has(batched)) return;
      wrapped.add(batched);
      batched.userData.shadowCascades = 'near';
      const own = batched.onBeforeShadow;
      batched.onBeforeShadow = function onBeforeNearShadow(renderer, object, camera, shadowCamera, ...rest) {
        own.call(this, renderer, object, camera, shadowCamera, ...rest);
        if (isFarCascade(shadowCamera)) this._multiDrawCount = 0;
      };
    },
    update() { if (dirty) rebuild(); },
    stats: () => ({ boxes, triangles }),
    dispose() {
      sectors.clear();
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
