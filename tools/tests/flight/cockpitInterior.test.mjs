// The cockpit interior's arithmetic and its live faces (no three.js): where each face sits on the
// shared canvas, the eye and lens from the model's extras, the interior's light by time of day,
// the travel of stick, throttles and hands, how large the combiner looks from the eye, the
// registry of cockpit models against the files on disk, and one painter per named face.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ATLAS_PAD, COCKPIT_FACES, COCKPIT_LIGHTING, COCKPIT_MOTION, COCKPIT_NODES, EXTERIOR_HIDDEN, cabinVibration, cockpitFramingOf, controlAngles,
  easeControlPose, faceAtlasLayout, faceUvInAtlas, glassAngularSize, interiorLightOf, swayOffset,
} from '../../../game/src/flight/deck/cockpitTuning.js';
import { ANALOG_JET_FACE_PAINTERS } from '../../../game/src/flight/deck/analogJetPanel.js';
import { GLASS_DISPLAY_PAINTERS } from '../../../game/src/flight/deck/glassCockpitPanel.js';
import { TRAINER_FACE_PAINTERS } from '../../../game/src/flight/deck/trainerSixPackPanel.js';
import { dialAngle } from '../../../game/src/flight/deck/gaugeDrawing.js';
import { ASSETS } from '../../../game/src/assets/registry/index.js';
import { AIRCRAFT_ASSETS, COCKPIT_ASSETS, COCKPIT_OF_AIRCRAFT } from '../../../game/src/assets/registry/aircraft.js';
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';
import { EXTREME_READOUTS, createRecordingContext, makeReadout } from './flightDeckTestKit.mjs';

const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not within ${tolerance} of ${b}`);
const DEG = Math.PI / 180;
const PAINTERS = { glass_four: GLASS_DISPLAY_PAINTERS, analog_gauges: ANALOG_JET_FACE_PAINTERS, analog_six: TRAINER_FACE_PAINTERS };

test('every face of a cockpit gets its own cell of one canvas', () => {
  for (const [kind, names] of Object.entries(COCKPIT_FACES)) {
    const atlas = faceAtlasLayout(names);
    assert.ok(atlas.width <= 1024 && atlas.height <= 1024, `${kind}: a canvas no larger than 1024 (${atlas.width} x ${atlas.height})`);
    const cells = names.map((name) => atlas.cells[name]);
    for (const cell of cells) {
      assert.ok(cell.x >= 0 && cell.y >= 0 && cell.x + cell.w <= atlas.width && cell.y + cell.h <= atlas.height);
    }
    for (let i = 0; i < cells.length; i += 1) {
      for (let j = i + 1; j < cells.length; j += 1) {
        const a = cells[i], b = cells[j];
        assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${kind}: ${names[i]} and ${names[j]} do not overlap`);
      }
    }
  }
  // The displays are 4:3, the gauges square.
  const manta = faceAtlasLayout(COCKPIT_FACES.glass_four);
  assert.deepEqual([manta.width, manta.height], [1024, 768]);
  near(manta.cells.display_map.w / manta.cells.display_map.h, 4 / 3);
  const garza = faceAtlasLayout(COCKPIT_FACES.analog_gauges);
  assert.equal(garza.cells.gauge_mach.w, garza.cells.gauge_mach.h);
  // A face's 0..1 lands inside its cell, the padding kept; v runs down as on the canvas.
  const cell = manta.cells.display_cautions;
  const out = { u: 0, v: 0 };
  faceUvInAtlas(0, 0, cell, manta, out);
  near(out.u * manta.width, cell.x + ATLAS_PAD);
  near(out.v * manta.height, cell.y + ATLAS_PAD);
  faceUvInAtlas(1, 1, cell, manta, out);
  near(out.u * manta.width, cell.x + cell.w - ATLAS_PAD);
  near(out.v * manta.height, cell.y + cell.h - ATLAS_PAD);
  faceUvInAtlas(-3, 7, cell, manta, out);
  assert.ok(out.u * manta.width >= cell.x && out.v * manta.height <= cell.y + cell.h, 'a stray coordinate stays in the cell');
  // Only some faces present (an older model): still laid out.
  assert.deepEqual(Object.keys(faceAtlasLayout(['display_map']).cells), ['display_map']);
});

