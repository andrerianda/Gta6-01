// The scene script builder: cursor arithmetic, line lengths, the data it returns.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTOR_GESTURES, CUE_KINDS, DEFAULT_LINE_GAP, DEFAULT_LINE_SECONDS, createSceneScript } from '../../../game/src/cinematics/sceneScript.js';

const view = { position: { x: 0, y: 2, z: 5 }, target: { x: 0, y: 1, z: 0 }, fov: 40 };

test('cues land at the cursor; at() sets it and wait() moves it', () => {
  const s = createSceneScript();
  s.fade({ to: 0, seconds: 2 });
  s.wait(1.5).shot({ from: view, seconds: 3 });
  s.at(10).mark('late');
  s.wait(-20).mark('clamped');
  const { cues } = s.script();
  assert.deepEqual(cues.map((cue) => [cue.kind, cue.t]), [['fade', 0], ['shot', 1.5], ['mark', 10], ['mark', 0]]);
  assert.equal(s.time, 0);
});

test('only line() moves the cursor by itself: its seconds plus the gap', () => {
  const seconds = { a: 2, b: 4.5 };
  const s = createSceneScript({ secondsOf: (id) => seconds[id] });
  s.shot({ from: view, seconds: 9 });
  assert.equal(s.time, 0);
  s.line('a');
  assert.ok(Math.abs(s.time - (2 + DEFAULT_LINE_GAP)) < 1e-9);
  s.line('b', { gap: 1 });
  assert.ok(Math.abs(s.time - (2 + DEFAULT_LINE_GAP + 5.5)) < 1e-9);
  const before = s.time;
  s.line('a', { advance: false });
  assert.equal(s.time, before);
  const lines = s.script().cues.filter((cue) => cue.kind === 'line');
  assert.deepEqual(lines.map((cue) => cue.seconds), [2, 4.5, 2]);
  assert.ok(Math.abs(lines[1].t - (2 + DEFAULT_LINE_GAP)) < 1e-9);
});

test('line lengths come from the tools when the options have none, else a default', () => {
  const fromTools = createSceneScript({}, { secondsOf: () => 7 });
  fromTools.line('x', { gap: 0 });
  assert.equal(fromTools.time, 7);
  const plain = createSceneScript();
  plain.line('x', { gap: 0 });
  assert.equal(plain.time, DEFAULT_LINE_SECONDS);
});

test('the duration is the later of the cursor and the last cue end', () => {
  const s = createSceneScript();
  s.at(2).card({ style: 'time', text: 'Three hours later...', seconds: 5 });
  assert.equal(s.script().duration, 7);
  s.at(12);
  assert.equal(s.script().duration, 12);
});

test('marks are essential, runs only when asked, everything else is not', () => {
  const s = createSceneScript();
  s.mark('m', { a: 1 }).run(() => {}).run(() => {}, { essential: true }).sound('breath', { action: 'start' }).show('letter', false);
  assert.deepEqual(s.script().cues.map((cue) => cue.essential), [true, false, true, false, false]);
});

test('a ringing phone is followed by a wait for its answer', () => {
  const s = createSceneScript();
  s.phone({ action: 'ring', callerId: 'el_comprador', callId: 'midnight' });
  s.phone({ action: 'end', callId: 'midnight' });
  const { cues } = s.script();
  assert.deepEqual(cues.map((cue) => cue.kind), ['phone', 'waitFor', 'phone']);
  assert.equal(cues[1].token, 'phone:midnight');
  assert.ok(cues[1].timeout >= 8);
});

test('the script is plain data of the agreed shape', () => {
  const s = createSceneScript({ skippable: false, hideLead: true });
  s.stage({ origin: { x: 10, y: 0, z: -4 }, heading: 1.2 });
  s.clock({ hours: 0.3, weather: 'rain' });
  s.set('office', 'garage_office_set', { position: { x: 0, z: 0 }, heading: 0 });
  s.actor('comprador', { archetypeId: 'businessman', position: { x: 1, z: -2 }, heading: 3.1, tint: { paint_top: '#111111' } });
  s.prop('letter', 'foreclosure_letter', { parent: 'office:anchor_letter' });
  s.light('lamp', { kind: 'spot', position: { x: 0, y: 2, z: 0 }, colour: '#ffcc88', intensity: 3, range: 6 });
  s.black();
  s.firstPerson({ path: [{ t: 2, position: { x: 0, y: 1.7, z: -3 }, yaw: 0.2, pitch: 0 }, { t: 0, position: { x: 0, y: 1.7, z: 0 }, yaw: 0, pitch: 0 }], visor: 'helmet' });
  s.act('comprador', { gesture: 'offer', walkTo: { x: 0, z: -1 }, face: 'camera', seconds: 2 });
  s.move('office:door_l', { translate: { x: -2 }, seconds: 4 });
  s.arm({ gesture: 'salute', seconds: 2 });
  s.waitFor('go', { timeout: 3 });
  s.end({ leadAt: { position: { x: 0, z: 2 }, heading: 0.5 }, keepBlack: true });
  const script = s.script();
  assert.deepEqual(Object.keys(script).sort(), ['actors', 'clock', 'cues', 'duration', 'end', 'lights', 'options', 'props', 'sets', 'stage', 'startBlack'].sort());
  assert.deepEqual(script.options, { skippable: false, letterbox: true, hideLead: true });
  assert.deepEqual(script.stage, { origin: { x: 10, y: 0, z: -4 }, heading: 1.2 });
  assert.equal(script.clock.hours, 0.3);
  assert.equal(script.props[0].parent, 'office:anchor_letter');
  assert.equal(script.lights[0].kind, 'spot');
  assert.equal(script.actors[0].tint.paint_top, '#111111');
  assert.equal(script.end.keepBlack, true);
  assert.equal(script.end.leadAt.heading, 0.5);
  const first = script.cues.find((cue) => cue.kind === 'firstPerson');
  assert.deepEqual(first.path.map((point) => point.t), [0, 2]);
  assert.equal(first.seconds, 2);
  assert.deepEqual(script.cues.find((cue) => cue.kind === 'move').translate, { x: -2, y: 0, z: 0 });
  for (const cue of script.cues) assert.ok(CUE_KINDS.includes(cue.kind), cue.kind);
  assert.doesNotThrow(() => JSON.stringify(script));
});

test('an unknown gesture is refused when the scene is written', () => {
  const s = createSceneScript();
  assert.throws(() => s.act('a', { gesture: 'moonwalk' }));
  for (const gesture of ACTOR_GESTURES) assert.doesNotThrow(() => s.act('a', { gesture }));
});
