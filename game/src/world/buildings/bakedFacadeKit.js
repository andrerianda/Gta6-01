// Baked facade kits: reads a Blender kit (kit_deco_resort, kit_glass_tower, ...) loaded by the
// asset library into the same module table the procedural fallback makes, so
// buildingMeshAssembly.js lays both the same way. Each module's <module>_lod0 (or _lod1 card)
// meshes are taken in module space (the node's own translation, which only spreads the
// modules out as a contact sheet in the file, is ignored), split by material role.
import * as THREE from 'three';
import { BUILDING_KIT_MODULES } from '../../assets/registry/buildings.js';
import { TOWER_KIT_MODULES } from '../../assets/registry/towersAndIndustry.js';

/**
 * The module table of a kit from its registry entry and the file's extras.
 * @param {string} kitId The kit id.
 * @param {object} [extras] asset.extras of the loaded kit (extras.modules repeats the table).
 * @returns {{upper: number | null, modules: Record<string, {slot: string, width: number, height: number, lamp?: string}>} | null}
 */
export function kitModuleTable(kitId, extras = {}) {
  if (TOWER_KIT_MODULES[kitId]) return { upper: TOWER_KIT_MODULES[kitId].storey, modules: TOWER_KIT_MODULES[kitId].modules };
  if (BUILDING_KIT_MODULES[kitId]) {
    const modules = BUILDING_KIT_MODULES[kitId];
    const upper = Object.values(modules).find((module) => module.slot.startsWith('upper_'))?.height ?? null;
    return { upper, modules };
  }
  if (extras.modules && typeof extras.modules === 'object') {
    const upper = Object.values(extras.modules).find((module) => String(module.slot).startsWith('upper_'))?.height ?? null;
    return { upper, modules: extras.modules };
  }
  return null;
}

/**
 * Turns a loaded kit asset into a facade kit for the assembler.
 * @param {import('../../assets/Asset.js').Asset} asset The loaded kit.
 * @param {{lod?: number}} [options] 0 for the modelled bays, 1 for the baked cards.
 * @returns {object | null} { id, family: 'baked', asset, upper, modules } or null when the
 *   file carries none of the registered modules.
 */
export function createBakedFacadeKit(asset, options = {}) {
  const table = kitModuleTable(asset.id, asset.extras);
  if (!table) return null;
  const lod = options.lod ?? 0;
  const modules = {};
  const inverse = new THREE.Matrix4();
  const relative = new THREE.Matrix4();
  asset.scene.updateMatrixWorld(true);
  for (const [name, info] of Object.entries(table.modules)) {
    const node = asset.scene.getObjectByName(`${name}_lod${lod}`) ?? asset.scene.getObjectByName(`${name}_lod0`);
    if (!node) continue;
    inverse.copy(node.matrixWorld).invert();
    const parts = [];
    node.traverse((mesh) => {
      if (!mesh.isMesh) return;
      relative.multiplyMatrices(inverse, mesh.matrixWorld);
      const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      source.applyMatrix4(relative);
      if (!source.attributes.normal) source.computeVertexNormals();
      const count = source.attributes.position.count;
      const uv = source.attributes.uv ? new Float32Array(source.attributes.uv.array) : new Float32Array(count * 2);
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      parts.push({
        role: roleOfKitMaterial(material.name),
        material: material.name,
        position: new Float32Array(source.attributes.position.array),
        normal: new Float32Array(source.attributes.normal.array),
        uv,
        uvAbsolute: true,
      });
      source.dispose();
    });
    if (parts.length) modules[name] = { slot: info.slot, width: info.width, height: info.height, lamp: info.lamp, parts };
  }
  if (Object.keys(modules).length === 0) return null;
  const kit = { id: asset.id, family: 'baked', baked: true, asset, upper: table.upper, modules, lod };
  // The lod1 cards of the same modules (same materials, a few triangles each) for upper storeys.
  if (lod === 0) kit.cards = createBakedFacadeKit(asset, { lod: 1 });
  return kit;
}

/**
 * The assembler role of a kit material: wall and trim are tinted per building, glass is lit
 * at night by share, everything else keeps its own material.
 * @param {string} name The material name.
 * @returns {string} wall, trim, glass or atlas.
 */
export function roleOfKitMaterial(name = '') {
  if (name.startsWith('paint_wall')) return 'wall';
  if (name.startsWith('paint_trim')) return 'trim';
  if (name.startsWith('lamp_window') || name.startsWith('glass')) return 'glass';
  if (name.startsWith('lamp_crown')) return 'glassLit';
  return 'atlas';
}
