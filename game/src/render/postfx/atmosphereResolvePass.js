// The stage that puts air between the camera and the world. In one fullscreen pass over the HDR
// scene it applies the ambient occlusion, the heat shimmer over hot ground, the haze (denser near
// sea level and thinning with height, tinted like the sky at the horizon so the far sea and the
// far skyline dissolve into it) and the sun shafts.
// Cost on a mid-range GPU at 1080p: about 0.4 ms (one or two colour reads, one depth read, an
// exponential).

import * as THREE from 'three';
import { HIGH_AIR_ALOFT_SHARE, HIGH_AIR_HEIGHT, HIGH_AIR_SHARE } from '../sea/seaHorizonMaths.js';
import { HAZE_COLOR_GLSL } from '../sky/skyShaderChunks.js';
import { DEPTH_DECODE_GLSL, depthDefinesFor } from './fullscreenPass.js';

const RESOLVE_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tOcclusion;
uniform sampler2D tShafts;
uniform sampler2D tNoise;
uniform vec2 uTanHalfFov;
uniform mat4 uCameraWorld;
uniform vec3 uCameraPosition;
uniform vec3 uSunDirection;
uniform vec3 uHorizonColor;
uniform vec3 uHorizonSunColor;
uniform float uHazeDensity;      // extinction per metre at sea level
uniform float uHazeHeight;       // scale height of the haze, metres
uniform float uHighAir;          // 0 for a camera on the ground .. 1 aloft
uniform float uOcclusionStrength;
uniform float uExposure;
uniform vec3 uShaftColor;
uniform float uHeatHaze;
uniform float uGroundLevel;
uniform float uTime;
${DEPTH_DECODE_GLSL}
${HAZE_COLOR_GLSL}

