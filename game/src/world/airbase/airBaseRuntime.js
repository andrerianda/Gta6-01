// The running Base Aérea Punta Garza: builds the base's ground, structures, dressing and lamps when
// the camera's focus comes within reach and drops them again far away (so the base costs nothing
// from downtown), swaps the stand-ins for the kit's models as soon as the asset library has them,
// keeps the vehicles, follows the hour (lamp glass and floodlights on from dusk to dawn) and the
// world flags (the alarm; officer access opens the gate).
//
//   const base = createAirBaseRuntime(context);
//   base.update(dt);  base.setGateOpen(true);  base.layout.runway;  base.stats();  base.dispose();
//
// Staging for pictures: `?stage=apron` and `?stage=flightline` put the lead on the apron at
// layout.photoSpots (with base.officerAccess set, so the guards leave him be).

import { GAME_COMMANDS } from '../../core/events/gameCommands.js';
import { GAME_EVENTS } from '../../core/events/gameEvents.js';
import { WORLD_FLAGS } from '../../core/state/worldFlags.js';
import { buildAirBaseDressing } from './airBaseDressing.js';
import { planAirBaseLayout } from './airBaseLayout.js';
import { createAirBaseLights } from './airBaseLights.js';
import { buildAirBaseParkedAircraft } from './airBaseParkedAircraft.js';
import { buildAirBaseStructures } from './airBaseStructures.js';
import { buildAirBaseSurfaces } from './airBaseSurfaces.js';
import { createAirBaseVehicles } from './airBaseVehicles.js';
import { GROUND_ASSET, GROUND_KIT_ASSET } from './groundKit.js';

/** Metres from the base's centre to the focus: built inside `build`, dropped beyond `drop`. */
const REACH = Object.freeze({ build: 2300, drop: 2700 });
/**
 * The models the base is built from: the structures, the Halcón of the parked squadron
 * (airBaseParkedAircraft.js), the ground library and the equipment kit, the towers and nets, and
 * the game's grass and scrub. One that is not registered or not built yet is simply left out.
 */
const KIT = [
  'base_hardened_shelter', 'base_control_tower', 'base_guard_post', 'base_fence', 'base_floodlight_mast', 'halcon',
  GROUND_ASSET, GROUND_KIT_ASSET, 'base_watchtower', 'base_camo_net', 'ground_cover', 'shrubs_tropical',
];

/**
 * Creates the base's runtime.
 * @param {import('../../core/systems/gameContext.js').GameContext} context
 */
