// Everyday activities of the crowd: companions keep their places beside the leader whichever way
// the leader faces, gestures suit the mode, and bench seats from the dressing are read in any of
// the accepted shapes and handed out one person per seat.
import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPANION_SLOTS, companionSpot, createBenchSeats, gestureFor, seatPlace } from '../../../game/src/pedestrians/crowdActivities.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('companions walk beside the leader, on its right and left, whatever its heading', () => {
  const out = { x: 0, z: 0 };
  // Facing -Z (yaw 0): right is +X.
  companionSpot(10, 20, 0, 0, out);
  assert.ok(close(out.x, 10 + COMPANION_SLOTS[0].right) && close(out.z, 20 - COMPANION_SLOTS[0].ahead));
  companionSpot(10, 20, 0, 1, out);
  assert.ok(out.x < 10, 'the second slot is on the left');
  // Facing +X (yaw -PI/2): right is +Z.
  companionSpot(0, 0, -Math.PI / 2, 0, out);
  assert.ok(close(out.z, COMPANION_SLOTS[0].right, 1e-6) && close(out.x, COMPANION_SLOTS[0].ahead, 1e-6));
  // Distance from the leader stays the slot's at any heading.
  for (let yaw = -3; yaw <= 3; yaw += 0.7) {
    companionSpot(5, 5, yaw, 1, out);
    assert.ok(close(Math.hypot(out.x - 5, out.z - 5), Math.hypot(COMPANION_SLOTS[1].right, COMPANION_SLOTS[1].ahead), 1e-9));
  }
});

test('gestures suit the mode', () => {
  const always = (v) => () => v;
  assert.equal(gestureFor('call', always(0.99)), 'phone');
  assert.equal(gestureFor('chat', always(0.1)), 'talk');
  assert.equal(gestureFor('walk', always(0.3)), null);
  assert.equal(gestureFor('walk', always(0.3), true), 'talk', 'groups talk as they walk');
  assert.equal(gestureFor('walk', always(0.05)), 'phone');
  assert.equal(gestureFor('gawk', always(0.2)), 'point');
  assert.equal(gestureFor('flee', always(0.1)), 'panic');
  assert.equal(gestureFor('cower', always(0.1)), null);
  assert.equal(gestureFor('fight', always(0.1)), null);
});

test('bench seats: every published shape gives the sitter the same facing and height', () => {
  const a = seatPlace({ x: 1, y: 3.45, z: 2, yaw: 0.5 }, 3);
  assert.ok(close(a.yaw, 0.5) && close(a.seatHeight, 0.45, 1e-9));
  const b = seatPlace({ x: 1, z: 2, facingX: -Math.sin(0.5), facingZ: -Math.cos(0.5), seatHeight: 0.46 }, 0);
  assert.ok(close(b.yaw, 0.5, 1e-9) && b.seatHeight === 0.46);
  const c = seatPlace({ x: 1, z: 2, heading: -0.5 }, 0);
  assert.ok(close(c.yaw, 0.5));
  assert.equal(seatPlace({ id: 'bench_7:1', x: 0, z: 0 }, 0).key, 'bench_7:1');
});

test('a seat is handed to one person at a time; nothing without a published source', () => {
  const seats = [{ x: 0, y: 0.45, z: 0, yaw: 0 }, { x: 0.6, y: 0.45, z: 0, yaw: 0 }, { x: 30, y: 0.45, z: 0, yaw: 0 }];
  const city = { groundHeightAt: () => 0, benchSeatsNear: (x, z, r) => seats.filter((s) => Math.hypot(s.x - x, s.z - z) <= r) };
  const benches = createBenchSeats(city);
  assert.equal(benches.available, true);
  const first = benches.freeNear(0.1, 0, 5);
  assert.ok(first && first.x === 0);
  benches.take(first, 1);
  const second = benches.freeNear(0.1, 0, 5);
  assert.ok(second && second.x === 0.6, 'the taken seat is skipped');
  benches.take(second, 2);
  assert.equal(benches.freeNear(0.1, 0, 5), null);
  benches.free(first);
  assert.equal(benches.freeNear(0.1, 0, 5).x, 0);
  const none = createBenchSeats({ groundHeightAt: () => 0 });
  assert.equal(none.available, false);
  assert.equal(none.freeNear(0, 0, 10), null);
  const viaDressing = createBenchSeats({ groundHeightAt: () => 0, dressing: { benchSeatsNear: () => seats } });
  assert.equal(viaDressing.available, true);
});
