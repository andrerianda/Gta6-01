// Facade materials: the shared materials every sector's merged building meshes draw with. Walls
// and trims are the texture toolkit's tintable surfaces (stucco, cast concrete) with the
// building's tints in vertex colours; glass is dark reflective glazing, with a lit copy whose
// warm emissive follows the atmosphere's night factor; the far cards use the windowed facade
// and curtain wall surfaces with their window glow masks. Baked kits keep their own materials,
// cloned once with vertex colours on.
import * as THREE from 'three';

/** Night glow of the kits' window lamp groups: a for homes, b for offices, c for shop fronts. */
const WINDOW_GLOW = Object.freeze({
  lamp_window_a: { color: 0xffb066, peak: 0.75 },
  lamp_window_b: { color: 0xffd6a0, peak: 0.6 },
  lamp_window_c: { color: 0xffe0b0, peak: 1.0 },
  lamp_crown: { color: 0xfff0d8, peak: 1.2 },
});

/**
 * Creates the facade materials.
 * @param {{textures?: {getMaterial?: Function, requestMaterial?: Function}, atmosphere?: {state?: {nightFactor?: number}}}} options
 *   textures is the surface library (render/textures/surfaceMaterials.js); without it the
 *   materials are plain colours.
 * @returns {{materialFor: (kit: object, role: string, part?: object) => THREE.Material,
 *   cardMaterialFor: (plan: object) => THREE.Material, roofMaterial: THREE.Material,
 *   setNightFactor: (night: number) => void, dispose: () => void}}
 */
export function createFacadeMaterials(options = {}) {
  const { textures } = options;
  const made = new Set();
  const nightScaled = new Set();

  const surface = (name, surfaceOptions, fallbackColor) => {
    let material = null;
    try {
      const base = textures?.requestMaterial?.(name, surfaceOptions) ?? textures?.getMaterial?.(name, surfaceOptions);
      if (base) material = base.clone();
    } catch {
      material = null;
    }
    material ??= new THREE.MeshStandardMaterial({ color: fallbackColor, roughness: 0.85 });
    material.vertexColors = true;
    material.name = `facade_${name}`;
    made.add(material);
    return material;
  };
  const plain = (name, parameters) => {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, ...parameters });
    material.name = name;
    made.add(material);
    return material;
  };
  const nightLit = (material, peak) => {
    material.userData.nightPeak = peak;
    material.emissiveIntensity = 0;
    nightScaled.add(material);
    return material;
  };

  const stucco = surface('stucco', { seed: 11 }, 0xe8dccb);
  const concrete = surface('concreteWall', { seed: 12 }, 0xc9c6c0);
  const roofMaterial = surface('flatRoof', { seed: 13 }, 0x77736d);
  roofMaterial.userData.noShadow = true;
  const glass = plain('facade_glass', { color: 0x46525c, metalness: 0.9, roughness: 0.08 });
  const glassLit = nightLit(plain('facade_glass_lit', { color: 0x46525c, metalness: 0.75, roughness: 0.1, emissive: 0xffc786 }), 1.6);
  const towerGlass = plain('facade_tower_glass', { color: 0x5f8590, metalness: 0.95, roughness: 0.05 });
  const towerGlassLit = nightLit(plain('facade_tower_glass_lit', { color: 0x5f8590, metalness: 0.85, roughness: 0.06, emissive: 0xfff0d8 }), 1.2);
  const frame = plain('facade_frame', { color: 0x34363a, metalness: 0.55, roughness: 0.45 });
  const cardPlaster = nightLit(surface('windowedFacade', { seed: 14, bayMetres: 4, floorMetres: 3.2 }, 0xe0d6c8), 1.4);
  const cardCurtain = nightLit(surface('curtainWall', { seed: 15, bayMetres: 4 / 3, floorMetres: 4 }, 0x6b8790), 1.2);
  if (cardPlaster.emissiveMap) cardPlaster.emissive?.set(0xffc786);
  if (cardCurtain.emissiveMap) cardCurtain.emissive?.set(0xfff0d8);

  const concreteFamilies = new Set(['tower', 'office', 'civic', 'industrial']);
  /** @type {Map<string, THREE.Material>} */
  const bakedClones = new Map();

  const bakedMaterial = (kit, role, part) => {
    const key = `${kit.id}/${part?.material}/${role}`;
    if (bakedClones.has(key)) return bakedClones.get(key);
    const base = kit.asset.materials.get(part?.material);
    const material = base ? base.clone() : frame;
    if (base) {
      material.vertexColors = true;
      // The paints carry the kit's sample colour (a salmon wall, a grey tower) in their base
      // colour; the building's tint is in the vertex colours, so the paint goes neutral. A dark
      // paint (the tower's black mullions) is a material, not a paint, and keeps its colour.
      if ((role === 'wall' || role === 'trim') && luminance(base.color) > 0.2) material.color.setRGB(1, 1, 1);
      // The kits bake their panes as real dark glass (linear 0.07 to 0.12, metallic, roughness
      // about 0.07): used as baked. Unlit by day; the lit copies follow the night factor.
      // The baked lamp strength (2.2) burns the lit panes to flat white after tone mapping: each
      // lamp group glows its own warm room colour at a lower peak (shops brightest).
      if (role === 'glassLit') {
        const glow = WINDOW_GLOW[part?.material] ?? null;
        if (glow && material.emissive) material.emissive.setHex(glow.color);
        nightLit(material, glow ? glow.peak : Math.min(base.emissiveIntensity || 1, 1));
      } else if (role === 'glass' && 'emissiveIntensity' in material) material.emissiveIntensity = 0;
      made.add(material);
    }
    bakedClones.set(key, material);
    return material;
  };

  const luminance = (color) => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;

  return {
    materialFor(kit, role, part) {
      if (kit.baked) return bakedMaterial(kit, role, part);
      const tower = kit.family === 'tower';
      switch (role) {
        case 'wall': return concreteFamilies.has(kit.family) ? concrete : stucco;
        case 'trim': return concreteFamilies.has(kit.family) ? concrete : stucco;
        case 'glass': return tower ? towerGlass : glass;
        case 'glassLit': return tower ? towerGlassLit : glassLit;
        default: return frame;
      }
    },
    cardMaterialFor(plan) {
      return plan.family === 'tower' ? cardCurtain : cardPlaster;
    },
    roofMaterial,
    /** Scales the lit windows by the atmosphere's night factor (0 by day, 1 at night). */
    setNightFactor(night) {
      for (const material of nightScaled) material.emissiveIntensity = material.userData.nightPeak * night;
    },
    dispose() {
      for (const material of made) material.dispose();
      made.clear();
    },
  };
}
