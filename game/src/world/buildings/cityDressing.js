// City dressing: everything that stands on the city plan's lots and pavements, built one sector
// at a time for the open-world city's streamer. Buildings come from the facade kits (baked
// Blender kits when loaded, the procedural fallback otherwise), merged per material per sector;
// street lamps and roadside palms are instanced batches of the built props. Each sector is one
// THREE.LOD: the modelled level near, facade cards and far plants beyond `farDistance`.
//
//   const dressing = createCityDressing({ plan, assets, textures, physics, atmosphere, random, quality });
//   const built = await dressing.buildSector({ id, bounds, lots, roads });
//   scene.add(built.object3d);      // colliders and lights are registered already when physics /
//   built.dispose();                // atmosphere are given; dispose removes them again
//   dressing.update();              // once per frame: night windows follow atmosphere.state
import * as THREE from 'three';
import { CITY_DISTRICTS } from '../../catalog/cityDistricts.js';
import { createSeededRandom } from '../../core/random/seededRandom.js';
import { layOutStreetLamps } from '../props/streetFurnitureLayout.js';
import { normaliseBounds } from '../props/streetFurnitureLayout.js';
import { buildSectorStreetDressing } from '../props/sectorStreetDressing.js';
import { layOutRoadsidePlanting } from '../vegetation/roadsidePlantingLayout.js';
import { createBakedFacadeKit } from './bakedFacadeKit.js';
import { planBuilding } from './buildingMassingPlan.js';
import { assembleSectorBuildings } from './buildingMeshAssembly.js';
import { createFacadeMaterials } from './facadeMaterials.js';
import { createProceduralFacadeKit } from './proceduralFacadeKit.js';

/**
 * Creates the city dressing.
 * @param {object} options
 * @param {object} options.plan The city plan (docs/CITY_PLAN.md).
 * @param {{has: Function, get: Function} | null} [options.assets] The asset library.
 * @param {object | null} [options.textures] The surface library (render/textures/surfaceMaterials.js).
 * @param {{addStaticBox?: Function, addStaticCylinder?: Function, removeStatic?: Function} | null} [options.physics]
 *   The collision world; colliders are added per sector when it is given.
 * @param {{addLight?: Function, removeLight?: Function, state?: {nightFactor: number}} | null} [options.atmosphere]
 * @param {{fork?: Function} | null} [options.random] A seeded generator (the city seed).
 * @param {string | {propDensity?: number, vegetationDensity?: number, lodBias?: number,
 *   cityLightRange?: number}} [options.quality] The quality tier (name or tier row).
 * @returns {{buildSector: (sector: object) => Promise<{object3d: THREE.Object3D, colliders: object[],
 *   lights: object[], signs: object[], stats: object, dispose: () => void}>, update: () => void,
 *   dispose: () => void, materials: object}}
 */