test('the eye and the lens come from the cockpit model, each with its fallback', () => {
  const none = { x: null, y: null, z: null, fovDegrees: null, gazeRadians: null };
  // The extras name Blender's frame (nose +Y, up +Z): the game's is nose -Z, up +Y.
  const fromExtras = cockpitFramingOf({ eye: [-0.55, 6.3, 4.0], fov: 62, gaze: -4 }, null, none);
  assert.deepEqual([fromExtras.x, fromExtras.y, fromExtras.z], [-0.55, 4.0, -6.3]);
  assert.equal(fromExtras.fovDegrees, 62);
  near(fromExtras.gazeRadians, -4 * DEG);
  // The `eye` node (already in the game's frame) wins over the extra.
  const fromNode = cockpitFramingOf({ eye: [0, 1, 2] }, { x: 0.1, y: 3.3, z: -9.2 }, none);
  assert.deepEqual([fromNode.x, fromNode.y, fromNode.z], [0.1, 3.3, -9.2]);
  assert.equal(fromNode.fovDegrees, null);
  assert.equal(fromNode.gazeRadians, null);
  // Nonsense is refused.
  const bad = cockpitFramingOf({ eye: [1, 'a', 3], fov: 170, gaze: 80 }, { x: NaN, y: 0, z: 0 }, none);
  assert.deepEqual(bad, none);
  assert.deepEqual(cockpitFramingOf(null, null, { x: 1, y: 2, z: 3, fovDegrees: 65, gazeRadians: -0.1 }), { x: 1, y: 2, z: 3, fovDegrees: 65, gazeRadians: -0.1 });
});

test('the interior reads at dawn, by day, at dusk and at night', () => {
  const day = interiorLightOf({ ambientSkyColor: { r: 0.6, g: 0.75, b: 1 }, ambientIntensity: 0.8, nightFactor: 0, exposure: 0.9 }, 'glass_four', {});
  const dawn = interiorLightOf({ ambientSkyColor: { r: 1, g: 0.7, b: 0.5 }, ambientIntensity: 0.4, nightFactor: 0.3, exposure: 1.4 }, 'glass_four', {});
  const night = interiorLightOf({ ambientSkyColor: { r: 0.2, g: 0.3, b: 0.6 }, ambientIntensity: 0.05, nightFactor: 1, exposure: 2.8 }, 'glass_four', {});
  // The fill follows the sky by day and never goes black at night.
  assert.ok(day.fill[2] > day.fill[0], 'a blue sky fills blue');
  assert.ok(dawn.fill[0] > dawn.fill[2], 'a dawn sky fills warm');
  for (const channel of night.fill) assert.ok(channel > 0.01, 'a night floor');
  assert.ok(day.fill[1] > night.fill[1]);
  // The instruments glow stronger at night; on screen the faces stay the same whatever the exposure.
  assert.ok(night.glowPanel > dawn.glowPanel && dawn.glowPanel > day.glowPanel);
  assert.ok(night.glowConsole > day.glowConsole && night.glowPanel > night.glowConsole);
  near(day.display * 0.9, COCKPIT_LIGHTING.displayDay);
  near(night.display * 2.8, COCKPIT_LIGHTING.displayNight);
  assert.ok(night.hud * 2.8 < day.hud * 0.9, 'the combiner is dimmed at night');
  assert.ok(night.glassReflection < day.glassReflection);
  // Cool green-white for the glass cockpit, warm amber-white for the analog one.
  assert.ok(day.glow[1] > day.glow[0]);
  const analog = interiorLightOf(null, 'analog_gauges', {});
  assert.ok(analog.glow[0] > analog.glow[1] && analog.glow[1] > analog.glow[2]);
  assert.ok(Number.isFinite(analog.display) && analog.fill.every(Number.isFinite), 'no atmosphere: plain daylight');
  // The canopy glass never darkens the view by more than a few percent.
  assert.ok(COCKPIT_LIGHTING.glassOpacity <= 0.1 && COCKPIT_LIGHTING.combinerOpacity <= 0.12);
});

