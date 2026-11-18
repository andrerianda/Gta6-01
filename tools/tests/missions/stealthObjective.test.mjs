// The stealth objective: guard vision numbers (cone, hearing, suspicion, posts and rounds), the
// off-the-road footing for mission people, and the kind itself over a fake world: a guard who
// sees the lead raises the alarm and fails the mission or sends the lead back to the start,
// a lead the guards cannot see reaches the door, a guard taken down alarms the others.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY_MISSIONS } from '../../../game/src/catalog/storyMissions.js';
import { guardPosts, hearingOf, nextSuspicion, sightOf, stealthRoute, watchYaw, yawToward, angleGap, fairPostSpot, fairPostNear, hugBase, HUG_OUT, MIN_POST_GAP, sneakLength } from '../../../game/src/missions/guardVision.js';
import { stealthKind } from '../../../game/src/missions/stealthObjective.js';
import { offCarriageway } from '../../../game/src/missions/crowdPlacement.js';

const STEP = 1 / 60;

test('a guard sees ahead within range and degrees, not behind or past range; touching is always seen', () => {
  const ahead = yawToward(0, 0, 0, -10);          // looking along -z
  assert.ok(sightOf(0, 0, ahead, 0, -8, 16, 70) > 0.5);
  assert.equal(sightOf(0, 0, ahead, 0, 8, 16, 70), 0);
  assert.equal(sightOf(0, 0, ahead, 0, -17, 16, 70), 0);
  assert.equal(sightOf(0, 0, ahead, 9, -3, 16, 70), 0);   // 72 degrees off the line: outside a 70 degree cone
  assert.equal(sightOf(0, 0, ahead, 0, 1.2, 16, 70), 1);
  assert.ok(sightOf(0, 0, ahead, 0, -3, 16, 70) > sightOf(0, 0, ahead, 0, -14, 16, 70), 'nearer is plainer');
});

test('sprints are heard further than runs; a walk is silent; suspicion fills in detectSeconds and drains', () => {
  assert.ok(hearingOf(8, 6.5) > 0);
  assert.equal(hearingOf(8, 4), 0);
  assert.ok(hearingOf(3, 4) > 0);
  assert.equal(hearingOf(2, 1.4), 0);
  let level = 0;
  for (let t = 0; t < 1.6 - 1e-9; t += STEP) level = nextSuspicion(level, 1, STEP, 1.6);
  assert.ok(level > 0.97, `full after detectSeconds (${level})`);
  for (let t = 0; t < 1; t += STEP) level = nextSuspicion(level, 0, STEP, 1.6);
  assert.ok(level < 0.75 && level > 0.6);
});

test('posts spread along the sneak, out from it, and each guard turns back to check the wall once a cycle', () => {
  const route = stealthRoute({ x: 10, z: 20, frontX: 0, frontZ: 1 }, 40, 1);
  assert.ok(Math.abs(Math.hypot(route.to.x - 10, route.to.z - 20) - 40) < 1e-9);
  const posts = guardPosts(route, 4);
  assert.equal(posts.length, 4);
  for (const post of posts) assert.ok(post.z - 20 >= 5.9, 'out from the frontage');
  let sawIn = false;
  for (let t = 0; t < 12; t += 0.1) if (Math.abs(angleGap(watchYaw(posts[0], t), posts[0].lookIn)) < 0.35) sawIn = true;
  assert.ok(sawIn);
});

test('mission people are moved off the carriageway to the nearest kerbside spot', () => {
  const onRoad = (x, z) => Math.abs(z) < 5;
  assert.deepEqual(offCarriageway(onRoad, 3, 9), { x: 3, z: 9 });
  const spot = offCarriageway(onRoad, 3, 1);
  assert.ok(Math.abs(spot.z) >= 5 && Math.abs(spot.z) < 7);
  assert.equal(offCarriageway(() => true, 0, 0), null);
});

