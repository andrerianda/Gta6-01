// The state machine of the final arc (mission 17, POINT OF NO RETURN): which stage runs, the last
// checkpoint reached, failing and the two retries, what the mission's data keeps across a retry,
// completion, and the save section. Pure: no three, no DOM, no game context; the runtime
// (finalMissionRuntime.js) drives the world from what this decides. Tested in
// tools/tests/finalmission/.
//
//   const machine = createFinalMissionMachine();
//   machine.start({ checkpoint: 2, aircraftId: 'garza_negra' });   // -> 'takeoff_window'
//   machine.next();  machine.fail('crashed');  machine.retry('checkpoint', { flightMode: 'realistic' });
import {
  FINAL_STAGE_ORDER, FINAL_CHECKPOINTS, FINAL_FAIL_REASONS, finalStage, nextFinalStage, checkpointOfStage, retryStage,
} from './finalMissionStages.js';

/** The aircraft the mission can be flown in; the first is the default. */
export const FINAL_AIRCRAFT = Object.freeze(['manta_sombra', 'garza_negra']);
/** The flight modes: 'casual' is ASSISTED (the default), 'realistic' is SIMULATION. */
export const FINAL_FLIGHT_MODES = Object.freeze(['casual', 'realistic']);

/** The mission's data at its very start. */
export function freshFinalData() {
  return {
    aircraftId: FINAL_AIRCRAFT[0], flightMode: FINAL_FLIGHT_MODES[0], suspicion: 0, sergeantAnswer: null,
    takeoffGrade: null, landingGrade: null, alarm: false, betrayed: false,
  };
}

/**
 * What a retry may change. Restarting the mission: the aircraft and the mode. Retrying from
 * checkpoint 2 (in the cockpit before takeoff): the mode only. Any later checkpoint: nothing.
 * @param {'checkpoint' | 'start'} from
 * @param {number} checkpoint The checkpoint the retry returns to.
 * @returns {{aircraft: boolean, mode: boolean}}
 */
export function retryChoices(from, checkpoint) {
  if (from === 'start') return { aircraft: true, mode: true };
  return { aircraft: false, mode: checkpoint === 2 };
}

/**
 * The data a stage begins with when the mission is (re)built there: what was decided before that
 * point is kept, what is decided after it is cleared.
 * @param {object} data The data so far.
 * @param {string} stageId The stage the mission is rebuilt at.
 */
export function dataForStage(data, stageId) {
  const index = FINAL_STAGE_ORDER.indexOf(stageId);
  const before = (id) => index <= FINAL_STAGE_ORDER.indexOf(id);
  const next = { ...freshFinalData(), ...data };
  if (before('cross_the_base')) { next.suspicion = 0; next.sergeantAnswer = null; }
  if (before('takeoff_window')) next.takeoffGrade = null;
  next.landingGrade = null;
  // The alarm goes off at takeoff: every stage after the takeoff window begins with it sounding.
  next.alarm = index > FINAL_STAGE_ORDER.indexOf('takeoff_window') && index < FINAL_STAGE_ORDER.indexOf('free_roam');
  next.betrayed = index > FINAL_STAGE_ORDER.indexOf('handover') && index < FINAL_STAGE_ORDER.indexOf('free_roam');
  return next;
}

const oneOf = (value, list, fallback) => (list.includes(value) ? value : fallback);

/**
 * Creates the machine.
 * @returns {object} See the members below.
 */
