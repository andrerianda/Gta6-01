// Runs every objective kind the catalog uses, with every catalog step's own parameters, over a
// fake mission world that has squads, a tow boom and vehicles: begin, prepare, a few seconds of
// update with the lead walking to the target, end, and restore. Guards against kinds that throw
// at run time (a "combatKind is not defined" was seen in a capture) and checks that the HUD
// always hears a target as {x, z} or null.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY_MISSIONS, MISSION_OBJECTIVE_KINDS, MISSION_RULES } from '../../../game/src/catalog/storyMissions.js';
import { OBJECTIVE_KINDS, objectiveTarget, wavesOf } from '../../../game/src/missions/objectiveKinds.js';

function fakeWorld() {
  const vehicles = new Map();
  const player = { x: 0, y: 0, z: 0, heading: 0, speed: 0, vehicleId: null };
  let next = 1;
  const world = {
    player: () => player,
    me: player,
    wanted: 2,
    squads: 0,
    place(id) {
      if (!id) return null;
      let hash = 0;
      for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
      return { id, name: id, x: (hash % 600) - 300, y: 0, z: ((hash >> 11) % 600) - 300, frontX: 0, frontZ: 1 };
    },
    spawnVehicle(modelId, near) {
      const id = `v${next++}`;
      vehicles.set(id, { id, modelId, position: { x: near.x + 5, y: 0, z: near.z }, heading: 0, alive: true, data: { speed: 0, health: 1000, maxHealth: 1000 } });
      return id;
    },
    vehicle: (id) => vehicles.get(id) ?? null,
    removeVehicle: (id) => vehicles.delete(id),
    drive() {}, halt() {},
    boomGap: () => 1,
    hook() {}, unhook() {}, tow() {},
    enterVehicle(id) { player.vehicleId = id; return true; },
    switchLead: () => true,
    wantedLevel: () => world.wanted,
    setWanted(level) { world.wanted = level; },
    clearWanted() { world.wanted = 0; },
    holding: () => true,
    notify() {}, help() {}, marks() {},
    pointNear: (at, i, n, spacing) => ({ x: at.x + (i - (n - 1) / 2) * spacing, y: 0, z: at.z }),
    spawnSquad(groups, near) {
      world.squads += 1;
      const members = groups.map((g, i) => ({ id: `e${i}`, position: { x: near.x + 3 + i, y: 0, z: near.z }, standing: true }));
      return { total: members.length, members };
    },
    fightSquad(squad) { for (const m of squad.members) m.standing = false; return 0; },
    nearestEnemy: (squad) => squad.members.find((m) => m.standing) ?? null,
    releaseSquad() {},
  };
  return world;
}

function contextFor(step, world) {
  return {
    index: 0, kind: step.kind, text: step.text, params: step.params || {}, world, state: {}, target: null, marks: null, timeLimit: null, retarget: false,
    memory: { vehicles: {}, playerVehicleId: null, hook: null, spawned: [], targets: new Set(), place: world.place('tolliver_tow') },
  };
}

const allowed = new Set([0, 1, ...(MISSION_RULES.failKinds || [])]);
const steps = Object.values(STORY_MISSIONS).flatMap((mission) => mission.objectives.map((step) => ({ mission: mission.id, step })));

test('every catalog objective kind has an implementation', () => {
  for (const kind of Object.keys(MISSION_OBJECTIVE_KINDS)) assert.ok(OBJECTIVE_KINDS[kind], `kind ${kind} is not implemented`);
  for (const { mission, step } of steps) assert.ok(OBJECTIVE_KINDS[step.kind], `${mission}: ${step.kind}`);
});

