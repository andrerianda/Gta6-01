// Tests of the mission markers' fade: gone within the radius plus a metre of the lead or the
// camera (a shell or beam seen from inside is a slab of light over the picture), back to full
// over the next couple of metres, eased over frames rather than snapped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKER_CLEAR_MARGIN, MARKER_FADE_BAND, easeFade, markerFade, nearestViewerGap } from '../../../game/src/missions/markerFade.js';

test('a marker is gone inside its radius plus a metre and full beyond the band', () => {
  for (const radius of [0.6, 0.8, 2.2]) {
    assert.equal(markerFade(0, radius), 0);
    assert.equal(markerFade(radius, radius), 0);
    assert.equal(markerFade(radius + MARKER_CLEAR_MARGIN, radius), 0);
    const mid = markerFade(radius + MARKER_CLEAR_MARGIN + MARKER_FADE_BAND / 2, radius);
    assert.ok(mid > 0.3 && mid < 0.7, `half way ${mid}`);
    assert.equal(markerFade(radius + MARKER_CLEAR_MARGIN + MARKER_FADE_BAND, radius), 1);
    assert.equal(markerFade(60, radius), 1);
  }
  // The aim view of the firefight: the beam (0.6 m, ring 2.2 m) centred where the lead stands,
  // the camera 1.5 m away: nothing of it may show.
  assert.equal(markerFade(nearestViewerGap(0, 0, { x: 0, z: 0 }, { x: 1.2, z: -0.9 }), 2.2), 0);
  // Rising monotonically with distance.
  let last = -1;
  for (let d = 0; d < 10; d += 0.1) { const f = markerFade(d, 2.2); assert.ok(f >= last); last = f; }
});

test('the nearer of the lead and the camera decides; no viewer means far away', () => {
  assert.equal(nearestViewerGap(0, 0, { x: 3, z: 4 }, { x: 30, z: 0 }), 5);
  assert.equal(nearestViewerGap(0, 0, { x: 30, z: 0 }, { x: 0, z: 2 }), 2);
  assert.equal(nearestViewerGap(0, 0, null, { x: 0, z: 2 }), 2);
  assert.equal(nearestViewerGap(0, 0, null, null), Infinity);
  assert.equal(markerFade(Infinity, 2.2), 1);
});

test('the fade eases over frames at any frame rate and settles exactly', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
    let fade = 1;
    let frames = 0;
    const first = easeFade(fade, 0, dt);
    assert.ok(first > 0.5 && first < 1, `no snap at dt ${dt}: ${first}`);
    while (fade > 0 && frames < 2000) { fade = easeFade(fade, 0, dt); frames += 1; }
    assert.equal(fade, 0);
    assert.ok(frames * dt > 0.2 && frames * dt < 1.2, `settles in ${frames * dt} s`);
  }
  assert.equal(easeFade(0.5, 0.5, 1 / 60), 0.5);
  assert.equal(easeFade(0.2, 1, 5), 1, 'a long hitch lands on the target, never past it');
});