void main() {
  float depth = texture2D(tDepth, vUv).x;
  bool sky = isSkyDepth(depth);
  float z = viewDepth(depth);
  vec3 viewPosition = vec3((vUv * 2.0 - 1.0) * uTanHalfFov * z, -z);
  vec3 offset = mat3(uCameraWorld) * viewPosition;
  float range = length(offset);
  vec3 ray = offset / max(range, 1e-4);
  vec3 worldPosition = uCameraPosition + offset;

  vec2 uv = vUv;
  #ifdef HEAT_HAZE
    // Shimmer: only over ground some way off, only close above it, rising with time.
    float band = smoothstep(35.0, 110.0, range) * (1.0 - smoothstep(300.0, 700.0, range));
    band *= 1.0 - smoothstep(1.2, 6.0, worldPosition.y - uGroundLevel);
    band *= sky ? 0.0 : uHeatHaze;
    if (band > 0.002) {
      vec2 wobble = texture2D(tNoise, vec2(vUv.x * 5.0, vUv.y * 11.0 - uTime * 0.45)).ga - 0.5;
      uv += wobble * vec2(0.0016, 0.0032) * band;
    }
  #endif
  vec3 color = texture2D(tScene, uv).rgb;
  // One broken pixel (a NaN or an infinity out of some material) would be smeared over the whole
  // picture by the blurs that follow: stop it here.
  color = vec3(color.r >= 0.0 ? color.r : 0.0, color.g >= 0.0 ? color.g : 0.0, color.b >= 0.0 ? color.b : 0.0);
  color = min(color, vec3(1024.0));

  if (!sky) {
    #ifdef AMBIENT_OCCLUSION
      float ao = texture2D(tOcclusion, vUv).r;
      // Occlusion belongs to the fill light: let it bite less where direct light is strong.
      float level = dot(color, vec3(0.2126, 0.7152, 0.0722)) * uExposure;
      float bite = uOcclusionStrength * (1.0 - 0.55 * smoothstep(0.25, 1.4, level));
      color *= mix(1.0, ao, bite);
    #endif

    // Optical depth of an exponential haze layer along the ray, in closed form, plus a thin
    // uniform part so that towers standing above the layer still recede.
    // Far over the sea the depth buffer has steps of kilometres, which would show as rings in
    // the haze: a far point near sea level is taken to lie on the sea plane exactly.
    if (uHighAir > 0.0 && ray.y < -1e-4 && range > 4000.0) {
      float seaRange = uCameraPosition.y / -ray.y;
      if (abs(range - seaRange) < 0.08 * seaRange) {
        range = seaRange;
        worldPosition = uCameraPosition + ray * range;
      }
    }
    float y0 = uCameraPosition.y / uHazeHeight;
    float y1 = worldPosition.y / uHazeHeight;
    float dy = y1 - y0;
    float layer = abs(dy) > 1e-3 ? (exp(-max(y0, -4.0)) - exp(-max(y1, -4.0))) / dy : exp(-max(y0, -4.0));
    // For a camera aloft the uniform part thins with height too (scale height HIGH_AIR_HEIGHT),
    // or the sea straight below a high aircraft would drown in haze. The same closed form is in
    // render/sea/seaHorizonMaths.js (hazeOpticalDepth), which far objects ask for their fade.
    float thin = ${HIGH_AIR_SHARE.toFixed(2)};
    if (uHighAir > 0.0) {
      float h0 = uCameraPosition.y / ${HIGH_AIR_HEIGHT.toFixed(1)};
      float h1 = worldPosition.y / ${HIGH_AIR_HEIGHT.toFixed(1)};
      float dh = h1 - h0;
      float upper = abs(dh) > 1e-3 ? (exp(-max(h0, -4.0)) - exp(-max(h1, -4.0))) / dh : exp(-max(h0, -4.0));
      thin = mix(thin, ${HIGH_AIR_ALOFT_SHARE.toFixed(2)} * upper, uHighAir);
    }
    float opticalDepth = uHazeDensity * range * (layer + thin);
    float transmittance = exp(-opticalDepth);
    vec3 airlight = hazeColor(ray);
    // Looking steeply down from the air the veil is thin blue air, not the bright horizon haze.
    airlight *= mix(vec3(1.0), vec3(0.42, 0.6, 0.86), uHighAir * smoothstep(0.03, 0.45, -ray.y));
    color = color * transmittance + airlight * (1.0 - transmittance);
  }

  #ifdef SUN_SHAFTS
    color += uShaftColor * texture2D(tShafts, vUv).r;
  #endif

  gl_FragColor = vec4(color, 1.0);
}
`;

/**
 * Creates the atmosphere resolve stage.
 * @param {ReturnType<import('./fullscreenPass.js').createFullscreenDrawer>} drawer The shared fullscreen drawer.
 * @param {THREE.WebGLRenderer} renderer The game's renderer.
 * @param {Record<string, {value: any}>} skyUniforms The sky's uniforms; the haze colours and the
 *   sun direction are shared by reference so the fog always matches the horizon.
 * @param {THREE.Texture} noiseTexture The shared tiling noise texture (for the heat shimmer).
 * @returns {{
 *   uniforms: Record<string, {value: any}>,
 *   setFeatures: (features: {ambientOcclusion: boolean, sunShafts: boolean, heatHaze: boolean}) => void,
 *   render: (scene: THREE.Texture, depth: THREE.Texture, camera: THREE.PerspectiveCamera, target: THREE.WebGLRenderTarget | null) => void,
 *   dispose: () => void,
 * }}
 */
export function createAtmosphereResolvePass(drawer, renderer, skyUniforms, noiseTexture) {
  const uniforms = {
    tScene: { value: null },
    tDepth: { value: null },
    tOcclusion: { value: null },
    tShafts: { value: null },
    tNoise: { value: noiseTexture },
    uTanHalfFov: { value: new Float32Array([1, 1]) },
    uCameraWorld: { value: new THREE.Matrix4() },
    uCameraPosition: { value: new THREE.Vector3() },
    uSunDirection: skyUniforms.uSunDirection,
    uHorizonColor: skyUniforms.uHorizonColor,
    uHorizonSunColor: skyUniforms.uHorizonSunColor,
    uHazeDensity: { value: 0.0004 },
    uHazeHeight: { value: 260 },
    uHighAir: { value: 0 },
    uOcclusionStrength: { value: 1 },
    uExposure: { value: 1 },
    uShaftColor: { value: new THREE.Color(0, 0, 0) },
    uHeatHaze: { value: 0 },
    uGroundLevel: { value: 0 },
    uTime: { value: 0 },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 1000 },
  };
  const material = drawer.createMaterial('marazul-atmosphere-resolve', RESOLVE_FRAGMENT_SHADER, uniforms, {
    ...depthDefinesFor(renderer),
  });

  /** Switches the optional parts of the stage; recompiles the shader only when one changes. */
  function setFeatures(features) {
    let changed = false;
    changed = setDefine(material, 'AMBIENT_OCCLUSION', features.ambientOcclusion) || changed;
    changed = setDefine(material, 'SUN_SHAFTS', features.sunShafts) || changed;
    changed = setDefine(material, 'HEAT_HAZE', features.heatHaze) || changed;
    if (changed) material.needsUpdate = true;
  }

  /**
   * Draws the resolved image.
   * @param {THREE.Texture} scene The HDR scene colour.
   * @param {THREE.Texture} depth The scene's depth texture.
   * @param {THREE.PerspectiveCamera} camera The camera the scene was drawn with.
   * @param {THREE.WebGLRenderTarget | null} target Where to draw.
   */
  function render(scene, depth, camera, target) {
    const projection = camera.projectionMatrix.elements;
    uniforms.tScene.value = scene;
    uniforms.tDepth.value = depth;
    uniforms.uTanHalfFov.value[0] = 1 / projection[0];
    uniforms.uTanHalfFov.value[1] = 1 / projection[5];
    uniforms.uCameraWorld.value.copy(camera.matrixWorld);
    uniforms.uCameraPosition.value.setFromMatrixPosition(camera.matrixWorld);
    uniforms.uCameraNear.value = camera.near;
    uniforms.uCameraFar.value = camera.far;
    drawer.draw(material, target);
  }

  function dispose() {
    material.dispose();
  }

  return { uniforms, setFeatures, render, dispose };
}

/** Adds or removes a shader define; returns true when the material changed. */
export function setDefine(material, name, enabled) {
  const has = material.defines[name] !== undefined;
  if (enabled && !has) {
    material.defines[name] = 1;
    return true;
  }
  if (!enabled && has) {
    delete material.defines[name];
    return true;
  }
  return false;
}
