// City dressing: everything that stands on the city plan's lots and pavements, built one sector
// at a time for the open-world city's streamer. Buildings come from the facade kits (baked
// Blender kits when loaded, the procedural fallback otherwise), merged per material per sector;
// street lamps, plants, junction controls, clutter, shop-front furniture, the port terminal and
// the beach furniture go to a few city-wide instanced pools. Each sector is one THREE.LOD: the
// modelled level near, facade cards and far plants beyond `farDistance` (sectorNearLevels.js).
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
import { layOutSectorClutter, layOutSectorStreetItems, streetObstacleCircles, TREE_PIT_HALF } from '../props/sectorStreetItems.js';
import { createTreePitSoil } from '../props/treePitSoil.js';
import { layOutSectorCables } from '../props/overheadCableLayout.js';
import { createOverheadCables } from '../props/overheadCables.js';
import { layOutSectorWear } from '../props/streetWearLayout.js';
import { buildSectorWear } from '../props/streetWearDecals.js';
import { buildSectorClutter } from '../props/sectorClutterDressing.js';
import { createSignFaces } from '../props/signFaceDressing.js';
import { createShopSigns } from '../props/shopSignDressing.js';
import { createWarningSignFaces } from '../props/warningSignFaces.js';
import { createPropSignFaces } from '../props/propSignFaces.js';
import { createObstacleIndex } from '../props/obstacleIndex.js';
import { createDuskLampSwitch, duskLampFactor, takeDuskSwitching } from '../props/duskLampRamp.js';
import { carriagewayTest, craneSitesOf, layOutQuayApron } from '../props/portTerminalLayout.js';
import { layOutBeach } from '../props/beachLayout.js';
import { layOutShopFronts } from '../props/shopFrontLayout.js';
import { insideQuad } from '../props/streetClutterLayout.js';
import { createBuildingShadowProxies } from './buildingShadowProxies.js';
import { createSectorNearLevels, disposeMeshes } from './sectorNearLevels.js';
import { layOutFrontYardPlanting } from '../vegetation/frontYardPlantingLayout.js';
import { layOutGroundCover } from '../vegetation/groundCoverLayout.js';
import { createStreetClearance } from '../props/streetClearance.js';
import { createSurfaceClearance } from '../props/surfaceClearance.js';
import { insideBounds, normaliseBounds } from '../props/streetFurnitureLayout.js';
import { buildSectorStreetDressing } from '../props/sectorStreetDressing.js';
import { createStreetItemPools, setFoliageNightFactor } from '../props/streetItemPools.js';
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
  // Their casting batches draw into the near cascades only (streetItemBatches.js).
  const streetItems = assets ? createStreetItemPools(assets, { lodBias, shadowCasterDistance: tier.shadowCasterDistance }) : null;
  // The painted faces of stop signs and street-name blades: two instanced quads for the city.
  const signFaces = streetItems ? createSignFaces({ assets, districtName: (id) => CITY_DISTRICTS[id]?.name ?? '' }) : null;
  if (signFaces) streetItems.object3d.add(signFaces.object3d);
  // Soil under the tree pits' grates (the grates pool with the clutter): one draw for the city.
  const pitSoil = streetItems ? createTreePitSoil({ textures }) : null;
  if (pitSoil) streetItems.object3d.add(pitSoil.object3d);
  // Overhead wires (pole to pole, drops, facade to facade in the crowded districts): one draw.
  const cables = streetItems ? createOverheadCables() : null;
  if (cables) streetItems.object3d.add(cables.object3d);
  // Neon and light-box shop signs over the shopping streets' shop fronts: one draw, no lights.
  const shopSigns = streetItems ? createShopSigns() : null;
  if (shopSigns) streetItems.object3d.add(shopSigns.object3d);
  // The painted words on the warning posts and plates (set_yard_clutter's blank bands): one draw.
  const warningFaces = streetItems ? createWarningSignFaces({ assets }) : null;
  if (warningFaces) streetItems.object3d.add(warningFaces.object3d);
  // Shop, shipping-line and advert names on the pooled props' sign anchors: one draw.
  const propSigns = streetItems ? createPropSignFaces({ assets }) : null;
  if (propSigns) streetItems.object3d.add(propSigns.object3d);
  // Building shadows: the modelled level in the near sun cascade, one box per building in the far
  // one (engine 08:38: 428-433 k shadow triangles per cascade against ~350 k).
  const shadowProxies = streetItems ? createBuildingShadowProxies() : null;
  if (shadowProxies) streetItems.object3d.add(shadowProxies.object3d);
  // Walkers' obstacle circles (trunks, pits, poles, signals, benches, shelters, clutter), by sector.
  const obstacles = createObstacleIndex();
  // Every built sector's wear decals (shown only near the camera).
  const wearSets = new Set();
  // The far level of every sector (facade cards, parapet bands, roofs) joins one BatchedMesh per
  // material: a sector's pieces go in while the camera sees its far level and out when its
  // modelled level shows, so the far city costs a few draws instead of a few per sector.
  const farRoot = new THREE.Group();
  farRoot.name = 'city_dressing_far';
  const farBatches = createSectorMeshBatches(farRoot);
  const nearRoot = new THREE.Group();
  nearRoot.name = 'city_dressing_near';
  const nearBatches = createSectorMeshBatches(nearRoot);
  // Under the pools root, which the city puts in the world layer when the dressing is made: in
  // the scene before the first frame (a ?shot= picture is often the very first frame drawn).
  if (streetItems) streetItems.object3d.add(farRoot, nearRoot);
  const levels = createSectorNearLevels({
    nearBatches,
    farDistance,
    viewCamera: options.viewCamera ?? null,
    afterLods(camera) {
      if (levels.lastCamera.known) streetItems?.update(levels.lastCamera.x, levels.lastCamera.z);
      for (const wear of wearSets) wear.setCamera(camera.position.x, camera.position.z);
    },
  });
  const { lastCamera, sectorLods } = levels;
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
  const districtAt = (x, z) => {
    const district = plan.districtAt?.(x, z);
    return typeof district === 'string' ? district : district?.id;
  };

  // The waterfront (quay apron with its cranes, the beach below the promenade) is laid out once
  // for the city; each sector takes the pieces inside its bounds.
  let waterfront = null;
  const waterfrontItems = () => {
    if (waterfront) return waterfront;
    waterfront = [];
    if (!assets) return waterfront;
    const areas = plan.specialAreas ?? [];
    if (assets.has('set_port')) {
      const onRoad = carriagewayTest(plan);
      const isWater = (x, z) => Boolean(plan.isWaterAt?.(x, z));
      const craneSites = craneSitesOf(plan.lots);
      for (const quay of areas) if (quay.kind === 'quay') waterfront.push(...layOutQuayApron(quay, { onRoad, isWater, craneSites }));
    }
    if (assets.has('set_beach') && plan.shoreDistanceAt && plan.surfaceAt) {
      // Nothing under or within 4 m of a pier.
      const piers = areas.filter((area) => area.kind === 'pier' && area.ring?.length === 8);
      const avoid = (x, z) => piers.some((pier) => insideQuad(pier.ring, x, z, -4));
      for (const promenade of areas) if (promenade.kind === 'promenade') waterfront.push(...layOutBeach(promenade, plan, { avoid }));
    }
    return waterfront;
  };

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
  /** Street and shop lamps switched by the dusk ramp (props/duskLampRamp.js), not the night factor. */
  const duskLamps = createDuskLampSwitch();
  /** Bench and bus-shelter seats of the built sectors (one array per sector). */
  const seatSets = new Set();
  const SIGNAL_UPDATE_DISTANCE = 340;

  async function buildSector(sector) {
    let lots = resolve(sector.lots, (id) => lotsById.get(id));
    const roads = resolve(sector.roads ?? sector.segments, (id) => plan.roads?.segments?.[id]);
    const bounds = sector.bounds ? normaliseBounds(sector.bounds) : boundsOfLots(lots);
    // A lot listed by several sectors is built by the one that holds its centre.
    if (sector.bounds) lots = lots.filter((lot) => insideBounds(bounds, lot.x, lot.z));
    const origin = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
    const inSector = (x, z) => !sector.bounds || insideBounds(bounds, x, z);

    const plans = [];
    for (const lot of lots) {
      const planned = planBuilding(lot, random.fork(`lot${lot.id}`), moodOf(lot.district));
      if (planned) plans.push(planned);
    }
    const assemblyOptions = (level) => ({
      levels: level,
      sliceMs,
      pause,
      kitFor,
      materialFor: materials.materialFor,
      cardMaterialFor: materials.cardMaterialFor,
      roofMaterial: materials.roofMaterial,
      origin,
    });
    // The far level (cards, roofs), lights, signs and colliders now; the modelled level only
    // while the sector is near (sectorNearLevels).
    const buildings = await assembleSectorBuildings(plans, assemblyOptions('far'));

    // Lamps, plants and junction controls only on pavement, verge or a built median.
    const { lamps, plants: planted, controls, nearby } = layOutSectorStreetItems({
      segments: roads,
      nodes: resolve(sector.intersections, (id) => nodes[id]),
      allSegments: plan.roads?.segments ?? [],
      allNodes: nodes,
      bounds: sector.bounds ? bounds : undefined,
      density: tier.propDensity ?? 1,
      vegetationDensity: tier.vegetationDensity ?? 1,
      clearance,
      buildings: plans,
    });
    const density = tier.clutterDensity ?? tier.propDensity ?? 1;
    // Street clutter (bins, benches, bags, dumpsters, fences, wall units) by district and the
    // shop-front furniture (awnings, café sets, boards, stalls), kept clear of the asphalt and of
    // the lamps, plants and signals; the port terminal's lot is stocked with set_port.
    const shopFronts = assets?.has?.('set_commerce') && density > 0 ? layOutShopFronts(buildings.shopSigns) : [];
    const clutter = assets ? layOutSectorClutter({
      segments: roads, buildings: plans, lotsById, bounds: sector.bounds ? bounds : undefined, clearance,
      fixed: nearby, density, extra: shopFronts,
      openLots: lots.filter((lot) => !plans.some((each) => each.lotId === lot.id)),
    }) : [];
    // The quay apron and the beach: laid out for the city, against the plan's water and roads.
    const shore = sector.bounds ? waterfrontItems().filter((item) => inSector(item.x, item.z)) : [];
    // Hedges and flowering shrubs in the homes' front yards (inside the lots, off the pavement).
    const yardPlants = assets && (tier.vegetationDensity ?? 1) > 0 ? layOutFrontYardPlanting(plans, lotsById) : [];
    const street = assets ? buildSectorStreetDressing({ lamps, plants: [...planted, ...yardPlants] }, { assets, heightAt: itemHeightAt }) : null;
    const junction = assets ? buildJunctionControls(controls, { assets, heightAt: itemHeightAt }) : null;
    const faceHandle = signFaces && junction?.placed.length ? signFaces.addSector(junction.placed) : null;
    const shopHandle = shopSigns && buildings.shopSigns?.length ? shopSigns.addSector(buildings.shopSigns) : null;
    const shadowHandle = shadowProxies && plans.length ? shadowProxies.addSector(plans) : null;
    const warnings = clutter.filter((item) => item.object === 'warning_post' || item.object === 'warning_plate')
      .map((item) => ({ ...item, y: (item.base ?? itemHeightAt(item.x, item.z)) + (item.y ?? 0) }));
    const warningHandle = warningFaces && warnings.length ? warningFaces.addSector(warnings) : null;
    // Wear decals (stains, cracks, covers, graffiti, posters, weeds): one draw per material, near only.
    const wearLayout = assets ? layOutSectorWear({
      segments: roads, buildings: plans, density, inside: inSector, districtOf: (lotId) => lotsById.get(lotId)?.district,
    }) : [];
    // Every tree on the pavement stands in a pit: a cast-iron grate square to the street (pooled
    // with the clutter, no collider) over dark soil (sectorStreetItems.placeTreePits).
    const pits = assets ? planted.filter((plant) => plant.pit) : [];
    const grates = pits.map((plant) => ({ assetId: 'set_sidewalk', object: 'tree_grate', x: plant.x, z: plant.z, rotationY: plant.pit.rotationY,
      kind: 'pit', halfX: TREE_PIT_HALF, halfZ: TREE_PIT_HALF, radius: TREE_PIT_HALF * Math.SQRT2, mounted: true, zone: 'pit' }));
    // Ground cover: creeping cover in every pit, weeds along kerbs and wall feet, at worn pole feet.
    const cover = assets?.has?.('ground_cover') && (tier.vegetationDensity ?? 1) > 0
      ? layOutGroundCover({ plants: planted, wear: wearLayout, lamps, districtAt }) : [];
    const placed = [...clutter, ...grates, ...shore, ...cover];
    const clutterParts = placed.length ? buildSectorClutter(placed, { assets, heightAt: itemHeightAt }) : null;
    const soilHandle = pitSoil && pits.length
      ? pitSoil.addSector(pits.map((plant) => ({ x: plant.x, y: itemHeightAt(plant.x, plant.z), z: plant.z, rotationY: plant.pit.rotationY })))
      : null;
    // Lamps, plants, junction controls and clutter all go to the city-wide pools.
    const pooled = [...(street?.instances ?? []), ...(junction?.instances ?? []), ...(clutterParts?.instances ?? [])];
    const streetHandle = streetItems && pooled.length ? streetItems.addSector(pooled) : null;
    const propSignHandle = propSigns && pooled.length ? propSigns.addSector(pooled) : null;
    const junctionSet = junction?.instances.length && streetHandle ? { junction, origin } : null;
    if (junctionSet) {
      junction.attach(streetHandle, street?.instances.length ?? 0);
      junctionSets.add(junctionSet);
      junction.update(lightOf);
    }
    const seats = clutterParts?.seats ?? [];
    if (seats.length) seatSets.add(seats);
    const obstacleHandle = obstacles.add(streetObstacleCircles({ lamps, plants: planted, controls: controls.filter((item) => item.own), clutter: [...clutter, ...shore] }));
    // Wires: ends on poles stand on the ground there, ends on facades on the building's pad.
    const spans = cables ? layOutSectorCables({ segments: roads, poles: lamps, buildings: plans, density, inside: inSector }) : [];
    for (const span of spans) {
      span.ay += span.aBase ?? itemHeightAt(span.ax, span.az);
      span.by += span.bBase ?? itemHeightAt(span.bx, span.bz);
    }
    const cableHandle = spans.length ? cables.addSector(spans) : null;
    const wear = wearLayout.length ? buildSectorWear(wearLayout, { assets, heightAt: itemHeightAt, bounds }) : null;
    if (wear) {
      wearSets.add(wear);
      if (lastCamera.known) wear.setCamera(lastCamera.x, lastCamera.z);
      streetItems?.object3d.add(wear.object3d);
    }

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
      if (lod.parent) levels.installViewHook(lod);
    };
    sectorLods.add(lod);
    lod.addLevel(near, 0, 0.05);
    lod.addLevel(far, farDistance, 0.05);
    lod.updateMatrixWorld(true);
    const detail = levels.createNearDetail(lod, near, far, origin,
      () => assembleSectorBuildings(plans, assemblyOptions('near')),
      () => assembleSectorBuildingsNow(plans, assemblyOptions('near')), onView, (nearShowing) => showFar(!nearShowing));
    // A sector streamed in close to the camera gets its modelled level before it is handed over.
    if (lastCamera.known && Math.hypot(lastCamera.x - origin.x, lastCamera.z - origin.z) < levels.nearBuildDistance) await detail.request();

    const colliders = [...buildings.colliders, ...(street?.colliders ?? []), ...(junction?.colliders ?? []), ...(clutterParts?.colliders ?? [])];
    const lightDescriptions = [...buildings.lights, ...(street?.lights ?? [])];
    const staticHandles = addColliders(physics, colliders, sector.id);
    // Lamps come on by the sun's height (from about 18:45, all on by 19:05), not the night factor.
    const rampTaken = new Set(takeDuskSwitching(lightDescriptions));
    const lightHandles = atmosphere?.addLight ? lightDescriptions.map((light) => atmosphere.addLight(light)) : [];
    const rampEntries = lightHandles.filter((handle, index) => handle && rampTaken.has(lightDescriptions[index]))
      .map((handle) => duskLamps.add(handle, handle.intensity));
    const countOf = (list, test) => list.reduce((total, item) => total + (test(item) ? 1 : 0), 0);

    return {
      object3d: lod,
      colliders,
      lights: lightDescriptions,
      signs: buildings.signs,
      seats,
      stats: {
        ...buildings.stats, lamps: lamps.length, plants: planted.length, junctionObjects: controls.length, clutter: clutter.length, seats: seats.length,
        shopFronts: countOf(clutter, (item) => item.zone === 'shop'), port: countOf([...clutter, ...shore], (item) => item.assetId === 'set_port'),
        beach: countOf(shore, (item) => item.zone === 'beach'), groundCover: cover.length,
        get nearPieces() { return countDraws(detail.holder); }, farPieces: countDraws(farHolder),
      },
      /** Builds the modelled level now (a preview or a capture that wants it at once). */
      buildNear: () => detail.buildNow(),
      dispose() {
        detail.dispose();
        lod.removeFromParent();
        sectorLods.delete(lod);
        lod.traverse((node) => { if (node.isMesh && !node.isInstancedMesh) node.geometry.dispose(); });
        showFar(false);
        disposeMeshes(farHolder);
        streetHandle?.dispose();
        faceHandle?.dispose();
        shopHandle?.dispose();
        shadowHandle?.dispose();
        warningHandle?.dispose();
        propSignHandle?.dispose();
        if (junctionSet) junctionSets.delete(junctionSet);
        seatSets.delete(seats);
        obstacleHandle.dispose();
        cableHandle?.dispose();
        if (wear) {
          wearSets.delete(wear);
          wear.dispose();
        }
        soilHandle?.dispose();
        for (const handle of staticHandles) physics.removeStatic?.(handle);
        for (const entry of rampEntries) duskLamps.remove(entry);
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
     * Seats (benches, bus shelters, café chairs) within `radius` metres of x, z: {x, y, z, rotationY,
     * heading (compass, the way the sitter faces), object}. Pass `out` to reuse an array.
     */
    seatsNear(x, z, radius = 30, out = []) {
      out.length = 0;
      const limit = radius * radius;
      for (const seats of seatSets) for (const seat of seats) if ((seat.x - x) ** 2 + (seat.z - z) ** 2 <= limit) out.push(seat);
      return out;
    },
    /**
     * Obstacle circles of the street items within `radius` metres of x, z, for walkers' paths:
     * {x, z, radius, kind ('trunk' | 'pole' | 'signal' | 'shelter' | 'clutter')}, found by sector
     * and a 16 m grid (props/obstacleIndex.js). Pass `out` to reuse an array.
     */
    obstaclesNear: (x, z, radius = 30, out = []) => obstacles.near(x, z, radius, out),
    /** Obstacle circles held for the built sectors. */
    obstacleCount: () => obstacles.count(),
    /** The game's view camera (context.view.camera): only it moves levels, pools and wear. */
    setViewCamera: (camera) => levels.setViewCamera(camera),
    /** Overhead cable spans held now (one draw call). */
    cableCount: () => cables?.count ?? 0,
    /** Follows the atmosphere's night factor (lit windows) and the signals; once per frame. */
    update() {
      // The view hook goes on the scene before the first frame is drawn (systems update first).
      if (!levels.hooked()) {
        const anchor = streetItems?.object3d.parent ? streetItems.object3d : sectorLods.values().next().value;
        if (anchor) levels.installViewHook(anchor);
      }
      const night = atmosphere?.state?.nightFactor ?? 0;
      // Lamps, shop signs and neon by the dusk ramp (on from about 19:00 while the sky is still
      // coloured); lit windows come up part way with it; foliage keeps the night factor.
      // A staged still may cap the ramp (atmosphere.lookOverride's duskLampCap, opt-in; null in play).
      const cap = atmosphere?.state?.duskLampCap;
      const ramp = duskLampFactor(atmosphere?.state?.sunDirection?.y, night);
      const lamps = Number.isFinite(cap) ? Math.min(ramp, Math.max(0, cap)) : ramp;
      duskLamps.update(lamps);
      materials.setNightFactor(Math.max(night, 0.6 * lamps));
      setFoliageNightFactor(night);
      if (lastCamera.known) streetItems?.update(lastCamera.x, lastCamera.z);
      signFaces?.update();
      shopSigns?.setNightFactor(lamps);
      shopSigns?.update();
      warningFaces?.update();
      propSigns?.setNightFactor(lamps);
      propSigns?.update();
      if (shadowProxies) {
        shadowProxies.update();
        for (const batched of nearRoot.children) shadowProxies.keepToNearCascades(batched);
      }
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
    /** Lit shop signs now: {signs, draws, cells}. */
    shopSignStats: () => shopSigns?.stats() ?? { signs: 0, draws: 0, cells: 0 },
    /** Far-cascade building boxes now: {boxes, triangles}. */
    shadowProxyStats: () => shadowProxies?.stats() ?? { boxes: 0, triangles: 0 },
    /** The far level's batches: [{name, pieces, vertices, capacity}] (one draw each). */
    farStats: () => farBatches.stats(),
    /** The modelled level's batches, as farStats. */
    nearStats: () => nearBatches.stats(),
    dispose() {
      levels.removeViewHook();
      farRoot.removeFromParent();
      farBatches.dispose();
      nearRoot.removeFromParent();
      nearBatches.dispose();
      materials.dispose();
      signFaces?.dispose();
      shopSigns?.dispose();
      shadowProxies?.dispose();
      warningFaces?.dispose();
      propSigns?.dispose();
      pitSoil?.dispose();
      cables?.dispose();
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

function countDraws(group) {
  let draws = 0;
  group.traverse((node) => { if (node.isMesh && (node.count ?? 1) > 0) draws += 1; });
  return draws;
}