test('the stick tilts nine degrees, the throttles turn thirty-five, both ease', () => {
  const angles = controlAngles({ pitch: 1, roll: 1, throttle: 1 }, {});
  near(angles.stickX, 9 * DEG);   // back, about +X, to raise the nose
  near(angles.stickZ, -9 * DEG);  // right, about -Z, to roll right
  near(angles.throttleX, -35 * DEG); // forward
  const rest = controlAngles({ pitch: 0, roll: 0, throttle: 0 }, {});
  assert.deepEqual([rest.stickX, Math.abs(rest.stickZ), Math.abs(rest.throttleX)], [0, 0, 0]);
  const pose = { pitch: 0, roll: 0, throttle: 0 };
  easeControlPose(pose, { pitch: 1, roll: -1, throttle: 1 }, 1 / 60);
  assert.ok(pose.pitch > 0.05 && pose.pitch < 0.5, 'a frame moves it part of the way');
  for (let i = 0; i < 120; i += 1) easeControlPose(pose, { pitch: 5, roll: -5, throttle: 5 }, 1 / 60);
  near(pose.pitch, 1, 1e-3);
  near(pose.roll, -1, 1e-3);
  near(pose.throttle, 1, 1e-3);
  easeControlPose(pose, null, 10);
  near(pose.pitch, 0, 1e-6);
  easeControlPose(pose, { pitch: NaN, roll: undefined, throttle: NaN }, 0.1);
  assert.ok(Number.isFinite(pose.pitch) && Number.isFinite(pose.throttle));
});

test('the hands sway by less than two millimetres and shake on the takeoff roll', () => {
  const out = { x: 0, y: 0, z: 0 };
  let still = 0, rolling = 0;
  for (let i = 0; i < 600; i += 1) {
    swayOffset(i / 60, 0, 0, COCKPIT_MOTION.handShake, COCKPIT_MOTION.breath, out);
    still = Math.max(still, Math.hypot(out.x, out.y, out.z));
    swayOffset(i / 60, 1, 0, COCKPIT_MOTION.handShake, COCKPIT_MOTION.breath, out);
    rolling = Math.max(rolling, Math.hypot(out.x, out.y, out.z));
  }
  assert.ok(still > 0.0002 && still < 0.001, `breathing is sub-millimetre (${still})`);
  assert.ok(rolling > still && rolling < 0.0025, `the roll adds to it, within 2.5 mm (${rolling})`);
  const a = swayOffset(1.23, 0.5, 0, 0.001, 0.0005, { x: 0, y: 0, z: 0 });
  const b = swayOffset(1.23, 0.5, 1, 0.001, 0.0005, { x: 0, y: 0, z: 0 });
  assert.notDeepEqual(a, b, 'the two hands do not move as one');
  assert.equal(cabinVibration(null), 0);
  const parked = cabinVibration(makeReadout({ onGround: true, groundSpeedKnots: 0, rpmPercent: 0 }));
  const roll = cabinVibration(makeReadout({ onGround: true, groundSpeedKnots: 120, rpmPercent: 100 }));
  const cruise = cabinVibration(makeReadout({ onGround: false, groundSpeedKnots: 400, rpmPercent: 80 }));
  assert.equal(parked, 0);
  assert.ok(roll > 0.9 && roll <= 1);
  assert.ok(cruise > 0 && cruise < 0.1, 'a faint engine buzz in the air');
});

test('the combiner glass is measured from the eye', () => {
  // A glass 0.16 m wide and 0.14 m tall, upright, 0.5 m ahead of the eye and centred 2 cm above it.
  const eye = { x: -0.55, y: 4, z: -6.3 };
  const corner = (dx, dy) => [eye.x + dx, eye.y + 0.02 + dy, eye.z - 0.5];
  const points = [...corner(-0.08, -0.07), ...corner(0.08, -0.07), ...corner(0.08, 0.07), ...corner(-0.08, 0.07)];
  const size = glassAngularSize(points, eye, {});
  near(size.degreesWide, 2 * Math.atan(0.08 / 0.5) / DEG, 0.2);
  near(size.degreesTall, (Math.atan(0.09 / 0.5) + Math.atan(0.05 / 0.5)) / DEG, 0.3);
  near(size.boresightX, 0.5, 1e-6);
  assert.ok(size.boresightY > 0.5 && size.boresightY < 0.75, 'straight ahead crosses below the middle of a glass set above the eye line');
  near(size.distance, 0.51, 0.02);
  // Behind the eye, or degenerate: no answer.
  assert.equal(glassAngularSize(points.map((v, i) => (i % 3 === 2 ? eye.z + 0.5 : v)), eye, {}), null);
  assert.equal(glassAngularSize([0, 0, 0], eye, {}), null);
});

