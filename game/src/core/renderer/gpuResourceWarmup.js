// GPU warm-up for the boot: before the first frame is drawn, links the shader programs of every
// mesh in the scene (shown or hidden: far levels, pooled cars, idle effects) and uploads every
// texture their materials use. three.js's renderer.compileAsync() starts the links through
// KHR_parallel_shader_compile where the driver offers it, so the driver builds them side by side
// while the textures upload on the main thread; without the warm-up the first frame does both
// one program and one texture at a time, and hidden objects hitch later, when first seen.
// It never blocks the boot for long: after `timeoutMilliseconds` the boot goes on and whatever is
// not linked yet finishes in the first frames, exactly as without the warm-up.
//
//   const report = await warmUpGpuResources(view.renderer, view.scene, view.camera);
//   // { programs: 40, textures: 310, milliseconds: 840, textureMilliseconds: 260, timedOut: false }

/**
 * Links the scene's shader programs and uploads its textures ahead of the first frame.
 * @param {{compileAsync?: Function, initTexture?: Function, info?: {programs?: unknown[] | null}}} renderer
 *   The WebGL renderer.
 * @param {{traverse: Function}} scene The scene to draw (its lights decide the programs' light counts).
 * @param {object} camera The camera of the first frame.
 * @param {Object} [options]
 * @param {number} [options.timeoutMilliseconds] Longest wait for the links; default 6000.
 * @param {() => void} [options.drawFrame] Draws one frame through the image pipeline; during the
 *   warm-up its renderer.render calls compile instead of drawing.
 * @param {() => number} [options.now] Clock in milliseconds; default performance.now.
 * @returns {Promise<{programs: number, textures: number, milliseconds: number,
 *   textureMilliseconds: number, timedOut: boolean}>}
 */
export async function warmUpGpuResources(renderer, scene, camera, options = {}) {
  const now = options.now ?? (() => globalThis.performance.now());
  const timeout = options.timeoutMilliseconds ?? 6000;
  const programsBefore = programCount(renderer);
  const started = now();
  // Start the links first: compileAsync creates every program now and the driver links them
  // while the textures upload below.
  const pending = [];
  // Without the extension (software renderers) three warns on compileAsync: compile in place.
  const parallel = renderer.extensions?.has?.('KHR_parallel_shader_compile') === true;
  const compile = (passScene, passCamera) => {
    if (parallel) pending.push(renderer.compileAsync(passScene, passCamera));
    else renderer.compile(passScene, passCamera);
  };
  if (typeof renderer.compileAsync === 'function') {
    compile(scene, camera);
    // The image pipeline draws its own scenes (sky, post passes): run one frame through it in
    // which every render becomes a compile, so their programs link side by side too.
    if (options.drawFrame) {
      const render = renderer.render;
      renderer.render = compile;
      try {
        options.drawFrame();
      } finally {
        renderer.render = render;
      }
    }
  }
  const linked = Promise.all(pending).then(() => false);
  const texturesStarted = now();
  const textures = typeof renderer.initTexture === 'function' ? uploadSceneTextures(renderer, scene) : 0;
  const textureMilliseconds = Math.round(now() - texturesStarted);
  let timer = null;
  const expired = new Promise((resolve) => { timer = setTimeout(() => resolve(true), timeout); });
  let timedOut = false;
  try {
    timedOut = await Promise.race([linked, expired]);
  } finally {
    clearTimeout(timer);
  }
  return {
    programs: programCount(renderer) - programsBefore,
    textures,
    milliseconds: Math.round(now() - started),
    textureMilliseconds,
    timedOut,
  };
}

/**
 * Uploads every texture the scene's materials use (each once).
 * @returns {number} How many textures were handed to the renderer.
 */
function uploadSceneTextures(renderer, scene) {
  const seenMaterials = new Set();
  const seenTextures = new Set();
  scene.traverse((object) => {
    const material = object.material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const entry of materials) {
      if (!entry || seenMaterials.has(entry)) continue;
      seenMaterials.add(entry);
      for (const key of Object.keys(entry)) {
        const value = entry[key];
        if (!value || value.isTexture !== true || seenTextures.has(value)) continue;
        seenTextures.add(value);
        if (!uploadable(value)) continue;
        renderer.initTexture(value);
      }
      // Shader materials keep their textures in uniforms.
      const uniforms = entry.uniforms;
      if (!uniforms) continue;
      for (const name of Object.keys(uniforms)) {
        const value = uniforms[name]?.value;
        if (!value || value.isTexture !== true || seenTextures.has(value)) continue;
        seenTextures.add(value);
        if (!uploadable(value)) continue;
        renderer.initTexture(value);
      }
    }
  });
  return seenTextures.size;
}

/** Render targets fill themselves; a texture without its picture yet uploads when it has one. */
function uploadable(texture) {
  return !texture.isRenderTargetTexture && !texture.isDepthTexture && !texture.isFramebufferTexture && texture.version > 0;
}

function programCount(renderer) {
  const programs = renderer.info?.programs;
  return Array.isArray(programs) ? programs.length : 0;
}
