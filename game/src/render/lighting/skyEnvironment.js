// The environment map of MARAZUL: the sky (with its clouds and the lit ground below the horizon)
// captured into a small cube map and prefiltered, so that car paint, glass and every other
// physically based material is lit and reflects by the same sky the player sees.
//
// Refreshing is throttled: a refresh is requested when the time of day or the weather has moved
// enough to matter, the six tiny cube faces are drawn in one frame and the prefiltering runs in
// the next, and no refresh starts sooner than a minimum interval after the last one. The
// prefiltered texture keeps its identity across refreshes, so no material is ever recompiled.
//
//   const environment = createSkyEnvironment(renderer, skyDome);
//   scene.environment = environment.texture;            // null until the first refresh is done
//   environment.update(nowSeconds, signature);          // every frame

import * as THREE from 'three';

/**
 * Creates the sky environment capture.
 * @param {THREE.WebGLRenderer} renderer The game's renderer.
 * @param {{environmentMesh: THREE.Mesh}} skyDome The sky dome (see skyDome.js).
 * @param {Object} [options]
 * @param {number} [options.size] Edge length of a cube face in texels (64 to 256).
 * @param {number} [options.minInterval] Least seconds between two refreshes.
 * @returns {{
 *   texture: THREE.Texture | null,
 *   cubeTexture: THREE.CubeTexture,
 *   supported: boolean,
 *   onReady: ((texture: THREE.Texture) => void) | null,
 *   update: (nowSeconds: number, signature: number) => boolean,
 *   refreshNow: () => void,
 *   setMinInterval: (seconds: number) => void,
 *   dispose: () => void,
 * }} `texture` is the prefiltered map for scene.environment; `cubeTexture` the raw mip-mapped cube
 *   for shaders that sample the sky themselves (the water); `update` returns true in a frame in
 *   which the map changed.
 */
export function createSkyEnvironment(renderer, skyDome, options = {}) {
  const size = options.size ?? 128;
  let minInterval = options.minInterval ?? 0.75;

  const supported =
    renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');

  const cubeTarget = new THREE.WebGLCubeRenderTarget(size, {
    type: supported ? THREE.HalfFloatType : THREE.UnsignedByteType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
  });
  cubeTarget.texture.name = 'marazul-sky-cube';
  const cubeCamera = new THREE.CubeCamera(0.1, 10, cubeTarget);
  const captureScene = new THREE.Scene();
  captureScene.add(skyDome.environmentMesh);

  let pmrem = null;
  let pmremTarget = null;
  if (supported) {
    try {
      pmrem = new THREE.PMREMGenerator(renderer);
    } catch (error) {
      console.warn('MARAZUL: environment prefiltering is unavailable.', error);
      pmrem = null;
    }
  }

  const environment = {
    texture: null,
    cubeTexture: cubeTarget.texture,
    supported: pmrem !== null,
    onReady: null,
    update,
    refreshNow,
    setMinInterval,
    dispose,
  };

  // 0 idle, 1 cube captured and waiting for the prefilter pass.
  let stage = 0;
  let lastRefreshTime = -Infinity;
  let lastSignature = NaN;

  function captureCube() {
    const previousShadowAutoUpdate = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    cubeCamera.update(renderer, captureScene);
    renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
  }

  function prefilter() {
    if (!pmrem) return false;
    try {
      pmremTarget = pmrem.fromCubemap(cubeTarget.texture, pmremTarget);
    } catch (error) {
      console.warn('MARAZUL: environment prefiltering failed; image-based lighting is off.', error);
      pmrem = null;
      environment.supported = false;
      return false;
    }
    if (environment.texture !== pmremTarget.texture) {
      environment.texture = pmremTarget.texture;
      if (environment.onReady) environment.onReady(environment.texture);
    }
    return true;
  }

  /**
   * Advances the throttled refresh.
   * @param {number} nowSeconds A monotonic clock (real seconds).
   * @param {number} signature Any number that changes when the sky's look changes noticeably
   *   (the facade folds the time of day, the weather and the cloud drift into it).
   * @returns {boolean} True when the environment map was updated in this call.
   */
  function update(nowSeconds, signature) {
    if (stage === 1) {
      stage = 0;
      return prefilter();
    }
    if (signature !== lastSignature && nowSeconds - lastRefreshTime >= minInterval) {
      lastSignature = signature;
      lastRefreshTime = nowSeconds;
      captureCube();
      stage = 1;
    }
    return false;
  }

  /** Captures and prefilters at once, for start-up and for screenshots. */
  function refreshNow() {
    captureCube();
    prefilter();
    stage = 0;
  }

  function setMinInterval(seconds) {
    minInterval = Math.max(0, seconds);
  }

  function dispose() {
    cubeTarget.dispose();
    if (pmremTarget) pmremTarget.dispose();
    if (pmrem) pmrem.dispose();
  }

  return environment;
}
