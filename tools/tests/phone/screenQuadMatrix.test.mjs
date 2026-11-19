// The live screen's perspective: the homography takes the screen's corners onto the rendered
// handset's corners, and the story's phone calls ring the handset.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PHONE_PICTURE, SCREEN_SIZE, projectPoint, quadHomography, screenQuadTransform,
} from '../../../game/src/ui/call/screenQuadMatrix.js';
import { createStoryPhoneCalls } from '../../../game/src/missions/storyPhoneCalls.js';

const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-6, `${what}: ${actual} vs ${expected}`);

test('the four corners land on the quadrilateral', () => {
  const { width, height } = SCREEN_SIZE;
  const m = quadHomography(width, height, PHONE_PICTURE.corners);
  const sources = [[0, 0], [width, 0], [width, height], [0, height]];
  sources.forEach(([x, y], index) => {
    const [px, py] = projectPoint(m, x, y);
    near(px, PHONE_PICTURE.corners[index][0], `corner ${index} x`);
    near(py, PHONE_PICTURE.corners[index][1], `corner ${index} y`);
  });
});

test('a rectangle maps without perspective and its centre to its centre', () => {
  const m = quadHomography(100, 200, [[10, 20], [60, 20], [60, 120], [10, 120]]);
  near(m[6], 0, 'g');
  near(m[7], 0, 'h');
  const [x, y] = projectPoint(m, 50, 100);
  near(x, 35, 'centre x');
  near(y, 70, 'centre y');
});

test('straight lines stay straight: the centre lies on both diagonals', () => {
  const corners = PHONE_PICTURE.corners;
  const m = quadHomography(SCREEN_SIZE.width, SCREEN_SIZE.height, corners);
  const [x, y] = projectPoint(m, SCREEN_SIZE.width / 2, SCREEN_SIZE.height / 2);
  const cross = (a, b) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  near(cross(corners[0], corners[2]), 0, 'diagonal one');
  near(cross(corners[1], corners[3]), 0, 'diagonal two');
});

test('the CSS matrix3d is column-major with the perspective terms in the fourth row', () => {
  const m = quadHomography(SCREEN_SIZE.width, SCREEN_SIZE.height, PHONE_PICTURE.corners);
  const text = screenQuadTransform(SCREEN_SIZE.width, SCREEN_SIZE.height, PHONE_PICTURE.corners);
  const values = text.slice('matrix3d('.length, -1).split(',').map(Number);
  assert.equal(values.length, 16);
  const expected = [m[0], m[3], 0, m[6], m[1], m[4], 0, m[7], 0, 0, 1, 0, m[2], m[5], 0, 1];
  values.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-6, `value ${index}`));
});

test('the screen sits inside the picture', () => {
  for (const [x, y] of PHONE_PICTURE.corners) {
    assert.ok(x > 0 && x < PHONE_PICTURE.width && y > 0 && y < PHONE_PICTURE.height);
  }
});

function story() {
  const said = [];
  const say = {
    message: (from, text, missionId) => said.push(['message', from, missionId ?? null]),
    speak: (from) => said.push(['speak', from]),
    notify: (text) => said.push(['notify', text]),
    ring: (callId, callerId) => { said.push(['ring', callId, callerId]); return say.canRing; },
    canRing: true,
  };
  const missions = { m01: { giver: 'hattie_tolliver', title: 'Hook and Chain', summary: 'Tow the car. Then run.' } };
  const calls = createStoryPhoneCalls(say, { missions, nameOf: (id) => id, placeOf: () => ({ name: 'the yard' }) });
  return { said, say, calls };
}

test('a giver rings the handset; the text and the notice follow the end of the call', () => {
  const { said, calls } = story();
  calls.opening('m01', 1);
  calls.update(1.1);
  assert.deepEqual(said, [['ring', 'giver:m01', 'hattie_tolliver']]);
  calls.callEnded('giver:other', 'missed');
  assert.equal(said.length, 1);
  calls.callEnded('giver:m01', 'missed');
  assert.deepEqual(said[1], ['message', 'hattie_tolliver', 'm01']);
  calls.update(2);
  assert.deepEqual(said[2], ['notify', 'Hook and Chain: hattie_tolliver waits at the yard.']);
  assert.equal(said.some((entry) => entry[0] === 'speak'), false, 'the handset speaks the line, not the story');
});

test('with no handset the call falls back to the text and the subtitle at once', () => {
  const { said, say, calls } = story();
  say.canRing = false;
  calls.opening('m01', 0);
  calls.update(0.1);
  assert.deepEqual(said.slice(1).map((entry) => entry[0]), ['message', 'speak']);
  calls.update(7);
  assert.equal(said.at(-1)[0], 'notify');
});
