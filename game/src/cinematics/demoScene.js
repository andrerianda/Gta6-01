// The engine's own demonstration scene, `cinematic_demo` (play it with ?scene=cinematic_demo):
// twelve seconds beside the lead that use every part once: a fade from black, a crane shot, a
// title card, a first-person shot through the helmet visor with the saluting arm, an officer who
// salutes, one voiced line and a fade out. Story scenes live in story/scenes/, not here.
import { createSceneScript } from './sceneScript.js';

/** @type {{id: string, build: (params: object, tools: object) => object}} */
export const CINEMATIC_DEMO_SCENE = {
  id: 'cinematic_demo',
  build(params, tools) {
    const lead = tools.lead();
    const s = createSceneScript({ skippable: true, letterbox: true }, tools);
    s.stage({ origin: { x: lead.x, z: lead.z }, heading: lead.heading });
    s.actor('officer', { archetypeId: 'base_officer', position: { x: 0.5, z: -3.4 }, heading: Math.PI });
    s.actor('crew', { archetypeId: 'base_ground_crew', position: { x: -1.8, z: -4.6 }, heading: Math.PI * 0.8 });
    s.light('key', { kind: 'point', position: { x: 1.5, y: 2.6, z: -2 }, colour: '#ffd9a8', intensity: 14, range: 9 });
    s.black();
    s.fade({ to: 0, seconds: 1.5 });
    s.shot({ from: { position: { x: 3.5, y: 7, z: 8 }, target: { x: 0, y: 1.4, z: -2 }, fov: 40 },
      to: { position: { x: 2.4, y: 2.1, z: 4.6 }, fov: 34 }, seconds: 4.5, ease: 'smooth' });
    s.at(1.2).card({ style: 'title', text: 'CINEMATIC DEMO', sub: 'ENGINE CHECK', seconds: 3 });
    s.at(4.5).show('lead', false);
    s.firstPerson({ visor: 'helmet', seconds: 4.5, path: [
      { t: 0, position: { x: 0, y: 1.7, z: 0.4 }, yaw: 0.12, pitch: -0.02 },
      { t: 2.6, position: { x: 0.3, y: 1.7, z: -1.5 }, yaw: -0.04, pitch: 0 },
      { t: 4.5, position: { x: 0.3, y: 1.7, z: -1.5 }, yaw: -0.5, pitch: 0.03 },
    ] });
    s.sound('breath', { action: 'start', volume: 0.5 });
    s.at(5).act('officer', { gesture: 'salute', face: 'camera' });
    s.act('crew', { walkTo: { x: -1.6, z: -2.6 }, face: 'camera' });
    s.at(5.6).arm({ gesture: 'salute', seconds: 2.4 });
    s.at(6).line('hr_01', { advance: false });
    s.at(8.2).act('officer', { gesture: 'idle' });
    s.at(9).sound('breath', { action: 'stop', fadeSeconds: 0.5 });
    s.show('lead', true);
    s.mark('demo_mark', { note: 'essential' });
    s.shot({ from: { position: { x: -1.4, y: 1.55, z: -1.2 }, target: { x: 0.5, y: 1.5, z: -3.4 }, fov: 30 }, to: { position: { x: -1.1, y: 1.6, z: -1.6 } }, seconds: 3 });
    s.act('crew', { gesture: 'talk', face: 'officer' });
    s.at(10.8).fade({ to: 1, seconds: 1.2 });
    s.at(12).end({});
    return s.script();
  },
};
