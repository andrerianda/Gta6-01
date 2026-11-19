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
// The moon's glint: at night the key light is the moon, a directional light bright enough to fill
// the street, and its specular highlight on glossy paint turned roofs, hoods and trunks into lamps
// (shift 14, chase view at 22:30: a white roof 3.1 to 3.3 times a white slab beside it, p90 near
// 208; without the moon 1.7). So the key light's specular on every vehicle material is scaled by
// nightGlintScale (its diffuse light and the lamps' glints stay), untouched up to NIGHT_GLINT_START.

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
/**
 * Night factor up to which the key light's glint on the cars is left alone: the judged dusk
 * picture (19:24 in haze) is at about 0.31, and the headlamps come on above 0.35.
 */
export const NIGHT_GLINT_START = 0.4;
/** Share of the key light's (the moon's) specular glint the cars keep at full night. */
export const NIGHT_GLINT_KEEP = 0.1;
/** Night factor change that triggers a pass over the materials. */
const STEP = 0.02;
const tracked = new Set();
const glinted = new WeakSet();
/** The shared uniform of every patched vehicle shader. */
const keyGlint = { value: 1 };
const DIRECTIONAL_LIGHTS = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
const RECT_AREA_LIGHTS = '#if ( NUM_RECT_AREA_LIGHTS > 0 )';
const KEEP_SPECULAR = [
  '\nvec3 vehicleSpecularBeforeKey = reflectedLight.directSpecular;',
  '#ifdef USE_CLEARCOAT\nvec3 vehicleClearcoatBeforeKey = clearcoatSpecularDirect;\n#endif\n',
].join('\n');
const SCALE_KEY_SPECULAR = [
  '\nreflectedLight.directSpecular = mix( vehicleSpecularBeforeKey, reflectedLight.directSpecular, vehicleKeyGlint );',
  '#ifdef USE_CLEARCOAT\nclearcoatSpecularDirect = mix( vehicleClearcoatBeforeKey, clearcoatSpecularDirect, vehicleKeyGlint );\n#endif\n',
].join('\n');
let shaderChunks = null;
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
 * The factor on the key light's specular glint on vehicles: 1 up to NIGHT_GLINT_START, then down
 * to NIGHT_GLINT_KEEP at full night.
 * @param {number} night The atmosphere's nightFactor, 0..1.
 * @returns {number}
 */
export function nightGlintScale(night) {
  const t = (night - NIGHT_GLINT_START) / (1 - NIGHT_GLINT_START);
  return 1 - (1 - NIGHT_GLINT_KEEP) * (t > 1 ? 1 : t > 0 ? t : 0);
}

/**
 * Hands over three.js's shader chunks (vehicleMergedLevels.js does, at load), read when a vehicle
 * shader compiles: the lights chunk then already carries the atmosphere's cascade patch.
 * @param {Record<string, string>} chunks THREE.ShaderChunk.
 */
export function useVehicleShaderChunks(chunks) {
  shaderChunks = chunks;
}

/**
 * Rewrites a lit material's shader (onBeforeCompile) so that the specular of the directional
 * lights (the sun or the moon) is scaled by the shared night glint uniform; exactly the same
 * picture while it is 1. Leaves the shader alone when the lights chunk is not as expected.
 * @param {{uniforms: object, fragmentShader: string}} shader
 * @param {string} [lights] The lights_fragment_begin chunk (default the one handed over).
 * @returns {boolean} True when patched.
 */
export function patchVehicleKeyGlint(shader, lights = shaderChunks?.lights_fragment_begin) {
  const start = typeof lights === 'string' ? lights.indexOf(DIRECTIONAL_LIGHTS) : -1;
  const end = start < 0 ? -1 : lights.indexOf(RECT_AREA_LIGHTS, start);
  if (end < 0 || !shader.fragmentShader.includes('#include <lights_fragment_begin>')) return false;
  const patched = lights.slice(0, start) + KEEP_SPECULAR + lights.slice(start, end) + SCALE_KEY_SPECULAR + lights.slice(end);
  shader.uniforms.vehicleKeyGlint = keyGlint;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float vehicleKeyGlint;')
    .replace('#include <lights_fragment_begin>', () => patched);
  return true;
}

function glintWithNight(material) {
  if (glinted.has(material) || typeof material.onBeforeCompile !== 'function') return;
  glinted.add(material);
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = function vehicleGlint(shader, renderer) {
    previous.call(this, shader, renderer);
    patchVehicleKeyGlint(shader);
  };
  material.customProgramCacheKey = function vehicleGlintKey() {
    return `${previousKey.call(this)}|vehicle_glint`;
  };
  material.needsUpdate = true;
}

/**
 * Starts scaling one vehicle material with the night (once; later calls do nothing).
 * @param {object | null | undefined} material A three.js material with envMapIntensity.
 */
export function trackVehicleMaterial(material) {
  if (!material || Array.isArray(material) || typeof material.envMapIntensity !== 'number' || tracked.has(material)) return;
  if (material.userData.dayEnvIntensity === undefined) material.userData.dayEnvIntensity = material.envMapIntensity;
  tracked.add(material);
  glintWithNight(material);
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
  keyGlint.value = nightGlintScale(n);
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
