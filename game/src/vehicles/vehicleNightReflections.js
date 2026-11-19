// How strongly the cars reflect the sky at night. The vehicle models' paint and trim are metallic
// (metalness 1), so a car's colour IS its reflection of the environment map (the sky dome), and
// the hero paint reflects it at 1.35. At night the image pipeline's exposure is about 2.8 (golden
// hour about 1), and that reflection - the dome's lower half above all - lit light cars like
// lamps (QA blocker, 18 Nov: white, cyan and blue bodies glowing in every car-at-night view while
// golden hour looked right). So every vehicle material's environment strength is lowered with the
// night factor, and at night the street lights, the headlamps and the lamps light the cars.
// The day strength is kept in material.userData.dayEnvIntensity (clones of a paint carry it), so
// materials made at night start from the day value. Nothing runs per frame unless the night
// factor has moved.

/** Share of the environment reflection taken away at full night. */
export const NIGHT_REFLECTION_CUT = 0.72;
/**
 * Emission a lit lamp keeps at full night. The full-part model (the player's car, damaged cars,
 * boats and helicopters) lights its lamps with the asset's own lamp materials at their daylight
 * strength (head, brake and reverse 10): at night exposure 2.8 a lit reverse or brake lamp bloomed
 * into a white or red blob over the whole rear (QA carnight, 11:11) while merged traffic cars,
 * whose lamps glow at 2.5, looked right. Lit lamps fall to at most this at night.
 */
export const NIGHT_LAMP_INTENSITY = 2.5;
/** Night factor change that triggers a pass over the materials. */
const STEP = 0.02;
const tracked = new Set();
let applied = 0;

/**
 * The factor on a vehicle material's day environment strength.
 * @param {number} night The atmosphere's nightFactor, 0 (day) to 1 (night).
 * @param {number} [keep] Share kept at full night (default 1 - NIGHT_REFLECTION_CUT).
 * @returns {number}
 */
export function nightReflectionScale(night, keep = 1 - NIGHT_REFLECTION_CUT) {
  const n = night > 1 ? 1 : night > 0 ? night : 0;
  return 1 - (1 - keep) * n;
}

/**
 * The day environment strength of a material (its own value until the night first scaled it).
 * @param {object | null | undefined} material A three.js material.
 * @param {number} [fallback] When the material has none.
 * @returns {number}
 */
export function dayEnvironmentOf(material, fallback = 1) {
  return material?.userData?.dayEnvIntensity ?? material?.envMapIntensity ?? fallback;
}

/**
 * Starts scaling one vehicle material with the night (once; later calls do nothing).
 * @param {object | null | undefined} material A three.js material with envMapIntensity.
 */
export function trackVehicleMaterial(material) {
  if (!material || Array.isArray(material) || typeof material.envMapIntensity !== 'number' || tracked.has(material)) return;
  if (material.userData.dayEnvIntensity === undefined) material.userData.dayEnvIntensity = material.envMapIntensity;
  tracked.add(material);
  applyNight(material, applied);
}

/**
 * A lit lamp's emission at a night factor: its own by day, at most NIGHT_LAMP_INTENSITY at night.
 * @param {number} lit The lamp's lit (daylight) emissive intensity.
 * @param {number} night 0..1.
 * @returns {number}
 */
export function nightLampIntensity(lit, night) {
  const capped = Math.min(lit, NIGHT_LAMP_INTENSITY);
  return lit + (capped - lit) * (night > 1 ? 1 : night > 0 ? night : 0);
}

function applyNight(material, night) {
  // Roof glass keeps more (userData.nightReflection, vehicleGlass.js): it hides the cabin.
  material.envMapIntensity = material.userData.dayEnvIntensity * nightReflectionScale(night, material.userData.nightReflection);
  const lit = material.userData.litIntensity;
  if (material.userData.lit !== false && typeof lit === 'number' && lit > 0) material.emissiveIntensity = nightLampIntensity(lit, night);
}

/**
 * Tracks every material of the meshes under a node (a car's near level after painting).
 * @param {object} root A three.js object.
 */
export function trackVehicleMaterialsOf(root) {
  root.traverse((node) => {
    if (node.isMesh) trackVehicleMaterial(node.material);
  });
}

/**
 * Applies the night to every tracked material when it has moved enough (call once per frame).
 * @param {number} night The atmosphere's nightFactor.
 * @returns {boolean} True when the materials were updated.
 */
export function updateVehicleNightReflections(night) {
  const n = night > 1 ? 1 : night > 0 ? night : 0;
  const settled = (n === 0 || n === 1) && n !== applied;
  if (Math.abs(n - applied) < STEP && !settled) return false;
  applied = n;
  for (const material of tracked) applyNight(material, n);
  return true;
}

/**
 * Stops scaling a material (disposed), restoring its day strength.
 * @param {object} material A tracked material.
 */
export function untrackVehicleMaterial(material) {
  if (!tracked.delete(material)) return;
  material.envMapIntensity = material.userData.dayEnvIntensity;
  if (material.userData.lit !== false && material.userData.litIntensity > 0) material.emissiveIntensity = material.userData.litIntensity;
}
