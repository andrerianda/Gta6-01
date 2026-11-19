// One radar's sweep: the beam's timing, the reach by the fourth root of the signature, the terrain
// line of sight, the track that builds over consecutive paints and decays between them, and the
// "stealth test": slipping through a picket ship's circle between its sweeps.
import assert from 'node:assert/strict';
import test from 'node:test';
import { radarHorizonMetres, radarSignatureOf } from '../../../game/src/flight/radar/radarSignature.js';
import {
  RADAR_SWEEP, beamAzimuthAt, beamCrossed, compassBearing, createRadarTrack, detectionRange, emitterView, resetRadarTrack, signatureNeededAt,
  stepRadarTrack, terrainSightFree,
} from '../../../game/src/flight/radar/radarSweep.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);

test('the beam turns once per sweep and crosses a bearing once per turn', () => {
  const emitter = { sweepSeconds: 9, phaseDegrees: 0 };
  near(beamAzimuthAt(emitter, 0), 0);
  near(beamAzimuthAt(emitter, 2.25), 90);
  near(beamAzimuthAt(emitter, 9 + 4.5), 180);
  near(beamAzimuthAt({ sweepSeconds: 6, phaseDegrees: 350 }, 1), 50);
  near(compassBearing(0, 0, 0, -100), 0);
  near(compassBearing(0, 0, 100, 0), 90);
  near(compassBearing(0, 0, -100, 0), 270);
  // Count the rising edges over five turns at 60 Hz.
  const dt = 1 / 60;
  let edges = 0;
  let inBeam = false;
  for (let step = 0; step < 5 * 9 * 60; step += 1) {
    const crossed = beamCrossed(beamAzimuthAt(emitter, step * dt), (360 * dt) / 9, 123, 7);
    if (crossed && !inBeam) edges += 1;
    inBeam = crossed;
  }
  assert.equal(edges, 5);
  assert.equal(beamCrossed(358, 1, 1, 6), true, 'across north');
  assert.equal(beamCrossed(10, 1, 200, 6), false);
});

test('reach goes with the fourth root of the signature', () => {
  near(detectionRange(16000, 1), 16000);
  near(detectionRange(16000, 1 / 16), 8000);
  assert.equal(detectionRange(16000, 0), 0);
  near(signatureNeededAt(2600, 1300), 1 / 16);
  assert.ok(signatureNeededAt(2600, 5200) > 1);
});

test('an emitter sees what is in reach, above its horizon and in line of sight', () => {
  const emitter = { x: 0, y: 40, z: 0, range: 16000, alive: true };
  const view = {};
  assert.equal(emitterView(emitter, { x: 0, y: 1500, z: 6000 }, 0.05, null, view).visible, true);
  assert.equal(emitterView(emitter, { x: 0, y: 1500, z: 9000 }, 0.05, null, view).visible, false, 'beyond the reach of a small echo');
  assert.equal(view.inRange, false);
  // Sea skimming at 8 km: in reach of a bright echo, but under the horizon.
  emitterView(emitter, { x: 0, y: 15, z: 8000 }, 0.9, null, view);
  assert.equal(view.inRange, true);
  assert.equal(view.aboveHorizon, false);
  assert.equal(view.visible, false);
  assert.ok(radarHorizonMetres(40, 15) < 8000);
  // A ridge between them hides the target.
  const ridge = (x, z) => (Math.abs(z - 3000) < 200 ? 900 : 0);
  assert.equal(emitterView(emitter, { x: 0, y: 300, z: 6000 }, 0.9, ridge, view).visible, false);
  assert.equal(terrainSightFree(ridge, 0, 40, 0, 0, 3000, 6000), true, 'over the ridge');
  assert.equal(emitterView({ ...emitter, alive: false }, { x: 0, y: 1500, z: 3000 }, 0.9, null, view).visible, false);
});

