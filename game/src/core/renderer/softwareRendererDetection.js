// Tells whether WebGL runs on the CPU (SwiftShader, llvmpipe), as it does in the headless
// browser that takes the automated screenshots. There a frame costs seconds, so the engine
// picks the low tier unless asked otherwise, skips the GPU benchmark and holds the frame loop
// after the ready frame.

/**
 * Looks at the renderer's driver name.
 * @param {{getContext: () => WebGL2RenderingContext}} renderer The three.js renderer.
 * @returns {boolean} True for a software renderer.
 */
export function isSoftwareRenderer(renderer) {
  try {
    const gl = renderer.getContext();
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    const name = extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : '';
    return looksLikeSoftwareRenderer(name);
  } catch {
    return false;
  }
}

/**
 * The name test, apart from the browser.
 * @param {string} rendererName The unmasked renderer string.
 * @returns {boolean}
 */
export function looksLikeSoftwareRenderer(rendererName) {
  return /swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic render/i.test(rendererName);
}
