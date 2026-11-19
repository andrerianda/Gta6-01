// Keeping and losing the lead: line of sight over terrain, range by radar signature, the clutter
// low over the surface, ground guidance until the coastal tower is gone, the search and the return,
// giving up at the border, and the two designed escapes (Garza Negra high and fast, Manta Sombra low).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLead, makePatrol, runPatrol, stagesOf, linesOf } from './airGuardTestKit.mjs';
import { AIR_GUARD_TUNING } from '../../../game/src/flight/defence/airGuardTuning.js';
import { lineOfSight, ownDetectionRange, seesTarget, trackSourceOf } from '../../../game/src/flight/defence/interceptTracking.js';
import { SEA_AND_AIRSPACE_CHART } from '../../../game/src/catalog/seaAndAirspaceChart.js';

const TRACKING = AIR_GUARD_TUNING.tracking;
/** A ridge 300 m high across x = -1000..-800; sea elsewhere. */
const ridge = (x) => (x > -1000 && x < -800 ? 300 : -4);

test('line of sight: a ridge blocks it, the open sea never does', () => {
  assert.equal(lineOfSight(0, 200, 0, -2000, 100, 0, ridge, 14, 14), false);
  assert.equal(lineOfSight(0, 900, 0, -2000, 900, 0, ridge, 14, 14), true);
  assert.equal(lineOfSight(-3000, 30, 0, -6000, 20, 0, ridge, 14, 14), true);
  assert.equal(lineOfSight(0, 5, 0, 500, 5, 0, null, 14, 14), true);
});

test('own detection range scales with the signature and shrinks low over the surface', () => {
  assert.equal(ownDetectionRange(1, 3000, TRACKING), TRACKING.radarRange);
  assert.ok(ownDetectionRange(0.3, 600, TRACKING) > 4000);
  assert.equal(ownDetectionRange(0.12, 100, TRACKING), TRACKING.eyesRange);
  assert.ok(ownDetectionRange(0.9, 100, TRACKING) < ownDetectionRange(0.9, 600, TRACKING));
  const craft = { x: 0, y: 800, z: 0, phase: 'air' };
  const far = { x: -5000, y: 600, z: 0, signature: 0.3, heightAboveSurface: 600 };
  assert.equal(seesTarget(craft, far, null, TRACKING), false);
  assert.equal(seesTarget(craft, { ...far, x: -3500 }, null, TRACKING), true);
  assert.equal(trackSourceOf([craft], far, { guidance: true }, TRACKING), 'guidance');
  assert.equal(trackSourceOf([craft], far, {}, TRACKING), null);
  assert.equal(trackSourceOf([{ ...craft, phase: 'roll' }], { ...far, x: -3500 }, {}, TRACKING), null);
});

test('lost by line of sight: behind a ridge without guidance the pair searches, then returns', () => {
  const patrol = makePatrol(2);
  const lead = makeLead({ x: -3000, z: -1500, y: 60, speed: 150, signature: 0.5 });
  patrol.place('intercept', lead);
  // The ground rises between them wherever they are: a wall the lead hides behind.
  const wall = () => 400;
  const log = runPatrol(patrol, lead, 120, { env: { guidance: false, heightAt: wall }, until: (l) => stagesOf(l).includes('returning') });
  assert.deepEqual(stagesOf(log), ['intercept', 'searching', 'returning']);
  assert.deepEqual(linesOf(log), ['airGuard.lost', 'airGuard.searchEnd']);
  const searched = log.stages[2][0] - log.stages[1][0];
  assert.ok(Math.abs(searched - TRACKING.searchSeconds) < 1, `searched ${searched} s`);
  assert.deepEqual(log.standDowns, ['lost']);
});

test('ground guidance keeps the track through the same wall until the tower is gone', () => {
  const patrol = makePatrol(2);
  const lead = makeLead({ x: -3000, z: -1500, y: 60, speed: 150, signature: 0.5 });
  patrol.place('intercept', lead);
  const wall = () => 400;
  let towerDestroyed = false;
  const env = () => ({ guidance: !towerDestroyed, heightAt: wall });
  const log = runPatrol(patrol, lead, 12, { env });
  assert.equal(patrol.trackSource, 'guidance');
  assert.ok(!stagesOf(log).includes('searching'));
  towerDestroyed = true;
  runPatrol(patrol, lead, 10, { env, log });
  assert.equal(patrol.trackSource, null);
  assert.equal(stagesOf(log).at(-1), 'searching');
});

