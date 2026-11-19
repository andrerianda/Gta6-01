// The light bar of a police vehicle: its lamp_siren_a (red) and lamp_siren_b (blue) halves flash
// alternately in a double-flash pattern, or burn steadily together ('steady', for a parked unit or
// a still picture). Each half is shown three ways, so both colours read at any distance:
// - the lamp material itself, swapped to a boosted, saturated variant (blue brighter than red, as
//   blue looks darker to the eye and through the tone mapping) so the bloom halo keeps its hue;
// - a glow sprite at its end of the bar (atmosphere light with importance 0: sprite only);
// - a real light thrown 2 m out to its own side of the car (red left, blue right), so the asphalt,
//   the car beside it and the shop fronts get a red pool on one side and a blue one on the other
//   instead of one pink wash.
// Works on any vehicle rig of the fleet (vehicleRoster record.rig: near, far, asset, anchors,
// root); a model with no siren lamps only gets the lights. createSirenLights(..., {lights: false})
// flashes the lamps only (the helicopter's belly beacons).

import * as THREE from 'three';

const NAMES = ['lamp_siren_a', 'lamp_siren_b'];
/** Saturated emissive colour and strength of each lit half (red, blue). */
const LAMP = [
  { colour: new THREE.Color(1, 0.035, 0.02), strength: 16 },
  { colour: new THREE.Color(0.03, 0.26, 1), strength: 26 },
];
/** Real-light colour and brightness factor of each half (blue brighter: it reads darker). */
const LIGHT = [{ colour: 0xff2418, gain: 1 }, { colour: 0x1c62ff, gain: 1.7 }];
/** Cars farther from the camera than this light nothing around them (glow and lenses only). */
const NEAR_METRES = 160;

/**
 * The candela of one half's pool light. Capped relative to the exposure the picture is developed
 * with, as the effects cap their lights: about a street lamp's pool on the asphalt (a lamp is 500 cd
 * from 8 m up; this light is about 1.1 m up), brighter after dark. Within about 14 m of the camera it
 * fades to an eighth: close up the pool would light the whole lower frame and the white cars beside
 * it magenta, while the bar's lenses and glow already carry the colour.
 * @param {number} gain The half's brightness factor (blue > red).
 * @param {number} night 0..1, streetDarkness().
 * @param {number} exposure atmosphere.state.exposure.
 * @param {number} cameraDistance Metres from the camera to the car.
 * @returns {number}
 */
export function sirenPoolIntensity(gain, night, exposure, cameraDistance) {
  const cap = ((0.35 + 0.9 * night) * 110) / Math.max(0.3, exposure);
  const t = Math.min(1, Math.max(0, (cameraDistance - 3) / 11));
  return cap * gain * (0.12 + 0.88 * t * t * (3 - 2 * t));
}
/** One cycle of the pattern: a double flash on each side (seconds). */
const CYCLE = 0.72;
const BASE_INTENSITY = 260;

/**
 * How dark the street is, 0 (day) to 1 (night), from the game clock (sunset 19:30, dark by about
 * 20:20, light again by 06:40), falling back to the atmosphere's nightFactor. The clock is read
 * first because the atmosphere only updates its state when a frame is drawn, so it lags behind a
 * TIME_SET during a showcase's simulated seconds.
 * @param {{clock?: {timeOfDay?: number}, atmosphere?: {state?: {nightFactor?: number}}}} context
 * @returns {number}
 */
export function streetDarkness(context) {
  const hours = context.clock?.timeOfDay;
  if (!Number.isFinite(hours)) return context.atmosphere?.state?.nightFactor ?? 0;
  const ramp = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  return hours >= 12 ? ramp((hours - 18.9) / 1.4) : 1 - ramp((hours - 5.6) / 1.1);
}

/** asset -> [[redOff, redLit], [blueOff, blueLit]], made once per model. */
const boosted = new WeakMap();

function lampMaterials(asset) {
  let pair = boosted.get(asset);
  if (pair) return pair;
  pair = NAMES.map((name, index) => {
    const lit = asset.lampMaterial(name, true).clone();
    lit.emissive.copy(LAMP[index].colour);
    lit.emissiveIntensity = LAMP[index].strength;
    lit.color.copy(LAMP[index].colour);
    lit.toneMapped = true;
    return [asset.lampMaterial(name, false), lit];
  });
  boosted.set(asset, pair);
  return pair;
}

/**
 * Collects the siren lamps of a vehicle rig.
 * @param {object} rig A fleet vehicle rig ({near, far, asset, anchors, root}).
 * @param {number} [phase] 0..1: where in the flash pattern this car starts (so cars differ).
 * @param {{lights?: boolean}} [options] lights: false for lamps only, no atmosphere lights.
 * @returns {object} The siren.
 */
