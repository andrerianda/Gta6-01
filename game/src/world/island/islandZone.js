// The Norvast island as a streamed zone. While the world flag sea.open is false nothing of it
// exists. With the flag set: beyond the chart's stream radius only the far silhouette is drawn,
// real geometry at the real place, faint blue-grey in the horizon haze; inside it the ground
// (height grid, tiles in three levels of detail), the airfield and the garrison load through the
// job queue and the silhouette cross-fades out. The island's ground is given to everything that
// asks the city for the ground (physics, wheels, feet, the crowd) while the sea is open.
import * as THREE from 'three';
import { GAME_EVENTS } from '../../core/events/gameEvents.js';
import { GAME_COMMANDS } from '../../core/events/gameCommands.js';
import { JOB_PRIORITY } from '../../core/jobs/frameBudgetJobQueue.js';
import { WORLD_FLAGS } from '../../core/state/worldFlags.js';
import { SEA_AND_AIRSPACE_CHART } from '../../catalog/seaAndAirspaceChart.js';
import { NORVAST_ISLAND_SHAPE as SHAPE } from './norvastIslandShape.js';
import { createIslandHeightGrid } from './islandHeightGrid.js';
import {
  ISLAND_LOD_STRIDES, ISLAND_TILE_CELLS, buildIslandSilhouetteGeometry, buildIslandTileGeometry, createIslandTerrainMaterial,
} from './islandTerrainMesh.js';
import { buildIslandAirfield } from './islandAirfield.js';
import { createIslandGarrison } from './islandGarrison.js';

const CHART = SEA_AND_AIRSPACE_CHART.norvastIsland;
const OWNER = 'norvastIsland';
const UNLOAD_MARGIN = 250;
const CROSS_FADE_SECONDS = 1.6;
/** A tile nearer than this (metres from the camera) is drawn at level 0, 1, else 2. */
const LOD_DISTANCES = Object.freeze([560, 1350]);
const ROCK_COLOUR = new THREE.Color(0.115, 0.135, 0.165);
const FALLBACK_HAZE = new THREE.Color(0.62, 0.7, 0.8);

/**
 * Creates the island zone.
 * @param {import('../../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {{update: (deltaSeconds: number) => void, dispose: () => void, groundHeightAt: (x: number, z: number) => number | null,
 *   readonly loaded: boolean, readonly visible: boolean, readonly state: string, readonly farOpacity: number,
 *   readonly garrison: {sentries: number, vehicles: number}, readonly realHangar: boolean}}
 */
