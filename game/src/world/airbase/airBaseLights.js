// The lamps of Base Aérea Punta Garza, registered with the night-light manager (the same one the
// street lamps use): eight floodlights over the apron, white runway edge lights with a green
// threshold bar and a red far end, a red beacon on the control tower, and red warning strobes on
// the masts that flash while the alarm is up.
//
//   const lamps = createAirBaseLights(layout, context.atmosphere);
//   lamps.setAlarm(true);  lamps.dispose();

/** Candela in the game's exposure scale (a street lamp on an 8 m mast is about 500). */
const FLOOD = Object.freeze({ intensity: 2600, range: 78, angle: 1.05, height: 17.4, colour: 0xfff1d6 });
const RUNWAY_COLOURS = Object.freeze({ white: 0xfff6e0, green: 0x35ff7a, red: 0xff3a2a });

/**
 * Registers the base's lamps.
 * @param {import('./airBaseLayout.js').AirBaseLayout} layout
 * @param {{addLight?: Function, removeLight?: Function} | null} atmosphere
 * @returns {{count: number, setAlarm: (on: boolean) => void, dispose: () => void}}
 */
export function createAirBaseLights(layout, atmosphere) {
  const handles = [];
  const strobes = [];
  const add = (description) => {
    const handle = atmosphere?.addLight ? atmosphere.addLight(description) : null;
    if (handle) handles.push(handle);
    return handle;
  };
  const y = layout.y;
  for (const mast of layout.masts) {
    // Each floodlight leans towards the middle of the apron.
    const dx = layout.centre.x - mast.x;
    const dz = layout.centre.z - mast.z;
    const reach = Math.hypot(dx, dz) || 1;
    const lean = 0.55;
    const length = Math.hypot(lean, 1);
    add({
      kind: 'spot', position: [mast.x, y + FLOOD.height, mast.z], direction: [((dx / reach) * lean) / length, -1 / length, ((dz / reach) * lean) / length],
      color: FLOOD.colour, intensity: FLOOD.intensity, range: FLOOD.range, angle: FLOOD.angle, penumbra: 0.7, importance: 1.6, groundY: y + 0.05, glow: 1.4, glowSize: 1.3, beam: 0.25,
    });
    const strobe = add({ kind: 'point', position: [mast.x, y + 18.4, mast.z], color: 0xff2a1a, intensity: 0, range: 30, importance: 0.4, nightOnly: false, pool: false, glow: 1.5, glowSize: 0.7, blink: { period: 0.7, duty: 0.35, phase: (strobes.length % 2) * 0.5 } });
    if (strobe) strobes.push(strobe);
  }
  for (const lamp of layout.runwayLights) {
    add({ kind: 'point', position: [lamp.x, y + 0.45, lamp.z], color: RUNWAY_COLOURS[lamp.colour], intensity: 60, range: 7, importance: 0.15, groundY: y + 0.05, pool: false, glow: 1.2, glowSize: 0.45 });
  }
  // The tower's beacon: a slow red flash day and night, fast while the alarm is up.
  const beacon = add({ kind: 'point', position: [layout.tower.x, y + 27.5, layout.tower.z], color: 0xff2a1a, intensity: 420, range: 60, importance: 1.2, nightOnly: false, pool: false, glow: 2, glowSize: 1.1, blink: { period: 1.8, duty: 0.22, phase: 0 } });
  return {
    count: handles.length,
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
    },
  };
}
