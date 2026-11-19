// What stands on Base Aérea Punta Garza: the fence (one instanced draw per material), the gate's
// two leaves, the guard post with its boom, four hardened shelters, the control tower and eight
// floodlight masts, with their static colliders. Each model of the military kit is used when the
// asset library has it; until then a plain box of the right size stands in its place.
//
//   const built = buildAirBaseStructures(layout, context.assets, physics);
//   scene.add(built.object3d);  built.setGateOpen(true);  built.update(dt);  built.dispose();

import * as THREE from 'three';
import { BASE_KIT_SIZES } from './airBaseLayout.js';

const COLLIDER_GROUP = 'airbase';
const GATE_GROUP = 'airbase:gate';
/** How far the leaves and the boom swing open, radians, and how fast they move (per second). */
const GATE_SWING = 1.75;
const GATE_SPEED = 1.1;
const STAND_IN_COLOURS = { base_hardened_shelter: 0x4f5540, base_control_tower: 0x8d8a80, base_guard_post: 0x77786c, base_floodlight_mast: 0x6a6d70, base_fence: 0x8a8f92 };

/**
 * Builds the structures and registers their colliders.
 * @param {import('./airBaseLayout.js').AirBaseLayout} layout
 * @param {{has?: (id: string) => boolean, get?: (id: string) => any} | null} assets The asset library.
 * @param {{addStaticColliders?: Function, removeStaticColliders?: Function, world?: any} | null} physics The physics system.
 * @returns {{object3d: THREE.Group, models: Record<string, boolean>, gateOpen: boolean, setGateOpen: (open: boolean) => void,
 *   update: (dt: number) => void, dispose: () => void}}
 */
