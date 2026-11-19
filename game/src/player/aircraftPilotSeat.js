// The lead at the controls of a fixed-wing aircraft: reads the `inAircraft` keys each fixed step,
// runs them through aircraftPilotControls.js, writes the stick, pedals, lever and brakes into the
// fleet's controls of that aircraft (the fleet copies them into Airplane.input) and gives the
// one-shot commands (flaps, gear, trim, autopilot and its targets) to the Airplane itself
// (physics/aircraft/Airplane.js, through vehicles.physicsOf). The flight mode setting
// ('flightMode': casual | realistic) is applied live. vehicleEntry.js calls begin / fly / end.
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { createPilotControls, pilotHintText, stepPilotControls } from './aircraftPilotControls.js';

/** Seconds the key hint stays after the lead takes the controls. */
export const PILOT_HINT_SECONDS = 14;
const MODE_ACTIONS = Object.freeze([
  ['autopilotHeading', 'HDG'], ['autopilotAltitude', 'ALT'], ['autopilotVerticalSpeed', 'VS'], ['autopilotNav', 'NAV'], ['autoThrottle', 'ATHR'],
]);
const TWO_PI = Math.PI * 2;

/**
 * Creates the pilot's seat.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function createAircraftPilotSeat(context) {
  const pilot = createPilotControls();
  const keys = {
    pitchUp: false, pitchDown: false, rollLeft: false, rollRight: false, rudderLeft: false, rudderRight: false,
    throttleUp: false, throttleDown: false, trim: false, wheelBrakes: false, pressedFlaps: false, pressedExit: false,
    pressedGear: false, pressedAutopilot: false, pressedMode: null, autopilotLeft: false, autopilotRight: false,
    autopilotUp: false, autopilotDown: false,
  };
  const flight = { onGround: true, groundSpeed: 0, flapNotch: 0, flapNotchCount: 1, trim: 0, vertical: null };
  let plane = null;
  let hintLeft = 0;

  const fleet = () => context.systems.find('vehicles');
  const flightMode = () => (context.settings && context.settings.get('flightMode') === 'realistic' ? 'realistic' : 'casual');

  function hint(text) {
    context.events.emit(GAME_EVENTS.HELP_PROMPT_CHANGED, text ? { action: 'throttleUp', text } : { action: null, text: null });
  }

  /** The Airplane of a fleet vehicle, or null (a stand-in without flight physics). */
  function airplaneOf(vehicle) {
    const vehicles = fleet();
    const body = vehicles && typeof vehicles.physicsOf === 'function' ? vehicles.physicsOf(vehicle.id)
      : vehicles && typeof vehicles.get === 'function' ? vehicles.get(vehicle.id)?.car : null;
    return body && body.input && body.state ? body : null;
  }

  return {
    /** The Airplane being flown, or null. */
    get airplane() { return plane; },
    /**
     * The lead took the controls of `vehicle`.
     * @param {object} vehicle The aircraft's entity.
     */
    begin(vehicle) {
      plane = airplaneOf(vehicle);
      pilot.pitch = pilot.roll = pilot.yaw = 0;
      pilot.wheelBrake = 0;
      // Boarded in flight (a launch flag, a scene): the lever stays where the engine is.
      pilot.lever = plane && plane.state.onGround === false ? plane.input.throttle || plane.state.throttle || 0.7 : 0;
      if (plane) plane.mode = flightMode();
      hintLeft = PILOT_HINT_SECONDS;
      hint(pilotHintText(plane ? plane.tuning : undefined));
    },
    /** The lead left the controls. */
    end() {
      plane = null;
      if (hintLeft > 0) { hintLeft = 0; hint(null); }
    },
    /**
     * One fixed step at the controls.
     * @param {object} input context.input.
     * @param {object | null} controls The fleet's controls of the aircraft (written).
     * @param {number} dt Step seconds.
     * @returns {boolean} True when the pilot asked to get out (F, standing still on the ground).
     */
    fly(input, controls, dt) {
      keys.pitchUp = input.held('pitchUp'); keys.pitchDown = input.held('pitchDown');
      keys.rollLeft = input.held('rollLeft'); keys.rollRight = input.held('rollRight');
      keys.rudderLeft = input.held('rudderLeft'); keys.rudderRight = input.held('rudderRight');
      keys.throttleUp = input.held('throttleUp'); keys.throttleDown = input.held('throttleDown');
      keys.trim = input.held('trim'); keys.wheelBrakes = input.held('wheelBrakes');
      keys.pressedFlaps = input.pressed('flaps'); keys.pressedExit = input.pressed('exitVehicle');
      keys.pressedGear = input.pressed('gear'); keys.pressedAutopilot = input.pressed('autopilot');
      keys.pressedMode = null;
      for (let i = 0; i < MODE_ACTIONS.length; i += 1) if (input.pressed(MODE_ACTIONS[i][0])) keys.pressedMode = MODE_ACTIONS[i][1];
      keys.autopilotLeft = input.held('autopilotLeft'); keys.autopilotRight = input.held('autopilotRight');
      keys.autopilotUp = input.held('autopilotUp'); keys.autopilotDown = input.held('autopilotDown');

      const state = plane ? plane.state : null;
      flight.onGround = state ? state.onGround !== false : true;
      flight.groundSpeed = state ? state.groundSpeed || 0 : 0;
      flight.flapNotch = plane ? plane.flapNotch || 0 : 0;
      flight.flapNotchCount = plane && plane.tuning && plane.tuning.flapNotches ? plane.tuning.flapNotches.length : 1;
      flight.trim = plane ? plane.trim || 0 : 0;
      flight.vertical = plane && plane.autopilot ? plane.autopilot.vertical : null;
      stepPilotControls(pilot, keys, dt, flight);

      if (controls) {
        controls.pitch = pilot.pitch; controls.roll = pilot.roll; controls.yaw = pilot.yaw;
        controls.lever = pilot.lever; controls.wheelBrake = pilot.wheelBrake;
      }
      if (hintLeft > 0) {
        hintLeft -= dt;
        if (hintLeft <= 0) hint(null);
      }
      if (!plane) return pilot.command.leave;
      const command = pilot.command;
      const mode = flightMode();
      if (plane.mode !== mode) plane.mode = mode;
      if (keys.trim && mode === 'realistic') plane.trim = pilot.trim;
      if (command.flapNotch !== null && typeof plane.setFlaps === 'function') plane.setFlaps(command.flapNotch);
      if (command.gear && typeof plane.setGear === 'function') plane.setGear(!plane.gearDown);
      const autopilot = plane.autopilot;
      if (command.autopilot) {
        if (autopilot && autopilot.engaged) plane.disengageAutopilot?.();
        else plane.engageAutopilot?.();
      }
      if (command.mode && typeof plane.setAutopilotMode === 'function') plane.setAutopilotMode(command.mode);
      if (autopilot) {
        if (command.headingDelta !== 0) autopilot.targetHeading = (((autopilot.targetHeading || 0) + command.headingDelta) % TWO_PI + TWO_PI) % TWO_PI;
        if (command.altitudeDelta !== 0) {
          const ceiling = plane.tuning && plane.tuning.serviceCeiling ? plane.tuning.serviceCeiling : 25000;
          autopilot.targetAltitude = Math.min(ceiling, Math.max(30, (autopilot.targetAltitude || 0) + command.altitudeDelta));
        }
        if (command.verticalSpeedDelta !== 0) autopilot.targetVerticalSpeed = (autopilot.targetVerticalSpeed || 0) + command.verticalSpeedDelta;
      }
      return command.leave;
    },
  };
}
