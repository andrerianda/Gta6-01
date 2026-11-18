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
import { layOutSectorClutter, layOutSectorStreetItems } from '../props/sectorStreetItems.js';
import { buildSectorClutter } from '../props/sectorClutterDressing.js';
import { createSignFaces } from '../props/signFaceDressing.js';
import { createStreetClearance } from '../props/streetClearance.js';
import { createSurfaceClearance } from '../props/surfaceClearance.js';
import { insideBounds, normaliseBounds } from '../props/streetFurnitureLayout.js';
import { buildSectorStreetDressing } from '../props/sectorStreetDressing.js';
import { createStreetItemPools } from '../props/streetItemPools.js';
import { createSectorMeshBatches } from '../streets/sectorMeshBatches.js';
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
  // The painted faces of stop signs and street-name blades: two instanced quads for the city.
  const signFaces = streetItems ? createSignFaces({ assets, districtName: (id) => CITY_DISTRICTS[id]?.name ?? '' }) : null;
  if (signFaces) streetItems.object3d.add(signFaces.object3d);
  // The far level of every sector (facade cards, parapet bands, roofs) joins one BatchedMesh per
  // material: a sector's pieces go in while the camera sees its far level and out when its
  // modelled level shows, so the far city costs a few draws instead of a few per sector.
  const farRoot = new THREE.Group();
  farRoot.name = 'city_dressing_far';
  const farBatches = createSectorMeshBatches(farRoot);
  const nearRoot = new THREE.Group();
  nearRoot.name = 'city_dressing_near';
  const nearBatches = createSectorMeshBatches(nearRoot);
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
  /** Junction controls of the built sectors, with their sector centre. */
  const junctionSets = new Set();
  /** Bench and bus-shelter seats of the built sectors (one array per sector). */
  const seatSets = new Set();
  const SIGNAL_UPDATE_DISTANCE = 340;

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

  function createNearDetail(lod, near, far, origin, buildLater, buildNow, onView, onLevel) {
    let state = 'none';
    let group = null;
    let generation = 0;
    let showing = false;
    // The modelled level stays out of the scene, at the sector's origin, and is copied into the
    // city-wide near batches (one draw per material for every sector) while the view shows it.
    const holder = new THREE.Group();
    holder.position.set(origin.x, 0, origin.z);
    holder.updateMatrixWorld(true);
    let handle = null;
    const setShown = (show) => {
      if (show && group && !handle) handle = nearBatches.add([holder]);
      else if (!show && handle) {
        nearBatches.remove(handle);
        handle = null;
      }
    };
    const attach = (built) => {
      group = built.near;
      holder.add(group);
      holder.updateMatrixWorld(true);
      state = 'built';
      lod.userData.nearBuilt = true;
    };
    const drop = () => {
      generation += 1;
      setShown(false);
      if (group) {
        group.removeFromParent();
        disposeMeshes(group);
        group = null;
      }
      state = 'none';
      lod.userData.nearBuilt = false;
    };
    const detail = {
      holder,
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
      // The batches follow the view camera only (not the shadow or capture cameras).
      if (camera.isPerspectiveCamera) {
        setShown(showing);
        onLevel?.(showing);
      }
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
    // Street clutter (bins, benches, bags, dumpsters, fences, wall units) by district, kept clear
    // of the asphalt and of the lamps, plants and signals.
    const clutter = assets ? layOutSectorClutter({
      segments: roads, buildings: plans, lotsById, bounds: sector.bounds ? bounds : undefined, clearance,
      fixed: [...lamps, ...controls, ...planted], density: tier.clutterDensity ?? tier.propDensity ?? 1,
    }) : [];
    const street = assets ? buildSectorStreetDressing({ lamps, plants: planted }, { assets, heightAt: itemHeightAt }) : null;
    const junction = assets ? buildJunctionControls(controls, { assets, heightAt: itemHeightAt }) : null;
    const faceHandle = signFaces && junction?.placed.length ? signFaces.addSector(junction.placed) : null;
    const clutterParts = clutter.length ? buildSectorClutter(clutter, { assets, heightAt: itemHeightAt }) : null;
    // Lamps, plants, junction controls and clutter all go to the city-wide pools.
    const pooled = [...(street?.instances ?? []), ...(junction?.instances ?? []), ...(clutterParts?.instances ?? [])];
    const streetHandle = streetItems && pooled.length ? streetItems.addSector(pooled) : null;
    const junctionSet = junction?.instances.length && streetHandle ? { junction, origin } : null;
    if (junctionSet) {
      junction.attach(streetHandle, street?.instances.length ?? 0);
      junctionSets.add(junctionSet);
      junction.update(lightOf);
    }
    const seats = clutterParts?.seats ?? [];
    if (seats.length) seatSets.add(seats);

    const lod = new THREE.LOD();
    lod.name = `city_dressing_${sector.id}`;
    lod.position.set(origin.x, 0, origin.z);
    const near = new THREE.Group();
    const far = new THREE.Group();
    // The far pieces stay out of the scene, placed at the sector's origin, and are copied into
    // the city-wide far batches while the far level shows.
    const farHolder = new THREE.Group();
    farHolder.position.set(origin.x, 0, origin.z);
    farHolder.add(buildings.far);
    farHolder.updateMatrixWorld(true);
    let farHandle = null;
    const showFar = (show) => {
      if (show && !farHandle) farHandle = farBatches.add([farHolder]);
      else if (!show && farHandle) {
        farBatches.remove(farHandle);
        farHandle = null;
      }
    };
    showFar(true);
    // The pools and far batches hang beside the sectors, under the same parent (the world layer).
    const onView = () => {
      if (streetItems && !streetItems.object3d.parent && lod.parent) lod.parent.add(streetItems.object3d);
      if (!farRoot.parent && lod.parent) lod.parent.add(farRoot);
      if (!nearRoot.parent && lod.parent) lod.parent.add(nearRoot);
    };
    lod.addLevel(near, 0, 0.05);
    lod.addLevel(far, farDistance, 0.05);
    lod.updateMatrixWorld(true);
    const detail = createNearDetail(lod, near, far, origin,
      () => assembleSectorBuildings(plans, assemblyOptions('near')),
      () => assembleSectorBuildingsNow(plans, assemblyOptions('near')), onView, (nearShowing) => showFar(!nearShowing));
    // A sector streamed in close to the camera gets its modelled level before it is handed over.
    if (lastCamera.known && Math.hypot(lastCamera.x - origin.x, lastCamera.z - origin.z) < nearBuildDistance) await detail.request();

    const colliders = [...buildings.colliders, ...(street?.colliders ?? []), ...(junction?.colliders ?? []), ...(clutterParts?.colliders ?? [])];
    const lightDescriptions = [...buildings.lights, ...(street?.lights ?? [])];
    const staticHandles = addColliders(physics, colliders, sector.id);
    const lightHandles = atmosphere?.addLight ? lightDescriptions.map((light) => atmosphere.addLight(light)) : [];

    return {
      object3d: lod,
      colliders,
      lights: lightDescriptions,
      signs: buildings.signs,
      seats,
      stats: { ...buildings.stats, lamps: lamps.length, plants: planted.length, junctionObjects: controls.length, clutter: clutter.length, seats: seats.length, get nearPieces() { return countDraws(detail.holder); }, farPieces: countDraws(farHolder) },
      /** Builds the modelled level now (a preview or a capture that wants it at once). */
      buildNear: () => detail.buildNow(),
      dispose() {
        detail.dispose();
        lod.removeFromParent();
        lod.traverse((node) => { if (node.isMesh && !node.isInstancedMesh) node.geometry.dispose(); });
        showFar(false);
        disposeMeshes(farHolder);
        streetHandle?.dispose();
        faceHandle?.dispose();
        if (junctionSet) junctionSets.delete(junctionSet);
        seatSets.delete(seats);
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
    /** Draw calls, instances and triangles of the street item pools (lamps, plants, controls, clutter), with byKind. */
    streetItemStats: () => streetItems?.stats() ?? { draws: 0, instances: 0 },
    /**
     * Seats (benches, bus shelters) within `radius` metres of x, z: {x, y, z, rotationY, heading
     * (compass, the way the sitter faces), object}. Pass `out` to reuse an array.
     */
    seatsNear(x, z, radius = 30, out = []) {
      out.length = 0;
      const limit = radius * radius;
      for (const seats of seatSets) for (const seat of seats) if ((seat.x - x) ** 2 + (seat.z - z) ** 2 <= limit) out.push(seat);
      return out;
    },
    /** Follows the atmosphere's night factor (lit windows) and the signals; once per frame. */
    update() {
      materials.setNightFactor(atmosphere?.state?.nightFactor ?? 0);
      if (lastCamera.known) streetItems?.update(lastCamera.x, lastCamera.z);
      signFaces?.update();
      for (const set of junctionSets) {
        if (!lastCamera.known || Math.abs(set.origin.x - lastCamera.x) + Math.abs(set.origin.z - lastCamera.z) < SIGNAL_UPDATE_DISTANCE) set.junction.update(lightOf);
      }
    },
    /** Follows a new quality tier row (QUALITY_CHANGED): street item levels and shadow casters. */
    setQuality(tierRow) {
      streetItems?.setQuality(tierRow);
    },
    /** Where the signal lamps read their lights: the traffic system (signalLight(nodeId, phase)). */
    setSignalSource(source) {
      signalSource = source ?? null;
    },
    /** Stop and name faces now (draws, faces, streets painted). */
    signFaceStats: () => signFaces?.stats() ?? { draws: 0, stopFaces: 0, nameFaces: 0, streets: 0 },
    /** The far level's batches: [{name, pieces, vertices, capacity}] (one draw each). */
    farStats: () => farBatches.stats(),
    /** The modelled level's batches, as farStats. */
    nearStats: () => nearBatches.stats(),
    dispose() {
      farRoot.removeFromParent();
      farBatches.dispose();
      nearRoot.removeFromParent();
      nearBatches.dispose();
      materials.dispose();
      signFaces?.dispose();
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
