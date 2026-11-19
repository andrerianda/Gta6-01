// The short exterior cuts of the flight: takeoff at dawn, the bomb and the falling radar tower,
// the Halcóns closing in, the island. The aircraft is never stopped: the game simulates while a
// cut plays, so each cut reads the aircraft's live place every frame (the shot's `attach`) and
// keeps it in the picture; each is a few seconds, because the pilot's hands are off meanwhile.
// Framing (the owner's rule for the cuts): a long lens (field of view 25 to 35 degrees) riding
// with the aircraft like a camera ship, the aircraft filling 35 to 60 % of the frame's width
// (framingDistance), seen from above its wing line so the planform reads, the horizon in the upper
// third and never through the middle, a slow drift round it, and the camera on the side that
// keeps the sun out of the lens (sunSide) so the dark aircraft is lit and not a silhouette.
import { createSceneScript } from '../../cinematics/sceneScript.js';

/** Where the cuts happen when the world has no aircraft (tests, captures): world metres. */
const FALLBACK = Object.freeze({
  runway: Object.freeze({ x: -1640, y: 12, z: -1565, heading: 1.466, speed: 78 }),
  radarTower: Object.freeze({ x: -1560, z: 752 }),
  sea: Object.freeze({ x: -5200, y: 420, z: -2400, heading: 1.31 }),
  island: Object.freeze({ x: -9200, y: 70, z: -3300 }),
});

/** Wing span and length of the mission aircraft, metres (catalog/vehicleCatalog.js). */
const AIRCRAFT_SIZE = Object.freeze({
  manta_sombra: Object.freeze({ span: 46, length: 21 }),
  garza_negra: Object.freeze({ span: 16.4, length: 32 }),
});
/** The picture's width over its height (the judged pictures are 16:10). */
const FRAME_ASPECT = 1.6;
const RADIANS = Math.PI / 180;

const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback);

/** The aircraft's live place { x, y, z, heading }, or null. */
export function liveAircraft(tools, aircraftId) {
  let craft = null;
  try { craft = tools?.aircraft?.(aircraftId) ?? null; } catch { craft = null; }
  const p = craft?.position;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
  return { x: p.x, y: finite(p.y, 0), z: p.z, heading: finite(craft.heading, 0) };
}

/** A world offset seen from an anchor { x, y, z, heading }: the anchor's own right, up and back. */
export function localOf(anchor, world) {
  const dx = world.x - anchor.x, dz = world.z - anchor.z;
  const sin = Math.sin(anchor.heading ?? 0), cos = Math.cos(anchor.heading ?? 0);
  return { x: dx * cos - dz * sin, y: finite(world.y, 0) - finite(anchor.y, 0), z: dx * sin + dz * cos };
}

/**
 * Hands every shot cue to the attach function that asked for it (`attach.cue`), so the function
 * can keep the shot's framing on something that moves. Returns the script.
 */
export function bindShots(script) {
  for (const cue of script.cues) if (cue.kind === 'shot' && typeof cue.attach === 'function' && 'cue' in cue.attach) cue.attach.cue = cue;
  return script;
}

/**
 * A camera place round the aircraft in its own frame (right, up, back).
 * @param {number} bearing Degrees from the nose, positive to the right (0 dead ahead, 180 behind).
 * @param {number} elevation Degrees above the wing line.
 * @param {number} distance Metres.
 */
export function orbitPlace(bearing, elevation, distance) {
  const b = bearing * RADIANS, e = elevation * RADIANS;
  return { x: Math.sin(b) * Math.cos(e) * distance, y: Math.sin(e) * distance, z: -Math.cos(b) * Math.cos(e) * distance };
}

/**
 * How far a camera stands so the aircraft fills a share of the frame's width.
 * @param {string} aircraftId
 * @param {number} bearing Degrees from the nose the camera looks in from.
 * @param {number} fov The vertical field of view, degrees.
 * @param {number} share The aircraft's share of the frame's width, 0..1.
 */
export function framingDistance(aircraftId, bearing, fov, share) {
  const size = AIRCRAFT_SIZE[aircraftId] ?? AIRCRAFT_SIZE.manta_sombra;
  const b = bearing * RADIANS;
  // What it spans across the view: the larger of the span and the length as seen from there, and a
  // quarter of the other (a swept planform's corners do not add up; measured on the Manta Sombra).
  const across = Math.abs(Math.cos(b)) * size.span, along = Math.abs(Math.sin(b)) * size.length;
  const width = Math.max(across, along) + 0.25 * Math.min(across, along);
  const halfWidth = Math.tan((fov * RADIANS) / 2) * FRAME_ASPECT;
  return width / (2 * share * halfWidth);
}

