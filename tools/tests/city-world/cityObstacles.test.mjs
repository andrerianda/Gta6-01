// The city publishes the dressing's pavement obstacles as obstaclesNear, where the crowd's
// obstacle gatherer (pedestrians/pavementObstacles.js) looks for them before the physics statics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenWorldCitySystem } from '../../../game/src/world/openWorldCity.js';
import { createCircleList, createPavementObstacles } from '../../../game/src/pedestrians/pavementObstacles.js';

test('openWorldCity.obstaclesNear is empty before the city streams and reuses the array', () => {
  const city = createOpenWorldCitySystem({});
  assert.equal(typeof city.obstaclesNear, 'function');
  const out = [{ stale: true }];
  assert.equal(city.obstaclesNear(0, 0, 30, out), out);
  assert.equal(out.length, 0);
  assert.deepEqual(city.obstaclesNear(10, 10, 5), []);
});

test('the crowd asks openWorldCity.obstaclesNear first, and the colliders while it has none', () => {
  const city = createOpenWorldCitySystem({});
  const answer = city.obstaclesNear;
  let cityAsked = 0;
  city.obstaclesNear = (...args) => { cityAsked += 1; return answer(...args); };
  let physicsAsked = false;
  const context = { focus: { position: { x: 0, y: 0, z: 0 } }, simulation: { time: 0 }, systems: { find: () => { physicsAsked = true; return null; } } };
  const gatherer = createPavementObstacles(context, city);
  const circles = createCircleList();
  // Before streaming the city publishes nothing: the crowd falls back to the physics statics.
  assert.equal(gatherer.gather(0, 0, 0, circles), 0);
  assert.ok(cityAsked > 0, 'the city was asked');
  assert.equal(gatherer.published, 0);
  assert.equal(physicsAsked, true);
});
