// The runtime of the final arc and of mission 17, POINT OF NO RETURN: walks FINAL_STAGES with the
// pure machine (finalMissionMachine.js), loads each stage's controller from
// stages/<stageId>.js (export create<StageName>Stage(rt) -> { enter, update, exit, onEvent? }; a
// missing module is a generic stage), hands the stages the object `rt` of the contract, shows the
// HUD label and the fail screen (finalMissionScreens.js), rebuilds the world of a checkpoint
// (finalCheckpoints.js), saves at every checkpoint, and begins the arc: in normal play at night
// once mission 16 is done, by the command FINAL_MISSION_START, or by ?mission=final on the page.
import { GAME_COMMANDS } from '../../core/events/gameCommands.js';
import { GAME_EVENTS } from '../../core/events/gameEvents.js';
import { GAME_STATE } from '../../core/state/gameStates.js';
import { FINAL_MISSION, FINAL_ARC_LINES } from '../../catalog/finalArcScript.js';
import { FINAL_STAGE_ORDER, FINAL_FAIL_REASONS, finalStage, checkpointOfStage } from './finalMissionStages.js';
import { createFinalMissionMachine, retryChoices } from './finalMissionMachine.js';
import { createFinalMissionScreens } from './finalMissionScreens.js';
import { restoreCheckpoint } from './finalCheckpoints.js';

/** Events handed to the running stage's onEvent(topic, payload). */
const STAGE_EVENT_KEYS = Object.freeze([
  'PHONE_CALL_RINGING', 'PHONE_CALL_ANSWERED', 'PHONE_CALL_ENDED', 'CINEMATIC_STARTED', 'CINEMATIC_ENDED', 'CINEMATIC_CUE',
  'STORY_LINE_SPOKEN', 'BASE_CREW_SALUTED', 'RESTRICTED_AREA_CHANGED', 'WORLD_FLAG_CHANGED', 'RADIO_MESSAGE',
  'AIR_WANTED_CHANGED', 'AIR_INTERCEPT_STAGE_CHANGED', 'AIRSPACE_BOUNDARY_CHANGED', 'AIRCRAFT_SHOT_DOWN', 'RADAR_TRACK_CHANGED',
  'RADAR_EMITTER_DESTROYED', 'GUIDED_BOMB_RELEASED', 'GUIDED_BOMB_IMPACT', 'SEA_ZONE_LOADED', 'SEA_ZONE_UNLOADED',
  'VEHICLE_DESTROYED', 'VEHICLE_ENTERED', 'VEHICLE_EXITED', 'PLAYER_TELEPORTED', 'WEAPON_EQUIPPED', 'WEAPON_FIRED',
]);
/** The checkpoints the story itself cuts to, so their world is always rebuilt on entry. */
const CUT_CHECKPOINTS = Object.freeze([1, 2, 5]);
/** Seconds a generic stage (no controller, not a scene) lasts. */
const GENERIC_STAGE_SECONDS = 1.5;
/** Normal play: the arc begins after this long at night in free roam as Dez. */
const NIGHT_CALL_SECONDS = 20;

const stageExportName = (stageId) => `create${stageId.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join('')}Stage`;

/**
 * Creates the runtime.
 * @param {import('../../core/systems/gameContext.js').GameContext} context
 */
