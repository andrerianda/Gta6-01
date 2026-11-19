// The quality tiers of MARAZUL as one table every system reads: how far the city is drawn, how
// dense traffic and crowds are, how detailed textures are, and which level of the atmosphere and
// image pipeline is used. Systems read the current row from `context.quality` and react to the
// QUALITY_CHANGED event; nobody keeps private quality switches.
//
// Budgets behind the numbers (a 60 fps target on a mid-range desktop GPU at 1920x1080, tier
// 'high'): at most about 550 draw calls and 1.5 million triangles per frame, every pass included
// (the sun's shadow cascades, the view, the image pipeline), 48 simulated vehicles, 80
// pedestrians; 'medium' about 350 and 0.9 million, 'low' about 220 and 0.5 million. Measured
// with the performance overlay (F3) and MARAZUL.profile(); docs/ARCHITECTURE.md section 11 has
// the split per system and the measurements. The sun's shadow passes were the largest single cost
// (more than half the draw calls at 'high' with three cascades), so 'high' draws two cascades.
// 'cinematic' is for the screenshots only and keeps everything.

/**
 * @typedef {Object} QualityTier One row of the table.
 * @property {string} name The tier's name.
 * @property {string} label The name shown in the settings menu.
 * @property {string | Object} atmosphere The level handed to atmosphere.setQuality(): a level
 *   name or { level, ...switches } (render/lighting/atmosphereQuality.js).
 * @property {number} pixelRatioCap The device pixel ratio is clamped to this.
 * @property {number} pixelRatioFloor The backing store is at least this many pixels per CSS
 *   pixel, whatever the device ratio (supersampling): 1, and 2 in 'cinematic'.
 * @property {number} minRenderScale Dynamic resolution never goes below this fraction.
 * @property {boolean} dynamicResolution Whether the render scale follows the frame time.
 * @property {number} drawDistance Metres to the far edge of full city detail (buildings, props);
 *   vehicles, people and props beyond it are hidden or drawn as far versions.
 * @property {number} shadowCasterDistance Metres from the camera within which a system's objects
 *   cast sun shadows (castShadow true); beyond it only buildings do, through their far versions
 *   if at all. 0 on tiers without sun shadows.
 * @property {number} streamRadius Metres around the focus in which city sectors are active.
 * @property {number} lodBias Multiplies every level-of-detail switch distance.
 * @property {number} propDensity 0..1 share of street furniture and clutter that is placed.
 * @property {number} vegetationDensity 0..1 share of plants that is placed.
 * @property {number} textureDetail Scale on generated texture resolutions (1 full, 0.5 half).
 * @property {number} anisotropy Largest anisotropic filtering asked for.
 * @property {number} maxVehicles Simulated vehicles alive at once (traffic, parked, police).
 * @property {number} trafficDensity 0..1 scale on how many of them are ambient traffic.
 * @property {number} maxPedestrians Pedestrians alive at once.
 * @property {number} pedestrianDensity 0..1 scale on crowd spawning.
 * @property {number} maxParticles Live particles across all effects.
 * @property {number} maxDecals Live decals (skid marks, bullet holes, scorch marks).
 * @property {number} cityLightRange Metres within which street lamps register real lights.
 * @property {number} audioVoices Sounds mixed at once.
 */

