// Tests of the boats on the injected sea surface: floating at the draft, riding waves, the top
// speed with planing, turning, and running aground on a beach.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsWorld } from '../../../game/src/physics/PhysicsWorld.js';
import { Boat, deriveBoatTuning } from '../../../game/src/physics/watercraft/Boat.js';
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';

const deepSea = { heightAt: () => -25 };

function spawn(id, worldOptions = {}, options = {}) {
  const world = new PhysicsWorld({ ground: deepSea, ...worldOptions });
  const boat = new Boat(world, deriveBoatTuning(VEHICLE_CATALOG[id]), options);
  return { world, boat };
}

function run(world, seconds, each) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    if (each) each(i);
    world.step();
  }
}

function keel(boat, out = { x: 0, y: 0, z: 0 }) {
  return boat.body.modelPosition(out);
}

test('a boat floats at its draft on a calm sea and settles level', () => {
  for (const id of ['speedboat', 'police_boat']) {
    const { world, boat } = spawn(id);
    boat.body.position.y += 0.8;
    run(world, 8);
    const draft = VEHICLE_CATALOG[id].dimensions.draft;
    const y = keel(boat).y;
    assert.ok(Math.abs(y + draft) < 0.12, `${id} keel at ${y}, draft ${draft}`);
    assert.ok(boat.body.rotation[4] > 0.995, `${id} level`);
    const v = boat.body.linearVelocity;
    assert.ok(Math.hypot(v.x, v.y, v.z) < 0.05, `${id} at rest`);
  }
});

test('it rides the waves without sinking or capsizing', () => {
  const waves = (x, z, t) => 0.45 * Math.sin(x * 0.25 + t * 1.3) + 0.25 * Math.sin(z * 0.31 - t * 0.9);
  const { world, boat } = spawn('speedboat', { waterHeightAt: waves }, { heading: 0.7 });
  let lowest = Infinity;
  let worstUp = 1;
  let range = [Infinity, -Infinity];
  run(world, 20, (i) => {
    boat.input.drive = i > 600 ? 0.6 : 0;
    boat.input.steer = i > 900 ? 0.5 : 0;
    const p = keel(boat);
    const relative = p.y - waves(p.x, p.z, world.time);
    if (i > 120) lowest = Math.min(lowest, relative);
    if (i < 600 && i > 120) range = [Math.min(range[0], p.y), Math.max(range[1], p.y)];
    worstUp = Math.min(worstUp, boat.body.rotation[4]);
  });
  assert.ok(lowest > -1.4, `keel never far under the surface (${lowest})`);
  assert.ok(range[1] - range[0] > 0.3, `heaves with the waves (${range})`);
  assert.ok(worstUp > 0.8, `stays upright (${worstUp})`);
});

for (const id of ['speedboat', 'police_boat']) {
  test(`${id} reaches its top speed on the plane and turns at its turn rate`, () => {
    const { world, boat } = spawn(id);
    const spec = VEHICLE_CATALOG[id];
    let ninetyAt = null;
    let pitchMax = 0;
    run(world, spec.handling.timeToTopSpeed * 3, (i) => {
      boat.input.drive = 1;
      if (ninetyAt === null && boat.speed > spec.handling.topSpeed * 0.9) ninetyAt = i / 60;
      pitchMax = Math.max(pitchMax, -boat.body.rotation[8 - 3]);
    });
    const top = spec.handling.topSpeed;
    console.log(`${id}: top ${boat.speed.toFixed(1)} m/s (${top}), 90% at ${ninetyAt?.toFixed(1)} s (catalog to top ${spec.handling.timeToTopSpeed}), planing ${boat.planing.toFixed(2)}, bow pitch max ${(pitchMax * 57.3).toFixed(1)} deg`);
    assert.ok(Math.abs(boat.speed - top) / top < 0.05, `top speed ${boat.speed}`);
    assert.ok(boat.planing > 0.95);
    assert.ok(boat.spray > 0.5 && boat.wake > 0.5);
    assert.ok(pitchMax < 0.2, 'bow lift stays moderate');
    // The spray anchors sit at the bow on either side, the wake anchor at the stern (heading 0: bow to -Z).
    const keelAt = keel(boat);
    const left = boat.anchorPosition(boat.tuning.sprayAnchors[0], { x: 0, y: 0, z: 0 });
    const right = boat.anchorPosition(boat.tuning.sprayAnchors[1], { x: 0, y: 0, z: 0 });
    const stern = boat.anchorPosition(boat.tuning.wakeAnchor, { x: 0, y: 0, z: 0 });
    const forward = { x: -boat.body.rotation[2], z: -boat.body.rotation[8] };
    const ahead = (p) => (p.x - keelAt.x) * forward.x + (p.z - keelAt.z) * forward.z;
    assert.ok(ahead(left) > 1 && ahead(right) > 1 && ahead(stern) < -1, 'bow and stern anchors');
    assert.ok(Math.hypot(left.x - right.x, left.z - right.z) > 1, 'spray on both sides');
    const startHeading = boat.heading;
    let turned = 0;
    let previous = startHeading;
    run(world, 3, () => {
      boat.input.drive = 0.7;
      boat.input.steer = 1;
      let delta = boat.heading - previous;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      turned += delta;
      previous = boat.heading;
    });
    const rate = turned / 3;
    console.log(`${id}: turn rate ${rate.toFixed(2)} rad/s (catalog ${spec.handling.turnRate}), lean ${(-boat.body.rotation[3] * 57.3).toFixed(1)} deg`);
    assert.ok(rate > spec.handling.turnRate * 0.6 && rate < spec.handling.turnRate * 1.2, `turns right at ${rate}`);
    assert.ok(boat.body.rotation[4] > 0.9);
  });
}

test('a boat run onto a sandy beach grounds, stops and stays upright', () => {
  // The sea bed rises towards -Z from 6 m deep; the shore line is at z = -60, a sand slope beyond.
  const { world, boat } = spawn('speedboat', { ground: { heightAt: (x, z) => (z > -40 ? -6 : Math.max(-6, (-40 - z) * 0.15 - 3)) } });
  run(world, 14, () => { boat.input.drive = 0.6; });
  const p = keel(boat);
  console.log(`beached at z ${p.z.toFixed(1)}, keel ${p.y.toFixed(2)}, propeller wet ${boat.propellerWet}`);
  assert.ok(p.z < -55, `reached the beach (${p.z})`);
  assert.ok(Math.abs(boat.speed) < 1.5, `stopped (${boat.speed})`);
  assert.ok(boat.body.rotation[4] > 0.8, 'upright');
  run(world, 3, () => { boat.input.drive = 0; });
  assert.ok(Math.abs(boat.speed) < 0.5);
});

test('boats are deterministic', () => {
  const sail = () => {
    const waves = (x, z, t) => 0.3 * Math.sin(x * 0.2 + t);
    const { world, boat } = spawn('police_boat', { waterHeightAt: waves });
    run(world, 6, (i) => { boat.input.drive = 1; boat.input.steer = Math.sin(i / 50); });
    return world.digest();
  };
  assert.equal(sail(), sail());
});
