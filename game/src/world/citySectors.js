// Streams the city around the focus in the plan's 128 m sectors: for each sector that comes
// within the quality tier's stream radius a job (sliced by the frame-budget queue, so no frame
// hitches) builds its ground and streets, writes its walking surface into a height raster,
// registers its static colliders with the physics system, then asks the city dressing
// (buildings, props, plants) for its part; a sector that leaves the radius gives everything
// back. The distant island stays drawn as one coarse mesh, and the sea's depth map is
// recaptured when the focus has moved far.
//
// The dressing contract (game/src/world/buildings/cityDressing.js, owned by the dressing
// programmer):
//   const dressing = await createCityDressing({ plan, assets, textures, physics, atmosphere, random, quality, streets, signals });
//   (streets = the street surface query: streets.surfaceAt(x, z).kind, streets.crossSection(segmentId);
//   signals = the shared signal clock: signals.signalLight(nodeId, phase), streets/signalClock.js)
//   const part = await dressing.buildSector({ id, bounds, lots, roads, intersections, specialAreas });
//   part = { object3d, colliders, lights, dispose }   // object3d is added here; the dressing has
//   registered its colliders (on physics.world) and lights itself, and dispose() takes them back
//   dressing.object3d (its street-item pools) is added to the world layer once; dressing.update()
//   runs every frame; dressing.setQuality(tierRow) follows QUALITY_CHANGED.

import { createSectorStreamer } from '../core/jobs/sectorStreamer.js';
import { JOB_PRIORITY } from '../core/jobs/frameBudgetJobQueue.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { createSurfaceLibrary } from '../render/textures/surfaceMaterials.js';
import { setTextureAnisotropy, setTextureDetailScale } from '../render/textures/textureQuality.js';
import { applyWetSurface } from '../render/weather/wetSurface.js';
import { buildDistantTerrainMesh, buildTerrainSectorMesh, createTerrainGroundMaterial } from './terrainMesh.js';
import { layOutJunction } from './streets/junctionLayout.js';
import { partitionRoadsBySector, roadCrossSection, sampleRoadCentreLines } from './streets/roadSampling.js';
import { buildStreetSector } from './streets/streetSectorBuilder.js';
import { createStreetMaterials, STREET_ASPHALT } from './streets/streetMaterials.js';
import { buildLaneMarkings, createLaneMarkingMaterials, LANE_MARKING_PAINTINGS } from './streets/laneMarkingBuilder.js';
import { createStreetSurfaceQuery } from './streets/streetSurfaceQuery.js';
import { createSignalClock } from './streets/signalClock.js';
import { createSectorMeshBatches } from './streets/sectorMeshBatches.js';
import { planWaterfrontPieces } from './waterfront/waterfrontLayout.js';
import { planLookoutTerracePieces } from './waterfront/lookoutTerraceLayout.js';
import { createLandmarkArrivals } from './landmarkArrivals.js';
import { buildWaterfrontSector, createWaterfrontMaterials, indexWaterfrontPieces, WATERFRONT_PAINTINGS } from './waterfront/waterfrontBuilder.js';
import { createSurfaceHeightRaster } from './streets/surfaceHeightRaster.js';
import { applyWetStreetReflection, createWetStreetReflection } from './streets/wetStreetReflection.js';
import { applyKerbPuddles } from './streets/kerbPuddles.js';

/** Whether game/src/world/buildings/cityDressing.js exists yet (a missing module would fail the page). */
const CITY_DRESSING_PRESENT = true;
/** Physics static-collider groups of the city start here (plus the sector's cell index). */
const COLLIDER_GROUP_BASE = 900000;
/** The sea's depth map is recaptured when the focus is this far from the last capture. */
const WATER_RECAPTURE_DISTANCE = 380;
const WATER_CAPTURE_HALF_SIZE = 760;
/** Painted in the surface library's worker while the plan is drawn up: the 1024 px asphalt
 * (about 40% of all the painting) and the waterfront's surfaces. [catalogue name, options] */
