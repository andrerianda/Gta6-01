// The pilot's control mapping (game/src/player/aircraftPilotControls.js), the fleet's copy of it
// into an airplane's input (vehicleCraftControls.js), the inAircraft bindings and the launch flags.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PILOT_TUNING, createPilotControls, nextFlapNotch, stepPilotControls } from '../../../game/src/player/aircraftPilotControls.js';
import { airplaneInputFrom, craftKindOf } from '../../../game/src/vehicles/vehicleCraftControls.js';
import { createVehicleControls, releaseVehicleControls } from '../../../game/src/vehicles/vehicleControls.js';
import { CONTEXTS_THAT_SHADOW_ALWAYS, DEFAULT_ACTION_LABELS, DEFAULT_CONTROL_BINDINGS, resolveControlBindings } from '../../../game/src/core/input/controlBindings.js';
import { createInputActionMap } from '../../../game/src/core/input/inputActionMap.js';
import { parseLaunchOptions } from '../../../game/src/core/boot/launchOptions.js';
import { createGameSettings } from '../../../game/src/core/quality/gameSettings.js';
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';

const DT = 1 / 60;
const airborne = { onGround: false, groundSpeed: 50, flapNotch: 0, flapNotchCount: 4, trim: 0, vertical: null };
const parked = { onGround: true, groundSpeed: 0, flapNotch: 0, flapNotchCount: 4, trim: 0, vertical: null };

function hold(pilot, keys, seconds, flight = airborne) {
  for (let t = 0; t < seconds - 1e-9; t += DT) stepPilotControls(pilot, keys, DT, flight);
  return pilot;
}

test('a tap is a small input, a held key reaches full deflection, release springs back', () => {
  const pilot = createPilotControls();
  hold(pilot, { pitchUp: true }, 0.1);
  assert.ok(pilot.pitch > 0.2 && pilot.pitch < 0.4, `tap gives ${pilot.pitch}`);
  hold(pilot, { pitchUp: true }, 0.5);
  assert.equal(pilot.pitch, 1);
  hold(pilot, {}, 0.1);
  assert.ok(pilot.pitch > 0.4 && pilot.pitch < 0.6);
  hold(pilot, {}, 0.3);
  assert.equal(pilot.pitch, 0);
});

test('W is stick forward (nose down), S stick back; A/D roll, Q/E rudder with the contract signs', () => {
  const pilot = createPilotControls();
  hold(pilot, { pitchDown: true, rollRight: true, rudderLeft: true }, 1);
  assert.equal(pilot.pitch, -1);
  assert.equal(pilot.roll, 1);
  assert.equal(pilot.yaw, -1);
});

test('the throttle lever stays where it is put and moves about half its travel a second', () => {
  const pilot = createPilotControls();
  hold(pilot, { throttleUp: true }, 1);
  assert.ok(Math.abs(pilot.lever - PILOT_TUNING.leverRate) < 0.02, `lever ${pilot.lever}`);
  hold(pilot, {}, 2);
  assert.ok(Math.abs(pilot.lever - 0.5) < 0.02);
  hold(pilot, { throttleUp: true }, 3);
  assert.equal(pilot.lever, 1);
  hold(pilot, { throttleDown: true }, 5);
  assert.equal(pilot.lever, 0);
});

test('flaps go one notch down a press and wrap back up after the last', () => {
  assert.equal(nextFlapNotch(0, 4), 1);
  assert.equal(nextFlapNotch(3, 4), 0);
  assert.equal(nextFlapNotch(0, 1), 0);
  const pilot = createPilotControls();
  stepPilotControls(pilot, { pressedFlaps: true }, DT, { ...airborne, flapNotch: 2 });
  assert.equal(pilot.command.flapNotch, 3);
  stepPilotControls(pilot, {}, DT, airborne);
  assert.equal(pilot.command.flapNotch, null);
});

test('F leaves only standing still on the ground and is the flaps otherwise', () => {
  const pilot = createPilotControls();
  stepPilotControls(pilot, { pressedExit: true }, DT, parked);
  assert.equal(pilot.command.leave, true);
  assert.equal(pilot.command.flapNotch, null);
  stepPilotControls(pilot, { pressedExit: true }, DT, { ...parked, groundSpeed: 12 });
  assert.equal(pilot.command.leave, false);
  assert.equal(pilot.command.flapNotch, 1);
  stepPilotControls(pilot, { pressedExit: true }, DT, airborne);
  assert.equal(pilot.command.leave, false);
  assert.equal(pilot.command.flapNotch, 1);
});

test('T held with W / S turns the trim wheel and leaves the stick alone', () => {
  const pilot = createPilotControls();
  hold(pilot, { trim: true, pitchUp: true }, 1, { ...airborne, trim: 0.1 });
  assert.equal(pilot.pitch, 0);
  assert.ok(Math.abs(pilot.trim - (0.1 + PILOT_TUNING.trimRate * DT)) < 1e-9, 'one step of trim from the aircraft\'s own value');
  stepPilotControls(pilot, { trim: true, pitchDown: true }, DT, { ...airborne, trim: -0.999 });
  assert.equal(pilot.trim, -1);
});

