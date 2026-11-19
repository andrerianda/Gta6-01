// The weather of MARAZUL as numbers: five named states (clear, hazy, overcast, rain, storm), timed
// transitions between them, and the slow consequences of rain (wet surfaces, puddles). Pure
// arithmetic, no three.js; the sky, the lighting, the rain effect and other systems' materials read
// the blended values.
//
//   const weather = createWeatherModel('clear');
//   weather.setWeather('storm', 40);      // blend to a thunderstorm over 40 seconds
//   weather.update(dt);
//   weather.current.rain;                 // 0..1 right now
//   weather.wetness;                      // 0 dry .. 1 soaked

/**
 * @typedef {Object} WeatherValues
 * @property {number} cloudCover Fraction of the sky covered by the low cloud deck, 0 to 1.
 * @property {number} cloudDarkness How heavy and grey the cloud bases are, 0 to 1.
 * @property {number} overcast How much the blue sky is replaced by a grey ceiling, 0 to 1.
 * @property {number} sunOcclusion Fraction of direct sunlight the clouds remove, 0 to 1.
 * @property {number} hazeScale Multiplier on the ground haze density.
 * @property {number} mieScale Multiplier on the glow around the sun.
 * @property {number} rain Rain intensity, 0 to 1.
 * @property {number} windSpeed Mean wind speed in metres per second.
 * @property {number} lightningRate Lightning strikes per second on average.
 * @property {number} ambientScale Multiplier on fill light (overcast skies light from everywhere).
 * @property {number} saturationScale Multiplier on image saturation.
 * @property {number} exposureScale Multiplier on exposure.
 * @property {number} waveScale Multiplier on the height of the sea.
 */

/** The names of the fields of WeatherValues, in a fixed order. */
export const WEATHER_FIELDS = Object.freeze([
  'cloudCover', 'cloudDarkness', 'overcast', 'sunOcclusion', 'hazeScale', 'mieScale', 'rain',
  'windSpeed', 'lightningRate', 'ambientScale', 'saturationScale', 'exposureScale', 'waveScale',
]);

/**
 * The target values of each named weather state.
 * @type {Readonly<Record<string, Readonly<WeatherValues>>>}
 */
export const WEATHER_STATES = Object.freeze({
  // Fair-weather cumulus drifting over a blue sky.
  clear: Object.freeze({
    cloudCover: 0.3, cloudDarkness: 0.0, overcast: 0.0, sunOcclusion: 0.0, hazeScale: 1.0,
    mieScale: 1.0, rain: 0.0, windSpeed: 3.5, lightningRate: 0.0, ambientScale: 1.0,
    saturationScale: 1.0, exposureScale: 1.0, waveScale: 1.0,
  }),
  // Humid, milky air: the sun still casts shadows but the distance dissolves.
  hazy: Object.freeze({
    cloudCover: 0.38, cloudDarkness: 0.05, overcast: 0.3, sunOcclusion: 0.22, hazeScale: 3.2,
    mieScale: 1.8, rain: 0.0, windSpeed: 1.5, lightningRate: 0.0, ambientScale: 1.15,
    saturationScale: 0.92, exposureScale: 1.0, waveScale: 0.7,
  }),
  // A closed grey ceiling: soft shadowless light.
  overcast: Object.freeze({
    cloudCover: 1.0, cloudDarkness: 0.35, overcast: 1.0, sunOcclusion: 0.93, hazeScale: 1.8,
    mieScale: 0.5, rain: 0.0, windSpeed: 5.0, lightningRate: 0.0, ambientScale: 1.5,
    saturationScale: 0.86, exposureScale: 1.3, waveScale: 1.25,
  }),
  // Steady tropical rain.
  rain: Object.freeze({
    cloudCover: 1.0, cloudDarkness: 0.6, overcast: 1.0, sunOcclusion: 0.97, hazeScale: 3.6,
    mieScale: 0.3, rain: 0.6, windSpeed: 7.5, lightningRate: 0.0, ambientScale: 1.35,
    saturationScale: 0.84, exposureScale: 1.45, waveScale: 1.6,
  }),
  // A thunderstorm: dark bases, sheets of rain, lightning.
  storm: Object.freeze({
    cloudCover: 1.0, cloudDarkness: 1.0, overcast: 1.0, sunOcclusion: 1.0, hazeScale: 5.0,
    mieScale: 0.2, rain: 1.0, windSpeed: 15.0, lightningRate: 0.11, ambientScale: 1.0,
    saturationScale: 0.8, exposureScale: 1.55, waveScale: 2.3,
  }),
});