test('every catalog step runs: begin, update with the lead going to the target, end, restore', () => {
  for (const { mission, step } of steps) {
    const kind = OBJECTIVE_KINDS[step.kind];
    const label = `${mission} ${step.kind} "${step.text}"`;
    const world = fakeWorld();
    const o = contextFor(step, world);
    assert.doesNotThrow(() => kind.prepare?.(contextFor(step, world)), `${label} prepare`);
    assert.doesNotThrow(() => kind.begin(o), `${label} begin`);
    for (let i = 0; i < 240; i += 1) {
      const target = objectiveTarget(o.target);
      if (target) { world.me.x = target.x; world.me.z = target.z; }
      let result;
      assert.doesNotThrow(() => { result = kind.update(o, 1 / 20); }, `${label} update`);
      assert.ok(allowed.has(result), `${label} returned ${result}`);
      const heard = objectiveTarget(o.target);
      assert.ok(heard === null || (Number.isFinite(heard.x) && Number.isFinite(heard.z) && Object.keys(heard).length === 2), `${label} target`);
      if (result !== 0) break;
    }
    assert.doesNotThrow(() => kind.end?.(o), `${label} end`);
    assert.doesNotThrow(() => kind.restore?.(contextFor(step, fakeWorld())), `${label} restore`);
  }
});

test('fights spawn their waves and pass when the squad is down', () => {
  const fights = steps.filter(({ step }) => ['brawl', 'eliminate', 'subdue'].includes(step.kind));
  assert.ok(fights.length > 0);
  for (const { mission, step } of fights) {
    const world = fakeWorld();
    const o = contextFor(step, world);
    OBJECTIVE_KINDS[step.kind].begin(o);
    world.me.x = o.target.x; world.me.z = o.target.z;
    let result = 0;
    for (let i = 0; i < 2000 && result === 0; i += 1) result = OBJECTIVE_KINDS[step.kind].update(o, 1 / 20);
    assert.equal(result, 1, `${mission} ${step.kind}`);
    assert.equal(world.squads, Math.max(1, wavesOf(step.kind, step.params).length), `${mission} waves`);
  }
});

test('a tail or chase target given as {vehicle, color} spawns as a driven car and is not done at once', () => {
  const steps = Object.values(STORY_MISSIONS).flatMap((m) => m.objectives.map((step) => ({ mission: m.id, step })))
    .filter(({ step }) => ['tail', 'chase'].includes(step.kind) && typeof step.params.target === 'object');
  assert.ok(steps.length >= 3);
  for (const { mission, step } of steps) {
    const world = fakeWorld();
    const asked = [];
    const spawn = world.spawnVehicle;
    world.spawnVehicle = (model, near, how) => { asked.push({ model, how }); return spawn(model, near, how); };
    const o = contextFor(step, world);
    OBJECTIVE_KINDS[step.kind].begin(o);
    const target = asked.find((a) => a.model === step.params.target.vehicle);   // after any providedVehicle
    assert.ok(target, `${mission}: spawned by model id`);
    assert.equal(target.how.parked, false, `${mission}: a driven car`);
    if (step.params.target.color) assert.equal(target.how.colour, step.params.target.color);
    assert.equal(OBJECTIVE_KINDS[step.kind].update(o, 1 / 20), 0, `${mission} ${step.kind}: still pending`);
  }
});