const WORKER_PAINTINGS = [STREET_ASPHALT, ...WATERFRONT_PAINTINGS];
/** Painted on this thread once the plan is made (the worker paints one surface at a time). */
const THREAD_PAINTINGS = [['pavingSlabs', { seed: 7 }], ['kerbStone', { seed: 3 }], ['grassDry', { seed: 9 }],
  ['grass', {}], ['sand', {}], ['dirt', {}], ['mud', {}], ['concrete', {}], ...LANE_MARKING_PAINTINGS];
/** Longest wait for the painting worker before what is left is painted on this thread, ms. */
const PAINTING_WAIT_MS = 4000;

/**
 * Starts painting the city's largest surfaces in the surface library's worker, so that painting
 * runs beside the plan's generation instead of after it (boot: openWorldCity's init). Call it
 * before generateCityPlan and hand the library to createCitySectorStreaming.
 * @param {Object} context The game context (quality tier: texture detail and anisotropy).
 */
export function startCitySurfaces(context) {
  setTextureDetailScale(context.quality.tier.textureDetail);
  setTextureAnisotropy(context.quality.tier.anisotropy);
  const surfaces = createSurfaceLibrary({ wetSurface: applyWetSurface, worker: true });
  for (const [name, options] of WORKER_PAINTINGS) surfaces.requestMaterial(name, options);
  return surfaces;
}

/**
 * Prepares the materials, road samples and the distant ground, then returns the streamer.
 * @param {Object} context The game context.
 * @param {Object} plan The city plan.
 * @param {(fraction: number, label: string) => void} progress
 */
