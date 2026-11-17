// The hand-tuned looks of a MARAZUL day and the interpolation between them. Pure data and
// arithmetic, no three.js. A look is everything the image needs that a physical model does not give
// for free: the colour and strength of the key light, the fill, the colours the horizon and the
// haze take, the exposure and the grade. The keyframes are placed on the clock of
// celestialPositions.js (sunrise 06:30, sunset 19:30).
//
//   const look = createAtmosphereLook();
//   sampleAtmosphereLook(18.8, look);     // golden hour, written into `look`, no allocation
//
// Colours are linear RGB triples; where noted they are radiances above 1 (HDR).

/**
 * @typedef {Object} AtmosphereLook
 * @property {number[]} sunColor Colour of the sun's light on surfaces (peak channel 1).
 * @property {number} sunIntensity Directional-light intensity of the sun (three.js units).
 * @property {number} moonIntensity Directional-light intensity of the moon when it is the key.
 * @property {number} skyIntensity Scale of the scattered sky radiance.
 * @property {number[]} zenithTint Multiplier on the scattered sky colour above the horizon band.
 * @property {number[]} horizonColor Sky and haze radiance at the horizon away from the sun (HDR).
 * @property {number[]} horizonSunColor Sky and haze radiance at the horizon below the sun (HDR).
 * @property {number} horizonHeight How far the horizon band reaches up the sky (0.05 thin to 0.5 wide).
 * @property {number} mie Amount of forward-scattering glow around the sun (haze in the air).
 * @property {number} sunDisc Brightness of the visible sun disc (0 hides it).
 * @property {number} hazeDensity Extinction of the ground haze per metre at sea level.
 * @property {number} hazeHeight Scale height of the ground haze in metres.
 * @property {number[]} ambientSky Hemisphere fill from above.
 * @property {number[]} ambientGround Hemisphere fill from below (bounce off streets and sand).
 * @property {number} ambientIntensity Strength of the hemisphere fill.
 * @property {number} envIntensity Strength of image-based lighting from the sky environment map.
 * @property {number} exposure Linear exposure applied before tone mapping.
 * @property {number} bloom Strength of the bloom added back to the image.
 * @property {number[]} gradeLift Added to the shadows after tone mapping (per channel, around 0).
 * @property {number[]} gradeGamma Mid-tone power per channel (1 is neutral, above 1 brightens).
 * @property {number[]} gradeGain Multiplier on the highlights per channel.
 * @property {number} saturation 1 is neutral.
 * @property {number} contrast 1 is neutral; pivots on mid grey.
 * @property {number[]} shadowTint Split toning: the colour the dark tones lean to.
 * @property {number[]} highlightTint Split toning: the colour the bright tones lean to.
 * @property {number} splitToning Strength of the split toning, 0 to 1.
 * @property {number} stars Visibility of stars and the moon's glow, 0 to 1.
 * @property {number} heatHaze Strength of the shimmer over hot ground, 0 to 1.
 * @property {number} sunShafts Strength of the light shafts around the sun, 0 to 1.
 * @property {number} shadowSoftness Penumbra scale of the sun shadows (1 is crisp noon).
 * @property {number} cityGlow Warm light pollution above the night horizon, 0 to 1.
 */

/** The names of the numeric fields and of the colour fields of a look, in a fixed order. */
export const LOOK_SCALAR_FIELDS = Object.freeze([
  'sunIntensity', 'moonIntensity', 'skyIntensity', 'horizonHeight', 'mie', 'sunDisc', 'hazeDensity',
  'hazeHeight', 'ambientIntensity', 'envIntensity', 'exposure', 'bloom', 'saturation', 'contrast',
  'splitToning', 'stars', 'heatHaze', 'sunShafts', 'shadowSoftness', 'cityGlow',
]);
export const LOOK_COLOR_FIELDS = Object.freeze([
  'sunColor', 'zenithTint', 'horizonColor', 'horizonSunColor', 'ambientSky', 'ambientGround',
  'gradeLift', 'gradeGamma', 'gradeGain', 'shadowTint', 'highlightTint',
]);