test('a tail or chase after taking a vehicle of the same model targets another vehicle (m06, m09, m13)', () => {
  // Shift 14: the enter_vehicle objective remembered the lead's speedboat by its model, and the tail
  // or chase that follows took that same boat as its target (m09's chase passed at once, gap 0).
  for (const id of ['m06_charter_rates', 'm09_weigh_her_again', 'm13_no_further_questions']) {
    const objectives = STORY_MISSIONS[id].objectives;
    const enter = objectives.findIndex((s) => s.kind === 'enter_vehicle');
    const follow = objectives.findIndex((s, i) => i > enter && ['tail', 'chase'].includes(s.kind));
    assert.ok(enter >= 0 && follow > enter, `${id}: enter then follow`);
    const world = fakeWorld();
    const memory = contextFor(objectives[enter], world).memory;
    const run = (step) => ({ ...contextFor(step, world), memory });
    const take = run(objectives[enter]);
    OBJECTIVE_KINDS.enter_vehicle.begin(take);
    world.enterVehicle(take.state.id);
    assert.equal(OBJECTIVE_KINDS.enter_vehicle.update(take, 1 / 20), 1, `${id}: in the vehicle`);
    const chase = run(objectives[follow]);
    OBJECTIVE_KINDS[objectives[follow].kind].begin(chase);
    assert.ok(chase.state.id && chase.state.id !== take.state.id, `${id}: the target is not the lead's own ${objectives[enter].params.vehicle}`);
    assert.equal(OBJECTIVE_KINDS[objectives[follow].kind].update(chase, 1 / 20), 0, `${id}: still pending`);
    // A delivery of that model afterwards (m13) still means the lead's own vehicle.
    const deliver = objectives.find((s, i) => i > follow && s.kind === 'deliver_vehicle');
    if (deliver) {
      const d = run(deliver);
      OBJECTIVE_KINDS.deliver_vehicle.begin(d);
      assert.equal(d.state.id, take.state.id, `${id}: delivers the lead's own vehicle`);
    }
  }
});

test("Twice the Weight's foot pursuers come from a side of the road the lead is on", () => {
  const step = STORY_MISSIONS.m02_twice_the_weight.objectives.find((s) => s.kind === 'escape_pursuit' && s.params.landmark);
  const world = fakeWorld();
  let near = null;
  const spawn = world.spawnSquad;
  world.spawnSquad = (groups, at, how) => { near = at; return spawn(groups, at, how); };
  // The lead at the cold store door; the quay road runs along z between x = -13 and -5; the goal
  // lies up the quay, so "straight behind" would be across the road.
  world.place = (id) => (id ? { id, x: 10, y: 0, z: 60, frontX: -1, frontZ: 0 } : null);
  world.me.x = 0; world.me.z = 0;
  const onRoad = (x) => x > -13 && x < -5;
  world.roadBetween = (a, b) => { for (let i = 1; i <= 20; i += 1) if (onRoad(a.x + ((b.x - a.x) * i) / 20)) return true; return false; };
  const o = contextFor(step, world);
  o.world.place = world.place;
  OBJECTIVE_KINDS.escape_pursuit.begin(o);
  assert.ok(near, 'a squad was spawned');
  assert.equal(world.roadBetween(world.me, near), false, `origin ${near.x.toFixed(1)}, ${near.z.toFixed(1)}`);
  assert.ok(Math.hypot(near.x, near.z) > 17, 'still 18 m off');
});

test('objectiveTarget sends {x, z} or null', () => {
  assert.deepEqual(objectiveTarget({ x: 1, y: 5, z: 2, frontX: 0 }), { x: 1, z: 2 });
  assert.equal(objectiveTarget(null), null);
  assert.equal(objectiveTarget({ x: NaN, z: 0 }), null);
  assert.equal(objectiveTarget({ x: 1 }), null);
});

test("Charter Rates' buoys and the way back go out onto the water when the world can float them", () => {
  const world = fakeWorld();
  world.waterPlace = (point) => ({ ...point, x: point.x + 100, y: 0, onWater: true });
  const run = STORY_MISSIONS.m06_charter_rates.objectives.find((step) => step.kind === 'checkpoint_run');
  const o = contextFor(run, world);
  OBJECTIVE_KINDS.checkpoint_run.begin(o);
  assert.ok(o.marks.length > 0 && o.marks.every((point) => point.onWater), 'every buoy on the water');
  const back = STORY_MISSIONS.m06_charter_rates.objectives.filter((step) => step.kind === 'go_to' && step.params.by === 'boat').pop();
  const r = contextFor(back, world);
  OBJECTIVE_KINDS.go_to.begin(r);
  assert.ok(r.target.onWater);
  // On foot nothing moves.
  const walk = contextFor(STORY_MISSIONS.m06_charter_rates.objectives[0], world);
  OBJECTIVE_KINDS.go_to.begin(walk);
  assert.ok(!walk.target.onWater);
});
