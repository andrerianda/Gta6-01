// The effect catalogue: every effect the world can show, as data. PARTICLE_STYLES says how each
// kind of particle moves and looks (the fields are described in particlePool.js); EFFECT_RECIPES
// says what one EFFECT_SPAWN of an effect id makes: bursts of particles, a passing light through
// the atmosphere, a mark on the ground or a wall, a camera shake near the player, and for burning
// wrecks a sustained emitter that repeats a recipe for a while. Colours are linear; emission is
// HDR (a sunlit white wall is about 1.2 before exposure). Atlas cells are painted by
// effectTextures.js. Pure data; runs in Node.

/** Cells of the 4 x 4 particle atlas. */
export const PARTICLE_CELLS = Object.freeze({
  smoke: 0, // 0..3: four soft billowing puffs
  flame: 4, // 4..5: licking tongues of flame
  billow: 6, // a dense cauliflower cloud for fireballs
  glow: 7, // a soft radial glow
  spark: 8, // a hot round dot, stretched along the motion
  dust: 9, // a thin wispy cloud
  spray: 10, // a cluster of droplets
  chip: 11, // an irregular dark chip of debris
  star: 12, // a four-pointed muzzle flash
  mist: 13, // a fine speckled mist
  ring: 14, // a thin shock ring
  ember: 15, // a tiny glowing speck
});

/** Cells of the 2 x 2 decal atlas. */
export const DECAL_CELLS = Object.freeze({ scorch: 0, skid: 1, bulletHole: 2, blood: 3 });

const C = PARTICLE_CELLS;

