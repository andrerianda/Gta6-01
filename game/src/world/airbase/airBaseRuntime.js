// The running Base Aérea Punta Garza: builds the base's ground, structures and lamps when the
// camera's focus comes within reach and drops them again far away (so the base costs nothing from
// downtown), swaps the stand-in boxes for the kit's models as soon as the asset library has them,
// keeps the vehicles, and follows the world flags (the alarm; officer access opens the gate).
//
//   const base = createAirBaseRuntime(context);
//   base.update(dt);  base.setGateOpen(true);  base.layout.runway;  base.stats();  base.dispose();

import { GAME_EVENTS } from '../../core/events/gameEvents.js';
import { WORLD_FLAGS } from '../../core/state/worldFlags.js';
import { planAirBaseLayout } from './airBaseLayout.js';
import { createAirBaseLights } from './airBaseLights.js';
import { buildAirBaseParkedAircraft } from './airBaseParkedAircraft.js';
import { buildAirBaseStructures } from './airBaseStructures.js';
import { buildAirBaseSurfaces } from './airBaseSurfaces.js';
import { createAirBaseVehicles } from './airBaseVehicles.js';

/** Metres from the base's centre to the focus: built inside `build`, dropped beyond `drop`. */
const REACH = Object.freeze({ build: 2300, drop: 2700 });
/** The models the base is built from; the last is the Halcón of the parked squadron (airBaseParkedAircraft.js). */
const KIT = ['base_hardened_shelter', 'base_control_tower', 'base_guard_post', 'base_fence', 'base_floodlight_mast', 'halcon'];

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
  let kitSeen = '';
  let wait = 0;
  vehicles.setAlarm(alarm);

  const parent = () => context.view?.layers?.world ?? context.view?.scene ?? null;
  // Which kit models are in memory, as a key: a change rebuilds the structures with the new ones.
  const kitKey = () => KIT.map((id) => (context.assets?.has?.(id) ? '1' : '0')).join('');
  const requestKit = () => {
    if (kitRequested) return;
    kitRequested = true;
    const assets = context.assets;
    const wanted = KIT.filter((id) => assets?.registry?.[id] && !assets.has(id));
    if (wanted.length > 0 && typeof assets.load === 'function') Promise.resolve(assets.load(wanted)).catch(() => {});
  };

  function build() {
    const scene = parent();
    if (!scene) return;
    const city = context.systems.find('openWorldCity');
    const physics = context.systems.find('physics');
    kitSeen = kitKey();
    const ground = buildAirBaseSurfaces(layout, city?.surfaces ?? null);
    const structures = buildAirBaseStructures(layout, context.assets, physics);
    const lamps = createAirBaseLights(layout, context.atmosphere);
    structures.setGateOpen(gateOpen);
    lamps.setAlarm(alarm);
    const parked = buildAirBaseParkedAircraft(layout, context.assets, physics);
    scene.add(ground.object3d, structures.object3d, parked.object3d);
    built = { ground, structures, lamps, parked };
  }

  function drop() {
    if (!built) return;
    built.ground.dispose();
    built.structures.dispose();
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
      built?.structures.update(dt);
      wait -= dt;
      if (wait > 0) return;
      wait = 0.5;
      const focus = context.focus?.position;
      if (!focus) return;
      const away = Math.hypot(focus.x - layout.centre.x, focus.z - layout.centre.z);
      if (!built && away < REACH.build) {
        requestKit();
        build();
      } else if (built && away > REACH.drop) {
        drop();
      } else if (built && kitKey() !== kitSeen) {
        // A model of the kit arrived: stand-ins out, models in.
        drop();
        build();
      }
    },
    /** Counts for reports: draws and triangles of what is built, lamps, which models are real. */
    stats() {
      let draws = 0;
      let triangles = 0;
      for (const root of built ? [built.ground.object3d, built.structures.object3d, built.parked.object3d] : []) {
        root.traverse((node) => {
          if (!node.isMesh || !node.visible) return;
          draws += 1;
          const count = node.geometry.index ? node.geometry.index.count : node.geometry.attributes.position.count;
          triangles += (count / 3) * (node.isInstancedMesh ? node.count : 1);
        });
      }
      return {
        built: built !== null, draws, triangles, lamps: built?.lamps.count ?? 0, models: built ? { ...built.structures.models, halcon: built.parked.modelled } : {},
        parkedAircraft: built?.parked.count ?? 0, parkedDraws: built?.parked.object3d.children.length ?? 0, alarm, gateOpen,
      };
    },
    dispose() {
      context.events.off?.(GAME_EVENTS.WORLD_FLAG_CHANGED, onFlag);
      vehicles.dispose();
      drop();
    },
  };
  return runtime;
}
