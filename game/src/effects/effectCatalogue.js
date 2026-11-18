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
  fireSmoke: { frame: C.smoke, frames: 4, size: [1.0, 5.6], sizeCurve: 0.55, opacity: 0.62, fadeIn: 0.1, fadeOut: 0.55, albedo: [0.075, 0.066, 0.058], albedoEnd: [0.18, 0.17, 0.16], emission: [1.2, 0.38, 0.06], emissionFade: 0.2, drag: 0.9, rise: 2.8, wind: 0.8 },
  // A fire is three layers of upright flame cards: a few big orange tongues (flame), a small
  // white-yellow heart low in the fire (flameCore) and quick small licks that break off its top
  // (flameLick). Each card is drawn `pull` of its size nearer the camera, so it stands in front
  // of the body it rises from instead of being cut by it, and its glow flickers (the renderer).
  // Not too hot: overlapping tongues stay orange with yellow cores instead of a white streak.
  // (pull about 0.6: a car is 1.8 m wide, so a card from its middle must come a metre forward)
  flame: { frame: C.flame, frames: 2, size: [1.5, 2.5], sizeCurve: 0.6, opacity: 1, fadeIn: 0.12, fadeOut: 0.5, albedo: [0.04, 0.02, 0.01], emission: [3.3, 1.1, 0.2], emissionEnd: [1.3, 0.24, 0.03], emissionFade: 1, occlusion: 0.25, lit: 0, drag: 3, rise: 2.8, wind: 0.45, upright: true, pull: 0.6 },
  flameCore: { frame: C.flame, frames: 2, size: [1.0, 1.6], sizeCurve: 0.8, opacity: 1, fadeIn: 0.1, fadeOut: 0.5, albedo: [0, 0, 0], emission: [9, 5.4, 1.7], emissionEnd: [3.6, 1.4, 0.24], emissionFade: 1, occlusion: 0, lit: 0, drag: 3, rise: 1.8, wind: 0.2, upright: true, pull: 0.9 },
  flameLick: { frame: C.flame, frames: 2, size: [0.5, 1.1], sizeCurve: 0.5, opacity: 0.9, fadeIn: 0.1, fadeOut: 0.6, albedo: [0.03, 0.015, 0.01], emission: [2.8, 0.8, 0.1], emissionEnd: [0.9, 0.14, 0.01], emissionFade: 1, occlusion: 0.15, lit: 0, drag: 2, rise: 4.2, wind: 0.6, upright: true, pull: 0.6 },
  // a warm haze round the base of a fire: small, or by day it veils the car in orange
  fireGlow: { frame: C.glow, size: [1.8, 2.4], sizeCurve: 1, opacity: 1, fadeIn: 0.3, fadeOut: 0.5, albedo: [0, 0, 0], emission: [0.45, 0.16, 0.035], occlusion: 0, lit: 0, drag: 2, rise: 0.5 },
  ember: { frame: C.ember, size: [0.07, 0.03], sizeCurve: 1, opacity: 1, fadeIn: 0.05, fadeOut: 0.4, albedo: [0, 0, 0], emission: [40, 12, 2], emissionEnd: [10, 1.5, 0.2], occlusion: 0, lit: 0, drag: 0.8, rise: 2.4, wind: 1, stretch: 0.05 },
  // the column over a burning wreck: black and dense where it leaves the fire, lit dull red from
  // below, thinning to brown-grey as it climbs 30 m and leans with the wind, its sunward side lit
  smokePlume: { frame: C.smoke, frames: 4, size: [1.6, 10], sizeCurve: 0.55, opacity: 0.92, fadeIn: 0.03, fadeOut: 0.45, albedo: [0.03, 0.028, 0.026], albedoEnd: [0.36, 0.33, 0.3], emission: [1.4, 0.42, 0.07], emissionFade: 0.08, drag: 0.45, rise: 3.6, wind: 0.85 },
  spark: { frame: C.spark, size: [0.06, 0.035], sizeCurve: 1, opacity: 1, fadeIn: 0.01, fadeOut: 0.3, albedo: [0, 0, 0], emission: [60, 32, 10], emissionEnd: [14, 3, 0.4], occlusion: 0, lit: 0, gravity: 9.8, drag: 0.25, bounce: 0.35, stretch: 0.045 },
  // the shader weights emission by the square of the lobe height, so each billow burns in its
  // middle and is dark soot at its torn edge; it cools to smoke by 60 % of its life
  // orange billows around the core, a little see-through so the white-hot heart shows through
  fireball: { frame: C.billow, frames: 1, size: [1.6, 4.6], sizeCurve: 0.35, opacity: 0.95, fadeIn: 0.02, fadeOut: 0.4, albedo: [0.04, 0.035, 0.03], albedoEnd: [0.1, 0.09, 0.085], emission: [7.5, 1.9, 0.26], emissionEnd: [0.7, 0.08, 0.01], emissionFade: 0.55, occlusion: 0.72, drag: 2.8, rise: 3.4, wind: 0.3 },
  // the white-yellow heart of a blast: small, slow, very hot, cooling to orange within half a second
  fireCore: { frame: C.billow, frames: 1, size: [1.1, 3.0], sizeCurve: 0.4, opacity: 0.98, fadeIn: 0.02, fadeOut: 0.45, albedo: [0.05, 0.04, 0.03], emission: [34, 23, 10], emissionEnd: [5, 1.3, 0.18], emissionFade: 0.7, occlusion: 0.55, lit: 0, drag: 4, rise: 2.2, wind: 0.2 },
  // dense sooty smoke thrown up and out with the fireball: dark edges and a cap that rolls upward,
  // glowing dull red underneath for its first moments
  soot: { frame: C.smoke, frames: 4, size: [2.0, 7.5], sizeCurve: 0.45, opacity: 0.93, fadeIn: 0.05, fadeOut: 0.5, albedo: [0.026, 0.023, 0.021], albedoEnd: [0.11, 0.105, 0.1], emission: [1.5, 0.42, 0.06], emissionFade: 0.16, drag: 1.7, rise: 3.6, wind: 0.6 },
  // the first instant of a blast: bright but compact, so that it does not veil the whole picture
  // a few metres away (a 16 m glow whited out everything for its quarter second)
  flash: { frame: C.glow, size: [3.5, 6.5], sizeCurve: 0.3, opacity: 1, fadeIn: 0.01, fadeOut: 0.85, albedo: [0, 0, 0], emission: [9, 6, 2.8], occlusion: 0, lit: 0 },
  shockRing: { frame: C.ring, size: [2, 22], sizeCurve: 0.5, opacity: 0.35, fadeIn: 0.01, fadeOut: 0.8, albedo: [0.7, 0.68, 0.64], occlusion: 0.4, lit: 1 },
  smokeColumn: { frame: C.smoke, frames: 4, size: [2.4, 10], sizeCurve: 0.5, opacity: 0.82, fadeIn: 0.15, fadeOut: 0.6, albedo: [0.08, 0.072, 0.064], albedoEnd: [0.2, 0.19, 0.18], emission: [2, 0.65, 0.12], emissionFade: 0.12, drag: 0.6, rise: 4.5, wind: 0.7 },
  // grey-brown street dust pushed out low along the ground; thin and darkish, because it rushes
  // toward a camera a few metres away and, lit by the blast, pale dust veiled the whole picture
  dustRing: { frame: C.dust, size: [1.0, 4.2], sizeCurve: 0.5, opacity: 0.3, fadeIn: 0.05, fadeOut: 0.7, albedo: [0.27, 0.24, 0.2], drag: 2.8, rise: 0.3, wind: 0.6 },
  debrisChip: { frame: C.chip, size: [0.26, 0.26], sizeCurve: 1, opacity: 1, fadeIn: 0.01, fadeOut: 0.12, albedo: [0.06, 0.06, 0.06], gravity: 9.8, bounce: 0.3, drag: 0.05 },
  // Small and quick (owner): combat sends scale 0.36 for a handgun (a star about 20 cm across with
  // short spikes, its halo the same), 0.42 for an SMG, 0.5 for long guns. Over the shoulder the
  // muzzle is about 1.4 m from the camera, so a bigger star hid the hand and the pistol.
  muzzleFlash: { frame: C.star, size: [0.5, 0.58], sizeCurve: 1, opacity: 1, fadeIn: 0.01, fadeOut: 0.5, albedo: [0, 0, 0], emission: [26, 16, 6], occlusion: 0, lit: 0 },
  // the forward jet of burning gas and the warm halo round the muzzle: they make a flash read
  // in a still picture even when the star is seen end on
  muzzleJet: { frame: C.spark, size: [0.12, 0.08], sizeCurve: 1, opacity: 1, fadeIn: 0.01, fadeOut: 0.5, albedo: [0, 0, 0], emission: [26, 14, 4], occlusion: 0, lit: 0, drag: 4, stretch: 0.025 },
  muzzleGlow: { frame: C.glow, size: [0.5, 0.58], sizeCurve: 1, opacity: 1, fadeIn: 0.01, fadeOut: 0.6, albedo: [0, 0, 0], emission: [1.5, 0.8, 0.28], occlusion: 0, lit: 0 },
  muzzleSmoke: { frame: C.smoke, frames: 4, size: [0.08, 0.55], opacity: 0.14, fadeOut: 0.7, albedo: [0.45, 0.45, 0.45], drag: 2, rise: 0.5, wind: 0.8 },
  // thin pale wisps that curl off a long gun's muzzle and hang a second or two
  gunWisp: { frame: C.smoke, frames: 4, size: [0.05, 0.6], sizeCurve: 0.6, opacity: 0.2, fadeIn: 0.08, fadeOut: 0.65, albedo: [0.6, 0.6, 0.58], albedoEnd: [0.7, 0.69, 0.67], drag: 2.4, rise: 0.45, wind: 0.7 },
  // a rocket launcher's back-blast: a pale dust-and-smoke cloud thrown out behind the shooter
  backblastSmoke: { frame: C.smoke, frames: 4, size: [0.5, 3.4], sizeCurve: 0.45, opacity: 0.5, fadeIn: 0.03, fadeOut: 0.6, albedo: [0.6, 0.58, 0.54], albedoEnd: [0.68, 0.66, 0.62], emission: [1.1, 0.42, 0.08], emissionFade: 0.06, drag: 3.2, rise: 0.5, wind: 0.8 },
  // (tracers are drawn in screen space by tracerStreaks.js, not as particles)
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
 * @property {number} [ahead] Metres along the spawn's direction (times its scale). Default 0.
 * @property {number[]} [scale] [min, max] size scale. Default [0.85, 1.15].
 * @property {number[]} [delay] [min, max] seconds before it appears. Default none.
 * @property {number} [spin] Max spin, rad/s. Default 0.5.
 * @property {number[]} [tint] [min, max] brightness factor. Default [0.9, 1.1].
 */

