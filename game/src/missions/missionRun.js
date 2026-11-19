// One play of one story mission: its objectives in order, each run by its kind
// (objectiveKinds.js), with the objective timer, the mission's fail conditions, a checkpoint
// at the start of every objective (MISSION_RULES.checkpointAfterEachObjective) and skipping
// for tests and showcase scenes. Pure: the game is reached only through the mission world, and
// what the HUD must hear goes out through the `on` callbacks.
//
//   const run = createMissionRun(mission, world, { startIndex, on: { objective, timer } });
//   run.update(stepSeconds);   // 'running' | 'passed' | 'failed'
//   run.noteEvent('leadDead' | 'leadBusted' | 'vehicleDestroyed', id?);
//   run.fail(kind, text?);  run.skipTo(index);  run.dispose();
import { OBJECTIVE_KINDS } from './objectiveKinds.js';

/** Fail screen lines for kinds a mission does not word itself. */
export const DEFAULT_FAIL_TEXT = Object.freeze({
  lead_dead: 'You flatlined', lead_busted: 'You got cuffed', ally_dead: 'Your ally died',
  vehicle_destroyed: 'Your vehicle was wrecked', target_destroyed: 'The target was wrecked',
  target_escaped: 'The target got away', timer_expired: 'Out of time', detected: 'You were spotted',
  cargo_ruined: 'The cargo was ruined', race_lost: 'You lost the race', left_area: 'You left the area',
  aborted: 'Mission abandoned',
});

/**
 * A catalog failure reason in MARAZUL's own words: the death and arrest titles of a commercial
 * series ("wasted", "busted") become "flatlined" and "cuffed", as on the player's down screens.
 */
export function failureWords(text) {
  return String(text ?? '')
    .replace(/\bwas wasted\b/gi, 'flatlined').replace(/\bwasted\b/gi, (w) => (w[0] === 'W' ? 'Flatlined' : 'flatlined'))
    .replace(/\bwas busted\b/gi, 'got cuffed').replace(/\bbusted\b/gi, (w) => (w[0] === 'B' ? 'Cuffed' : 'cuffed'));
}

/**
 * Starts a run of a mission.
 * @param {object} mission A STORY_MISSIONS entry.
 * @param {object} world The mission world (missionWorld.js, or a fake in tests).
 * @param {{startIndex?: number, kinds?: object, on?: {objective?: Function, timer?: Function}}} [options]
 */
export function createMissionRun(mission, world, options = {}) {
  const kinds = options.kinds ?? OBJECTIVE_KINDS;
  const on = options.on ?? {};
  const memory = {
    vehicles: {}, playerVehicleId: null, hook: null, spawned: [], targets: new Set(),
    place: world.place(mission.start?.landmark) || null,
  };
  const run = {
    mission, memory, status: 'running', index: -1, objective: null, checkpoint: 0,
    secondsLeft: null, failKind: null, failText: null, elapsed: 0,
    update, noteEvent, fail, skipTo, dispose,
  };
  const destroyed = new Set();
  let leadDead = false;
  let leadBusted = false;
  let lastWholeSecond = -1;

  function contextFor(index) {
    const step = mission.objectives[index];
    return { index, kind: step.kind, text: step.text, params: step.params || {}, world, memory, state: {}, target: null, marks: null, timeLimit: null, retarget: false };
  }

  function begin(index) {
    if (run.objective) kinds[run.objective.kind]?.end?.(run.objective);
    run.index = index;
    run.checkpoint = index;
    if (index >= mission.objectives.length) { pass(); return; }
    const o = contextFor(index);
    run.objective = o;
    const kind = kinds[o.kind];
    kind?.begin(o);
    const next = mission.objectives[index + 1];
    if (next && kinds[next.kind]?.prepare) kinds[next.kind].prepare(contextFor(index + 1));
    run.secondsLeft = o.timeLimit;
    lastWholeSecond = -1;
    on.objective?.(o);
    world.marks?.(o.marks, o.target);
  }

  function failText(kind) {
    const named = (mission.failConditions || []).find((each) => each.kind === kind);
    return named ? failureWords(named.text) : DEFAULT_FAIL_TEXT[kind] ?? 'Mission failed';
  }

  function listed(kind) {
    return (mission.failConditions || []).some((each) => each.kind === kind);
  }

  function fail(kind, text) {
    if (run.status !== 'running') return;
    if (run.objective) kinds[run.objective.kind]?.end?.(run.objective);
    run.status = 'failed';
    run.failKind = kind;
    run.failText = text ?? failText(kind);
  }

  function pass() {
    run.status = 'passed';
    run.objective = null;
  }

  function checkFailConditions() {
    if (leadDead) return 'lead_dead';
    if (leadBusted) return 'lead_busted';
    if (memory.playerVehicleId && destroyed.has(memory.playerVehicleId) && listed('vehicle_destroyed')) return 'vehicle_destroyed';
    for (const id of memory.targets) if (destroyed.has(id) && listed('target_destroyed')) return 'target_destroyed';
    return null;
  }

  function update(dt) {
    if (run.status !== 'running') return run.status;
    run.elapsed += dt;
    const failed = checkFailConditions();
    if (failed) { fail(failed); return run.status; }
    if (memory.hook) world.tow?.(memory.hook, dt);
    const o = run.objective;
    if (!o) return run.status;
    if (run.secondsLeft !== null) {
      run.secondsLeft = Math.max(0, run.secondsLeft - dt);
      const whole = Math.ceil(run.secondsLeft);
      if (whole !== lastWholeSecond) { lastWholeSecond = whole; on.timer?.(whole); }
      if (run.secondsLeft <= 0) { fail('timer_expired'); return run.status; }
    }
    const result = kinds[o.kind] ? kinds[o.kind].update(o, dt) : 1;
    // A new target for the same objective: a new place (the next checkpoint) is passed on as the
    // objective again (the maps and GPS follow it); a 'quiet' one (the nearest foe of a fight
    // changed) moves the markers only, with no new announcement.
    if (o.retarget) { const quiet = o.retarget === 'quiet'; o.retarget = false; on.objective?.(o, quiet); world.marks?.(o.marks, o.target); }
    if (typeof result === 'string') fail(result);
    else if (result === 1) begin(run.index + 1);
    return run.status;
  }

  function noteEvent(what, id) {
    if (what === 'leadDead') leadDead = true;
    else if (what === 'leadBusted') leadBusted = true;
    else if (what === 'vehicleDestroyed') destroyed.add(id);
  }

  /** Restores what the objectives before `index` leave behind, then begins it. */
  function skipTo(index) {
    if (run.status !== 'running') return;
    const target = Math.max(0, Math.min(index, mission.objectives.length));
    for (let i = Math.max(0, run.index); i < target; i += 1) {
      const o = contextFor(i);
      const kind = kinds[o.kind];
      if (kind?.restore) kind.restore(o);
      else if (o.params.landmark) memory.place = world.place(o.params.landmark) || memory.place;
    }
    begin(target);
  }

  function dispose() {
    if (run.objective) kinds[run.objective.kind]?.end?.(run.objective);
    world.marks?.(null, null);
    world.unhook?.();
    for (const id of memory.spawned) world.removeVehicle?.(id);
    memory.spawned.length = 0;
  }

  const start = Math.max(0, options.startIndex ?? 0);
  if (start > 0) skipTo(start);
  else begin(0);
  return run;
}