export function createFinalMissionRuntime(context) {
  const { events, commands, state } = context;
  const machine = createFinalMissionMachine();
  const ui = createFinalMissionScreens();
  const run = (name, payload) => (commands.has(name) ? commands.run(name, payload) : undefined);
  const find = (name) => context.systems.find(name);
  const stops = [];
  /** Timers of the running stage, in game time: {left, fn}. */
  let timers = [];
  let controller = null;
  /** Counts stage entries: anything asynchronous checks it is still its own stage. */
  let entry = 0;
  let missionAnnounced = false;
  let own = { vehicleId: null };
  let pendingStart = null;
  let nightSeconds = 0;
  let downed = null;
  let failScreenUp = false;
  let startedAt = null;

  const rt = {
    context,
    get data() { return machine.data; },
    get stage() { return machine.stage; },
    get checkpoint() { return machine.checkpoint; },
    flags: context.flags,
    /** Not in the contract: the mission's own interface (prompts, the cover bar, the screens) for MISSION's stages. */
    ui,
    /** Not in the contract: how the arc was begun ({stage, checkpoint, plane, byUrl}). */
    get launch() { return startedAt; },

    next() { advance(machine.next()); },
    goto(stageId) { advance(machine.goto(stageId), { cold: true }); },
    fail,

    speak(lineId, options = {}) {
      const seconds = run(GAME_COMMANDS.STORY_LINE_SPEAK, { lineId, ...options });
      if (Number.isFinite(seconds) && seconds > 0) return seconds;
      const words = String(FINAL_ARC_LINES[lineId]?.text ?? '').split(/\s+/).length;
      return Math.max(1.4, 0.6 + words * 0.36);
    },
    say(lineIds, gap = 0.3) {
      return new Promise((resolve) => {
        const list = [...lineIds];
        const step = () => {
          if (!list.length) { resolve(); return; }
          rt.after(rt.speak(list.shift()) + gap, step);
        };
        step();
      });
    },
    objective(text, target = null) {
      events.emit(GAME_EVENTS.MISSION_OBJECTIVE_CHANGED, { missionId: FINAL_MISSION.id, index: FINAL_STAGE_ORDER.indexOf(machine.stage), kind: 'final', text, target });
    },
    timer(secondsLeft) { events.emit(GAME_EVENTS.MISSION_TIMER_CHANGED, { missionId: FINAL_MISSION.id, secondsLeft: secondsLeft ?? null }); },
    hint(text) { ui.setHint(text ?? null); },
    notify(text) {
      if (commands.has(GAME_COMMANDS.UI_NOTIFY)) commands.run(GAME_COMMANDS.UI_NOTIFY, { text, kind: 'story', seconds: 9 });
      else events.emit(GAME_EVENTS.NOTIFICATION_POSTED, { text, kind: 'story', seconds: 9 });
    },
    playScene(sceneId, params) {
      const cinematics = find('cinematics');
      if (!cinematics || typeof cinematics.play !== 'function') return Promise.resolve({ skipped: true });
      try {
        return Promise.resolve(cinematics.play(sceneId, params)).then((result) => result ?? { skipped: false }, () => ({ skipped: true }));
      } catch { return Promise.resolve({ skipped: true }); }
    },
    after(seconds, fn) {
      const timer = { left: Math.max(0, seconds), fn };
      timers.push(timer);
      return () => { timer.fn = null; };
    },
    setStoryState(change = {}) {
      if ('alarm' in change) machine.data.alarm = Boolean(change.alarm);
      if ('betrayed' in change) machine.data.betrayed = Boolean(change.betrayed);
      events.emit(GAME_EVENTS.STORY_STATE_CHANGED, { alarm: machine.data.alarm, betrayed: machine.data.betrayed });
    },
    aircraft() {
      const fleet = find('vehicles');
      const record = fleet && own.vehicleId !== null ? fleet.get(own.vehicleId) : null;
      if (!record) return null;
      return { vehicleId: own.vehicleId, car: fleet.physicsOf(own.vehicleId), entity: record.entity, root: fleet.modelOf(own.vehicleId) };
    },
    seatLeadInAircraft,
    /** Not in the contract: takes the mission aircraft out of the world (checkpoint rebuilds, the end). */
    removeAircraft,
    leadOnFoot({ x, z, heading }) {
      run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x, z }, heading });
    },
    setClock(hours, weather) {
      run(GAME_COMMANDS.TIME_SET, { hours });
      if (weather) run(GAME_COMMANDS.WEATHER_SET, { weather, seconds: 0 });
    },
  };

  /** The slot of the base's own parked aircraft of a model (world/airbase/airBaseVehicles.js), or null. */
  function baseSlot(modelId) {
    return find('airBase')?.vehicles?.parked?.find((slot) => slot.model === modelId) ?? null;
  }

  function removeAircraft() {
    const fleet = find('vehicles');
    if (!fleet) return;
    const player = find('player');
    for (const modelId of ['manta_sombra', 'garza_negra']) {
      const slot = baseSlot(modelId);
      const ids = new Set([slot?.vehicleId, modelId === own.modelId ? own.vehicleId : null]);
      for (const vehicleId of ids) {
        if (vehicleId === null || vehicleId === undefined || !fleet.get(vehicleId)) continue;
        const record = fleet.get(vehicleId);
        const mine = vehicleId === own.vehicleId;
        // The base's own parked aircraft stays unless it is wrecked or the lead sits in it.
        if (!mine && !record.wrecked && record.entity?.data?.driverId == null) continue;
        if (player?.vehicle && player.entity?.data?.vehicleId === vehicleId) {
          const p = record.entity.position;
          run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: p.x, z: p.z } });
        }
        fleet.remove(vehicleId);
        if (slot && slot.vehicleId === vehicleId) slot.vehicleId = null;
      }
    }
    own = { vehicleId: null };
  }

  /** Spawns (or takes over) the chosen aircraft at a place and seats the lead in it. Heading in compass degrees. */
  function seatLeadInAircraft({ x, z, y, heading = 0, speed, engineOn = true, view } = {}) {
    const fleet = find('vehicles');
    if (!fleet) return null;
    const modelId = machine.data.aircraftId;
    const flying = typeof y === 'number';
    removeAircraft();
    const slot = baseSlot(modelId);
    let vehicleId = null;
    if (!flying && slot && slot.vehicleId !== null && fleet.get(slot.vehicleId) && !fleet.get(slot.vehicleId).wrecked) vehicleId = slot.vehicleId;
    if (vehicleId === null) {
      if (slot && slot.vehicleId !== null && fleet.get(slot.vehicleId)) fleet.remove(slot.vehicleId);
      const request = { modelId, position: flying ? { x, y, z } : { x, z }, heading: (heading * Math.PI) / 180, parked: !flying, clearance: false, ownerSystem: 'finalMission' };
      if (flying && Number.isFinite(speed)) request.airspeed = speed;
      vehicleId = fleet.spawn(request) ?? null;
      // The base keeps one aircraft of each kind: ours takes its slot, so no second one appears on the stand.
      if (slot && vehicleId !== null) slot.vehicleId = vehicleId;
    }
    if (vehicleId === null) return null;
    own = { vehicleId, modelId };
    context.settings?.set?.('flightMode', machine.data.flightMode);
    const seated = run(GAME_COMMANDS.PLAYER_ENTER_VEHICLE, { vehicleId });
    const car = fleet.physicsOf(vehicleId);
    if (car && engineOn !== undefined && 'engineOn' in car) car.engineOn = Boolean(engineOn);
    const camera = find('followCamera');
    if (view && typeof camera?.setFlightView === 'function') camera.setFlightView(view);
    const record = fleet.get(vehicleId);
    const p = record?.entity?.position ?? { x, y: y ?? 0, z };
    events.emit(GAME_EVENTS.PLAYER_TELEPORTED, { position: { x: p.x, y: p.y, z: p.z }, heading: -(heading * Math.PI) / 180 });
    return seated === false ? null : vehicleId;
  }

  function leaveStage() {
    entry += 1;
    timers = [];
    const leaving = controller;
    controller = null;
    if (leaving) { try { leaving.exit?.(); } catch { /* a stage that cannot clean up must not stop the mission */ } }
    ui.setPrompt(null, null);
    ui.setHint(null);
    ui.setCover(null);
    ui.closeTalk();
  }

  /**
   * Makes `stageId` the running stage (the machine has already entered it).
   * @param {string | null} stageId
   * @param {{cold?: boolean, previous?: string | null}} [options] cold: the world must be built for it (a retry, a start).
   */
  function advance(stageId, options = {}) {
    const previous = options.previous ?? previousStage;
    leaveStage();
    if (!stageId) {
      if (machine.arc === 'completed') finish();
      return;
    }
    previousStage = stageId;
    const stage = finalStage(stageId);
    const mine = entry;
    if (state.is(GAME_STATE.MISSION_FAILED)) state.enter(GAME_STATE.PLAYING);
    events.emit(GAME_EVENTS.FINAL_MISSION_STAGE_CHANGED, { stage: stageId, previous: previous ?? null, checkpoint: machine.checkpoint });
    if (stage.mission && !missionAnnounced) {
      missionAnnounced = true;
      events.emit(GAME_EVENTS.MISSION_STARTED, { missionId: FINAL_MISSION.id, title: FINAL_MISSION.title });
    }
    rt.timer(null);
    if (stage.checkpoint && (options.cold || CUT_CHECKPOINTS.includes(stage.checkpoint))) restoreCheckpoint(rt, stage.checkpoint);
    else if (options.cold && stage.mission && machine.checkpoint) restoreCheckpoint(rt, machine.checkpoint);
    if (stage.objective) rt.objective(stage.objective, null);
    if (stage.checkpoint) {
      events.emit(GAME_EVENTS.FINAL_MISSION_CHECKPOINT_REACHED, { checkpoint: stage.checkpoint, stage: stageId });
      // A run begun from the page's address (captures, tests) leaves the player's save alone.
      if (!startedAt?.byUrl) run(GAME_COMMANDS.SAVE_WRITE, { reason: 'checkpoint' });
    }
    loadController(stage).then((made) => {
      if (mine !== entry) return;
      controller = made;
      try { controller.enter?.(); } catch (error) { context.log?.warn?.(`final mission: stage ${stageId} could not begin: ${error?.message ?? error}`); }
    });
  }
  let previousStage = null;

  /** The stage's controller from stages/<id>.js, or a generic one. */
  async function loadController(stage) {
    // Stages of kind 'scene' share stages/scene.js (asking for a file that is not there would put a
    // failed request in the console); every other stage has its own module.
    const scene = stage.kind === 'scene';
    try {
      const module = await import(scene ? './stages/scene.js' : `./stages/${stage.id}.js`);
      const create = module[scene ? 'createSceneStage' : stageExportName(stage.id)] ?? module.default;
      if (typeof create === 'function') return create(rt) ?? genericStage(stage);
    } catch { /* not written yet: the generic stage stands in */ }
    return genericStage(stage);
  }

  function genericStage(stage) {
    return {
      enter() {
        const mine = entry;
        if (stage.kind === 'scene') rt.playScene(stage.scene ?? stage.id, { aircraftId: rt.data.aircraftId }).then(() => { if (mine === entry) rt.next(); });
        else rt.after(GENERIC_STAGE_SECONDS, () => rt.next());
      },
      update() {},
      exit() {},
    };
  }

  function fail(reasonId) {
    const line = machine.fail(reasonId);
    if (line === null) return;
    leaveStage();
    rt.timer(null);
    if (find('cinematics')?.playing) run(GAME_COMMANDS.CINEMATIC_SKIP, {});
    run(GAME_COMMANDS.STORY_LINES_STOP, {});
    run(GAME_COMMANDS.PHONE_CALL_END, { reason: 'hungUp' });
    events.emit(GAME_EVENTS.MISSION_FAILED, { missionId: FINAL_MISSION.id, title: FINAL_MISSION.title, reason: line });
    failScreenUp = true;
    const target = (from) => checkpointOfStage(machine.retryTarget(from));
    ui.openFailScreen({
      reason: FINAL_FAIL_REASONS[machine.failReason],
      aircraftId: machine.data.aircraftId, flightMode: machine.data.flightMode,
      choicesFor: (from) => retryChoices(from, target(from)),
      onRetry: (from, changes) => retry({ from, ...changes }),
    });
  }

  /** FINAL_MISSION_RETRY { from, aircraftId?, flightMode? }. */
  function retry({ from = 'checkpoint', aircraftId, flightMode } = {}) {
    const previous = machine.stage;
    const stageId = machine.retry(from === 'start' ? 'start' : 'checkpoint', { aircraftId, flightMode });
    if (!stageId) return false;
    failScreenUp = false;
    ui.closeScreen();
    context.settings?.set?.('flightMode', machine.data.flightMode);
    advance(stageId, { cold: true, previous });
    return true;
  }

  /** FINAL_MISSION_START { stage?, checkpoint?, aircraftId?, flightMode? }. */
  function start(options = {}, byUrl = false) {
    const wasRunning = machine.active;
    if (failScreenUp) { failScreenUp = false; ui.closeScreen(); }
    const stageId = machine.start(options);
    if (!stageId) return false;
    startedAt = { stage: stageId, checkpoint: options.checkpoint ?? null, plane: options.aircraftId ?? null, byUrl };
    if (!wasRunning) missionAnnounced = false;
    context.settings?.set?.('flightMode', machine.data.flightMode);
    advance(stageId, { cold: Boolean(options.stage || options.checkpoint), previous: null });
    return true;
  }

  /** The arc is over: free roam goes on. */
  function finish() {
    missionAnnounced = false;
    previousStage = null;
    rt.timer(null);
    events.emit(GAME_EVENTS.MISSION_OBJECTIVE_CHANGED, { missionId: FINAL_MISSION.id, index: -1, kind: 'final', text: '', target: null });
    ui.setLabel(false);
  }

  function nightCall(dt) {
    const missions = find('missions');
    const player = find('player');
    const hours = context.clock?.timeOfDay ?? context.clock?.hours ?? 12;
    const done = missions?.progress?.completed;
    const ready = Array.isArray(done) && done.includes(FINAL_MISSION.requires) && !missions.activeMissionId
      && player?.characterId === 'dez_tolliver' && !player.down && state.is(GAME_STATE.PLAYING) && (hours >= 22 || hours < 4);
    nightSeconds = ready ? nightSeconds + dt : 0;
    if (nightSeconds >= NIGHT_CALL_SECONDS) { nightSeconds = 0; start({}); }
  }

  const api = {
    rt,
    machine,
    start,
    retry,
    get failScreenUp() { return failScreenUp; },

    begin() {
      stops.push(commands.handle(GAME_COMMANDS.FINAL_MISSION_START, (options = {}) => start(options)));
      stops.push(commands.handle(GAME_COMMANDS.FINAL_MISSION_RETRY, (options = {}) => retry(options)));
      const listen = (topic, handler) => {
        if (!topic) return;
        events.on(topic, handler);
        stops.push(() => events.off(topic, handler));
      };
      for (const key of STAGE_EVENT_KEYS) {
        const topic = GAME_EVENTS[key];
        listen(topic, (payload) => {
          if (machine.arc !== 'running' || !controller?.onEvent) return;
          try { controller.onEvent(topic, payload); } catch { /* one stage's handler must not break the bus */ }
        });
      }
      // The lead dies or is arrested: the usual respawn runs its course, then the mission fails.
      listen(GAME_EVENTS.PLAYER_WASTED, () => { if (machine.inMission && machine.arc === 'running') downed = { reason: 'lead_dead', left: 9 }; });
      listen(GAME_EVENTS.PLAYER_BUSTED, () => { if (machine.inMission && machine.arc === 'running') downed = { reason: 'exposed', left: 9 }; });
      listen(GAME_EVENTS.PLAYER_RESPAWNED, ({ after } = {}) => { if (downed && after !== 'load') downed.left = 0.4; });
      const launch = context.launch ?? {};
      listen(GAME_EVENTS.GAME_READY, () => { gameReady = true; });
      if (launch.mission === 'final' || launch.finalStage || launch.checkpoint) {
        startsByUrl = true;
        listen(GAME_EVENTS.GAME_READY, () => {
          pendingStart = { left: 0.4, options: { stage: finalStage(launch.finalStage) ? launch.finalStage : undefined, checkpoint: launch.checkpoint ?? undefined, aircraftId: launch.plane ?? undefined, flightMode: launch.flightMode ?? undefined } };
        });
      }
    },

    update(dt) {
      if (pendingStart && state.is(GAME_STATE.PLAYING)) {
        pendingStart.left -= dt;
        if (pendingStart.left <= 0) { const { options } = pendingStart; pendingStart = null; start(options, true); }
      }
      if (machine.arc === 'idle') { if (gameReady && !startsByUrl) nightCall(dt); return; }
      const playing = state.is(GAME_STATE.PLAYING, GAME_STATE.PHONE_OPEN);
      ui.setHudVisible(playing && machine.arc === 'running');
      ui.setLabel(machine.inMission);
      if (machine.arc === 'failed') {
        // The fail screen holds the game in its missionFailed state once the state machine allows it.
        if (state.is(GAME_STATE.PLAYING, GAME_STATE.CUTSCENE, GAME_STATE.PHONE_OPEN)) { try { state.enter(GAME_STATE.MISSION_FAILED); } catch { /* stay as it is */ } }
        return;
      }
      if (machine.arc !== 'running') return;
      if (downed) {
        downed.left -= dt;
        if (downed.left <= 0) { const { reason } = downed; downed = null; fail(reason); }
        return;
      }
      if (timers.length) {
        const due = [];
        for (const timer of timers) { timer.left -= dt; if (timer.left <= 0) due.push(timer); }
        if (due.length) {
          timers = timers.filter((timer) => timer.left > 0);
          const mine = entry;
          for (const timer of due) { if (mine === entry && timer.fn) timer.fn(); }
        }
      }
      if (controller?.update) controller.update(dt);
    },

    serialise: () => machine.serialise(),

    /** A loaded save: mid-mission it resumes at its last checkpoint (in the prologue: at that stage). */
    restore(saved) {
      leaveStage();
      failScreenUp = false;
      ui.closeScreen();
      missionAnnounced = false;
      previousStage = null;
      machine.restore(saved);
      const stageId = machine.resumeStage();
      if (!stageId) { ui.setLabel(false); ui.setHudVisible(false); return; }
      machine.goto(stageId);
      startedAt = { stage: stageId, checkpoint: machine.checkpoint || null, plane: null, byUrl: false };
      // After the save system has put the lead back (it does so last), the checkpoint takes over.
      pendingResume = stageId;
      Promise.resolve().then(() => {
        if (pendingResume !== stageId) return;
        pendingResume = null;
        advance(stageId, { cold: true, previous: null });
      });
    },

    dispose() {
      leaveStage();
      for (const stop of stops) if (typeof stop === 'function') stop();
      ui.dispose();
    },
  };
  let pendingResume = null;
  let gameReady = false;
  let startsByUrl = false;
  return api;
}
