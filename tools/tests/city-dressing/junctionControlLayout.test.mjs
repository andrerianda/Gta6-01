// Tests of the junction control layout: signal masts on the approach's right looking at the
// oncoming drivers with the arm over the road, walker signals facing across, stop signs only
// where an approach must stop, and planting cleared around lamps and signals.
import assert from 'node:assert/strict';
import test from 'node:test';
import { clearPlantingAround, layOutJunctionControls, rotationFacing } from '../../../game/src/world/props/junctionControlLayout.js';

const segments = [{ halfWidth: 7 }, { halfWidth: 5 }, { halfWidth: 7 }, { halfWidth: 5 }];
const arms = [
  { segment: 0, dx: 0, dz: -1, trim: 12, phase: 0 },
  { segment: 1, dx: 1, dz: 0, trim: 14, phase: 1, mustStop: true },
  { segment: 2, dx: 0, dz: 1, trim: 12, phase: 0 },
  { segment: 3, dx: -1, dz: 0, trim: 14, phase: 1, mustStop: true },
];
/** Where an object's local -Z and +X point after its rotation about +Y. */
const facing = (rotationY) => ({ x: -Math.sin(rotationY), z: -Math.cos(rotationY) });
const armX = (rotationY) => ({ x: Math.cos(rotationY), z: -Math.sin(rotationY) });

test('a signalled junction has a mast per approach, on its right, looking at the drivers', () => {
  const node = { id: 4, x: 100, z: 50, control: 'signals', signal: { phases: [], allRed: 2, cycle: 60, offset: 0 }, arms };
  const items = layOutJunctionControls(node, segments);
  const masts = items.filter((item) => item.object === 'traffic_signal_mast');
  assert.equal(masts.length, 4);
  assert.equal(items.filter((item) => item.object === 'pedestrian_signal').length, 8);
  assert.equal(items.filter((item) => item.object === 'street_name_post').length, 1);
  // Arm 0 runs to -Z: drivers come from -Z heading +Z; their right is -X.
  const mast = masts[0];
  assert.ok(mast.z < node.z - 12, 'beyond the junction trim on the approach');
  assert.ok(mast.x < node.x - 7, 'outside the kerb on the drivers\' right');
  const look = facing(mast.rotationY);
  assert.ok(Math.abs(look.x) < 1e-9 && Math.abs(look.z + 1) < 1e-9, 'heads look out along the arm, at the drivers');
  const reach = armX(mast.rotationY);
  assert.ok(Math.abs(reach.x - 1) < 1e-9, 'mast arm reaches over the road');
  assert.equal(mast.phase, 0);
  assert.equal(mast.nodeId, 4);
});

test('walker signals face each other across the arm', () => {
  const node = { id: 1, x: 0, z: 0, control: 'signals', signal: { phases: [], allRed: 2, cycle: 60, offset: 0 }, arms };
  const walkers = layOutJunctionControls(node, segments).filter((item) => item.object === 'pedestrian_signal' && item.phase === 0).slice(0, 2);
  const [a, b] = walkers;
  const lookA = facing(a.rotationY);
  assert.ok(lookA.x * (b.x - a.x) + lookA.z * (b.z - a.z) > 0, 'the first looks towards the second');
  const lookB = facing(b.rotationY);
  assert.ok(lookB.x * (a.x - b.x) + lookB.z * (a.z - b.z) > 0, 'the second looks towards the first');
});

test('a stop junction signs only the approaches that must stop', () => {
  const node = { id: 2, x: 0, z: 0, control: 'stop', arms };
  const items = layOutJunctionControls(node, segments);
  assert.equal(items.filter((item) => item.object === 'sign_octagon').length, 2);
  assert.equal(items.filter((item) => item.object === 'traffic_signal_mast').length, 0);
  assert.equal(layOutJunctionControls({ id: 3, x: 0, z: 0, control: 'none', arms }, segments).length, 0);
});

test('rotationFacing turns -Z to the direction', () => {
  for (const [dx, dz] of [[1, 0], [0, 1], [-0.6, 0.8]]) {
    const look = facing(rotationFacing(dx, dz));
    assert.ok(Math.abs(look.x - dx) < 1e-9 && Math.abs(look.z - dz) < 1e-9);
  }
});

test('planting is cleared around lamps and signals', () => {
  const plants = [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 1 }];
  const kept = clearPlantingAround(plants, [{ x: 0.5, z: 0.5 }, { x: 10, z: 0 }]);
  assert.deepEqual(kept, [{ x: 5, z: 0 }]);
});

test('a name post carries the street of each blade: blade 1 along arm 0, blade 2 across it', () => {
  const named = segments.map((segment, i) => ({ ...segment, name: `Calle ${i}`, district: i % 2 ? 'centro' : 'barrio_hierro' }));
  const node = { id: 7, x: 0, z: 0, control: 'stop', arms };
  const post = layOutJunctionControls(node, named).find((item) => item.object === 'street_name_post');
  assert.deepEqual(post.names, ['Calle 0', 'Calle 1']);
  assert.deepEqual(post.districts, ['barrio_hierro', 'centro']);
  // Blade 1 lies along the object's +X, which must run along arm 0 (here -Z).
  const along = armX(post.rotationY);
  assert.ok(Math.abs(along.x) < 1e-9 && Math.abs(Math.abs(along.z) - 1) < 1e-9);
});
