// Cars reflect the sky less at night (vehicleNightReflections.js; QA blocker: light metallic
// paint glowed like a lamp at night exposure). Day strength kept, night scaled, clones and
// materials made at night start from the day value, nothing done while the night stands still.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const {
  NIGHT_REFLECTION_CUT, dayEnvironmentOf, nightReflectionScale, trackVehicleMaterial, trackVehicleMaterialsOf, untrackVehicleMaterial,
  updateVehicleNightReflections,
} = await import('../../../game/src/vehicles/vehicleNightReflections.js');

test('vehicle materials reflect the sky at full strength by day and much less at night', () => {
  const paint = new THREE.MeshPhysicalMaterial({ name: 'paint', metalness: 1, envMapIntensity: 1.35 });
  const car = new THREE.Group();
  car.add(new THREE.Mesh(new THREE.BoxGeometry(), paint), new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  updateVehicleNightReflections(0);
  trackVehicleMaterialsOf(car);
  assert.equal(paint.envMapIntensity, 1.35, 'golden hour and day: unchanged');

  assert.equal(updateVehicleNightReflections(1), true);
  assert.ok(Math.abs(paint.envMapIntensity - 1.35 * (1 - NIGHT_REFLECTION_CUT)) < 1e-9, 'night: cut');
  assert.equal(updateVehicleNightReflections(0.995), false, 'no pass while the night barely moves');
  assert.equal(dayEnvironmentOf(paint), 1.35, 'the day value is kept');

  // A paint variant cloned at night and a merged material built at night start from the day value.
  const variant = paint.clone();
  trackVehicleMaterial(variant);
  assert.ok(Math.abs(variant.envMapIntensity - paint.envMapIntensity) < 1e-9);
  const merged = new THREE.MeshStandardMaterial({ envMapIntensity: dayEnvironmentOf(paint) });
  trackVehicleMaterial(merged);
  assert.ok(Math.abs(merged.envMapIntensity - paint.envMapIntensity) < 1e-9);

  updateVehicleNightReflections(0);
  assert.equal(paint.envMapIntensity, 1.35, 'back to day');
  assert.equal(variant.envMapIntensity, 1.35);
  assert.ok(nightReflectionScale(0.5) < 1 && nightReflectionScale(0.5) > nightReflectionScale(1), 'dusk in between');
  for (const material of [paint, variant, merged]) untrackVehicleMaterial(material);
});

test('the moon glints on the cars only at night: untouched by day and at the judged dusk (night 0.31)', async () => {
  const { NIGHT_GLINT_KEEP, nightGlintScale, patchVehicleKeyGlint, useVehicleShaderChunks } = await import('../../../game/src/vehicles/vehicleNightReflections.js');
  useVehicleShaderChunks(THREE.ShaderChunk);
  assert.equal(nightGlintScale(0), 1);
  assert.equal(nightGlintScale(0.31), 1, 'dusk-on-foot picture');
  assert.equal(nightGlintScale(0.4), 1);
  assert.ok(Math.abs(nightGlintScale(1) - NIGHT_GLINT_KEEP) < 1e-12);
  assert.ok(nightGlintScale(0.7) < 1 && nightGlintScale(0.7) > NIGHT_GLINT_KEEP);

  // The shader patch wraps only the directional lights' loop and keeps a material's own hook.
  const lights = THREE.ShaderChunk.lights_fragment_begin;
  const shader = { uniforms: {}, fragmentShader: THREE.ShaderChunk.meshphysical_frag };
  assert.equal(patchVehicleKeyGlint(shader, lights), true);
  const text = shader.fragmentShader;
  const keep = text.indexOf('vehicleSpecularBeforeKey = reflectedLight.directSpecular');
  const directional = text.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
  const scale = text.indexOf('mix( vehicleSpecularBeforeKey, reflectedLight.directSpecular, vehicleKeyGlint )');
  assert.ok(keep > 0 && keep < directional && directional < scale && scale < text.indexOf('#if ( NUM_RECT_AREA_LIGHTS > 0 )'));
  assert.ok(text.includes('uniform float vehicleKeyGlint;') && !text.includes('#include <lights_fragment_begin>'));
  assert.equal(patchVehicleKeyGlint({ uniforms: {}, fragmentShader: 'void main() {}' }, lights), false, 'unlit shaders untouched');
  assert.equal(patchVehicleKeyGlint({ uniforms: {}, fragmentShader: THREE.ShaderChunk.meshphysical_frag }, 'other build'), false);

  let ownHook = 0;
  const merged = new THREE.MeshStandardMaterial({ name: 'vehicle_merged' });
  merged.onBeforeCompile = () => { ownHook += 1; };
  merged.customProgramCacheKey = () => 'vehicle_merged_v2';
  updateVehicleNightReflections(0);
  trackVehicleMaterial(merged);
  const compiled = { uniforms: {}, fragmentShader: THREE.ShaderChunk.meshphysical_frag };
  merged.onBeforeCompile(compiled, null);
  assert.equal(ownHook, 1, 'the merged level keeps its own patch');
  assert.match(merged.customProgramCacheKey(), /^vehicle_merged_v2\|/);
  assert.equal(compiled.uniforms.vehicleKeyGlint.value, 1, 'by day');
  updateVehicleNightReflections(1);
  assert.ok(Math.abs(compiled.uniforms.vehicleKeyGlint.value - NIGHT_GLINT_KEEP) < 1e-12, 'at night');
  updateVehicleNightReflections(0.31);
  assert.equal(compiled.uniforms.vehicleKeyGlint.value, 1, 'back at dusk');
  updateVehicleNightReflections(0);
  untrackVehicleMaterial(merged);
});

test('lit lamps of the full-part model are capped at night (no white or red blob over the rear)', async () => {
  const { NIGHT_LAMP_INTENSITY, nightLampIntensity } = await import('../../../game/src/vehicles/vehicleNightReflections.js');
  const reverse = new THREE.MeshStandardMaterial({ name: 'lamp_reverse', emissive: 0xffffff, emissiveIntensity: 10 });
  reverse.userData.litIntensity = 10;
  reverse.userData.lit = true;
  const off = reverse.clone();
  off.emissiveIntensity = 0;
  off.userData.lit = false;
  updateVehicleNightReflections(0);
  trackVehicleMaterial(reverse);
  trackVehicleMaterial(off);
  assert.equal(reverse.emissiveIntensity, 10, 'full by day');
  updateVehicleNightReflections(1);
  assert.equal(reverse.emissiveIntensity, NIGHT_LAMP_INTENSITY);
  assert.equal(off.emissiveIntensity, 0, 'an unlit lamp stays dark');
  assert.equal(nightLampIntensity(2, 1), 2, 'a dim lamp is not raised');
  updateVehicleNightReflections(0);
  assert.equal(reverse.emissiveIntensity, 10);
  untrackVehicleMaterial(reverse);
  untrackVehicleMaterial(off);
});
