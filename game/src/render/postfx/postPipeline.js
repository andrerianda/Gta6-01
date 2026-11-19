// The image pipeline of MARAZUL: draws the scene into an HDR target and runs the post-processing
// stages over it in a fixed order, each with its own switch.
//
//   scene (HDR colour + depth)
//     -> ambient occlusion (half res)          ambientOcclusionPass.js     0.7-0.9 ms
//     -> sun shafts (quarter res)              sunShaftsPass.js            0.25 ms
//     -> atmosphere resolve: occlusion, heat   atmosphereResolvePass.js    0.4 ms
//        shimmer, haze, shafts
//     -> depth of field (cutscenes only)       depthOfFieldPass.js         0.9 ms
//     -> motion blur (at speed only)           motionBlurPass.js           0.5 ms
//     -> lens flare (a few quads)              lensFlare.js                <0.1 ms
//     -> bloom (mip chain)                     bloomPass.js                0.6 ms
//     -> exposure, filmic curve, grade,        finalGradePass.js           0.3 ms
//        vignette, grain
//     -> anti-aliasing                         antialiasPass.js            0.4 ms
//     -> canvas
//
// The times are the budget on a mid-range desktop GPU at 1920x1080; with every gameplay stage on
// the chain costs about 2.7 ms. When the GPU cannot render to a float target the pipeline reports
// `hdrSupported: false` and the facade draws the scene straight to the canvas with three.js's own
// tone mapping instead.

import * as THREE from 'three';
import { createAmbientOcclusionPass } from './ambientOcclusionPass.js';
import { createAntialiasPass } from './antialiasPass.js';
import { createAtmosphereResolvePass } from './atmosphereResolvePass.js';
import { createBloomPass } from './bloomPass.js';
import { createDepthOfFieldPass } from './depthOfFieldPass.js';
import { createFinalGradePass } from './finalGradePass.js';
import { createFullscreenDrawer } from './fullscreenPass.js';
import { createLensFlare } from './lensFlare.js';
import { createMotionBlurPass } from './motionBlurPass.js';
import { createSunShaftsPass } from './sunShaftsPass.js';

/**
 * @typedef {Object} PostSettings
 * @property {boolean} ambientOcclusion
 * @property {number} ambientOcclusionSamples 8 or 12.
 * @property {boolean} bloom
 * @property {number} bloomLevels 2 to 6.
 * @property {boolean} sunShafts
 * @property {boolean} heatHaze
 * @property {boolean} depthOfField Allows the stage; it runs only when the frame asks for it.
 * @property {boolean} motionBlur Allows the stage; it runs only when the frame asks for it.
 * @property {boolean} lensFlare
 * @property {boolean} grade Colour grading (lift, gamma, gain, saturation, contrast, split toning).
 * @property {boolean} grain
 * @property {boolean} antialias
 * @property {number} antialiasSteps 4, 8 or 10.
 * @property {number} msaa Multisampling of the scene target: 0 (off) or 4.
 * @property {number} renderScale Internal resolution as a fraction of the canvas (0.5 to 1).
 */

/**
 * @typedef {Object} PostFrame The per-frame values the pipeline needs; the facade fills one object and reuses it.
 * @property {number} exposure
 * @property {number} bloom Bloom strength (the look's value).
 * @property {number} hazeDensity
 * @property {number} hazeHeight
 * @property {number} heatHaze 0..1
 * @property {number} groundLevel World height of the ground near the camera, for the heat shimmer.
 * @property {number} time Seconds, for animated noise.
 * @property {THREE.Vector3} sunDirection Unit vector toward the sun.
 * @property {THREE.Color} shaftColor Sun colour times shaft strength, in scene radiance.
 * @property {number} flareStrength 0 disables the flare.
 * @property {THREE.Color} flareColor
 * @property {boolean} depthOfField Run depth of field this frame.
 * @property {{distance: number, aperture: number, range: number}} focus
 * @property {number} motionBlur Shutter fraction, 0 disables.
 * @property {THREE.Vector3} subjectPosition
 * @property {number} subjectRadius
 * @property {number} vignette
 * @property {number} grain
 * @property {number} fade 1 normal, 0 black.
 * @property {number} occlusionStrength
 */