/** @type {Record<string, import('./particlePool.js').ParticleStyle>} */
export const PARTICLE_STYLES = Object.freeze({
  engineSmoke: { frame: C.smoke, frames: 4, size: [0.5, 3.2], sizeCurve: 0.6, opacity: 0.45, fadeIn: 0.12, fadeOut: 0.6, albedo: [0.3, 0.3, 0.29], albedoEnd: [0.4, 0.4, 0.4], drag: 1.2, rise: 1.4, wind: 0.9 },
  fireSmoke: { frame: C.smoke, frames: 4, size: [1.0, 5.6], sizeCurve: 0.55, opacity: 0.85, fadeIn: 0.1, fadeOut: 0.55, albedo: [0.075, 0.066, 0.058], albedoEnd: [0.18, 0.17, 0.16], emission: [1.2, 0.38, 0.06], emissionFade: 0.2, drag: 0.9, rise: 2.8, wind: 0.8 },
  flame: { frame: C.flame, frames: 2, size: [1.1, 0.5], sizeCurve: 1, opacity: 0.95, fadeIn: 0.12, fadeOut: 0.5, albedo: [0.04, 0.02, 0.01], emission: [7, 2.4, 0.5], emissionEnd: [3.2, 0.55, 0.07], emissionFade: 1, occlusion: 0.12, lit: 0, drag: 3, rise: 2.8, wind: 0.4, upright: true },
  fireGlow: { frame: C.glow, size: [2.6, 3.6], sizeCurve: 1, opacity: 1, fadeIn: 0.3, fadeOut: 0.5, albedo: [0, 0, 0], emission: [0.6, 0.22, 0.05], occlusion: 0, lit: 0, drag: 2, rise: 0.5 },
  ember: { frame: C.ember, size: [0.07, 0.03], sizeCurve: 1, opacity: 1, fadeIn: 0.05, fadeOut: 0.4, albedo: [0, 0, 0], emission: [40, 12, 2], emissionEnd: [10, 1.5, 0.2], occlusion: 0, lit: 0, drag: 0.8, rise: 2.4, wind: 1, stretch: 0.05 },
  spark: { frame: C.spark, size: [0.06, 0.035], sizeCurve: 1, opacity: 1, fadeIn: 0.01, fadeOut: 0.3, albedo: [0, 0, 0], emission: [60, 32, 10], emissionEnd: [14, 3, 0.4], occlusion: 0, lit: 0, gravity: 9.8, drag: 0.25, bounce: 0.35, stretch: 0.045 },
  fireball: { frame: C.billow, frames: 1, size: [1.7, 4.6], sizeCurve: 0.35, opacity: 0.96, fadeIn: 0.02, fadeOut: 0.45, albedo: [0.06, 0.052, 0.045], albedoEnd: [0.14, 0.13, 0.12], emission: [14, 5, 1.1], emissionEnd: [2.2, 0.35, 0.04], emissionFade: 0.6, drag: 2.8, rise: 3.2, wind: 0.3 },
  flash: { frame: C.glow, size: [7, 13], sizeCurve: 0.3, opacity: 1, fadeIn: 0.01, fadeOut: 0.9, albedo: [0, 0, 0], emission: [22, 15, 8], occlusion: 0, lit: 0 },
  shockRing: { frame: C.ring, size: [2, 22], sizeCurve: 0.5, opacity: 0.35, fadeIn: 0.01, fadeOut: 0.8, albedo: [0.7, 0.68, 0.64], occlusion: 0.4, lit: 1 },
  smokeColumn: { frame: C.smoke, frames: 4, size: [2.4, 10], sizeCurve: 0.5, opacity: 0.82, fadeIn: 0.15, fadeOut: 0.6, albedo: [0.055, 0.05, 0.045], albedoEnd: [0.15, 0.145, 0.14], emission: [3, 1, 0.2], emissionFade: 0.12, drag: 0.6, rise: 4.5, wind: 0.7 },
  dustRing: { frame: C.dust, size: [1.2, 5], sizeCurve: 0.5, opacity: 0.5, fadeIn: 0.05, fadeOut: 0.7, albedo: [0.42, 0.37, 0.3], drag: 2.2, rise: 0.4, wind: 0.6 },
  debrisChip: { frame: C.chip, size: [0.26, 0.26], sizeCurve: 1, opacity: 1, fadeIn: 0.01, fadeOut: 0.12, albedo: [0.06, 0.06, 0.06], gravity: 9.8, bounce: 0.3, drag: 0.05 },
  muzzleFlash: { frame: C.star, size: [0.5, 0.6], sizeCurve: 1, opacity: 1, fadeIn: 0.01, fadeOut: 0.6, albedo: [0, 0, 0], emission: [45, 28, 10], occlusion: 0, lit: 0 },
  muzzleSmoke: { frame: C.smoke, frames: 4, size: [0.1, 0.8], opacity: 0.22, fadeOut: 0.7, albedo: [0.5, 0.5, 0.5], drag: 2, rise: 0.5, wind: 0.8 },
  tracer: { frame: C.spark, size: [0.035, 0.035], sizeCurve: 1, opacity: 1, fadeIn: 0, fadeOut: 0.1, albedo: [0, 0, 0], emission: [40, 28, 12], occlusion: 0, lit: 0, stretch: 0.022 },
  impactDust: { frame: C.dust, size: [0.12, 0.9], opacity: 0.55, fadeOut: 0.7, albedo: [0.45, 0.43, 0.4], drag: 3, rise: 0.3, wind: 0.5 },
  impactChip: { frame: C.chip, size: [0.05, 0.05], sizeCurve: 1, opacity: 1, fadeIn: 0.01, fadeOut: 0.2, albedo: [0.35, 0.34, 0.32], gravity: 9.8, bounce: 0.25 },
  impactSpark: { frame: C.spark, size: [0.035, 0.02], sizeCurve: 1, opacity: 1, fadeIn: 0.01, fadeOut: 0.3, albedo: [0, 0, 0], emission: [45, 26, 9], emissionEnd: [10, 3, 0.4], occlusion: 0, lit: 0, gravity: 9.8, drag: 0.2, bounce: 0.3, stretch: 0.04 },
  glassShard: { frame: C.ember, size: [0.04, 0.04], sizeCurve: 1, opacity: 0.9, fadeIn: 0.01, fadeOut: 0.2, albedo: [0.6, 0.7, 0.75], emission: [1.2, 1.4, 1.6], occlusion: 0.6, gravity: 9.8, bounce: 0.2 },
  waterSplash: { frame: C.spray, size: [0.2, 1.1], opacity: 0.7, fadeOut: 0.5, albedo: [0.72, 0.8, 0.84], gravity: 6, drag: 0.6, wind: 0.3 },
  waterMist: { frame: C.dust, size: [0.4, 2.4], opacity: 0.3, fadeOut: 0.7, albedo: [0.85, 0.9, 0.92], drag: 1.5, rise: 0.3, wind: 0.8 },
  bloodMist: { frame: C.mist, size: [0.12, 0.45], opacity: 0.55, fadeIn: 0.02, fadeOut: 0.6, albedo: [0.22, 0.015, 0.015], drag: 3, gravity: 1.5 },
  tyreSmoke: { frame: C.smoke, frames: 4, size: [0.5, 3.4], opacity: 0.36, fadeIn: 0.1, fadeOut: 0.65, albedo: [0.74, 0.74, 0.73], drag: 1.6, rise: 0.6, wind: 0.9 },
  sandDust: { frame: C.dust, size: [0.4, 2.8], opacity: 0.45, fadeOut: 0.65, albedo: [0.62, 0.53, 0.38], drag: 1.8, rise: 0.4, wind: 0.9 },
  dirtDust: { frame: C.dust, size: [0.4, 2.4], opacity: 0.42, fadeOut: 0.65, albedo: [0.4, 0.33, 0.25], drag: 1.8, rise: 0.4, wind: 0.9 },
  steam: { frame: C.smoke, frames: 4, size: [0.3, 2.4], opacity: 0.28, fadeIn: 0.15, fadeOut: 0.7, albedo: [0.86, 0.86, 0.86], drag: 1.2, rise: 1.6, wind: 0.8 },
});

