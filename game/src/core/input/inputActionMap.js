// The action map: turns raw key and mouse-button codes into the game's named actions. Systems
// never ask "is KeyW down"; they ask "is moveForward held" in the current input context, so the
// same key can accelerate a car and walk a character, and the player can rebind either.
//
//   input.setContext('inVehicle');
//   if (input.pressed('exitVehicle')) ...        // true for one frame (or one fixed step)
//   const steer = input.axis('steer');           // -1..1 from two actions
//   const throttle = input.held('accelerate');
//   hud.prompt(`Press ${input.labelFor('enterVehicle', 'onFoot')} to enter`);
//
// This module is pure: keyboardMouseInput.js feeds it from the browser, tests and automation
// feed it directly.
import { describeInputCode } from './inputCodeLabels.js';

/**
 * @typedef {Record<string, Record<string, string[]>>} InputBindings
 *   context name -> action name -> the codes that trigger it (KeyboardEvent.code values, and
 *   'Mouse0' left, 'Mouse1' middle, 'Mouse2' right, 'WheelUp', 'WheelDown'). The context named
 *   'always' is live in every context (pause, the performance overlay).
 */

/**
 * @typedef {Record<string, {negative: string, positive: string}>} InputAxes
 *   axis name -> the two actions that pull it to -1 and +1.
 */

/** The context whose actions are live whatever the current context is. */
export const ALWAYS_CONTEXT = 'always';

/**
 * Creates an action map.
 * @param {Object} options
 * @param {InputBindings} options.bindings The bindings of every context.
 * @param {InputAxes} [options.axes] Axis definitions shared by all contexts.
 * @param {string} [options.context] The starting context; default the first one in bindings.
 * @param {(change: {context: string, previous: string}) => void} [options.onContextChanged]
 * @returns {ReturnType<typeof buildInputActionMap>}
 */
export function createInputActionMap(options) {
  return buildInputActionMap(options);
}

