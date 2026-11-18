// The Mirador de la Loma gets a paved terrace with a railing (QA bug 16), and arriving at a
// landmark or vantage point sends LANDMARK_REACHED once per visit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { planLookoutTerracePieces } from '../../../game/src/world/waterfront/lookoutTerraceLayout.js';
import { createLandmarkArrivals } from '../../../game/src/world/landmarkArrivals.js';
import { GAME_EVENTS } from '../../../game/src/core/events/gameEvents.js';

const plan = generateCityPlan(createSeededRandom(1));
const mirador = plan.vantagePoints.find((v) => v.id === 'mirador_de_la_loma');

test('the Mirador de la Loma has a paved terrace above the ground and a railing on three sides', () => {
  assert.ok(mirador, 'the plan has the vantage point');
  const pieces = planLookoutTerracePieces(plan).filter((p) => p.lookout === 'mirador_de_la_loma');
  const decks = pieces.filter((p) => p.kind === 'deck');
  const railings = pieces.filter((p) => p.kind === 'railing');
  assert.equal(decks.length, 1);
  assert.equal(railings.length, 3);
  const deck = decks[0];
  const ground = plan.heightAt(mirador.x, mirador.z);
  assert.ok(deck.ya >= ground, `deck ${deck.ya} above the ground ${ground}`);
  assert.ok(deck.ya - ground < 3, 'the terrace is not floating high');
  assert.ok(deck.thickness > 0.8, 'the plinth reaches down to the slope');
  for (const piece of pieces) assert.ok(Number.isInteger(piece.cell) && piece.cell >= 0);
  // The terrace lies toward the view.
  const toLook = [mirador.lookX - mirador.x, mirador.lookZ - mirador.z];
  const toDeck = [deck.bx - mirador.x, deck.bz - mirador.z];
  assert.ok(toLook[0] * toDeck[0] + toLook[1] * toDeck[1] > 0);
});

test('LANDMARK_REACHED fires once on arrival and again only after leaving', () => {
  const sent = [];
  const arrivals = createLandmarkArrivals(plan, { emit: (name, payload) => sent.push([name, payload]) });
  assert.ok(arrivals.places.length > 10);
  let t = 0;
  const visit = (x, z) => {
    t += 0.5;
    arrivals.update(x, z, t);
  };
  visit(mirador.x + 400, mirador.z + 400);
  assert.equal(sent.length, 0);
  visit(mirador.x + 3, mirador.z);
  visit(mirador.x + 2, mirador.z + 1);
  const reached = sent.filter(([, p]) => p.landmarkId === 'mirador_de_la_loma');
  assert.equal(reached.length, 1);
  assert.equal(reached[0][0], GAME_EVENTS.LANDMARK_REACHED);
  assert.equal(reached[0][1].kind, 'lookout');
  visit(mirador.x + 200, mirador.z);
  visit(mirador.x, mirador.z);
  assert.equal(sent.filter(([, p]) => p.landmarkId === 'mirador_de_la_loma').length, 2);
  const shop = plan.landmarks.find((l) => Number.isFinite(l.frontX));
  if (shop) {
    visit(shop.frontX, shop.frontZ);
    assert.ok(sent.some(([, p]) => p.landmarkId === shop.id && p.districtId === shop.district));
  }
});
