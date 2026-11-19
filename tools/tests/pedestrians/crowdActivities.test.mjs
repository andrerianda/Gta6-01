// Everyday activities of the crowd: companions keep their places beside the leader whichever way
// the leader faces, gestures suit the mode, and bench seats from the dressing are read in any of
// the accepted shapes and handed out one person per seat.
import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPANION_SLOTS, companionSpot, createBenchSeats, gestureFor, seatPlace, SITTABLE_SEATS } from '../../../game/src/pedestrians/crowdActivities.js';

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
  const c = seatPlace({ x: 1, y: 0.45, z: 2, heading: -0.5 }, 0);
  assert.ok(close(c.yaw, 0.5));
  assert.equal(seatPlace({ id: 'bench_7:1', x: 0, y: 0.46, z: 0 }, 0).key, 'bench_7:1');
});

test('nobody sits on air: only drawn street seats at their real height', () => {
  // The dressing's records (sectorClutterDressing.js): y = base + the anchor's height.
  const bench = seatPlace({ x: 0, y: 10.45, z: 0, heading: -1, object: 'bench_slat' }, 10);
  assert.ok(bench && close(bench.seatHeight, 0.45, 1e-9) && close(bench.yaw, 1), 'hips on the slats, facing away from the back rest');
  assert.ok(close(seatPlace({ x: 0, y: 0.48, z: 0, heading: 0, object: 'bus_shelter' }, 0).seatHeight, 0.48, 1e-9));
  // Cabs and boats publish anchor_seat too: a sitter there was clamped to 0.7 m and floated.
  assert.equal(seatPlace({ x: 0, y: 1.22, z: 0, heading: 0, object: 'forklift' }, 0), null);
  assert.equal(seatPlace({ x: 0, y: 1.75, z: 0, heading: 0, object: 'terminal_tractor' }, 0), null);
  assert.equal(seatPlace({ x: 0, y: 0.4, z: 0, heading: 0, object: 'pedal_boat' }, 0), null);
  // A bench whose record no longer matches the ground (raised, sunk, moved): refused, never clamped.
  assert.equal(seatPlace({ x: 0, y: 1.3, z: 0, heading: 0, object: 'bench_slat' }, 0), null);
  assert.equal(seatPlace({ x: 0, y: 0.2, z: 0, heading: 0, object: 'bench_concrete' }, 0), null);
  assert.equal(seatPlace({ x: 0, y: 0.95, z: 0, heading: 0 }, 0), null, 'an unknown seat must be bench height');
  // A cafe set's chairs face the table: only with the record's own yaw.
  assert.equal(seatPlace({ x: 0, y: 0.45, z: 0, heading: 0, object: 'cafe_set' }, 0), null);
  assert.ok(seatPlace({ x: 0, y: 0.45, z: 0, yaw: 2.1, object: 'cafe_set' }, 0));
  for (const [object, height] of Object.entries(SITTABLE_SEATS)) {
    assert.ok(height >= 0.4 && height <= 0.55, `${object}: a sitting height`);
  }
});

test('a sitter whose bench is gone learns it (stillThere)', () => {
  let seats = [{ x: 4, y: 0.45, z: 2, heading: 0, object: 'bench_slat' }, { x: 9, y: 1.22, z: 2, heading: 0, object: 'forklift' }];
  const city = { groundHeightAt: () => 0, seatsNear: (x, z, r, out = []) => { out.length = 0; for (const s of seats) if (Math.hypot(s.x - x, s.z - z) <= r) out.push(s); return out; } };
  const benches = createBenchSeats(city);
  const seat = benches.freeNear(5, 2, 10);
  assert.equal(seat.x, 4, 'the bench, never the forklift cab');
  benches.take(seat, 1);
  assert.equal(benches.freeNear(9, 2, 1), null, 'the forklift is not a seat');
  assert.equal(benches.stillThere(seat), true);
  seats = [];   // the sector is unbuilt (dressing dispose) or re-laid without the bench
  assert.equal(benches.stillThere(seat), false);
  seats = [{ x: 4, y: 0.9, z: 2, heading: 0, object: 'bench_slat' }];
  assert.equal(benches.stillThere(seat), false, 'listed again at another height: not the same seat');
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
