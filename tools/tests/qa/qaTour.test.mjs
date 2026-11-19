// Checks tools/qa-tour.mjs without a browser: every part builds an in-page snippet that parses as
// a JavaScript expression, and the tour covers the places of docs/CITY_PLAN.md the QA brief names.
// Run with:  node --test "tools/tests/qa/*.test.mjs"
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QA_TOUR_PARTS, buildTourSnippet } from '../../qa-tour.mjs';

test('each part builds a snippet that parses', () => {
  for (const [part, places] of Object.entries(QA_TOUR_PARTS)) {
    const snippet = buildTourSnippet({ part, places, golden: 18.83, night: 22.5, jpeg: 0.66 });
    assert.doesNotThrow(() => new Function(`return ${snippet};`), `part ${part}`);
    assert.ok(snippet.includes('MARAZUL'), `part ${part} drives window.MARAZUL`);
  }
});

test('the tour visits the places the QA brief names', () => {
  const visited = new Set([...QA_TOUR_PARTS.streets, ...QA_TOUR_PARTS.districts]);
  for (const place of ['bulevar_dorado', 'gran_via_marazul', 'signal_junction', 'beach_and_pier', 'calzada_coral',
    'marina', 'port_quay', 'barrio_hierro', 'las_lomas', 'los_pantanos', 'isla_coral']) {
    assert.ok(visited.has(place), place);
  }
  assert.deepEqual(QA_TOUR_PARTS.loops, []);
});