/** Index of each style in STYLE_LIST (what the pool stores). */
export const STYLE_NAMES = Object.freeze(Object.keys(PARTICLE_STYLES));
/** The styles as an array, in STYLE_NAMES order. */
export const STYLE_LIST = Object.freeze(STYLE_NAMES.map((name) => PARTICLE_STYLES[name]));
export const STYLE_INDEX = Object.freeze(Object.fromEntries(STYLE_NAMES.map((name, i) => [name, i])));

/**
 * One burst of an effect.
 * @typedef {Object} BurstRecipe
 * @property {string} style A PARTICLE_STYLES name.
 * @property {number[]} count [min, max] particles (scaled by the spawn's scale for big effects).
 * @property {number[]} life [min, max] seconds.
 * @property {number[]} [speed] [min, max] m/s along the burst's direction.
 * @property {'up' | 'along' | 'sphere' | 'flat'} [aim] Direction: world up, the spawn's direction,
 *   any direction biased upward, or horizontally outward. Default 'up'.
 * @property {number} [cone] Half angle of spread around the aim, radians. Default 0.4.
 * @property {number} [radius] Radius of the spawn volume, metres. Default 0.
 * @property {number} [lift] Metres above the spawn point. Default 0.
 * @property {number[]} [scale] [min, max] size scale. Default [0.85, 1.15].
 * @property {number[]} [delay] [min, max] seconds before it appears. Default none.
 * @property {number} [spin] Max spin, rad/s. Default 0.5.
 * @property {number[]} [tint] [min, max] brightness factor. Default [0.9, 1.1].
 */