/**
 * Which side of the aircraft the sun is on: 1 its right, -1 its left (1 when nobody knows). A
 * camera on that side, ahead or behind, looks away from the sun and sees the aircraft's lit side.
 */
export function sunSide(tools, anchor) {
  let sun = null;
  try { sun = tools?.context?.atmosphere?.state?.sunDirection ?? null; } catch { sun = null; }
  if (!sun || !Number.isFinite(sun.x) || !Number.isFinite(sun.z)) return 1;
  return localOf({ x: 0, y: 0, z: 0, heading: anchor?.heading ?? 0 }, { x: sun.x, y: 0, z: sun.z }).x < 0 ? -1 : 1;
}

/** An attach that rides with the aircraft; `frame(cue, craft, tools)` may re-aim the shot first. */
function riding(aircraftId, frame = null) {
  const attach = (tools) => {
    const craft = liveAircraft(tools, aircraftId);
    if (craft && attach.cue && frame) frame(attach.cue, craft, tools);
    return craft;
  };
  attach.cue = null;
  return attach;
}

/**
 * The takeoff's two views. `front` (the mission's): ahead of the wing on the sun's side and above
 * it, looking back along the runway at the aircraft with the base and the dawn sky behind it; the
 * nose coming up turns the planform towards the lens. `rear` (`view: 'rear'`): behind the wing on
 * the sun's side and higher, the aircraft and its shadow going out over the causeway to the sea.
 * Bearing, elevation and the share of the frame at the start and the end; `aim` lifts the look
 * above the aircraft by that share of the distance, so the aircraft sits below the middle and the
 * horizon in the upper third.
 */
const TAKEOFF_VIEWS = Object.freeze({
  front: Object.freeze({ from: { bearing: 40, elevation: 18, share: 0.44, fov: 30 }, to: { bearing: 31, elevation: 16, share: 0.5, fov: 28 }, aim: 0.12 }),
  rear: Object.freeze({ from: { bearing: 142, elevation: 30, share: 0.44, fov: 30 }, to: { bearing: 151, elevation: 27, share: 0.5, fov: 28 }, aim: 0.03 }),
});

/** @type {{id: string, build: (params: object, tools: object) => object}} */
export const CUT_TAKEOFF_SCENE = {
  id: 'cut_takeoff',
  build(params, tools) {
    const aircraftId = params?.aircraftId === 'garza_negra' ? 'garza_negra' : 'manta_sombra';
    const craft = liveAircraft(tools, aircraftId) ?? FALLBACK.runway;
    const view = TAKEOFF_VIEWS[params?.view] ?? TAKEOFF_VIEWS.front;
    const side = sunSide(tools, craft);
    const ground = Number(tools?.groundHeightAt?.(craft.x, craft.z)) || 0;
    // The camera ship never goes under the runway, however low the aircraft still is.
    const floor = ground + 2.5 - craft.y;
    const frame = (end) => {
      const distance = framingDistance(aircraftId, end.bearing, end.fov, end.share);
      const position = orbitPlace(side * end.bearing, end.elevation, distance);
      position.y = Math.max(position.y, floor);
      return { position, target: { x: 0, y: distance * view.aim, z: 0 }, fov: end.fov };
    };
    const s = createSceneScript({ skippable: true, letterbox: true }, tools);
    s.stage({ origin: { x: craft.x, y: craft.y, z: craft.z }, heading: craft.heading });
    s.shot({ from: frame(view.from), to: frame(view.to), seconds: 5, ease: 'smooth', shake: 0.2, attach: riding(aircraftId) });
    s.at(5).end({});
    return bindShots(s.script());
  },
};

/** @type {{id: string, build: (params: object, tools: object) => object}} */
export const CUT_BOMB_SCENE = {
  id: 'cut_bomb',
  build(params, tools) {
    const tower = { x: finite(params?.target?.x, FALLBACK.radarTower.x), z: finite(params?.target?.z, FALLBACK.radarTower.z) };
    const hit = params?.hit !== false;
    const ground = (x, z) => Number(tools?.groundHeightAt?.(x, z)) || 0;
    const base = ground(tower.x, tower.z);
    // Low among the rocks, looking up the tower into the dawn sky; the camera stands on its own ground.
    const from = { x: 24, z: 31 }, to = { x: 21.5, z: 28.5 };
    const eye = (p, up) => Math.max(ground(tower.x + p.x, tower.z + p.z) - base, -6) + up;
    const s = createSceneScript({ skippable: true, letterbox: true }, tools);
    s.stage({ origin: { x: tower.x, y: base, z: tower.z }, heading: 0 });
    s.shot({ from: { position: { ...from, y: eye(from, 1.3) }, target: { x: 0, y: hit ? 17 : 12, z: 0 }, fov: 40 },
      to: { position: { ...to, y: eye(to, 1.1) }, target: { x: hit ? 3 : 0, y: hit ? 5 : 11, z: hit ? -3 : 0 }, fov: 36 },
      seconds: 6, ease: hit ? 'in' : 'smooth', shake: hit ? 0.7 : 0.2 });
    s.at(6).end({});
    return s.script();
  },
};

