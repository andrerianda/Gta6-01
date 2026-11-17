// Material roles: what the game may change on an asset's materials at run time. A material's
// role comes from its name (contract.js): paint is recoloured, lamps are switched, glass and
// environment reflections are tuned. Instances share their asset's materials, so every change
// here works by swapping in a cached variant of the material, never by editing the shared one:
// a thousand cars in five colours cost five paint materials.
import * as THREE from 'three';
import { ROLE, materialRoleOf } from './contract.js';
import { requireAssetOf } from './instances.js';

/**
 * The role of a material ("atlas", "paint", "glass", "lamp", "cutout" or "tile").
 * @param {THREE.Material} material A material of a loaded asset.
 * @returns {string} One of the ROLE values.
 */
export function roleOfMaterial(material) {
  return material.userData.role ?? materialRoleOf(material.name);
}

/**
 * Applies the role defaults to a freshly loaded material. Called once per material by Asset.
 * @param {THREE.Material} material The material as the glTF loader made it.
 * @param {{ environmentIntensity?: number, glassEnvironmentIntensity?: number,
 *   anisotropy?: number }} [options] Library-wide settings.
 * @returns {THREE.Material} The same material.
 */
export function prepareMaterial(material, options = {}) {
  const role = roleOfMaterial(material);
  material.userData.role = role;
  material.envMapIntensity = options.environmentIntensity ?? 1;
  for (const key of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) {
    const texture = material[key];
    if (texture && options.anisotropy) texture.anisotropy = options.anisotropy;
  }
  if (role === ROLE.PAINT) {
    material.userData.paintColor = material.color.getHex();
  } else if (role === ROLE.GLASS) {
    material.transparent = true;
    material.depthWrite = false;
    material.envMapIntensity = options.glassEnvironmentIntensity ?? 1.5;
  } else if (role === ROLE.LAMP) {
    material.userData.litIntensity = material.emissiveIntensity;
    material.userData.lit = true;
  } else if (role === ROLE.CUTOUT) {
    material.side = THREE.DoubleSide;
    material.alphaTest = material.alphaTest || 0.5;
    material.transparent = false;
  }
  return material;
}

/**
 * Swaps materials on the meshes of an instance.
 * @param {THREE.Object3D} instance The instance root.
 * @param {(material: THREE.Material) => THREE.Material | null} choose Returns the material to
 *   use instead, or null to keep the current one.
 * @returns {number} How many meshes changed.
 */
export function swapMaterials(instance, choose) {
  let changed = 0;
  instance.traverse((node) => {
    if (!node.isMesh) return;
    const replacement = choose(node.material);
    if (replacement && replacement !== node.material) {
      node.material = replacement;
      changed += 1;
    }
  });
  return changed;
}

/**
 * Recolours the paint of one instance. Other instances keep their colour; instances painted
 * the same colour share one material.
 * @param {THREE.Object3D} instance An object returned by Asset.instantiate().
 * @param {THREE.ColorRepresentation} color The paint colour (hex number, CSS string or Color).
 * @param {string} [name] The paint material to recolour: "paint" (default), "paint_trim", ...
 * @returns {number} How many meshes were repainted.
 */
export function setPaint(instance, color, name = 'paint') {
  const variant = requireAssetOf(instance).paintMaterial(color, name);
  return swapMaterials(instance, (material) => (material.name === name ? variant : null));
}

/**
 * Switches a lamp group of one instance on or off.
 * @param {THREE.Object3D} instance An object returned by Asset.instantiate().
 * @param {string} group The lamp material name ("lamp_head") or just its group ("head").
 * @param {boolean} lit True to light the lamp.
 * @returns {number} How many meshes were switched.
 */
export function setLamp(instance, group, lit) {
  const name = group.startsWith('lamp_') ? group : `lamp_${group}`;
  const variant = requireAssetOf(instance).lampMaterial(name, lit);
  return swapMaterials(instance, (material) => (material.name === name ? variant : null));
}

/**
 * Switches every lamp group of one instance.
 * @param {THREE.Object3D} instance An object returned by Asset.instantiate().
 * @param {boolean} lit True to light the lamps.
 * @returns {number} How many meshes were switched.
 */
export function setAllLamps(instance, lit) {
  const asset = requireAssetOf(instance);
  return swapMaterials(instance, (material) =>
    (roleOfMaterial(material) === ROLE.LAMP ? asset.lampMaterial(material.name, lit) : null));
}

/**
 * Tunes glass materials. Glass is shared by every instance of an asset, so this changes them
 * all: pass an Asset, or an instance to reach its asset.
 * @param {import('./Asset.js').Asset | THREE.Object3D} target The asset or one of its instances.
 * @param {{ opacity?: number, color?: THREE.ColorRepresentation, roughness?: number,
 *   environmentIntensity?: number }} settings What to change.
 */
export function setGlass(target, settings) {
  const asset = target.isObject3D ? requireAssetOf(target) : target;
  for (const material of asset.materialsByRole(ROLE.GLASS)) {
    if (settings.opacity !== undefined) material.opacity = settings.opacity;
    if (settings.color !== undefined) material.color.set(settings.color);
    if (settings.roughness !== undefined) material.roughness = settings.roughness;
    if (settings.environmentIntensity !== undefined) {
      material.envMapIntensity = settings.environmentIntensity;
    }
    material.needsUpdate = true;
  }
}

/**
 * Sets how strongly an asset's materials reflect the scene environment (all its instances).
 * @param {import('./Asset.js').Asset | THREE.Object3D} target The asset or one of its instances.
 * @param {number} intensity The envMapIntensity for opaque materials.
 * @param {number} [glassIntensity] The envMapIntensity for glass (default: 1.5 x intensity).
 */
export function setEnvironmentIntensity(target, intensity, glassIntensity = intensity * 1.5) {
  const asset = target.isObject3D ? requireAssetOf(target) : target;
  for (const material of asset.allMaterials()) {
    material.envMapIntensity = roleOfMaterial(material) === ROLE.GLASS ? glassIntensity : intensity;
  }
}
