// The game-side asset loader: everything the other systems need to load and use the models
// built by the Blender pipeline (art/README.md).
//
//   import { AssetLibrary, findNode, setLamp, setPaint } from './assets/index.js';
//
//   const assets = new AssetLibrary({ renderer });
//   await assets.load(['street_lamp_a'], { onProgress: ({ fraction }) => bar.set(fraction) });
//   const lamp = assets.instantiate('street_lamp_a');          // shares geometry and materials
//   scene.add(lamp);
//   setLamp(lamp, 'main', isNight);                              // lamp_main on or off
//   const bulb = findNode(lamp, 'anchor_light');                 // attach a THREE.PointLight here
//
// Static things placed many times: assets.get(id).createBatch(count, { lod }) for one draw call
// per material, or assets.get(id).createLOD() for an instance that switches level by distance.
export { AssetLibrary } from './AssetLibrary.js';
export { Asset, DEFAULT_LOD_DISTANCES } from './Asset.js';
export { InstancedBatch } from './instancing.js';
export { assetOf } from './instances.js';
export {
  roleOfMaterial, setAllLamps, setEnvironmentIntensity, setGlass, setLamp, setPaint, swapMaterials,
} from './materials.js';
export { anchorWorld, collectAnchors, findNode, findNodes, matrixInRoot, requireNode } from './nodes.js';
export {
  ANCHOR_PREFIX, ASSET_BUDGETS, ASSET_KINDS, COLLIDER_PREFIX, ROLE, colliderShapeOf, isAnchorName,
  isColliderName, lodLevelOf, lodPartOf, materialRoleOf,
} from './contract.js';
export { ASSETS, assetIdsOfKind } from './registry/index.js';
