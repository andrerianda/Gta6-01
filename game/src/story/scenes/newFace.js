// "New Face": the forged pass, the uniform and the schedule of Lt. Ramiro Osorio.
// Evening in the office (hidden stage 60 m under the ground below the lead), the lamp on. The
// insider's call that follows is the mission's own stage. Positions are the set's own numbers
// (assets/registry/storyGarage.js): room x -3.5..3.5, y 0..3, z -2.75..2.75, -Z forward.
import { createSceneScript } from '../../cinematics/sceneScript.js';

const STAGE_DEPTH = 60;
const CARD = { x: 1.75, y: 0.768, z: -0.02 };
const HANGER = { x: -3.44, y: 1.893, z: 0.8 };
const DEZ = { x: -2.6, z: 1.6 };
const XIMENA = { x: 1.0, z: -0.8 };

/** Writes a shot that lasts as long as what `body` puts on the time line. */
function during(s, view, body) {
  const start = s.time;
  body();
  const end = s.time;
  s.at(start).shot({ ...view, seconds: end - start });
  s.at(end);
}

/** @type {{id: string, build: (params: object, tools: object) => object}} */
export const NEW_FACE_SCENE = {
  id: 'new_face',
  build(params, tools) {
    const lead = tools.lead();
    const s = createSceneScript({ skippable: true, letterbox: true, hideLead: true }, tools);
    s.stage({ origin: { x: lead.x, y: tools.groundHeightAt(lead.x, lead.z) - STAGE_DEPTH, z: lead.z }, heading: 0 });
    s.clock({ hours: 19, weather: 'clear' });
    s.set('office', 'garage_office_set', { position: { x: 0, y: 0, z: 0 } });
    s.prop('photo', 'framed_pilot_photo', { parent: 'office:anchor_photo' });
    s.prop('uniform', 'uniform_on_hanger', { parent: 'office:anchor_hanger' });
    s.prop('pass', 'forged_pass_card', { position: CARD });
    s.actor('dez', { characterId: 'dez_tolliver', position: { x: DEZ.x, y: 0, z: DEZ.z }, heading: Math.atan2(-(HANGER.x - DEZ.x), -(HANGER.z - DEZ.z)) });
    s.actor('ximena', { characterId: 'ximena_robles', position: { x: XIMENA.x, y: 0, z: XIMENA.z }, heading: Math.atan2(-(DEZ.x - XIMENA.x), -(DEZ.z - XIMENA.z)) });
    s.light('lamp', { kind: 'point', position: { x: 1.29, y: 1.1, z: 0.25 }, colour: '#ffc288', intensity: 1.5, range: 6 });
    s.light('bulb', { kind: 'point', position: { x: -1.4, y: 2.55, z: 0.3 }, colour: '#ffd3a1', intensity: 10, range: 9 });
    s.light('dusk', { kind: 'point', position: { x: 1.3, y: 1.9, z: -2.2 }, colour: '#7a6f9c', intensity: 3, range: 7 });

    s.black();
    // The pass lies on the desk, its face up, read from her side.
    s.move('pass', { rotate: { x: Math.PI / 2 }, seconds: 0.05 });
    s.at(0.1).fade({ to: 0, seconds: 1.4 });
    s.at(0).shot({ from: { position: { x: 2.9, y: 1.7, z: -2.2 }, target: { x: -1.0, y: 1.25, z: 0.4 }, fov: 38 }, to: { position: { x: 2.7, y: 1.65, z: -1.9 }, fov: 36 }, seconds: 3.4, ease: 'linear' });
    s.at(2.4).act('ximena', { gesture: 'talk' });
    s.line('nf_01', { channel: 'face', gap: 0.6, advance: false });
    const firstEnds = 2.4 + tools.secondsOf('nf_01') + 0.6;
    s.at(3.4).shot({ from: { position: { x: 1.75, y: 1.14, z: -0.44 }, target: CARD, fov: 26 }, to: { position: { x: 1.75, y: 1.06, z: -0.36 }, fov: 24 }, seconds: Math.max(1.5, firstEnds - 3.4), ease: 'linear' });
    s.at(Math.max(firstEnds, 4.9));
    // Up the uniform on its hanger.
    during(s, { from: { position: { x: -1.9, y: 1.0, z: 0.25 }, target: { x: -3.4, y: 0.8, z: 0.8 }, fov: 30 }, to: { position: { x: -1.9, y: 1.45, z: 0.25 }, target: { x: -3.4, y: 1.72, z: 0.8 } }, ease: 'smooth' }, () => {
      s.line('nf_02', { channel: 'face', gap: 0.7 });
      s.act('ximena', { gesture: 'idle' });
    });
    // Dez by the uniform, a hand out to the sleeve.
    during(s, { from: { position: { x: -1.5, y: 1.55, z: 2.2 }, target: { x: -3.2, y: 1.4, z: 1.0 }, fov: 32 }, to: { position: { x: -1.65, y: 1.55, z: 2.1 }, fov: 30 } }, () => {
      s.act('dez', { gesture: 'offer' });
      s.wait(1.2);
      s.line('nf_03', { channel: 'face', gap: 0.7 });
      s.act('dez', { gesture: 'idle' });
    });
    during(s, { from: { position: { x: -0.3, y: 1.5, z: -0.2 }, target: { x: XIMENA.x, y: 1.48, z: XIMENA.z }, fov: 28 }, to: { position: { x: -0.15, y: 1.5, z: -0.3 } } }, () => {
      s.act('ximena', { gesture: 'talk' });
      s.line('nf_04', { channel: 'face', gap: 0.8 });
      s.act('ximena', { gesture: 'idle' });
    });
    // He looks at it a while longer.
    s.shot({ from: { position: { x: -2.9, y: 1.62, z: 0.1 }, target: { x: DEZ.x, y: 1.72, z: DEZ.z }, fov: 30 }, to: { position: { x: -2.85, y: 1.64, z: 0.35 }, fov: 27 }, seconds: 5.2, ease: 'linear' });
    s.wait(3.4).fade({ to: 1, seconds: 1.8 });
    s.wait(2.2).end({});
    return s.script();
  },
};
