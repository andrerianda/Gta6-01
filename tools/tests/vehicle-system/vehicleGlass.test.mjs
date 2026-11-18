// Vehicle glass tuning: lighter window glass, darker solid roof glass, lenses untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOF_NIGHT_REFLECTION, ROOF_OPACITY_MIN, WINDOW_OPACITY_MAX, tunedGlassLook, tuneVehicleGlass,
} from '../../../game/src/vehicles/vehicleGlass.js';
import { nightReflectionScale } from '../../../game/src/vehicles/vehicleNightReflections.js';

const colour = (r, g, b) => ({ r, g, b, setRGB(nr, ng, nb) { this.r = nr; this.g = ng; this.b = nb; } });

test('window glass is lighter and less opaque, still tinted', () => {
  const sports = tunedGlassLook('glass', { opacity: 0.72, color: { r: 0.05, g: 0.062, b: 0.07 } });
  assert.ok(sports.opacity <= WINDOW_OPACITY_MAX && sports.opacity < 0.72 && sports.opacity >= 0.3);
  assert.ok(sports.color.r > 0.05 && sports.color.r < 0.16);
  const pale = tunedGlassLook('glass', { opacity: 0.4, color: { r: 0.3, g: 0.37, b: 0.4 } });
  assert.ok(pale.opacity <= 0.4);
  assert.deepEqual(pale.color, { r: 0.3, g: 0.37, b: 0.4 }, 'a pale tint is not lifted');
});

test('roof and rear glass are darker and nearly solid, keep night reflection', () => {
  const rear = tunedGlassLook('glass_rear', { opacity: 0.88, color: { r: 0.03, g: 0.036, b: 0.042 } });
  assert.ok(rear.opacity >= ROOF_OPACITY_MIN);
  assert.ok(rear.color.r < 0.03);
  assert.equal(rear.nightReflection, ROOF_NIGHT_REFLECTION);
  assert.ok(nightReflectionScale(1, rear.nightReflection) > nightReflectionScale(1));
  assert.equal(nightReflectionScale(0, rear.nightReflection), 1);
});

test('lenses and blur discs are left alone', () => {
  assert.equal(tunedGlassLook('glass_lens', { opacity: 0.3, color: { r: 0.1, g: 0.1, b: 0.1 } }), null);
  assert.equal(tunedGlassLook('blur', { opacity: 0.22, color: { r: 0.05, g: 0.05, b: 0.05 } }), null);
});

test('an asset is tuned once', () => {
  const glass = { name: 'glass', opacity: 0.72, color: colour(0.05, 0.062, 0.07), userData: {} };
  const asset = { materials: new Map([['glass', glass]]) };
  tuneVehicleGlass(asset);
  const once = glass.opacity;
  tuneVehicleGlass(asset);
  assert.equal(glass.opacity, once);
  assert.equal(glass.userData.sourceGlass.opacity, 0.72);
});
