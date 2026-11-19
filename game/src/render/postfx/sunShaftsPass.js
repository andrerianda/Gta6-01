// Sun shafts: the streaks of light that fan out from a low sun between towers and palm crowns.
// A quarter-resolution mask keeps only the bright sky near the sun, two radial blurs smear it away
// from the sun's position on screen, and the atmosphere stage adds the result, tinted with the
// sun's colour. When the sun is behind the camera or far off screen the stage does nothing.
// Cost on a mid-range GPU at 1080p: about 0.25 ms.

import * as THREE from 'three';
import { DEPTH_DECODE_GLSL, depthDefinesFor } from './fullscreenPass.js';

const MASK_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform vec2 uSunUv;
uniform float uAspect;
uniform float uExposure;
${DEPTH_DECODE_GLSL}

void main() {
  float sky = isSkyDepth(texture2D(tDepth, vUv).x) ? 1.0 : 0.0;
  vec3 color = texture2D(tScene, vUv).rgb * uExposure;
  float level = dot(color, vec3(0.2126, 0.7152, 0.0722));
  vec2 toSun = (vUv - uSunUv) * vec2(uAspect, 1.0);
  float near = 1.0 - smoothstep(0.05, 0.75, length(toSun));
  // Only the sun's disc and its inner glow throw shafts; the merely bright sky does not.
  float mask = sky * smoothstep(1.0, 4.5, level) * near;
  gl_FragColor = vec4(mask, mask, mask, 1.0);
}
`;

const RADIAL_BLUR_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tSource;
uniform vec2 uSunUv;
uniform float uReach;           // fraction of the way to the sun this pass smears over

void main() {
  vec2 stride = (uSunUv - vUv) * (uReach / 8.0);
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec2 uv = vUv + stride * jitter;
  float sum = 0.0;
  float weight = 1.0;
  float total = 0.0;
  for (int i = 0; i < 8; i++) {
    sum += texture2D(tSource, uv).r * weight;
    total += weight;
    weight *= 0.9;
    uv += stride;
  }
  float shaft = sum / total;
  gl_FragColor = vec4(shaft, shaft, shaft, 1.0);
}
`;

/**
 * Creates the sun shafts stage.
 * @param {ReturnType<import('./fullscreenPass.js').createFullscreenDrawer>} drawer The shared fullscreen drawer.
 * @param {THREE.WebGLRenderer} renderer The game's renderer.
 * @returns {{
 *   texture: THREE.Texture,
 *   strength: number,
 *   sunUv: THREE.Vector2,
 *   sunOnScreen: number,
 *   setSize: (width: number, height: number) => void,
 *   locateSun: (camera: THREE.Camera, sunDirection: THREE.Vector3) => number,
 *   render: (scene: THREE.Texture, depth: THREE.Texture, camera: THREE.PerspectiveCamera, exposure: number) => void,
 *   dispose: () => void,
 * }} `texture` holds the shafts in its red channel; `strength` (0..1) says how much of them to
 *   add this frame (0 when the sun is out of view: do not sample the texture then); `sunUv` is the
 *   sun's position on screen and `sunOnScreen` how far inside the frame it is, both for the flare.
 */
export function createSunShaftsPass(drawer, renderer) {
  const targetA = drawer.createTarget(2, 2);
  const targetB = drawer.createTarget(2, 2);
  const maskMaterial = drawer.createMaterial(
    'marazul-sun-shafts-mask',
    MASK_FRAGMENT_SHADER,
    {
      tScene: { value: null },
      tDepth: { value: null },
      uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
      uAspect: { value: 1 },
      uExposure: { value: 1 },
      uCameraNear: { value: 0.1 },
      uCameraFar: { value: 1000 },
    },
    depthDefinesFor(renderer),
  );
  const blurMaterial = drawer.createMaterial('marazul-sun-shafts-blur', RADIAL_BLUR_FRAGMENT_SHADER, {
    tSource: { value: null },
    uSunUv: maskMaterial.uniforms.uSunUv,
    uReach: { value: 0.5 },
  });

  const clip = new THREE.Vector4();
  const pass = {
    texture: targetA.texture,
    strength: 0,
    sunUv: maskMaterial.uniforms.uSunUv.value,
    sunOnScreen: 0,
    setSize,
    locateSun,
    render,
    dispose,
  };

  /** Sizes the stage for a full-resolution frame of the given pixel size. */
  function setSize(width, height) {
    targetA.setSize(Math.max(1, width >> 2), Math.max(1, height >> 2));
    targetB.setSize(Math.max(1, width >> 2), Math.max(1, height >> 2));
    maskMaterial.uniforms.uAspect.value = width / Math.max(1, height);
  }

  /**
   * Finds the sun on screen and sets `sunUv`, `sunOnScreen` and `strength`.
   * @param {THREE.Camera} camera The game camera.
   * @param {THREE.Vector3} sunDirection Unit vector toward the sun.
   * @returns {number} `strength`: 1 with the sun well inside the frame, fading to 0 outside it.
   */
  function locateSun(camera, sunDirection) {
    clip.set(sunDirection.x, sunDirection.y, sunDirection.z, 0);
    clip.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
    if (clip.w <= 1e-5) {
      pass.strength = 0;
      pass.sunOnScreen = 0;
      return 0;
    }
    const x = clip.x / clip.w;
    const y = clip.y / clip.w;
    pass.sunUv.set(x * 0.5 + 0.5, y * 0.5 + 0.5);
    const edge = Math.max(Math.abs(x), Math.abs(y));
    pass.sunOnScreen = 1 - smoothstep(0.92, 1.08, edge);
    pass.strength = 1 - smoothstep(1.0, 1.7, edge);
    return pass.strength;
  }

  /**
   * Computes the shafts. Call locateSun() first and skip this when `strength` is 0.
   * @param {THREE.Texture} scene The HDR scene colour.
   * @param {THREE.Texture} depth The scene's depth texture.
   * @param {THREE.PerspectiveCamera} camera The game camera.
   * @param {number} exposure The frame's exposure.
   */
  function render(scene, depth, camera, exposure) {
    const uniforms = maskMaterial.uniforms;
    uniforms.tScene.value = scene;
    uniforms.tDepth.value = depth;
    uniforms.uExposure.value = exposure;
    uniforms.uCameraNear.value = camera.near;
    uniforms.uCameraFar.value = camera.far;
    drawer.draw(maskMaterial, targetB);

    blurMaterial.uniforms.tSource.value = targetB.texture;
    blurMaterial.uniforms.uReach.value = 0.62;
    drawer.draw(blurMaterial, targetA);
    blurMaterial.uniforms.tSource.value = targetA.texture;
    blurMaterial.uniforms.uReach.value = 0.14;
    drawer.draw(blurMaterial, targetB);
    blurMaterial.uniforms.tSource.value = targetB.texture;
    blurMaterial.uniforms.uReach.value = 0.035;
    drawer.draw(blurMaterial, targetA);
  }

  function dispose() {
    targetA.dispose();
    targetB.dispose();
    maskMaterial.dispose();
    blurMaterial.dispose();
  }

  return pass;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
