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
import { ISLAND_AIRFIELD_KIT, buildIslandAirfield } from './islandAirfield.js';
import { createIslandGarrison } from './islandGarrison.js';
import { FAR_VIEW, farViewBlend, farViewNearness, farViewOpticalDepth } from './islandFarView.js';

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
  let kitRequested = false;
  let kitSeen = '';
  let removeFrameHook = null;
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

  // The airfield's models (ground library, equipment kit, hangar, grass): asked for once the sea
  // opens; the airfield is rebuilt with whatever has arrived since it was last built.
  const kitKey = () => ISLAND_AIRFIELD_KIT.map((id) => (context.assets?.has?.(id) ? '1' : '0')).join('');
  function requestKit() {
    if (kitRequested) return;
    kitRequested = true;
    const assets = context.assets;
    const wanted = ISLAND_AIRFIELD_KIT.filter((id) => assets?.registry?.[id] && !assets.has(id));
    if (wanted.length > 0 && typeof assets.load === 'function') for (const id of wanted) Promise.resolve(assets.load([id])).catch(() => {});
  }

  function refreshAirfield() {
    if (!zone || !zone.airfield || kitKey() === kitSeen) return;
    const surfaces = context.systems.find('openWorldCity')?.surfaces ?? null;
    if (!surfaces) return;
    kitSeen = kitKey();
    zone.group.remove(zone.airfield.object3d);
    zone.airfield.dispose();
    zone.airfield = buildIslandAirfield(context, surfaces);
    zone.group.add(zone.airfield.object3d);
    root.updateMatrixWorld(true);
  }

  function open() {
    requestKit();
    root = new THREE.Group();
    root.name = 'norvast-island';
    root.position.set(CHART.x, 0, CHART.z);
    root.rotation.y = Math.PI / 2 - (CHART.stripHeading * Math.PI) / 180;
    // The far shape is a stand-in pulled toward the camera along the line of sight (islandFarView.js):
    // it writes depth, and that depth is what the frame's haze pass fades it by. It is therefore a
    // sibling of the root, placed every frame in world coordinates.
    const material = new THREE.MeshBasicMaterial({ color: ROCK_COLOUR, transparent: true, opacity: 0, fog: false });
    far = new THREE.Mesh(buildIslandSilhouetteGeometry(), material);
    far.name = 'norvast-island-far';
    far.visible = false;
    far.rotation.y = root.rotation.y;
    far.position.copy(root.position);
    root.updateMatrixWorld(true);
    context.view.layers.world.add(root);
    context.view.layers.world.add(far);
    const pipeline = context.systems.find('worldRenderPipeline');
    removeFrameHook = pipeline && typeof pipeline.addFrameHook === 'function' ? pipeline.addFrameHook(() => placeFar()) : null;
    farFade = 1;
    installGround();
    state = 'far';
  }

  function close() {
    unload();
    removeGround();
    if (removeFrameHook) removeFrameHook();
    removeFrameHook = null;
    if (root) {
      context.view.layers.world.remove(root);
      context.view.layers.world.remove(far);
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
      if (surfaces) {
        kitSeen = kitKey();
        building.airfield = buildIslandAirfield(context, surfaces);
      }
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

  /**
   * The far shape: its opacity, its colour and its place for this camera. Its contrast against the
   * horizon is a pure function of the distance and the hour's haze (islandFarView.js); the time
   * fade only covers a zone that loads late, inside the distance where the shape is opaque.
   */
  function drawFar(deltaSeconds, camera) {
    const target = state === 'loaded' ? 0 : 1;
    const stride = deltaSeconds / CROSS_FADE_SECONDS;
    farFade = target > farFade ? Math.min(target, farFade + stride) : Math.max(target, farFade - stride);
    placeFar(camera);
  }

  /** Runs again just before the frame is drawn, when the camera of the frame is final. */
  function placeFar(camera = context.view.camera.position) {
    if (!far) return;
    const distance = Math.hypot(camera.x - CHART.x, camera.z - CHART.z);
    const reach = Math.min(1, Math.max(0, (CHART.visibleFrom - distance) / 1500));
    // Over the loaded terrain the shape is as opaque as the distance says; with no terrain behind
    // it (not loaded yet) it stays whole.
    const blend = farViewBlend(distance);
    farOpacity = (blend + (1 - blend) * farFade) * reach * reach * (3 - 2 * reach);
    if (blend <= 0) farOpacity = 0;
    far.visible = farOpacity > 0.004;
    if (!far.visible) return;
    const air = context.atmosphere?.state;
    const density = air && air.fogDensity > 0 ? air.fogDensity : 0.0004;
    const hazeHeight = air && air.fogHeight > 0 ? air.fogHeight : 260;
    const height = Math.max(0, camera.y);
    farHaze = 1 - Math.exp(-farViewOpticalDepth(distance, height, density, hazeHeight));
    const nearness = farViewNearness(distance, height, density, hazeHeight);
    far.position.set(
      camera.x + (CHART.x - camera.x) * nearness, camera.y + (0 - camera.y) * nearness, camera.z + (CHART.z - camera.z) * nearness,
    );
    far.scale.setScalar(nearness);
    far.updateMatrixWorld(true);
    const sea = context.systems.find('openSea');
    const given = typeof sea?.hazeColourAt === 'function' ? sea.hazeColourAt(distance, haze) : null;
    if (!given) haze.copy(air?.fogColor ?? FALLBACK_HAZE);
    // A blue-grey darker than the horizon haze of the hour: never brighter than the haze, so it
    // cannot glow at night, and the haze pass fades it into that same haze.
    far.material.color.copy(haze).multiplyScalar(FAR_VIEW.shade);
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
    /** What the airfield is built of now: {baked, props, grass, scrub, colliders} (diagnostics). */
    get airfield() { return zone?.airfield ? { baked: zone.airfield.baked, ...zone.airfield.counts } : null; },

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
        refreshAirfield();
      }
    },

    dispose() {
      if (state !== 'off') close();
      context.work.removeSource(OWNER);
    },
  };
}
