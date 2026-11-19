// The guided bomb as numbers: the time of fall, the release envelope, the steered fall (a hit from
// inside the envelope, a miss from outside it, the fins never beyond their authority), and the
// rule that only the radar tower may be bombed.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GUIDED_BOMB, bombImpact, createBombState, createReleaseSolution, designateTarget, isValidBombTarget, releaseBomb, releaseSolution, stepBomb,
  timeOfFall,
} from '../../../game/src/flight/radar/guidedBombFlight.js';

const TARGET = { x: 0, y: 20, z: 0 };
/** An aircraft flying north at `speed`, `range` metres south of the target and `offset` metres east of the line. */
const craftAt = (range, height = 1520, speed = 200, offset = 0) => ({ x: offset, y: height, z: range, vx: 0, vy: 0, vz: -speed, roll: 0, heading: 0 });

function drop(craft, ground = () => 0) {
  const bomb = releaseBomb(createBombState(), craft, TARGET);
  let steps = 0;
  let maxSteer = 0;
  let previous = { vx: bomb.vx, vz: bomb.vz };
  while (bomb.active && steps < 60 * 120) {
    stepBomb(bomb, 1 / 60, ground(bomb.x, bomb.z));
    maxSteer = Math.max(maxSteer, Math.hypot(bomb.vx - previous.vx, bomb.vz - previous.vz) * 60);
    previous = { vx: bomb.vx, vz: bomb.vz };
    steps += 1;
  }
  return { bomb, seconds: steps / 60, maxSteer, ...bombImpact(bomb, {}) };
}

test('time of fall', () => {
  assert.equal(timeOfFall(0), 0);
  assert.ok(Math.abs(timeOfFall(1500) - Math.sqrt(3000 / 9.81)) < 1e-9);
  assert.ok(timeOfFall(1500, -30) < timeOfFall(1500) && timeOfFall(1500, 30) > timeOfFall(1500));
});

test('the release solution: in the envelope near the unguided range, refused elsewhere', () => {
  const s = createReleaseSolution();
  const unguided = 200 * timeOfFall(1500);
  releaseSolution(craftAt(unguided), TARGET, s);
  assert.equal(s.reason, 'RELEASE');
  assert.equal(s.inEnvelope, true);
  assert.ok(s.missUnguided < 1 && Math.abs(s.range - unguided) < 1e-6 && Math.abs(s.timeOfFall - 17.49) < 0.05);
  assert.ok(s.authority > 500 && s.authority < 700, `the fins reach about 640 m from 1500 m, got ${s.authority}`);
  assert.equal(releaseSolution(craftAt(3000), TARGET, s).inEnvelope, true, '3 km out at 1500 m and 200 m/s is in the envelope');
  assert.equal(releaseSolution(craftAt(6000), TARGET, s).reason, 'TOO FAR');
  assert.ok(s.alongError > 0 && !s.inRange);
  assert.equal(releaseSolution(craftAt(1500), TARGET, s).reason, 'TOO CLOSE');
  assert.equal(releaseSolution(craftAt(unguided, 1520, 200, 900), TARGET, s).reason, 'OFF AXIS');
  assert.ok(s.inRange && s.crossError < 0, 'the target lies left of the track');
  assert.equal(releaseSolution(craftAt(700, 250), TARGET, s).reason, 'TOO LOW');
  assert.equal(releaseSolution({ ...craftAt(unguided), roll: 0.9 }, TARGET, s).reason, 'UNSTABLE');
  assert.equal(releaseSolution(craftAt(unguided), null, s).reason, 'NO TARGET');
  assert.equal(s.inEnvelope, false);
});

test('released inside the envelope the bomb glides onto the target', () => {
  const s = createReleaseSolution();
  for (const [range, offset, speed, height] of [[3500, 0, 200, 1520], [3000, 0, 200, 1520], [3900, 150, 200, 1520], [3300, -350, 200, 1520], [2900, 100, 230, 820], [5200, 0, 240, 3020]]) {
    const craft = craftAt(range, height, speed, offset);
    assert.equal(releaseSolution(craft, TARGET, s).inEnvelope, true, `in the envelope at ${range} m, ${offset} m off`);
    const fall = drop(craft);
    assert.ok(fall.hit && fall.missDistance < 6, `hit from ${range} m, ${offset} m off: missed by ${fall.missDistance.toFixed(1)} m`);
    assert.ok(Math.abs(fall.seconds - s.timeOfFall) < 0.8, 'the fall takes the time the screen showed');
    assert.ok(fall.maxSteer <= GUIDED_BOMB.steerAcceleration * 1.001, `steering stays within the fins' authority, got ${fall.maxSteer}`);
    assert.equal(fall.bomb.y, TARGET.y);
  }
});

test('dropped outside the envelope it runs out of authority and misses', () => {
  const s = createReleaseSolution();
  for (const [range, offset] of [[6000, 0], [1200, 0], [3500, 1400]]) {
    const craft = craftAt(range, 1520, 200, offset);
    assert.equal(releaseSolution(craft, TARGET, s).inEnvelope, false);
    const fall = drop(craft);
    assert.equal(fall.hit, false);
    assert.ok(fall.missDistance > 100, `missed by ${fall.missDistance.toFixed(0)} m`);
    assert.ok(fall.maxSteer <= GUIDED_BOMB.steerAcceleration * 1.001);
  }
  // Rising ground short of the target stops it early.
  const short = drop(craftAt(3500), (x, z) => (z > 400 ? 600 : 0));
  assert.equal(short.hit, false);
  assert.equal(short.bomb.y, 600);
  // A bomb at rest does nothing.
  const idle = createBombState();
  assert.equal(stepBomb(idle, 1 / 60), false);
});

test('only the radar tower is a valid target', () => {
  const tower = { id: 'radar_cabo_lejano', kind: 'tower', x: 0, z: 0, alive: true };
  const ship = { id: 'picket_1', kind: 'ship', x: 300, z: -500, alive: true };
  assert.equal(isValidBombTarget(tower), true);
  assert.equal(isValidBombTarget(ship), false);
  assert.equal(isValidBombTarget({ kind: 'building', alive: true }), false);
  assert.equal(isValidBombTarget({ ...tower, alive: false }), false);
  assert.equal(isValidBombTarget(null), false);
  const craft = { x: 0, z: 3000, heading: 0 };
  assert.equal(designateTarget(craft, [tower]), tower);
  assert.equal(designateTarget({ ...craft, heading: Math.PI }, [tower]), null, 'behind the aircraft: outside the seeker');
  assert.equal(designateTarget({ x: 0, z: 20000, heading: 0 }, [tower]), null, 'beyond the seeker');
  assert.equal(designateTarget({ x: 600, z: 100, heading: 0 }, [tower, ship]), ship, 'the nearest ahead is designated, valid or not');
  assert.equal(designateTarget(craft, [{ ...tower, alive: false }]), null);
});
