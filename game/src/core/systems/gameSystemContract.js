// The lifecycle contract every game system of MARAZUL satisfies, in one place: what a system
// factory returns, when each method is called, and the check the registry runs on it.
//
//   export function createTrafficSystem(context) {
//     return {
//       name: 'traffic',
//       dependsOn: ['openWorldCity', 'vehicles'],
//       async init(progress) { ... progress(0.5, 'lane graph'); ... },
//       fixedUpdate(dt) { ... },
//     };
//   }
//
// A factory only builds the object: it may keep the context and create its own private state,
// but it must not look up other systems or touch the scene before init().

/**
 * @typedef {Object} GameSystem What a system factory returns. Everything but `name` is optional;
 *   the object may carry any other members as its public interface for other systems.
 * @property {string} name Unique camelCase name; other systems find it with
 *   `context.systems.get(name)`.
 * @property {string[]} [dependsOn] Names of systems whose init() must have finished before this
 *   one's starts (and which are disposed after it). It does not change the update order: that is
 *   the order of the manifest.
 * @property {'simulating' | 'always'} [runsWhen] 'simulating' (the default) ticks only in game
 *   states that simulate the world (see core/state/gameStates.js) and receives the scaled
 *   simulation time; 'always' ticks in every state with real time (interface, audio, saving).
 * @property {number} [loadWeight] Share of the loading bar this system's init() takes; default 1.
 * @property {(progress: (fraction: number, label?: string) => void) => (void | Promise<void>)} [init]
 *   Asynchronous initialisation behind the loading screen. Call progress(0..1, label) as it goes.
 * @property {() => void} [start] Called once after every system has initialised, in update
 *   order, before the first frame: subscribe to events, look at what others have built.
 * @property {(stepSeconds: number) => void} [fixedUpdate] The 60 Hz simulation step.
 * @property {(deltaSeconds: number, alpha: number) => void} [update] Once per drawn frame, after
 *   the fixed steps: interpolate with alpha, animate, stream.
 * @property {(deltaSeconds: number, alpha: number) => void} [lateUpdate] Once per frame after
 *   every update(): cameras and anything that follows what others moved.
 * @property {() => void} [dispose] Frees everything the system made; called in reverse init order.
 */

/**
 * @typedef {(context: import('./gameContext.js').GameContext) => GameSystem} GameSystemFactory
 */

/**
 * Checks an object against the contract.
 * @param {unknown} system What a factory returned.
 * @returns {string[]} The problems in plain words; empty when the object is a valid system.
 */
export function describeSystemProblems(system) {
  const problems = [];
  if (system === null || typeof system !== 'object') {
    return ['the factory did not return an object'];
  }
  const candidate = /** @type {Record<string, unknown>} */ (system);
  if (typeof candidate.name !== 'string' || candidate.name.length === 0) {
    problems.push('it has no name');
  } else if (!/^[a-z][A-Za-z0-9]*$/.test(candidate.name)) {
    problems.push(`its name "${candidate.name}" is not camelCase`);
  }
  if (candidate.dependsOn !== undefined) {
    const list = candidate.dependsOn;
    if (!Array.isArray(list) || list.some((entry) => typeof entry !== 'string')) {
      problems.push('dependsOn is not an array of system names');
    } else if (list.includes(candidate.name)) {
      problems.push('it depends on itself');
    }
  }
  if (candidate.runsWhen !== undefined && !SYSTEM_RUN_MODES.includes(/** @type {any} */ (candidate.runsWhen))) {
    problems.push(`runsWhen is "${String(candidate.runsWhen)}", not one of ${SYSTEM_RUN_MODES.join(', ')}`);
  }
  for (const method of SYSTEM_LIFECYCLE_METHODS) {
    if (candidate[method] !== undefined && typeof candidate[method] !== 'function') {
      problems.push(`${method} is not a function`);
    }
  }
  return problems;
}

/** The lifecycle methods the registry calls, in the order of a system's life. */
export const SYSTEM_LIFECYCLE_METHODS = Object.freeze([
  'init', 'start', 'fixedUpdate', 'update', 'lateUpdate', 'dispose',
]);

/** The values `runsWhen` may take. */
export const SYSTEM_RUN_MODES = Object.freeze(['simulating', 'always']);