export function createSirenLights(rig, phase = 0, options = {}) {
  const meshes = [[], []];
  for (const level of [rig.near, rig.far]) {
    if (!level) continue;
    level.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const index = NAMES.indexOf(node.material.name);
      if (index >= 0) meshes[index].push(node);
    });
  }
  const asset = rig.asset;
  const materials = (meshes[0].length || meshes[1].length) && asset && typeof asset.lampMaterial === 'function' ? lampMaterials(asset) : null;
  const anchor = rig.anchors?.anchor_siren ?? null;
  return {
    rig, meshes, materials, lit: [null, null], glows: [null, null], pools: [null, null],
    time: (phase % 1) * CYCLE, anchor, on: false, withLights: options.lights !== false,
  };
}

function setHalf(siren, index, on) {
  if (siren.lit[index] === on) return;
  siren.lit[index] = on;
  if (!siren.materials) return;
  const material = siren.materials[index][on ? 1 : 0];
  const list = siren.meshes[index];
  for (let i = 0; i < list.length; i += 1) list[i].material = material;
}

function placeLight(siren, light, side, out, up) {
  if (siren.anchor) light.position.copy(siren.anchor);
  else light.position.set(0, 1.6, 0.2);
  light.position.x += side * out;
  light.position.y += up;
  siren.rig.root.localToWorld(light.position);
  light.groundY = siren.rig.root.position.y;
}

/**
 * Flashes (or darkens) the light bar for this frame.
 * @param {object} siren From createSirenLights.
 * @param {number} dt Frame seconds.
 * @param {boolean} on True while the siren runs.
 * @param {object | null} atmosphere context.atmosphere.
 * @param {number | boolean} near The car's distance to the camera in metres (its pools fade close up
 *   and are off beyond 160 m), or true / false.
 * @param {boolean} [steady] Steady burn: both halves lit (a parked unit, or a still picture).
 * @param {number} [darkness] 0..1 from streetDarkness(); default the atmosphere's nightFactor.
 */
export function updateSirenLights(siren, dt, on, atmosphere, near, steady = false, darkness = NaN) {
  siren.on = on;
  if (!on) {
    setHalf(siren, 0, false);
    setHalf(siren, 1, false);
    releaseSirenLights(siren, atmosphere);
    return;
  }
  siren.time = (siren.time + dt) % CYCLE;
  const half = siren.time < CYCLE / 2 ? 0 : 1;
  const local = (siren.time % (CYCLE / 2)) / (CYCLE / 2);
  const flash = steady || local < 0.22 || (local > 0.36 && local < 0.58);
  setHalf(siren, half, flash);
  setHalf(siren, 1 - half, steady);
  if (!siren.withLights || !atmosphere || typeof atmosphere.addLight !== 'function') return;
  // `near` is the car's distance to the camera in metres, or a plain true/false.
  const cameraDistance = typeof near === 'number' ? near : near ? 30 : Infinity;
  if (!(cameraDistance < NEAR_METRES)) {
    releaseSirenLights(siren, atmosphere);
    return;
  }
  const night = Number.isFinite(darkness) ? darkness : atmosphere.state?.nightFactor ?? 0;
  const exposure = atmosphere.state?.exposure ?? 1;
  // The lenses' glow sprites are sized in metres: right by the camera one would fill the frame.
  const glowScale = Math.min(1, Math.max(0.35, cameraDistance / 9));
  for (let i = 0; i < 2; i += 1) {
    if (!siren.glows[i]) {
      siren.glows[i] = atmosphere.addLight({
        kind: 'point', position: [0, 0, 0], color: LIGHT[i].colour, intensity: 0, range: 6, importance: 0, pool: false,
        glow: i === 0 ? 1.3 : 2, glowSize: i === 0 ? 0.6 : 0.75, nightOnly: false,
      });
      siren.pools[i] = atmosphere.addLight({
        kind: 'point', position: [0, 0, 0], color: LIGHT[i].colour, intensity: 0, range: 16, importance: 2, glow: 0, nightOnly: false,
      });
    }
    const lit = steady || (half === i && flash);
    const side = i === 0 ? -1 : 1;
    const glow = siren.glows[i];
    placeLight(siren, glow, side, 0.5, 0.12);
    glow.intensity = lit ? BASE_INTENSITY * LIGHT[i].gain * (1 + night) * glowScale : 0;
    const pool = siren.pools[i];
    // Low (about 1.1 m over the road) and short-reaching, so each half lays its own coloured patch
    // on the asphalt beside the car instead of washing the street and the cars around it pink.
    placeLight(siren, pool, side, 2.4, -0.4);
    pool.intensity = lit ? sirenPoolIntensity(LIGHT[i].gain, night, exposure, cameraDistance) : 0;
    pool.range = 7 + night * 2;
  }
}

/**
 * Gives the real lights back to the atmosphere.
 * @param {object} siren
 * @param {object | null} atmosphere
 */
export function releaseSirenLights(siren, atmosphere) {
  for (let i = 0; i < 2; i += 1) {
    if (siren.glows[i] && atmosphere) atmosphere.removeLight(siren.glows[i]);
    if (siren.pools[i] && atmosphere) atmosphere.removeLight(siren.pools[i]);
    siren.glows[i] = null;
    siren.pools[i] = null;
  }
}
