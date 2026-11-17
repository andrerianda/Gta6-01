// Motion blur at speed: each pixel is smeared along the path it took across the screen since the
// previous frame because of the camera's own movement. The path comes from the depth buffer and the
// previous frame's camera matrices, so no per-object velocity is needed; a protected sphere around
// the camera's subject (the player's car) keeps it sharp while the road and the city streak past.
// Eight taps at full resolution; cost on a mid-range GPU at 1080p: about 0.5 ms. The stage should
// only run above some speed: the pipeline skips it when the strength is zero.

import * as THREE from 'three';
import { DEPTH_DECODE_GLSL, depthDefinesFor } from './fullscreenPass.js';

const MOTION_BLUR_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform vec2 uTanHalfFov;
uniform mat4 uCameraWorld;
uniform mat4 uPreviousViewProjection;
uniform vec3 uSubjectPosition;   // centre of the sphere that stays sharp
uniform float uSubjectRadius;
uniform float uStrength;         // shutter fraction: 0 none, 1 a full frame of travel
uniform float uMaxLength;        // longest smear, as a fraction of the screen height
uniform float uAspect;
${DEPTH_DECODE_GLSL}

void main() {
  float z = viewDepth(texture2D(tDepth, vUv).x);
  vec3 viewPosition = vec3((vUv * 2.0 - 1.0) * uTanHalfFov * z, -z);
  vec3 worldPosition = (uCameraWorld * vec4(viewPosition, 1.0)).xyz;

  vec4 previousClip = uPreviousViewProjection * vec4(worldPosition, 1.0);
  vec2 previousUv = previousClip.xy / max(previousClip.w, 1e-4) * 0.5 + 0.5;
  vec2 velocity = (vUv - previousUv) * uStrength;
  velocity *= previousClip.w > 0.0 ? 1.0 : 0.0;

  // The subject travels with the camera: leave it and the ground it stands on untouched.
  float guard = smoothstep(uSubjectRadius, uSubjectRadius * 1.8, length(worldPosition - uSubjectPosition));
  velocity *= guard;

  float span = length(velocity * vec2(uAspect, 1.0));
  if (span < 0.0008) {
    gl_FragColor = vec4(texture2D(tScene, vUv).rgb, 1.0);
    return;
  }
  velocity *= min(1.0, uMaxLength / span);

  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float t = (float(i) + 0.5 + jitter) / 8.0 - 0.5;
    sum += texture2D(tScene, vUv + velocity * t).rgb;
  }
  gl_FragColor = vec4(sum * 0.125, 1.0);
}
`;

/**
 * Creates the motion blur stage.
 * @param {ReturnType<import('./fullscreenPass.js').createFullscreenDrawer>} drawer The shared fullscreen drawer.
 * @param {THREE.WebGLRenderer} renderer The game's renderer.
 * @returns {{
 *   rememberCamera: (camera: THREE.Camera) => void,
 *   render: (scene: THREE.Texture, depth: THREE.Texture, camera: THREE.PerspectiveCamera, strength: number,
 *     subjectPosition: THREE.Vector3, subjectRadius: number, target: THREE.WebGLRenderTarget | null) => void,
 *   dispose: () => void,
 * }} Call `rememberCamera` once at the end of every frame (also when the stage did not run), so
 *   that the next frame knows where the camera was.
 */
export function createMotionBlurPass(drawer, renderer) {
  const uniforms = {
    tScene: { value: null },
    tDepth: { value: null },
    uTanHalfFov: { value: new Float32Array([1, 1]) },
    uCameraWorld: { value: new THREE.Matrix4() },
    uPreviousViewProjection: { value: new THREE.Matrix4() },
    uSubjectPosition: { value: new THREE.Vector3() },
    uSubjectRadius: { value: 3 },
    uStrength: { value: 0.5 },
    uMaxLength: { value: 0.045 },
    uAspect: { value: 16 / 9 },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 1000 },
  };
  const material = drawer.createMaterial(
    'marazul-motion-blur',
    MOTION_BLUR_FRAGMENT_SHADER,
    uniforms,
    depthDefinesFor(renderer),
  );
  const previousViewProjection = new THREE.Matrix4();
  let hasPrevious = false;

  /** Stores this frame's camera for the next frame's blur. */
  function rememberCamera(camera) {
    previousViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    hasPrevious = true;
  }

  /**
   * Draws the scene with motion blur.
   * @param {THREE.Texture} scene The HDR image.
   * @param {THREE.Texture} depth The scene's depth texture.
   * @param {THREE.PerspectiveCamera} camera The camera the scene was drawn with.
   * @param {number} strength Shutter fraction, 0 to 1.
   * @param {THREE.Vector3} subjectPosition World position of what the camera follows.
   * @param {number} subjectRadius Radius in metres around it that stays sharp.
   * @param {THREE.WebGLRenderTarget | null} target Where to draw.
   */
  function render(scene, depth, camera, strength, subjectPosition, subjectRadius, target) {
    const projection = camera.projectionMatrix.elements;
    uniforms.tScene.value = scene;
    uniforms.tDepth.value = depth;
    uniforms.uTanHalfFov.value[0] = 1 / projection[0];
    uniforms.uTanHalfFov.value[1] = 1 / projection[5];
    uniforms.uAspect.value = projection[5] / projection[0];
    uniforms.uCameraWorld.value.copy(camera.matrixWorld);
    if (hasPrevious) uniforms.uPreviousViewProjection.value.copy(previousViewProjection);
    else uniforms.uPreviousViewProjection.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    uniforms.uSubjectPosition.value.copy(subjectPosition);
    uniforms.uSubjectRadius.value = subjectRadius;
    uniforms.uStrength.value = strength;
    uniforms.uCameraNear.value = camera.near;
    uniforms.uCameraFar.value = camera.far;
    drawer.draw(material, target);
  }

  function dispose() {
    material.dispose();
  }

  return { rememberCamera, render, dispose };
}