/** Seconds of full rain until surfaces are soaked, and seconds for them to dry again. */
const SECONDS_TO_SOAK = 22;
const SECONDS_TO_DRY = 140;
/** Puddles lag behind: they fill only on already wet ground and linger after the rain. */
const SECONDS_TO_FILL_PUDDLES = 55;
const SECONDS_TO_DRAIN_PUDDLES = 320;

/**
 * Creates the weather state machine.
 * @param {string} [initial] The name of the starting state (a key of WEATHER_STATES).
 * @returns {{
 *   current: WeatherValues,
 *   name: string,
 *   wetness: number,
 *   puddles: number,
 *   transition: number,
 *   setWeather: (name: string, seconds?: number) => void,
 *   setWetness: (wetness: number, puddles?: number) => void,
 *   update: (deltaSeconds: number) => void,
 * }} `current` holds the blended values and is updated in place; `name` is the state being
 *   approached; `transition` runs from 0 to 1 while a change is under way (1 when settled);
 *   `wetness` and `puddles` run from 0 to 1.
 */
export function createWeatherModel(initial = 'clear') {
  const start = stateByName(initial);
  const from = { ...start };
  const target = { ...start };

  const model = {
    current: { ...start },
    name: initial,
    wetness: start.rain > 0.05 ? 1 : 0,
    puddles: start.rain > 0.05 ? 0.8 : 0,
    transition: 1,
    setWeather,
    setWetness,
    update,
  };
  let transitionSeconds = 0;
  let transitionElapsed = 0;

  /**
   * Starts a transition to a named state.
   * @param {string} name A key of WEATHER_STATES.
   * @param {number} [seconds] Duration of the blend; 0 switches at once.
   */
  function setWeather(name, seconds = 30) {
    const next = stateByName(name);
    if (name === model.name && model.transition >= 1) return;
    for (const field of WEATHER_FIELDS) {
      from[field] = model.current[field];
      target[field] = next[field];
    }
    model.name = name;
    transitionSeconds = Math.max(0, seconds);
    transitionElapsed = 0;
    model.transition = transitionSeconds > 0 ? 0 : 1;
    if (transitionSeconds === 0) {
      for (const field of WEATHER_FIELDS) model.current[field] = target[field];
    }
  }

  /** Forces the wetness (and optionally the puddles), for previews, cutscenes and screenshots. */
  function setWetness(wetness, puddles = wetness * 0.8) {
    model.wetness = clamp01(wetness);
    model.puddles = clamp01(puddles);
  }

  /** Advances the transition and the wetness by a time step in seconds. */
  function update(deltaSeconds) {
    const dt = Math.max(0, deltaSeconds);
    if (model.transition < 1) {
      transitionElapsed += dt;
      const linear = Math.min(1, transitionElapsed / transitionSeconds);
      model.transition = linear;
      const blend = linear * linear * (3 - 2 * linear);
      for (const field of WEATHER_FIELDS) {
        model.current[field] = from[field] + (target[field] - from[field]) * blend;
      }
    }

    const rain = model.current.rain;
    if (rain > 0.03) {
      model.wetness = Math.min(1, model.wetness + (dt * (0.35 + rain)) / SECONDS_TO_SOAK);
    } else {
      model.wetness = Math.max(0, model.wetness - dt / SECONDS_TO_DRY);
    }
    if (rain > 0.03 && model.wetness > 0.5) {
      model.puddles = Math.min(1, model.puddles + (dt * (0.3 + rain)) / SECONDS_TO_FILL_PUDDLES);
    } else if (rain <= 0.03) {
      model.puddles = Math.max(0, model.puddles - dt / SECONDS_TO_DRAIN_PUDDLES);
    }
  }

  return model;
}

/**
 * The names of the weather states, for menus and previews.
 * @returns {string[]}
 */
export function weatherStateNames() {
  return Object.keys(WEATHER_STATES);
}

function stateByName(name) {
  const state = WEATHER_STATES[name];
  if (!state) throw new Error(`unknown weather state: ${name}`);
  return state;
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
