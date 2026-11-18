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
import { signalLightAt } from '../../traffic/junctionRules.js';
import { buildJunctionControls } from '../props/junctionControlDressing.js';
import { layOutSectorStreetItems } from '../props/sectorStreetItems.js';
import { createStreetClearance } from '../props/streetClearance.js';
import { createSurfaceClearance } from '../props/surfaceClearance.js';
import { insideBounds, normaliseBounds } from '../props/streetFurnitureLayout.js';
import { buildSectorStreetDressing } from '../props/sectorStreetDressing.js';
import { createStreetItemPools } from '../props/streetItemPools.js';
import { createBakedFacadeKit } from './bakedFacadeKit.js';
import { planBuilding } from './buildingMassingPlan.js';
import { assembleSectorBuildings, assembleSectorBuildingsNow } from './buildingMeshAssembly.js';
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
 * @param {number} [options.sliceMs] Milliseconds of building work between pauses (default 4;
 *   Infinity builds a sector in one go, as a preview or a loading screen may).
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
  // Street items stand only where the BUILT street has pavement, verge or a planted median
  // (options.streets = openWorldCity's surface query); the plan's numbers are the fallback for
  // previews without the city.
  const clearance = options.streets?.surfaceAt ? createSurfaceClearance(options.streets) : createStreetClearance(plan);
  // Lamps and plants of every sector share a few city-wide instanced meshes; each item takes its
  // level by its own distance, shadows only within the tier's shadowCasterDistance.
  const streetItems = assets ? createStreetItemPools(assets, { lodBias, shadowCasterDistance: tier.shadowCasterDistance }) : null;
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
  // plan.heightAt answers NaN at about a hundred grid points (reported to the plan's owner).
  const heightAt = (x, z) => {
    const height = plan.heightAt ? plan.heightAt(x, z) : 0;
    return Number.isFinite(height) ? height : (plan.lotAt?.(x, z)?.y ?? 0);
  };
  /** Where a pole or trunk stands: the ground plus the kerb height on a raised pavement or median. */
  const itemHeightAt = (x, z) => heightAt(x, z) + (clearance.liftAt ? clearance.liftAt(x, z) : 0);
  const resolve = (list, table) => (list ?? []).map((item) => (typeof item === 'number' ? table(item) : item)).filter(Boolean);
  const pause = () => new Promise((done) => setTimeout(done, 0));

  // Signal lamps follow the traffic system's lights (options.signals or setSignalSource: an
  // object, or a function returning one, with signalLight(nodeId, phase)); without it they run
  // the plan's own cycle (traffic/junctionRules.js) on the page clock.
  let signalSource = options.signals ?? null;
  const nodes = plan.roads?.nodes ?? [];
  const lightOf = (nodeId, phase) => {
    const source = typeof signalSource === 'function' ? signalSource() : signalSource;
    if (source && typeof source.signalLight === 'function') return source.signalLight(nodeId, phase);
    return signalLightAt(nodes[nodeId]?.signal ?? null, phase, performance.now() / 1000);
  };
  /** Junction controls of the built sectors, with the near group that shows them. */
  const junctionSets = new Set();

  // The modelled level of a sector exists only while the camera is near: requested (built in
  // the background, one sector at a time) inside nearBuildDistance, built at once if the sector
  // must show it before that finished (a teleport), dropped beyond nearDropDistance. The
  // cameras are the ones the renderer hands each sector's LOD; orthographic ones (maps) only
  // choose a level.
  const lastCamera = { x: 0, z: 0, known: false };
  const nearBuildDistance = farDistance + 50;
  const nearDropDistance = farDistance + 190;
  const cameraPosition = new THREE.Vector3();
  let nearQueue = Promise.resolve();

  function createNearDetail(lod, near, far, origin, buildLater, buildNow, onView) {
    let state = 'none';
    let group = null;
    let generation = 0;
    let showing = false;
    const attach = (built) => {
      group = built.near;
      near.add(group);
      group.updateMatrixWorld(true);
      state = 'built';
      lod.userData.nearBuilt = true;
    };
    const drop = () => {
      generation += 1;
      if (group) {
        group.removeFromParent();
        disposeMeshes(group);
        group = null;
      }
      state = 'none';
      lod.userData.nearBuilt = false;
    };
    const detail = {
      buildNow() {
        if (state === 'built' || state === 'failed') return;
        generation += 1;
        try {
          attach(buildNow());
        } catch (error) {
          state = 'failed';
          lod.userData.nearError = error;
        }
      },
      request() {
        if (state !== 'none') return undefined;
        state = 'queued';
        const token = ++generation;
        nearQueue = nearQueue.then(async () => {
          if (token !== generation) return;
          state = 'building';
          const built = await buildLater();
          if (token !== generation) disposeMeshes(built.near);
          else attach(built);
        }).catch((error) => {
          state = 'failed';
          lod.userData.nearError = error;
        });
        return nearQueue;
      },
      dispose: drop,
    };
    lod.update = (camera) => {
      cameraPosition.setFromMatrixPosition(camera.matrixWorld);
      const distance = Math.hypot(cameraPosition.x - origin.x, cameraPosition.y, cameraPosition.z - origin.z) / (camera.zoom || 1);
      if (camera.isPerspectiveCamera) {
        lastCamera.x = cameraPosition.x;
        lastCamera.z = cameraPosition.z;
        lastCamera.known = true;
        onView?.(Math.hypot(cameraPosition.x - origin.x, cameraPosition.z - origin.z));
        if (state === 'built' && distance > nearDropDistance) drop();
        else if (distance < farDistance) detail.buildNow();
        else if (distance < nearBuildDistance) detail.request();
      }
      showing = state === 'built' && distance < farDistance * (showing ? 1.05 : 1);
      near.visible = showing;
      far.visible = !showing;
      lod._currentLevel = showing ? 0 : 1;
    };
    return detail;
  }

  async function buildSector(sector) {
    let lots = resolve(sector.lots, (id) => lotsById.get(id));
    const roads = resolve(sector.roads ?? sector.segments, (id) => plan.roads?.segments?.[id]);
    const bounds = sector.bounds ? normaliseBounds(sector.bounds) : boundsOfLots(lots);
    // A lot listed by several sectors is built by the one that holds its centre.
    if (sector.bounds) lots = lots.filter((lot) => insideBounds(bounds, lot.x, lot.z));
    const origin = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };

    const plans = [];
    for (const lot of lots) {
      const planned = planBuilding(lot, random.fork(`lot${lot.id}`), moodOf(lot.district));
      if (planned) plans.push(planned);
    }
    const assemblyOptions = (levels) => ({
      levels,
      sliceMs,
      pause,
      kitFor,
      materialFor: materials.materialFor,
      cardMaterialFor: materials.cardMaterialFor,
      roofMaterial: materials.roofMaterial,
      origin,
    });
    // The far level (cards, roofs), lights, signs and colliders now; the modelled level only
    // while the sector is near (createNearDetail).
    const buildings = await assembleSectorBuildings(plans, assemblyOptions('far'));

    // Lamps, plants and junction controls only on pavement, verge or a built median.
    const { lamps, plants: planted, controls } = layOutSectorStreetItems({
      segments: roads,
      nodes: resolve(sector.intersections, (id) => nodes[id]),
      allSegments: plan.roads?.segments ?? [],
      bounds: sector.bounds ? bounds : undefined,
      density: tier.propDensity ?? 1,
      vegetationDensity: tier.vegetationDensity ?? 1,
      clearance,
    });
    const street = assets ? buildSectorStreetDressing({ lamps, plants: planted }, { assets, heightAt: itemHeightAt }) : null;
    const streetHandle = street && streetItems ? streetItems.addSector(street.instances) : null;
    const junction = assets ? buildJunctionControls(controls, { assets, heightAt: itemHeightAt, origin }) : null;

    const lod = new THREE.LOD();
    lod.name = `city_dressing_${sector.id}`;
    lod.position.set(origin.x, 0, origin.z);
    const near = new THREE.Group();
    const far = new THREE.Group();
    far.add(buildings.far);
    // The pools hang beside the sectors, under the same parent (the city's world layer).
    const onView = () => {
      if (streetItems && !streetItems.object3d.parent && lod.parent) lod.parent.add(streetItems.object3d);
    };
    const junctionSet = junction?.batches.length ? { junction, near } : null;
    if (junctionSet) {
      near.add(junction.group);
      junctionSets.add(junctionSet);
      junction.update(lightOf);
    }
    lod.addLevel(near, 0, 0.05);
    lod.addLevel(far, farDistance, 0.05);
    lod.updateMatrixWorld(true);
    const detail = createNearDetail(lod, near, far, origin,
      () => assembleSectorBuildings(plans, assemblyOptions('near')),
      () => assembleSectorBuildingsNow(plans, assemblyOptions('near')), onView);
    // A sector streamed in close to the camera gets its modelled level before it is handed over.
    if (lastCamera.known && Math.hypot(lastCamera.x - origin.x, lastCamera.z - origin.z) < nearBuildDistance) await detail.request();

    const colliders = [...buildings.colliders, ...(street?.colliders ?? []), ...(junction?.colliders ?? [])];
    const lightDescriptions = [...buildings.lights, ...(street?.lights ?? [])];
    const staticHandles = addColliders(physics, colliders, sector.id);
    const lightHandles = atmosphere?.addLight ? lightDescriptions.map((light) => atmosphere.addLight(light)) : [];

    return {
      object3d: lod,
      colliders,
      lights: lightDescriptions,
      signs: buildings.signs,
      stats: { ...buildings.stats, lamps: lamps.length, plants: planted.length, junctionObjects: controls.length, get drawCalls() { return countDraws(near); }, farDrawCalls: countDraws(far) },
      /** Builds the modelled level now (a preview or a capture that wants it at once). */
      buildNear: () => detail.buildNow(),
      dispose() {
        detail.dispose();
        lod.removeFromParent();
        lod.traverse((node) => { if (node.isMesh && !node.isInstancedMesh) node.geometry.dispose(); });
        streetHandle?.dispose();
        if (junctionSet) junctionSets.delete(junctionSet);
        for (const batch of junction?.batches ?? []) batch.dispose();
        for (const handle of staticHandles) physics.removeStatic?.(handle);
        for (const handle of lightHandles) atmosphere.removeLight?.(handle);
      },
    };
  }

  return {
    buildSector,
    materials,
    /** The city-wide lamp and plant pools; attached beside the first sector shown, or add it yourself. */
    object3d: streetItems?.object3d ?? null,
    /** Draw calls and instances of the lamp and plant pools. */
    streetItemStats: () => streetItems?.stats() ?? { draws: 0, instances: 0 },
    /** Follows the atmosphere's night factor (lit windows) and the signals; once per frame. */
    update() {
      materials.setNightFactor(atmosphere?.state?.nightFactor ?? 0);
      if (lastCamera.known) streetItems?.update(lastCamera.x, lastCamera.z);
      for (const set of junctionSets) if (set.near.visible) set.junction.update(lightOf);
    },
    /** Follows a new quality tier row (QUALITY_CHANGED): street item levels and shadow casters. */
    setQuality(tierRow) {
      streetItems?.setQuality(tierRow);
    },
    /** Where the signal lamps read their lights: the traffic system (signalLight(nodeId, phase)). */
    setSignalSource(source) {
      signalSource = source ?? null;
    },
    dispose() {
      materials.dispose();
      streetItems?.dispose();
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

function disposeMeshes(group) {
  group.traverse((node) => { if (node.isMesh && !node.isInstancedMesh) node.geometry.dispose(); });
}

function countDraws(group) {
  let draws = 0;
  group.traverse((node) => { if (node.isMesh && (node.count ?? 1) > 0) draws += 1; });
  return draws;
}
