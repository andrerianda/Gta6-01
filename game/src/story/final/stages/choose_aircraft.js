// After the walk-out, before boarding: the choice of aircraft (MANTA SOMBRA or GARZA NEGRA) and
// of mode (ASSISTED, the default, or SIMULATION) on a full screen over the dimmed dawn apron.
// Arrows or A / D and W / S or the mouse; Enter confirms. Writes rt.data.aircraftId,
// rt.data.flightMode ('casual' = ASSISTED, 'realistic' = SIMULATION) and the `flightMode` setting.
// ?plane= preselects; when the mission was begun by URL at a later stage with a plane named, a
// restart passes through here without stopping.
import { GAME_STATE } from '../../../core/state/gameStates.js';
import { FINAL_STAGE_ORDER } from '../finalMissionStages.js';

/**
 * @param {object} rt The mission runtime's `rt`.
 */
export function createChooseAircraftStage(rt) {
  const { context } = rt;
  let open = false;

  function confirm({ aircraftId, flightMode }) {
    open = false;
    rt.data.aircraftId = aircraftId;
    rt.data.flightMode = flightMode;
    context.settings?.set?.('flightMode', flightMode);
    if (context.state.is(GAME_STATE.CUTSCENE)) context.state.enter(GAME_STATE.PLAYING);
    rt.after(0.15, () => rt.next());
  }

  return {
    enter() {
      const launch = rt.launch ?? {};
      const here = FINAL_STAGE_ORDER.indexOf('choose_aircraft');
      if (launch.byUrl && launch.plane && FINAL_STAGE_ORDER.indexOf(launch.stage) > here) {
        confirm({ aircraftId: rt.data.aircraftId, flightMode: rt.data.flightMode });
        return;
      }
      // The world holds still behind the screen: the cutscene state takes the controls and the HUD.
      if (context.state.is(GAME_STATE.PLAYING)) context.state.enter(GAME_STATE.CUTSCENE);
      open = true;
      rt.ui.openAircraftChoice({ aircraftId: rt.data.aircraftId, flightMode: rt.data.flightMode, onConfirm: confirm });
    },
    update() {},
    exit() {
      if (!open) return;
      open = false;
      rt.ui.closeScreen();
      if (context.state.is(GAME_STATE.CUTSCENE)) context.state.enter(GAME_STATE.PLAYING);
    },
  };
}
