// Wind for vegetation, flags, rain and cloud drift: a prevailing sea breeze whose direction
// wanders slowly and whose speed comes in gusts. Pure arithmetic, no three.js.
//
//   const wind = createWindModel();
//   wind.update(dt, weather.current.windSpeed);
//   wind.x, wind.z;      // metres per second, world axes (+X east, -Z north)
//   wind.gust;           // 0 calm lull .. 1 full gust, for extra sway

/** The breeze blows in from the Gulf: from the west-south-west toward the land. */
const PREVAILING_AZIMUTH = 1.2;

/**
 * Creates the wind model.
 * @returns {{
 *   x: number, z: number, speed: number, gust: number, azimuth: number, time: number,
 *   update: (deltaSeconds: number, meanSpeed: number) => void,
 * }} `x` and `z` are the wind velocity in metres per second; `speed` its length; `azimuth` the
 *   compass direction it blows toward (radians, 0 north, clockwise); `gust` runs 0 to 1; `time`
 *   is the model's own clock in seconds, for shaders that animate sway.
 */
export function createWindModel() {
  const wind = { x: 0, z: 0, speed: 0, gust: 0, azimuth: PREVAILING_AZIMUTH, time: 0, update };

  /**
   * Advances the wind.
   * @param {number} deltaSeconds Time step.
   * @param {number} meanSpeed Mean wind speed in metres per second (WeatherValues.windSpeed).
   */
  function update(deltaSeconds, meanSpeed) {
    wind.time += Math.max(0, deltaSeconds);
    const t = wind.time;
    // Three incommensurate sines stand in for turbulence: a slow swell, a gust front, a flutter.
    const swell = Math.sin(t * 0.11 + 1.3);
    const front = Math.sin(t * 0.37 + 0.4) * Math.sin(t * 0.23 + 2.1);
    const flutter = Math.sin(t * 1.9) * 0.5 + Math.sin(t * 3.1 + 1.0) * 0.5;
    const gust = clamp01(0.5 + 0.28 * swell + 0.34 * front + 0.1 * flutter);
    wind.gust = gust;
    wind.speed = meanSpeed * (0.55 + 0.9 * gust);
    wind.azimuth = PREVAILING_AZIMUTH + 0.35 * Math.sin(t * 0.045) + 0.12 * Math.sin(t * 0.31 + 0.7);
    wind.x = Math.sin(wind.azimuth) * wind.speed;
    wind.z = -Math.cos(wind.azimuth) * wind.speed;
  }

  update(0, 3);
  return wind;
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