test('autopilot keys: toggle, modes, heading bug and the altitude or vertical-speed target', () => {
  const pilot = createPilotControls();
  stepPilotControls(pilot, { pressedAutopilot: true, pressedMode: 'NAV', autopilotRight: true, autopilotUp: true }, DT, airborne);
  assert.equal(pilot.command.autopilot, true);
  assert.equal(pilot.command.mode, 'NAV');
  assert.ok(pilot.command.headingDelta > 0);
  assert.ok(pilot.command.altitudeDelta > 0);
  assert.equal(pilot.command.verticalSpeedDelta, 0);
  stepPilotControls(pilot, { autopilotDown: true }, DT, { ...airborne, vertical: 'VS' });
  assert.ok(pilot.command.verticalSpeedDelta < 0);
  assert.equal(pilot.command.altitudeDelta, 0);
});

test('wheel brakes and gear', () => {
  const pilot = createPilotControls();
  stepPilotControls(pilot, { wheelBrakes: true, pressedGear: true }, DT, parked);
  assert.equal(pilot.wheelBrake, 1);
  assert.equal(pilot.command.gear, true);
});

test('the fleet copies the pilot\'s controls into the airplane\'s input, and brakes an empty one', () => {
  const controls = createVehicleControls();
  Object.assign(controls, { pitch: 0.4, roll: -2, yaw: 0.1, lever: 1.4, wheelBrake: 0.5 });
  const input = { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: 0 };
  airplaneInputFrom(controls, input, true);
  assert.deepEqual(input, { pitch: 0.4, roll: -1, yaw: 0.1, throttle: 1, brake: 0.5 });
  airplaneInputFrom(controls, input, false);
  assert.deepEqual(input, { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: 1 });
  releaseVehicleControls(controls);
  assert.equal(controls.lever, 0);
  assert.equal(controls.pitch, 0);
});

test('the four aircraft of the catalog are the airplane craft kind', () => {
  for (const id of ['gaviota_t2', 'manta_sombra', 'garza_negra', 'halcon']) assert.equal(craftKindOf(VEHICLE_CATALOG[id]), 'airplane', id);
  assert.equal(craftKindOf(VEHICLE_CATALOG.news_helicopter), 'helicopter');
  assert.equal(craftKindOf(VEHICLE_CATALOG.family_sedan), null);
});

test('the inAircraft context: every action labelled, P is the autopilot and does not pause', () => {
  const { bindings, axes } = resolveControlBindings();
  for (const action of Object.keys(DEFAULT_CONTROL_BINDINGS.inAircraft)) assert.ok(DEFAULT_ACTION_LABELS[action], `label for ${action}`);
  const map = createInputActionMap({ bindings, axes, context: 'inVehicle', shadowAlways: CONTEXTS_THAT_SHADOW_ALWAYS });
  map.codeDown('KeyP');
  assert.equal(map.pressed('pause'), true, 'P pauses in a car');
  map.codeUp('KeyP');
  map.endFrame();
  map.setContext('inAircraft');
  map.codeDown('KeyP');
  assert.equal(map.pressed('autopilot'), true);
  assert.equal(map.pressed('pause'), false, 'P does not pause while flying');
  map.codeUp('KeyP');
  map.endFrame();
  map.codeDown('Escape');
  assert.equal(map.pressed('pause'), true, 'Escape still pauses');
  map.codeUp('Escape');
  map.codeDown('KeyT');
  assert.equal(map.held('trim'), true);
  assert.equal(map.pressed('openPhone'), false, 'no phone while flying');
  map.codeDown('KeyW');
  assert.equal(map.held('pitchDown'), true);
  assert.equal(map.held('accelerate'), false);
});

test('launch flags and the flight mode setting', () => {
  const launch = parseLaunchOptions('?autostart=1&aircraft=Manta_Sombra&air=1200&flightview=cockpit&flightmode=realistic');
  assert.equal(launch.aircraft, 'manta_sombra');
  assert.equal(launch.air, 1200);
  assert.equal(launch.flightView, 'cockpit');
  assert.equal(launch.flightMode, 'realistic');
  const none = parseLaunchOptions('?flightview=upside&air=-3');
  assert.equal(none.aircraft, null);
  assert.equal(none.air, null);
  assert.equal(none.flightView, null);
  const settings = createGameSettings();
  assert.equal(settings.get('flightMode'), 'casual');
  assert.equal(settings.set('flightMode', 'realistic'), true);
  assert.equal(settings.get('gameplay.flightMode'), 'realistic');
  assert.equal(settings.set('flightMode', 'arcade'), false);
  assert.equal(settings.get('flightView'), 'cockpit', 'kept for old saves; the flight cameras start in the cockpit and never read it');
});
