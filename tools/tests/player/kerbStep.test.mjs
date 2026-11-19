// Shift 14: stepping up or down a kerb drew the lead (and moved the camera's target) a kerb's
// height (0.15 m) from one frame to the next: the capsule lands on the kerb's top within one fixed
// step. The step offset keeps the drawn height and eases it onto the new one in about 0.15 s;
// flat ground, slopes, jumps, landings and placings are drawn exactly as before.
import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { createOnFootMovement } from '../../../game/src/player/onFootMovement.js';

register('./vendoredThreeHook.mjs', import.meta.url);

const KERB = 0.15, STEP = 1 / 60;
const kerbAt = (edge) => (x) => (x > edge ? KERB : 0);
const plain = { x: 0, z: 0, sprint: false, walk: false, jump: false };

/**
 * Walks a lead along X (direction +1 or -1) at `speed` over `ground(x)` for `seconds`, the way
 * the figure hands the controller's velocity back every frame; a row per fixed step.
 */
function walk(ground, speed, seconds, { from = 0, direction = 1, jumpAt = NaN, movement } = {}) {
  const lead = movement ?? createOnFootMovement({ groundHeightAt: (x) => ground(x) });
  if (!movement) lead.placeAt(from, 0, (-Math.PI / 2) * direction);
  const rows = [];
  for (let i = 0; i < Math.round(seconds * 60); i += 1) {
    lead.follow(speed * direction, 0, (-Math.PI / 2) * direction, speed);
    plain.x = direction; plain.jump = i === jumpAt;
    lead.step(plain, STEP);
    const s = lead.state;
    rows.push({ x: s.x, body: s.y, offset: s.stepOffset, previous: s.previousStepOffset, drawn: s.y + s.stepOffset, grounded: s.grounded });
  }
  plain.jump = false;
  return { rows, lead };
}

/** The largest change from one row to the next of a column. */
const largestJump = (rows, key) => rows.reduce((most, row, i) => (i ? Math.max(most, Math.abs(row[key] - rows[i - 1][key])) : 0), 0);

test('up and down a kerb at a walk, a run and a sprint the drawn height eases over ~0.15 s', () => {
  for (const speed of [1.65, 4.3, 6.9]) {
    for (const [direction, from] of [[1, 0], [-1, 2]]) {
      const { rows } = walk(kerbAt(1), speed, 1.2, { from, direction });
      const label = `${speed} m/s ${direction > 0 ? 'up' : 'down'}`;
      assert.ok(largestJump(rows, 'body') > KERB - 1e-9, `${label}: the body takes the kerb in one step`);
      const eased = largestJump(rows, 'drawn');
      assert.ok(eased < 0.035, `${label}: the drawn height moves ${eased.toFixed(3)} m at most per step`);
      const at = rows.findIndex((row, i) => i > 0 && Math.abs(row.body - rows[i - 1].body) > 0.1);
      const top = rows[rows.length - 1].body;
      const after = (seconds) => rows[at + Math.round(seconds * 60)];
      assert.ok(Math.abs(after(0.15).drawn - top) < 0.15 * KERB, `${label}: most of the way within 0.15 s`);
      assert.ok(Math.abs(after(0.25).drawn - top) < 0.02 * KERB, `${label}: there within 0.25 s`);
      assert.equal(after(0.45).offset, 0, `${label}: the offset ends at exactly 0`);
      for (let i = 1; i < rows.length; i += 1) assert.equal(rows[i].previous, rows[i - 1].offset, 'frames blend the last two steps');
    }
  }
});

test('flat ground and slopes up to a sprint are drawn exactly as the body', () => {
  const grounds = [[() => 0, 6.9, 'flat'], [(x) => 0.5 * x, 6.9, '50 % slope, sprint'], [(x) => x, 1.65, '100 % slope, walk'],
    [(x) => 0.2 * Math.sin(x), 4.3, 'rolling ground, run']];
  for (const [ground, speed, label] of grounds) {
    for (const direction of [1, -1]) {
      const { rows } = walk(ground, speed, 1.5, { direction });
      assert.ok(rows.every((row) => row.offset === 0 && row.drawn === row.body), `${label}: no offset`);
    }
  }
});

test('jumps, landings on a kerb and placings are never eased', () => {
  const jump = walk(() => 0, 4.3, 1.5, { jumpAt: 5 });
  assert.ok(jump.rows.some((row) => !row.grounded), 'the lead was in the air');
  assert.ok(jump.rows.every((row) => row.offset === 0), 'a jump on flat ground: no offset');
  const onto = walk(kerbAt(1.6), 4.3, 1.2, { jumpAt: 0 });
  assert.ok(onto.rows[onto.rows.length - 1].body === KERB && onto.rows.every((row) => row.offset === 0), 'a landing on the kerb: drawn as it lands');
  // Placed 0.3 m over the ground (a teleport, a car's door): the first steps settle it, uneased.
  const lead = createOnFootMovement({ groundHeightAt: () => 0 });
  lead.placeAt(0, 0, 0, 0.3);
  const placed = walk(null, 0, 0.5, { movement: lead });
  assert.equal(placed.rows[placed.rows.length - 1].body, 0);
  assert.ok(placed.rows.every((row) => row.offset === 0), 'settling after placeAt: no offset');
  // Getting in right after a kerb (the transit carries the body): the offset still eases out.
  const door = walk(kerbAt(1), 4.3, 0.3);
  assert.ok(door.lead.state.stepOffset !== 0, 'easing up the kerb at the door');
  for (let i = 0; i < 30; i += 1) door.lead.coast(STEP);
  assert.equal(door.lead.state.stepOffset, 0);
  // Placed again in the middle of an ease: nothing carries over.
  const mid = walk(kerbAt(1), 4.3, 0.3);
  assert.ok(mid.rows.some((row) => row.offset !== 0), 'easing up the kerb');
  mid.lead.placeAt(5, 0, 0);
  assert.equal(mid.lead.state.stepOffset, 0);
  assert.equal(mid.lead.state.previousStepOffset, 0);
});

test('the camera\'s target follows the drawn height, so the view eases over a kerb too', async () => {
  const THREE = await import('three');
  const { createCameraDirector } = await import('../../../game/src/player/cameraDirector.js');
  const lead = createOnFootMovement({ groundHeightAt: (x) => kerbAt(1)(x) });
  lead.placeAt(0, 0, -Math.PI / 2);
  const player = { motion: lead.state, vehicle: null, down: null, figure: null, boarding: null };
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 1000);
  const context = {
    systems: { find: (name) => (name === 'player' ? player : null) },
    events: { emit() {} },
    focus: { position: {} },
    view: { camera },
    settings: { get: () => undefined },
    input: { lookX: 0, lookY: 0, held: () => false, pressed: () => false, axis: () => 0 },
    entities: { within: (x, z, r, f, out) => { out.length = 0; return out; } },
  };
  const director = createCameraDirector(context);
  const rows = [];
  for (let i = 0; i < 90; i += 1) {
    walk(null, 1.65, STEP, { movement: lead });
    director.sampleStep();
    director.frame(STEP, 1);
    rows.push({ body: lead.state.y, target: context.focus.position.y - 1, camera: camera.position.y });
  }
  assert.ok(largestJump(rows, 'body') > KERB - 1e-9, 'the body took the kerb in one step');
  assert.ok(largestJump(rows, 'target') < 0.035, `the camera's target moves ${largestJump(rows, 'target').toFixed(3)} m at most per step`);
  assert.ok(largestJump(rows, 'camera') < 0.01, 'the camera rises smoothly');
});
