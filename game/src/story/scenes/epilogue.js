// The epilogue: the radio news of Marazul, the sealed garage with the old photograph, the closing card and the credits.
// Starts on the black the handover left. The office (hidden stage 60 m under the ground below
// the lead) is empty: the bank's seal on the door glass, a bare desk, the photograph. Positions
// are the set's own numbers (assets/registry/storyGarage.js), -Z forward.
import { FINAL_CREDITS, FINAL_MISSION } from '../../catalog/finalArcScript.js';
import { createSceneScript } from '../../cinematics/sceneScript.js';

const STAGE_DEPTH = 60;
const PHOTO = { x: 3.48, y: 1.6, z: 0.6 };
const CLOSING_SECONDS = 9;
const CREDITS_SECONDS = 25;

/** Writes a shot that lasts as long as what `body` puts on the time line. */
function during(s, view, body) {
  const start = s.time;
  body();
  const end = s.time;
  s.at(start).shot({ ...view, seconds: end - start });
  s.at(end);
}

/** @type {{id: string, build: (params: object, tools: object) => object}} */
export const EPILOGUE_SCENE = {
  id: 'epilogue',
  build(params, tools) {
    const lead = tools.lead();
    const s = createSceneScript({ skippable: true, letterbox: true, hideLead: true }, tools);
    s.stage({ origin: { x: lead.x, y: tools.groundHeightAt(lead.x, lead.z) - STAGE_DEPTH, z: lead.z }, heading: 0 });
    s.clock({ hours: 15.5, weather: 'overcast' });
    s.set('office', 'garage_office_set', { position: { x: 0, y: 0, z: 0 } });
    s.prop('photo', 'framed_pilot_photo', { parent: 'office:anchor_photo' });
    s.prop('seal', 'bank_seal_notice', { parent: 'office:anchor_seal' });
    s.light('window', { kind: 'spot', position: { x: 1.3, y: 2.1, z: -2.4 }, target: { x: 1.6, y: 0.6, z: 0.8 }, colour: '#d5dbe2', intensity: 30, range: 11, angle: 0.9 });
    s.light('door', { kind: 'point', position: { x: -2.25, y: 2.2, z: -3.6 }, colour: '#d5dbe2', intensity: 9, range: 6 });
    s.light('fill', { kind: 'point', position: { x: -0.5, y: 2.6, z: 0.2 }, colour: '#c9ced6', intensity: 5, range: 9 });

    s.black();
    // A small radio set in the dark.
    s.shot({ from: { position: { x: -0.9, y: 1.45, z: 1.0 }, target: { x: -2.25, y: 1.45, z: -2.8 }, fov: 32 }, seconds: 1 });
    s.wait(1.6);
    s.line('ep_01', { channel: 'news', gap: 0.9 });
    // The sealed door from inside.
    during(s, { from: { position: { x: -0.9, y: 1.45, z: 1.0 }, target: { x: -2.25, y: 1.45, z: -2.8 }, fov: 32 }, to: { position: { x: -1.4, y: 1.45, z: 0 }, fov: 30 }, ease: 'linear' }, () => {
      s.fade({ to: 0, seconds: 3.2 });
      s.wait(1.6);
      s.line('ep_02', { channel: 'news', gap: 1.2 });
    });
    // Across the bare desk.
    during(s, { from: { position: { x: 0.2, y: 1.15, z: -0.9 }, target: { x: 1.6, y: 0.8, z: 0.4 }, fov: 34 }, to: { position: { x: 1.2, y: 1.3, z: -0.6 }, target: { x: 2.6, y: 1.2, z: 0.5 } }, ease: 'linear' }, () => {
      s.wait(0.8);
      s.line('ep_03', { channel: 'news', gap: 1.0 });
    });
    // ...to the photograph; the last headline as the camera settles.
    s.shot({ from: { position: { x: 1.2, y: 1.3, z: -0.6 }, target: { x: 2.6, y: 1.2, z: 0.5 }, fov: 34 }, to: { position: { x: 2.3, y: 1.6, z: 0.35 }, target: PHOTO, fov: 26 }, seconds: 7, ease: 'out' });
    s.wait(5);
    s.line('ep_04', { channel: 'news', gap: 0 });
    s.wait(0.8);
    // Hold on the young pilot.
    s.shot({ from: { position: { x: 2.3, y: 1.6, z: 0.35 }, target: PHOTO, fov: 26 }, to: { position: { x: 2.42, y: 1.6, z: 0.4 }, fov: 24 }, seconds: 7.5, ease: 'linear' });
    s.wait(4.5).fade({ to: 1, seconds: 3 });
    s.wait(4.2);
    s.card({ style: 'closing', text: FINAL_MISSION.closingCard, seconds: CLOSING_SECONDS });
    s.wait(CLOSING_SECONDS + 1.5);
    s.sound('low_note', { action: 'start', volume: 0.25 });
    s.card({ style: 'credits', lines: FINAL_CREDITS, seconds: CREDITS_SECONDS });
    s.wait(CREDITS_SECONDS - 2).sound('low_note', { action: 'stop', fadeSeconds: 2 });
    s.wait(2.5).mark('credits_done');
    s.wait(0.5).end({});
    return s.script();
  },
};
