// Tests of the mission director's pure parts: progress and availability, every catalog mission
// started, passed (skipped to the end) and failed through a run over a fake world, the first
// mission played through objective by objective, timers, fail conditions, retry checkpoints,
// and the cutscene camera plan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY_MISSIONS, STORY_MISSION_ORDER, MISSION_RULES, MISSION_OBJECTIVE_KINDS } from '../../../game/src/catalog/storyMissions.js';
import { createMissionProgress, isWithinHours } from '../../../game/src/missions/missionProgress.js';
import { createMissionRun } from '../../../game/src/missions/missionRun.js';
import { OBJECTIVE_KINDS, fairTimeLimit } from '../../../game/src/missions/objectiveKinds.js';
import { planCutsceneShots, lineSeconds } from '../../../game/src/missions/cutsceneShots.js';

/** A fake mission world: landmarks on a grid by id hash, vehicles as plain records. */
function fakeWorld() {
  const vehicles = new Map();
  const player = { x: 0, y: 0, z: 0, heading: 0, speed: 0, vehicleId: null };
  let next = 1;
  const world = {
    player: () => player,
    me: player,
    vehicles,
    hooked: null,
    wanted: 0,
    held: false,
    place(id) {
      if (!id) return null;
      let hash = 0;
      for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
      return { id, name: id, x: (hash % 2000) - 1000, y: 0, z: ((hash >> 11) % 2000) - 1000, frontX: 0, frontZ: 1 };
    },
    spawnVehicle(modelId, near) {
      const id = `v${next++}`;
      vehicles.set(id, { id, modelId, position: { x: near.x + 5, y: 0, z: near.z }, heading: 0, alive: true, data: { speed: 0, health: 1000, maxHealth: 1000 } });
      return id;
    },
    vehicle: (id) => vehicles.get(id) ?? null,
    removeVehicle: (id) => vehicles.delete(id),
    drive() {}, halt() {},
    hook(truckId, targetId) { world.hooked = { truckId, targetId }; },
    unhook() { world.hooked = null; },
    tow() {},
    enterVehicle(id) { player.vehicleId = id; return true; },
    switchLead: () => false,
    wantedLevel: () => world.wanted,
    setWanted(level) { world.wanted = level; },
    clearWanted() { world.wanted = 0; },
    holding: () => world.held,
    notify() {}, help() {}, marks() {},
    pointNear: (at, i, n, spacing) => ({ x: at.x + (i - (n - 1) / 2) * spacing, y: 0, z: at.z }),
  };
  return world;
}

function moveTo(world, point) { world.me.x = point.x; world.me.z = point.z; }

function advance(run, seconds, step = 1 / 60) {
  for (let t = 0; t < seconds && run.status === 'running'; t += step) run.update(step);
  return run.status;
}

test('every catalog objective kind is implemented', () => {
  for (const kind of Object.keys(MISSION_OBJECTIVE_KINDS)) assert.ok(OBJECTIVE_KINDS[kind], kind);
  for (const mission of Object.values(STORY_MISSIONS)) for (const step of mission.objectives) assert.ok(OBJECTIVE_KINDS[step.kind], `${mission.id} ${step.kind}`);
});

test('progress opens missions in story order, pays replays less and round-trips', () => {
  const progress = createMissionProgress(STORY_MISSIONS, STORY_MISSION_ORDER, MISSION_RULES);
  assert.deepEqual(progress.available(), ['m01_hook_and_chain']);
  assert.equal(progress.attempt('m01_hook_and_chain'), 1);
  assert.deepEqual(progress.complete('m01_hook_and_chain'), { cash: 800, reputation: 100, replay: false });
  assert.ok(progress.available().includes('m02_twice_the_weight'));
  assert.equal(progress.complete('m01_hook_and_chain').cash, 200);
  const saved = JSON.parse(JSON.stringify(progress.serialise()));
  const again = createMissionProgress(STORY_MISSIONS, STORY_MISSION_ORDER, MISSION_RULES);
  again.restore(saved);
  assert.deepEqual(again.serialise(), saved);
  assert.equal(again.attemptsOf('m01_hook_and_chain'), 1);
});

test('mission hours wrap past midnight', () => {
  assert.ok(isWithinHours(null, 3));
  assert.ok(isWithinHours([9, 16], 10) && !isWithinHours([9, 16], 17));
  assert.ok(isWithinHours([19, 5], 23) && isWithinHours([19, 5], 2) && !isWithinHours([19, 5], 12));
});

test('every catalog mission starts, passes when skipped to the end, and fails when aborted', () => {
  for (const id of STORY_MISSION_ORDER) {
    const mission = STORY_MISSIONS[id];
    const passing = createMissionRun(mission, fakeWorld());
    assert.equal(passing.status, 'running', id);
    assert.equal(passing.index, 0);
    passing.skipTo(mission.objectives.length);
    assert.equal(passing.status, 'passed', id);
    passing.dispose();
    const failing = createMissionRun(mission, fakeWorld(), { startIndex: 1 });
    assert.equal(failing.index, 1);
    failing.fail('aborted');
    assert.equal(failing.status, 'failed');
    assert.equal(failing.failText, 'Mission abandoned');
    failing.dispose();
  }
});

