// "Midnight Call": rain on the roof of Tolliver Tow, the foreclosure letter, the old photograph, and a buyer on the phone.
// Staged in the office set on a hidden stage 60 m under the ground below the lead, lit only by
// the desk lamp and a little night from the window. Positions are the set's own numbers
// (assets/registry/storyGarage.js): room x -3.5..3.5, y 0..3, z -2.75..2.75, -Z forward.
import { createSceneScript } from '../../cinematics/sceneScript.js';

const STAGE_DEPTH = 60;
const LETTER = { x: 1.58, y: 0.77, z: 0.42 };
const PHOTO = { x: 3.48, y: 1.6, z: 0.6 };
const DEZ_HEAD = { x: 1.63, y: 1.24, z: 1.03 };

/** Writes a shot that lasts as long as what `body` puts on the time line. */
function during(s, view, body) {
  const start = s.time;
  body();
  const end = s.time;
  s.at(start).shot({ ...view, seconds: end - start });
  s.at(end);
}

/** @type {{id: string, build: (params: object, tools: object) => object}} */
export const MIDNIGHT_CALL_SCENE = {
  id: 'midnight_call',
  build(params, tools) {
    const lead = tools.lead();
    const s = createSceneScript({ skippable: true, letterbox: true, hideLead: true }, tools);
    s.stage({ origin: { x: lead.x, y: tools.groundHeightAt(lead.x, lead.z) - STAGE_DEPTH, z: lead.z }, heading: 0 });
    s.clock({ hours: 0.33, weather: 'rain' });
    s.set('office', 'garage_office_set', { position: { x: 0, y: 0, z: 0 } });
    s.prop('letter', 'foreclosure_letter', { parent: 'office:anchor_letter' });
    s.prop('photo', 'framed_pilot_photo', { parent: 'office:anchor_photo' });
    s.actor('dez', { characterId: 'dez_tolliver', position: { x: 1.63, y: 0.07, z: 1.08 }, heading: 0, pose: 'sit' });
    s.light('lamp', { kind: 'point', position: { x: 1.29, y: 1.1, z: 0.25 }, colour: '#ffc288', intensity: 1.4, range: 6 });
    s.light('night', { kind: 'point', position: { x: 1.3, y: 1.9, z: -2.2 }, colour: '#4d6a94', intensity: 2.2, range: 7 });
    s.light('wall', { kind: 'spot', position: { x: 2.2, y: 2.3, z: 0.5 }, target: PHOTO, colour: '#ffc78c', intensity: 2.4, range: 4, angle: 0.5 });

    s.black();
    s.sound('rain_roof', { action: 'start', volume: 0.6 });
    s.at(0.8).fade({ to: 0, seconds: 2.6 });
    // Along the desk in the lamp's pool, down to the letter: FINAL NOTICE.
    s.at(0).shot({ from: { position: { x: 0.5, y: 1.0, z: 0.62 }, target: { x: 1.58, y: 0.82, z: 0.42 }, fov: 30 },
      to: { position: { x: 1.5, y: 1.25, z: 0.78 }, target: LETTER }, seconds: 9 });
    // Up from the paper to the photograph on the wall.
    s.at(9).shot({ from: { position: { x: 1.5, y: 1.25, z: 0.78 }, target: LETTER, fov: 30 },
      to: { position: { x: 1.72, y: 1.38, z: 0.74 }, target: PHOTO, fov: 24 }, seconds: 6.5 });
    s.at(15.5);
    // Dez in half light; the phone.
    during(s, { from: { position: { x: 0.15, y: 1.28, z: -1.0 }, target: { x: 1.6, y: 1.12, z: 0.9 }, fov: 35 }, to: { position: { x: 0.45, y: 1.28, z: -1.2 } }, ease: 'linear' }, () => {
      s.wait(2.4);
      s.phone({ action: 'ring', callerId: 'el_comprador', callerName: 'Unknown number', autoAnswerSeconds: 4 });
      s.wait(0.9);
      s.line('mc_01', { channel: 'phone', gap: 0.5 });
    });
    during(s, { from: { position: { x: 2.55, y: 1.3, z: -0.45 }, target: DEZ_HEAD, fov: 30 }, to: { position: { x: 2.45, y: 1.3, z: -0.3 } } }, () => {
      s.line('mc_02', { channel: 'face', gap: 0.7 });
    });
    during(s, { from: { position: { x: 2.3, y: 1.3, z: -0.1 }, target: DEZ_HEAD, fov: 28 }, to: { position: { x: 2.05, y: 1.28, z: 0.35 }, fov: 24 }, ease: 'linear' }, () => {
      s.line('mc_03', { channel: 'phone', gap: 0.6 });
    });
    during(s, { from: { position: { x: 2.3, y: 1.6, z: 0.76 }, target: PHOTO, fov: 22 }, to: { position: { x: 2.7, y: 1.6, z: 0.68 } }, ease: 'linear' }, () => {
      s.line('mc_04', { channel: 'phone', gap: 1.4 });
    });
    // A long beat on his face; he hangs up without a word (the handset sounds its own hang-up).
    during(s, { from: { position: { x: 2.05, y: 1.28, z: 0.35 }, target: DEZ_HEAD, fov: 24 }, to: { position: { x: 2.0, y: 1.28, z: 0.42 } } }, () => {
      s.wait(3.4);
      s.phone({ action: 'end', callerId: 'el_comprador' });
      s.wait(1.6);
    });
    // Alone under the lamp, with the rain.
    s.shot({ from: { position: { x: -2.6, y: 2.0, z: -1.9 }, target: { x: 1.5, y: 0.95, z: 0.6 }, fov: 38 }, to: { position: { x: -3.0, y: 2.1, z: -2.2 } }, seconds: 8, ease: 'linear' });
    s.wait(4.6).fade({ to: 1, seconds: 2.8 });
    s.wait(2.4).sound('rain_roof', { action: 'stop', fadeSeconds: 1.2 });
    s.wait(1.0).end({});
    return s.script();
  },
};