test('a track builds over consecutive paints and decays between them', () => {
  const track = createRadarTrack();
  const sweep = 9;
  const turn = (paint) => {
    let changed = stepRadarTrack(track, paint, 1 / 60, sweep);
    for (let i = 1; i < sweep * 60; i += 1) changed = stepRadarTrack(track, false, 1 / 60, sweep) || changed;
    return changed;
  };
  turn(true);
  assert.equal(track.tracked, false, 'one paint is not a track');
  assert.ok(track.quality > 0 && track.quality < RADAR_SWEEP.hold);
  assert.equal(track.painted, true);
  assert.equal(turn(true), true);
  assert.equal(track.tracked, true, 'the second consecutive paint holds it');
  turn(true);
  assert.ok(track.heldSeconds > sweep * 1.9 && track.quality > 0.55);
  turn(false);
  assert.equal(track.tracked, true, 'one missed sweep does not drop a solid track');
  turn(false);
  assert.equal(track.tracked, false, 'two missed sweeps do');
  assert.equal(track.heldSeconds, 0);
  assert.equal(track.painted, false);
  // A single paint fades away entirely.
  resetRadarTrack(track);
  turn(true);
  turn(false);
  turn(false);
  assert.equal(track.quality, 0);
  assert.equal(track.paints, 0);
  // A weak paint at the edge of the reach builds less.
  const weak = createRadarTrack();
  const strong = createRadarTrack();
  stepRadarTrack(weak, true, 1 / 60, sweep, 0);
  stepRadarTrack(strong, true, 1 / 60, sweep, 1);
  assert.ok(weak.quality < strong.quality);
});

/** Flies a Manta Sombra north past a picket ship 900 m to its west (about half the gap between two ships) and reports the paints and the track. */
function flyPast({ height, speed, gear = 0, startPhase }) {
  const ship = { id: 'picket', x: 0, y: 24, z: 0, range: 2600, sweepSeconds: 9, phaseDegrees: startPhase, alive: true };
  const craft = { x: 900, y: height, z: 3200, heading: 0, pitch: 0, roll: 0, mach: speed / 340, heightAboveSurface: height, gear, onGround: false };
  const track = createRadarTrack();
  const view = {};
  const dt = 1 / 60;
  let inBeam = false;
  let everTracked = false;
  let time = 0;
  while (craft.z > -3200) {
    const signature = radarSignatureOf('manta_sombra', craft, ship);
    emitterView(ship, craft, signature, null, view);
    const crossed = beamCrossed(beamAzimuthAt(ship, time), (360 * dt) / ship.sweepSeconds, compassBearing(ship.x, ship.z, craft.x, craft.z), 7);
    stepRadarTrack(track, crossed && !inBeam && view.visible, dt, ship.sweepSeconds);
    inBeam = crossed;
    everTracked = everTracked || track.tracked;
    craft.z -= speed * dt;
    time += dt;
  }
  return { paints: track.paints, everTracked, quality: track.quality };
}

test('the stealth test: low, clean and fast slips between the sweeps; high or gear down is tracked', () => {
  // Clean at 40 m and 230 m/s the echo is so small that the ship's reach is a short chord: whatever
  // the antenna's phase, at most one paint, never a track.
  for (const startPhase of [0, 60, 120, 180, 240, 300]) {
    const low = flyPast({ height: 40, speed: 230, startPhase });
    assert.equal(low.everTracked, false, `phase ${startPhase}: ${JSON.stringify(low)}`);
  }
  // With the gear down the same pass is painted sweep after sweep and held.
  let tracked = 0;
  for (const startPhase of [0, 60, 120, 180, 240, 300]) if (flyPast({ height: 400, speed: 120, gear: 1, startPhase }).everTracked) tracked += 1;
  assert.equal(tracked, 6);
  // Timing matters in between: slow and clean at 80 m, some phases catch the aircraft twice and some do not.
  const outcomes = new Set();
  for (let startPhase = 0; startPhase < 360; startPhase += 30) outcomes.add(flyPast({ height: 80, speed: 120, startPhase }).everTracked);
  assert.equal(outcomes.size, 2, 'the same pass is tracked or not depending on where the beam was');
});