export function buildAirBaseStructures(layout, assets, physics) {
  const group = new THREE.Group();
  group.name = 'airbase-structures';
  const owned = [];
  const models = {};
  const world = physics?.world ?? null;
  const y = layout.y;
  const assetOf = (id) => {
    models[id] = Boolean(assets?.has?.(id));
    return models[id] ? assets.get(id) : null;
  };
  const standInMaterials = new Map();
  const standIn = (id, size = BASE_KIT_SIZES[id]) => {
    if (!standInMaterials.has(id)) {
      const material = new THREE.MeshStandardMaterial({ color: STAND_IN_COLOURS[id] ?? 0x777777, roughness: 0.9 });
      standInMaterials.set(id, material);
      owned.push(material);
    }
    const geometry = new THREE.BoxGeometry(size.width, size.height, size.depth).translate(0, size.height / 2, 0);
    owned.push(geometry);
    const mesh = new THREE.Mesh(geometry, standInMaterials.get(id));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  // A model (with its own levels of detail) or its stand-in, on the pad, -Z turned to `heading`.
  const place = (id, x, z, heading) => {
    const asset = assetOf(id);
    const object = asset ? (typeof asset.createLOD === 'function' ? asset.createLOD() : asset.instantiate()) : standIn(id);
    object.position.set(x, y, z);
    object.rotation.y = -heading;
    object.updateMatrixWorld(true);
    group.add(object);
    if (asset?.colliders?.length && physics?.addStaticColliders) physics.addStaticColliders(asset.colliders, { x, y, z, heading }, { group: COLLIDER_GROUP, surface: 'concrete' });
    return { object, modelled: Boolean(asset), proxies: Boolean(asset?.colliders?.length) };
  };
  const box = (x, cy, z, halfX, halfY, halfZ, heading, groupName = COLLIDER_GROUP) => world?.addStaticBox?.(x, cy, z, halfX, halfY, halfZ, heading, { group: groupName, surface: 'metal' });
  const local = (x, z, heading, right, back) => ({ x: x + Math.cos(heading) * right - Math.sin(heading) * back, z: z + Math.sin(heading) * right + Math.cos(heading) * back });

  for (const shelter of layout.shelters) {
    const { width, height, depth } = BASE_KIT_SIZES.base_hardened_shelter;
    if (place('base_hardened_shelter', shelter.x, shelter.z, shelter.heading).proxies) continue;
    // Back wall and two side walls: the door side (-Z) stays open.
    const rear = local(shelter.x, shelter.z, shelter.heading, 0, depth / 2 - 0.5);
    box(rear.x, y + height / 2, rear.z, width / 2, height / 2, 0.5, shelter.heading);
    for (const side of [-1, 1]) {
      const wall = local(shelter.x, shelter.z, shelter.heading, side * (width / 2 - 0.5), 0);
      box(wall.x, y + height / 2, wall.z, 0.5, height / 2, depth / 2, shelter.heading);
    }
  }
  if (!place('base_control_tower', layout.tower.x, layout.tower.z, layout.tower.heading).proxies) {
    box(layout.tower.x, y + 13, layout.tower.z, 4.5, 13, 4.5, layout.tower.heading);
  }
  for (const mast of layout.masts) {
    if (!place('base_floodlight_mast', mast.x, mast.z, 0).proxies) world?.addStaticCylinder?.(mast.x, y + 9, mast.z, 0.35, 9, { group: COLLIDER_GROUP, surface: 'metal' });
  }

  // The fence: every panel in one instanced mesh per material; one box collider per straight run.
  const fenceAsset = assetOf('base_fence');
  const fenceParts = fenceAsset ? partsOf(fenceAsset, (name) => !name.includes('gate_leaf')) : [];
  const leafParts = fenceAsset ? partsOf(fenceAsset, (name) => name.includes('gate_leaf')) : [];
  if (fenceParts.length === 0) {
    const size = BASE_KIT_SIZES.base_fence;
    const geometry = new THREE.BoxGeometry(size.width, size.height, 0.06).translate(0, size.height / 2, 0);
    const material = new THREE.MeshStandardMaterial({ color: STAND_IN_COLOURS.base_fence, roughness: 0.6, metalness: 0.4, transparent: true, opacity: 0.45, depthWrite: false });
    fenceParts.push({ geometry, material, fresh: true });
  }
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const part of fenceParts) {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, layout.fence.panels.length);
    mesh.name = 'airbase-fence';
    layout.fence.panels.forEach((panel, index) => {
      matrix.compose(position.set(panel.x, y, panel.z), turn.setFromAxisAngle(up, panel.turn), scale.set(panel.stretch, 1, 1));
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = false;
    group.add(mesh);
    owned.push(part.geometry);
    if (part.fresh) owned.push(part.material);
  }
  for (const line of layout.fence.lines) box(line.x, y + 1.4, line.z, 0.12, 1.4, line.length / 2, line.heading);

  // The gate: two leaves hinged at the fence ends, and the guard post's boom, opening together.
  const gate = layout.gate;
  const rightX = Math.cos(gate.heading);
  const rightZ = Math.sin(gate.heading);
  const leaves = [];
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(gate.x + rightX * side * (gate.width / 2), y, gate.z + rightZ * side * (gate.width / 2));
    // The leaf lies along the hinge's +X towards the middle of the gate.
    const closed = Math.atan2(-(-rightZ * side), -rightX * side);
    hinge.rotation.y = closed;
    if (leafParts.length > 0) {
      for (const part of leafParts) {
        const leaf = new THREE.Mesh(part.geometry, part.material);
        // The kit's leaf is hinged at its -X end: bring that end to the hinge.
        part.geometry.computeBoundingBox();
        leaf.position.x = -part.geometry.boundingBox.min.x;
        hinge.add(leaf);
        owned.push(part.geometry);
      }
    } else {
      const leaf = standIn('base_fence', { width: gate.width / 2, height: 2.4, depth: 0.08 });
      leaf.position.x = gate.width / 4;
      hinge.add(leaf);
    }
    group.add(hinge);
    leaves.push({ hinge, closed, side });
  }
  const post = place('base_guard_post', gate.post.x, gate.post.z, gate.heading);
  if (!post.proxies) box(gate.post.x, y + 1.5, gate.post.z, 1.5, 1.5, 2, gate.heading);
  const boom = post.modelled ? post.object.getObjectByName('barrier_arm') ?? null : null;
  const boomRest = boom ? boom.rotation.z : 0;
  const boomOpen = ((assets?.get?.('base_guard_post')?.scene?.userData?.barrier_open ?? 80) * Math.PI) / 180;

  let gateHandle = null;
  let amount = 0;
  const built = {
    object3d: group,
    models,
    gateOpen: false,
    setGateOpen(open) {
      built.gateOpen = Boolean(open);
      if (built.gateOpen && gateHandle !== null) {
        physics?.removeStaticColliders?.(GATE_GROUP);
        gateHandle = null;
      } else if (!built.gateOpen && gateHandle === null) {
        gateHandle = box(gate.x, y + 1.2, gate.z, gate.width / 2, 1.2, 0.15, gate.heading, GATE_GROUP) ?? null;
      }
    },
    /** Swings the leaves and the boom towards where they should be. */
    update(dt) {
      const target = built.gateOpen ? 1 : 0;
      if (amount === target) return;
      amount = target > amount ? Math.min(target, amount + dt * GATE_SPEED) : Math.max(target, amount - dt * GATE_SPEED);
      const eased = amount * amount * (3 - 2 * amount);
      for (const leaf of leaves) leaf.hinge.rotation.y = leaf.closed + leaf.side * eased * GATE_SWING;
      if (boom) boom.rotation.z = boomRest + eased * boomOpen;
    },
    dispose() {
      physics?.removeStaticColliders?.(COLLIDER_GROUP);
      physics?.removeStaticColliders?.(GATE_GROUP);
      group.removeFromParent();
      for (const item of owned) item.dispose();
    },
  };
  built.setGateOpen(false);
  return built;
}

// The meshes of one level of a model as geometries in the model's own space (collision proxies
// left out); `keep` chooses by node name. The coarser level is taken where the model has one.
function partsOf(asset, keep) {
  const root = asset.scene;
  if (!root) return [];
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const level = Math.min(1, (asset.lodCount ?? 1) - 1);
  const parts = [];
  root.traverse((node) => {
    if (!node.isMesh || node.name.startsWith('col_')) return;
    let named = node.name;
    for (let parent = node.parent; parent && parent !== root; parent = parent.parent) named = `${parent.name}/${named}`;
    const own = /_lod(\d)/.exec(named);
    if (own && Number(own[1]) !== level) return;
    if (!keep(named)) return;
    parts.push({ geometry: node.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld)), material: node.material });
  });
  return parts;
}