/**
 * Writes the look of a clock time into `out`, interpolating the two neighbouring keyframes.
 * @param {number} hours Time of day, 0 to 24 (values outside wrap around).
 * @param {AtmosphereLook} out A look made by createAtmosphereLook(); it is overwritten.
 * @returns {AtmosphereLook} `out`.
 */
export function sampleAtmosphereLook(hours, out) {
  const time = ((hours % 24) + 24) % 24;
  const count = LOOK_KEYFRAMES.length;
  let upper = 0;
  while (upper < count && LOOK_KEYFRAMES[upper].hour <= time) upper += 1;
  const from = LOOK_KEYFRAMES[(upper - 1 + count) % count];
  const to = LOOK_KEYFRAMES[upper % count];
  let span = to.hour - from.hour;
  if (span <= 0) span += 24;
  let elapsed = time - from.hour;
  if (elapsed < 0) elapsed += 24;
  const linear = span > 1e-6 ? elapsed / span : 0;
  // Ease in and out of each keyframe so that no channel changes slope abruptly at a key.
  const blend = linear * linear * (3 - 2 * linear);
  return blendAtmosphereLooks(from.look, to.look, blend, out);
}

/**
 * Writes the blend of two looks into `out` (which may be either of them).
 * @param {AtmosphereLook} a The look at blend 0.
 * @param {AtmosphereLook} b The look at blend 1.
 * @param {number} blend 0 to 1.
 * @param {AtmosphereLook} out Receives the result.
 * @returns {AtmosphereLook} `out`.
 */
export function blendAtmosphereLooks(a, b, blend, out) {
  for (let i = 0; i < LOOK_SCALAR_FIELDS.length; i += 1) {
    const field = LOOK_SCALAR_FIELDS[i];
    out[field] = a[field] + (b[field] - a[field]) * blend;
  }
  for (let i = 0; i < LOOK_COLOR_FIELDS.length; i += 1) {
    const field = LOOK_COLOR_FIELDS[i];
    const ca = a[field];
    const cb = b[field];
    const co = out[field];
    co[0] = ca[0] + (cb[0] - ca[0]) * blend;
    co[1] = ca[1] + (cb[1] - ca[1]) * blend;
    co[2] = ca[2] + (cb[2] - ca[2]) * blend;
  }
  return out;
}

/**
 * Makes a look object to pass to sampleAtmosphereLook(); it starts as the noon look.
 * @returns {AtmosphereLook}
 */
export function createAtmosphereLook() {
  return cloneLook(NOON);
}

/**
 * The name of the keyframe nearest to a clock time, for debug overlays and previews.
 * @param {number} hours Time of day, 0 to 24.
 * @returns {string}
 */
export function nearestLookName(hours) {
  const time = ((hours % 24) + 24) % 24;
  let best = LOOK_KEYFRAMES[0];
  let bestDistance = Infinity;
  for (const keyframe of LOOK_KEYFRAMES) {
    const direct = Math.abs(keyframe.hour - time);
    const distance = Math.min(direct, 24 - direct);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = keyframe;
    }
  }
  return best.name;
}

function cloneLook(look) {
  const copy = {};
  for (const field of LOOK_SCALAR_FIELDS) copy[field] = look[field];
  for (const field of LOOK_COLOR_FIELDS) copy[field] = [look[field][0], look[field][1], look[field][2]];
  return copy;
}

/** Builds a keyframe look from a base look and the fields that differ. */
function derive(base, changes) {
  const look = cloneLook(base);
  for (const field of Object.keys(changes)) {
    if (!(field in look)) throw new Error(`unknown look field: ${field}`);
    look[field] = Array.isArray(changes[field]) ? changes[field].slice() : changes[field];
  }
  return look;
}

// ---------------------------------------------------------------------------------------------
// The keyframes. Each is described as a lighting cameraman would: where the key comes from, what
// fills the shadows, what the air does.
// ---------------------------------------------------------------------------------------------

