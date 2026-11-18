// The far level of distant traffic: one shared 48-triangle car shape and 8 triangles of lamps,
// white at the nose (the game's forward, -Z) and red at the tail, bright enough to bloom at night.

import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const { createFarCarGeometry, createFarCarLampGeometry } = await import('../../../game/src/traffic/farCarProxy.js');
const { FAR_PROXY_DISTANCE } = await import('../../../game/src/traffic/distantTrafficBatches.js');

test('the far car is 48 triangles in the unit box, nose at -Z', () => {
  const body = createFarCarGeometry();
  const position = body.attributes.position;
  assert.equal(position.count / 3, 48);
  body.computeBoundingBox();
  const { min, max } = body.boundingBox;
  assert.deepEqual([min.x, min.y, min.z, max.x, max.y, max.z], [-0.5, 0, -0.5, 0.5, 1, 0.5]);
});

test('the far lamps: white heads at the nose, red tails at the back, above 1 to bloom', () => {
  const lamps = createFarCarLampGeometry();
  const { position, color } = lamps.attributes;
  assert.equal(position.count / 3, 8);
  for (let i = 0; i < position.count; i += 1) {
    const z = position.getZ(i);
    const [r, g, b] = [color.getX(i), color.getY(i), color.getZ(i)];
    if (z < 0) assert.ok(r > 1 && g > 1 && b > 1, 'head lamps white');
    else assert.ok(r > 1 && g < 0.3 && b < 0.3, 'tail lamps red');
  }
});

test('the far level starts beyond the promotion ring, where a car is a few pixels long', () => {
  assert.ok(FAR_PROXY_DISTANCE >= 200 && FAR_PROXY_DISTANCE <= 300);
});
