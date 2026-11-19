// Lightning for the thunderstorm: when strikes happen, how the flash flickers, and when the
// thunder should be heard. Pure arithmetic, no three.js. The lighting rig adds `flash` to the sky
// and the fill light; the audio system is asked for thunder through a callback, delayed by the
// time sound needs to cover the strike's distance.
//
//   const lightning = createLightningModel({ onThunder: (strike) => audio.thunder(strike) });
//   lightning.update(dt, weather.current.lightningRate);
//   lightning.flash;                      // 0 dark .. about 1 at the peak of a stroke

const SPEED_OF_SOUND = 343;
const MAX_PENDING_THUNDER = 8;

/**
 * @typedef {Object} LightningStrike
 * @property {number} distance Metres from the listener to the strike.
 * @property {number} azimuth Compass direction of the strike in radians (0 north, clockwise).
 * @property {number} intensity Relative strength, 0.4 to 1.
 */

/**
 * Creates the lightning scheduler.
 * @param {Object} [options]
 * @param {(strike: LightningStrike) => void} [options.onThunder] Called when the thunder of a
 *   strike reaches the listener.
 * @param {() => number} [options.random] A source of floats in [0, 1); defaults to a small
 *   deterministic generator so that storms replay identically.
 * @returns {{
 *   flash: number,
 *   strikeAzimuth: number,
 *   strikeElevation: number,
 *   onThunder: ((strike: LightningStrike) => void) | null,
 *   update: (deltaSeconds: number, strikesPerSecond: number) => void,
 *   trigger: (distance?: number, azimuth?: number) => void,
 * }} `flash` is the brightness of the current stroke; `strikeAzimuth` and `strikeElevation` say
 *   where in the sky it glows; `trigger` forces a strike now (cutscenes, previews).
 */
export function createLightningModel(options = {}) {
  const random = options.random ?? createSmallRandom(0x51ed270b);
  const model = {
    flash: 0,
    strikeAzimuth: 0,
    strikeElevation: 0.3,
    onThunder: options.onThunder ?? null,
    update,
    trigger,
  };

  // The stroke in progress: a few sharp pulses of decreasing strength.
  let strokeAge = Infinity;
  let strokeStrength = 0;
  let pulseCount = 0;
  const pulseTimes = new Float32Array(4);
  const pulseLevels = new Float32Array(4);

  // Thunder on its way: remaining seconds, and the strike it belongs to.
  const pendingDelay = new Float32Array(MAX_PENDING_THUNDER).fill(-1);
  const pendingStrikes = [];
  for (let i = 0; i < MAX_PENDING_THUNDER; i += 1) pendingStrikes.push({ distance: 0, azimuth: 0, intensity: 0 });

  /** Starts a strike now. Distance in metres, azimuth in radians; both random when omitted. */
  function trigger(distance, azimuth) {
    const strikeDistance = distance ?? 600 + random() * random() * 7000;
    const strikeAzimuth = azimuth ?? random() * Math.PI * 2;
    strokeStrength = Math.min(1, 0.4 + 0.75 * Math.exp(-strikeDistance / 3500) + random() * 0.15);
    strokeAge = 0;
    pulseCount = 2 + Math.floor(random() * 3);
    let time = 0;
    for (let i = 0; i < pulseCount; i += 1) {
      pulseTimes[i] = time;
      pulseLevels[i] = i === 0 ? 1 : 0.35 + random() * 0.55;
      time += 0.05 + random() * 0.11;
    }
    model.strikeAzimuth = strikeAzimuth;
    model.strikeElevation = 0.12 + random() * 0.4;

    for (let i = 0; i < MAX_PENDING_THUNDER; i += 1) {
      if (pendingDelay[i] < 0) {
        pendingDelay[i] = strikeDistance / SPEED_OF_SOUND;
        pendingStrikes[i].distance = strikeDistance;
        pendingStrikes[i].azimuth = strikeAzimuth;
        pendingStrikes[i].intensity = strokeStrength;
        break;
      }
    }
  }

  /**
   * Advances the flash and the thunder timers and may start a new strike.
   * @param {number} deltaSeconds Time step.
   * @param {number} strikesPerSecond Mean strike rate (WeatherValues.lightningRate).
   */
  function update(deltaSeconds, strikesPerSecond) {
    const dt = Math.max(0, deltaSeconds);
    // A Poisson process: the chance of a strike in this step.
    if (strikesPerSecond > 0 && strokeAge > 0.6 && random() < 1 - Math.exp(-strikesPerSecond * dt)) {
      trigger();
    }

    strokeAge += dt;
    let level = 0;
    for (let i = 0; i < pulseCount; i += 1) {
      const age = strokeAge - pulseTimes[i];
      if (age >= 0) level = Math.max(level, pulseLevels[i] * Math.exp(-age * 16));
    }
    model.flash = level < 0.004 ? 0 : level * strokeStrength;

    for (let i = 0; i < MAX_PENDING_THUNDER; i += 1) {
      if (pendingDelay[i] < 0) continue;
      pendingDelay[i] -= dt;
      if (pendingDelay[i] <= 0) {
        pendingDelay[i] = -1;
        if (model.onThunder) model.onThunder(pendingStrikes[i]);
      }
    }
  }

  return model;
}

/** A tiny deterministic generator (mulberry32) for effects that need no shared seed stream. */
export function createSmallRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
