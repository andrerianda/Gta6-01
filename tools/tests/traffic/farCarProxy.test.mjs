// The far level of distant traffic: one shared 84-triangle car shape and 8 triangles of lamps,
// white at the nose (the game's forward, -Z) and red at the tail, bright enough to bloom at night.

import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const { FAR_CAR_TRIANGLES, FAR_LAMP_TRIANGLES, createFarCarGeometry, createFarCarLampGeometry } = await import('../../../game/src/traffic/farCarProxy.js');
const { FAR_PROXY_DISTANCE } = await import('../../../game/src/traffic/distantTrafficBatches.js');

test('the far car is a light shape in the unit box, its faces pointing out', () => {
  const body = createFarCarGeometry();
  const { position, normal } = body.attributes;
  assert.equal(position.count / 3, FAR_CAR_TRIANGLES);
  assert.ok(FAR_CAR_TRIANGLES <= 120, 'a few dozen triangles, not a model level');
  // Every triangle winds counter-clockwise seen from outside: its face normal agrees with the stored one.
  for (let i = 0; i < position.count; i += 3) {
    const p = [0, 1, 2].map((k) => [position.getX(i + k), position.getY(i + k), position.getZ(i + k)]);
    const u = p[1].map((v, k) => v - p[0][k]);
    const w = p[2].map((v, k) => v - p[0][k]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    assert.ok(n[0] * normal.getX(i) + n[1] * normal.getY(i) + n[2] * normal.getZ(i) > 0, `triangle ${i / 3} faces in`);
  }
  body.computeBoundingBox();
  const { min, max } = body.boundingBox;
  assert.deepEqual([min.x, min.y, min.z, max.x, max.y, max.z], [-0.5, 0, -0.5, 0.5, 1, 0.5]);
});

test('the far lamps: white heads at the nose, red tails at the back, above 1 to bloom', () => {
  const lamps = createFarCarLampGeometry();
  const { position, color } = lamps.attributes;
  assert.equal(position.count / 3, FAR_LAMP_TRIANGLES);
  for (let i = 0; i < position.count; i += 1) {
    const z = position.getZ(i);
    const [r, g, b] = [color.getX(i), color.getY(i), color.getZ(i)];
    if (z < 0) assert.ok(r > 1 && g > 1 && b > 1, 'head lamps white');
    else assert.ok(r > 1 && g < 0.3 && b < 0.3, 'tail lamps red');
  }
});

test('the far level starts where a car is a couple of dozen pixels long, inside the distant ring', () => {
  assert.ok(FAR_PROXY_DISTANCE >= 90 && FAR_PROXY_DISTANCE <= 160);
});
