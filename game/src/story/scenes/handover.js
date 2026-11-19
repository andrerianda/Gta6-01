// The handover on the Norvast island and the betrayal: four locked lines, the slow close to black, one shot off screen.
// Staged on the apron at the island's handover point with the stage's -Z towards the aircraft, so
// the two men stand at the origin and the aircraft stands behind them. Nothing violent is shown:
// the veil is fully closed, and has been for a second, before the one far shot is heard. The
// scene ends on black; the epilogue follows.
import { createSceneScript } from '../../cinematics/sceneScript.js';

const DEFAULT_POINT = Object.freeze({ x: -9529.5, y: 18, z: -3442.1 });
const DEFAULT_HANGAR = Object.freeze({ x: -9515.7, z: -3493.3 });
/** How far from the aircraft the men meet when it stands on the handover point itself. */
const MEETING_DISTANCE = 22;
const DEZ = { x: -0.75, z: 0 };
const BUYER = { x: 0.75, z: 0 };
const WALK_OFF = { x: 5.5, z: 2.8 };

/** Writes a shot that lasts as long as what `body` puts on the time line. */
function during(s, view, body) {
  const start = s.time;
  body();
  const end = s.time;
  s.at(start).shot({ ...view, seconds: end - start });
  s.at(end);
}

/** Where the scene stands: the origin, the heading that puts the aircraft on -Z, and its distance. */
function placeOf(params, tools) {
  const island = tools.context?.systems?.find?.('norvastIsland') ?? null;
  const point = params?.handoverPoint ?? island?.handoverPoint ?? DEFAULT_POINT;
  const hangar = island?.hangar ?? DEFAULT_HANGAR;
  const craft = params?.aircraftId ? tools.aircraft(params.aircraftId) : null;
  const origin = { x: point.x, y: Number.isFinite(point.y) ? point.y : DEFAULT_POINT.y, z: point.z };
  let dx = point.x - hangar.x, dz = point.z - hangar.z, distance = 24;
  if (craft?.position) {
    dx = craft.position.x - origin.x; dz = craft.position.z - origin.z;
    distance = Math.hypot(dx, dz);
    if (distance < 16) { // the aircraft stands on the point: meet beside it, on the hangar's side
      const hx = hangar.x - craft.position.x, hz = hangar.z - craft.position.z, h = Math.hypot(hx, hz) || 1;
      origin.x = craft.position.x + (hx / h) * MEETING_DISTANCE; origin.z = craft.position.z + (hz / h) * MEETING_DISTANCE;
      dx = -hx; dz = -hz; distance = MEETING_DISTANCE;
    }
  }
  const length = Math.hypot(dx, dz) || 1;
  return { origin, heading: Math.atan2(-dx / length, -dz / length), distance };
}

