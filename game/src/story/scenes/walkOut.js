// The walk-out, first person through the visor: the crew turn, the salutes, the covers pulled
// off one by one. The stage is the aircraft's own stand (origin at the aircraft, nose to -Z), so
// every mark is counted from the aircraft; Dez comes along the apron from its right-hand side.
import { createSceneScript } from '../../cinematics/sceneScript.js';

/** The stands of Punta Garza (world metres; the aircraft face compass 006, across the runway). */
export const BASE_STANDS = Object.freeze({
  manta_sombra: Object.freeze({ x: -1469, z: -1376, heading: -0.105 }),
  garza_negra: Object.freeze({ x: -1406, z: -1359, heading: -0.105 }),
});

/** What the scenes need to know of each aircraft's shape, in its model space (metres). */
export const AIRCRAFT_SHAPE = Object.freeze({
  manta_sombra: Object.freeze({ noseZ: -9.3, noseY: 2.7, intakeX: 4, intakeZ: -4.6, covers: 'aircraft_covers_manta', visor: 'helmet',
    eye: Object.freeze({ x: -0.55, y: 3.25, z: -6.2 }), hatch: Object.freeze({ x: 0, z: -4.2 }) }),
  garza_negra: Object.freeze({ noseZ: -18, noseY: 2.2, intakeX: 4.2, intakeZ: -4.2, covers: 'aircraft_covers_garza', visor: 'pressure',
    eye: Object.freeze({ x: 0, y: 3.05, z: -11.6 }), hatch: Object.freeze({ x: -1.9, z: -11.4 }) }),
});

/** The aircraft id a scene was given ('manta_sombra' unless it is the Garza Negra). */
export function aircraftIdOf(params) {
  return params?.aircraftId === 'garza_negra' ? 'garza_negra' : 'manta_sombra';
}