/**
 * `chunks` throws lit 3D debris (debrisChunks.js DebrisSpec: count, speed, life, cone, radius,
 * lift, size, and the weight of each kind: panel, glass, tyre, metal, rubble).
 * @type {Record<string, {bursts: BurstRecipe[], chunks?: object, light?: object, decal?: object, shake?: object, sustain?: object}>}
 */
export const EFFECT_RECIPES = Object.freeze({
  engine_smoke: {
    bursts: [{ style: 'engineSmoke', count: [2, 3], life: [2.8, 4.2], speed: [0.4, 1.0], cone: 0.5, radius: 0.35, lift: -0.1 }],
  },
  // sent every 0.4 s while a car burns (the fleet) or by a sustained fire: each burst's delays
  // spread its particles over the interval, so the fire never pulses
  vehicle_fire: {
    bursts: [
      { style: 'flame', count: [4, 6], life: [0.5, 0.9], speed: [0.6, 1.6], cone: 0.25, radius: 0.9, lift: 0.2, scale: [0.6, 1.1], delay: [0, 0.4] },
      { style: 'flameCore', count: [2, 3], life: [0.35, 0.6], speed: [0.3, 0.8], cone: 0.2, radius: 0.5, lift: 0.1, scale: [0.7, 1], delay: [0, 0.4] },
      { style: 'flameLick', count: [2, 4], life: [0.3, 0.55], speed: [1.5, 3], cone: 0.35, radius: 0.8, lift: 0.9, delay: [0, 0.4] },
      { style: 'fireGlow', count: [1, 1], life: [0.6, 0.7], radius: 0.2, lift: 0.2 },
      { style: 'ember', count: [2, 4], life: [1.4, 2.6], speed: [1.5, 3.5], cone: 0.7, radius: 0.5, delay: [0, 0.4] },
      { style: 'fireSmoke', count: [3, 4], life: [4, 6], speed: [1.2, 2.2], cone: 0.3, radius: 0.5, lift: 1.0, scale: [0.7, 1.1], delay: [0, 0.4] },
    ],
    light: { color: [1, 0.48, 0.16], intensity: 700, range: 16, seconds: 0.55, flicker: 0.45, lift: 0.8 },
  },
  // a whole car alight (the wreck after its blast, or effects/burn 'blazing'): flames over the
  // body no wider than the car, a white-yellow heart, licks, embers and a tall plume. The flames
  // start a little above the body's middle (lift 0.32) so the lower body, doors and livery show.
  wreck_fire: {
    bursts: [
      { style: 'flame', count: [6, 8], life: [0.55, 1.0], speed: [0.6, 1.8], cone: 0.25, radius: 1.3, lift: 0.32, scale: [0.7, 1.2], delay: [0, 0.4] },
      { style: 'flameCore', count: [3, 4], life: [0.35, 0.65], speed: [0.3, 1], cone: 0.2, radius: 0.9, lift: 0.22, scale: [0.8, 1.1], delay: [0, 0.4] },
      { style: 'flameLick', count: [3, 5], life: [0.3, 0.6], speed: [1.5, 3.5], cone: 0.35, radius: 1.2, lift: 1.35, delay: [0, 0.4] },
      { style: 'fireGlow', count: [1, 1], life: [0.6, 0.7], radius: 0.3, lift: 0.45, scale: [1.3, 1.5] },
      { style: 'ember', count: [5, 7], life: [2, 3.5], speed: [2, 4.5], cone: 0.7, radius: 0.9, delay: [0, 0.4], scale: [1.1, 1.5] },
      { style: 'fireSmoke', count: [3, 3], life: [4, 6], speed: [1.5, 2.6], cone: 0.3, radius: 0.8, lift: 1.4, scale: [0.9, 1.3], delay: [0, 0.4], tint: [0.6, 0.8] },
      { style: 'smokePlume', count: [3, 3], life: [10, 13], speed: [1.6, 2.6], cone: 0.15, radius: 0.6, lift: 1.9, scale: [0.9, 1.15], delay: [0, 0.4] },
    ],
    light: { color: [1, 0.46, 0.15], intensity: 1100, range: 20, seconds: 0.55, flicker: 0.5, lift: 1 },
  },
  vehicle_explosion: {
    bursts: [
      { style: 'flash', count: [1, 1], life: [0.16, 0.2], lift: 0.6 },
      { style: 'soot', count: [9, 11], life: [3.5, 5.5], speed: [3, 7], aim: 'sphere', cone: 0.75, radius: 1.3, lift: 1.5, scale: [0.8, 1.2] },
      { style: 'fireball', count: [13, 16], life: [1.0, 1.7], speed: [3, 8], aim: 'sphere', cone: 1.3, radius: 1.0, lift: 0.5, scale: [0.8, 1.25] },
      { style: 'fireCore', count: [5, 7], life: [0.6, 0.95], speed: [0.5, 2.5], aim: 'sphere', cone: 1.4, radius: 0.6, lift: 0.7, scale: [0.8, 1.2] },
      { style: 'shockRing', count: [1, 1], life: [0.35, 0.4], lift: 0.4 },
      { style: 'dustRing', count: [10, 12], life: [1.6, 2.6], speed: [8, 13], aim: 'flat', radius: 1.2, lift: -0.6 },
      { style: 'spark', count: [36, 44], life: [0.7, 1.6], speed: [10, 24], aim: 'sphere', cone: 1.4, radius: 0.6 },
      { style: 'ember', count: [10, 14], life: [1.5, 3], speed: [4, 9], aim: 'sphere', cone: 1.0, radius: 0.8, lift: 0.8 },
      { style: 'smokeColumn', count: [12, 14], life: [5, 8], speed: [2, 5], cone: 0.5, radius: 1.2, lift: 1.6, delay: [0.15, 0.9] },
    ],
    chunks: { count: [16, 20], speed: [6, 15], life: [7, 11], cone: 1.0, radius: 0.8, lift: 0.5, size: [0.55, 1.05], kinds: { panel: 5, glass: 4, metal: 7, tyre: 0.5 } },
    light: { color: [1, 0.58, 0.26], intensity: 4500, range: 30, seconds: 0.9, flicker: 0.2, lift: 1.8, decay: true },
    decal: { cell: 'scorch', size: [5.5, 6.5], opacity: 0.92, life: 600 },
    shake: { strength: 0.9, seconds: 0.8, range: 60 },
    sustain: { effectId: 'wreck_fire', seconds: 30, interval: 0.4, startDelay: 0.6 },
  },
  vehicle_debris: {
    bursts: [
      { style: 'spark', count: [6, 10], life: [0.3, 0.7], speed: [3, 7], aim: 'sphere', cone: 1.2, radius: 0.4, lift: -0.4 },
      { style: 'impactDust', count: [2, 3], life: [1, 1.6], speed: [0.5, 1.5], radius: 0.6, lift: -0.6, scale: [1.5, 2.5] },
    ],
    chunks: { count: [4, 6], speed: [2, 5], life: [4, 7], cone: 1.1, radius: 0.6, lift: -0.3, size: [0.4, 0.8], kinds: { glass: 4, metal: 4, panel: 1 } },
  },
  muzzle_flash: {
    bursts: [
      // gone in one or two frames, opening a little in front of the barrel so the gun stays seen
      { style: 'muzzleFlash', count: [1, 1], life: [0.026, 0.034], aim: 'along', ahead: 0.25, scale: [0.9, 1.05] },
      { style: 'muzzleJet', count: [1, 1], life: [0.026, 0.034], speed: [13, 15], aim: 'along', cone: 0.02, ahead: 0.15 },
      { style: 'muzzleGlow', count: [1, 1], life: [0.03, 0.04], aim: 'along', ahead: 0.2 },
      { style: 'muzzleSmoke', count: [1, 2], life: [0.8, 1.3], speed: [0.6, 1.4], aim: 'along', cone: 0.3, ahead: 0.2 },
    ],
    light: { color: [1, 0.72, 0.4], intensity: 300, range: 9, seconds: 0.035, flicker: 0, lift: 0 },
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
  // drawn by tracerStreaks.js from the muzzle along the aim for `scale` metres
  tracer: { bursts: [] },
  // a long gun's smoke after a shot (direction = the aim; scale about 0.6 smg .. 1.3 shotgun)
  muzzle_wisps: {
    bursts: [
      { style: 'gunWisp', count: [2, 3], life: [1.1, 1.9], speed: [0.6, 1.4], aim: 'along', cone: 0.3, ahead: 0.08, delay: [0, 0.12] },
      { style: 'gunWisp', count: [1, 1], life: [1.4, 2.2], speed: [0.1, 0.3], cone: 0.5, scale: [0.6, 0.8] },
    ],
  },
  // out of a rocket launcher's rear: combat sends it at the exhaust with direction = backward,
  // out of the tube (scale 1: a blast about 5 m long). Flash, a hot jet, a pale cloud, dust.
  rocket_backblast: {
    bursts: [
      { style: 'fireCore', count: [3, 4], life: [0.12, 0.2], speed: [6, 10], aim: 'along', cone: 0.15, scale: [0.25, 0.4] },
      { style: 'fireball', count: [3, 4], life: [0.25, 0.4], speed: [8, 14], aim: 'along', cone: 0.2, ahead: 0.2, scale: [0.3, 0.45] },
      { style: 'backblastSmoke', count: [9, 12], life: [1.6, 2.6], speed: [6, 14], aim: 'along', cone: 0.35, ahead: 0.2 },
      { style: 'dustRing', count: [5, 7], life: [1.0, 1.6], speed: [4, 7], aim: 'flat', lift: -1.2, scale: [0.5, 0.7] },
      { style: 'spark', count: [4, 6], life: [0.2, 0.4], speed: [6, 12], aim: 'along', cone: 0.3 },
    ],
    light: { color: [1, 0.62, 0.3], intensity: 900, range: 10, seconds: 0.12, flicker: 0, lift: 0 },
    shake: { strength: 0.25, seconds: 0.25, range: 15 },
  },
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
  // a grenade or rocket (combat's scale is the blast radius / 7): no wreck left burning
  explosion: {
    bursts: [
      { style: 'flash', count: [1, 1], life: [0.14, 0.18], lift: 0.5 },
      { style: 'soot', count: [6, 8], life: [3, 4.5], speed: [2.5, 6], aim: 'sphere', cone: 0.75, radius: 0.9, lift: 1.1, scale: [0.6, 0.9] },
      { style: 'fireball', count: [9, 11], life: [0.8, 1.3], speed: [3, 7], aim: 'sphere', cone: 1.3, radius: 0.7, lift: 0.4, scale: [0.6, 1.0] },
      { style: 'fireCore', count: [3, 5], life: [0.5, 0.8], speed: [0.5, 2], aim: 'sphere', cone: 1.4, radius: 0.4, lift: 0.5, scale: [0.6, 0.9] },
      { style: 'shockRing', count: [1, 1], life: [0.3, 0.35], lift: 0.3 },
      { style: 'dustRing', count: [8, 10], life: [1.4, 2.2], speed: [7, 12], aim: 'flat', radius: 1, lift: -0.3 },
      { style: 'spark', count: [20, 26], life: [0.5, 1.2], speed: [8, 20], aim: 'sphere', cone: 1.4, radius: 0.4 },
      { style: 'smokeColumn', count: [6, 8], life: [3.5, 5.5], speed: [1.5, 4], cone: 0.5, radius: 0.9, lift: 1.2, delay: [0.15, 0.7], scale: [0.6, 0.9] },
    ],
    chunks: { count: [8, 11], speed: [5, 12], life: [5, 8], cone: 1.0, radius: 0.5, lift: 0.3, size: [0.6, 1.1], kinds: { rubble: 6, metal: 4, glass: 1 } },
    light: { color: [1, 0.58, 0.26], intensity: 3200, range: 26, seconds: 0.7, flicker: 0.2, lift: 1.4, decay: true },
    decal: { cell: 'scorch', size: [3.5, 4.5], opacity: 0.85, life: 400 },
    shake: { strength: 0.7, seconds: 0.6, range: 50 },
  },
  // a firebomb: a puddle of flames that burns for a few seconds
  fire_burst: {
    bursts: [
      { style: 'flash', count: [1, 1], life: [0.15, 0.18], lift: 0.3, scale: [0.4, 0.5] },
      { style: 'flame', count: [8, 10], life: [0.5, 0.9], speed: [1, 2.4], cone: 0.4, radius: 1.4, scale: [0.7, 1.3] },
    ],
    light: { color: [1, 0.5, 0.18], intensity: 900, range: 16, seconds: 0.5, flicker: 0.4, lift: 0.6 },
    decal: { cell: 'scorch', size: [2.4, 3], opacity: 0.7, life: 300 },
    sustain: { effectId: 'ground_fire', seconds: 9, interval: 0.4, startDelay: 0.3 },
  },
  ground_fire: {
    bursts: [
      { style: 'flame', count: [4, 6], life: [0.45, 0.85], speed: [0.5, 1.4], cone: 0.25, radius: 1.4, lift: -0.3, scale: [0.5, 1.0], delay: [0, 0.4] },
      { style: 'fireGlow', count: [1, 1], life: [0.6, 0.7], radius: 0.4, lift: 0.1, scale: [0.8, 1] },
      { style: 'fireSmoke', count: [1, 2], life: [3, 5], speed: [1, 2], cone: 0.3, radius: 0.8, lift: 0.8, scale: [0.5, 0.8], delay: [0, 0.4] },
    ],
    light: { color: [1, 0.48, 0.16], intensity: 450, range: 12, seconds: 0.55, flicker: 0.45, lift: 0.6 },
  },
  melee_hit: {
    bursts: [{ style: 'impactDust', count: [1, 2], life: [0.3, 0.5], speed: [0.4, 1], aim: 'along', cone: 0.6, scale: [0.4, 0.6] }],
  },
});

/**
 * The stages a fire can be started at for a picture (command 'effects/burn'): the recipe it
 * repeats every `interval` seconds and how strong it burns (a sustained wreck fire otherwise dies
 * down over its last third). `anchor` is where on a vehicle it burns: the engine bay or the body.
 */
export const BURN_STAGES = Object.freeze({
  smoking: { effectId: 'engine_smoke', strength: 1, interval: 0.4, anchor: 'engine_bay' },
  burning: { effectId: 'vehicle_fire', strength: 1, interval: 0.4, anchor: 'engine_bay' },
  blazing: { effectId: 'wreck_fire', strength: 1, interval: 0.4, anchor: 'body' },
  dying: { effectId: 'wreck_fire', strength: 0.45, interval: 0.4, anchor: 'body' },
});

/** Ids of every effect EFFECT_SPAWN accepts (aliases below are accepted too). */
export const EFFECT_IDS = Object.freeze(Object.keys(EFFECT_RECIPES));

/** Other names senders use for an effect (combat's COMBAT_EFFECTS) and the recipe they mean. */
export const EFFECT_ALIASES = Object.freeze({
  bullet_tracer: 'tracer',
  metal_sparks: 'bullet_impact_metal',
  bullet_impact: 'bullet_impact_concrete',
  tyre_squeal: 'tyre_smoke',
});

/**
 * The recipe id for a requested effect id: aliases resolved, and a surface-less bullet impact
 * on asphalt when it hit a floor (normal pointing up), on concrete when it hit a wall.
 * @param {string} effectId @param {number} normalY The y of the request's direction.
 * @returns {string} A key of EFFECT_RECIPES, or the id unchanged when unknown.
 */
export function effectIdFor(effectId, normalY) {
  if (effectId === 'bullet_impact') return normalY > 0.7 ? 'bullet_impact_asphalt' : 'bullet_impact_concrete';
  return EFFECT_ALIASES[effectId] ?? effectId;
}
