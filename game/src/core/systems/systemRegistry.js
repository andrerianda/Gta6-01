// The system registry: creates every game system from its factory, initialises them in dependency
// order with progress for the loading screen, then runs their fixed, frame and late updates in
// manifest order and disposes them in reverse. A fault in one system is reported with its name
// and that system is suspended; the others keep running.
//
//   const systems = createSystemRegistry({ reportFault, isSimulating: () => state.simulates });
//   systems.createAll(GAME_SYSTEM_FACTORIES, context);
//   await systems.initialiseAll(({ fraction, system, label }) => loadingBar.set(fraction, label));
//   systems.fixedUpdate(1 / 60);  systems.update(realDelta, delta, alpha);  systems.lateUpdate(...);
import { describeSystemProblems } from './gameSystemContract.js';
import { resolveSystemInitOrder } from './systemInitOrder.js';

/**
 * @typedef {Object} SystemFault
 * @property {string} system The name of the system (or of its factory when it never got a name).
 * @property {string} phase 'create', 'contract', 'order', 'init', 'start', 'fixedUpdate',
 *   'update', 'lateUpdate' or 'dispose'.
 * @property {Error} error What went wrong.
 */

/**
 * @typedef {Object} SystemRecord The registry's bookkeeping for one system.
 * @property {string} name
 * @property {import('./gameSystemContract.js').GameSystem} system
 * @property {'created' | 'ready' | 'failed' | 'disposed'} status
 * @property {boolean} always True when the system runs in every game state.
 * @property {number} cpuMilliseconds Smoothed CPU time per frame spent in this system.
 * @property {number} frameMilliseconds CPU time accumulated in the frame in progress.
 * @property {number} totalMilliseconds CPU time of every finished frame since the start (the
 *   profiler takes differences of it).
 * @property {Error | null} error The fault that suspended it.
 */

/**
 * Creates the registry.
 * @param {Object} options
 * @param {(fault: SystemFault) => void} options.reportFault Receives every fault (the error
 *   overlay and the log).
 * @param {() => boolean} [options.isSimulating] Whether the current game state simulates the
 *   world; systems with runsWhen 'simulating' tick only then. Default: always.
 * @param {() => number} [options.now] A millisecond clock for the CPU timings.
 * @returns {ReturnType<typeof buildSystemRegistry>}
 */
export function createSystemRegistry(options) {
  return buildSystemRegistry(options);
}

