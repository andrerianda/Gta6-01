// "The Decision": morning, the bank seals the garage, and Dez calls back with one word.
// The same office (hidden stage 60 m under the ground below the lead) in flat daylight: a cold
// key through the window, the lamp's light off. Positions are the set's own numbers
// (assets/registry/storyGarage.js): room x -3.5..3.5, y 0..3, z -2.75..2.75, -Z forward.
import { createSceneScript } from '../../cinematics/sceneScript.js';

const STAGE_DEPTH = 60;
const PHOTO = { x: 3.48, y: 1.6, z: 0.6 };
const VISITOR = { x: -2.25, z: -1.75 };
const DOOR_OPEN = -1.6;

/** Writes a shot that lasts as long as what `body` puts on the time line. */
function during(s, view, body) {
  const start = s.time;
  body();
  const end = s.time;
  s.at(start).shot({ ...view, seconds: end - start });
  s.at(end);
}

/** @type {{id: string, build: (params: object, tools: object) => object}} */
export const THE_DECISION_SCENE = {
  id: 'the_decision',
  build(params, tools) {
    const lead = tools.lead();
    const s = createSceneScript({ skippable: true, letterbox: true, hideLead: true }, tools);
    s.stage({ origin: { x: lead.x, y: tools.groundHeightAt(lead.x, lead.z) - STAGE_DEPTH, z: lead.z }, heading: 0 });
    s.clock({ hours: 8.5, weather: 'clear' });
    s.set('office', 'garage_office_set', { position: { x: 0, y: 0, z: 0 } });
    s.prop('letter', 'foreclosure_letter', { parent: 'office:anchor_letter' });
    s.prop('photo', 'framed_pilot_photo', { parent: 'office:anchor_photo' });
    s.prop('seal', 'bank_seal_notice', { parent: 'office:anchor_seal', visible: false });
    s.actor('dez', { characterId: 'dez_tolliver', position: { x: 1.63, y: 0.07, z: 1.08 }, heading: 0, pose: 'sit' });
    // The name seeds the archetype's look: this one is a woman in a blazer.
    s.actor('banker', { archetypeId: 'office_worker', position: { x: VISITOR.x, y: 0, z: VISITOR.z }, heading: Math.PI,
      tint: { paint_jacket: '#2e3238', paint_bottom: '#2e3238' } });
    s.light('window', { kind: 'spot', position: { x: 1.3, y: 2.1, z: -2.4 }, target: { x: 1.2, y: 0.5, z: 1.2 }, colour: '#cfe0ff', intensity: 40, range: 11, angle: 0.95 });
    s.light('fill', { kind: 'point', position: { x: -0.5, y: 2.6, z: 0 }, colour: '#dfe6f0', intensity: 9, range: 9 });
    s.light('street', { kind: 'point', position: { x: -2.25, y: 2.3, z: -3.7 }, colour: '#e8eef8', intensity: 9, range: 6 });

    s.black();
    s.move('office:door_office', { rotate: { y: DOOR_OPEN }, seconds: 0.05 });
    s.at(0.1).fade({ to: 0, seconds: 1.2 });
    // Past Dez's shoulder to the officer in the doorway.
    during(s, { from: { position: { x: 2.6, y: 1.5, z: 1.9 }, target: { x: -2.25, y: 1.4, z: -1.75 }, fov: 36 }, to: { position: { x: 2.25, y: 1.5, z: 1.7 }, fov: 33 }, ease: 'linear' }, () => {
      s.wait(1.3).act('banker', { gesture: 'talk', face: 'dez' });
      s.line('td_01', { channel: 'face', gap: 0.6 });
    });
    during(s, { from: { position: { x: -0.9, y: 1.5, z: -0.4 }, target: { x: -2.25, y: 1.5, z: -1.75 }, fov: 30 }, to: { position: { x: -1.05, y: 1.5, z: -0.55 } } }, () => {
      s.line('td_02', { channel: 'face', gap: 0.5 });
      s.act('banker', { gesture: 'idle' });
    });
    // She goes; the door closes; the tape goes on from outside.
    during(s, { from: { position: { x: -0.5, y: 1.5, z: 0.7 }, target: { x: -2.25, y: 1.4, z: -2.8 }, fov: 34 }, to: { position: { x: -0.9, y: 1.5, z: 0.1 }, fov: 30 }, ease: 'linear' }, () => {
      s.act('banker', { walkTo: { x: -2.25, z: -3.7 }, speed: 1.1 });
      s.wait(2.2).move('office:door_office', { rotate: { y: -DOOR_OPEN }, seconds: 1.3 });
      s.act('banker', { face: { x: -2.25, z: 0 } });
      s.wait(1.6).sound('tape_seal', { action: 'play' });
      s.wait(0.5).show('seal', true);
      s.wait(1.5).act('banker', { walkTo: { x: -6, z: -3.9 }, speed: 1.1 });
      s.wait(1.2);
    });
    s.show('banker', false);
    // He stands; the young pilot on the wall.
    s.act('dez', { gesture: 'idle', walkTo: { x: 2.6, z: 1.25 }, face: -Math.PI / 2 });
    s.shot({ from: { position: { x: 2.45, y: 1.62, z: 0.62 }, target: PHOTO, fov: 26 }, to: { position: { x: 2.8, y: 1.6, z: 0.6 }, fov: 22 }, seconds: 4.4, ease: 'linear' });
    s.wait(4.4);
    // The phone; one word.
    s.act('dez', { gesture: 'phone_ear' });
    during(s, { from: { position: { x: 3.1, y: 1.72, z: 0.2 }, target: { x: 2.6, y: 1.72, z: 1.25 }, fov: 30 }, to: { position: { x: 3.05, y: 1.72, z: 0.35 }, fov: 27 } }, () => {
      s.wait(1.3);
      s.line('td_03', { channel: 'face', gap: 0.9 });
      s.line('td_04', { channel: 'phone', gap: 0 });
      s.wait(2.2);
    });
    s.fade({ to: 1, seconds: 0 });
    s.wait(0.6).end({});
    return s.script();
  },
};