/**
 * Creates the post-processing pipeline.
 * @param {THREE.WebGLRenderer} renderer The game's renderer.
 * @param {Record<string, {value: any}>} skyUniforms The sky's uniforms (shared haze colours).
 * @param {THREE.Texture} noiseTexture The shared tiling noise texture.
 * @returns {{
 *   settings: PostSettings,
 *   hdrSupported: boolean,
 *   gradeUniforms: Record<string, {value: any}>,
 *   depthTexture: THREE.Texture,
 *   applySettings: () => void,
 *   setSize: (width: number, height: number) => void,
 *   render: (scene: THREE.Scene, camera: THREE.PerspectiveCamera, frame: PostFrame) => void,
 *   dispose: () => void,
 * }} Change `settings` and call `applySettings()`; `gradeUniforms` are the grading stage's
 *   uniforms (lift, gamma, gain and so on), which the facade writes from the current look.
 */
export function createPostPipeline(renderer, skyUniforms, noiseTexture) {
  const drawer = createFullscreenDrawer(renderer);
  const settings = {
    ambientOcclusion: true,
    ambientOcclusionSamples: 12,
    bloom: true,
    bloomLevels: 6,
    sunShafts: true,
    heatHaze: true,
    depthOfField: true,
    motionBlur: true,
    lensFlare: true,
    grade: true,
    grain: true,
    antialias: true,
    antialiasSteps: 8,
    msaa: 0,
    renderScale: 1,
  };

  const occlusion = createAmbientOcclusionPass(drawer, renderer);
  const shafts = createSunShaftsPass(drawer, renderer);
  const resolve = createAtmosphereResolvePass(drawer, renderer, skyUniforms, noiseTexture);
  const depthOfField = createDepthOfFieldPass(drawer, renderer);
  const motionBlur = createMotionBlurPass(drawer, renderer);
  const flare = createLensFlare(renderer);
  const bloom = createBloomPass(drawer);
  const grade = createFinalGradePass(drawer);
  const antialias = createAntialiasPass(drawer);

  let sceneTarget = drawer.createTarget(2, 2, { hdr: true, depthTexture: true, samples: settings.msaa });
  const hdrA = drawer.createTarget(2, 2, { hdr: true });
  const hdrB = drawer.createTarget(2, 2, { hdr: true });
  const displayTarget = drawer.createTarget(2, 2);
  let width = 0;
  let height = 0;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let appliedMsaa = settings.msaa;
  const bufferSize = new THREE.Vector2();
  const resolveFeatures = { ambientOcclusion: false, sunShafts: false, heatHaze: false };
  const gradeFeatures = { bloom: true, grade: true, grain: true };

  const pipeline = {
    settings,
    hdrSupported: drawer.hdrSupported,
    gradeUniforms: grade.uniforms,
    depthTexture: sceneTarget.depthTexture,
    applySettings,
    setSize,
    render,
    dispose,
  };

  /** Pushes `settings` into the stages. Call after changing any of them. */
  function applySettings() {
    occlusion.setSamples(settings.ambientOcclusionSamples);
    bloom.setLevels(settings.bloomLevels);
    antialias.setSteps(settings.antialiasSteps);
    gradeFeatures.bloom = settings.bloom;
    gradeFeatures.grade = settings.grade;
    gradeFeatures.grain = settings.grain;
    grade.setFeatures(gradeFeatures);
    if (settings.msaa !== appliedMsaa) {
      appliedMsaa = settings.msaa;
      sceneTarget.dispose();
      sceneTarget = drawer.createTarget(Math.max(2, width), Math.max(2, height), {
        hdr: true,
        depthTexture: true,
        samples: settings.msaa,
      });
      pipeline.depthTexture = sceneTarget.depthTexture;
    }
    // Force a resize on the next frame in case the render scale changed.
    canvasWidth = 0;
  }

  /** Sizes every target for a canvas of the given drawing-buffer size in pixels. */
  function setSize(bufferWidth, bufferHeight) {
    canvasWidth = bufferWidth;
    canvasHeight = bufferHeight;
    const scale = Math.min(1, Math.max(0.25, settings.renderScale));
    width = Math.max(2, Math.round(bufferWidth * scale));
    height = Math.max(2, Math.round(bufferHeight * scale));
    sceneTarget.setSize(width, height);
    hdrA.setSize(width, height);
    hdrB.setSize(width, height);
    displayTarget.setSize(width, height);
    occlusion.setSize(width, height);
    shafts.setSize(width, height);
    depthOfField.setSize(width, height);
    bloom.setSize(width, height);
    grade.uniforms.uAspect.value = width / height;
  }

  /**
   * Draws one frame to the canvas.
   * @param {THREE.Scene} scene The game scene.
   * @param {THREE.PerspectiveCamera} camera The game camera.
   * @param {PostFrame} frame The frame's values.
   */
  function render(scene, camera, frame) {
    renderer.getDrawingBufferSize(bufferSize);
    if (bufferSize.x !== canvasWidth || bufferSize.y !== canvasHeight) setSize(bufferSize.x, bufferSize.y);

    const previousAutoClear = renderer.autoClear;
    const previousTarget = renderer.getRenderTarget();

    // 1. The scene, in scene-referred linear radiance.
    renderer.autoClear = true;
    renderer.setRenderTarget(sceneTarget);
    renderer.render(scene, camera);
    renderer.autoClear = false;
    const depth = sceneTarget.depthTexture;

    // 2. Stages that only read depth and colour.
    const useOcclusion = settings.ambientOcclusion && frame.occlusionStrength > 0.01;
    if (useOcclusion) occlusion.render(depth, camera, 1.2, 1.4);

    let shaftStrength = 0;
    const sunVisible = shafts.locateSun(camera, frame.sunDirection);
    const shaftLevel = Math.max(frame.shaftColor.r, frame.shaftColor.g, frame.shaftColor.b);
    if (settings.sunShafts && sunVisible > 0.01 && shaftLevel > 0.002) {
      shafts.render(sceneTarget.texture, depth, camera, frame.exposure);
      shaftStrength = sunVisible;
    }

    // 3. Air: occlusion, shimmer, haze, shafts.
    const resolveUniforms = resolve.uniforms;
    resolveFeatures.ambientOcclusion = useOcclusion;
    resolveFeatures.sunShafts = shaftStrength > 0;
    resolveFeatures.heatHaze = settings.heatHaze && frame.heatHaze > 0.02;
    resolve.setFeatures(resolveFeatures);
    resolveUniforms.tOcclusion.value = occlusion.texture;
    resolveUniforms.tShafts.value = shafts.texture;
    resolveUniforms.uHazeDensity.value = frame.hazeDensity;
    resolveUniforms.uHazeHeight.value = frame.hazeHeight;
    resolveUniforms.uOcclusionStrength.value = frame.occlusionStrength;
    resolveUniforms.uExposure.value = frame.exposure;
    resolveUniforms.uShaftColor.value.copy(frame.shaftColor).multiplyScalar(shaftStrength);
    resolveUniforms.uHeatHaze.value = frame.heatHaze;
    resolveUniforms.uGroundLevel.value = frame.groundLevel;
    resolveUniforms.uTime.value = frame.time;
    resolve.render(sceneTarget.texture, depth, camera, hdrA);
    let current = hdrA;
    let spare = hdrB;

    // 4. Lens and shutter.
    if (settings.depthOfField && frame.depthOfField && frame.focus.aperture > 0.01) {
      depthOfField.render(current.texture, depth, camera, frame.focus, spare);
      const swap = current;
      current = spare;
      spare = swap;
    }
    if (settings.motionBlur && frame.motionBlur > 0.01) {
      motionBlur.render(current.texture, depth, camera, frame.motionBlur, frame.subjectPosition, frame.subjectRadius, spare);
      const swap = current;
      current = spare;
      spare = swap;
    }
    motionBlur.rememberCamera(camera);

    if (settings.lensFlare && frame.flareStrength > 0.001 && shafts.sunOnScreen > 0.01) {
      flare.render(current, depth, camera, shafts.sunUv, frame.flareColor, frame.flareStrength * shafts.sunOnScreen);
    }

    // 5. Glow.
    if (settings.bloom) bloom.render(current.texture, width, height, frame.exposure, 1.0);

    // 6. Film: exposure, curve, grade, grain; then anti-aliasing onto the canvas.
    const gradeUniforms = grade.uniforms;
    gradeUniforms.uExposure.value = frame.exposure;
    gradeUniforms.uBloom.value = frame.bloom / bloom.levels;
    gradeUniforms.uVignette.value = frame.vignette;
    gradeUniforms.uGrain.value = frame.grain;
    gradeUniforms.uTime.value = frame.time;
    gradeUniforms.uFade.value = frame.fade;
    if (settings.antialias) {
      grade.render(current.texture, bloom.texture, displayTarget);
      antialias.render(displayTarget.texture, width, height, previousTarget);
    } else {
      grade.render(current.texture, bloom.texture, previousTarget);
    }

    renderer.setRenderTarget(previousTarget);
    renderer.autoClear = previousAutoClear;
  }

  function dispose() {
    sceneTarget.dispose();
    hdrA.dispose();
    hdrB.dispose();
    displayTarget.dispose();
    occlusion.dispose();
    shafts.dispose();
    resolve.dispose();
    depthOfField.dispose();
    motionBlur.dispose();
    flare.dispose();
    bloom.dispose();
    grade.dispose();
    antialias.dispose();
    drawer.dispose();
  }

  applySettings();
  return pipeline;
}
