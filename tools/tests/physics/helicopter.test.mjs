// Tests of the helicopter: the hover assist holds a hover, the collective climbs at the catalog
// rate, a descent ends in a soft landing on the skids (ground effect felt near the ground), the
// cyclic reaches the catalog top speed, the tail rotor turns, the autopilot arrives, and a cold
// helicopter sits until its rotor has spun up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsWorld } from '../../../game/src/physics/PhysicsWorld.js';
import { PHYSICS_EVENT } from '../../../game/src/physics/physicsEvents.js';
import { Helicopter, deriveHelicopterTuning } from '../../../game/src/physics/aircraft/Helicopter.js';
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';

const spec = VEHICLE_CATALOG.police_helicopter;
const tuning = deriveHelicopterTuning(spec);

function spawn(options) {
  const world = new PhysicsWorld({ ground: { heightAt: () => 0 } });
  const heli = new Helicopter(world, tuning, options);
  return { world, heli };
}

function run(world, seconds, each) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    if (each) each(i);
    world.step();
  }
}

const at = (heli) => heli.body.modelPosition({ x: 0, y: 0, z: 0 });

test('with no input the hover assist holds a level hover in place', () => {
  const { world, heli } = spawn({ x: 5, y: 30, z: -8, heading: 1.2 });
  run(world, 10);
  const p = at(heli);
  assert.ok(Math.hypot(p.x - 5, p.z + 8) < 0.2, `stays put (${p.x}, ${p.z})`);
  assert.ok(Math.abs(p.y - 30) < 0.2, `holds its height (${p.y})`);
  assert.ok(heli.body.rotation[4] > 0.999, 'level');
  assert.ok(Math.abs(heli.load - 1) < 0.02, `rotor carries the weight (${heli.load})`);
});

test('the collective climbs at the catalog rate and the height is held when released', () => {
  const { world, heli } = spawn({ x: 0, y: 20, z: 0 });
  run(world, 5, () => { heli.input.collective = 1; });
  assert.ok(Math.abs(heli.verticalSpeed - spec.handling.climbRate) < 0.6, `climb ${heli.verticalSpeed}`);
  const released = at(heli).y;
  heli.input.collective = 0;
  run(world, 5);
  const held = at(heli).y;
  assert.ok(held > released + 2 && held < released + 6, `eases to a stop (${released} -> ${held})`);
  run(world, 6);
  assert.ok(Math.abs(at(heli).y - held) < 0.15, `holds after release (${held} -> ${at(heli).y})`);
  assert.ok(Math.abs(heli.verticalSpeed) < 0.25);
});

test('a full-down collective ends in a soft landing on the skids, with ground effect near the ground', () => {
  const { world, heli } = spawn({ x: 0, y: 25, z: 0 });
  let hardest = 0;
  let effectHigh = -1;
  let effectLow = 0;
  run(world, 20, () => {
    heli.input.collective = -1;
    if (heli.altitude > 20) effectHigh = heli.groundEffect;
    if (heli.altitude < 1 && heli.altitude > 0.2) effectLow = heli.groundEffect;
    for (let k = 0; k < world.events.count; k += 1) {
      const e = world.events.items[k];
      if (e.type === PHYSICS_EVENT.IMPACT) hardest = Math.max(hardest, e.speed);
    }
    world.events.clear();
  });
  assert.ok(at(heli).y < 0.05 && at(heli).y > -0.1, `on the ground (${at(heli).y})`);
  assert.ok(hardest < 1.2, `touchdown at ${hardest} m/s`);
  assert.equal(effectHigh, 0);
  assert.ok(effectLow > 0.15, `ground effect ${effectLow}`);
  const v = heli.body.linearVelocity;
  assert.ok(Math.hypot(v.x, v.z) < 0.05, 'sits still on its skids');
});

