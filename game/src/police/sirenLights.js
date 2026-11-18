// The light bar of a police vehicle: its lamp_siren_a (red) and lamp_siren_b (blue) halves flash
// alternately in a double-flash pattern by switching the asset's lit and unlit lamp materials,
// as the fleet switches its other lamps, and two real lights (red and blue, through the
// atmosphere's addLight) flash with them over the roof so the street and the car beside it glow.
// Works on any vehicle rig of the fleet (vehicleRoster record.rig); a model with no siren lamps
// only gets the real lights.

const NAMES = ['lamp_siren_a', 'lamp_siren_b'];
const COLOURS = [0xff2a22, 0x2a5cff];
/** One cycle of the pattern: a double flash on each side (seconds). */
const CYCLE = 0.72;

/**
 * Collects the siren lamps of a vehicle rig.
 * @param {object} rig A fleet vehicle rig ({near, far, asset, anchors, root}).
 * @param {number} [phase] 0..1: where in the flash pattern this car starts (so cars differ).
 * @returns {object} The siren.
 */
export function createSirenLights(rig, phase = 0) {
  const meshes = [[], []];
  for (const level of [rig.near, rig.far]) {
    if (!level) continue;
    level.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const index = NAMES.indexOf(node.material.name);
      if (index >= 0) meshes[index].push(node);
    });
  }
  const anchor = rig.anchors?.anchor_siren ?? null;
  return { rig, meshes, lit: [null, null], lights: [null, null], time: (phase % 1) * CYCLE, anchor, on: false };
}

function setHalf(siren, index, on) {
  if (siren.lit[index] === on) return;
  siren.lit[index] = on;
  const asset = siren.rig.asset;
  const list = siren.meshes[index];
  // A model without siren lamps (the unmarked SUV) only flashes the real lights.
  if (!list.length || !asset || typeof asset.lampMaterial !== 'function') return;
  const material = asset.lampMaterial(NAMES[index], on);
  for (let i = 0; i < list.length; i += 1) list[i].material = material;
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
  if (!atmosphere || typeof atmosphere.addLight !== 'function') return;
  if (!near) {
    releaseSirenLights(siren, atmosphere);
    return;
  }
  const root = siren.rig.root;
  for (let i = 0; i < 2; i += 1) {
    if (!siren.lights[i]) {
      siren.lights[i] = atmosphere.addLight({
        kind: 'point', position: [0, 0, 0], color: COLOURS[i], intensity: 0, range: 16, importance: 2, glow: 1.2, glowSize: 0.55, nightOnly: false,
      });
    }
    const light = siren.lights[i];
    light.groundY = root.position.y;
    if (siren.anchor) light.position.copy(siren.anchor);
    else light.position.set(0, 1.6, 0.2);
    light.position.x += i === 0 ? -0.45 : 0.45;
    light.position.y += 0.15;
    root.localToWorld(light.position);
    // Brighter as the daylight goes, so the bars wash the asphalt and the shop fronts at dusk.
    const night = atmosphere.state?.nightFactor ?? 0;
    light.intensity = steady || (half === i && flash) ? 240 * (1 + night * 1.5) : 0;
    light.range = 16 + night * 8;
  }
}

/**
 * Gives the real lights back to the atmosphere.
 * @param {object} siren
 * @param {object | null} atmosphere
 */
export function releaseSirenLights(siren, atmosphere) {
  for (let i = 0; i < 2; i += 1) {
    if (siren.lights[i] && atmosphere) atmosphere.removeLight(siren.lights[i]);
    siren.lights[i] = null;
  }
}
