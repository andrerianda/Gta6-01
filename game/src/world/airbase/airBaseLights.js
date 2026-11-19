// The lamps of Base Aérea Punta Garza, registered with the night-light manager (the same one the
// street lamps use, so each gets its glow sprite, the nearest get real lights and the others a
// soft pool on the concrete): the floodlights at the heads of the masts, the watchtowers'
// searchlights, white runway edge lights with a green threshold bar and a red far end, a red
// beacon on the control tower, and red warning strobes on the masts that flash while the alarm is
// up. The base switches its lamps like the city does, by the sun's height (world/props/
// duskLampRamp.js): on through the dusk, the night and the dawn, off in full daylight.
//
//   const lamps = createAirBaseLights(layout, context.atmosphere, structures.lampHeads);
//   lamps.update();  lamps.level;  lamps.setAlarm(true);  lamps.dispose();

import { duskLampFactor, lampLevelAt } from '../props/duskLampRamp.js';

/** Candela in the game's exposure scale (a street lamp on an 8 m mast is about 500). */
const FLOOD = Object.freeze({ intensity: 2600, range: 78, angle: 1.05, height: 17.4, colour: 0xfff1d6 });
const SEARCH = Object.freeze({ intensity: 1500, range: 70, angle: 0.36, colour: 0xf4f6ff });
const RUNWAY_COLOURS = Object.freeze({ white: 0xfff6e0, green: 0x35ff7a, red: 0xff3a2a });

/**
 * Registers the base's lamps.
 * @param {import('./airBaseLayout.js').AirBaseLayout} layout
 * @param {{addLight?: Function, removeLight?: Function, state?: {sunDirection?: {y: number}, nightFactor?: number}} | null} atmosphere
 * @param {{kind: string, position: number[], direction: number[]}[]} [lampHeads] Where the kit's lamp
 *   heads are and shine (airBaseStructures.js); without it the floodlights hang over the masts' feet.
 * @returns {{count: number, floods: number, searchlights: number, level: number, update: () => number,
 *   setAlarm: (on: boolean) => void, dispose: () => void}}
 */
export function createAirBaseLights(layout, atmosphere, lampHeads = null) {
  const handles = [];
  const strobes = [];
  /** The lamps the dusk ramp switches: {handle, base, seed}. */
  const ramped = [];
  const add = (description, switched = false) => {
    if (switched) {
      // The base dims these itself through `intensity`; the glow follows it.
      description.nightOnly = false;
      description.duskRamp = true;
    }
    const handle = atmosphere?.addLight ? atmosphere.addLight(description) : null;
    if (handle) {
      handles.push(handle);
      if (switched) ramped.push({ handle, base: description.intensity, seed: ramped.length });
    }
    return handle;
  };
  const y = layout.y;
  const heads = lampHeads && lampHeads.length > 0 ? lampHeads : layout.masts.map((mast) => {
    // Each floodlight leans towards the middle of the apron.
    const dx = layout.centre.x - mast.x;
    const dz = layout.centre.z - mast.z;
    const reach = Math.hypot(dx, dz) || 1;
    const lean = 0.55;
    const length = Math.hypot(lean, 1);
    return { kind: 'flood', position: [mast.x, y + FLOOD.height, mast.z], direction: [((dx / reach) * lean) / length, -1 / length, ((dz / reach) * lean) / length] };
  });
  let floods = 0;
  let searchlights = 0;
  for (const head of heads) {
    if (head.kind === 'search') {
      searchlights += 1;
      add({
        kind: 'spot', position: head.position, direction: head.direction, color: SEARCH.colour, intensity: SEARCH.intensity, range: SEARCH.range,
        angle: SEARCH.angle, penumbra: 0.5, importance: 0.7, groundY: y + 0.05, glow: 1.5, glowSize: 0.8, beam: 0.35,
      }, true);
      continue;
    }
    floods += 1;
    add({
      kind: 'spot', position: head.position, direction: head.direction, color: FLOOD.colour, intensity: FLOOD.intensity, range: FLOOD.range,
      angle: FLOOD.angle, penumbra: 0.7, importance: 1.6, groundY: y + 0.05, glow: 1.6, glowSize: 1.5, beam: 0.25,
    }, true);
  }
  for (const mast of layout.masts) {
    const strobe = add({ kind: 'point', position: [mast.x, y + 18.4, mast.z], color: 0xff2a1a, intensity: 0, range: 30, importance: 0.4, nightOnly: false, pool: false, glow: 1.5, glowSize: 0.7, blink: { period: 0.7, duty: 0.35, phase: (strobes.length % 2) * 0.5 } });
    if (strobe) strobes.push(strobe);
  }
  for (const lamp of layout.runwayLights) {
    add({ kind: 'point', position: [lamp.x, y + 0.45, lamp.z], color: RUNWAY_COLOURS[lamp.colour], intensity: 60, range: 7, importance: 0.15, groundY: y + 0.05, pool: false, glow: 1.2, glowSize: 0.45 }, true);
  }
  // The tower's beacon: a slow red flash day and night, fast while the alarm is up.
  const beacon = add({ kind: 'point', position: [layout.tower.x, y + 27.5, layout.tower.z], color: 0xff2a1a, intensity: 420, range: 60, importance: 1.2, nightOnly: false, pool: false, glow: 2, glowSize: 1.1, blink: { period: 1.8, duty: 0.22, phase: 0 } });
  let shown = -1;
  const lights = {
    count: handles.length,
    floods,
    searchlights,
    /** How far the lamps are on, 0 (day) to 1 (dusk, night and dawn). */
    level: 0,
    /** Follows the hour: sets every switched lamp for the sun's height. Returns the level. */
    update() {
      const state = atmosphere?.state;
      const level = duskLampFactor(state?.sunDirection?.y, state?.nightFactor ?? 0);
      lights.level = level;
      if (Math.abs(level - shown) < 0.002 && !(level >= 1 && shown < 1) && !(level <= 0 && shown > 0)) return level;
      shown = level;
      for (const lamp of ramped) lamp.handle.intensity = lamp.base * lampLevelAt(level, lamp.seed);
      return level;
    },
    setAlarm(on) {
      for (const strobe of strobes) strobe.intensity = on ? 380 : 0;
      if (beacon?.blink) {
        beacon.blink.period = on ? 0.5 : 1.8;
        beacon.blink.duty = on ? 0.5 : 0.22;
      }
    },
    dispose() {
      for (const handle of handles) atmosphere?.removeLight?.(handle);
      handles.length = 0;
      ramped.length = 0;
    },
  };
  lights.update();
  return lights;
}
