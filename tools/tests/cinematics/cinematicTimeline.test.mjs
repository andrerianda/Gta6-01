// The cinematic timeline: order, tracks, waits, skip and seek; and the first-person path.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCinematicTimeline, ease } from '../../../game/src/cinematics/cinematicTimeline.js';
import { createSceneScript } from '../../../game/src/cinematics/sceneScript.js';

const names = (cues) => cues.map((cue) => cue.name ?? cue.kind);

function script(build) {
  const s = createSceneScript({ secondsOf: () => 2 });
  build(s);
  return s.script();
}

test('cues come due in time order, and in written order at the same time', () => {
  const timeline = createCinematicTimeline(script((s) => {
    s.at(2).mark('c');
    s.at(1).mark('a').mark('b');
    s.at(2).mark('d');
    s.at(4);
  }));
  assert.deepEqual(names(timeline.advance(0.5)), []);
  assert.deepEqual(names(timeline.advance(0.5)), ['a', 'b']);
  assert.deepEqual(names(timeline.advance(5)), ['c', 'd']);
  assert.equal(timeline.time, 4);
  assert.equal(timeline.done, true);
  assert.deepEqual(timeline.advance(1), []);
});

test('a cue with seconds is a track that interpolates and ends once with k = 1', () => {
  const timeline = createCinematicTimeline(script((s) => {
    s.at(1).fade({ to: 1, seconds: 2 });
    s.at(5);
  }));
  timeline.advance(1.5);
  assert.equal(timeline.tracks.length, 1);
  assert.ok(Math.abs(timeline.tracks[0].k - 0.25) < 1e-9);
  assert.equal(timeline.tracks[0].ended, false);
  timeline.advance(1);
  assert.ok(Math.abs(timeline.tracks[0].k - 0.75) < 1e-9);
  timeline.advance(1);
  assert.equal(timeline.tracks[0].k, 1);
  assert.equal(timeline.tracks[0].ended, true);
  timeline.advance(0.1);
  assert.equal(timeline.tracks.length, 0);
  assert.equal(timeline.done, false);
});

test('easings stay within 0..1 and meet their ends', () => {
  for (const name of ['linear', 'smooth', 'in', 'out', 'unknown']) {
    assert.equal(ease(name, 0), 0);
    assert.equal(ease(name, 1), 1);
    assert.equal(ease(name, 3), 1);
  }
  assert.ok(ease('in', 0.5) < 0.5 && ease('out', 0.5) > 0.5);
});

test('waitFor holds the clock until the token resumes it', () => {
  const timeline = createCinematicTimeline(script((s) => {
    s.at(1).mark('before').waitFor('answer', { timeout: 10 }).mark('after');
    s.at(3).mark('later');
  }));
  assert.deepEqual(names(timeline.advance(2)), ['before', 'waitFor']);
  assert.equal(timeline.time, 1);
  assert.equal(timeline.waiting, 'answer');
  assert.deepEqual(timeline.advance(3), []);
  assert.equal(timeline.time, 1);
  assert.equal(timeline.resume('another'), false);
  assert.equal(timeline.resume('answer'), true);
  assert.equal(timeline.waiting, null);
  assert.deepEqual(names(timeline.advance(0.5)), ['after']);
  assert.equal(timeline.time, 1.5);
  assert.equal(timeline.resume('answer'), false);
});

test('a wait runs out by itself and the rest of the frame is played', () => {
  const timeline = createCinematicTimeline(script((s) => {
    s.at(1).waitFor('never', { timeout: 2 });
    s.at(1.5).mark('after');
    s.at(4);
  }));
  timeline.advance(1);
  assert.equal(timeline.waiting, 'never');
  assert.deepEqual(timeline.advance(1.5), []);
  assert.deepEqual(names(timeline.advance(1)), ['after']);
  assert.ok(Math.abs(timeline.time - 1.5) < 1e-9);
  assert.equal(timeline.done, false);
  assert.equal(timeline.resume(), false);
});

test('resume without a token releases any wait', () => {
  const timeline = createCinematicTimeline(script((s) => { s.waitFor('x', { timeout: 99 }); s.at(1); }));
  timeline.advance(0.1);
  assert.equal(timeline.resume(), true);
  timeline.advance(2);
  assert.equal(timeline.done, true);
});

test('skip returns exactly the essential cues that had not fired, in order', () => {
  const ran = [];
  const timeline = createCinematicTimeline(script((s) => {
    s.mark('fired_already');
    s.at(1).line('l1');
    s.at(2).mark('m1').run(() => ran.push('plain')).run(() => ran.push('essential'), { essential: true });
    s.at(3).waitFor('x').sound('breath').mark('m2');
    s.at(6);
  }));
  timeline.advance(1.2);
  const essential = timeline.skip();
  assert.deepEqual(essential.map((cue) => cue.name ?? cue.kind), ['m1', 'run', 'm2']);
  for (const cue of essential) assert.equal(cue.essential, true);
  essential.find((cue) => cue.kind === 'run').fn();
  assert.deepEqual(ran, ['essential']);
  assert.equal(timeline.done, true);
  assert.equal(timeline.time, 6);
  assert.deepEqual(timeline.skip(), []);
  assert.deepEqual(timeline.advance(1), []);
});

test('seek jumps to a time, returns the cues crossed and leaves the tracks at their progress', () => {
  const timeline = createCinematicTimeline(script((s) => {
    s.fade({ to: 0, seconds: 1 });
    s.at(2).waitFor('x').shot({ from: { position: { x: 0, y: 1, z: 0 } }, seconds: 4 });
    s.at(8).mark('end');
    s.at(10);
  }));
  const crossed = timeline.seek(5);
  assert.deepEqual(names(crossed), ['fade', 'waitFor', 'shot']);
  assert.equal(timeline.time, 5);
  assert.equal(timeline.waiting, null);
  const fade = timeline.tracks.find((track) => track.cue.kind === 'fade');
  const shot = timeline.tracks.find((track) => track.cue.kind === 'shot');
  assert.equal(fade.k, 1);
  assert.equal(fade.ended, true);
  assert.ok(Math.abs(shot.k - 0.75) < 1e-9);
  assert.deepEqual(names(timeline.advance(3)), ['end']);
  assert.deepEqual(names(timeline.seek(0.5)), ['fade']);
  assert.equal(timeline.seek(99).length, 4);
  assert.equal(timeline.time, 10);
});

test('the duration covers the last track and done needs the clock to reach it', () => {
  const timeline = createCinematicTimeline({ cues: [{ kind: 'card', t: 1, seconds: 3 }] });
  assert.equal(timeline.duration, 4);
  timeline.advance(2);
  assert.equal(timeline.done, false);
  timeline.advance(2.5);
  assert.equal(timeline.done, true);
  assert.equal(timeline.time, 4);
});
