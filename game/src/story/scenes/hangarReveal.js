// The dark hangar: breath in the helmet, the doors parting on the dawn, the aircraft as a
// silhouette, the title card. One first-person shot through the visor on a hidden stage 80 m
// under the base (so nothing of the world shows): the set is lit by nothing but the opening.
// The dawn outside is a bright unlit wall behind the door line (made here, the stage has no
// such prop) and one warm light that travels in from far outside as the doors part.
import { FINAL_MISSION } from '../../catalog/finalArcScript.js';
import { createSceneScript } from '../../cinematics/sceneScript.js';

/** Where the hidden stage lies: under the apron of Punta Garza. */
const HIDDEN = Object.freeze({ x: -1469, z: -1300, depth: 80 });
const DOOR_TRAVEL = 27.2;
const DOOR_SECONDS = 16;
const DAWN = '#fff1d2';

/** The bright wall behind the doors: made when the scene starts, taken away when it ends. */
function dawnWall() {
  const state = { mesh: null, gone: false };
  return {
    raise(tools) {
      const view = tools?.context?.view;
      const stage = (view?.layers?.dynamic ?? view?.scene)?.getObjectByName?.('cinematic-stage');
      if (!stage || state.mesh || state.gone) return;
      import('three').then((THREE) => {
        if (state.gone || state.mesh || !stage.parent) return;
        const material = new THREE.MeshBasicMaterial({ color: 0xfff1d2, fog: false, toneMapped: false });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(320, 120), material);
        mesh.name = 'dawn-wall';
        mesh.position.set(0, 40, -64);
        stage.add(mesh);
        state.mesh = mesh;
      }).catch(() => {});
    },
    drop() {
      state.gone = true;
      if (!state.mesh) return;
      state.mesh.removeFromParent();
      state.mesh.geometry.dispose();
      state.mesh.material.dispose();
      state.mesh = null;
    },
  };
}

/** @type {{id: string, build: (params: object, tools: object) => object}} */
export const HANGAR_REVEAL_SCENE = {
  id: 'hangar_reveal',
  build(params, tools) {
    const garza = params?.aircraftId === 'garza_negra';
    const aircraftId = garza ? 'garza_negra' : 'manta_sombra';
    const ground = Number(tools?.groundHeightAt?.(HIDDEN.x, HIDDEN.z)) || 0;
    const wall = dawnWall();
    const s = createSceneScript({ skippable: true, letterbox: true, hideLead: true }, tools);
    s.stage({ origin: { x: HIDDEN.x, y: ground - HIDDEN.depth, z: HIDDEN.z }, heading: 0 });
    s.clock({ hours: 3.6 });
    s.set('hangar', 'hangar_interior_set', { position: { x: 0, y: 0, z: 0 } });
    s.prop('jet', aircraftId, { position: { x: 0, y: 0, z: 4 } });
    s.prop('covers', garza ? 'aircraft_covers_garza' : 'aircraft_covers_manta', { parent: 'jet' });
    if (garza) s.prop('curtain', 'tarpaulin_curtain', { position: { x: 0, y: 0, z: -17 } });
    s.light('dawn', { kind: 'point', position: { x: 0, y: 9, z: -270 }, colour: '#ffe0b4', intensity: 1100, range: 125 });

    s.black();
    s.run((t) => wall.raise(t));
    s.sound('breath', { action: 'start', volume: 0.5 });
    s.sound('hangar_hum', { action: 'start', volume: 0.3 });
    // One shot: he stands, watches, then walks to the light.
    s.firstPerson({ visor: garza ? 'pressure' : 'helmet', seconds: 40, bob: 0.8, path: [
      { t: 0, position: { x: 0, y: 1.7, z: 23 }, yaw: 0, pitch: -0.02 },
      { t: 14, position: { x: 0, y: 1.7, z: 23 }, yaw: 0, pitch: 0.02 },
      { t: 27.5, position: { x: 0, y: 1.7, z: 23 }, yaw: 0, pitch: 0.05 },
      { t: 40, position: { x: garza ? 3 : 0.6, y: 1.7, z: 9 }, yaw: garza ? 0.08 : 0, pitch: 0.03 },
    ] });
    s.at(1.5).fade({ to: 0, seconds: 2.5 });
    s.at(3).sound('low_note', { action: 'start', volume: 0.07, fadeSeconds: 2 });

    // The doors: a thin line of light that widens.
    s.at(5).sound('door_rumble', { action: 'start', volume: 0.65, fadeSeconds: 1.5 });
    s.move('hangar:door_l', { translate: { x: -DOOR_TRAVEL }, seconds: DOOR_SECONDS, ease: 'in' });
    s.move('hangar:door_r', { translate: { x: DOOR_TRAVEL }, seconds: DOOR_SECONDS, ease: 'in' });
    s.move('dawn', { translate: { z: 232 }, seconds: DOOR_SECONDS, ease: 'in' });
    s.at(11).sound('low_note', { action: 'start', volume: 0.2, fadeSeconds: 4 });
    if (garza) {
      s.at(12);
      s.sound('cloth_pull', { action: 'play', volume: 0.6 });
      s.move('curtain:curtain_l', { translate: { x: -12.4 }, seconds: 7, ease: 'smooth' });
      s.move('curtain:curtain_r', { translate: { x: 12.4 }, seconds: 7, ease: 'smooth' });
    }
    s.at(garza ? 17 : 14.5).line('hr_01', { channel: 'helmet', advance: false });
    s.at(17).sound('low_note', { action: 'start', volume: 0.55, fadeSeconds: 5 });
    s.at(20).sound('door_rumble', { action: 'stop', fadeSeconds: 1.6 });

    // The title over the silhouette, then the walk.
    s.at(22).card({ style: 'title', text: FINAL_MISSION.title, seconds: 5 });
    s.at(31).sound('low_note', { action: 'start', volume: 0.8, fadeSeconds: 5 });
    s.at(36).fade({ to: 1, seconds: 3.4, colour: DAWN });
    s.at(37.5).sound('low_note', { action: 'stop', fadeSeconds: 2.4 });
    s.sound('hangar_hum', { action: 'stop', fadeSeconds: 2 });
    s.at(39.9).run(() => wall.drop(), { essential: true });
    s.at(40).end({});
    return s.script();
  },
};