/** The settings table. @type {Readonly<Record<string, Readonly<QualityTier>>>} */
export const QUALITY_TIERS = Object.freeze({
  low: tier({
    // One small shadow cascade still draws every caster in a long column toward the sun (the
    // cascades reach 950 m toward the light): the weakest machines get no sun shadows.
    name: 'low', label: 'Low', atmosphere: Object.freeze({ level: 'low', shadows: 'off' }),
    pixelRatioCap: 1, pixelRatioFloor: 1, minRenderScale: 0.6, dynamicResolution: true,
    drawDistance: 320, shadowCasterDistance: 0, streamRadius: 280, lodBias: 0.55,
    propDensity: 0.4, vegetationDensity: 0.4, textureDetail: 0.5, anisotropy: 2,
    maxVehicles: 24, trafficDensity: 0.5, maxPedestrians: 32, pedestrianDensity: 0.45,
    maxParticles: 300, maxDecals: 40, cityLightRange: 80, audioVoices: 16,
  }),
  medium: tier({
    name: 'medium', label: 'Medium', atmosphere: Object.freeze({ level: 'medium', shadows: 'low' }),
    pixelRatioCap: 1, pixelRatioFloor: 1, minRenderScale: 0.7, dynamicResolution: true,
    drawDistance: 480, shadowCasterDistance: 45, streamRadius: 360, lodBias: 0.7,
    propDensity: 0.65, vegetationDensity: 0.65, textureDetail: 0.75, anisotropy: 4,
    maxVehicles: 36, trafficDensity: 0.7, maxPedestrians: 56, pedestrianDensity: 0.65,
    maxParticles: 700, maxDecals: 80, cityLightRange: 120, audioVoices: 24,
  }),
  high: tier({
    // Two sun cascades (21 m and 96 m) instead of three: the 230 m cascade alone cost about half
    // of every frame's draw calls on Gran Via Marazul.
    name: 'high', label: 'High', atmosphere: Object.freeze({ level: 'high', shadows: 'medium' }),
    pixelRatioCap: 1.5, pixelRatioFloor: 1, minRenderScale: 0.75, dynamicResolution: true,
    drawDistance: 650, shadowCasterDistance: 90, streamRadius: 440, lodBias: 0.85,
    propDensity: 0.9, vegetationDensity: 0.9, textureDetail: 1, anisotropy: 8,
    maxVehicles: 48, trafficDensity: 0.85, maxPedestrians: 80, pedestrianDensity: 0.85,
    maxParticles: 1200, maxDecals: 140, cityLightRange: 160, audioVoices: 32,
  }),
  ultra: tier({
    name: 'ultra', label: 'Ultra', atmosphere: 'ultra',
    pixelRatioCap: 2, pixelRatioFloor: 1, minRenderScale: 0.85, dynamicResolution: true,
    drawDistance: 1400, shadowCasterDistance: 250, streamRadius: 640, lodBias: 1.35,
    propDensity: 1, vegetationDensity: 1, textureDetail: 1, anisotropy: 16,
    maxVehicles: 72, trafficDensity: 1.15, maxPedestrians: 160, pedestrianDensity: 1.2,
    maxParticles: 2400, maxDecals: 240, cityLightRange: 240, audioVoices: 40,
  }),
  cinematic: tier({
    // The judged pictures (owner 13:10): a 2x backing store even at device pixel ratio 1 (the
    // canvas keeps its CSS size, so a 1280x800 capture is supersampled by the game itself), the
    // largest shadow maps redrawn every frame, full anisotropy, the farthest LOD switches, no
    // dynamic resolution.
    name: 'cinematic', label: 'Cinematic (screenshots)',
    atmosphere: Object.freeze({ level: 'ultra', shadows: 'cinematic' }),
    pixelRatioCap: 2, pixelRatioFloor: 2, minRenderScale: 1, dynamicResolution: false,
    drawDistance: 2200, shadowCasterDistance: 640, streamRadius: 900, lodBias: 2.2,
    propDensity: 1, vegetationDensity: 1, textureDetail: 1, anisotropy: 16,
    maxVehicles: 80, trafficDensity: 1.3, maxPedestrians: 200, pedestrianDensity: 1.4,
    maxParticles: 3200, maxDecals: 320, cityLightRange: 320, audioVoices: 40,
  }),
});

/** The tier names from cheapest to dearest. 'cinematic' is for screenshots, not for play. */
export const QUALITY_TIER_NAMES = Object.freeze(['low', 'medium', 'high', 'ultra', 'cinematic']);

/**
 * The table row of a tier.
 * @param {string} name A tier name; anything else gives 'high'.
 * @returns {Readonly<QualityTier>}
 */
export function qualityTierOf(name) {
  return QUALITY_TIERS[name] ?? QUALITY_TIERS.high;
}

/**
 * Tells whether a string names a tier.
 * @param {unknown} name The candidate.
 * @returns {boolean}
 */
export function isQualityTierName(name) {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(QUALITY_TIERS, name);
}

/**
 * The renderer's pixel ratio: the device ratio clamped to the tier's cap, but never under its
 * floor (the cinematic tier renders 2x even on a ratio-1 screen).
 * @param {number} devicePixelRatio The browser's devicePixelRatio.
 * @param {number} cap The tier's pixelRatioCap.
 * @param {number} [floor] The tier's pixelRatioFloor; default 1.
 * @returns {number}
 */
export function pixelRatioFor(devicePixelRatio, cap, floor = 1) {
  const device = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.max(floor > 0 ? floor : 1, Math.min(device, cap));
}

/**
 * Lowers a pixel ratio so the drawing buffer fits the GPU's limits (the largest texture,
 * renderbuffer and viewport side), never below 1. A 1280x800 canvas at ratio 2 is 2560x1600,
 * far inside any WebGL2 limit (at least 2048, usually 8192 or more); a 4K window is not.
 * @param {number} ratio The wanted pixel ratio.
 * @param {number} width Canvas width in CSS pixels.
 * @param {number} height Canvas height in CSS pixels.
 * @param {number} limit The largest buffer side in pixels the GPU allows.
 * @returns {number}
 */
export function pixelRatioWithinLimit(ratio, width, height, limit) {
  if (!(limit > 0)) return ratio;
  const side = Math.max(1, width, height);
  return Math.max(1, Math.min(ratio, Math.floor(limit) / side));
}

/**
 * How many drawing-buffer pixels cover one screen pixel side: 1 in ordinary play (the buffer
 * follows the screen, whatever its device ratio), 2 when the cinematic tier supersamples a ratio-1
 * screen. The image pipeline's bloom chain, grain and final resolve read it, so a supersampled
 * picture is the same picture with more detail, not one with half-size glows.
 * @param {number} pixelRatio The renderer's pixel ratio.
 * @param {number} devicePixelRatio The browser's devicePixelRatio.
 * @returns {number}
 */
export function supersampleFactorOf(pixelRatio, devicePixelRatio) {
  const device = Number.isFinite(devicePixelRatio) && devicePixelRatio > 1 ? devicePixelRatio : 1;
  const ratio = Number.isFinite(pixelRatio) ? pixelRatio / device : 1;
  return ratio > 1 ? ratio : 1;
}

function tier(fields) {
  return Object.freeze(fields);
}
