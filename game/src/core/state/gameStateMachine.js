// The game state machine: which of the states of gameStates.js the game is in, the transitions
// between them, and what the current state means (does the world simulate, at what time scale,
// which input context). Every transition is announced through the callback the engine wires to
// the GAME_STATE_CHANGED event.
//
//   state.enter(GAME_STATE.PAUSED);          // from playing
//   state.back();                            // an overlay closes: back to what was underneath
//   if (state.is(GAME_STATE.PLAYING, GAME_STATE.PHONE_OPEN)) { ... }
import { GAME_STATE, GAME_STATE_DEFINITIONS } from './gameStates.js';

/**
 * @typedef {Object} GameStateChange
 * @property {string} from The state that was left.
 * @property {string} to The state that was entered.
 * @property {any} payload Whatever the caller passed to enter(), for the listeners.
 */

/**
 * Creates the state machine in the 'booting' state.
 * @param {Object} [options]
 * @param {(change: GameStateChange) => void} [options.onChanged] Called after every transition.
 * @param {(message: string) => void} [options.onRefused] Called when a transition is not allowed.
 * @param {Readonly<Record<string, import('./gameStates.js').GameStateDefinition>>} [options.definitions]
 *   The state table; default GAME_STATE_DEFINITIONS.
 * @returns {ReturnType<typeof buildGameStateMachine>}
 */
export function createGameStateMachine(options = {}) {
  return buildGameStateMachine(options);
}

function buildGameStateMachine(options) {
  const definitions = options.definitions ?? GAME_STATE_DEFINITIONS;
  /** The states underneath the open overlays, innermost last. @type {string[]} */
  const underneath = [];
  /** @type {Set<(change: GameStateChange) => void>} */
  const listeners = new Set();

  const machine = {
    /** The name of the current state. */
    current: GAME_STATE.BOOTING,
    /** The name of the state before the last transition. */
    previous: GAME_STATE.BOOTING,
    /** The table row of the current state. */
    definition: definitions[GAME_STATE.BOOTING],
    /** Real seconds spent in the current state. */
    secondsInState: 0,
    /** How many transitions have happened. */
    transitionCount: 0,
    is,
    canEnter,
    enter,
    back,
    tick,
    onChange,
    /** Whether the world simulates in the current state. */
    get simulates() {
      return machine.definition.simulates;
    },
    /** The time scale of the current state. */
    get timeScale() {
      return machine.definition.timeScale;
    },
  };

  /**
   * Tells whether the current state is one of the given names.
   * @param {...string} names State names.
   * @returns {boolean}
   */
  function is(...names) {
    return names.includes(machine.current);
  }

  /**
   * Tells whether a transition from the current state is allowed.
   * @param {string} name The state to enter.
   * @returns {boolean}
   */
  function canEnter(name) {
    return name !== machine.current && definitions[name] !== undefined && machine.definition.next.includes(name);
  }

  /**
   * Makes a transition.
   * @param {string} name The state to enter.
   * @param {any} [payload] Passed on to the listeners (which mission passed, what killed the
   *   player, and so on).
   * @returns {boolean} False when the table does not allow the transition; nothing changes then.
   */
  function enter(name, payload) {
    if (name === machine.current) return true;
    if (!canEnter(name)) {
      if (options.onRefused) {
        const reason = definitions[name] === undefined ? 'there is no such state' : 'the state table does not allow it';
        options.onRefused(`cannot go from "${machine.current}" to "${name}": ${reason}`);
      }
      return false;
    }
    const target = definitions[name];
    if (target.overlay) {
      underneath.push(machine.current);
    } else {
      // Entering a base state closes every overlay; entering the state under the top overlay
      // is the same as back().
      underneath.length = 0;
    }
    change(name, payload);
    return true;
  }

  /**
   * Closes the current overlay state and returns to the state underneath it.
   * @param {any} [payload] Passed on to the listeners.
   * @returns {boolean} False when the current state is not an overlay.
   */
  function back(payload) {
    if (!machine.definition.overlay || underneath.length === 0) return false;
    change(underneath.pop(), payload);
    return true;
  }

  /**
   * Counts the time spent in the current state.
   * @param {number} realDelta Real seconds since the last call.
   */
  function tick(realDelta) {
    machine.secondsInState += realDelta;
  }

  /**
   * Subscribes to transitions directly (the event bus carries them too).
   * @param {(change: GameStateChange) => void} listener Called after every transition.
   * @returns {() => void} Call it to unsubscribe.
   */
  function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function change(name, payload) {
    const transition = { from: machine.current, to: name, payload };
    machine.previous = machine.current;
    machine.current = name;
    machine.definition = definitions[name];
    machine.secondsInState = 0;
    machine.transitionCount += 1;
    for (const listener of [...listeners]) listener(transition);
    if (options.onChanged) options.onChanged(transition);
  }

  return machine;
}
