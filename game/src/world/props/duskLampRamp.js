// Dusk lamp ramp: when the city's own lights (street lamps, lit shop windows, shop signs and neon)
// come on. The atmosphere's nightFactor only rises once the sun is under the horizon (about 19:25
// in Marazul), so lamps that followed it were still dark in the blue hour while the sky was
// coloured (judged picture 3). The city switches its lamps on by the sun's height instead, like a
// real photocell: the first lamps at about 18:45, every lamp by about 19:05, staggered so a
// street does not light at one instant; night and storms (the nightFactor) keep them on as before.
//
//   const lamps = duskLampFactor(atmosphere.state.sunDirection.y, atmosphere.state.nightFactor);
//   light.intensity = base * lampLevelAt(lamps, seed);     // one lamp of many, staggered
//   signs.setNightFactor(lamps);                           // signs and neon follow the ramp

/** Sun height (sine of the elevation) where the first lamps start to come on, and where all are on. */
export const LAMP_ON_SUN_HEIGHT = Object.freeze({ start: 0.2, full: 0.1 });
/** Each lamp's switch point is spread over this much of the ramp. */
const STAGGER = 0.35;

const smooth = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * How far the city's lamps are on, 0 (day) to 1 (all on): the dusk ramp by the sun's height,
 * or the atmosphere's night factor when that is higher (night, storm clouds by day).
 * @param {number | undefined} sunHeight The sun direction's y (sine of the elevation); unknown -> night factor only.
 * @param {number} [nightFactor] The atmosphere's night factor, 0..1.
 * @returns {number}
 */
export function duskLampFactor(sunHeight, nightFactor = 0) {
  const night = Math.min(1, Math.max(0, nightFactor || 0));
  if (!Number.isFinite(sunHeight)) return night;
  return Math.max(night, smooth(LAMP_ON_SUN_HEIGHT.start, LAMP_ON_SUN_HEIGHT.full, sunHeight));
}

/**
 * One lamp's level for a ramp value: each lamp switches on over a short stretch of the ramp at
 * its own point (from its seed), and every lamp is fully on when the ramp is 1.
 * @param {number} factor duskLampFactor's value.
 * @param {number} seed Any number that differs between lamps (their index).
 * @returns {number} 0..1
 */
export function lampLevelAt(factor, seed) {
  if (factor >= 1) return 1;
  if (factor <= 0) return 0;
  const point = STAGGER * ((seed * 0.6180339887) % 1);
  return Math.min(1, Math.max(0, (factor - point) / (1 - STAGGER)));
}

/**
 * Takes over the dusk switching of some registered night lights: their handles' intensity is
 * driven from the ramp (the light manager's own night threshold is turned off for them, with
 * nightOnly false in the description). Only lights described as night lights are taken.
 * @param {object[]} descriptions Light descriptions, before atmosphere.addLight; changed in place.
 * @returns {object[]} The descriptions taken (pass their handles to `track`).
 */
export function takeDuskSwitching(descriptions) {
  const taken = [];
  for (const description of descriptions) {
    if (description.nightOnly === false || description.blink) continue;
    description.nightOnly = false;
    description.duskRamp = true;
    taken.push(description);
  }
  return taken;
}

/**
 * The set of lamp handles the dressing switches by the ramp.
 * @returns {{add: (handle: object, baseIntensity: number) => object, remove: (entry: object) => void,
 *   update: (factor: number) => void, count: () => number}}
 */
export function createDuskLampSwitch() {
  const entries = new Set();
  let seed = 0;
  let last = -1;
  return {
    add(handle, baseIntensity) {
      const entry = { handle, base: baseIntensity, seed: seed++ };
      entries.add(entry);
      if (handle) handle.intensity = baseIntensity * lampLevelAt(Math.max(0, last), entry.seed);
      return entry;
    },
    remove(entry) { entries.delete(entry); },
    /** Sets every lamp's intensity for the ramp value (only when it changed). */
    update(factor) {
      if (Math.abs(factor - last) < 0.002 && !(factor >= 1 && last < 1) && !(factor <= 0 && last > 0)) return;
      last = factor;
      for (const entry of entries) if (entry.handle) entry.handle.intensity = entry.base * lampLevelAt(factor, entry.seed);
    },
    count: () => entries.size,
  };
}