/** @type {Record<string, {bursts: BurstRecipe[], light?: object, decal?: object, shake?: object, sustain?: object}>} */
export const EFFECT_RECIPES = Object.freeze({
  engine_smoke: {
    bursts: [{ style: 'engineSmoke', count: [2, 3], life: [2.8, 4.2], speed: [0.4, 1.0], cone: 0.5, radius: 0.35, lift: -0.1 }],
  },
  vehicle_fire: {
    bursts: [
      { style: 'flame', count: [7, 9], life: [0.45, 0.85], speed: [0.6, 1.6], cone: 0.35, radius: 0.55, lift: -0.15, scale: [0.8, 1.4], delay: [0, 0.35] },
      { style: 'fireGlow', count: [1, 1], life: [0.6, 0.7], radius: 0.2, lift: 0.2 },
      { style: 'ember', count: [2, 4], life: [1.4, 2.6], speed: [1.5, 3.5], cone: 0.7, radius: 0.5, delay: [0, 0.4] },
      { style: 'fireSmoke', count: [2, 3], life: [4, 6], speed: [1.2, 2.2], cone: 0.3, radius: 0.4, lift: 0.9, delay: [0, 0.35] },
    ],
    light: { color: [1, 0.48, 0.16], intensity: 700, range: 16, seconds: 0.55, flicker: 0.45, lift: 0.8 },
  },
  wreck_fire: {
    bursts: [
      { style: 'flame', count: [8, 11], life: [0.5, 0.95], speed: [0.6, 1.8], cone: 0.35, radius: 1.0, lift: -0.2, scale: [1.0, 1.7], delay: [0, 0.35] },
      { style: 'fireGlow', count: [1, 1], life: [0.6, 0.7], radius: 0.3, lift: 0.3, scale: [1.3, 1.5] },
      { style: 'ember', count: [3, 5], life: [1.6, 3], speed: [2, 4.5], cone: 0.7, radius: 0.8, delay: [0, 0.4] },
      { style: 'fireSmoke', count: [2, 3], life: [5, 7.5], speed: [1.5, 2.6], cone: 0.3, radius: 0.6, lift: 1.3, scale: [1.1, 1.5], delay: [0, 0.35] },
    ],
    light: { color: [1, 0.46, 0.15], intensity: 1100, range: 20, seconds: 0.55, flicker: 0.5, lift: 1 },
  },
  vehicle_explosion: {
    bursts: [
      { style: 'flash', count: [1, 1], life: [0.22, 0.26], lift: 0.6 },
      { style: 'fireball', count: [16, 20], life: [1.0, 1.8], speed: [3, 9], aim: 'sphere', cone: 1.3, radius: 1.0, lift: 0.4, scale: [0.8, 1.3] },
      { style: 'shockRing', count: [1, 1], life: [0.35, 0.4], lift: 0.4 },
      { style: 'dustRing', count: [10, 12], life: [1.6, 2.6], speed: [8, 13], aim: 'flat', radius: 1.2, lift: -0.6 },
      { style: 'spark', count: [36, 44], life: [0.7, 1.6], speed: [10, 24], aim: 'sphere', cone: 1.4, radius: 0.6 },
      { style: 'debrisChip', count: [12, 16], life: [6, 10], speed: [6, 14], aim: 'sphere', cone: 1.0, radius: 0.8, scale: [0.6, 1.8], spin: 9 },
      { style: 'smokeColumn', count: [12, 14], life: [5, 8], speed: [2, 5], cone: 0.5, radius: 1.2, lift: 1.2, delay: [0.1, 0.9] },
    ],
    light: { color: [1, 0.62, 0.3], intensity: 9000, range: 36, seconds: 0.9, flicker: 0.2, lift: 1.5 },
    decal: { cell: 'scorch', size: [5.5, 6.5], opacity: 0.92, life: 600 },
    shake: { strength: 0.9, seconds: 0.8, range: 60 },
    sustain: { effectId: 'wreck_fire', seconds: 30, interval: 0.4, startDelay: 0.6 },
  },
  vehicle_debris: {
    bursts: [
      { style: 'debrisChip', count: [5, 7], life: [4, 7], speed: [2, 5], aim: 'sphere', cone: 1.1, radius: 0.6, lift: -0.4, scale: [0.4, 1.0], spin: 8 },
      { style: 'spark', count: [6, 10], life: [0.3, 0.7], speed: [3, 7], aim: 'sphere', cone: 1.2, radius: 0.4, lift: -0.4 },
      { style: 'impactDust', count: [2, 3], life: [1, 1.6], speed: [0.5, 1.5], radius: 0.6, lift: -0.6, scale: [1.5, 2.5] },
    ],
  },
  muzzle_flash: {
    bursts: [
      { style: 'muzzleFlash', count: [1, 1], life: [0.05, 0.06], aim: 'along' },
      { style: 'muzzleSmoke', count: [1, 2], life: [0.8, 1.3], speed: [0.6, 1.4], aim: 'along', cone: 0.3 },
    ],
    light: { color: [1, 0.72, 0.4], intensity: 300, range: 9, seconds: 0.06, flicker: 0, lift: 0 },
  },
  bullet_impact_asphalt: {
    bursts: [
      { style: 'impactDust', count: [2, 3], life: [0.6, 1.1], speed: [0.8, 2], aim: 'along', cone: 0.6 },
      { style: 'impactChip', count: [3, 5], life: [0.5, 0.9], speed: [2, 4], aim: 'along', cone: 0.8, spin: 10 },
    ],
    decal: { cell: 'bulletHole', size: [0.12, 0.14], opacity: 0.9, life: 120 },
  },
  bullet_impact_concrete: {
    bursts: [
      { style: 'impactDust', count: [3, 4], life: [0.8, 1.4], speed: [1, 2.5], aim: 'along', cone: 0.6, tint: [1.2, 1.4] },
      { style: 'impactChip', count: [4, 6], life: [0.5, 0.9], speed: [2, 5], aim: 'along', cone: 0.8, spin: 10, tint: [1.5, 1.8] },
    ],
    decal: { cell: 'bulletHole', size: [0.1, 0.13], opacity: 0.9, life: 120 },
  },
  bullet_impact_glass: {
    bursts: [{ style: 'glassShard', count: [6, 9], life: [0.6, 1.0], speed: [1.5, 4], aim: 'along', cone: 0.9, spin: 12 }],
    decal: { cell: 'bulletHole', size: [0.08, 0.1], opacity: 0.7, life: 90 },
  },
  bullet_impact_metal: {
    bursts: [
      { style: 'impactSpark', count: [6, 10], life: [0.2, 0.5], speed: [4, 9], aim: 'along', cone: 0.7 },
      { style: 'muzzleSmoke', count: [1, 1], life: [0.5, 0.8], speed: [0.3, 0.8], aim: 'along', cone: 0.4 },
    ],
    decal: { cell: 'bulletHole', size: [0.07, 0.09], opacity: 0.85, life: 120 },
  },
  bullet_impact_water: {
    bursts: [
      { style: 'waterSplash', count: [3, 5], life: [0.5, 0.8], speed: [2.5, 4.5], cone: 0.25, scale: [0.4, 0.7] },
      { style: 'waterMist', count: [1, 2], life: [0.6, 1.0], speed: [0.3, 0.8], scale: [0.3, 0.5] },
    ],
  },
  blood_hit: {
    bursts: [{ style: 'bloodMist', count: [2, 3], life: [0.25, 0.45], speed: [0.8, 2], aim: 'along', cone: 0.5 }],
    decal: { cell: 'blood', size: [0.35, 0.6], opacity: 0.75, life: 90, ground: true },
  },
  tracer: { bursts: [] },
  scrape_sparks: {
    bursts: [{ style: 'impactSpark', count: [4, 7], life: [0.2, 0.5], speed: [3, 7], aim: 'along', cone: 0.6 }],
  },
  tyre_smoke: {
    bursts: [{ style: 'tyreSmoke', count: [1, 1], life: [1.6, 2.6], speed: [0.2, 0.6], cone: 0.8, radius: 0.15, lift: 0.1 }],
  },
  sand_dust: {
    bursts: [{ style: 'sandDust', count: [1, 1], life: [1.2, 2.0], speed: [0.3, 0.8], cone: 0.8, radius: 0.2, lift: 0.1 }],
  },
  dirt_dust: {
    bursts: [{ style: 'dirtDust', count: [1, 1], life: [1.0, 1.8], speed: [0.3, 0.8], cone: 0.8, radius: 0.2, lift: 0.1 }],
  },
  water_spray: {
    bursts: [{ style: 'waterSplash', count: [1, 2], life: [0.5, 0.8], speed: [1.5, 3], aim: 'along', cone: 0.4, scale: [0.6, 1] }],
  },
  sea_spray: {
    bursts: [
      { style: 'waterSplash', count: [2, 4], life: [0.7, 1.2], speed: [2, 4], cone: 0.35, radius: 1.5 },
      { style: 'waterMist', count: [1, 2], life: [1.5, 2.5], speed: [0.5, 1.2], radius: 1.5, lift: 0.5 },
    ],
  },
  steam_vent: {
    bursts: [{ style: 'steam', count: [1, 2], life: [2.5, 4], speed: [1.5, 2.5], cone: 0.15, radius: 0.15 }],
  },
});

/** Ids of every effect EFFECT_SPAWN accepts. */
export const EFFECT_IDS = Object.freeze(Object.keys(EFFECT_RECIPES));
