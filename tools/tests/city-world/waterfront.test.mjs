// Tests of the waterfront layout on the default plan: the promenade, the pier from it out over
// the sea, the marina pontoons and the port quay walls, all finite, short, owned by the sector
// of their midpoint, and the pier's deck reaching deep water.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { planWaterfrontPieces, WATERFRONT_PIECE_LENGTH } from '../../../game/src/world/waterfront/waterfrontLayout.js';

const plan = generateCityPlan(createSeededRandom(1));
const pieces = planWaterfrontPieces(plan);
const grid = plan.sectors;

test('every piece is finite, short and owned by the sector of its midpoint', () => {
  assert.ok(pieces.length > 100);
  for (const piece of pieces) {
    for (const key of ['ax', 'az', 'bx', 'bz']) assert.ok(Number.isFinite(piece[key]), `${piece.kind} ${key}`);
    assert.ok(Math.hypot(piece.bx - piece.ax, piece.bz - piece.az) <= WATERFRONT_PIECE_LENGTH + 1e-6);
    const c = Math.floor(((piece.ax + piece.bx) / 2 - grid.minX) / grid.size);
    const r = Math.floor(((piece.az + piece.bz) / 2 - grid.minZ) / grid.size);
    assert.equal(piece.cell, r * grid.columns + c);
    if (piece.kind === 'wall') assert.ok(piece.top > piece.bottom && Math.abs(Math.hypot(piece.nx, piece.nz) - 1) < 1e-6);
  }
  const kinds = new Set(pieces.map((piece) => piece.kind));
  for (const kind of ['deck', 'wall', 'railing', 'rail']) assert.ok(kinds.has(kind), kind);
});

test('the pier leaves the promenade, climbs to its deck and stands over deep water', () => {
  const pier = plan.specialAreas.find((area) => area.kind === 'pier');
  const promenade = plan.specialAreas.find((area) => area.kind === 'promenade');
  const decks = pieces.filter((piece) => piece.kind === 'deck' && piece.surface === 'planks' && piece.width >= pier.width);
  assert.ok(decks.length > 5);
  const first = decks[0];
  assert.ok(Math.abs(first.ya - promenade.y) < 1e-6, 'the ramp starts level with the promenade');
  assert.ok(decks.every((deck) => deck.yb <= pier.deckHeight + 1e-6));
  const deep = decks.filter((deck) => deck.piles && plan.heightAt(deck.bx, deck.bz) < -2);
  assert.ok(deep.length > 3, 'most of the deck is over the sea');
  // The promenade wall stands on the sea side: lower ground in front of it than behind.
  const walls = pieces.filter((piece) => piece.kind === 'wall' && piece.top > promenade.y);
  assert.ok(walls.length > 20);
  let seaward = 0;
  for (const wall of walls) {
    const mx = (wall.ax + wall.bx) / 2;
    const mz = (wall.az + wall.bz) / 2;
    if (plan.heightAt(mx + wall.nx * 8, mz + wall.nz * 8) <= plan.heightAt(mx - wall.nx * 8, mz - wall.nz * 8) + 0.01) seaward += 1;
  }
  assert.ok(seaward / walls.length > 0.9, `${seaward} of ${walls.length} walls face the sea`);
});

test('marina pontoons step down from the quay to a low deck, quay walls face the water', () => {
  const marina = plan.specialAreas.find((area) => area.kind === 'marina');
  if (!marina) return;
  const fingers = pieces.filter((piece) => piece.kind === 'deck' && piece.width < 2.5);
  assert.ok(fingers.length >= marina.fingers.length * 2);
  for (const finger of fingers) assert.ok(finger.yb <= finger.ya + 1e-6 && finger.yb >= 1 - 1e-6);
  const quayWalls = pieces.filter((piece) => piece.kind === 'wall' && piece.bottom < -3);
  let wet = 0;
  for (const wall of quayWalls) if (plan.heightAt((wall.ax + wall.bx) / 2 + wall.nx * 10, (wall.az + wall.bz) / 2 + wall.nz * 10) < 0.5) wet += 1;
  assert.ok(wet / quayWalls.length > 0.8, `${wet} of ${quayWalls.length} quay walls face water`);
});
