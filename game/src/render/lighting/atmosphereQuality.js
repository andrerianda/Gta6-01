// The quality levels of the atmosphere and image pipeline: what each level switches on, and the
// detection of software rendering. A level is a complete set of switches; the facade's
// setQuality() accepts a level name, or a level name plus individual overrides.
//
// Frame-time budget of the post-processing chain on a mid-range desktop GPU at 1920x1080:
//   low     about 1.3 ms   (haze, bloom with 4 levels, grade, anti-aliasing)
//   medium  about 2.4 ms   (+ ambient occlusion 8 samples, sun shafts, lens flare)
//   high    about 2.9 ms   (+ occlusion 12 samples, bloom 6 levels, heat shimmer, grain;
//                            motion blur +0.5 ms at speed, depth of field +0.9 ms in cutscenes)
//   ultra   as high, with 4x multisampling of the scene and the largest shadow cascades

/**
 * @typedef {Object} AtmosphereQuality
 * @property {'off' | 'low' | 'medium' | 'high' | 'ultra'} shadows Sun shadow cascades (sunShadowRig.js).
 * @property {'low' | 'medium' | 'high' | 'ultra'} localLights Real-light budget (localLightBudget.js).
 * @property {number} environmentSize Edge of the sky environment cube in texels.
 * @property {boolean} ambientOcclusion
 * @property {number} ambientOcclusionSamples
 * @property {boolean} bloom
 * @property {number} bloomLevels
 * @property {boolean} sunShafts
 * @property {boolean} heatHaze
 * @property {boolean} depthOfField
 * @property {boolean} motionBlur
 * @property {boolean} lensFlare
 * @property {boolean} grade
 * @property {boolean} grain
 * @property {boolean} antialias
 * @property {number} antialiasSteps
 * @property {number} msaa
 * @property {number} renderScale
 * @property {number} rainDrops Rain streaks at full intensity.
 */

/** @type {Readonly<Record<'low' | 'medium' | 'high' | 'ultra', Readonly<AtmosphereQuality>>>} */
export const ATMOSPHERE_QUALITY = Object.freeze({
  low: Object.freeze({
    shadows: 'low', localLights: 'low', environmentSize: 64,
    ambientOcclusion: false, ambientOcclusionSamples: 8, bloom: true, bloomLevels: 4,
    sunShafts: false, heatHaze: false, depthOfField: false, motionBlur: false, lensFlare: false,
    grade: true, grain: false, antialias: true, antialiasSteps: 4, msaa: 0, renderScale: 1,
    rainDrops: 1500,
  }),
  medium: Object.freeze({
    shadows: 'medium', localLights: 'medium', environmentSize: 64,
    ambientOcclusion: true, ambientOcclusionSamples: 8, bloom: true, bloomLevels: 5,
    sunShafts: true, heatHaze: false, depthOfField: true, motionBlur: false, lensFlare: true,
    grade: true, grain: true, antialias: true, antialiasSteps: 8, msaa: 0, renderScale: 1,
    rainDrops: 2500,
  }),
  high: Object.freeze({
    shadows: 'high', localLights: 'high', environmentSize: 128,
    ambientOcclusion: true, ambientOcclusionSamples: 12, bloom: true, bloomLevels: 6,
    sunShafts: true, heatHaze: true, depthOfField: true, motionBlur: true, lensFlare: true,
    grade: true, grain: true, antialias: true, antialiasSteps: 8, msaa: 0, renderScale: 1,
    rainDrops: 4000,
  }),
  ultra: Object.freeze({
    shadows: 'ultra', localLights: 'ultra', environmentSize: 128,
    ambientOcclusion: true, ambientOcclusionSamples: 12, bloom: true, bloomLevels: 6,
    sunShafts: true, heatHaze: true, depthOfField: true, motionBlur: true, lensFlare: true,
    grade: true, grain: true, antialias: true, antialiasSteps: 10, msaa: 4, renderScale: 1,
    rainDrops: 6000,
  }),
});

/**
 * Resolves a quality request into a full set of switches.
 * @param {string | (Partial<AtmosphereQuality> & {level?: string})} request A level name, or an
 *   object with an optional `level` and any switches to override.
 * @param {AtmosphereQuality} [out] Receives the result; a new object when omitted.
 * @returns {AtmosphereQuality}
 */
export function resolveAtmosphereQuality(request, out = {}) {
  const level = typeof request === 'string' ? request : request?.level ?? 'high';
  const base = ATMOSPHERE_QUALITY[level] ?? ATMOSPHERE_QUALITY.high;
  Object.assign(out, base);
  if (request && typeof request === 'object') {
    for (const key of Object.keys(request)) {
      if (key in base) out[key] = request[key];
    }
  }
  return out;
}

/**
 * Tells whether WebGL is running on the CPU (SwiftShader, llvmpipe and the like), as it does in
 * the headless browser that takes the game's screenshots. Frames are slow there but every stage
 * still works; callers may want to hold the picture still while it renders.
 * @param {import('three').WebGLRenderer} renderer The game's renderer.
 * @returns {boolean}
 */
export function isSoftwareRenderer(renderer) {
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}