export function createNorvastIslandZone(context) {
  const grid = createIslandHeightGrid();
  const garrison = createIslandGarrison(context);
  const haze = new THREE.Color();
  const groundHooks = [];
  /** 'off' | 'far' | 'loading' | 'loaded' */
  let state = 'off';
  let root = null;
  let far = null;
  let farFade = 1;
  let farOpacity = 0;
  let farHaze = 0;
  let zone = null;
  let loadJob = null;
  let generation = 0;
  let pendingJobs = 0;
  let lodSeconds = 0;
  let staged = false;
  const radiusSquared = CHART.radius * CHART.radius;
  const axisU = SHAPE.axisU, axisV = SHAPE.axisV;

  /** The island's ground at a world place; null beyond its radius or while the sea is closed. */
  function groundHeightAt(x, z) {
    if (state === 'off') return null;
    const dx = x - CHART.x, dz = z - CHART.z;
    if (dx * dx + dz * dz > radiusSquared) return null;
    return grid.heightLocal(dx * axisU.x + dz * axisU.z, dx * axisV.x + dz * axisV.z);
  }

  // The city answers "where is the ground" for the physics, the wheels, the feet and the crowd;
  // while the sea is open its two ground queries answer with the island inside the island's radius.
  function installGround() {
    const city = context.systems.find('openWorldCity');
    if (!city) return;
    for (const name of ['groundHeightAt', 'terrainHeightAt']) {
      const original = city[name];
      if (typeof original !== 'function') continue;
      const wrapper = (x, z) => {
        const dx = x - CHART.x, dz = z - CHART.z;
        if (dx * dx + dz * dz > radiusSquared) return original(x, z);
        return grid.heightLocal(dx * axisU.x + dz * axisU.z, dx * axisV.x + dz * axisV.z);
      };
      city[name] = wrapper;
      groundHooks.push({ city, name, original, wrapper });
    }
  }

  function removeGround() {
    for (const hook of groundHooks) if (hook.city[hook.name] === hook.wrapper) hook.city[hook.name] = hook.original;
    groundHooks.length = 0;
  }

  function open() {
    root = new THREE.Group();
    root.name = 'norvast-island';
    root.position.set(CHART.x, 0, CHART.z);
    root.rotation.y = Math.PI / 2 - (CHART.stripHeading * Math.PI) / 180;
    // It writes depth like the zone's own ground, so the frame's depth-based haze fades both alike
    // (measured: without depth the sea's depth behind it is hazed instead, and the shape is lost).
    const material = new THREE.MeshBasicMaterial({ color: ROCK_COLOUR, transparent: true, opacity: 0, fog: false });
    far = new THREE.Mesh(buildIslandSilhouetteGeometry(), material);
    far.name = 'norvast-island-far';
    far.visible = false;
    root.add(far);
    root.updateMatrixWorld(true);
    context.view.layers.world.add(root);
    farFade = 1;
    installGround();
    state = 'far';
  }

  function close() {
    unload();
    removeGround();
    if (root) {
      context.view.layers.world.remove(root);
      far.geometry.dispose();
      far.material.dispose();
    }
    root = null;
    far = null;
    farOpacity = 0;
    state = 'off';
  }

  function track(job) {
    pendingJobs += 1;
    const settle = () => { pendingJobs -= 1; };
    job.done.then(settle, settle);
    return job;
  }

  function startLoading() {
    state = 'loading';
    const mine = ++generation;
    const surfaces = context.systems.find('openWorldCity')?.surfaces ?? null;
    const building = { group: new THREE.Group(), tiles: [], material: null, airfield: null };
    building.group.name = 'norvast-island-zone';
    loadJob = track(context.jobs.add(function* loadIsland() {
      if (!grid.ready) yield* grid.bake(4);
      building.material = surfaces
        ? createIslandTerrainMaterial(surfaces)
        : new THREE.MeshStandardMaterial({ color: 0x4a4a4c, roughness: 1 });
      const coarse = ISLAND_LOD_STRIDES.length - 1;
      const tileCols = (grid.cols - 1) / ISLAND_TILE_CELLS, tileRows = (grid.rows - 1) / ISLAND_TILE_CELLS;
      for (let tileRow = 0; tileRow < tileRows; tileRow += 1) {
        for (let tileCol = 0; tileCol < tileCols; tileCol += 1) {
          const geometry = buildIslandTileGeometry(grid, tileCol, tileRow, ISLAND_LOD_STRIDES[coarse]);
          yield;
          if (!geometry) continue;
          const mesh = new THREE.Mesh(geometry, building.material);
          mesh.receiveShadow = true;
          mesh.castShadow = true;
          building.group.add(mesh);
          const centre = SHAPE.toWorld(geometry.boundingSphere.center.x, geometry.boundingSphere.center.z);
          const geometries = [null, null, null];
          geometries[coarse] = geometry;
          building.tiles.push({
            tileCol, tileRow, mesh, geometries, lod: coarse, job: null,
            x: centre.x, y: geometry.boundingSphere.center.y, z: centre.z, reach: geometry.boundingSphere.radius,
          });
        }
      }
      if (surfaces) building.airfield = buildIslandAirfield(context, surfaces);
      if (building.airfield) building.group.add(building.airfield.object3d);
      yield;
    }, { priority: JOB_PRIORITY.HIGH, owner: OWNER, label: 'norvast island' }));
    loadJob.done.then(() => {
      if (mine !== generation || state !== 'loading') { disposeZone(building); return; }
      zone = building;
      root.add(zone.group);
      root.updateMatrixWorld(true);
      loadJob = null;
      state = 'loaded';
      lodSeconds = 1;
      context.events.emit(GAME_EVENTS.SEA_ZONE_LOADED, { zoneId: CHART.id });
    }, (error) => context.log.warn?.(`norvastIsland: the zone did not load (${error?.message ?? error})`));
  }

  function disposeZone(built) {
    for (const tile of built.tiles) {
      if (tile.job) tile.job.cancel();
      for (const geometry of tile.geometries) if (geometry) geometry.dispose();
    }
    if (built.material) built.material.dispose();
    if (built.airfield) built.airfield.dispose();
  }

  function unload() {
    generation += 1;
    if (loadJob) loadJob.cancel();
    loadJob = null;
    const wasLoaded = state === 'loaded';
    if (zone) {
      root.remove(zone.group);
      disposeZone(zone);
      zone = null;
    }
    garrison.dismiss();
    if (state !== 'off') state = 'far';
    if (wasLoaded) context.events.emit(GAME_EVENTS.SEA_ZONE_UNLOADED, { zoneId: CHART.id });
  }

  /** Picks each tile's level of detail by the camera's distance; finer tiles are cut in jobs. */
  function chooseDetail(camera) {
    const mine = generation;
    for (const tile of zone.tiles) {
      const distance = Math.hypot(camera.x - tile.x, camera.y - tile.y, camera.z - tile.z) - tile.reach;
      const wanted = distance < LOD_DISTANCES[0] ? 0 : distance < LOD_DISTANCES[1] ? 1 : 2;
      if (wanted === tile.lod) continue;
      const ready = tile.geometries[wanted];
      if (ready) {
        tile.mesh.geometry = ready;
        tile.lod = wanted;
      } else if (!tile.job) {
        tile.job = track(context.jobs.add(
          () => buildIslandTileGeometry(grid, tile.tileCol, tile.tileRow, ISLAND_LOD_STRIDES[wanted]),
          { priority: wanted === 0 ? JOB_PRIORITY.HIGH : JOB_PRIORITY.NORMAL, owner: OWNER, label: `island tile ${tile.tileCol},${tile.tileRow} lod ${wanted}` },
        ));
        tile.job.done.then((geometry) => {
          tile.job = null;
          if (!geometry) return;
          if (mine !== generation) { geometry.dispose(); return; }
          tile.geometries[wanted] = geometry;
        }, () => { tile.job = null; });
      }
    }
  }

  function drawFar(deltaSeconds, camera) {
    const target = state === 'loaded' ? 0 : 1;
    const stride = deltaSeconds / CROSS_FADE_SECONDS;
    farFade = target > farFade ? Math.min(target, farFade + stride) : Math.max(target, farFade - stride);
    const distance = Math.hypot(camera.x - CHART.x, camera.z - CHART.z);
    const reach = Math.min(1, Math.max(0, (CHART.visibleFrom - distance) / 1500));
    farOpacity = farFade * reach * reach * (3 - 2 * reach);
    far.visible = farOpacity > 0.004;
    if (!far.visible) return;
    const sea = context.systems.find('openSea');
    let amount = typeof sea?.hazeAmountAt === 'function' ? sea.hazeAmountAt(distance, camera.y) : NaN;
    // Never clearer than the island's own estimate, never quite gone: a faint shape at 14 km.
    amount = Math.min(0.955, Math.max(Number.isFinite(amount) ? amount : 0, 1 - Math.exp(-distance / 4600)));
    farHaze = amount;
    const given = typeof sea?.hazeColourAt === 'function' ? sea.hazeColourAt(distance, haze) : null;
    if (!given) haze.copy(context.atmosphere?.state?.fogColor ?? FALLBACK_HAZE);
    // Half of the haze is mixed in here (the unlit silhouette takes the horizon's blue-grey); the
    // frame's own haze pass does the rest of the fading with distance.
    far.material.color.copy(ROCK_COLOUR).lerp(haze, amount * 0.5);
    far.material.opacity = farOpacity;
  }

  function stage() {
    staged = true;
    if (context.launch.stage !== 'island' || context.launch.aircraft) return;
    const at = SHAPE.handoverPoint;
    try {
      context.commands.send(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: at.x, y: at.y, z: at.z }, heading: 0 });
    } catch (error) {
      context.log.debug?.(`norvastIsland: the lead was not staged (${error.message})`);
    }
  }

  context.work.addSource(OWNER, () => pendingJobs);

  return {
    groundHeightAt,
    get loaded() { return state === 'loaded'; },
    get visible() { return state === 'loaded' || farOpacity > 0.004; },
    get state() { return state; },
    get farOpacity() { return farOpacity; },
    get farHaze() { return farHaze; },
    get garrison() { return garrison; },
    get realHangar() { return Boolean(zone?.airfield?.hasRealHangar); },

    update(deltaSeconds) {
      if (!context.flags.get(WORLD_FLAGS.SEA_OPEN)) {
        if (state !== 'off') close();
        return;
      }
      if (state === 'off') open();
      if (!staged) stage();
      const focus = context.focus.position;
      const focusDistance = Math.hypot(focus.x - CHART.x, focus.z - CHART.z);
      if (state === 'far' && focusDistance < CHART.streamRadius) startLoading();
      else if (state !== 'far' && focusDistance > CHART.streamRadius + UNLOAD_MARGIN) unload();
      const camera = context.view.camera.position;
      drawFar(deltaSeconds, camera);
      if (state !== 'loaded') return;
      garrison.update(focusDistance);
      lodSeconds += deltaSeconds;
      if (lodSeconds >= 0.3) {
        lodSeconds = 0;
        chooseDetail(camera);
      }
    },

    dispose() {
      if (state !== 'off') close();
      context.work.removeSource(OWNER);
    },
  };
}
