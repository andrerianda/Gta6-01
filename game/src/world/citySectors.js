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
//   const dressing = await createCityDressing({ plan, assets, textures, physics, atmosphere, random, quality });
//   const part = await dressing.buildSector({ id, bounds, lots, roads, intersections, specialAreas });
//   part = { object3d, colliders, lights, dispose }   // added here, removed when the sector leaves

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
import { createStreetMaterials } from './streets/streetMaterials.js';
import { createSurfaceHeightRaster } from './streets/surfaceHeightRaster.js';

/** Whether game/src/world/buildings/cityDressing.js exists yet (a missing module would fail the page). */
const CITY_DRESSING_PRESENT = false;
/** Physics static-collider groups of the city start here (plus the sector's cell index). */
const COLLIDER_GROUP_BASE = 900000;
/** The sea's depth map is recaptured when the focus is this far from the last capture. */
const WATER_RECAPTURE_DISTANCE = 380;
const WATER_CAPTURE_HALF_SIZE = 760;

/**
 * Prepares the materials, road samples and the distant ground, then returns the streamer.
 * @param {Object} context The game context.
 * @param {Object} plan The city plan.
 * @param {(fraction: number, label: string) => void} progress
 */
export async function createCitySectorStreaming(context, plan, progress) {
  const { events, jobs, view, quality } = context;
  const grid = plan.sectors;
  const layer = view.layers.world;
  setTextureDetailScale(quality.tier.textureDetail);
  setTextureAnisotropy(quality.tier.anisotropy);
  const surfaces = createSurfaceLibrary({ wetSurface: applyWetSurface });
  const paintings = [['asphalt', { seed: 11 }], ['pavingSlabs', { seed: 7 }], ['kerbStone', { seed: 3 }], ['grassDry', { seed: 9 }],
    ['grass', {}], ['sand', {}], ['dirt', {}], ['mud', {}], ['concrete', {}]];
  for (let i = 0; i < paintings.length; i += 1) {
    progress(0.1 + (0.6 * i) / paintings.length, `Painting ${paintings[i][0]}`);
    surfaces.getTextures(paintings[i][0], paintings[i][1]);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const materials = createStreetMaterials(surfaces);
  const groundMaterial = createTerrainGroundMaterial(surfaces);

  progress(0.75, 'Laying out the streets');
  const lines = sampleRoadCentreLines(plan);
  const sections = plan.roads.segments.map(roadCrossSection);
  const piecesByCell = partitionRoadsBySector(lines, grid);
  const distant = buildDistantTerrainMesh(plan, groundMaterial);
  layer.add(distant);

  const physics = context.systems.find('physics');
  const canCollide = Boolean(physics && typeof physics.addStaticColliders === 'function');
  let dressing = null;
  if (CITY_DRESSING_PRESENT) {
    const { createCityDressing } = await import('./buildings/cityDressing.js');
    dressing = await createCityDressing({
      plan, assets: context.assets, textures: surfaces, physics, atmosphere: context.atmosphere,
      random: context.random('cityDressing'), quality,
    });
  }

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
    const record = { cell, bounds: { minX, minZ, maxX: minX + grid.size, maxZ: minZ + grid.size }, parts: [], geometries: [], colliders: null, dressing: null, released: false, built: false };
    building += 1;
    record.job = jobs.add(function* buildSector() {
      const raster = createSurfaceHeightRaster(minX, minZ, grid.size, 1);
      const ground = buildTerrainSectorMesh(plan, { minX, minZ, size: grid.size }, groundMaterial);
      yield;
      const junctions = grid.cells[cell].nodes.map((id) => layOutJunction(plan.roads.nodes[id], lines, sections));
      const streets = buildStreetSector({ pieces: piecesByCell.get(cell) ?? [], junctions, sections, materials, raster, groundAt: plan.heightAt });
      yield;
      if (ground) {
        record.parts.push(ground);
        record.geometries.push(ground.geometry);
      }
      record.parts.push(streets.object3d);
      record.geometries.push(...streets.geometries);
      for (const part of record.parts) layer.add(part);
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
      part.colliderHandle = registerColliders(part.colliders ?? [], COLLIDER_GROUP_BASE + 500000 + record.cell);
      part.lightHandles = (part.lights ?? []).map((light) => context.atmosphere.addLight(light));
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
    for (const part of record.parts) part.removeFromParent();
    for (const geometry of record.geometries) geometry.dispose();
    releaseColliders(record.colliders);
    rasters.delete(record.cell);
    const part = record.dressing;
    if (part) {
      part.object3d?.removeFromParent();
      releaseColliders(part.colliderHandle ?? null);
      for (const light of part.lightHandles ?? []) context.atmosphere.removeLight(light);
      part.dispose?.();
    }
    events.emit(GAME_EVENTS.CITY_SECTOR_DEACTIVATED, { key: record.cell, sectorX: sector.x, sectorZ: sector.z });
  }

  let lastX = 0;
  let lastZ = 0;
  const streamer = createSectorStreamer({ sectorSize: grid.size, activeRadius: quality.tier.streamRadius, releaseMargin: 96, activate, deactivate });

  return {
    surfaces,
    materials,
    /** Moves the focus; builds and releases sectors as needed. */
    update(focusX, focusZ) {
      lastX = focusX;
      lastZ = focusZ;
      streamer.update(focusX - grid.minX, focusZ - grid.minZ);
      const atmosphere = context.atmosphere;
      if (building === 0 && atmosphere && typeof atmosphere.captureWaterDepth === 'function') {
        if (!waterCentre || Math.hypot(focusX - waterCentre.x, focusZ - waterCentre.z) > WATER_RECAPTURE_DISTANCE) {
          waterCentre = { x: focusX, z: focusZ };
          const h = WATER_CAPTURE_HALF_SIZE;
          atmosphere.captureWaterDepth({ minX: focusX - h, maxX: focusX + h, minZ: focusZ - h, maxZ: focusZ + h });
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
    /** Sectors still being built or dressed. */
    get pendingCount() {
      return building + dressingPending + streamer.waitingCount;
    },
    /** Follows a new quality tier's stream radius. */
    setStreamRadius(radius) {
      streamer.activeRadius = radius;
    },
    get activeSectorCount() {
      return rasters.size;
    },
    dispose() {
      streamer.clear();
      distant.removeFromParent();
      distant.geometry.dispose();
      groundMaterial.dispose();
      surfaces.dispose();
    },
  };
}