test('House Edge street (4 m pavement, then road): the sneak hugs the facade and no guard stands on it', () => {
  // The Aurelia's frontage: facade at z = 0 facing +z, pavement to z = 4, carriageway and median
  // beyond to z = 26, far pavement to 30. The marker stood at the kerb (z = 3.9).
  const onRoad = (x, z) => z >= 4 && z < 26;
  const zone = { x: 0, z: 3.9, frontX: 0, frontZ: 1, doorX: 0, doorZ: 0 };
  const base = hugBase(zone);
  assert.ok(Math.abs(base.z - HUG_OUT) < 1e-9 && base.x === 0, 'the sneak starts just off the facade');
  assert.equal(hugBase({ x: 5, z: 6, frontX: 0, frontZ: 1 }).z, 6, 'no door: the place itself');
  const route = stealthRoute(base, sneakLength(8), 1);
  let kept = 0;
  for (const post of guardPosts(route, 8)) {
    const spot = fairPostSpot(onRoad, post);
    assert.ok(spot, 'a 4 m pavement still has a fair spot by the kerb');
    assert.ok(!onRoad(spot.x, spot.z), 'off the road');
    const gap = spot.z - route.from.z;   // out from the sneak line
    assert.ok(gap >= MIN_POST_GAP - 1e-9, `never on the sneak line (gap ${gap.toFixed(2)})`);
    kept += 1;
  }
  assert.equal(kept, 8);
  // A post that lands on the road with no pavement inward goes across it; none at all: left out.
  const post = { baseX: 0, baseZ: 3.9, outX: 0, outZ: 1, gap: 6, x: 0, z: 9.9 };
  assert.ok(fairPostSpot(onRoad, post).z >= 26);
  assert.equal(fairPostSpot(() => true, post), null);
});

function fakeWorld() {
  const player = { x: 0, y: 0, z: 0, heading: 0, speed: 0, vehicleId: null };
  const world = {
    player: () => player, me: player, notes: [], teleports: [], released: 0, walls: false,
    place: (id) => (id ? { id, x: 0, y: 0, z: 0, frontX: 0, frontZ: 1 } : null),
    postGuards: (member, posts) => posts.map((post, i) => ({ id: i, post, x: post.x, z: post.z, yaw: post.lookOut, wantYaw: post.lookOut, standing: true, suspicion: 0, alerted: false, lastX: NaN, lastZ: NaN })),
    refreshGuards(guards) { for (const g of guards) g.yaw = g.wantYaw; },
    driveGuards() {},
    canSee: () => !world.walls,
    clearPath: () => true,
    releaseGuards(guards) { world.released += guards.length; },
    teleport(at) { world.teleports.push(at); player.x = at.x; player.z = at.z; },
    holding: () => false,
    notify(text) { world.notes.push(text); },
    help() {},
  };
  return world;
}

function begin(params) {
  const world = fakeWorld();
  const o = { index: 1, kind: 'stealth', params, world, memory: { place: null }, state: {}, target: null, marks: null, timeLimit: null };
  stealthKind().begin(o);
  return { o, world, kind: stealthKind() };
}

function stand(o, world, x, z, seconds) {
  world.me.x = x; world.me.z = z;
  let result = 0;
  for (let t = 0; t < seconds; t += STEP) { result = stealthKind().update(o, STEP); if (result !== 0) break; }
  return result;
}

