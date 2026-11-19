// What stands on Base Aérea Punta Garza: the barbed-wire fence (one instanced draw per material,
// a warning sign on every fifth panel), the gate's two leaves, the guard post with its boom, four
// hardened shelters, the control tower, eight floodlight masts turned to the apron, six
// watchtowers and three camouflage nets, with their static colliders. Each model of the military
// kit is used when the asset library has it; until then a plain box of the right size stands in
// for the first five, and the towers and nets are left out.
//
//   const built = buildAirBaseStructures(layout, context.assets, physics);
//   scene.add(built.object3d);  built.setGateOpen(true);  built.update(dt);  built.dispose();

import * as THREE from 'three';
import { BASE_KIT_SIZES, FENCE_PANEL } from './airBaseLayout.js';
import { modelParts } from './groundKit.js';

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
 *   lampHeads: {kind: string, position: number[], direction: number[]}[], counts: {watchtowers: number, nets: number, signs: number},
 *   setLampLevel: (level: number) => void, update: (dt: number) => void, dispose: () => void}}
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
  // Floodlight masts: each head (the model's -Z) looks at the middle of the apron. Where a head is
  // and where it shines goes to the lamps (airBaseLights.js) for its glow and its light.
  /** @type {{kind: 'flood' | 'search', position: number[], direction: number[]}[]} */
  const lampHeads = [];
  const headOf = (asset, anchorName, x, z, heading, fallbackHeight) => {
    const anchor = asset?.anchors?.[anchorName] ?? null;
    const at = anchor ? local(x, z, heading, anchor.position.x, anchor.position.z) : { x, z };
    const aim = anchor ? anchor.direction : { x: 0, y: -0.5, z: -0.866 };
    // The anchor's direction in the model's frame, turned to the heading (its -Z towards the heading).
    const dx = Math.cos(heading) * aim.x - Math.sin(heading) * aim.z;
    const dz = Math.sin(heading) * aim.x + Math.cos(heading) * aim.z;
    return { position: [at.x, y + (anchor ? anchor.position.y : fallbackHeight), at.z], direction: [dx, aim.y, dz] };
  };
  for (const mast of layout.masts) {
    const heading = Math.atan2(layout.centre.x - mast.x, -(layout.centre.z - mast.z));
    const placed = place('base_floodlight_mast', mast.x, mast.z, heading);
    if (!placed.proxies) world?.addStaticCylinder?.(mast.x, y + 9, mast.z, 0.35, 9, { group: COLLIDER_GROUP, surface: 'metal' });
    lampHeads.push({ kind: 'flood', ...headOf(placed.modelled ? assets.get('base_floodlight_mast') : null, 'anchor_light', mast.x, mast.z, heading, 17.4) });
  }

  // Watchtowers and camouflage nets: only as the artists' models (nothing stands in for them).
  const counts = { watchtowers: 0, nets: 0, signs: 0 };
  const placeModel = (id, item) => {
    if (!assetOf(id)) return null;
    const placed = place(id, item.x, item.z, item.heading);
    return placed.modelled ? placed : null;
  };
  for (const tower of layout.dressing?.watchtowers ?? []) {
    if (!placeModel('base_watchtower', tower)) continue;
    counts.watchtowers += 1;
    const asset = assets.get('base_watchtower');
    if (asset.anchors?.anchor_search) lampHeads.push({ kind: 'search', ...headOf(asset, 'anchor_search', tower.x, tower.z, tower.heading, 7.6) });
  }
  for (const net of layout.dressing?.nets ?? []) if (placeModel('base_camo_net', net)) counts.nets += 1;

  // The fence: every panel in one instanced mesh per material; one box collider per straight run.
  // The warning sign of the kit hangs on every fifth panel.
  const fenceAsset = assetOf('base_fence');
  const fencePart = (keep, level = 0) => (fenceAsset ? modelParts(fenceAsset, null, { level, keep }) : []);
  const isPanel = (path) => !/gate_leaf|sign_|post_end/.test(path);
  // The finest level (256 triangles a panel) within 160 m of the gate, where the lead walks in
  // along the wire; the middle one (70) for the rest of the perimeter.
  const byGate = (panel) => Math.hypot(panel.x - layout.gate.x, panel.z - layout.gate.z) < 160;
  const fenceParts = [
    ...fencePart(isPanel, 0).map((part) => ({ ...part, panels: layout.fence.panels.filter(byGate) })),
    ...fencePart(isPanel, Math.min(1, (fenceAsset?.lodCount ?? 1) - 1)).map((part) => ({ ...part, panels: layout.fence.panels.filter((panel) => !byGate(panel)) })),
  ];
  const leafParts = fencePart((path) => path.includes('gate_leaf'));
  const signParts = fencePart((path) => path.includes('sign_'));
  // The closing post of a run (the panel carries only its own first post).
  const endPostParts = fencePart((path) => path.includes('post_end'));
  if (fenceParts.length === 0) {
    const size = BASE_KIT_SIZES.base_fence;
    const geometry = new THREE.BoxGeometry(size.width, size.height, 0.06).translate(0, size.height / 2, 0);
    const material = new THREE.MeshStandardMaterial({ color: STAND_IN_COLOURS.base_fence, roughness: 0.6, metalness: 0.4, transparent: true, opacity: 0.45, depthWrite: false });
    fenceParts.push({ geometry, material, fresh: true, panels: layout.fence.panels });
  }
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const part of fenceParts) {
    if (part.panels.length === 0) {
      part.geometry.dispose();
      continue;
    }
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, part.panels.length);
    mesh.name = 'airbase-fence';
    part.panels.forEach((panel, index) => {
      matrix.compose(position.set(panel.x, y, panel.z), turn.setFromAxisAngle(up, panel.turn), scale.set(panel.stretch, 1, 1));
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    // The posts, rails and wire throw their shadows (the alpha-tested mesh as holes); the stand-in sheet does not.
    mesh.castShadow = !part.fresh;
    mesh.receiveShadow = true;
    group.add(mesh);
    owned.push(part.geometry);
    if (part.fresh) owned.push(part.material);
  }
  const signed = layout.fence.panels.filter((panel, index) => index % 5 === 2);
  for (const part of signParts) {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, signed.length);
    mesh.name = 'airbase-fence-sign';
    signed.forEach((panel, index) => {
      matrix.compose(position.set(panel.x, y, panel.z), turn.setFromAxisAngle(up, panel.turn), scale.set(1, 1, 1));
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    group.add(mesh);
    owned.push(part.geometry);
    counts.signs = signed.length;
  }
  for (const part of endPostParts) {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, layout.fence.lines.length);
    mesh.name = 'airbase-fence-post';
    layout.fence.lines.forEach((line, index) => {
      // As the last panel of the run would stand: its +X end (where the model has the post) on the run's end.
      const dx = (line.bx - line.ax) / line.length;
      const dz = (line.bz - line.az) / line.length;
      matrix.compose(position.set(line.bx - dx * (FENCE_PANEL / 2), y, line.bz - dz * (FENCE_PANEL / 2)), turn.setFromAxisAngle(up, Math.atan2(-dz, dx)), scale.set(1, 1, 1));
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    owned.push(part.geometry);
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
      // The kit's leaf is hinged at its -X end (scene extra gate_leaf.hinge_x): bring that end to the hinge.
      let hingeX = fenceAsset.extras?.gate_leaf?.hinge_x;
      if (!Number.isFinite(hingeX)) {
        hingeX = Infinity;
        for (const part of leafParts) {
          part.geometry.computeBoundingBox();
          hingeX = Math.min(hingeX, part.geometry.boundingBox.min.x);
        }
      }
      for (const part of leafParts) {
        const leaf = new THREE.Mesh(part.geometry, part.material);
        leaf.position.x = -hingeX;
        leaf.castShadow = true;
        leaf.receiveShadow = true;
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
  const boomOpen = (((post.modelled ? assets.get('base_guard_post').scene?.userData?.barrier_open : null) ?? 80) * Math.PI) / 180;

  // The lamp glass of the kit (floodlight heads, searchlights, shelter, cab and guard-post lamps)
  // follows the hour; the tower's beacon is the lamps' own business.
  const lampMaterials = [];
  for (const id of Object.keys(models)) {
    if (!models[id]) continue;
    for (const [name, material] of assets.get(id).materials ?? []) {
      if (name.startsWith('lamp_') && name !== 'lamp_beacon' && material.emissive) lampMaterials.push(material);
    }
  }
  let lampLevel = -1;

  let gateHandle = null;
  let amount = 0;
  const built = {
    object3d: group,
    models,
    /** Where the floodlight heads and the searchlights are and shine: [{kind, position, direction}]. */
    lampHeads,
    /** How many watchtowers, nets and fence signs stand (0 while their models are missing). */
    counts,
    /** Sets how far the kit's lamp glass glows, 0 (day) to 1 (night). */
    setLampLevel(level) {
      if (Math.abs(level - lampLevel) < 0.004) return;
      lampLevel = level;
      for (const material of lampMaterials) material.emissiveIntensity = (material.userData.litIntensity ?? 1) * level;
    },
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

