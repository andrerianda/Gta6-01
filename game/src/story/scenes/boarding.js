// Boarding: the belly hatch and ladder of the Manta Sombra and its empty co-pilot seat, or the
// Garza Negra's canopy. Two halves: outside at the aircraft with the crew chief, then a cut
// inside to the pilot's eye. The stage is the aircraft's stand (see walkOut.js). The aircraft's
// own hatch, ladder and canopy belong to the vehicle and are not moved from here: the camera
// rises through the hatch line, and the Garza's canopy closing is the light going down.
import { createSceneScript } from '../../cinematics/sceneScript.js';
import { AIRCRAFT_SHAPE, aircraftIdOf, standOf, yawTo } from './walkOut.js';

/** The pilot's eye in the aircraft's model space: its own anchor_camera when the model is there. */
function pilotEye(place, shape) {
  const root = place.root;
  const anchor = root?.getObjectByName?.('anchor_camera') ?? null;
  if (!anchor || typeof anchor.getWorldPosition !== 'function' || typeof root.worldToLocal !== 'function') return { ...shape.eye };
  try {
    root.updateWorldMatrix?.(true, true);
    const point = root.worldToLocal(anchor.getWorldPosition(anchor.position.clone()));
    if ([point.x, point.y, point.z].every(Number.isFinite) && point.y > 0.5 && point.y < 8) return { x: point.x, y: point.y, z: point.z };
  } catch { /* the estimate serves */ }
  return { ...shape.eye };
}

