// Guards keep a still watch (no talking hands, hands clasped, a slow scan round the way the
// mission faces them); gang crews idle in roles (a talker, a squatter, a lookout turned away...)
// and turn towards their mates instead of standing in a row; anyone who stops idling drops the
// idle stance, and a pose the run-time lacks falls back to the nearest one it has.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const { createCrewIdle, crewRolesFor, idlePoseFor, GUARD_SCAN } = await import('../../../game/src/pedestrians/crewIdle.js');
// The run-time's names today (locomotionController STANCES, setGesture): it throws on others.
const STANCES = Object.fromEntries(['stand', 'hands_up', 'hands_on_head', 'cuffed', 'guard', 'block', 'kneel', 'crouch', 'cower', 'sit_bench', 'fallen'].map((n) => [n, {}]));
const GESTURES = ['phone', 'talk', 'panic', 'point'];

function crowdOf(people) {
  let seed = 3;
  return {
    people, time: 0,
    random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647),
    // As crowdSimulation's: the walker throws before the person's record changes (stance), after it (gesture).
    setStance(p, name) { if (!(name in STANCES)) throw new Error(`no stance ${name}`); p.stance = name; },
    setGesture(p, name) { if (p.gesture === name) return; p.gesture = name; if (name && !GESTURES.includes(name)) throw new Error(`no gesture ${name}`); },
  };
}

function person(id, x, z, data = {}, tags = []) {
  return { id, x, z, mode: 'chat', facing: 0, input: { facing: NaN }, entity: { data, tags: new Set(tags) }, stance: 'stand', gesture: null };
}

test('crew roles: a talker first, then squatter, lookout and the rest, shuffled by the roll', () => {
  assert.deepEqual(crewRolesFor(1, 0.5), ['smoker']);
  const three = crewRolesFor(3, 0);
  assert.equal(three[0], 'talker');
  assert.deepEqual([...three].sort(), ['lookout', 'squat', 'talker']);
  assert.notDeepEqual(crewRolesFor(3, 0), crewRolesFor(3, 0.6), 'the roll changes who squats');
  assert.equal(crewRolesFor(7, 0.3).length, 7);
});

test('poses use what the run-time knows and fall back otherwise', () => {
  const runtime = { stances: new Set(Object.keys(STANCES)), gestures: new Set(GESTURES) };
  const guard = idlePoseFor('guard', runtime);
  assert.equal(guard.gesture, null, 'a guard never talks');
  assert.ok(runtime.stances.has(guard.stance) && guard.stance !== 'stand', 'hands clasped (behind the back meanwhile)');
  assert.equal(idlePoseFor('talker', runtime, true).gesture, 'talk');
  assert.equal(idlePoseFor('squat', runtime).stance, 'crouch');
  assert.equal(idlePoseFor('smoker', runtime).gesture, null, 'no smoke gesture yet: stands still');
  const later = { stances: new Set([...runtime.stances, 'watch', 'lean_wall']), gestures: new Set([...runtime.gestures, 'smoke']) };
  assert.equal(idlePoseFor('guard', later).stance, 'watch');
  assert.equal(idlePoseFor('smoker', later).gesture, 'smoke');
  assert.equal(idlePoseFor('leaner', later).stance, 'lean_wall');
});

test('a guard stays still on watch: no talking, a slow scan round the way he faces', () => {
  const guard = person(1, 0, 0, { missionGuard: true, missionEnemy: true });
  guard.facing = 1;
  const crowd = crowdOf([guard]);
  const idle = createCrewIdle(crowd);
  let least = Infinity, most = -Infinity;
  for (let i = 0; i < 1200; i += 1) {
    crowd.time = i * 0.05;
    assert.equal(idle.update(guard, 0.05, i % 5 === 0), true);
    assert.equal(guard.gesture, null);
    least = Math.min(least, guard.input.facing - 1);
    most = Math.max(most, guard.input.facing - 1);
  }
  assert.equal(guard.stance, 'cuffed', 'no watch stance in the run-time yet: hands behind the back');
  assert.ok(most <= GUARD_SCAN.arc + 1e-9 && least >= -GUARD_SCAN.arc - 1e-9, 'within the arc');
  assert.ok(most - least > GUARD_SCAN.arc, 'but he does look round');
  // Alerted: back to standing.
  guard.mode = 'fight';
  idle.clear(guard);
  assert.equal(guard.stance, 'stand');
});

test('a crew in a row turns into a huddle: mates face each other, the lookout faces away', () => {
  const crew = [person(1, 0, 0, {}, ['gang']), person(2, 1.5, 0, {}, ['gang']), person(3, 3, 0, {}, ['gang'])];
  crew[0].crewRole = 'talker'; crew[1].crewRole = 'squat'; crew[2].crewRole = 'lookout';
  const crowd = crowdOf(crew);
  const idle = createCrewIdle(crowd);
  for (let i = 0; i < 40; i += 1) for (const p of crew) idle.update(p, 0.1, true);
  const along = (p) => -Math.sin(p.input.facing); // facing -> world x of the forward direction
  assert.ok(along(crew[0]) > 0.9, 'the talker turns towards his mates (+x)');
  assert.equal(crew[1].stance, 'crouch', 'one squats on his heels');
  assert.ok(along(crew[2]) > -0.5, 'the lookout does not face his mates (-x) but the street');
  let talked = false;
  for (let i = 0; i < 200; i += 1) { crowd.time += 0.1; idle.update(crew[0], 0.1, false); talked = talked || crew[0].gesture === 'talk'; }
  assert.ok(talked, 'the talker uses his hands');
  // A smoker without a smoke gesture in the run-time: refused once, then stands still.
  const smoker = person(4, 20, 0, {}, ['gang']);
  smoker.crewRole = 'smoker';
  idle.update(smoker, 0.1, true);
  idle.update(smoker, 0.1, true);
  assert.equal(smoker.gesture, null);
  assert.equal(idle.stats.refused, 1);
  // Ordinary talkers on the pavement keep their own turns.
  const passer = person(9, 10, 10);
  assert.equal(idle.update(passer, 0.1, true), false);
  // Called away (a fight): the squat is dropped.
  idle.clear(crew[1]);
  assert.equal(crew[1].stance, 'stand');
});
