// The dressing of Base Aérea Punta Garza in the world (planned in airBaseDressingPlan.js): the
// ground equipment of military/base_ground_kit.glb drawn instanced (one draw per item kind and
// material) with box colliders for the big items, and the field's planting with the game's own
// vegetation models (ground_cover grass clumps and creeping cover in chunks that are drawn only
// near the camera, shrubs_tropical as the scrub along the fence). Whatever model is not in memory
// is simply left out; the runtime rebuilds when it arrives.
//
//   const dressing = buildAirBaseDressing(layout, context.assets, physics);
//   scene.add(dressing.object3d);  dressing.update(camera.position);  dressing.counts;  dressing.dispose();

import * as THREE from 'three';
import { GROUND_KIT_ITEMS } from './airBaseDressingPlan.js';
import { GROUND_KIT_ASSET, instanceParts, modelParts } from './groundKit.js';

const COLLIDER_GROUP = 'airbase:dressing';
const GRASS_ASSET = 'ground_cover';
const SCRUB_ASSET = 'shrubs_tropical';
/** Grass is cut into square chunks this wide; a chunk is drawn within `GRASS_REACH` of the camera. */
const GRASS_CHUNK = 160;
const GRASS_REACH = 250;
const SCRUB_REACH = 1500;

/**
 * Builds the dressing and registers its colliders.
 * @param {import('./airBaseLayout.js').AirBaseLayout} layout
 * @param {{has?: (id: string) => boolean, get?: (id: string) => any} | null} assets The asset library.
 * @param {{removeStaticColliders?: Function, world?: any} | null} physics The physics system.
 * @returns {{object3d: THREE.Group, counts: {props: number, propKinds: number, colliders: number, grass: number, scrub: number, chunks: number},
 *   update: (camera: {x: number, y: number, z: number}) => void, dispose: () => void}}
 */
export function buildAirBaseDressing(layout, assets, physics) {
  const group = new THREE.Group();
  group.name = 'airbase-dressing';
  const owned = [];
  const counts = { props: 0, propKinds: 0, colliders: 0, grass: 0, scrub: 0, chunks: 0 };
  const plan = layout.dressing;
  const y = layout.y;
  const assetOf = (id) => {
    try { return assets?.has?.(id) ? assets.get(id) : null; } catch { return null; }
  };
  const keep = (meshes) => {
    for (const mesh of meshes) {
      group.add(mesh);
      owned.push(mesh.geometry);
    }
    return meshes;
  };

  // ---- Ground equipment: every kind of item in one instanced draw per material.
  const kit = assetOf(GROUND_KIT_ASSET);
  if (kit) {
    const byNode = new Map();
    for (const prop of plan.props) {
      if (!byNode.has(prop.node)) byNode.set(prop.node, []);
      byNode.get(prop.node).push({ x: prop.x, y, z: prop.z, turn: -prop.heading, scale: prop.scale });
    }
    const world = physics?.world ?? null;
    for (const [node, places] of byNode) {
      const parts = modelParts(kit, node);
      if (parts.length === 0) continue;
      keep(instanceParts(parts, places, { name: `airbase-${node}` }));
      counts.props += places.length;
      counts.propKinds += 1;
    }
    if (world?.addStaticBox) {
      for (const prop of plan.props) {
        if (!prop.collide || !kit.scene.getObjectByName(prop.node)) continue;
        const size = GROUND_KIT_ITEMS[prop.node];
        const scale = prop.scale ?? 1;
        world.addStaticBox(prop.x, y + (size.height * scale) / 2, prop.z, (size.width * scale) / 2, (size.height * scale) / 2, (size.length * scale) / 2, prop.heading, { group: COLLIDER_GROUP, surface: 'metal' });
        counts.colliders += 1;
      }
    }
  }

  // ---- Grass and creeping cover, in chunks switched by distance.
  /** @type {{x: number, z: number, meshes: THREE.Object3D[]}[]} */
  const chunks = [];
  const grassAsset = assetOf(GRASS_ASSET);
  if (grassAsset) {
    const cells = new Map();
    for (const tuft of plan.vegetation.grass) {
      const key = `${Math.floor(tuft.x / GRASS_CHUNK)},${Math.floor(tuft.z / GRASS_CHUNK)}`;
      if (!cells.has(key)) cells.set(key, new Map());
      const variants = cells.get(key);
      if (!variants.has(tuft.variant)) variants.set(tuft.variant, []);
      variants.get(tuft.variant).push({ x: tuft.x, y, z: tuft.z, turn: tuft.turn, scale: tuft.scale });
    }
    const partsOfVariant = new Map();
    const variantParts = (variant) => {
      if (!partsOfVariant.has(variant)) {
        const parts = modelParts(grassAsset, `${variant}_lod0`, { local: true });
        for (const part of parts) owned.push(part.geometry);
        partsOfVariant.set(variant, parts);
      }
      return partsOfVariant.get(variant);
    };
    for (const [key, variants] of cells) {
      const [cx, cz] = key.split(',').map(Number);
      const chunk = { x: (cx + 0.5) * GRASS_CHUNK, z: (cz + 0.5) * GRASS_CHUNK, meshes: [] };
      for (const [variant, places] of variants) {
        const meshes = instanceParts(variantParts(variant), places, { name: 'airbase-grass', castShadow: false });
        for (const mesh of meshes) {
          mesh.visible = false;
          group.add(mesh);
          chunk.meshes.push(mesh);
        }
        counts.grass += places.length;
      }
      if (chunk.meshes.length > 0) chunks.push(chunk);
    }
    counts.chunks = chunks.length;
  }

  // ---- Scrub along the fence and in the field: the middle level of the shrubs, all in one batch per variant.
  const scrubMeshes = [];
  const scrubAsset = assetOf(SCRUB_ASSET);
  if (scrubAsset) {
    for (const variant of ['variant_a', 'variant_b']) {
      const places = plan.vegetation.scrub.filter((bush) => bush.variant === variant).map((bush) => ({ x: bush.x, y, z: bush.z, turn: bush.turn, scale: bush.scale }));
      const parts = modelParts(scrubAsset, `${variant}_lod1`, { local: true });
      if (parts.length === 0 || places.length === 0) continue;
      scrubMeshes.push(...keep(instanceParts(parts, places, { name: 'airbase-scrub' })));
      counts.scrub += places.length;
    }
  }

  return {
    object3d: group,
    counts,
    /** Shows the grass chunks near the camera and the scrub within sight. */
    update(camera) {
      if (!camera) return;
      let nearest = Infinity;
      for (const chunk of chunks) {
        const away = Math.hypot(camera.x - chunk.x, camera.z - chunk.z);
        nearest = Math.min(nearest, away);
        const show = away < GRASS_REACH + GRASS_CHUNK * 0.71 && camera.y - y < GRASS_REACH;
        for (const mesh of chunk.meshes) mesh.visible = show;
      }
      const scrub = Math.hypot(camera.x - layout.centre.x, camera.z - layout.centre.z) < SCRUB_REACH + 600 && camera.y - y < SCRUB_REACH;
      for (const mesh of scrubMeshes) mesh.visible = scrub;
    },
    dispose() {
      physics?.removeStaticColliders?.(COLLIDER_GROUP);
      group.removeFromParent();
      for (const mesh of group.children) if (mesh.isInstancedMesh) mesh.dispose();
      for (const item of owned) item.dispose();
    },
  };
}
