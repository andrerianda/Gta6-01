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
/** Real-light colour and brightness factor of each half (blue x2: it reads darker). */
const LIGHT = [{ colour: 0xff2418, gain: 1 }, { colour: 0x1c62ff, gain: 2.1 }];
/** One cycle of the pattern: a double flash on each side (seconds). */
const CYCLE = 0.72;
const BASE_INTENSITY = 260;

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
 * @param {boolean} near True when the car is close enough to light its surroundings.
 * @param {boolean} [steady] Steady burn: both halves lit (a parked unit, or a still picture).
 */
export function updateSirenLights(siren, dt, on, atmosphere, near, steady = false) {
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
  if (!near) {
    releaseSirenLights(siren, atmosphere);
    return;
  }
  const night = atmosphere.state?.nightFactor ?? 0;
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
    glow.intensity = lit ? BASE_INTENSITY * LIGHT[i].gain * (1 + night) : 0;
    const pool = siren.pools[i];
    placeLight(siren, pool, side, 2.6, 0.2);
    // Brighter as the daylight goes, so the bars wash the asphalt and the shop fronts at dusk; a
    // short reach keeps the red and the blue pools apart instead of mixing them to pink.
    pool.intensity = lit ? BASE_INTENSITY * LIGHT[i].gain * (1 + night * 1.6) : 0;
    pool.range = 12 + night * 6;
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