test('the cockpit models are registered apart from the boot assets and match their files', () => {
  for (const [aircraftId, cockpitId] of Object.entries(COCKPIT_OF_AIRCRAFT)) {
    assert.ok(AIRCRAFT_ASSETS[aircraftId], `${aircraftId} is an aircraft`);
    const entry = COCKPIT_ASSETS[cockpitId];
    assert.ok(entry, `${cockpitId} is registered`);
    assert.equal(ASSETS[cockpitId], undefined, 'the boot never preloads a cockpit model');
    const kind = VEHICLE_CATALOG[aircraftId].flight.cockpit;
    for (const face of COCKPIT_FACES[kind]) {
      assert.ok(entry.nodes.includes(face), `${cockpitId} promises ${face}`);
      assert.equal(typeof PAINTERS[kind][face], 'function', `${face} has a painter`);
    }
    for (const name of [COCKPIT_NODES.shell, COCKPIT_NODES.glass, COCKPIT_NODES.stick, COCKPIT_NODES.throttles]) assert.ok(entry.nodes.includes(name));
    // A registered model must be on disk and within its budget: a missing file is a failed request in the game.
    const file = fileURLToPath(new URL(`../../../game/assets/${entry.file}`, import.meta.url));
    assert.ok(existsSync(file), `${entry.file} is built`);
    assert.ok(statSync(file).size <= entry.maxBytes, `${entry.file} is within ${entry.maxBytes} bytes`);
  }
  assert.ok(EXTERIOR_HIDDEN.nodes.includes('cockpit_lod0') && EXTERIOR_HIDDEN.nodes.includes('instrument_panel'));
  assert.ok(EXTERIOR_HIDDEN.glassMaterial.test('glass') && !EXTERIOR_HIDDEN.glassMaterial.test('glass_blur'), 'the propeller blur disc stays');
});

/** Paints one face in a cell away from the origin and returns what was drawn. */
function paintFace(kind, name, readout, extra) {
  const ctx = createRecordingContext();
  const layout = { trace: {}, speeds: null };
  PAINTERS[kind][name](ctx, readout, 512, 256, kind === 'glass_four' ? 512 : 256, kind === 'glass_four' ? 384 : 256, extra, layout);
  return { ctx, trace: layout.trace };
}

test('each named face has a painter that follows the readout and survives extreme values', () => {
  for (const [kind, names] of Object.entries(COCKPIT_FACES)) {
    assert.deepEqual(Object.keys(PAINTERS[kind]).sort(), [...names].sort(), `${kind}: one painter per face, no more`);
    for (const name of names) {
      const { ctx } = paintFace(kind, name, makeReadout());
      assert.ok(ctx.calls.length > 10, `${name} draws`);
      // The picture starts by covering its own cell and nothing left of or above it.
      const fills = ctx.calls.filter((call) => call[0] === 'fillRect');
      assert.ok(fills.length > 0 && fills[0][1] >= 512 - 30 && fills[0][2] >= 256 - 30, `${name} paints in its cell`);
      for (const make of Object.values(EXTREME_READOUTS)) assert.doesNotThrow(() => paintFace(kind, name, make(), {}), `${name} at an extreme`);
    }
  }
});

test('the analog jet faces: white-on-black dials with the needle where the value is', () => {
  const readout = makeReadout({ mach: 2.6, maxMach: 3.2, airspeedKnots: 350, skinTemperatureC: 290, engineTemperatureC: 700, rpmPercent: 90, fuelPercent: 50, altitudeFeet: 62000, headingDegrees: 270, verticalSpeedFpm: 2000 });
  near(paintFace('analog_gauges', 'gauge_mach', readout).trace.mach, dialAngle(2.6, 0, 3.4, 30, 300));
  near(paintFace('analog_gauges', 'gauge_airspeed', readout).trace.airspeed, dialAngle(350, 0, 700, 20, 320));
  near(paintFace('analog_gauges', 'gauge_skin_temp', readout).trace.skinTemperature, dialAngle(290, -100, 400, 220, 280));
  near(paintFace('analog_gauges', 'gauge_heading', readout).trace.heading, -270 * DEG);
  near(paintFace('analog_gauges', 'gauge_altitude', readout).trace.altimeterThousands, 0.2 * Math.PI * 2, 1e-6);
  near(paintFace('analog_gauges', 'gauge_vsi', readout).trace.verticalSpeed, dialAngle(2000, -6000, 6000, 100, 340));
  near(paintFace('analog_gauges', 'gauge_fuel', readout).trace.fuel, dialAngle(50, 0, 100, 240, 240));
  near(paintFace('analog_gauges', 'gauge_attitude', makeReadout({ pitchDegrees: 7, rollDegrees: -20 })).trace.attitudeRoll, -20 * DEG);
  const left = paintFace('analog_gauges', 'gauge_rpm_l', readout);
  const right = paintFace('analog_gauges', 'gauge_rpm_r', readout);
  assert.ok(right.trace.rpmRight > left.trace.rpmLeft, 'the two engines read a hair apart');
  assert.ok(left.ctx.texts.includes('RPM L') && right.ctx.texts.includes('RPM R'));
  assert.ok(paintFace('analog_gauges', 'gauge_egt_l', readout).ctx.texts.includes('EGT L'));
  assert.ok(paintFace('analog_gauges', 'gauge_skin_temp', readout).ctx.texts.includes('SKIN °C'));
  assert.ok(paintFace('analog_gauges', 'gauge_mach', readout).ctx.texts.includes('2.60'));
  // The trainer's turn coordinator and tachometer.
  near(paintFace('analog_six', 'gauge_turn', makeReadout({ turnNeedle: 0.5 })).trace.turn, 20 * DEG);
  near(paintFace('analog_six', 'gauge_rpm', makeReadout({ rpmPercent: 100 })).trace.tachometer, dialAngle(27, 0, 30, 220, 280));
});