export function createFinalMissionMachine() {
  const machine = {
    /** 'idle' (not begun), 'running', 'failed' (the fail screen is up) or 'completed'. */
    arc: 'idle',
    /** The running stage id, or null. */
    stage: null,
    /** The last checkpoint reached, 0 in the prologue. */
    checkpoint: 0,
    /** Why it failed (a key of FINAL_FAIL_REASONS), while failed. */
    failReason: null,
    data: freshFinalData(),

    get active() { return machine.arc === 'running' || machine.arc === 'failed'; },
    /** Whether the running stage belongs to the mission proper (the HUD says MISSION 17/17). */
    get inMission() { return machine.active && Boolean(finalStage(machine.stage)?.mission); },

    /**
     * Begins the arc: at a stage, at a checkpoint (1 to 5), or at the first scene.
     * @returns {string | null} The stage begun, or null for an unknown one.
     */
    start({ stage, checkpoint, aircraftId, flightMode } = {}) {
      const stageId = stage ?? (checkpoint ? FINAL_CHECKPOINTS[checkpoint] : FINAL_STAGE_ORDER[0]);
      if (!finalStage(stageId)) return null;
      machine.data = dataForStage({
        ...freshFinalData(),
        aircraftId: oneOf(aircraftId, FINAL_AIRCRAFT, FINAL_AIRCRAFT[0]),
        flightMode: oneOf(flightMode, FINAL_FLIGHT_MODES, FINAL_FLIGHT_MODES[0]),
      }, stageId);
      return enter(stageId);
    },

    /** The stage after the running one; after the last the arc is completed. @returns {string | null} */
    next() {
      if (machine.arc !== 'running') return null;
      const stageId = nextFinalStage(machine.stage);
      if (!stageId) return complete();
      return enter(stageId);
    },

    /** Jumps to a stage. @returns {string | null} */
    goto(stageId) {
      if (!finalStage(stageId) || machine.arc === 'completed') return null;
      return enter(stageId);
    },

    /** Fails the running stage. @returns {string | null} The reason line, or null when nothing runs. */
    fail(reasonId) {
      if (machine.arc !== 'running') return null;
      machine.arc = 'failed';
      machine.failReason = reasonId in FINAL_FAIL_REASONS ? reasonId : 'exposed';
      return FINAL_FAIL_REASONS[machine.failReason];
    },

    /** The stage a retry would return to. */
    retryTarget(from = 'checkpoint') { return retryStage(machine.stage, from); },

    /**
     * Retries after a failure, from the last checkpoint or from the start of the mission.
     * @param {'checkpoint' | 'start'} [from]
     * @param {{aircraftId?: string, flightMode?: string}} [changes] Taken only where retryChoices allows.
     * @returns {string | null} The stage begun.
     */
    retry(from = 'checkpoint', changes = {}) {
      if (machine.arc !== 'failed') return null;
      const stageId = retryStage(machine.stage, from);
      const allowed = retryChoices(from, checkpointOfStage(stageId));
      const data = { ...machine.data };
      if (allowed.aircraft) data.aircraftId = oneOf(changes.aircraftId, FINAL_AIRCRAFT, data.aircraftId);
      if (allowed.mode) data.flightMode = oneOf(changes.flightMode, FINAL_FLIGHT_MODES, data.flightMode);
      machine.data = dataForStage(data, stageId);
      return enter(stageId);
    },

    /** Marks the arc completed (the free roam stage calls it). */
    complete,

    /** The stage a loaded save resumes at: the last checkpoint's, or the prologue stage itself. */
    resumeStage() {
      if (!machine.active || !machine.stage) return null;
      return machine.checkpoint ? FINAL_CHECKPOINTS[machine.checkpoint] : machine.stage;
    },

    /** The save section: { arc: 'idle' | 'running' | 'completed', stage, checkpoint, aircraftId, flightMode, data }. */
    serialise() {
      return {
        arc: machine.arc === 'failed' ? 'running' : machine.arc,
        stage: machine.stage, checkpoint: machine.checkpoint,
        aircraftId: machine.data.aircraftId, flightMode: machine.data.flightMode,
        data: { ...machine.data },
      };
    },

    /** Reads a save section back; anything unreadable leaves the arc idle. */
    restore(saved) {
      machine.arc = 'idle'; machine.stage = null; machine.checkpoint = 0; machine.failReason = null;
      machine.data = freshFinalData();
      if (!saved || typeof saved !== 'object') return;
      const arc = oneOf(saved.arc, ['idle', 'running', 'completed'], 'idle');
      const data = { ...freshFinalData(), ...(saved.data && typeof saved.data === 'object' ? saved.data : {}) };
      data.aircraftId = oneOf(saved.aircraftId ?? data.aircraftId, FINAL_AIRCRAFT, FINAL_AIRCRAFT[0]);
      data.flightMode = oneOf(saved.flightMode ?? data.flightMode, FINAL_FLIGHT_MODES, FINAL_FLIGHT_MODES[0]);
      machine.data = data;
      if (arc === 'completed') { machine.arc = 'completed'; return; }
      if (arc !== 'running' || !finalStage(saved.stage)) return;
      machine.arc = 'running';
      machine.stage = saved.stage;
      machine.checkpoint = checkpointOfStage(saved.stage);
    },
  };

  function enter(stageId) {
    machine.arc = 'running';
    machine.failReason = null;
    machine.stage = stageId;
    machine.checkpoint = checkpointOfStage(stageId);
    return stageId;
  }

  function complete() {
    machine.arc = 'completed';
    machine.stage = null;
    machine.failReason = null;
    return null;
  }

  return machine;
}
