// What a game state change does to the page and the controls: the input context the state
// forces, whether the mouse is captured for looking around, and the attributes on <body> that
// the stylesheet uses to show the loading screen, the menus, the HUD, the map, the phone and the
// cutscene letterbox. The table itself is core/state/gameStates.js.
//
//   <body data-game-state="playing" data-hud="shown">

/**
 * Applies the current state and every later one.
 * @param {Object} options
 * @param {ReturnType<import('./gameStateMachine.js').createGameStateMachine>} options.state
 * @param {{forceContext: (context: string | null) => void,
 *   device: {setPointerCapture: (wanted: boolean, lockNow?: boolean) => void} | null}} options.controls
 * @param {{dataset: Record<string, string>} | null} [options.body] The page's body element.
 * @returns {() => void} Applies the current state again (after the body changed).
 */
export function applyGameStateEffects(options) {
  const { state, controls } = options;
  const body = options.body ?? null;
  const apply = () => {
    const definition = state.definition;
    controls.forceContext(definition.inputContext);
    if (controls.device) controls.device.setPointerCapture(definition.capturesPointer);
    if (body) {
      body.dataset.gameState = state.current;
      body.dataset.hud = definition.showsHud ? 'shown' : 'hidden';
    }
  };
  state.onChange(apply);
  apply();
  return apply;
}