test('in front of a guard the alarm goes up: House Edge fails, Twice the Weight goes back to the start', () => {
  const house = STORY_MISSIONS.m11_house_edge.objectives.find((step) => step.kind === 'stealth').params;
  const a = begin(house);
  assert.equal(a.o.state.guards.length, 8);
  const g = a.o.state.guards[0];
  g.post.lookOut = g.post.lookIn = yawToward(g.x, g.z, g.x, g.z - 5);   // stares at a fixed spot
  assert.equal(stand(a.o, a.world, g.x, g.z - 5, 8), 'detected');
  assert.ok(a.world.notes.includes('Spotted!'));
  a.kind.end(a.o);
  assert.equal(a.world.released, 8);

  const weight = STORY_MISSIONS.m02_twice_the_weight.objectives.find((step) => step.kind === 'stealth').params;
  const b = begin(weight);
  const h = b.o.state.guards[1];
  h.post.lookOut = h.post.lookIn = yawToward(h.x, h.z, h.x + 6, h.z);
  assert.equal(stand(b.o, b.world, h.x + 6, h.z, 6), 0);
  assert.equal(b.world.teleports.length, 1, 'sent back to where the sneak began');
  const back = b.world.teleports[0], from = b.o.state.route.from;
  assert.ok(Math.hypot(back.x - from.x, back.z - from.z) < 1e-6, "to the sneak's own start by the facade, not where the lead stood");
  assert.ok(b.o.state.guards.every((each) => each.suspicion === 0 && !each.alerted));
});

test('unseen behind walls the lead reaches the door; a guard taken down alarms the others near', () => {
  const clean = STORY_MISSIONS.m08_clean_hands.objectives.find((step) => step.kind === 'stealth').params;
  const a = begin(clean);
  a.world.walls = true;
  assert.equal(stand(a.o, a.world, a.o.target.x, a.o.target.z, 4), 1);

  const b = begin(clean);
  b.world.me.x = 500;
  b.o.state.guards[0].standing = false;
  stand(b.o, b.world, 500, 0, 0.1);
  const other = b.o.state.guards[1];
  assert.ok(other.suspicion > 0.85, `nearly alarmed (${other.suspicion})`);
  assert.ok(Math.abs(angleGap(other.wantYaw, yawToward(other.x, other.z, b.o.state.guards[0].x, b.o.state.guards[0].z))) < 1e-6, 'looks at the fallen guard');
});

test('Clean Hands corner: a post whose outward line is all junction slides along the sneak instead of being left out', () => {
  // A junction 8 m wide across the post's outward line (x in -4..4), open ground either side.
  const onRoad = (x, z) => Math.abs(x) < 4 && z > 1;
  const post = { x: 0, z: 6, baseX: 0, baseZ: 0, outX: 0, outZ: 1, gap: 6 };
  assert.equal(fairPostSpot(onRoad, post), null);
  const spot = fairPostNear(onRoad, post);
  assert.ok(spot && !onRoad(spot.x, spot.z), 'a free spot');
  assert.ok(spot.gap >= MIN_POST_GAP && Math.abs(spot.x) <= 9, 'beside the sneak, within reach of its post');
});

test('the audio stingers: suspicious once per rise past 0.3, the alarm once when it starts', () => {
  const house = STORY_MISSIONS.m11_house_edge.objectives.find((step) => step.kind === 'stealth').params;
  const a = begin(house);
  const sounds = [];
  a.world.sound = (id) => sounds.push(id);
  const g = a.o.state.guards[0];
  g.post.lookOut = g.post.lookIn = yawToward(g.x, g.z, g.x, g.z - 5);
  // A short look: past 0.3, no alarm; away until calm; a second look sounds again.
  stand(a.o, a.world, 500, 0, 2.1);                      // the grace passes far off
  for (let t = 0; t < 0.9; t += STEP) { a.world.me.x = g.x; a.world.me.z = g.z - 5; stealthKind().update(a.o, STEP); if (g.suspicion > 0.4) break; }
  assert.deepEqual(sounds, ['stealth_suspicious']);
  stand(a.o, a.world, 500, 0, 6);
  assert.ok(g.suspicion < 0.1);
  assert.equal(stand(a.o, a.world, g.x, g.z - 5, 8), 'detected');
  assert.deepEqual(sounds, ['stealth_suspicious', 'stealth_suspicious', 'stealth_alarm']);
});
