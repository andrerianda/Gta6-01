// The quality tiers of MARAZUL as one table every system reads: how far the city is drawn, how
// dense traffic and crowds are, how detailed textures are, and which level of the atmosphere and
// image pipeline is used. Systems read the current row from `context.quality` and react to the
// QUALITY_CHANGED event; nobody keeps private quality switches.
//
// Budgets behind the numbers (a 60 fps target on a mid-range desktop GPU at 1920x1080, tier
// 'high'): at most about 1200 draw calls and 2.5 million triangles in view, 60 simulated
// vehicles, 120 pedestrians. docs/ARCHITECTURE.md has the split per system.

/**
 * @typedef {Object} QualityTier One row of the table.
 * @property {string} name The tier's name.
 * @property {string} label The name shown in the settings menu.
 * @property {string | Object} atmosphere The level handed to atmosphere.setQuality(): a level
 *   name or { level, ...switches } (render/lighting/atmosphereQuality.js).
 * @property {number} pixelRatioCap The device pixel ratio is clamped to this.
 * @property {number} minRenderScale Dynamic resolution never goes below this fraction.
 * @property {boolean} dynamicResolution Whether the render scale follows the frame time.
 * @property {number} drawDistance Metres to the far edge of full city detail (buildings, props).
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
    name: 'low', label: 'Low', atmosphere: 'low',
    pixelRatioCap: 1, minRenderScale: 0.6, dynamicResolution: true,
    drawDistance: 450, streamRadius: 320, lodBias: 0.6,
    propDensity: 0.45, vegetationDensity: 0.4, textureDetail: 0.5, anisotropy: 2,
    maxVehicles: 28, trafficDensity: 0.55, maxPedestrians: 40, pedestrianDensity: 0.5,
    maxParticles: 400, maxDecals: 48, cityLightRange: 90, audioVoices: 16,
  }),
  medium: tier({
    name: 'medium', label: 'Medium', atmosphere: 'medium',
    pixelRatioCap: 1, minRenderScale: 0.7, dynamicResolution: true,
    drawDistance: 700, streamRadius: 420, lodBias: 0.8,
    propDensity: 0.7, vegetationDensity: 0.7, textureDetail: 0.75, anisotropy: 4,
    maxVehicles: 44, trafficDensity: 0.8, maxPedestrians: 80, pedestrianDensity: 0.75,
    maxParticles: 900, maxDecals: 96, cityLightRange: 140, audioVoices: 24,
  }),
  high: tier({
    name: 'high', label: 'High', atmosphere: 'high',
    pixelRatioCap: 1.5, minRenderScale: 0.75, dynamicResolution: true,
    drawDistance: 1000, streamRadius: 520, lodBias: 1,
    propDensity: 1, vegetationDensity: 1, textureDetail: 1, anisotropy: 8,
    maxVehicles: 60, trafficDensity: 1, maxPedestrians: 120, pedestrianDensity: 1,
    maxParticles: 1600, maxDecals: 160, cityLightRange: 180, audioVoices: 32,
  }),
  ultra: tier({
    name: 'ultra', label: 'Ultra', atmosphere: 'ultra',
    pixelRatioCap: 2, minRenderScale: 0.85, dynamicResolution: true,
    drawDistance: 1400, streamRadius: 640, lodBias: 1.35,
    propDensity: 1, vegetationDensity: 1, textureDetail: 1, anisotropy: 16,
    maxVehicles: 72, trafficDensity: 1.15, maxPedestrians: 160, pedestrianDensity: 1.2,
    maxParticles: 2400, maxDecals: 240, cityLightRange: 240, audioVoices: 40,
  }),
  cinematic: tier({
    name: 'cinematic', label: 'Cinematic (screenshots)', atmosphere: 'ultra',
    pixelRatioCap: 2, minRenderScale: 1, dynamicResolution: false,
    drawDistance: 2200, streamRadius: 900, lodBias: 2.2,
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

function tier(fields) {
  return Object.freeze(fields);
}
