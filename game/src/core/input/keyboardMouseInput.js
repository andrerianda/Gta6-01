// Keyboard and mouse for the browser: listens to the page's key, button, wheel and movement
// events, feeds them to the action map, and manages pointer lock so that the mouse looks around
// while playing and is free in menus.
//
//   const device = attachKeyboardMouseInput({ target: window, canvas, actions });
//   device.setPointerCapture(true);       // playing: the next click on the viewport locks the mouse
//   device.dispose();

/**
 * Attaches the listeners.
 * @param {Object} options
 * @param {Window} options.target The window that receives key events.
 * @param {HTMLCanvasElement} options.canvas The viewport; mouse buttons and pointer lock belong to it.
 * @param {ReturnType<import('./inputActionMap.js').createInputActionMap>} options.actions The action map to feed.
 * @param {(locked: boolean) => void} [options.onPointerLockChanged] Called when the lock is taken
 *   or lost (losing it while playing usually opens the pause menu).
 * @returns {ReturnType<typeof buildKeyboardMouseInput>}
 */
export function attachKeyboardMouseInput(options) {
  return buildKeyboardMouseInput(options);
}

/** Keys the browser would act on (scrolling, focus moves, quick find) while the game uses them. */
const BROWSER_KEYS_TO_SUPPRESS = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Quote', 'Slash',
  'Backspace', 'F1', 'F3',
  // Alt alone would move the focus to the browser's menu when released (walk is on Left Alt).
  'AltLeft', 'AltRight',
]);

function buildKeyboardMouseInput(options) {
  const { target, canvas, actions } = options;
  const documentRef = canvas.ownerDocument;
  let wantsCapture = false;
  let disposed = false;

  const device = {
    /** True while the mouse is locked to the viewport. */
    pointerLocked: false,
    setPointerCapture,
    releasePointer,
    dispose,
  };

  function isTyping(event) {
    const element = event.target;
    return element instanceof HTMLElement &&
      (element.isContentEditable || element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' ||
        element.tagName === 'SELECT');
  }

  function onKeyDown(event) {
    if (isTyping(event)) return;
    // The browser's own shortcuts (reload, developer tools, zoom) are never suppressed.
    const browserShortcut = event.ctrlKey || event.metaKey;
    const suppress = !browserShortcut && BROWSER_KEYS_TO_SUPPRESS.has(event.code);
    if (event.repeat) {
      if (suppress) event.preventDefault();
      return;
    }
    const bound = actions.codeDown(event.code);
    if (bound && suppress) event.preventDefault();
  }

  function onKeyUp(event) {
    if (event.code === 'AltLeft' || event.code === 'AltRight') event.preventDefault();
    actions.codeUp(event.code);
  }

  function onMouseDown(event) {
    if (wantsCapture && !device.pointerLocked) requestLock();
    actions.codeDown(`Mouse${event.button}`);
  }

  function onMouseUp(event) {
    actions.codeUp(`Mouse${event.button}`);
  }

  function onMouseMove(event) {
    if (device.pointerLocked) actions.pointerMoved(event.movementX, event.movementY);
  }

  function onWheel(event) {
    if (event.target !== canvas && !device.pointerLocked) return;
    event.preventDefault();
    actions.wheelTurned(event.deltaY < 0 ? 1 : event.deltaY > 0 ? -1 : 0);
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  function onBlur() {
    actions.releaseAll();
  }

  function onPointerLockChange() {
    const locked = documentRef.pointerLockElement === canvas;
    if (locked === device.pointerLocked) return;
    device.pointerLocked = locked;
    if (!locked) actions.releaseAll();
    if (options.onPointerLockChanged) options.onPointerLockChanged(locked);
  }

  function requestLock() {
    if (typeof canvas.requestPointerLock !== 'function') return;
    try {
      const request = canvas.requestPointerLock();
      // Chrome returns a promise that rejects when the player pressed Esc a moment ago.
      if (request && typeof request.catch === 'function') request.catch(() => {});
    } catch {
      // The browser refused; the next click asks again.
    }
  }

  /**
   * Says whether the game wants the mouse. While it does, a click on the viewport locks it;
   * when it no longer does, the lock is released at once.
   * @param {boolean} wanted True in states that look around with the mouse.
   * @param {boolean} [lockNow] Ask for the lock immediately (only works inside a click or key
   *   handler, as browsers require a user gesture).
   */
  function setPointerCapture(wanted, lockNow = false) {
    wantsCapture = wanted;
    if (!wanted) releasePointer();
    else if (lockNow && !device.pointerLocked) requestLock();
  }

  /** Gives the mouse back to the page. */
  function releasePointer() {
    if (documentRef.pointerLockElement === canvas && typeof documentRef.exitPointerLock === 'function') {
      documentRef.exitPointerLock();
    }
  }

  /** Removes every listener. */
  function dispose() {
    if (disposed) return;
    disposed = true;
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('blur', onBlur);
    target.removeEventListener('mouseup', onMouseUp);
    target.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', onContextMenu);
    documentRef.removeEventListener('pointerlockchange', onPointerLockChange);
    releasePointer();
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);
  target.addEventListener('mouseup', onMouseUp);
  target.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);
  documentRef.addEventListener('pointerlockchange', onPointerLockChange);

  return device;
}
