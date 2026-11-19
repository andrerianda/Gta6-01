// The city publishes the dressing's seats as seatsNear, where the crowd looks for them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenWorldCitySystem } from '../../../game/src/world/openWorldCity.js';
import { seatSourceOf } from '../../../game/src/pedestrians/crowdActivities.js';

test('openWorldCity.seatsNear is found by the crowd and is empty before the city streams', () => {
  const city = createOpenWorldCitySystem({});
  const source = seatSourceOf(city);
  assert.equal(typeof source, 'function');
  const out = [{ stale: true }];
  const seats = source(0, 0, 30, out);
  assert.equal(seats, out, 'reuses the array it was given');
  assert.equal(seats.length, 0);
  assert.deepEqual(city.seatsNear(10, 10, 5), []);
});