/** @type {{id: string, build: (params: object, tools: object) => object}} */
export const CUT_HALCONS_SCENE = {
  id: 'cut_halcons',
  build(params, tools) {
    const aircraftId = params?.aircraftId === 'garza_negra' ? 'garza_negra' : 'manta_sombra';
    const craft = liveAircraft(tools, aircraftId) ?? FALLBACK.sea;
    const side = sunSide(tools, craft);
    // Behind and above on a long lens; the look leans towards where the pair really is, so the
    // two Halcóns close in between the camera and the aircraft.
    const from = { bearing: 166, elevation: 15, share: 0.36, fov: 34 }, to = { bearing: 175, elevation: 12, share: 0.42, fov: 32 };
    const place = (end) => orbitPlace(side * end.bearing, end.elevation, framingDistance(aircraftId, end.bearing, end.fov, end.share));
    const rest = { x: 0, y: 4, z: -6 };
    const lean = (cue, live, t) => {
      let pair = [];
      try { pair = t?.context?.systems?.find?.('airDefence')?.interceptors ?? []; } catch { pair = []; }
      let x = 0, y = 0, z = 0, count = 0;
      for (const jet of pair) {
        if (!jet || !Number.isFinite(jet.x) || !Number.isFinite(jet.z)) continue;
        const local = localOf(live, { x: jet.x, y: finite(jet.y, live.y), z: jet.z });
        if (Math.hypot(local.x, local.y, local.z) > 400) continue;
        x += local.x; y += local.y; z += local.z; count += 1;
      }
      const target = count ? { x: (x / count) * 0.45, y: rest.y + (y / count) * 0.45, z: Math.min(10, (z / count) * 0.45 + rest.z) } : rest;
      cue.from.target = target;
      cue.to.target = target;
    };
    const s = createSceneScript({ skippable: true, letterbox: true }, tools);
    s.stage({ origin: { x: craft.x, y: craft.y, z: craft.z }, heading: craft.heading });
    s.shot({ from: { position: place(from), target: rest, fov: from.fov }, to: { position: place(to), target: rest, fov: to.fov },
      seconds: 5, ease: 'smooth', attach: riding(aircraftId, lean) });
    s.at(5).end({});
    return bindShots(s.script());
  },
};

/** @type {{id: string, build: (params: object, tools: object) => object}} */
export const CUT_ISLAND_SCENE = {
  id: 'cut_island',
  build(params, tools) {
    const aircraftId = params?.aircraftId === 'garza_negra' ? 'garza_negra' : 'manta_sombra';
    const craft = liveAircraft(tools, aircraftId) ?? { ...FALLBACK.sea, x: -6900, z: -2700, y: 320 };
    // Behind and above, on the line from the island through the aircraft: the island grows over
    // its back while the lens closes from the whole aircraft to the island beyond it.
    const near = framingDistance(aircraftId, 180, 34, 0.52), far = framingDistance(aircraftId, 180, 26, 0.38);
    const frame = (live) => {
      const island = localOf(live, FALLBACK.island);
      const reach = Math.hypot(island.x, island.z) || 1;
      const ux = island.x / reach, uz = island.z / reach;
      return {
        from: { position: { x: -ux * near, y: near * 0.2, z: -uz * near }, target: { x: island.x, y: island.y + 40, z: island.z } },
        to: { position: { x: -ux * far, y: far * 0.24, z: -uz * far }, target: { x: island.x, y: island.y, z: island.z } },
      };
    };
    const aim = (cue, live) => {
      const next = frame(live);
      cue.from.position = next.from.position;
      cue.from.target = next.from.target;
      cue.to.position = next.to.position;
      cue.to.target = next.to.target;
    };
    const first = frame(craft);
    const s = createSceneScript({ skippable: true, letterbox: true }, tools);
    s.stage({ origin: { x: craft.x, y: craft.y, z: craft.z }, heading: craft.heading });
    s.shot({ from: { ...first.from, fov: 34 }, to: { ...first.to, fov: 26 }, seconds: 6, ease: 'smooth', attach: riding(aircraftId, aim) });
    s.at(6).end({});
    return bindShots(s.script());
  },
};