test('the glass displays: map, radar with the signature, engines, cautions', () => {
  const route = { points: new Float32Array([0, -3000, 4000, -3000]), count: 2 };
  const extra = { position: { x: 0, z: 0 }, route, contacts: [{ bearingDegrees: 30, distanceNm: 8 }], timeSeconds: 3, hatchOpen: true };
  const readout = makeReadout({ headingDegrees: 0, gearDown: false, rpmPercent: 85, fuelPercent: 8, autopilot: { engaged: true, lateral: 'NAV', routeDistanceNm: 2.7 } });
  const map = paintFace('glass_four', 'display_map', readout, extra);
  assert.ok(map.trace.mapTargetX > 0 && map.trace.mapTargetY < 0, 'track up: the destination is ahead and to the right');
  for (const text of ['NAV', 'HDG 000', '2.7 NM', 'N', 'TRK UP']) assert.ok(map.ctx.texts.includes(text), `the map shows ${text}`);
  const radar = paintFace('glass_four', 'display_radar', readout, extra);
  assert.equal(radar.trace.radarContacts, 1);
  assert.equal(radar.trace.radarTargeting, 0);
  for (const text of ['RADAR 20 NM', '1 CONTACT', 'SIG']) assert.ok(radar.ctx.texts.includes(text), `the radar shows ${text}`);
  const engines = paintFace('glass_four', 'display_engines', readout, extra);
  near(engines.trace.engineRpm, 0.85);
  near(engines.trace.fuel, 0.08);
  for (const text of ['ENGINES', 'FUEL', 'N1 %', 'EGT °C', '1', '2', '3', '4']) assert.ok(engines.ctx.texts.includes(text), `the engines show ${text}`);
  const cautions = paintFace('glass_four', 'display_cautions', readout, extra);
  assert.equal(cautions.trace.cautions, 2);
  for (const text of ['FUEL LOW', 'HATCH OPEN', 'GEAR UP', 'HATCH  OPEN', 'BAY  SHUT']) assert.ok(cautions.ctx.texts.includes(text), `the status shows ${text}`);
  assert.ok(!cautions.ctx.texts.includes('STALL'), 'a dark tile carries no legend');
  const quiet = paintFace('glass_four', 'display_cautions', makeReadout({ autopilot: { engaged: true } }), {});
  assert.equal(quiet.trace.cautions, 0);
  assert.ok(quiet.ctx.texts.includes('NO CAUTIONS') && quiet.ctx.texts.includes('GEAR DN'));
  // The guided bomb's targeting screen takes the radar display over.
  const targeting = {
    active: true, craft: { x: 0, y: 3000, z: 0 }, target: { x: 0, y: 40, z: -6000 }, targetName: 'RADAR', valid: true, bombs: 2,
    solution: { range: 6000, timeOfFall: 24, alongError: 120, crossError: -40, authority: 600, inEnvelope: true, reason: '' },
    bombAway: false, bomb: { x: 0, y: 0, z: 0 }, timeToImpact: 0, result: '', terrain: null, timeSeconds: 1,
  };
  const seeker = paintFace('glass_four', 'display_radar', readout, { ...extra, radar: { targeting } });
  assert.equal(seeker.trace.radarTargeting, 1);
  assert.ok(!seeker.ctx.texts.includes('RADAR 20 NM'));
});