/** @type {{id: string, build: (params: object, tools: object) => object}} */
export const BOARDING_SCENE = {
  id: 'boarding',
  build(params, tools) {
    const aircraftId = aircraftIdOf(params);
    const garza = aircraftId === 'garza_negra';
    const shape = AIRCRAFT_SHAPE[aircraftId];
    const place = standOf(aircraftId, tools);
    const eye = pilotEye(place, shape);
    const s = createSceneScript({ skippable: true, letterbox: false, hideLead: true }, tools);
    s.stage({ origin: place.origin, heading: place.heading });
    s.clock({ hours: 5.9, restore: false });
    if (!place.live) s.prop('jet', aircraftId, { position: { x: 0, y: 0, z: 0 } });
    s.black();
    s.fade({ to: 0, seconds: 1 });
    s.sound('breath', { action: 'start', volume: 0.45 });

    let inside = 0;
    if (!garza) {
      // Under the belly: the hatch above, the chief below, the question he cannot answer.
      const foot = { x: 1.6, z: shape.hatch.z - 3.4 }, rung = { x: 0.15, z: shape.hatch.z - 0.5 };
      const chiefAt = { x: 3.4, z: shape.hatch.z - 1.6 };
      s.actor('chief', { archetypeId: 'base_ground_crew', position: chiefAt, heading: yawTo(chiefAt, foot) });
      s.light('hatch', { kind: 'point', position: { x: 0, y: 2.6, z: shape.hatch.z }, colour: '#bfd6ff', intensity: 9, range: 7 });
      const up = yawTo(foot, shape.hatch);
      s.firstPerson({ visor: 'helmet', seconds: 11.6, bob: 0.9, path: [
        { t: 0, position: { ...foot, y: 1.7 }, yaw: up, pitch: 0.32 },
        { t: 2.6, position: { x: 0.9, y: 1.7, z: shape.hatch.z - 1.9 }, yaw: up, pitch: 0.5 },
        { t: 4.4, position: { x: 0.9, y: 1.7, z: shape.hatch.z - 1.9 }, yaw: yawTo({ x: 0.9, z: shape.hatch.z - 1.9 }, chiefAt), pitch: -0.02 },
        { t: 8.6, position: { x: 0.9, y: 1.7, z: shape.hatch.z - 1.9 }, yaw: yawTo({ x: 0.9, z: shape.hatch.z - 1.9 }, chiefAt), pitch: -0.02 },
        { t: 9.8, position: { ...rung, y: 1.8 }, yaw: up, pitch: 0.9 },
        { t: 11.6, position: { ...rung, y: 3.1 }, yaw: up, pitch: 1.1 },
      ] });
      s.at(2.8).act('chief', { gesture: 'talk', face: 'camera' });
      s.at(3).line('bd_01', { gap: 0.5 });
      s.act('chief', { gesture: 'idle', face: 'camera' });
      s.line('bd_02', { gap: 0.3 });
      inside = Math.max(11.6, s.time + 2.6);
    } else {
      // Beside the nose in the pressure suit: the cooler set down, the canopy called for.
      const foot = { x: shape.hatch.x - 1.3, z: shape.hatch.z - 0.4 };
      const chiefAt = { x: foot.x - 1.5, z: foot.z - 1.9 };
      const coolerAt = { x: foot.x - 0.55, z: foot.z - 0.9 };
      s.actor('chief', { archetypeId: 'base_ground_crew', position: chiefAt, heading: yawTo(chiefAt, foot) });
      s.prop('cooler', 'suit_cooler', { position: { ...coolerAt, y: 0.78 } });
      const toChief = yawTo(foot, chiefAt);
      s.firstPerson({ visor: 'pressure', seconds: 10.4, bob: 0.6, path: [
        { t: 0, position: { ...foot, y: 1.7 }, yaw: toChief + 0.25, pitch: -0.3 },
        { t: 2.4, position: { ...foot, y: 1.7 }, yaw: toChief + 0.2, pitch: -0.42 },
        { t: 3.8, position: { ...foot, y: 1.7 }, yaw: toChief, pitch: -0.03 },
        { t: 8.4, position: { ...foot, y: 1.7 }, yaw: toChief, pitch: -0.03 },
        { t: 10.4, position: { ...foot, y: 1.9 }, yaw: yawTo(foot, { x: 0, z: shape.eye.z }), pitch: 0.5 },
      ] });
      s.at(0.6).arm({ gesture: 'reach', seconds: 2.4 });
      s.at(0.9).move('cooler', { translate: { y: -0.78 }, seconds: 1.3, ease: 'smooth' });
      s.at(2.6).act('chief', { gesture: 'talk', face: 'camera' });
      s.at(3).line('bd_g1', { gap: 0.4 });
      s.act('chief', { gesture: 'idle', face: 'camera' });
      s.line('bd_g2', { channel: 'helmet', gap: 0.3 });
      inside = Math.max(10.4, s.time + 1.4);
    }

    // The cut inside, through a blink of black.
    s.at(inside - 0.45).fade({ to: 1, seconds: 0.4 });
    s.at(inside);
    s.show('chief', false);
    s.light('panel', { kind: 'point', position: { x: eye.x, y: eye.y - 0.45, z: eye.z - 0.55 }, colour: garza ? '#ffc98a' : '#9fd4c8', intensity: 1.6, range: 2.4 });
    const seat = garza ? 0 : -eye.x * 2;           // the other seat, across the centre line
    const glance = garza ? 0.5 : (seat > eye.x ? -0.95 : 0.95);
    s.firstPerson({ visor: shape.visor, seconds: 9, bob: 0, breath: 1.2, fov: 62, path: garza ? [
      { t: 0, position: eye, yaw: 0, pitch: 0.55 },
      { t: 2.6, position: eye, yaw: 0, pitch: 0.2 },
      { t: 4.4, position: eye, yaw: 0, pitch: -0.2 },
      { t: 9, position: eye, yaw: 0, pitch: -0.12 },
    ] : [
      { t: 0, position: eye, yaw: 0, pitch: -0.1 },
      { t: 1.2, position: eye, yaw: 0, pitch: -0.1 },
      { t: 2.8, position: eye, yaw: glance, pitch: -0.2 },
      { t: 4.6, position: eye, yaw: glance, pitch: -0.2 },
      { t: 6.2, position: eye, yaw: 0, pitch: -0.24 },
      { t: 9, position: eye, yaw: 0, pitch: -0.12 },
    ] });
    s.fade({ to: 0, seconds: 0.5 });
    if (garza) {
      // The canopy comes down: its rumble and the seal, while the look falls from the sky to the panel.
      s.sound('door_rumble', { action: 'start', volume: 0.3, fadeSeconds: 0.4 });
      s.at(inside + 2.6).sound('door_rumble', { action: 'stop', fadeSeconds: 0.5 });
      s.sound('cloth_pull', { action: 'play', volume: 0.35 });
    }
    s.at(inside + 5).arm({ gesture: 'throttle', seconds: 3.6 });
    s.at(inside + 5.3).line('bd_03', { channel: 'helmet', advance: false });
    s.at(inside + 8.4).fade({ to: 1, seconds: 0.6 });
    s.at(inside + 8.9).mark('boarded', { aircraftId });
    s.sound('breath', { action: 'stop', fadeSeconds: 0.5 });
    s.at(inside + 9).end({});
    return s.script();
  },
};