test('Hook and Chain plays through, objective by objective', () => {
  const world = fakeWorld();
  const seen = [];
  const mission = STORY_MISSIONS.m01_hook_and_chain;
  const run = createMissionRun(mission, world, { on: { objective: (o) => seen.push(o.kind) } });
  const truck = run.memory.playerVehicleId;
  assert.ok(truck, 'the tow truck is spawned');
  world.me.vehicleId = truck;
  run.update(1 / 60);
  assert.equal(run.index, 1);
  const sedan = run.memory.vehicles.luxury_sedan;
  assert.ok(sedan, 'the Regente is prepared while driving to the hotel');
  moveTo(world, world.place('hotel_cielo_rosa'));
  run.update(1 / 60);
  assert.equal(run.index, 2);
  const truckCar = world.vehicle(truck);
  truckCar.position = { x: 100, y: 0, z: 100 };
  world.vehicle(sedan).position = { x: 100, y: 0, z: 105 };
  advance(run, 3.2);
  assert.deepEqual(world.hooked, { truckId: truck, targetId: sedan });
  assert.equal(run.index, 3);
  for (const pursuer of run.memory.spawned) world.vehicle(pursuer).position = { x: 5000, y: 0, z: 5000 };
  advance(run, 10.3);
  assert.equal(run.index, 4);
  const garage = world.place('tolliver_tow');
  moveTo(world, garage);
  world.vehicle(sedan).position = { x: garage.x, y: 0, z: garage.z + 4 };
  run.update(1 / 60);
  assert.equal(run.status, 'passed');
  assert.deepEqual(seen, ['enter_vehicle', 'go_to', 'tow_vehicle', 'escape_pursuit', 'deliver_vehicle']);
});

test('fail conditions: a wrecked tow truck, a wrecked target, a dead lead', () => {
  const mission = STORY_MISSIONS.m01_hook_and_chain;
  let run = createMissionRun(mission, fakeWorld());
  run.noteEvent('vehicleDestroyed', run.memory.playerVehicleId);
  run.update(1 / 60);
  assert.equal(run.status, 'failed');
  assert.equal(run.failText, 'The tow truck was wrecked');
  run = createMissionRun(mission, fakeWorld(), { startIndex: 3 });
  assert.ok(run.memory.hook, 'a retry from the pursuit re-hooks the Regente');
  run.noteEvent('vehicleDestroyed', run.memory.hook.targetId);
  run.update(1 / 60);
  assert.equal(run.failText, 'The Regente was wrecked');
  run = createMissionRun(mission, fakeWorld());
  run.noteEvent('leadDead');
  run.update(1 / 60);
  assert.equal(run.failKind, 'lead_dead');
});

test('Twice the Weight: the timed run to the port gate fails when time runs out', () => {
  const world = fakeWorld();
  const mission = STORY_MISSIONS.m02_twice_the_weight;
  const run = createMissionRun(mission, world, { startIndex: 4 });
  assert.equal(run.objective.kind, 'escape_pursuit');
  assert.ok(run.secondsLeft >= 90);
  assert.equal(advance(run, run.secondsLeft + 1, 0.5), 'failed');
  assert.equal(run.failText, 'The port gate closed');
});

test('Twice the Weight: photographs need the hold, the respray clears the stars', () => {
  const world = fakeWorld();
  const run = createMissionRun(STORY_MISSIONS.m02_twice_the_weight, world, { startIndex: 2 });
  assert.equal(run.objective.kind, 'photograph');
  const spots = run.objective.marks.slice();
  assert.equal(spots.length, 3);
  for (const spot of spots) {
    moveTo(world, spot);
    advance(run, 0.5);
    assert.equal(run.index, 2, 'nothing without holding E');
    world.held = true;
    advance(run, 1.6);
    world.held = false;
  }
  assert.equal(run.index, 3);
  run.skipTo(7);
  world.wanted = 2;
  const shop = world.place('capa_fresca_hierro');
  moveTo(world, shop);
  world.me.vehicleId = 'v99';
  run.update(1 / 60);
  assert.equal(run.status, 'passed');
  assert.equal(world.wanted, 0);
});

test('fair time limits give a route its running time', () => {
  assert.equal(fairTimeLimit(90, 100, true), 90);
  assert.ok(fairTimeLimit(90, 600, true) > 130);
});

test('cutscene shots: one per line, the opening a crane, lines last long enough', () => {
  const lines = STORY_MISSIONS.m01_hook_and_chain.intro;
  const shots = planCutsceneShots({ x: 10, y: 2, z: 20, heading: 0 }, lines, 'dez_tolliver');
  assert.equal(shots.length, lines.length);
  assert.ok(shots[0].from.y > shots[1].from.y);
  for (const shot of shots) for (const point of [shot.from, shot.to, shot.lookFrom, shot.lookTo]) assert.ok(Number.isFinite(point.x + point.y + point.z));
  assert.ok(lineSeconds('one two', 3.6) === 3.6 && lineSeconds('a '.repeat(20), 3.6) > 3.6);
});