test('full forward cyclic reaches the catalog top speed without losing height', () => {
  const { world, heli } = spawn({ x: 0, y: 60, z: 0, heading: Math.PI / 2 });
  run(world, 25, () => { heli.input.pitch = 1; });
  assert.ok(heli.speed > spec.handling.topSpeed * 0.95, `speed ${heli.speed}`);
  assert.ok(heli.speed < spec.handling.topSpeed * 1.05);
  assert.ok(Math.abs(at(heli).y - 60) < 1.5, `height ${at(heli).y}`);
  assert.ok(at(heli).x > 500, 'flew along its nose (heading east)');
  // Letting go brings it back to a hover.
  run(world, 15, () => { heli.input.pitch = 0; });
  assert.ok(Math.abs(heli.speed) < 1, `slows to a hover (${heli.speed})`);
});

test('the tail rotor turns the nose at the catalog rate; right is clockwise', () => {
  const { world, heli } = spawn({ x: 0, y: 30, z: 0 });
  run(world, 1.5, () => { heli.input.yaw = 1; });
  const turned = heli.heading;
  assert.ok(turned > 1 && turned < 1.6, `turned ${turned}`);
  run(world, 2, () => { heli.input.yaw = 0; });
  assert.ok(Math.abs(heli.heading - turned) < 0.25, 'stops turning');
});

test('yaw in fast flight banks into a wide curve that the flight path follows', () => {
  const { world, heli } = spawn({ x: 0, y: 40, z: 0 });
  run(world, 15, () => { heli.input.pitch = 1; });
  let worstSlip = 0;
  run(world, 10, (i) => {
    heli.input.pitch = 1;
    heli.input.yaw = 1;
    const v = heli.body.linearVelocity;
    let slip = Math.atan2(v.x, -v.z) - heli.heading;
    slip = Math.atan2(Math.sin(slip), Math.cos(slip));
    if (i > 120) worstSlip = Math.max(worstSlip, Math.abs(slip));
  });
  assert.ok(heli.heading > 1, `turned right (${heli.heading})`);
  assert.ok(worstSlip < 0.3, `flies where it points (slip ${worstSlip})`);
  assert.ok(heli.speed > spec.handling.topSpeed * 0.5, `keeps flying (${heli.speed})`);
  assert.ok(heli.body.rotation[3] < -0.2, 'banked into the turn');
  assert.ok(Math.abs(at(heli).y - 40) < 2, `level turn (${at(heli).y})`);
});

test('the autopilot flies to a point and hovers there', () => {
  const { world, heli } = spawn({ x: 0, y: 30, z: 0 });
  heli.flyTowards(200, 50, -150);
  let arrivedAt = null;
  run(world, 30, (i) => { if (arrivedAt === null && heli.arrived) arrivedAt = i / 60; });
  assert.ok(arrivedAt !== null && arrivedAt < 20, `arrived after ${arrivedAt} s`);
  const p = at(heli);
  assert.ok(Math.hypot(p.x - 200, p.y - 50, p.z + 150) < 2, 'hovers on the point');
});

test('a cold helicopter sits on the ground until the rotor spins up, then lifts off', () => {
  const { world, heli } = spawn({ x: 0, z: 0 });
  assert.equal(heli.engineOn, false);
  run(world, 3, () => { heli.input.collective = 1; });
  assert.ok(Math.abs(at(heli).y) < 0.05, 'no lift with the engine off');
  heli.engineOn = true;
  run(world, 2, () => { heli.input.collective = 1; });
  assert.ok(heli.rotorSpeed < 0.6 && at(heli).y < 0.1, 'still spinning up');
  run(world, 6, () => { heli.input.collective = 1; });
  assert.equal(heli.rotorSpeed, 1);
  assert.ok(at(heli).y > 8, `airborne (${at(heli).y})`);
});

test('without the assist the inputs are attitude and thrust', () => {
  const { world, heli } = spawn({ x: 0, y: 60, z: 0 });
  heli.assist = false;
  run(world, 4, () => { heli.input.pitch = 0.5; });
  assert.ok(heli.speed > 5, `accelerates nose-down (${heli.speed})`);
  assert.ok(heli.body.rotation[4] < 0.99, 'tilted');
});