export async function createCitySectorStreaming(context, plan, progress, prepared = null) {
  const { events, jobs, view, quality } = context;
  // How long each step of the city's set-up took, ms (streaming.initTimings, for the boot table).
  const initTimings = {};
  let stepStart = performance.now();
  const timed = (label) => {
    const now = performance.now();
    initTimings[label] = Math.round(now - stepStart);
    stepStart = now;
  };
  const grid = plan.sectors;
  const layer = view.layers.world;
  // The asphalt and the waterfront went to the painting worker before the plan was drawn up
  // (startCitySurfaces); the rest is painted here, then the worker's answers are awaited (a worker
  // that fails hands its work back to the queue, which step() paints here).
  const surfaces = prepared ?? startCitySurfaces(context);
  for (let i = 0; i < THREAD_PAINTINGS.length; i += 1) {
    progress(0.1 + (0.6 * i) / THREAD_PAINTINGS.length, `Painting ${THREAD_PAINTINGS[i][0]}`);
    surfaces.getTextures(THREAD_PAINTINGS[i][0], THREAD_PAINTINGS[i][1]);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  timed('paintings');
  // The worker's paintings land while the rest of the game loads and the first sectors are built
  // (their materials are requested: the maps fill in place); the boot's whenIdle waits for them
  // through pendingCount. A worker that fails hands its work back to the queue painted here.
  const paintingStart = performance.now();
  jobs.add(function* finishCityPaintings() {
    while (surfaces.step(4) > 0) {
      if (performance.now() - paintingStart > PAINTING_WAIT_MS) surfaces.drain();
      yield;
    }
    initTimings.workerPaintingsDoneAfter = Math.round(performance.now() - paintingStart);
    context.log?.info?.(`openWorldCity set-up ms: worker paintings done ${initTimings.workerPaintingsDoneAfter} ms after the thread's`);
  }, { priority: JOB_PRIORITY.LOW, owner: 'openWorldCity', label: 'city surfaces' });
  const materials = createStreetMaterials(surfaces);
  applyWetStreetReflection(materials.asphalt, 1);
  applyWetStreetReflection(materials.pavement, 0.55);
  applyKerbPuddles(materials.asphalt);
  const paintMaterials = createLaneMarkingMaterials(surfaces);
  const waterfrontMaterials = createWaterfrontMaterials(surfaces);
  const waterfront = indexWaterfrontPieces([...planWaterfrontPieces(plan), ...planLookoutTerracePieces(plan)], grid);
  const seabedAt = (x, z) => plan.heightAt(x, z);
  const groundMaterial = createTerrainGroundMaterial(surfaces);
  /** Plan lanes by `${segment}:${direction}:${index}`, for the arrows' turns. */
  const lanesByKey = new Map();
  for (const lane of plan.lanes) lanesByKey.set(`${lane.segment}:${lane.direction}:${lane.index}`, lane);
  timed('materialsAndWaterfront');

  progress(0.75, 'Laying out the streets');
  const lines = sampleRoadCentreLines(plan);
  const sections = plan.roads.segments.map(roadCrossSection);
  const piecesByCell = partitionRoadsBySector(lines, grid);
  const streetSurface = createStreetSurfaceQuery(plan, lines, sections);
  const signals = createSignalClock(plan.roads.nodes, () => context.simulation?.time ?? 0);
  const arrivals = createLandmarkArrivals(plan, events);
  timed('streetLayout');
  const distant = buildDistantTerrainMesh(plan, groundMaterial);
  layer.add(distant);
  timed('distantTerrain');
  // Streets, paint and waterfront in one set of batches (left out of the sea's depth capture:
  // decks and bridges over the water are not shore), the sectors' ground in another (captured).
  const batches = createSectorMeshBatches(layer);
  const groundBatches = createSectorMeshBatches(layer);
  // Wet streets mirror the city (streets/wetStreetReflection.js); the streets and the ground are
  // hidden while the mirror picture is drawn (the list is rebuilt only when a batch is added).
  const mirrorHidden = [];
  const hiddenFromMirror = () => {
    if (mirrorHidden.length !== batches.size + groundBatches.size + 1) {
      mirrorHidden.length = 0;
      mirrorHidden.push(distant, ...batches.objects(), ...groundBatches.objects());
    }
    return mirrorHidden;
  };
  const mirror = createWetStreetReflection({ renderer: view.renderer, camera: view.camera, hidden: hiddenFromMirror });
  mirror.setQuality(quality.tier);
  layer.add(mirror.object3d);
  timed('mirror');

  const physics = context.systems.find('physics');
  const canCollide = Boolean(physics && typeof physics.addStaticColliders === 'function');
  let dressing = null;
  if (CITY_DRESSING_PRESENT) {
    const { createCityDressing } = await import('./buildings/cityDressing.js');
    // The dressing registers its own colliders (on the collision world) and lights.
    dressing = await createCityDressing({
      plan, assets: context.assets, textures: surfaces, physics: physics?.world ?? null, atmosphere: context.atmosphere,
      random: context.random('cityDressing'), quality: quality.tier, streets: streetSurface, signals,
    });
    if (dressing.object3d) layer.add(dressing.object3d);
  }
  timed('dressing');

  /** Built sectors' height rasters by cell index. */
  const rasters = new Map();
  let building = 0;
  let dressingPending = 0;
  let waterCentre = null;

  function registerColliders(colliders, group) {
    if (!canCollide || colliders.length === 0) return null;
    return physics.addStaticColliders(colliders, { x: 0, y: 0, z: 0, group }, { group, surface: 'concrete' }) ?? group;
  }
  function releaseColliders(handle) {
    if (handle !== null && canCollide && typeof physics.removeStaticColliders === 'function') physics.removeStaticColliders(handle);
  }

  /** What the dressing gets for one sector: the plan's items whose centre lies in it. */
  function sectorContents(cell, bounds) {
    const inside = (x, z) => x >= bounds.minX && x < bounds.maxX && z >= bounds.minZ && z < bounds.maxZ;
    const cellData = grid.cells[cell];
    return {
      id: cell,
      bounds,
      lots: cellData.lots.map((id) => plan.lots[id]).filter((lot) => inside(lot.x, lot.z)),
      roads: cellData.segments.map((id) => plan.roads.segments[id]),
      intersections: cellData.nodes.map((id) => plan.roads.nodes[id]),
      specialAreas: plan.specialAreas.filter((area) => inside(area.x, area.z)),
    };
  }

  function activate(sector) {
    const column = sector.x;
    const row = sector.z;
    if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return null;
    const cell = row * grid.columns + column;
    const minX = grid.minX + column * grid.size;
    const minZ = grid.minZ + row * grid.size;
    const record = { cell, bounds: { minX, minZ, maxX: minX + grid.size, maxZ: minZ + grid.size }, batched: null, ground: null, colliders: null, dressing: null, released: false, built: false };
    building += 1;
    record.job = jobs.add(function* buildSector() {
      const raster = createSurfaceHeightRaster(minX, minZ, grid.size, 1);
      const ground = yield* buildTerrainSectorMesh(plan, { minX, minZ, size: grid.size }, groundMaterial);
      yield;
      const nodes = grid.cells[cell].nodes.map((id) => plan.roads.nodes[id]);
      const junctions = nodes.map((node) => layOutJunction(node, lines, sections));
      const pieces = piecesByCell.get(cell) ?? [];
      const streets = yield* buildStreetSector({ pieces, junctions, sections, materials, raster, groundAt: plan.heightAt });
      yield;
      const paint = yield* buildLaneMarkings({ pieces, nodes, junctions, planNodes: plan.roads.nodes, lanesByKey, sections, materials: paintMaterials });
      yield;
      const front = yield* buildWaterfrontSector({ pieces: waterfront.owned.get(cell) ?? [], overlapping: waterfront.overlapping.get(cell) ?? [], raster, materials: waterfrontMaterials, seabedAt });
      streets.colliders.push(...front.colliders);
      // Copied into the ring's batches (one draw per material for every sector); the sources go.
      record.batched = batches.add([streets.object3d, paint.object3d, front.object3d]);
      if (ground) record.ground = groundBatches.add([ground]);
      record.colliders = registerColliders(streets.colliders, COLLIDER_GROUP_BASE + cell);
      rasters.set(cell, raster);
      record.built = true;
      building -= 1;
      events.emit(GAME_EVENTS.CITY_SECTOR_ACTIVATED, { key: cell, sectorX: column, sectorZ: row });
      if (dressing) dressSector(record);
    }, { priority: Math.hypot(sector.centreX + grid.minX - lastX, sector.centreZ + grid.minZ - lastZ) < 200 ? JOB_PRIORITY.HIGH : JOB_PRIORITY.NORMAL, owner: 'openWorldCity', label: `city sector ${column},${row}` });
    return record;
  }

  async function dressSector(record) {
    dressingPending += 1;
    try {
      const part = await dressing.buildSector(sectorContents(record.cell, record.bounds));
      if (!part) return;
      if (record.released) {
        part.dispose?.();
        return;
      }
      record.dressing = part;
      if (part.object3d) layer.add(part.object3d);
    } finally {
      dressingPending -= 1;
    }
  }

  function deactivate(sector) {
    const record = sector.data;
    if (!record) return;
    record.released = true;
    if (!record.built) {
      record.job.cancel();
      building -= 1;
      return;
    }
    batches.remove(record.batched);
    if (record.ground) groundBatches.remove(record.ground);
    releaseColliders(record.colliders);
    rasters.delete(record.cell);
    const part = record.dressing;
    if (part) {
      part.object3d?.removeFromParent();
      part.dispose?.();
    }
    events.emit(GAME_EVENTS.CITY_SECTOR_DEACTIVATED, { key: record.cell, sectorX: sector.x, sectorZ: sector.z });
  }

  let lastX = 0;
  let lastZ = 0;
  const streamer = createSectorStreamer({ sectorSize: grid.size, activeRadius: quality.tier.streamRadius, releaseMargin: 96, activate, deactivate });
  context.log?.info?.(`openWorldCity set-up ms ${JSON.stringify(initTimings)}`);

  return {
    surfaces,
    materials,
    /** Milliseconds of each set-up step: paintings, materialsAndWaterfront, streetLayout, ... */
    initTimings,
    /** What the street is at any point, and each road's cross-section (streets/streetSurfaceQuery.js). */
    streetSurface,
    /** The shared signal clock of every signalled junction (streets/signalClock.js). */
    signals,
    /** Moves the focus; builds and releases sectors as needed. */
    update(focusX, focusZ) {
      lastX = focusX;
      lastZ = focusZ;
      arrivals.update(focusX, focusZ, context.simulation?.time ?? performance.now() / 1000);
      streamer.update(focusX - grid.minX, focusZ - grid.minZ);
      if (dressing && typeof dressing.update === 'function') dressing.update();
      const cell = Math.floor((focusZ - grid.minZ) / grid.size) * grid.columns + Math.floor((focusX - grid.minX) / grid.size);
      const streetY = rasters.get(cell)?.heightAt(focusX, focusZ);
      mirror.update(context.atmosphere?.state?.wetness ?? 0, Number.isFinite(streetY) ? streetY : context.focus?.position?.y);
      const atmosphere = context.atmosphere;
      if (building === 0 && atmosphere && typeof atmosphere.captureWaterDepth === 'function') {
        if (!waterCentre || Math.hypot(focusX - waterCentre.x, focusZ - waterCentre.z) > WATER_RECAPTURE_DISTANCE) {
          waterCentre = { x: focusX, z: focusZ };
          const h = WATER_CAPTURE_HALF_SIZE;
          atmosphere.captureWaterDepth({ minX: focusX - h, maxX: focusX + h, minZ: focusZ - h, maxZ: focusZ + h }, { hide: batches.objects() });
        }
      }
    },
    /** Height of the built walking surface, NaN where no built sector covers the point. */
    surfaceHeightAt(x, z) {
      const c = Math.floor((x - grid.minX) / grid.size);
      const r = Math.floor((z - grid.minZ) / grid.size);
      const raster = rasters.get(r * grid.columns + c);
      return raster ? raster.heightAt(x, z) : NaN;
    },
    /** The dressing's bench and bus-shelter seats within radius of x, z (none without a dressing). */
    seatsNear(x, z, radius = 30, out = []) {
      if (typeof dressing?.seatsNear === 'function') return dressing.seatsNear(x, z, radius, out);
      out.length = 0;
      return out;
    },
    /** The dressing's pavement obstacle circles ({x, z, radius, kind}) within radius of x, z. */
    obstaclesNear(x, z, radius = 30, out = []) {
      if (typeof dressing?.obstaclesNear === 'function') return dressing.obstaclesNear(x, z, radius, out);
      out.length = 0;
      return out;
    },
    /** Sectors still being built or dressed. */
    get pendingCount() {
      return building + dressingPending + streamer.waitingCount + surfaces.pending;
    },
    /** Follows a new quality tier row (QUALITY_CHANGED): stream radius and the dressing's levels. */
    setQuality(tierRow) {
      streamer.activeRadius = tierRow.streamRadius;
      dressing?.setQuality?.(tierRow);
      mirror.setQuality(tierRow);
    },
    get activeSectorCount() {
      return rasters.size;
    },
    /** The ring's surface and ground batches: [{ name, pieces, vertices, capacity }], for measuring. */
    batchStats: () => [...batches.stats(), ...groundBatches.stats()],
    dispose() {
      streamer.clear();
      batches.dispose();
      groundBatches.dispose();
      mirror.dispose();
      dressing?.object3d?.removeFromParent();
      dressing?.dispose?.();
      distant.removeFromParent();
      distant.geometry.dispose();
      groundMaterial.dispose();
      surfaces.dispose();
    },
  };
}
