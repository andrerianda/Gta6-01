// The shared signal clock of Marazul's signalled junctions: one time source (the engine's
// simulation time, context.simulation.time) and the plan's two-phase cycle of every node.signal
// (phases [{green, yellow}], allRed, cycle, offset; docs/CITY_PLAN.md), so the traffic that stops
// at the line, the walkers who wait at the kerb and the lamps on the masts all agree. Published
// as openWorldCity.signals and handed to the city dressing as option `signals`.
//
//   const signals = city.signals;
//   signals.seconds                              // the clock, simulation seconds
//   signals.signalLight(nodeId, phase)           // 'green' | 'yellow' | 'red' for an arm's phase
//   signals.phaseAt(nodeId, out?)                // { phase (-1 all red), left (seconds) }
//   signals.walkOpen(nodeId, conflictPhase, margin?)  // a signalled crossing may be stepped onto
//   signals.lightAt(nodeId, phase, seconds)      // the same at another time (planning ahead)
// No allocation per call: phaseAt writes into a scratch object (or `out`); a node without a
// signal answers green, phase -1 with Infinity left, and walk open.

/** Seconds a walker needs left on the walk phase before stepping onto a signalled crossing. */
export const WALK_START_MARGIN = 5;

/**
 * Creates the clock for one plan.
 * @param {{signal?: object | null}[]} nodes plan.roads.nodes.
 * @param {() => number} timeSource Simulation seconds (the engine's context.simulation.time).
 */
export function createSignalClock(nodes, timeSource) {
  const scratch = { phase: -1, left: 0 };
  const signalOf = (nodeId) => (nodes[nodeId] && nodes[nodeId].signal) || null;
  const clock = {
    /** The clock every signal runs on, in simulation seconds. */
    get seconds() {
      return timeSource();
    },
    /** The light an arm's phase shows at a time ('green' without a signal). */
    lightAt(nodeId, phase, seconds) {
      return signalLightOf(signalOf(nodeId), phase, seconds);
    },
    /** The light an arm's phase shows now (the contract the dressing's lamps read). */
    signalLight(nodeId, phase) {
      return signalLightOf(signalOf(nodeId), phase, timeSource());
    },
    /** The active phase now (-1 during the all-red gap) and the seconds left in it. */
    phaseAt(nodeId, out = scratch) {
      const signal = signalOf(nodeId);
      if (!signal) {
        out.phase = -1;
        out.left = Infinity;
        return out;
      }
      return signalPhaseOf(signal, timeSource(), out);
    },
    /** Whether a walker may step onto a crossing whose traffic has green in `conflictPhase`. */
    walkOpen(nodeId, conflictPhase, margin = WALK_START_MARGIN) {
      const signal = signalOf(nodeId);
      if (!signal || conflictPhase < 0) return true;
      const state = signalPhaseOf(signal, timeSource(), scratch);
      if (state.phase < 0 || state.phase === conflictPhase) return false;
      const next = (state.phase + 1) % signal.phases.length;
      return !(next === conflictPhase && state.left < margin);
    },
  };
  return clock;
}

/**
 * The light a signal shows to a phase at a time.
 * @param {{phases: {green: number, yellow: number}[], allRed: number, cycle: number, offset: number} | null} signal
 * @param {number} phase The arm's phase index (lane.phase, arm.phase); -1 means no signal.
 * @param {number} seconds The clock.
 * @returns {'green'|'yellow'|'red'}
 */
export function signalLightOf(signal, phase, seconds) {
  if (!signal || phase < 0) return 'green';
  let t = (seconds + signal.offset) % signal.cycle;
  if (t < 0) t += signal.cycle;
  for (let i = 0; i < signal.phases.length; i += 1) {
    const { green, yellow } = signal.phases[i];
    if (t < green) return i === phase ? 'green' : 'red';
    if (t < green + yellow) return i === phase ? 'yellow' : 'red';
    t -= green + yellow + signal.allRed;
    if (t < 0) return 'red';
  }
  return 'red';
}

/**
 * The active phase of a signal (-1 during the all-red gap) and the seconds left in it.
 * @param {object} signal node.signal.
 * @param {number} seconds The clock.
 * @param {{phase: number, left: number}} out Written and returned.
 */
export function signalPhaseOf(signal, seconds, out) {
  let t = (seconds + signal.offset) % signal.cycle;
  if (t < 0) t += signal.cycle;
  for (let i = 0; i < signal.phases.length; i += 1) {
    const lit = signal.phases[i].green + signal.phases[i].yellow;
    if (t < lit) {
      out.phase = i;
      out.left = lit - t;
      return out;
    }
    t -= lit;
    if (t < signal.allRed) {
      out.phase = -1;
      out.left = signal.allRed - t;
      return out;
    }
    t -= signal.allRed;
  }
  out.phase = -1;
  out.left = 0;
  return out;
}
