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
/** Night factor change that triggers a pass over the materials. */
const STEP = 0.02;
const tracked = new Set();
let applied = 0;

/**
 * The factor on a vehicle material's day environment strength.
 * @param {number} night The atmosphere's nightFactor, 0 (day) to 1 (night).
 * @returns {number}
 */
export function nightReflectionScale(night) {
  const n = night > 1 ? 1 : night > 0 ? night : 0;
  return 1 - NIGHT_REFLECTION_CUT * n;
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
  material.envMapIntensity = material.userData.dayEnvIntensity * nightReflectionScale(applied);
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
  const scale = nightReflectionScale(n);
  for (const material of tracked) material.envMapIntensity = material.userData.dayEnvIntensity * scale;
  return true;
}

/**
 * Stops scaling a material (disposed), restoring its day strength.
 * @param {object} material A tracked material.
 */
export function untrackVehicleMaterial(material) {
  if (!tracked.delete(material)) return;
  material.envMapIntensity = material.userData.dayEnvIntensity;
}