/** The yaw of a first-person look from one stage point to another. */
export function yawTo(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

/**
 * Where the stage of a base scene stands: on the real aircraft when the world has it, else on
 * its stand (and then the scene brings its own model of it).
 * @returns {{origin: {x: number, y: number, z: number}, heading: number, live: boolean, root: object | null}}
 */
export function standOf(aircraftId, tools) {
  let craft = null;
  try { craft = tools?.aircraft?.(aircraftId) ?? null; } catch { craft = null; }
  const stand = BASE_STANDS[aircraftId];
  if (craft && craft.position && Number.isFinite(craft.position.x) && Number.isFinite(craft.position.z)) {
    const y = Number.isFinite(craft.root?.position?.y) ? craft.root.position.y : craft.position.y;
    const ground = Number(tools?.groundHeightAt?.(craft.position.x, craft.position.z)) || 0;
    // "live" only while its model is really drawn: an aircraft of the world that is not streamed
    // in has a place but no picture, and then the scene brings its own model to that place.
    const drawn = Boolean(craft.root && craft.root.visible !== false && craft.root.parent);
    return { origin: { x: craft.position.x, y: Number.isFinite(y) ? Math.min(y, ground + 0.6) : ground, z: craft.position.z },
      heading: Number.isFinite(craft.heading) ? craft.heading : stand.heading, live: drawn, root: craft.root ?? null };
  }
  const ground = Number(tools?.groundHeightAt?.(stand.x, stand.z)) || 0;
  return { origin: { x: stand.x, y: ground, z: stand.z }, heading: stand.heading, live: false, root: null };
}

/** @type {{id: string, build: (params: object, tools: object) => object}} */
export const WALK_OUT_SCENE = {
  id: 'walk_out',
  build(params, tools) {
    const aircraftId = aircraftIdOf(params);
    const shape = AIRCRAFT_SHAPE[aircraftId];
    const place = standOf(aircraftId, tools);
    const lane = shape.noseZ - 4.5;               // he walks along this line, ahead of the nose
    const start = { x: 35, z: lane }, halt = { x: 17, z: lane }, last = { x: 2.6, z: shape.noseZ - 3.6 };
    const nose = { x: 0, z: shape.noseZ + 3 };
    const officerAt = { x: 12.4, z: lane + 1.7 };
    const s = createSceneScript({ skippable: true, letterbox: false, hideLead: true }, tools);
    s.stage({ origin: place.origin, heading: place.heading });
    s.clock({ hours: 5.87, restore: false });
    if (!place.live) s.prop('jet', aircraftId, { position: { x: 0, y: 0, z: 0 } });
    s.prop('covers', shape.covers, { position: { x: 0, y: 0, z: 0 } });
    s.actor('chief', { archetypeId: 'base_ground_crew', position: { x: 26, z: lane - 1.8 }, heading: Math.PI / 2 });
    s.actor('officer', { archetypeId: 'base_officer', position: officerAt, heading: Math.PI / 2 });
    s.actor('crew_nose', { archetypeId: 'base_ground_crew', position: { x: 1.1, z: shape.noseZ - 1.5 }, heading: Math.PI });
    s.actor('crew_intake', { archetypeId: 'base_ground_crew', position: { x: shape.intakeX + 2.6, z: shape.intakeZ - 3.6 }, heading: Math.PI * 0.75 });

    s.black('#fff1d2');
    s.fade({ to: 0, seconds: 2.2, colour: '#fff1d2' });
    s.sound('breath', { action: 'start', volume: 0.45 });
    s.sound('wind_surf', { action: 'start', volume: 0.22, fadeSeconds: 2 });
    const look = yawTo(start, nose);
    s.firstPerson({ visor: shape.visor, seconds: 34.5, bob: 1, path: [
      { t: 0, position: { ...start, y: 1.7 }, yaw: look, pitch: 0 },
      { t: 5, position: { x: 29, y: 1.7, z: lane }, yaw: yawTo({ x: 29, z: lane }, { x: 26, z: lane - 1.8 }) * 0.5 + look * 0.5, pitch: 0 },
      { t: 12.4, position: { ...halt, y: 1.7 }, yaw: yawTo(halt, officerAt) - 0.16, pitch: 0.01 },
      { t: 17.2, position: { ...halt, y: 1.7 }, yaw: yawTo(halt, officerAt) - 0.16, pitch: 0.01 },
      { t: 21, position: { x: 12, y: 1.7, z: lane - 0.4 }, yaw: yawTo({ x: 12, z: lane }, nose), pitch: 0.1 },
      { t: 30.5, position: { ...last, y: 1.7 }, yaw: yawTo(last, { x: 0, z: shape.noseZ + 1 }), pitch: 0.2 },
      { t: 34.5, position: { ...last, y: 1.7 }, yaw: yawTo(last, { x: 0, z: shape.noseZ + 1 }), pitch: 0.26 },
    ] });

    // The crew turn as he passes; the chief speaks first.
    // (They face marks of his path, not the live camera: a mark is there even when the scene is sought.)
    s.at(1.6).act('chief', { face: { x: 31, z: lane } });
    s.at(2.8).act('chief', { gesture: 'talk', face: { x: 29, z: lane } });
    s.line('wo_01', { advance: false });
    s.at(6.5).act('chief', { gesture: 'idle', face: { x: 22, z: lane } });
    s.at(7).act('officer', { face: halt });
    s.at(8).act('crew_nose', { face: halt });
    s.at(9).act('crew_intake', { face: halt });

    // The salute, and his own arm answering it.
    s.at(12.2).act('officer', { gesture: 'salute', face: halt });
    s.at(13).arm({ gesture: 'salute', seconds: 3 });
    s.at(13.3).line('wo_02', { advance: false });
    s.at(16.6).act('officer', { gesture: 'idle', face: halt });

    // The covers come off one by one, the red streamers trailing.
    s.at(18.4).act('crew_nose', { face: { x: 0, z: shape.noseZ } });
    s.at(19.4).act('crew_nose', { gesture: 'pull', seconds: 2 });
    s.at(19.9).sound('cloth_pull', { action: 'play', volume: 0.7 });
    s.move('covers:cover_nose', { translate: { x: 0.7, y: -2.1, z: -1.5 }, rotate: { x: 0.9 }, seconds: 1.5, ease: 'in' });
    s.at(21.5).show('covers:cover_nose', false);
    s.act('crew_nose', { gesture: 'idle', walkTo: { x: -shape.intakeX - 2.6, z: shape.intakeZ - 3.6 }, face: { x: -shape.intakeX, z: shape.intakeZ } });
    s.at(21.8).act('crew_intake', { face: { x: shape.intakeX, z: shape.intakeZ } });
    s.at(22.8).act('crew_intake', { gesture: 'pull', seconds: 2 });
    s.at(23.3).sound('cloth_pull', { action: 'play', volume: 0.6 });
    s.move('covers:cover_intake_r', { translate: { x: 2.2, y: -1.9, z: -2.6 }, rotate: { z: -0.8 }, seconds: 1.5, ease: 'in' });
    s.at(24.9).show('covers:cover_intake_r', false);
    s.act('crew_intake', { gesture: 'idle', face: last });
    s.at(27.6).act('crew_nose', { gesture: 'pull', seconds: 2, face: { x: -shape.intakeX, z: shape.intakeZ } });
    s.at(28.1).sound('cloth_pull', { action: 'play', volume: 0.5 });
    s.move('covers:cover_intake_l', { translate: { x: -2.2, y: -1.9, z: -2.6 }, rotate: { z: 0.8 }, seconds: 1.5, ease: 'in' });
    s.at(29.7).show('covers:cover_intake_l', false);
    s.act('crew_nose', { gesture: 'idle' });

    // No fade: the choice of aircraft follows where he stands.
    s.at(33.4).sound('wind_surf', { action: 'stop', fadeSeconds: 1 });
    s.at(34.4).mark('walked_out', { aircraftId });
    s.at(34.5).end({ leadAt: { position: { x: last.x, z: last.z }, heading: yawTo(last, { x: 0, z: shape.noseZ + 1 }) } });
    return s.script();
  },
};
