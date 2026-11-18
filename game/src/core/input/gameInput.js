// The game's input, assembled: the action map with the resolved control bindings, the keyboard
// and mouse device with pointer lock, the choice of the live input context (forced by the game
// state, or the player's own: on foot or in a vehicle) and rebinding that persists in settings.
//
//   const controls = createGameInput({ target: window, canvas, settings, playerControls });
//   controls.setPlayContext('inVehicle');            // the player system, on entering a car
//   controls.rebind('onFoot', 'jump', ['KeyJ']);     // the controls menu
//   controls.promptFor('enterVehicle')               // 'F' for an on-screen prompt
import { resolveControlBindings } from './controlBindings.js';
import { createInputActionMap } from './inputActionMap.js';
import { attachKeyboardMouseInput } from './keyboardMouseInput.js';

/**
 * Creates the game's input.
 * @param {Object} options
 * @param {Window | null} [options.target] The window that receives key events; without it (or
 *   without a canvas) no device is attached and the action map is fed by hand (tests).
 * @param {HTMLCanvasElement | null} [options.canvas] The viewport.
 * @param {{get: (key: string) => any, set: (key: string, value: any) => any} | null} [options.settings]
 *   The settings store: 'controls.bindings' holds the player's rebindings.
 * @param {object | null} [options.playerControls] The playerControls catalog, when it exists.
 * @param {(change: {context: string, previous: string}) => void} [options.onContextChanged]
 * @param {(change: {context: string, action: string, codes: string[]}) => void} [options.onBindingChanged]
 * @param {(locked: boolean) => void} [options.onPointerLockChanged]
 * @returns {ReturnType<typeof buildGameInput>}
 */
export function createGameInput(options) {
  return buildGameInput(options);
}

function buildGameInput(options) {
  const settings = options.settings ?? null;
  const resolved = resolveControlBindings({
    catalog: options.playerControls ?? null,
    overrides: settings ? settings.get('controls.bindings') : null,
  });
  const actions = createInputActionMap({
    bindings: resolved.bindings,
    axes: resolved.axes,
    context: 'menu',
    onContextChanged: options.onContextChanged,
  });
  const device = options.target && options.canvas
    ? attachKeyboardMouseInput({
      target: options.target,
      canvas: options.canvas,
      actions,
      onPointerLockChanged: options.onPointerLockChanged,
    })
    : null;

  const controls = {
    /** The action map (also `context.input`). */
    actions,
    /** The keyboard and mouse device, or null when none is attached. */
    device,
    /** Action name -> the name shown in menus and prompts. */
    labels: resolved.labels,
    /** The player's own context while no game state forces one: 'onFoot' or 'inVehicle'. */
    playContext: 'onFoot',
    /** The context the game state forces ('menu', 'map', ...), or null in play. */
    forcedContext: /** @type {string | null} */ ('menu'),
    setPlayContext,
    forceContext,
    rebind,
    promptFor,
    dispose,
  };

  /**
   * Sets the player's own context; live at once unless the game state forces another.
   * @param {'onFoot' | 'inVehicle'} context
   */
  function setPlayContext(context) {
    controls.playContext = context;
    if (controls.forcedContext === null) actions.setContext(context);
  }

  /**
   * Forces a context (the engine calls this on every game state change).
   * @param {string | null} context A context name, or null to return to the player's own.
   */
  function forceContext(context) {
    controls.forcedContext = context ?? null;
    actions.setContext(controls.forcedContext ?? controls.playContext);
  }

  /**
   * Rebinds an action and stores the choice in the settings.
   * @param {string} context The context of the binding.
   * @param {string} action The action name.
   * @param {string[]} codes The codes that trigger it from now on.
   */
  function rebind(context, action, codes) {
    actions.rebind(context, action, codes);
    if (settings) {
      const stored = JSON.parse(JSON.stringify(settings.get('controls.bindings') ?? {}));
      stored[context] = stored[context] ?? {};
      stored[context][action] = [...codes];
      settings.set('controls.bindings', stored);
    }
    if (options.onBindingChanged) options.onBindingChanged({ context, action, codes: [...codes] });
  }

  /**
   * The key label of an action for an on-screen prompt.
   * @param {string} action The action name.
   * @param {string} [context] The context to look in; default the live one.
   * @returns {string} For example 'F', 'Left mouse' or 'W'.
   */
  function promptFor(action, context) {
    return actions.labelFor(action, context ?? actions.context);
  }

  /** Detaches the device. */
  function dispose() {
    if (device) device.dispose();
  }

  return controls;
}
