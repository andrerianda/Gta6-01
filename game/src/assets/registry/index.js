// The asset registry: every model the game can load, by id. It is written by hand, one module
// per domain (props.js, vehicles.js, ...), and never generated: when an artist adds an asset
// script under art/blender/assets/<domain>/ they add its entry to the matching module here.
// tools/tests/assets/ checks every entry against the built file: it exists, it is within its
// byte budget, and it carries exactly the names promised here.
//
// These modules import nothing, so tools and tests can read the registry without three.js.
import { BUILDING_ASSETS } from './buildings.js';
import { CHARACTER_ASSETS } from './characters.js';
import { DEV_ASSETS } from './dev.js';
import { PROP_ASSETS } from './props.js';
import { VEGETATION_ASSETS } from './vegetation.js';
import { VEHICLE_ASSETS } from './vehicles.js';

/**
 * One registered asset.
 * @typedef {object} AssetEntry
 * @property {string} file The .glb path under game/assets/, for example "props/bin_a.glb".
 * @property {'vehicle' | 'character' | 'building' | 'prop' | 'vegetation' | 'dev'} kind The asset
 *   class; it sets the default byte budget (contract.js ASSET_BUDGETS).
 * @property {number} lods How many levels of detail the file holds (1 when it has no levels).
 * @property {string[]} [nodes] Node names the game relies on (moving parts, level meshes).
 * @property {string[]} [anchors] Anchor nodes the game relies on (anchor_*).
 * @property {string[]} [colliders] Collision proxy nodes (col_*).
 * @property {string[]} [materials] Material names the game relies on (atlas, paint, lamp_*, ...).
 * @property {string[]} [animations] Animation clip names the game relies on.
 * @property {number} [maxBytes] A byte budget that replaces the kind's default.
 */

/**
 * Every asset by id. Ids are unique across domains and equal the file name without ".glb".
 * @type {Readonly<Record<string, AssetEntry>>}
 */
export const ASSETS = Object.freeze({
  ...DEV_ASSETS,
  ...PROP_ASSETS,
  ...VEGETATION_ASSETS,
  ...VEHICLE_ASSETS,
  ...CHARACTER_ASSETS,
  ...BUILDING_ASSETS,
});

/**
 * The ids of every asset of one kind.
 * @param {AssetEntry['kind']} kind The asset class.
 * @returns {string[]} The ids, in registry order.
 */
export function assetIdsOfKind(kind) {
  return Object.keys(ASSETS).filter((id) => ASSETS[id].kind === kind);
}