export function createCityDressing(options) {
  const { plan, assets = null, textures = null, physics = null, atmosphere = null } = options;
  const random = options.random?.fork ? options.random : createSeededRandom(options.random?.seed ?? 'marazul');
  const tier = typeof options.quality === 'object' && options.quality ? options.quality : {};
  const lodBias = tier.lodBias ?? 1;
  // Sector centres within this distance draw the modelled level (about the 3 x 3 sectors around
  // the camera); beyond it the cards. sliceMs: building work per pause, so streaming never hitches.
  const farDistance = 230 * lodBias;
  const sliceMs = options.sliceMs ?? 4;
  const materials = createFacadeMaterials({ textures });
  const kits = new Map();
  const lotsById = new Map();
  for (const lot of plan.lots ?? []) lotsById.set(lot.id, lot);

  const kitFor = (buildingPlan) => {
    if (assets?.has?.(buildingPlan.kit)) {
      if (!kits.has(buildingPlan.kit)) kits.set(buildingPlan.kit, createBakedFacadeKit(assets.get(buildingPlan.kit)));
      const baked = kits.get(buildingPlan.kit);
      if (baked) return baked;
    }
    const key = `${buildingPlan.family}/${buildingPlan.upperHeight}`;
    if (!kits.has(key)) kits.set(key, createProceduralFacadeKit(buildingPlan.family, { upper: buildingPlan.upperHeight }));
    return kits.get(key);
  };
  const moodOf = (district) => CITY_DISTRICTS[district]?.moodColors ?? {};
  const heightAt = (x, z) => (plan.heightAt ? plan.heightAt(x, z) : 0);
  const resolve = (list, table) => (list ?? []).map((item) => (typeof item === 'number' ? table(item) : item)).filter(Boolean);

  async function buildSector(sector) {
    const lots = resolve(sector.lots, (id) => lotsById.get(id));
    const roads = resolve(sector.roads ?? sector.segments, (id) => plan.roads?.segments?.[id]);
    const bounds = sector.bounds ? normaliseBounds(sector.bounds) : boundsOfLots(lots);
    const origin = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };

    const plans = [];
    for (const lot of lots) {
      const planned = planBuilding(lot, random.fork(`lot${lot.id}`), moodOf(lot.district));
      if (planned) plans.push(planned);
    }
    const buildings = await assembleSectorBuildings(plans, {
      sliceMs,
      pause: () => new Promise((resolve) => setTimeout(resolve, 0)),
      kitFor,
      materialFor: materials.materialFor,
      cardMaterialFor: materials.cardMaterialFor,
      roofMaterial: materials.roofMaterial,
      origin,
    });

    const lamps = [];
    const plants = [];
    for (const segment of roads) {
      lamps.push(...layOutStreetLamps(segment, { bounds: sector.bounds ? bounds : undefined, density: tier.propDensity ?? 1 }));
      plants.push(...layOutRoadsidePlanting(segment, { bounds: sector.bounds ? bounds : undefined, density: tier.vegetationDensity ?? 1 }));
    }
    const street = assets ? buildSectorStreetDressing({ lamps, plants }, { assets, heightAt, origin }) : null;

    const lod = new THREE.LOD();
    lod.name = `city_dressing_${sector.id}`;
    lod.position.set(origin.x, 0, origin.z);
    const near = new THREE.Group();
    near.add(buildings.near);
    const far = new THREE.Group();
    far.add(buildings.far);
    if (street) {
      near.add(street.near);
      far.add(street.far);
    }
    lod.addLevel(near, 0, 0.05);
    lod.addLevel(far, farDistance, 0.05);
    lod.updateMatrixWorld(true);

    const colliders = [...buildings.colliders, ...(street?.colliders ?? [])];
    const lightDescriptions = [...buildings.lights, ...(street?.lights ?? [])];
    const staticHandles = addColliders(physics, colliders, sector.id);
    const lightHandles = atmosphere?.addLight ? lightDescriptions.map((light) => atmosphere.addLight(light)) : [];

    return {
      object3d: lod,
      colliders,
      lights: lightDescriptions,
      signs: buildings.signs,
      stats: { ...buildings.stats, lamps: lamps.length, plants: plants.length, drawCalls: countDraws(near), farDrawCalls: countDraws(far) },
      dispose() {
        lod.removeFromParent();
        lod.traverse((node) => { if (node.isMesh && !node.isInstancedMesh) node.geometry.dispose(); });
        for (const batch of street?.batches ?? []) batch.dispose();
        for (const handle of staticHandles) physics.removeStatic?.(handle);
        for (const handle of lightHandles) atmosphere.removeLight?.(handle);
      },
    };
  }

  return {
    buildSector,
    materials,
    /** Follows the atmosphere's night factor (lit windows); call once per frame. */
    update() {
      materials.setNightFactor(atmosphere?.state?.nightFactor ?? 0);
    },
    dispose() {
      materials.dispose();
    },
  };
}

function addColliders(physics, colliders, group) {
  const handles = [];
  if (!physics) return handles;
  for (const c of colliders) {
    if (c.shape === 'box' && physics.addStaticBox) {
      handles.push(physics.addStaticBox(c.x, c.y, c.z, c.halfX, c.halfY, c.halfZ, c.heading, { group: `dressing:${group}`, userRef: c.lotId }));
    } else if (c.shape === 'cyl' && physics.addStaticCylinder) {
      handles.push(physics.addStaticCylinder(c.x, c.y, c.z, c.radius, c.halfHeight, { group: `dressing:${group}` }));
    }
  }
  return handles;
}

function boundsOfLots(lots) {
  const box = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
  for (const lot of lots) {
    box.minX = Math.min(box.minX, lot.x); box.maxX = Math.max(box.maxX, lot.x);
    box.minZ = Math.min(box.minZ, lot.z); box.maxZ = Math.max(box.maxZ, lot.z);
  }
  if (!Number.isFinite(box.minX)) return { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  return box;
}

function countDraws(group) {
  let draws = 0;
  group.traverse((node) => { if (node.isMesh && (node.count ?? 1) > 0) draws += 1; });
  return draws;
}