function buildInputActionMap(options) {
  /** @type {InputBindings} A private, mutable copy. */
  const bindings = {};
  for (const [context, actions] of Object.entries(options.bindings)) {
    bindings[context] = {};
    for (const [action, codes] of Object.entries(actions)) bindings[context][action] = [...codes];
  }
  const axes = options.axes ?? {};
  /** @type {Map<string, Map<string, string[]>>} context -> code -> actions */
  const lookups = new Map();
  /** @type {Set<string>} Codes physically down. */
  const downCodes = new Set();
  /** @type {Set<string>} Actions held by automation. */
  const virtualActions = new Set();
  /** @type {Map<string, {held: boolean, framePressed: boolean, frameReleased: boolean, stepPressed: boolean, stepReleased: boolean}>} */
  const actions = new Map();
  let inFixedStep = false;

  const firstContext = Object.keys(bindings).find((name) => name !== ALWAYS_CONTEXT);
  const map = {
    /** The current context. */
    context: options.context ?? firstContext ?? ALWAYS_CONTEXT,
    /** Mouse movement since the last frame, in pixels (x right, y down). */
    lookX: 0,
    lookY: 0,
    /** Wheel notches since the last frame (positive is away from the player). */
    wheel: 0,
    setContext,
    contexts: () => Object.keys(bindings).filter((name) => name !== ALWAYS_CONTEXT),
    actionsIn: (context) => Object.keys(bindings[context] ?? {}),
    codeDown,
    codeUp,
    wheelTurned,
    pointerMoved,
    releaseAll,
    setVirtual,
    pressed,
    released,
    held,
    axis,
    beginFixedStep,
    endFixedStep,
    endFrame,
    codesFor,
    labelFor,
    rebind,
    conflictsOf,
    exportBindings,
  };
  rebuildLookups();

  /**
   * Switches the context. Keys that are down keep holding whatever they mean in the new context,
   * but do not count as freshly pressed there: the key that entered the car does not also leave it.
   * @param {string} context A context of the bindings.
   */
  function setContext(context) {
    if (context === map.context) return;
    if (!bindings[context]) throw new Error(`unknown input context "${context}"`);
    const previous = map.context;
    map.context = context;
    refreshHeld(false);
    if (options.onContextChanged) options.onContextChanged({ context, previous });
  }

  /**
   * A key or mouse button went down.
   * @param {string} code Its code ('KeyW', 'Mouse0', ...).
   * @returns {boolean} True when the code is bound to an action in the current context.
   */
  function codeDown(code) {
    if (downCodes.has(code)) return isBound(code);
    downCodes.add(code);
    let bound = false;
    forEachActionOf(code, (action) => {
      bound = true;
      setHeld(action, true, true);
    });
    return bound;
  }

  /**
   * A key or mouse button came up.
   * @param {string} code Its code.
   * @returns {boolean} True when the code is bound to an action in the current context.
   */
  function codeUp(code) {
    if (!downCodes.delete(code)) return isBound(code);
    refreshHeld(true);
    return isBound(code);
  }

  /**
   * The wheel turned: counts the notches and taps the 'WheelUp' or 'WheelDown' code.
   * @param {number} notches Positive away from the player.
   */
  function wheelTurned(notches) {
    if (notches === 0) return;
    map.wheel += notches;
    forEachActionOf(notches > 0 ? 'WheelUp' : 'WheelDown', (action) => {
      const state = stateOf(action);
      state.framePressed = true;
      state.stepPressed = true;
      if (!state.held) {
        state.frameReleased = true;
        state.stepReleased = true;
      }
    });
  }

  /**
   * The mouse moved while looking.
   * @param {number} deltaX Pixels to the right.
   * @param {number} deltaY Pixels down.
   */
  function pointerMoved(deltaX, deltaY) {
    map.lookX += deltaX;
    map.lookY += deltaY;
  }

  /** Lets go of every key and button (the window lost focus). */
  function releaseAll() {
    downCodes.clear();
    refreshHeld(true);
  }

  /**
   * Holds or releases an action as if a key did, for showcase scenes and tests.
   * @param {string} action The action name.
   * @param {boolean} down True to hold it.
   */
  function setVirtual(action, down) {
    if (down) {
      if (virtualActions.has(action)) return;
      virtualActions.add(action);
      setHeld(action, true, true);
    } else if (virtualActions.delete(action)) {
      refreshHeld(true);
    }
  }

  /** True in the frame (or the fixed step) in which the action went down. */
  function pressed(action) {
    const state = actions.get(action);
    if (!state) return false;
    return inFixedStep ? state.stepPressed : state.framePressed;
  }

  /** True in the frame (or the fixed step) in which the action came up. */
  function released(action) {
    const state = actions.get(action);
    if (!state) return false;
    return inFixedStep ? state.stepReleased : state.frameReleased;
  }

  /** True while the action is down. */
  function held(action) {
    const state = actions.get(action);
    return state ? state.held : false;
  }

  /**
   * The value of an axis.
   * @param {string} name An axis of the definitions.
   * @returns {number} -1, 0 or 1.
   */
  function axis(name) {
    const definition = axes[name];
    if (!definition) return 0;
    return (held(definition.positive) ? 1 : 0) - (held(definition.negative) ? 1 : 0);
  }

  /** The engine calls this before the fixed updates of one step. */
  function beginFixedStep() {
    inFixedStep = true;
  }

  /** The engine calls this after the fixed updates of one step: the step's edges are spent. */
  function endFixedStep() {
    inFixedStep = false;
    for (const state of actions.values()) {
      state.stepPressed = false;
      state.stepReleased = false;
    }
  }

  /** The engine calls this at the end of a frame: the frame's edges and mouse deltas are spent. */
  function endFrame() {
    for (const state of actions.values()) {
      state.framePressed = false;
      state.frameReleased = false;
    }
    map.lookX = 0;
    map.lookY = 0;
    map.wheel = 0;
  }

  /**
   * The codes bound to an action.
   * @param {string} action The action name.
   * @param {string} [context] The context to look in; default the current one, then 'always'.
   * @returns {string[]}
   */
  function codesFor(action, context = map.context) {
    return bindings[context]?.[action] ?? bindings[ALWAYS_CONTEXT]?.[action] ?? [];
  }

  /**
   * The text to show for an action in an on-screen prompt: 'E', 'Left Mouse', 'Space'.
   * @param {string} action The action name.
   * @param {string} [context] The context to look in; default the current one.
   * @returns {string} The label of the first bound code, or '' when the action is unbound.
   */
  function labelFor(action, context = map.context) {
    const codes = codesFor(action, context);
    return codes.length > 0 ? describeInputCode(codes[0]) : '';
  }

  /**
   * Rebinds an action.
   * @param {string} context The context of the action.
   * @param {string} action The action name.
   * @param {string[]} codes The codes that trigger it from now on.
   */
  function rebind(context, action, codes) {
    if (!bindings[context]) throw new Error(`unknown input context "${context}"`);
    bindings[context][action] = [...codes];
    rebuildLookups();
    refreshHeld(false);
  }

  /**
   * The other actions of a context that already use a code, for the rebinding menu.
   * @param {string} context The context.
   * @param {string} code The code about to be bound.
   * @param {string} [exceptAction] The action being rebound.
   * @returns {string[]}
   */
  function conflictsOf(context, code, exceptAction) {
    const conflicts = [];
    for (const scope of [context, ALWAYS_CONTEXT]) {
      for (const [action, codes] of Object.entries(bindings[scope] ?? {})) {
        if (action !== exceptAction && codes.includes(code)) conflicts.push(action);
      }
    }
    return conflicts;
  }

  /** A deep copy of the current bindings, for the settings store. */
  function exportBindings() {
    const copy = {};
    for (const [context, contextActions] of Object.entries(bindings)) {
      copy[context] = {};
      for (const [action, codes] of Object.entries(contextActions)) copy[context][action] = [...codes];
    }
    return copy;
  }

  function rebuildLookups() {
    lookups.clear();
    for (const [context, contextActions] of Object.entries(bindings)) {
      const lookup = new Map();
      for (const [action, codes] of Object.entries(contextActions)) {
        stateOf(action);
        for (const code of codes) {
          const list = lookup.get(code);
          if (list) list.push(action);
          else lookup.set(code, [action]);
        }
      }
      lookups.set(context, lookup);
    }
  }

  function forEachActionOf(code, visit) {
    const current = lookups.get(map.context)?.get(code);
    if (current) for (let i = 0; i < current.length; i += 1) visit(current[i]);
    if (map.context === ALWAYS_CONTEXT) return;
    const always = lookups.get(ALWAYS_CONTEXT)?.get(code);
    if (always) for (let i = 0; i < always.length; i += 1) visit(always[i]);
  }

  function isBound(code) {
    return Boolean(lookups.get(map.context)?.has(code) || lookups.get(ALWAYS_CONTEXT)?.has(code));
  }

  /** Recomputes which actions are held from the codes that are down, in the current context. */
  function refreshHeld(withEdges) {
    const nowHeld = new Set(virtualActions);
    for (const code of downCodes) forEachActionOf(code, (action) => nowHeld.add(action));
    for (const [action, state] of actions) {
      const down = nowHeld.has(action);
      if (down !== state.held) setHeld(action, down, withEdges);
    }
  }

  function setHeld(action, down, withEdges) {
    const state = stateOf(action);
    if (state.held === down) return;
    state.held = down;
    if (!withEdges) return;
    if (down) {
      state.framePressed = true;
      state.stepPressed = true;
    } else {
      state.frameReleased = true;
      state.stepReleased = true;
    }
  }

  function stateOf(action) {
    let state = actions.get(action);
    if (!state) {
      state = { held: false, framePressed: false, frameReleased: false, stepPressed: false, stepReleased: false };
      actions.set(action, state);
    }
    return state;
  }

  return map;
}
