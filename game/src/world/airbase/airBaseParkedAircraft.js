// The parked squadron of Base Aérea Punta Garza: the Halcón line on the east apron and the two in
// the fighter shelters (layout.parkedAircraft). Static scenery, not vehicles: one level of detail of
// the `halcon` model, gear down, merged into one geometry per material and drawn instanced, so the
// whole line costs three draw calls however many aircraft stand in it. Each has two box colliders
// (fuselage and wing). Nothing is drawn until the asset library has the model.
//
//   const parked = buildAirBaseParkedAircraft(layout, context.assets, physics);
//   scene.add(parked.object3d);  parked.count;  parked.dispose();

import * as THREE from 'three';
import { BufferGeometryUtils } from '../../../vendor/three/three-gltf-addons.min.js';
import { PARKED_FIGHTER_SIZE } from './airBaseLayout.js';

const MODEL_ID = 'halcon';
/** The level of detail drawn (the middle one: it holds up from a few metres away). */
const LEVEL = 1;
const COLLIDER_GROUP = 'airbase:parked';
/** The lamps are dark on a parked aircraft: all their lenses go into one unlit draw. */
const LAMP = /^lamp_/;

/**
 * Builds the parked aircraft and registers their colliders.
 * @param {import('./airBaseLayout.js').AirBaseLayout} layout
 * @param {{has?: (id: string) => boolean, get?: (id: string) => any} | null} assets The asset library.
 * @param {{removeStaticColliders?: Function, world?: any} | null} physics The physics system.
 * @returns {{object3d: THREE.Group, count: number, modelled: boolean, dispose: () => void}}
 */
export function buildAirBaseParkedAircraft(layout, assets, physics) {
  const group = new THREE.Group();
  group.name = 'airbase-parked-aircraft';
  const owned = [];
  const spots = layout.parkedAircraft ?? [];
  const asset = assets?.has?.(MODEL_ID) ? assets.get(MODEL_ID) : null;
  const built = {
    object3d: group,
    /** How many aircraft are drawn. */
    count: 0,
    modelled: Boolean(asset),
    dispose() {
      physics?.removeStaticColliders?.(COLLIDER_GROUP);
      group.removeFromParent();
      for (const item of owned) item.dispose();
    },
  };
  if (!asset || spots.length === 0) return built;

  const parts = partsByMaterial(asset);
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const place = new THREE.Vector3();
  for (const part of parts) {
    owned.push(part.geometry);
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, spots.length);
    mesh.name = `airbase-parked-${part.material.name || 'part'}`;
    mesh.castShadow = part.castShadow;
    mesh.receiveShadow = true;
    spots.forEach((spot, index) => {
      // The model's nose is -Z: turned about +Y by minus the compass heading it points there.
      matrix.compose(place.set(spot.x, layout.y, spot.z), turn.setFromAxisAngle(up, -spot.heading), one);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  built.count = parts.length > 0 ? spots.length : 0;

  // Two boxes each: the fuselage from nose to tail, and the wing with the wheels under it.
  const world = physics?.world ?? null;
  if (world?.addStaticBox) {
    const { span, noseAhead, tailBehind, height } = PARKED_FIGHTER_SIZE;
    const options = { group: COLLIDER_GROUP, surface: 'metal' };
    const back = (spot, metres) => ({ x: spot.x - Math.sin(spot.heading) * metres, z: spot.z + Math.cos(spot.heading) * metres });
    for (const spot of spots) {
      const hull = back(spot, (tailBehind - noseAhead) / 2);
      world.addStaticBox(hull.x, layout.y + height / 2, hull.z, 0.85, height / 2, (noseAhead + tailBehind) / 2, spot.heading, options);
      const wing = back(spot, 0.6);
      world.addStaticBox(wing.x, layout.y + 1.2, wing.z, span / 2, 1.2, 2.4, spot.heading, options);
    }
  }
  return built;
}

// The meshes of one level of the model (collision proxies left out, moving parts in their rest
// pose: gear down, canopy shut) as one geometry per material in the model's own space.
function partsByMaterial(asset) {
  const root = asset.scene;
  if (!root) return [];
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const level = Math.min(LEVEL, (asset.lodCount ?? 1) - 1);
  /** @type {Map<string, {material: THREE.Material, geometries: THREE.BufferGeometry[]}>} */
  const byMaterial = new Map();
  root.traverse((node) => {
    if (!node.isMesh || node.name.startsWith('col_')) return;
    let named = node.name;
    for (let parent = node.parent; parent && parent !== root; parent = parent.parent) named = `${parent.name}/${named}`;
    const own = /(?:^|_|\/)lod(\d)/.exec(named);
    if (own && Number(own[1]) !== level) return;
    const lamp = LAMP.test(node.material?.name ?? '');
    const key = lamp ? 'lamps' : node.material.uuid;
    if (!byMaterial.has(key)) {
      const material = lamp && typeof asset.lampMaterial === 'function' ? asset.lampMaterial(node.material.name, false) : node.material;
      byMaterial.set(key, { material, geometries: [] });
    }
    const geometry = node.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld));
    // Only what every part has can be merged.
    for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
    byMaterial.get(key).geometries.push(geometry);
  });
  const parts = [];
  for (const { material, geometries } of byMaterial.values()) {
    const usable = geometries.every((each) => each.attributes.normal && each.attributes.uv) ? geometries
      : geometries.map((each) => { each.deleteAttribute('uv'); return each; });
    const merged = usable.length === 1 ? usable[0] : BufferGeometryUtils.mergeGeometries(usable, false);
    for (const each of geometries) if (each !== merged) each.dispose();
    if (!merged) continue;
    parts.push({ geometry: merged, material, castShadow: !material.transparent });
  }
  return parts;
}