function buildSystemRegistry(options) {
  const reportFault = options.reportFault;
  const isSimulating = options.isSimulating ?? (() => true);
  const now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : 0));

  /** @type {SystemRecord[]} In update (manifest) order. */
  const records = [];
  /** @type {SystemRecord[]} In init order. */
  let initOrder = [];
  /** @type {Map<string, SystemRecord>} */
  const byName = new Map();

  const registry = {
    createAll,
    initialiseAll,
    fixedUpdate,
    update,
    lateUpdate,
    endFrame,
    disposeAll,
    get,
    find,
    has: (name) => byName.has(name),
    names: () => records.map((record) => record.name),
    initOrderNames: () => initOrder.map((record) => record.name),
    status,
  };

  /**
   * Calls every factory with the context, in manifest order, and checks what it returns.
   * @param {import('./gameSystemContract.js').GameSystemFactory[]} factories The manifest.
   * @param {object} context The game context handed to each factory.
   */
  function createAll(factories, context) {
    for (const factory of factories) {
      const label = factory.name || 'anonymous factory';
      let system;
      try {
        system = factory(context);
      } catch (error) {
        reportFault({ system: label, phase: 'create', error: asError(error) });
        continue;
      }
      const problems = describeSystemProblems(system);
      if (problems.length === 0 && byName.has(system.name)) {
        problems.push(`another system is already named "${system.name}"`);
      }
      if (problems.length > 0) {
        const name = system && typeof system.name === 'string' && system.name ? system.name : label;
        reportFault({ system: name, phase: 'contract', error: new Error(problems.join('; ')) });
        continue;
      }
      const record = {
        name: system.name,
        system,
        status: /** @type {SystemRecord['status']} */ ('created'),
        always: system.runsWhen === 'always',
        cpuMilliseconds: 0,
        frameMilliseconds: 0,
        totalMilliseconds: 0,
        error: null,
      };
      records.push(record);
      byName.set(record.name, record);
    }
    const resolved = resolveSystemInitOrder(records.map((record) => record.system));
    initOrder = resolved.order.map((system) => byName.get(system.name));
    for (const problem of resolved.problems) {
      reportFault({ system: 'systemRegistry', phase: 'order', error: new Error(problem) });
    }
  }

  /**
   * Runs every system's init() in dependency order, one after another, then every start() in
   * update order.
   * @param {(progress: {fraction: number, system: string, label: string}) => void} [onProgress]
   *   Called as the loading advances; fraction runs from 0 to 1 over all systems by loadWeight.
   * @returns {Promise<void>}
   */
  async function initialiseAll(onProgress) {
    let totalWeight = 0;
    for (const record of initOrder) totalWeight += weightOf(record);
    let doneWeight = 0;
    const report = (record, fraction, label) => {
      if (!onProgress) return;
      const share = Math.min(1, Math.max(0, fraction)) * weightOf(record);
      onProgress({
        fraction: totalWeight > 0 ? Math.min(1, (doneWeight + share) / totalWeight) : 1,
        system: record.name,
        label: label ?? record.name,
      });
    };
    for (const record of initOrder) {
      if (record.status !== 'created') continue;
      report(record, 0);
      try {
        if (record.system.init) {
          await record.system.init((fraction, label) => report(record, fraction, label));
        }
        record.status = 'ready';
      } catch (error) {
        fail(record, 'init', error);
      }
      doneWeight += weightOf(record);
      report(record, 0);
    }
    for (const record of records) {
      if (record.status !== 'ready' || !record.system.start) continue;
      try {
        record.system.start();
      } catch (error) {
        fail(record, 'start', error);
      }
    }
  }

  /**
   * Runs the 60 Hz step of every running system.
   * @param {number} stepSeconds The fixed step.
   */
  function fixedUpdate(stepSeconds) {
    const simulating = isSimulating();
    for (let i = 0; i < records.length; i += 1) {
      const record = records[i];
      if (record.status !== 'ready' || !record.system.fixedUpdate) continue;
      if (!record.always && !simulating) continue;
      const started = now();
      try {
        record.system.fixedUpdate(stepSeconds);
      } catch (error) {
        fail(record, 'fixedUpdate', error);
      }
      record.frameMilliseconds += now() - started;
    }
  }

  /**
   * Runs the per-frame update of every running system.
   * @param {number} realDelta Real seconds of the frame, for systems that run always.
   * @param {number} delta Simulated seconds of the frame, for systems that run when simulating.
   * @param {number} alpha Interpolation factor between the last two fixed steps.
   */
  function update(realDelta, delta, alpha) {
    runFramePhase('update', realDelta, delta, alpha);
  }

  /** Runs the late update of every running system; same arguments as update(). */
  function lateUpdate(realDelta, delta, alpha) {
    runFramePhase('lateUpdate', realDelta, delta, alpha);
  }

  function runFramePhase(phase, realDelta, delta, alpha) {
    const simulating = isSimulating();
    for (let i = 0; i < records.length; i += 1) {
      const record = records[i];
      const method = record.system[phase];
      if (record.status !== 'ready' || !method) continue;
      if (!record.always && !simulating) continue;
      const started = now();
      try {
        method.call(record.system, record.always ? realDelta : delta, alpha);
      } catch (error) {
        fail(record, phase, error);
      }
      record.frameMilliseconds += now() - started;
    }
  }

  /** Folds the frame's CPU times into the smoothed per-system figures. Call once per frame. */
  function endFrame() {
    for (let i = 0; i < records.length; i += 1) {
      const record = records[i];
      record.cpuMilliseconds += (record.frameMilliseconds - record.cpuMilliseconds) * 0.1;
      record.totalMilliseconds += record.frameMilliseconds;
      record.frameMilliseconds = 0;
    }
  }

  /** Disposes every system, dependants before what they depend on. */
  function disposeAll() {
    for (let i = initOrder.length - 1; i >= 0; i -= 1) {
      const record = initOrder[i];
      if (record.status === 'disposed') continue;
      try {
        if (record.system.dispose) record.system.dispose();
      } catch (error) {
        reportFault({ system: record.name, phase: 'dispose', error: asError(error) });
      }
      record.status = 'disposed';
    }
  }

  /**
   * A system by name.
   * @param {string} name The system's name.
   * @returns {import('./gameSystemContract.js').GameSystem} The object its factory returned.
   */
  function get(name) {
    const record = byName.get(name);
    if (!record) {
      throw new Error(`no system named "${name}"; the manifest has: ${registry.names().join(', ')}`);
    }
    return record.system;
  }

  /**
   * A system by name, or null when the manifest has none of that name.
   * @param {string} name The system's name.
   * @returns {import('./gameSystemContract.js').GameSystem | null}
   */
  function find(name) {
    const record = byName.get(name);
    return record ? record.system : null;
  }

  /**
   * The state of every system, in update order, for the performance overlay and the debug object.
   * @returns {{name: string, status: string, runsWhen: string, cpuMilliseconds: number,
   *   totalMilliseconds: number, error: string | null}[]}
   */
  function status() {
    return records.map((record) => ({
      name: record.name,
      status: record.status,
      runsWhen: record.always ? 'always' : 'simulating',
      cpuMilliseconds: Math.round(record.cpuMilliseconds * 1000) / 1000,
      totalMilliseconds: record.totalMilliseconds,
      error: record.error ? record.error.message : null,
    }));
  }

  function fail(record, phase, error) {
    record.status = 'failed';
    record.error = asError(error);
    reportFault({ system: record.name, phase, error: record.error });
  }

  return registry;
}

function weightOf(record) {
  const weight = record.system.loadWeight;
  return typeof weight === 'number' && weight > 0 ? weight : 1;
}

function asError(value) {
  return value instanceof Error ? value : new Error(String(value));
}
