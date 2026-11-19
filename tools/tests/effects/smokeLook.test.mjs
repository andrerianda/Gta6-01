// The look of smoke (owner, shift 13: "the smoke looks weird", flat grey cotton balls): every
// smoke style erodes its edge with noise that grows with age (`wisp`), and the renderer gets the
// particle's age and wisp packed into its attributes; the rocket's trail is one overlapping rope
// and the back-blast a short burst that thins out fast.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTICLE_STYLES, STYLE_INDEX, STYLE_LIST, EFFECT_RECIPES, PARTICLE_CELLS } from '../../../game/src/effects/effectCatalogue.js';
import { createParticlePool, writeParticleLook, PARTICLE_ATTRIBUTE_FLOATS } from '../../../game/src/effects/particlePool.js';

const SMOKES = ['engineSmoke', 'fireSmoke', 'smokePlume', 'soot', 'smokeColumn', 'backblastSmoke', 'rocketSmoke', 'tyreSmoke', 'steam', 'muzzleSmoke', 'gunWisp', 'dustRing'];

test('every smoke style has a wispy, eroding edge', () => {
  for (const name of SMOKES) {
    const s = PARTICLE_STYLES[name];
    assert.ok(s.wisp > 0 && s.wisp <= 1, `${name} wisp in (0, 1]`);
    assert.ok(s.size[1] > s.size[0] * 2, `${name} grows over its life`);
    assert.ok((s.fadeOut ?? 0.5) >= 0.45, `${name} thins out slowly`);
  }
  for (const name of ['flame', 'flameCore', 'spark', 'muzzleFlash', 'rocketFlame', 'fireCore']) {
    assert.ok(!(PARTICLE_STYLES[name].wisp > 0), `${name} keeps a crisp edge`);
  }
  for (const s of STYLE_LIST) if (s.frame === PARTICLE_CELLS.smoke && (s.occlusion ?? 1) > 0) assert.ok(s.wisp > 0, 'a smoke-cell style without wisp');
});

test('the renderer gets the age and the wisp packed beside frame and occlusion', () => {
  const pool = createParticlePool(2);
  const style = PARTICLE_STYLES.rocketSmoke;
  pool.spawn(STYLE_INDEX.rocketSmoke, 2, 0, 1, 0, 0, 0, 0, 2, 1, 0, 0, 1, 0, 0);
  const look = new Float32Array(PARTICLE_ATTRIBUTE_FLOATS);
  writeParticleLook(pool, STYLE_LIST, 0, look, 0);
  assert.equal(Math.floor(look[17]), 2, 'frame');
  const young = look[17] - 2;
  pool.step(1.5, STYLE_LIST, 0, 0);
  writeParticleLook(pool, STYLE_LIST, 0, look, 0);
  assert.equal(Math.floor(look[17]), 2, 'frame kept');
  assert.ok(Math.abs((look[17] - 2) / 0.98 - 0.75) < 1e-3 && look[17] - 2 > young, 'age 0.75 of life');
  assert.equal(Math.floor(look[19]), Math.round(style.wisp * 10), 'wisp level');
  assert.ok(Math.abs((look[19] - Math.floor(look[19])) * 2 - style.occlusion) < 1e-5, 'occlusion');
});

test('the rocket trail is one overlapping rope; the back-blast is short and thin', () => {
  const trail = EFFECT_RECIPES.rocket_trail.bursts.find((b) => b.style === 'rocketSmoke');
  const gap = trail.streak / trail.count[0];
  assert.ok(gap < PARTICLE_STYLES.rocketSmoke.size[0] * trail.scale[0] * 0.8, 'neighbouring puffs overlap from birth');
  for (const burst of EFFECT_RECIPES.rocket_backblast.bursts) {
    if (burst.style !== 'backblastSmoke' && burst.style !== 'dustRing') continue;
    assert.ok(burst.life[1] <= 1.0, 'gone within a second');
  }
  assert.ok(PARTICLE_STYLES.backblastSmoke.wisp >= 0.9, 'breaks up at once');
  assert.ok(PARTICLE_STYLES.backblastSmoke.opacity <= 0.34);
});
