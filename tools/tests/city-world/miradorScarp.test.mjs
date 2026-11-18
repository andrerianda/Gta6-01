// The Mirador de la Loma looks down on the city: the plan carves a scarp in front of its terrace,
// so from the railing the line of sight clears the hill and reaches Centro, and the access road
// side is left alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { lookoutScarpDrop, MIRADOR_LOOKOUT, MIRADOR_SCARP } from '../../../game/src/world/plan/terrainHeightField.js';

const plan = generateCityPlan(createSeededRandom(1));
const mirador = plan.vantagePoints.find((point) => point.id === 'mirador_de_la_loma');
const length = Math.hypot(mirador.lookX - mirador.x, mirador.lookZ - mirador.z);
const dx = (mirador.lookX - mirador.x) / length;
const dz = (mirador.lookZ - mirador.z) / length;
const groundAlong = (s) => plan.heightAt(mirador.x + dx * s, mirador.z + dz * s);

test('the scarp spares the terrace and the access road, and drops the hill in front of it', () => {
  const look = { e: MIRADOR_LOOKOUT.lookE - MIRADOR_LOOKOUT.e, n: MIRADOR_LOOKOUT.lookN - MIRADOR_LOOKOUT.n };
  const l = Math.hypot(look.e, look.n);
  const at = (along, across) => lookoutScarpDrop(
    MIRADOR_LOOKOUT.e + (look.e * along - look.n * -across) / l,
    MIRADOR_LOOKOUT.n + (look.n * along + look.e * -across) / l,
  );
  for (const along of [-30, 0, 6, 11.5, MIRADOR_SCARP.edge]) assert.equal(at(along, 0), 0, `terrace at ${along} m`);
  assert.ok(Math.abs(at(60, 0) - MIRADOR_SCARP.drop) < 0.01, 'full drop past the face');
  assert.equal(at(MIRADOR_SCARP.fadeTo + 1, 0), 0, 'gone far out');
  assert.equal(lookoutScarpDrop(1040, 575), 0, 'the Mirador road stays where it is');
  assert.equal(lookoutScarpDrop(980, 560), 0);
});

test('from the terrace railing the city below is in sight (not hidden by the hill crown)', () => {
  const railing = 10;
  let terrace = -Infinity;
  for (let s = 1.5; s <= 11.5; s += 1) terrace = Math.max(terrace, groundAlong(s));
  const eye = terrace + 0.15 + 1.7;
  // Steepest rise of the ground toward the eye so far (the horizon the hill makes).
  let horizon = -Infinity;
  let cityInSight = 0;
  let citySamples = 0;
  for (let s = 12; s <= 1000; s += 4) {
    const slope = (groundAlong(s) - eye) / (s - railing);
    const visible = slope >= horizon;
    if (s >= 600) {
      citySamples += 1;
      if (visible) cityInSight += 1;
    }
    horizon = Math.max(horizon, slope);
  }
  assert.ok(groundAlong(40) < groundAlong(8) - 12, `a drop in front: ${groundAlong(8).toFixed(1)} -> ${groundAlong(40).toFixed(1)}`);
  assert.ok(cityInSight / citySamples > 0.6, `city ground 600-1000 m out in sight: ${cityInSight}/${citySamples}`);
});
