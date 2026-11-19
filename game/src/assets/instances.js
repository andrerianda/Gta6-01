// Which asset an object came from. Instances cannot carry a reference to their asset in
// userData (three.js copies userData as JSON when an object is cloned), so the link is kept
// here: by object for instance roots, and by the "assetId" string in userData for clones of them.

/** @type {WeakMap<object, import('./Asset.js').Asset>} */
const assetByInstance = new WeakMap();

/** @type {Map<string, import('./Asset.js').Asset>} */
const assetById = new Map();

/**
 * Records a loaded asset so its instances can be traced back to it.
 * @param {import('./Asset.js').Asset} asset The asset.
 */
export function registerAsset(asset) {
  assetById.set(asset.id, asset);
}

/**
 * Forgets a disposed asset.
 * @param {import('./Asset.js').Asset} asset The asset.
 */
export function unregisterAsset(asset) {
  if (assetById.get(asset.id) === asset) assetById.delete(asset.id);
}

/**
 * Records the asset an instance root was made from.
 * @param {import('three').Object3D} instance The instance root.
 * @param {import('./Asset.js').Asset} asset Its asset.
 */
export function registerInstance(instance, asset) {
  assetByInstance.set(instance, asset);
}

/**
 * The asset an instance, or anything inside one, came from.
 * @param {import('three').Object3D} object An instance root or one of its descendants.
 * @returns {import('./Asset.js').Asset | null} The asset, or null for an object no asset made.
 */
export function assetOf(object) {
  for (let current = object; current; current = current.parent) {
    const asset = assetByInstance.get(current) ?? assetById.get(current.userData?.assetId);
    if (asset) return asset;
  }
  return null;
}

/**
 * The asset of an instance, failing loudly when there is none.
 * @param {import('three').Object3D} object An instance root or one of its descendants.
 * @returns {import('./Asset.js').Asset} The asset.
 */
export function requireAssetOf(object) {
  const asset = assetOf(object);
  if (!asset) throw new Error('not an asset instance: create it with Asset.instantiate()');
  return asset;
}
