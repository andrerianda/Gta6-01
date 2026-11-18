// WebGL context loss: when the browser takes the graphics context away (a driver reset, too many
// tabs), the game stops drawing instead of throwing, tells the player, and carries on when the
// context comes back. three.js re-uploads geometry and textures by itself after a restoration.

/**
 * Watches the viewport canvas for a lost and restored context.
 * @param {Object} options
 * @param {HTMLCanvasElement} options.canvas The viewport canvas.
 * @param {{contextLost: boolean, resize: (force?: boolean) => boolean}} options.view The renderer
 *   bootstrap: its contextLost flag is kept, and it is refitted after a restoration.
 * @param {() => void} [options.onLost] Called when the context is lost (pause, show a notice).
 * @param {() => void} [options.onRestored] Called when it is back (settle the image, resume).
 * @returns {() => void} Call it to stop watching.
 */
export function watchWebglContextLoss(options) {
  const { canvas, view } = options;

  function onLost(event) {
    // Without this the browser never restores the context.
    event.preventDefault();
    if (view.contextLost) return;
    view.contextLost = true;
    if (options.onLost) options.onLost();
  }

  function onRestored() {
    if (!view.contextLost) return;
    view.contextLost = false;
    view.resize(true);
    if (options.onRestored) options.onRestored();
  }

  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  return () => {
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
  };
}