// 13:00. The sun nearly overhead, white and hard; a deep blue zenith over a pale, bright horizon;
// short dense shadows filled with blue sky and warm bounce from pale concrete.
const NOON = {
  sunColor: [1.0, 0.955, 0.88],
  sunIntensity: 4.4,
  moonIntensity: 0,
  skyIntensity: 0.62,
  zenithTint: [0.72, 0.92, 1.1],
  horizonColor: [0.5, 0.67, 0.86],
  horizonSunColor: [0.56, 0.7, 0.86],
  horizonHeight: 0.16,
  mie: 0.5,
  sunDisc: 1.0,
  hazeDensity: 0.00034,
  hazeHeight: 260,
  ambientSky: [0.58, 0.74, 1.0],
  ambientGround: [0.62, 0.55, 0.45],
  ambientIntensity: 0.42,
  envIntensity: 1.0,
  exposure: 0.9,
  bloom: 0.2,
  gradeLift: [0.0, 0.0, 0.0],
  gradeGamma: [1.0, 1.0, 1.0],
  gradeGain: [1.0, 1.0, 1.0],
  saturation: 1.06,
  contrast: 1.04,
  shadowTint: [0.9, 0.98, 1.08],
  highlightTint: [1.06, 1.0, 0.92],
  splitToning: 0.2,
  stars: 0,
  heatHaze: 1.0,
  sunShafts: 0.25,
  shadowSoftness: 1.0,
  cityGlow: 0,
};

// 09:00. A clear, slightly cool morning: the sun at 30 degrees, cream white, long clean shadows,
// little haze yet.
const MORNING = derive(NOON, {
  sunColor: [1.0, 0.9, 0.76],
  sunIntensity: 3.9,
  skyIntensity: 0.68,
  zenithTint: [0.78, 0.93, 1.1],
  horizonColor: [0.56, 0.69, 0.85],
  horizonSunColor: [0.95, 0.84, 0.7],
  horizonHeight: 0.2,
  mie: 0.65,
  hazeDensity: 0.0004,
  ambientIntensity: 0.4,
  exposure: 0.9,
  heatHaze: 0.2,
  sunShafts: 0.45,
  shadowSoftness: 1.3,
  highlightTint: [1.07, 1.0, 0.9],
});

// 16:30. Afternoon: the light starts to turn, the haze over the water thickens.
const AFTERNOON = derive(NOON, {
  sunColor: [1.0, 0.89, 0.72],
  sunIntensity: 4.0,
  skyIntensity: 0.7,
  zenithTint: [0.8, 0.92, 1.1],
  horizonColor: [0.58, 0.67, 0.8],
  horizonSunColor: [1.05, 0.86, 0.66],
  horizonHeight: 0.2,
  mie: 0.75,
  bloom: 0.24,
  hazeDensity: 0.00046,
  exposure: 0.88,
  heatHaze: 0.7,
  sunShafts: 0.5,
  shadowSoftness: 1.3,
  highlightTint: [1.08, 1.0, 0.88],
  splitToning: 0.26,
});

// 18:50, the signature. The sun 9 degrees up: amber key raking along the avenues, long soft
// shadows, cool blue-violet fill from the opposite sky, a glowing peach band of haze below the sun.
const GOLDEN_HOUR = derive(NOON, {
  sunColor: [1.0, 0.66, 0.36],
  sunIntensity: 4.2,
  skyIntensity: 0.9,
  zenithTint: [1.05, 0.86, 1.1],
  horizonColor: [0.48, 0.5, 0.62],
  horizonSunColor: [1.7, 0.74, 0.25],
  horizonHeight: 0.2,
  mie: 0.65,
  sunDisc: 0.9,
  hazeDensity: 0.0005,
  hazeHeight: 300,
  ambientSky: [0.5, 0.62, 0.98],
  ambientGround: [0.74, 0.5, 0.34],
  ambientIntensity: 0.34,
  envIntensity: 1.05,
  exposure: 1.0,
  bloom: 0.42,
  gradeGamma: [1.0, 1.0, 1.01],
  gradeGain: [1.02, 1.0, 0.97],
  saturation: 1.14,
  contrast: 1.08,
  shadowTint: [0.86, 0.98, 1.12],
  highlightTint: [1.12, 1.0, 0.82],
  splitToning: 0.36,
  heatHaze: 0.25,
  sunShafts: 1.0,
  shadowSoftness: 2.0,
});

