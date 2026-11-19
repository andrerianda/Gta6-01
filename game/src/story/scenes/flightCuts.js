// The short exterior cuts of the flight: takeoff at dawn, the bomb and the falling radar tower,
// the Halcóns closing in, the island. The aircraft is never stopped: the game simulates while a
// cut plays, so each cut reads the aircraft's live place every frame (the shot's `attach`) and
// keeps it in the picture; each is a few seconds, because the pilot's hands are off meanwhile.
import { createSceneScript } from '../../cinematics/sceneScript.js';

/** Where the cuts happen when the world has no aircraft (tests, captures): world metres. */
const FALLBACK = Object.freeze({
  runway: Object.freeze({ x: -1640, z: -1565, heading: 1.466, speed: 78 }),
  radarTower: Object.freeze({ x: -1560, z: 752 }),
  sea: Object.freeze({ x: -5200, y: 420, z: -2400, heading: 1.31 }),
  island: Object.freeze({ x: -9200, y: 70, z: -3300 }),
});

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
 * An attach for a camera that stands still on the stage and turns after the aircraft: every
 * frame the shot's target becomes the aircraft's live place in stage space.
 */
function watching(aircraftId, stage, lift = 0) {
  const attach = (tools) => {
    const craft = liveAircraft(tools, aircraftId), cue = attach.cue;
    if (!craft || !cue) return null;
    const target = localOf(stage, craft);
    target.y += lift;
    cue.from.target = target;
    if (cue.to) cue.to.target = target;
    return null;
  };
  attach.cue = null;
  return attach;
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

/** @type {{id: string, build: (params: object, tools: object) => object}} */
export const CUT_TAKEOFF_SCENE = {
  id: 'cut_takeoff',
  build(params, tools) {
    const aircraftId = params?.aircraftId === 'garza_negra' ? 'garza_negra' : 'manta_sombra';
    const craft = liveAircraft(tools, aircraftId);
    const at = craft ?? FALLBACK.runway;
    const ground = Number(tools?.groundHeightAt?.(at.x, at.z)) || 0;
    const stage = { x: at.x, y: craft ? Math.min(craft.y, ground + 3) : ground, z: at.z, heading: at.heading };
    const s = createSceneScript({ skippable: true, letterbox: true }, tools);
    s.stage({ origin: { x: stage.x, y: stage.y, z: stage.z }, heading: stage.heading });
    // Low on the runway's sea side, ahead of the aircraft: it comes on, lifts past and goes out
    // over the water, with the base and its alarm lights behind it at first.
    const lift = craft ? craft.y - stage.y : 4;
    s.shot({ from: { position: { x: 15, y: 1.5, z: -150 }, target: { x: 0, y: lift, z: 0 }, fov: 30 },
      to: { position: { x: 15.5, y: 2.1, z: -151 }, target: craft ? { x: 0, y: lift, z: 0 } : { x: -6, y: 46, z: -460 }, fov: 24 },
      seconds: 6, ease: 'linear', shake: 0.25, attach: watching(aircraftId, stage, 1.5) });
    s.at(6).end({});
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
    // A chase angle behind and above; the look leans towards where the pair really is.
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
      const target = count ? { x: (x / count) * 0.45, y: 1 + (y / count) * 0.45, z: Math.min(10, (z / count) * 0.45 - 8) } : { x: 0, y: 1, z: -12 };
      cue.from.target = target;
      cue.to.target = target;
    };
    const s = createSceneScript({ skippable: true, letterbox: true }, tools);
    s.stage({ origin: { x: craft.x, y: craft.y, z: craft.z }, heading: craft.heading });
    s.shot({ from: { position: { x: -9, y: 9, z: 52 }, target: { x: 0, y: 1, z: -12 }, fov: 50 },
      to: { position: { x: 7, y: 6.5, z: 44 }, target: { x: 0, y: 1, z: -12 }, fov: 46 },
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
    // Behind and above, on the line from the island through the aircraft: the island grows over its back.
    const aim = (cue, live) => {
      const island = localOf(live, FALLBACK.island);
      const far = Math.hypot(island.x, island.z) || 1;
      const ux = island.x / far, uz = island.z / far;
      cue.from.position = { x: -ux * 40, y: 9, z: -uz * 40 };
      cue.to.position = { x: -ux * 64, y: 15, z: -uz * 64 };
      cue.from.target = { x: island.x, y: island.y + 40, z: island.z };
      cue.to.target = { x: island.x, y: island.y, z: island.z };
    };
    const s = createSceneScript({ skippable: true, letterbox: true }, tools);
    s.stage({ origin: { x: craft.x, y: craft.y, z: craft.z }, heading: craft.heading });
    const first = localOf(craft, FALLBACK.island);
    const far = Math.hypot(first.x, first.z) || 1;
    s.shot({ from: { position: { x: -first.x / far * 40, y: 9, z: -first.z / far * 40 }, target: { x: first.x, y: first.y + 40, z: first.z }, fov: 44 },
      to: { position: { x: -first.x / far * 64, y: 15, z: -first.z / far * 64 }, target: { x: first.x, y: first.y, z: first.z }, fov: 30 },
      seconds: 6, ease: 'smooth', attach: riding(aircraftId, aim) });
    s.at(6).end({});
    return bindShots(s.script());
  },
};