test('a lost target that shows itself again is picked up from the search', () => {
  const patrol = makePatrol(2);
  const lead = makeLead({ x: -3000, z: -1500, y: 600, speed: 150, signature: 0.5 });
  patrol.place('intercept', lead);
  let hidden = true;
  const env = () => ({ guidance: false, heightAt: hidden ? () => 5000 : null });
  const log = runPatrol(patrol, lead, 10, { env });
  assert.equal(patrol.stage, 'searching');
  hidden = false;
  runPatrol(patrol, lead, 2, { env, log });
  assert.equal(patrol.stage, 'intercept');
  assert.ok(linesOf(log).includes('airGuard.reacquired'));
});

test('the Garza Negra escape: above 20 km at Mach 2.5 the pair falls behind and loses it by range', () => {
  const patrol = makePatrol(4);
  const lead = makeLead({ modelId: 'garza_negra', x: -1500, z: -1500, y: 21000, speed: 2.5 * 295, signature: 0.95 });
  patrol.place('intercept', lead);
  let widest = 0;
  const log = runPatrol(patrol, lead, 200, {
    env: { guidance: false },
    fly: (plane) => { widest = Math.max(widest, Math.hypot(plane.x - patrol.interceptors[0].x, plane.z - patrol.interceptors[0].z)); },
    until: (l) => stagesOf(l).includes('searching'),
  });
  assert.deepEqual(stagesOf(log), ['intercept', 'searching']);
  assert.ok(patrol.interceptors[0].y <= AIR_GUARD_TUNING.envelope.ceiling);
  assert.ok(widest > TRACKING.radarRange * 0.9, `gap ${Math.round(widest)} m`);
  assert.equal(log.bursts.length, 0);
});

test('a Garza Negra that stays slow and low enough is caught', () => {
  const patrol = makePatrol(4);
  const lead = makeLead({ modelId: 'garza_negra', x: -1500, z: -1500, y: 9000, speed: 300, signature: 0.95 });
  patrol.place('intercept', lead);
  const log = runPatrol(patrol, lead, 90, { env: { guidance: false }, until: (l) => stagesOf(l).includes('formate') });
  assert.ok(stagesOf(log).includes('formate'));
});

test('the Manta Sombra escape: low, a small signature and no tower, and the pair never finds it', () => {
  const patrol = makePatrol(4);
  const lead = makeLead({ x: -3000, z: -1500, y: 100, speed: 235, signature: 0.12 });
  patrol.place('intercept', lead);
  const log = runPatrol(patrol, lead, 90, { env: { guidance: false }, until: (l) => stagesOf(l).includes('returning') });
  assert.deepEqual(stagesOf(log), ['intercept', 'searching', 'returning']);
  assert.equal(log.bursts.length, 0);
});

test('the same Manta Sombra with the tower still guiding, or flying high, is intercepted', () => {
  for (const [y, signature, guidance] of [[100, 0.12, true], [900, 0.36, false]]) {
    const patrol = makePatrol(4);
    const lead = makeLead({ x: -3000, z: -1500, y, speed: 235, signature });
    patrol.place('intercept', lead);
    const log = runPatrol(patrol, lead, 120, { env: { guidance }, until: (l) => stagesOf(l).includes('order') });
    assert.ok(stagesOf(log).includes('order'), `y ${y} guidance ${guidance}: ${stagesOf(log).join(',')}`);
  }
});

test('with the sea open the pair gives up at the border with a last line', () => {
  const patrol = makePatrol(4);
  const lead = makeLead({ x: -6000, z: 150, y: 800, speed: 235, headingDegrees: 270 });
  patrol.place('wing', lead, 'alert');
  const log = runPatrol(patrol, lead, 30, { env: { guidance: true, seaOpen: true, relentless: true }, until: (l) => stagesOf(l).includes('returning') });
  assert.equal(stagesOf(log).at(-1), 'returning');
  assert.equal(linesOf(log).at(-1), 'airGuard.border');
  assert.deepEqual(log.standDowns, ['border']);
  const uno = patrol.interceptors[0];
  const centre = SEA_AND_AIRSPACE_CHART.centre;
  assert.ok(Math.abs(Math.hypot(uno.x - centre.x, uno.z - centre.z) - SEA_AND_AIRSPACE_CHART.airGuard.borderRadius) < 30);
  assert.equal(patrol.brokeOffAtBorder, true);
  assert.equal(patrol.scramble('alert', lead), false);
});