// 19:28. The sun on the horizon: deep orange, weak; the sky does most of the lighting.
const SUNSET = derive(GOLDEN_HOUR, {
  sunColor: [1.0, 0.46, 0.2],
  sunIntensity: 1.5,
  skyIntensity: 0.7,
  zenithTint: [1.0, 0.84, 1.14],
  horizonColor: [0.4, 0.34, 0.5],
  horizonSunColor: [1.9, 0.62, 0.2],
  horizonHeight: 0.2,
  mie: 1.1,
  sunDisc: 0.75,
  hazeDensity: 0.00066,
  ambientSky: [0.46, 0.52, 0.9],
  ambientGround: [0.7, 0.44, 0.34],
  ambientIntensity: 0.3,
  exposure: 1.34,
  bloom: 0.36,
  splitToning: 0.4,
  heatHaze: 0,
  sunShafts: 0.9,
  shadowSoftness: 2.6,
  cityGlow: 0.15,
});

// 19:50. Dusk: no sun; an orange-red ember band in the west under a violet-to-blue dome. The
// street lamps come on against it.
const DUSK = derive(SUNSET, {
  sunColor: [1.0, 0.4, 0.2],
  sunIntensity: 0,
  skyIntensity: 0.34,
  zenithTint: [0.9, 0.82, 1.2],
  horizonColor: [0.2, 0.18, 0.3],
  horizonSunColor: [1.1, 0.36, 0.13],
  horizonHeight: 0.16,
  mie: 1.0,
  sunDisc: 0,
  hazeDensity: 0.00056,
  ambientSky: [0.4, 0.44, 0.86],
  ambientGround: [0.5, 0.36, 0.36],
  ambientIntensity: 0.22,
  envIntensity: 1.1,
  exposure: 1.9,
  bloom: 0.4,
  saturation: 1.1,
  shadowTint: [0.82, 0.94, 1.2],
  highlightTint: [1.1, 0.98, 0.86],
  splitToning: 0.4,
  stars: 0.12,
  sunShafts: 0,
  cityGlow: 0.5,
});

// 20:15. Blue hour: everything bathed in deep blue, a last smear of rose at the horizon, neon and
// windows carrying the picture.
const BLUE_HOUR = derive(DUSK, {
  skyIntensity: 0.16,
  zenithTint: [0.62, 0.8, 1.3],
  horizonColor: [0.05, 0.07, 0.17],
  horizonSunColor: [0.3, 0.13, 0.15],
  horizonHeight: 0.16,
  mie: 0.6,
  hazeDensity: 0.00046,
  moonIntensity: 0.1,
  ambientSky: [0.24, 0.34, 0.8],
  ambientGround: [0.3, 0.24, 0.3],
  ambientIntensity: 0.1,
  envIntensity: 1.15,
  exposure: 2.7,
  bloom: 0.45,
  saturation: 1.12,
  shadowTint: [0.8, 0.94, 1.22],
  highlightTint: [1.08, 0.98, 0.9],
  splitToning: 0.42,
  stars: 0.55,
  cityGlow: 0.85,
});

