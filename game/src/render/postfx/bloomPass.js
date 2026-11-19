// Bloom: the glow of everything brighter than the film can hold (the sun on glass and chrome,
// lamps, neon, the sky between towers). The bright part of the image is filtered down a chain of
// ever smaller targets and added back up, which gives a wide, smooth glow for the price of a few
// small passes.
//
// Chain: half resolution down to 1/64 (six levels on high, four on low). The first level is
// taken with a brightness-weighted filter so that a single very bright pixel (a specular glint)
// cannot flicker as a blob. Cost on a mid-range GPU at 1080p: about 0.6 ms for six levels.

import * as THREE from 'three';

const DOWNSAMPLE_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tSource;
uniform vec2 uTexel;            // one texel of the source, in UV
uniform float uExposure;
uniform float uThreshold;
uniform float uKnee;

vec3 sampleSource(vec2 offset) {
  return texture2D(tSource, vUv + offset * uTexel).rgb;
}
float brightnessOf(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

#ifdef BLOOM_PREFILTER
vec3 bright(vec3 c) {
  c = min(c * uExposure, vec3(64.0));
  float level = max(c.r, max(c.g, c.b));
  float soft = clamp(level - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  return c * max(soft, level - uThreshold) / max(level, 1e-4);
}
#endif

void main() {
  // Thirteen taps: a centre box and four overlapping corner boxes, each tap a bilinear average.
  vec3 a = sampleSource(vec2(-2.0, -2.0));
  vec3 b = sampleSource(vec2(0.0, -2.0));
  vec3 c = sampleSource(vec2(2.0, -2.0));
  vec3 d = sampleSource(vec2(-2.0, 0.0));
  vec3 e = sampleSource(vec2(0.0, 0.0));
  vec3 f = sampleSource(vec2(2.0, 0.0));
  vec3 g = sampleSource(vec2(-2.0, 2.0));
  vec3 h = sampleSource(vec2(0.0, 2.0));
  vec3 i = sampleSource(vec2(2.0, 2.0));
  vec3 j = sampleSource(vec2(-1.0, -1.0));
  vec3 k = sampleSource(vec2(1.0, -1.0));
  vec3 l = sampleSource(vec2(-1.0, 1.0));
  vec3 m = sampleSource(vec2(1.0, 1.0));

  #ifdef BLOOM_PREFILTER
    // Weight each box by the inverse of its brightness, so that one hot pixel cannot dominate.
    vec3 box0 = bright((j + k + l + m) * 0.25);
    vec3 box1 = bright((a + b + d + e) * 0.25);
    vec3 box2 = bright((b + c + e + f) * 0.25);
    vec3 box3 = bright((d + e + g + h) * 0.25);
    vec3 box4 = bright((e + f + h + i) * 0.25);
    float w0 = 0.5 / (1.0 + brightnessOf(box0));
    float w1 = 0.125 / (1.0 + brightnessOf(box1));
    float w2 = 0.125 / (1.0 + brightnessOf(box2));
    float w3 = 0.125 / (1.0 + brightnessOf(box3));
    float w4 = 0.125 / (1.0 + brightnessOf(box4));
    vec3 color = (box0 * w0 + box1 * w1 + box2 * w2 + box3 * w3 + box4 * w4) / (w0 + w1 + w2 + w3 + w4);
  #else
    vec3 color = (j + k + l + m) * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + e * 0.125;
  #endif
  gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
}
`;

const UPSAMPLE_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tSource;
uniform vec2 uTexel;            // one texel of the (smaller) source, in UV
uniform float uWeight;

void main() {
  // A 3x3 tent: wide enough to hide the coarser grid of the level below.
  vec2 o = uTexel;
  vec3 color = texture2D(tSource, vUv).rgb * 4.0;
  color += (texture2D(tSource, vUv + vec2(o.x, 0.0)).rgb + texture2D(tSource, vUv - vec2(o.x, 0.0)).rgb +
            texture2D(tSource, vUv + vec2(0.0, o.y)).rgb + texture2D(tSource, vUv - vec2(0.0, o.y)).rgb) * 2.0;
  color += texture2D(tSource, vUv + o).rgb + texture2D(tSource, vUv - o).rgb +
           texture2D(tSource, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSource, vUv + vec2(-o.x, o.y)).rgb;
  gl_FragColor = vec4(color * (uWeight / 16.0), 1.0);
}
`;

const MAX_LEVELS = 6;

/**
 * Creates the bloom stage.
 * @param {ReturnType<import('./fullscreenPass.js').createFullscreenDrawer>} drawer The shared fullscreen drawer.
 * @returns {{
 *   texture: THREE.Texture,
 *   levels: number,
 *   setSize: (width: number, height: number, supersample?: number) => void,
 *   setLevels: (count: number) => void,
 *   render: (source: THREE.Texture, sourceWidth: number, sourceHeight: number, exposure: number, threshold: number) => void,
 *   dispose: () => void,
 * }} `texture` is the sum of all levels at half resolution; the grading stage divides it by
 *   `levels` when it adds the glow to the image.
 */
export function createBloomPass(drawer) {
  const targets = [];
  for (let i = 0; i < MAX_LEVELS; i += 1) targets.push(drawer.createTarget(2, 2, { hdr: true }));

  const downUniforms = () => ({
    tSource: { value: null },
    uTexel: { value: new Float32Array([1, 1]) },
    uExposure: { value: 1 },
    uThreshold: { value: 1 },
    uKnee: { value: 0.6 },
  });
  const prefilterMaterial = drawer.createMaterial('marazul-bloom-prefilter', DOWNSAMPLE_FRAGMENT_SHADER, downUniforms(), {
    BLOOM_PREFILTER: 1,
  });
  const downMaterial = drawer.createMaterial('marazul-bloom-down', DOWNSAMPLE_FRAGMENT_SHADER, downUniforms());
  const upMaterial = drawer.createMaterial('marazul-bloom-up', UPSAMPLE_FRAGMENT_SHADER, {
    tSource: { value: null },
    uTexel: { value: new Float32Array([1, 1]) },
    uWeight: { value: 1 },
  });
  // Each level is added onto the one above it.
  upMaterial.blending = THREE.CustomBlending;
  upMaterial.blendEquation = THREE.AddEquation;
  upMaterial.blendSrc = THREE.OneFactor;
  upMaterial.blendDst = THREE.OneFactor;
  upMaterial.transparent = true;

  const pass = { texture: targets[0].texture, levels: MAX_LEVELS, setSize, setLevels, render, dispose };

  // How many source texels apart the prefilter's taps lie: 1, or 2 on a supersampled frame.
  let prefilterStride = 1;

  /**
   * Sizes the chain for a full-resolution frame of the given pixel size.
   * @param {number} width Frame width in pixels.
   * @param {number} height Frame height in pixels.
   * @param {number} [supersample] Drawing-buffer pixels per CSS pixel (2 in the cinematic tier):
   *   the chain then starts one level smaller with a twice wider prefilter, so every level covers
   *   the same share of the screen and the glow keeps its size instead of halving.
   */
  function setSize(width, height, supersample = 1) {
    const shift = supersample >= 1.75 ? 2 : 1;
    prefilterStride = shift === 2 ? 2 : 1;
    let w = Math.max(1, width >> shift);
    let h = Math.max(1, height >> shift);
    for (let i = 0; i < MAX_LEVELS; i += 1) {
      targets[i].setSize(w, h);
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
    }
  }

  /** Sets how many levels the chain uses (2 to 6); fewer is cheaper and tighter. */
  function setLevels(count) {
    pass.levels = Math.max(2, Math.min(MAX_LEVELS, count));
  }

  /**
   * Computes the bloom of an HDR image.
   * @param {THREE.Texture} source The HDR scene colour.
   * @param {number} sourceWidth Its width in pixels.
   * @param {number} sourceHeight Its height in pixels.
   * @param {number} exposure The frame's exposure; brightness is judged after exposure.
   * @param {number} threshold Exposed brightness above which pixels glow.
   */
  function render(source, sourceWidth, sourceHeight, exposure, threshold) {
    const levels = pass.levels;
    let uniforms = prefilterMaterial.uniforms;
    uniforms.tSource.value = source;
    uniforms.uTexel.value[0] = prefilterStride / sourceWidth;
    uniforms.uTexel.value[1] = prefilterStride / sourceHeight;
    uniforms.uExposure.value = exposure;
    uniforms.uThreshold.value = threshold;
    drawer.draw(prefilterMaterial, targets[0]);

    uniforms = downMaterial.uniforms;
    for (let i = 1; i < levels; i += 1) {
      uniforms.tSource.value = targets[i - 1].texture;
      uniforms.uTexel.value[0] = 1 / targets[i - 1].width;
      uniforms.uTexel.value[1] = 1 / targets[i - 1].height;
      drawer.draw(downMaterial, targets[i]);
    }

    uniforms = upMaterial.uniforms;
    for (let i = levels - 1; i >= 1; i -= 1) {
      uniforms.tSource.value = targets[i].texture;
      uniforms.uTexel.value[0] = 1 / targets[i].width;
      uniforms.uTexel.value[1] = 1 / targets[i].height;
      uniforms.uWeight.value = 1;
      drawer.draw(upMaterial, targets[i - 1]);
    }
  }

  function dispose() {
    for (const target of targets) target.dispose();
    prefilterMaterial.dispose();
    downMaterial.dispose();
    upMaterial.dispose();
  }

  return pass;
}
