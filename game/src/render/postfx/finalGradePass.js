// The last artistic stage: from scene-referred HDR to the picture. It adds the bloom, applies the
// lens vignette and the exposure, compresses the range with a filmic curve, grades the result
// (lift, gamma, gain, contrast, saturation, split toning of shadows and highlights), lays film
// grain over it and encodes it for the display. The output carries its luma in the alpha channel
// for the anti-aliasing stage.
//
// The tone curve is a sigmoid in log exposure (a toe that keeps blacks rich, a long shoulder that
// rolls highlights off instead of clipping them), applied mostly per channel, so that very bright
// coloured light (a neon tube, the sun on amber glass) bleaches toward white the way film does.
// Cost on a mid-range GPU at 1080p: about 0.3 ms.

import * as THREE from 'three';

const GRADE_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloom;            // bloom strength, already divided by the number of bloom levels
uniform float uExposure;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uSplitToning;
uniform float uVignette;
uniform float uGrain;
uniform float uAspect;
uniform float uTime;
uniform float uFade;             // 1 normal; below 1 fades the picture to black (cuts, loading)

const float TONE_CONTRAST = 1.38;
const float TONE_MID = 0.54;
const float TONE_WHITE = 14.0;

vec3 toneCurve(vec3 x) {
  vec3 p = pow(max(x, vec3(0.0)), vec3(TONE_CONTRAST));
  float s = pow(TONE_MID, TONE_CONTRAST);
  float w = pow(TONE_WHITE, TONE_CONTRAST);
  return (p / (p + s)) * ((w + s) / w);
}

vec3 filmic(vec3 color) {
  // Mostly per channel (highlights bleach to white), partly on luminance (hues hold).
  vec3 perChannel = toneCurve(color);
  float level = dot(color, vec3(0.2126, 0.7152, 0.0722));
  vec3 onLuminance = color * (toneCurve(vec3(level)).x / max(level, 1e-5));
  return clamp(mix(perChannel, onLuminance, 0.4), 0.0, 1.0);
}

vec3 encodeDisplay(vec3 value) {
  vec3 low = value * 12.92;
  vec3 high = 1.055 * pow(max(value, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), value));
}

float grainNoise(vec2 p, float t) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973) + t);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

void main() {
  vec3 color = texture2D(tScene, vUv).rgb;
  #ifdef BLOOM
    color += texture2D(tBloom, vUv).rgb * (uBloom / max(uExposure, 1e-4));
  #endif

  // Natural lens falloff toward the corners, applied to light, before the film curve.
  vec2 centred = (vUv - 0.5) * vec2(uAspect, 1.0);
  float falloff = 1.0 + dot(centred, centred) * uVignette * 1.9;
  color *= uExposure / (falloff * falloff);

  color = encodeDisplay(filmic(color));

  #ifdef GRADE
    // Lift raises the blacks, gain scales the whites, gamma bends the middle.
    color = color * uGain + uLift * (1.0 - color);
    color = pow(max(color, vec3(0.0)), 1.0 / max(uGamma, vec3(0.01)));

    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    float shadows = 1.0 - smoothstep(0.0, 0.55, luma);
    float highlights = smoothstep(0.45, 1.0, luma);
    color *= mix(vec3(1.0), uShadowTint, shadows * uSplitToning);
    color *= mix(vec3(1.0), uHighlightTint, highlights * uSplitToning);

    luma = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luma), color, uSaturation);

    // An S-curve around the middle that leaves black, mid grey and white where they are.
    vec3 lowHalf = 0.5 * pow(max(2.0 * color, vec3(0.0)), vec3(uContrast));
    vec3 highHalf = 1.0 - 0.5 * pow(max(2.0 - 2.0 * color, vec3(0.0)), vec3(uContrast));
    color = mix(lowHalf, highHalf, step(vec3(0.5), color));
  #endif

  #ifdef GRAIN
    float grain = grainNoise(gl_FragCoord.xy, fract(uTime * 7.31)) + grainNoise(gl_FragCoord.xy + 17.0, fract(uTime * 3.17)) - 1.0;
    float body = dot(color, vec3(0.299, 0.587, 0.114));
    color += grain * uGrain * (1.0 - 0.6 * body);
  #endif

  color = clamp(color * uFade, 0.0, 1.0);
  gl_FragColor = vec4(color, dot(color, vec3(0.299, 0.587, 0.114)));
}
`;

/**
 * Creates the tone mapping and grading stage.
 * @param {ReturnType<import('./fullscreenPass.js').createFullscreenDrawer>} drawer The shared fullscreen drawer.
 * @returns {{
 *   uniforms: Record<string, {value: any}>,
 *   setFeatures: (features: {bloom: boolean, grade: boolean, grain: boolean}) => void,
 *   render: (scene: THREE.Texture, bloom: THREE.Texture | null, target: THREE.WebGLRenderTarget | null) => void,
 *   dispose: () => void,
 * }}
 */
export function createFinalGradePass(drawer) {
  const uniforms = {
    tScene: { value: null },
    tBloom: { value: null },
    uBloom: { value: 0.1 },
    uExposure: { value: 1 },
    uLift: { value: new THREE.Vector3(0, 0, 0) },
    uGamma: { value: new THREE.Vector3(1, 1, 1) },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uSaturation: { value: 1 },
    uContrast: { value: 1 },
    uShadowTint: { value: new THREE.Vector3(1, 1, 1) },
    uHighlightTint: { value: new THREE.Vector3(1, 1, 1) },
    uSplitToning: { value: 0 },
    uVignette: { value: 0.22 },
    uGrain: { value: 0.022 },
    uAspect: { value: 16 / 9 },
    uTime: { value: 0 },
    uFade: { value: 1 },
  };
  const material = drawer.createMaterial('marazul-final-grade', GRADE_FRAGMENT_SHADER, uniforms, {
    BLOOM: 1,
    GRADE: 1,
    GRAIN: 1,
  });

  /** Switches bloom compositing, grading and grain; recompiles only when one changes. */
  function setFeatures(features) {
    let changed = false;
    for (const [define, enabled] of [
      ['BLOOM', features.bloom],
      ['GRADE', features.grade],
      ['GRAIN', features.grain],
    ]) {
      const has = material.defines[define] !== undefined;
      if (enabled && !has) {
        material.defines[define] = 1;
        changed = true;
      } else if (!enabled && has) {
        delete material.defines[define];
        changed = true;
      }
    }
    if (changed) material.needsUpdate = true;
  }

  /**
   * Draws the graded picture.
   * @param {THREE.Texture} scene The HDR image after the atmosphere stages.
   * @param {THREE.Texture | null} bloom The bloom texture, or null when bloom is off.
   * @param {THREE.WebGLRenderTarget | null} target Where to draw (null is the canvas).
   */
  function render(scene, bloom, target) {
    uniforms.tScene.value = scene;
    uniforms.tBloom.value = bloom;
    drawer.draw(material, target);
  }

  function dispose() {
    material.dispose();
  }

  return { uniforms, setFeatures, render, dispose };
}