// 21:00 to 05:15. Night: a cool moon key, a faint blue fill so that nothing is pure black, the
// horizon stained warm by the city, and room in the exposure for lamps and neon to bloom.
const NIGHT = derive(BLUE_HOUR, {
  sunColor: [0.62, 0.74, 1.0],
  skyIntensity: 0.035,
  zenithTint: [0.7, 0.85, 1.2],
  horizonColor: [0.022, 0.024, 0.04],
  horizonSunColor: [0.026, 0.026, 0.04],
  horizonHeight: 0.14,
  mie: 0.4,
  hazeDensity: 0.00038,
  hazeHeight: 220,
  moonIntensity: 0.2,
  ambientSky: [0.2, 0.28, 0.6],
  ambientGround: [0.3, 0.24, 0.2],
  ambientIntensity: 0.05,
  envIntensity: 1.0,
  exposure: 3.8,
  bloom: 0.5,
  saturation: 1.12,
  contrast: 1.06,
  gradeGain: [0.98, 1.0, 1.03],
  shadowTint: [0.8, 0.96, 1.22],
  highlightTint: [1.08, 1.0, 0.9],
  splitToning: 0.4,
  stars: 1,
  shadowSoftness: 2.2,
  cityGlow: 1,
});

// 06:00. First light: the mirror of blue hour, cleaner and pinker, with mist over the water.
const FIRST_LIGHT = derive(BLUE_HOUR, {
  skyIntensity: 0.16,
  horizonColor: [0.09, 0.1, 0.18],
  horizonSunColor: [0.42, 0.2, 0.2],
  hazeDensity: 0.0007,
  hazeHeight: 160,
  moonIntensity: 0.05,
  exposure: 3.2,
  stars: 0.4,
  cityGlow: 0.6,
});

// 06:32. Dawn: a rose and apricot horizon in the east, the sun just clearing it; cool, damp air.
const DAWN = derive(SUNSET, {
  sunColor: [1.0, 0.52, 0.3],
  sunIntensity: 1.2,
  skyIntensity: 0.62,
  zenithTint: [1.0, 0.86, 1.12],
  horizonColor: [0.4, 0.4, 0.54],
  horizonSunColor: [1.6, 0.7, 0.42],
  mie: 1.0,
  hazeDensity: 0.0008,
  hazeHeight: 170,
  ambientSky: [0.5, 0.56, 0.9],
  ambientGround: [0.6, 0.46, 0.42],
  exposure: 1.45,
  highlightTint: [1.1, 0.98, 0.9],
  shadowTint: [0.86, 0.95, 1.14],
  splitToning: 0.34,
  cityGlow: 0.1,
});

// 07:10. Early morning: the low sun already yellow-white, mist burning off, long cool shadows.
const SUNRISE_GOLD = derive(GOLDEN_HOUR, {
  sunColor: [1.0, 0.74, 0.48],
  sunIntensity: 3.0,
  horizonColor: [0.52, 0.56, 0.68],
  horizonSunColor: [1.7, 0.98, 0.5],
  hazeDensity: 0.00074,
  hazeHeight: 200,
  ambientGround: [0.66, 0.52, 0.4],
  exposure: 1.1,
  highlightTint: [1.09, 1.0, 0.87],
  shadowTint: [0.86, 0.96, 1.13],
  splitToning: 0.3,
  heatHaze: 0,
});

/**
 * The keyframes in clock order. `hour` is where a look is fully in force; between two keyframes
 * the looks blend. Exported for the tests and the preview pages.
 * @type {ReadonlyArray<{name: string, hour: number, look: AtmosphereLook}>}
 */
export const LOOK_KEYFRAMES = Object.freeze([
  { name: 'night', hour: 0, look: NIGHT },
  { name: 'night', hour: 5.25, look: NIGHT },
  { name: 'first light', hour: 6.0, look: FIRST_LIGHT },
  { name: 'dawn', hour: 6.55, look: DAWN },
  { name: 'sunrise gold', hour: 7.15, look: SUNRISE_GOLD },
  { name: 'morning', hour: 9.0, look: MORNING },
  { name: 'noon', hour: 13.0, look: NOON },
  { name: 'afternoon', hour: 16.5, look: AFTERNOON },
  { name: 'golden hour', hour: 18.85, look: GOLDEN_HOUR },
  { name: 'sunset', hour: 19.47, look: SUNSET },
  { name: 'dusk', hour: 19.85, look: DUSK },
  { name: 'blue hour', hour: 20.25, look: BLUE_HOUR },
  { name: 'night', hour: 21.0, look: NIGHT },
]);