/** @type {{id: string, build: (params: object, tools: object) => object}} */
export const HANDOVER_SCENE = {
  id: 'handover',
  build(params, tools) {
    const { origin, heading, distance: d } = placeOf(params, tools);
    const craftAt = { x: 0, y: 2.2, z: -d };
    const s = createSceneScript({ skippable: true, letterbox: true, hideLead: true }, tools);
    s.stage({ origin, heading });
    s.clock({ hours: 6.58, weather: 'clear' });
    s.actor('dez', { characterId: 'dez_tolliver', position: { x: DEZ.x, y: 0, z: DEZ.z }, heading: -Math.PI / 2 });
    // The name seeds the archetype's look: an older man; the tint is his dark coat and grey hair.
    s.actor('comprador', { archetypeId: 'executive', position: { x: BUYER.x, y: 0, z: BUYER.z }, heading: Math.PI / 2, pose: 'offer',
      tint: { paint_jacket: '#17191e', paint_bottom: '#1b1d22', paint_shoes: '#121214', paint_hair: '#b9b8b3' } });
    s.actor('soldier_a', { archetypeId: 'norvast_soldier', position: { x: -5, y: 0, z: -d + 15 }, heading: 0 });
    s.actor('soldier_b', { archetypeId: 'norvast_soldier', position: { x: 4.5, y: 0, z: -d + 16 }, heading: 0 });
    // The case lies on his open hand, its handle towards Dez.
    s.prop('case', 'payment_case', { position: { x: 0.2, y: 1.1, z: -0.14 }, heading: Math.PI / 2 });

    s.black();
    s.sound('wind_surf', { action: 'start', volume: 0.7 });
    s.at(0.3).fade({ to: 0, seconds: 2.2 });
    s.at(0).act('soldier_a', { walkTo: { x: -5, z: -d + 9 }, speed: 0.8 });
    s.act('soldier_b', { walkTo: { x: 4.5, z: -d + 9.5 }, speed: 0.8 });
    // Two men, small, and the black aircraft behind them.
    s.shot({ from: { position: { x: 3.2, y: 1.5, z: 16 }, target: { x: 0, y: 3.2, z: -d * 0.5 }, fov: 40 }, to: { position: { x: 2.4, y: 1.6, z: 13.5 }, fov: 37 }, seconds: 6.5, ease: 'linear' });
    s.at(6.5);
    during(s, { from: { position: { x: -1.6, y: 1.74, z: 0.55 }, target: { x: 0.75, y: 1.5, z: -0.05 }, fov: 32 }, to: { position: { x: -1.5, y: 1.72, z: 0.45 }, fov: 30 } }, () => {
      s.wait(1.1);
      s.line('hv_01', { channel: 'face', gap: 0.8 });
    });
    // He takes it.
    s.shot({ from: { position: { x: 0.1, y: 1.35, z: 2.7 }, target: { x: 0, y: 1.22, z: 0 }, fov: 34 }, to: { position: { x: -0.1, y: 1.35, z: 2.5 } }, seconds: 3.2 });
    s.act('dez', { gesture: 'take' });
    s.wait(0.7).move('case', { translate: { x: -0.5, y: -0.08 }, seconds: 1.1 });
    s.wait(0.9).act('comprador', { gesture: 'idle' });
    s.wait(1.6);
    // The aircraft, one last time (the case rests at his feet from here on).
    s.move('case', { translate: { x: -0.65, y: -1.02, z: 0.54 }, seconds: 0.05 });
    s.act('dez', { gesture: 'idle', face: -0.5 });
    s.shot({ from: { position: { x: -3.5, y: 1.65, z: -Math.max(4, d - 26) }, target: craftAt, fov: 30 }, to: { position: { x: -3.1, y: 1.7, z: -Math.max(5, d - 24.5) }, fov: 28 }, seconds: 3.8, ease: 'linear' });
    s.wait(3.8);
    during(s, { from: { position: { x: 1.55, y: 1.72, z: 0.6 }, target: { x: DEZ.x, y: 1.68, z: 0 }, fov: 30 }, to: { position: { x: 1.45, y: 1.72, z: 0.5 } } }, () => {
      s.wait(0.5).act('dez', { face: 'comprador' });
      s.wait(0.9);
      s.line('hv_02', { channel: 'face', gap: 0.7 });
    });
    // Still friendly. Then only the wind.
    during(s, { from: { position: { x: -0.25, y: 1.62, z: 0.9 }, target: { x: BUYER.x, y: 1.6, z: 0 }, fov: 26 }, to: { position: { x: -0.2, y: 1.62, z: 0.82 } } }, () => {
      s.wait(0.6);
      s.line('hv_03', { channel: 'face', gap: 0 });
      s.wait(2.8);
    });
    // He turns away and says it walking.
    during(s, { from: { position: { x: -0.4, y: 1.5, z: 3.4 }, target: { x: 1.4, y: 1.45, z: 0.5 }, fov: 30 }, to: { target: { x: 2.4, y: 1.45, z: 1.3 } }, ease: 'linear' }, () => {
      s.act('comprador', { gesture: 'turn_away' });
      s.wait(0.9).act('comprador', { gesture: 'idle', walkTo: WALK_OFF, speed: 0.85 });
      s.wait(0.7).mark('betrayed');
      s.line('hv_04', { channel: 'face', gap: 0.5 });
    });
    // Dez turns, understanding; the veil closes over wind and surf.
    s.act('dez', { face: WALK_OFF });
    s.shot({ from: { position: { x: 1.15, y: 1.72, z: 1.0 }, target: { x: DEZ.x, y: 1.7, z: 0 }, fov: 26 }, to: { position: { x: 0.9, y: 1.72, z: 0.8 }, fov: 24 }, seconds: 5.6, ease: 'linear' });
    s.wait(1.4).fade({ to: 1, seconds: 4 });
    s.wait(4);
    // Full black; a second of nothing; one shot, far away.
    s.wait(1.2).sound('gunshot_far', { action: 'play' });
    s.mark('shot');
    s.wait(4.2).sound('wind_surf', { action: 'stop', fadeSeconds: 2.5 });
    s.wait(2.5 + 3);
    s.end({ keepBlack: true });
    return s.script();
  },
};