export function createAirBaseRuntime(context) {
  const layout = planAirBaseLayout();
  const vehicles = createAirBaseVehicles(context, layout);
  const flag = (name) => Boolean(context.flags?.get?.(name));
  let built = null;
  let gateOpen = flag(WORLD_FLAGS.BASE_OFFICER_ACCESS);
  let alarm = flag(WORLD_FLAGS.BASE_ALARM);
  let kitRequested = false;
  let kitSettled = false;
  let kitSeen = '';
  vehicles.setAlarm(alarm);

  const parent = () => context.view?.layers?.world ?? context.view?.scene ?? null;
  // Which kit models are in memory, as a key: a change rebuilds the base with the new ones.
  const kitKey = () => KIT.map((id) => (context.assets?.has?.(id) ? '1' : '0')).join('');
  const requestKit = () => {
    if (kitRequested) return;
    kitRequested = true;
    const assets = context.assets;
    const wanted = KIT.filter((id) => assets?.registry?.[id] && !assets.has(id));
    if (wanted.length === 0 || typeof assets.load !== 'function') {
      kitSettled = true;
      return;
    }
    // One at a time, so a model that fails to load does not hold the others back. The loads are
    // reported as background work: whenIdle() and the showcase scenes wait for the base's models.
    const loads = Promise.all(wanted.map((id) => Promise.resolve(assets.load([id])).catch(() => {}))).then(() => { kitSettled = true; });
    if (typeof context.work?.track === 'function') Promise.resolve(context.work.track(loads, 'air base models')).catch(() => {});
  };
  // The half-second cadence runs on the wall clock: a held game (a settled frame drawn with no
  // time passing, as the capture tools do) still swaps the stand-ins for models that arrived.
  const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  let checkedAt = -Infinity;
  let rebuiltAt = -Infinity;

  function build() {
    const scene = parent();
    if (!scene) return;
    const city = context.systems.find('openWorldCity');
    const physics = context.systems.find('physics');
    kitSeen = kitKey();
    const renderer = context.view?.renderer;
    const anisotropy = Math.min(renderer?.capabilities?.getMaxAnisotropy?.() ?? 1, Math.max(4, context.quality?.tier?.anisotropy ?? 4));
    const groundAt = typeof city?.groundHeightAt === 'function' ? (x, z) => city.groundHeightAt(x, z) : undefined;
    const ground = buildAirBaseSurfaces(layout, city?.surfaces ?? null, context.assets, { groundAt, anisotropy });
    const structures = buildAirBaseStructures(layout, context.assets, physics);
    const dressing = buildAirBaseDressing(layout, context.assets, physics);
    const lamps = createAirBaseLights(layout, context.atmosphere, structures.lampHeads);
    structures.setGateOpen(gateOpen);
    structures.setLampLevel(lamps.level);
    lamps.setAlarm(alarm);
    const parked = buildAirBaseParkedAircraft(layout, context.assets, physics);
    scene.add(ground.object3d, structures.object3d, dressing.object3d, parked.object3d);
    built = { ground, structures, dressing, lamps, parked };
    dressing.update(context.view?.camera?.position ?? null);
  }

  function drop() {
    if (!built) return;
    built.ground.dispose();
    built.structures.dispose();
    built.dressing.dispose();
    built.parked.dispose();
    built.lamps.dispose();
    built = null;
  }

  const onFlag = (change) => {
    const name = change?.flag ?? change?.name ?? change?.id;
    if (name === WORLD_FLAGS.BASE_ALARM || name === undefined) {
      alarm = flag(WORLD_FLAGS.BASE_ALARM);
      vehicles.setAlarm(alarm);
      built?.lamps.setAlarm(alarm);
    }
    if (name === WORLD_FLAGS.BASE_OFFICER_ACCESS) runtime.setGateOpen(flag(WORLD_FLAGS.BASE_OFFICER_ACCESS));
  };
  context.events.on(GAME_EVENTS.WORLD_FLAG_CHANGED, onFlag);

  // `?stage=apron` / `?stage=flightline`: the lead on the apron for a picture, as an expected officer.
  const photoSpot = context.launch?.shot || context.launch?.aircraft ? null : layout.photoSpots[context.launch?.stage] ?? null;
  const onReady = () => {
    context.events.off?.(GAME_EVENTS.GAME_READY, onReady);
    if (!photoSpot) return;
    try {
      context.flags?.set?.(WORLD_FLAGS.BASE_OFFICER_ACCESS, true);
      context.commands.send(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: photoSpot.x, z: photoSpot.z }, heading: -photoSpot.heading });
    } catch (error) {
      context.log?.debug?.(`airBase: the lead was not staged (${error.message})`);
    }
  };
  if (photoSpot) context.events.on(GAME_EVENTS.GAME_READY, onReady);

  const runtime = {
    layout,
    vehicles,
    get built() { return built !== null; },
    get gateOpen() { return gateOpen; },
    setGateOpen(open) {
      gateOpen = Boolean(open);
      built?.structures.setGateOpen(gateOpen);
    },
    update(dt) {
      vehicles.update(dt);
      if (built) {
        built.structures.update(dt);
        built.structures.setLampLevel(built.lamps.update());
      }
      const now = clock();
      if (now - checkedAt < 0.5 && !(built && kitSettled && kitKey() !== kitSeen)) return;
      checkedAt = now;
      const focus = context.focus?.position;
      if (!focus) return;
      const away = Math.hypot(focus.x - layout.centre.x, focus.z - layout.centre.z);
      if (!built && away < REACH.build) {
        requestKit();
        build();
        rebuiltAt = now;
      } else if (built && away > REACH.drop) {
        drop();
      } else if (built && kitKey() !== kitSeen && (kitSettled || now - rebuiltAt > 1.5)) {
        // Models of the kit arrived: stand-ins out, models in (not more often than every 1.5 s while they stream).
        drop();
        build();
        rebuiltAt = now;
      }
      built?.dressing.update(context.view?.camera?.position ?? focus);
    },
    /** Counts for reports: draws and triangles of what is built, lamps, which models are real, what is placed. */
    stats() {
      let draws = 0;
      let triangles = 0;
      for (const root of built ? [built.ground.object3d, built.structures.object3d, built.dressing.object3d, built.parked.object3d] : []) {
        root.traverseVisible((node) => {
          if (!node.isMesh) return;
          // A model's levels of detail are all in the tree: only the one shown is drawn.
          draws += 1;
          const count = node.geometry.index ? node.geometry.index.count : node.geometry.attributes.position.count;
          triangles += (count / 3) * (node.isInstancedMesh ? node.count : 1);
        });
      }
      return {
        built: built !== null, draws, triangles, lamps: built?.lamps.count ?? 0,
        models: built ? { ...built.structures.models, halcon: built.parked.modelled, [GROUND_ASSET]: built.ground.baked, [GROUND_KIT_ASSET]: built.dressing.counts.propKinds > 0 } : {},
        parkedAircraft: built?.parked.count ?? 0, parkedDraws: built?.parked.object3d.children.length ?? 0, alarm, gateOpen,
        ground: built ? { baked: built.ground.baked, layers: built.ground.layers } : null,
        dressing: built ? { ...built.dressing.counts, ...built.structures.counts } : null,
        lampLevel: built?.lamps.level ?? 0, floods: built?.lamps.floods ?? 0, searchlights: built?.lamps.searchlights ?? 0,
      };
    },
    dispose() {
      context.events.off?.(GAME_EVENTS.WORLD_FLAG_CHANGED, onFlag);
      context.events.off?.(GAME_EVENTS.GAME_READY, onReady);
      vehicles.dispose();
      drop();
    },
  };
  return runtime;
}
