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
