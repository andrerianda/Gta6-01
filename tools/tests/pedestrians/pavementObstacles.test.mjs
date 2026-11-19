// Walkers and the things on the pavement: trunks in their pits, lamp and sign poles, benches and
// clutter become circles (from the collision world's statics, as in the game), and no walker's
// path crosses a trunk; people keep their room from the lead and step out of an aimed gun.
import assert from 'node:assert/strict';
import test from 'node:test';
import { IndexList, StaticColliderSet } from '../../../game/src/physics/collision/StaticColliderSet.js';
import {
  GATHER_RADIUS, circlesFromStatics, createCircleList, keepOutOfObstacles, steerAroundObstacles,
} from '../../../game/src/pedestrians/pavementObstacles.js';
import {
  LEAD_SPACE, SPAWN_SPACE, freeSpotNear, keepFromLead, lineOfFire, spotIsFree, stepOutOfLeadSpace,
} from '../../../game/src/pedestrians/personalSpace.js';

const STATIC = 2, CYLINDER = 2, BOX = 1;
const yaw = (a) => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];

/** A 90 m pavement along +x (kerb at z = 0, facades at z = 4.5) dressed like the city's. */
function dressedPavement() {
  const statics = new StaticColliderSet(16);
  const trunks = [];
  for (let x = 6; x < 88; x += 7) {
    // Trunks in pits at 1.0-1.6 m from the kerb (radius 0.22 x scale), some right on a lane.
    const z = 1 + ((x * 7) % 6) / 10, r = 0.22 * (1 + ((x * 3) % 4) / 10);
    statics.add(CYLINDER, STATIC, 1, x, 1.5, z, yaw(0), r, 1.5, r);
    trunks.push({ x, z, r });
  }
  for (let x = 2; x < 88; x += 14) statics.add(CYLINDER, STATIC, 1, x, 3, 0.5, yaw(0), 0.16, 3, 0.16); // lamps
  for (let x = 10; x < 88; x += 21) statics.add(BOX, STATIC, 1, x, 0.45, 3.6, yaw(0.1), 0.9, 0.45, 0.3); // benches
  for (let x = 16; x < 88; x += 23) statics.add(BOX, STATIC, 1, x, 0.6, 2.5, yaw(0.7), 0.35, 0.6, 0.35); // bins, boxes
  statics.add(BOX, STATIC, 1, 45, 10, 12, yaw(0), 40, 10, 7.5); // the building behind (not an obstacle)
  statics.add(BOX, STATIC, 1, 45, 0.07, 0, yaw(0), 45, 0.07, 0.15); // the kerb (too low)
  return { statics, trunks };
}

test('the collision statics become walkable-round circles: trunks, poles, benches; not walls or kerbs', () => {
  const { statics } = dressedPavement();
  const out = createCircleList();
  circlesFromStatics(statics, new IndexList(), 10, 2, 0, GATHER_RADIUS, out);
  assert.ok(out.count >= 3, `circles near a bench and a trunk: ${out.count}`);
  for (let i = 0; i < out.count; i += 1) assert.ok(out.data[i * 3 + 2] < 1.5, 'no wall-sized circle');
  // The bench (1.8 m long) is covered along its length.
  const along = [];
  for (let i = 0; i < out.count; i += 1) if (Math.abs(out.data[i * 3 + 1] - 3.6) < 0.4) along.push(out.data[i * 3]);
  assert.ok(Math.max(...along) - Math.min(...along) > 0.8, 'the bench is a row of circles');
});

