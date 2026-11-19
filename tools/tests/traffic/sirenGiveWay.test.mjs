// Giving way to sirens and pursuits (game/src/traffic/sirenGiveWay.js): who pulls over, who
// scatters, and the pull-over's steps (move over, ease to the kerb, stop, wait, pull back out).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GIVE_WAY_MODE, SIREN_GIVE_WAY, addSiren, createGiveWayState, createSirenList, giveWayDriving, senseSirens,
} from '../../../game/src/traffic/sirenGiveWay.js';

// A car at the origin driving north (-Z) at 10 m/s.
const look = (state, list, speed = 10) => senseSirens(state, list, 0, 0, 0, -1, speed, 0.5);
const listOf = (...sources) => {
  const list = createSirenList();
  for (const [x, z, vx, vz, chase] of sources) addSiren(list, x, z, vx, vz, chase);
  return list;
};

test('a siren coming up behind on the same road makes the driver pull over', () => {
  const state = createGiveWayState();
  assert.equal(look(state, listOf([0, 40, 0, -20, false])), GIVE_WAY_MODE.PULL_OVER);
});

test('an oncoming siren ahead makes the driver pull over; one driving away does not', () => {
  assert.equal(look(createGiveWayState(), listOf([-3.5, -40, 0, 18, false])), GIVE_WAY_MODE.PULL_OVER);
  assert.equal(look(createGiveWayState(), listOf([0, -30, 0, -20, false])), GIVE_WAY_MODE.NONE);
  assert.equal(look(createGiveWayState(), listOf([0, 200, 0, -20, false])), GIVE_WAY_MODE.NONE, 'too far to hear');
  assert.equal(look(createGiveWayState(), listOf([0, 30, 0, -1, false])), GIVE_WAY_MODE.NONE, 'standing still');
});

test('a pursuit bearing down on the car scatters it: hard brakes and a swerve away from its path', () => {
  const state = createGiveWayState();
  // The pursuit comes up from behind, 1.5 m to the car's left: the car swerves right.
  assert.equal(look(state, listOf([-1.5, 30, 0, -30, true])), GIVE_WAY_MODE.SCATTER);
  assert.equal(state.side, 1);
  const out = giveWayDriving(state, 0.1, false);
  assert.equal(out.brakeHard, true);
  assert.equal(out.speedLimit, 0);
  assert.ok(out.offset > 0);
  // From the right it swerves left.
  const other = createGiveWayState();
  look(other, listOf([1.5, 30, 0, -30, true]));
  assert.equal(other.side, -1);
  // A pursuit well to the side of the car's place only makes it pull over.
  assert.equal(look(createGiveWayState(), listOf([-12, 30, 0, -30, true])), GIVE_WAY_MODE.PULL_OVER);
  // The wanted lead's car has no siren: it scatters the cars in its path, nobody pulls over for it.
  assert.equal(look(createGiveWayState(), listOf([-1.5, 30, 0, -30, 'only'])), GIVE_WAY_MODE.SCATTER);
  assert.equal(look(createGiveWayState(), listOf([-12, 30, 0, -30, 'only'])), GIVE_WAY_MODE.NONE);
});

test('pulling over: into the kerb lane first, then ease to the kerb and stop, then pull back out', () => {
  const state = createGiveWayState();
  const list = listOf([0, 40, 0, -20, false]);
  look(state, list);
  let out = giveWayDriving(state, 1 / 60, false);
  assert.equal(out.moveRight, true, 'not in the kerb lane yet: move over');
  assert.equal(out.indicator, 1);
  assert.equal(out.speedLimit, SIREN_GIVE_WAY.moveOverSpeed);
  assert.equal(out.offset, 0);
  // In the kerb lane: ease right, then stop once near the kerb.
  for (let i = 0; i < 120; i += 1) {
    look(state, list, 2);
    out = giveWayDriving(state, 1 / 60, true);
  }
  assert.ok(out.offset >= SIREN_GIVE_WAY.kerbOffset * 0.8 - 1e-9);
  assert.equal(out.speedLimit, 0);
  // The siren has gone: after the driver's delay it pulls back out, indicating left.
  const empty = createSirenList();
  for (let t = 0; t < SIREN_GIVE_WAY.resumeDelay[1] + 0.2; t += 1 / 60) {
    look(state, empty, 0);
    out = giveWayDriving(state, 1 / 60, true);
  }
  assert.equal(state.mode, GIVE_WAY_MODE.PULL_OUT);
  assert.equal(out.indicator, -1);
  assert.ok(out.speedLimit > 0);
  for (let t = 0; t < 3; t += 1 / 60) out = giveWayDriving(state, 1 / 60, true);
  assert.equal(state.mode, GIVE_WAY_MODE.NONE);
  assert.equal(out.offset, 0);
  assert.equal(out.active, false);
});

test('the siren list holds a fixed number of sources and allocates nothing when full', () => {
  const list = createSirenList(2);
  for (let i = 0; i < 5; i += 1) addSiren(list, i, 0, 0, 0, false);
  assert.equal(list.count, 2);
});
