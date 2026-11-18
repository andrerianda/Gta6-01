// The ambience mix by place, hour and weather, and the footstep surface mapping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ambienceLevels, createAmbienceLevels, trafficByHour, DISTRICT_SOUND } from '../../../game/src/audio/ambienceMix.js';
import { footstepSurfaceOf, FOOTSTEP_SURFACES } from '../../../game/src/audio/footstepSounds.js';

const mix = (state) => ambienceLevels(createAmbienceLevels(), { hour: 13, ...state });

test('traffic peaks at the rush hours and is quiet in the small hours', () => {
  assert.ok(trafficByHour(8.2) > trafficByHour(3));
  assert.ok(trafficByHour(18.3) > trafficByHour(13));
  assert.ok(trafficByHour(3) < 0.3);
  for (let h = 0; h < 24; h += 0.5) {
    const v = trafficByHour(h);
    assert.ok(v >= 0 && v <= 1, `hour ${h}: ${v}`);
  }
  assert.equal(trafficByHour(-1), trafficByHour(23));
});

test('the centre is louder with traffic than the swamp, the swamp has more insects at night', () => {
  assert.ok(mix({ district: 'centro' }).traffic > mix({ district: 'los_pantanos' }).traffic * 2);
  const swampNight = mix({ district: 'los_pantanos', hour: 23, nightFactor: 1 });
  const centreNight = mix({ district: 'centro', hour: 23, nightFactor: 1 });
  assert.ok(swampNight.insects > centreNight.insects);
  assert.equal(mix({ district: 'los_pantanos', nightFactor: 0 }).insects, 0);
});

test('birds sing by day, more at dawn, never in rain; gulls and waves by the sea', () => {
  const dawn = mix({ district: 'las_lomas', hour: 7, nightFactor: 0 });
  const noon = mix({ district: 'las_lomas', hour: 13, nightFactor: 0 });
  assert.ok(dawn.birdsPerSecond > noon.birdsPerSecond);
  assert.equal(mix({ district: 'las_lomas', nightFactor: 1 }).birdsPerSecond, 0);
  assert.equal(mix({ district: 'las_lomas', rain: 1 }).birdsPerSecond, 0);
  const beach = mix({ district: 'playa_dorada', shoreDistance: 10 });
  const inland = mix({ district: 'playa_dorada', shoreDistance: 600 });
  assert.ok(beach.waves > 0.6 && inland.waves === 0);
  assert.ok(beach.gullsPerSecond > inland.gullsPerSecond);
});

test('rain and wind follow the atmosphere; unknown districts and every known one give finite levels', () => {
  const storm = mix({ district: 'centro', rain: 1, windSpeed: 16 });
  assert.equal(storm.rain, 1);
  assert.ok(storm.wind > mix({ district: 'centro', windSpeed: 2 }).wind);
  for (const id of [...Object.keys(DISTRICT_SOUND), null, 'nowhere']) {
    for (const hour of [0, 6.5, 13, 18.8, 23.9]) {
      const levels = mix({ district: id, hour, nightFactor: hour > 19.5 || hour < 6.5 ? 1 : 0, shoreDistance: -5 });
      for (const [key, value] of Object.entries(levels)) assert.ok(Number.isFinite(value) && value >= 0, `${id} ${hour} ${key}`);
    }
  }
});

test('footstep surfaces: street kinds, planted medians, ground kinds, decks over water', () => {
  assert.equal(footstepSurfaceOf('carriageway', false, null), 'asphalt');
  assert.equal(footstepSurfaceOf('pavement', false, null), 'concrete');
  assert.equal(footstepSurfaceOf('median', true, null), 'grass');
  assert.equal(footstepSurfaceOf('verge', false, null), 'grass');
  assert.equal(footstepSurfaceOf('ground', false, 'sand'), 'sand');
  assert.equal(footstepSurfaceOf(null, false, 'water'), 'wood');
  assert.equal(footstepSurfaceOf(null, false, null), 'concrete');
  for (const name of ['asphalt', 'concrete', 'grass', 'sand', 'dirt', 'wood', 'metal']) assert.ok(FOOTSTEP_SURFACES[name], name);
});