test('no walker path crosses a trunk, and every walker gets to the end of the pavement', () => {
  const { statics, trunks } = dressedPavement();
  const found = new IndexList();
  const dt = 1 / 30;
  let worstSteered = Infinity, worst = Infinity, guardMoves = 0, steps = 0;
  for (let lane = 0; lane < 24; lane += 1) {
    const laneZ = 0.6 + (lane / 23) * 2.6;
    const p = { x: 0, z: laneZ };
    const circles = createCircleList();
    const move = { moveX: 0, moveZ: 0 };
    let vx = 1.3, vz = 0, think = 0, along = 0;
    const speed = lane % 3 === 0 ? 2.8 : 1.3; // joggers and walkers
    for (let t = 0; t < 120 && p.x < 86; t += dt) {
      think -= dt;
      if (think <= 0) { think = 0.25; circlesFromStatics(statics, found, p.x, p.z, 0, GATHER_RADIUS, circles); }
      // Route following as in the crowd: `along` runs on at the walking speed, the walker heads
      // for the lane point 1.6 m past it.
      along = Math.min(along + Math.hypot(vx, vz) * dt, 90);
      const tx = along + 1.6 - p.x, tz = laneZ - p.z, d = Math.hypot(tx, tz) || 1;
      move.moveX = (tx / d) * speed;
      move.moveZ = (tz / d) * speed;
      steerAroundObstacles(p.x, p.z, move, circles, lane % 2 ? 1 : -1);
      // The locomotion controller's inertia.
      const k = Math.min(1, dt * 6);
      vx += (move.moveX - vx) * k;
      vz += (move.moveZ - vz) * k;
      p.x += vx * dt;
      p.z += vz * dt;
      for (const trunk of trunks) worstSteered = Math.min(worstSteered, Math.hypot(p.x - trunk.x, p.z - trunk.z) - trunk.r);
      if (keepOutOfObstacles(p, circles)) guardMoves += 1;
      steps += 1;
      for (const trunk of trunks) worst = Math.min(worst, Math.hypot(p.x - trunk.x, p.z - trunk.z) - trunk.r);
    }
    assert.ok(p.x >= 86, `walker on lane ${laneZ.toFixed(2)} got stuck at x ${p.x.toFixed(1)}`);
  }
  // Body radius 0.3: the centre stays that far from every trunk's bark, always.
  assert.ok(worst >= 0.3 - 1e-6, `closest approach to a trunk ${worst.toFixed(3)} m`);
  // The steering alone keeps them clear; the guard only trims.
  assert.ok(worstSteered > 0.2, `steering alone came within ${worstSteered.toFixed(3)} m of a trunk`);
  assert.ok(guardMoves < steps * 0.05, `guard used on ${guardMoves} of ${steps} steps`);
});

test('people keep their room from the lead and are never put down on anyone', () => {
  // A walker heads straight at the standing lead along the pavement.
  const lead = { x: 20, z: 2 };
  const p = { x: 0, z: 2.1 };
  const move = { moveX: 0, moveZ: 0 };
  const circles = createCircleList();
  let vx = 0, vz = 0, closest = Infinity, along = 0;
  const dt = 1 / 30;
  for (let t = 0; t < 40; t += dt) {
    along += Math.hypot(vx, vz) * dt;
    const tx = along + 1.6 - p.x, tz = 2.1 - p.z, d = Math.hypot(tx, tz) || 1;
    move.moveX = (tx / d) * 1.3;
    move.moveZ = (tz / d) * 1.3;
    circles.count = 0;
    keepFromLead(p.x, p.z, lead.x, lead.z, move, circles);
    steerAroundObstacles(p.x, p.z, move, circles, 1);
    const k = Math.min(1, dt * 6);
    vx += (move.moveX - vx) * k;
    vz += (move.moveZ - vz) * k;
    p.x += vx * dt;
    p.z += vz * dt;
    stepOutOfLeadSpace(p, lead.x, lead.z, dt);
    closest = Math.min(closest, Math.hypot(p.x - lead.x, p.z - lead.z));
  }
  assert.ok(closest >= LEAD_SPACE - 0.15, `came within ${closest.toFixed(2)} m of the lead`);
  assert.ok(p.x > 30, 'walked on past the lead');

  const people = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0.5, z: 1 }];
  assert.equal(spotIsFree(0.4, 0.3, people, null), false);
  assert.equal(spotIsFree(6, 0, people, { x: 6.5, z: 0 }), false, 'not on the lead');
  const spot = freeSpotNear(0.5, 0.4, people, { x: 3, z: 0 }, { x: 0, z: 0 });
  assert.ok(spot, 'a free spot nearby');
  for (const q of people) assert.ok(Math.hypot(spot.x - q.x, spot.z - q.z) >= SPAWN_SPACE);
  assert.ok(Math.hypot(spot.x - 3, spot.z) >= LEAD_SPACE);
});

test('an aimed gun: the person it points at is aimed at, those beside its line are near', () => {
  const out = { ahead: 0, lateral: 0, aimedAt: false, near: false };
  assert.equal(lineOfFire(0, -10, 0, 0, 0, -1, out).aimedAt, true);
  assert.equal(lineOfFire(2, -10, 0, 0, 0, -1, out).near, true);
  assert.equal(lineOfFire(2, -10, 0, 0, 0, -1, out).aimedAt, false);
  assert.equal(lineOfFire(0, 10, 0, 0, 0, -1, out).aimedAt, false, 'behind the lead');
  assert.equal(lineOfFire(8, -10, 0, 0, 0, -1, out).near, false, 'well clear');
});
