// Where the sun and the moon stand over MARAZUL for a given clock time. Pure mathematics, no
// three.js: the functions write into any object with x, y and z (a THREE.Vector3 works), so the
// lighting rig, the sky dome and the Node tests all share them.
//
// The city sits at a subtropical latitude on one fixed calendar day, chosen so that the clock reads
// like a Gulf-coast summer evening: sunrise about 06:30, the sun highest (79 degrees) at 13:00,
// sunset about 19:30 a little north of due west. World axes: +X east, +Y up, -Z north.
//
//   computeSunDirection(18.8, sunDirection);   // unit vector from the ground toward the sun
//   sunElevationAt(18.8);                      // about 0.16 rad: golden hour

const DEGREES = Math.PI / 180;

/**
 * The fixed astronomical setting of the game world.
 * `latitude` and `solarDeclination` are in radians; `solarNoonHour` is the clock hour at which the
 * sun crosses the meridian (later than 12 because the clock runs on daylight-saving time).
 */
export const CELESTIAL_SETTING = Object.freeze({
  latitude: 25.8 * DEGREES,
  solarDeclination: 15 * DEGREES,
  solarNoonHour: 13,
  // The moon trails the anti-solar point so that it is already up at dusk and sets before dawn.
  moonHourAngleLead: 25 * DEGREES,
  moonDeclination: -8 * DEGREES,
  // The night key light never comes from lower than this, so moon shadows stay short and calm.
  moonLightMinElevation: 28 * DEGREES,
});

/**
 * Writes the unit direction from the ground toward the sun at a clock time.
 * @param {number} hours Time of day, 0 to 24 (values outside wrap around).
 * @param {{x: number, y: number, z: number}} out Receives the direction.
 * @returns {{x: number, y: number, z: number}} `out`.
 */
export function computeSunDirection(hours, out) {
  const hourAngle = hourAngleAt(hours, CELESTIAL_SETTING.solarNoonHour);
  return directionFromEquatorial(hourAngle, CELESTIAL_SETTING.solarDeclination, out);
}

/**
 * Writes the unit direction from the ground toward the moon at a clock time.
 * @param {number} hours Time of day, 0 to 24.
 * @param {{x: number, y: number, z: number}} out Receives the direction.
 * @returns {{x: number, y: number, z: number}} `out`.
 */
export function computeMoonDirection(hours, out) {
  const sunHourAngle = hourAngleAt(hours, CELESTIAL_SETTING.solarNoonHour);
  const moonHourAngle = sunHourAngle + Math.PI + CELESTIAL_SETTING.moonHourAngleLead;
  return directionFromEquatorial(moonHourAngle, CELESTIAL_SETTING.moonDeclination, out);
}

/**
 * Writes the direction the night key light shines from: the moon, lifted to a minimum elevation
 * so that it always grazes the city from above rather than from the horizon.
 * @param {number} hours Time of day, 0 to 24.
 * @param {{x: number, y: number, z: number}} out Receives the direction.
 * @returns {{x: number, y: number, z: number}} `out`.
 */
export function computeMoonLightDirection(hours, out) {
  computeMoonDirection(hours, out);
  const minY = Math.sin(CELESTIAL_SETTING.moonLightMinElevation);
  if (out.y < minY) {
    const horizontal = Math.hypot(out.x, out.z);
    const scale = horizontal > 1e-6 ? Math.sqrt(1 - minY * minY) / horizontal : 0;
    if (scale === 0) {
      out.x = 0;
      out.z = Math.sqrt(1 - minY * minY);
    } else {
      out.x *= scale;
      out.z *= scale;
    }
    out.y = minY;
  }
  return out;
}

/**
 * The sun's elevation above the horizon.
 * @param {number} hours Time of day, 0 to 24.
 * @returns {number} Radians; negative when the sun is below the horizon.
 */
export function sunElevationAt(hours) {
  const hourAngle = hourAngleAt(hours, CELESTIAL_SETTING.solarNoonHour);
  return Math.asin(sineOfElevation(hourAngle, CELESTIAL_SETTING.solarDeclination));
}

/**
 * The moon's elevation above the horizon.
 * @param {number} hours Time of day, 0 to 24.
 * @returns {number} Radians; negative when the moon is below the horizon.
 */
export function moonElevationAt(hours) {
  const hourAngle =
    hourAngleAt(hours, CELESTIAL_SETTING.solarNoonHour) + Math.PI + CELESTIAL_SETTING.moonHourAngleLead;
  return Math.asin(sineOfElevation(hourAngle, CELESTIAL_SETTING.moonDeclination));
}

/**
 * The compass azimuth of a direction: 0 is north (-Z), a quarter turn is east (+X).
 * @param {{x: number, z: number}} direction Any vector; only its horizontal part is used.
 * @returns {number} Radians in [0, 2 pi).
 */
export function compassAzimuthOf(direction) {
  const azimuth = Math.atan2(direction.x, -direction.z);
  return azimuth < 0 ? azimuth + 2 * Math.PI : azimuth;
}

/**
 * The clock hours of sunrise and sunset (the sun's centre on the horizon, no refraction).
 * @returns {{sunrise: number, sunset: number}}
 */
export function sunriseAndSunsetHours() {
  const { latitude, solarDeclination, solarNoonHour } = CELESTIAL_SETTING;
  const halfDay = Math.acos(-Math.tan(latitude) * Math.tan(solarDeclination)) / (15 * DEGREES);
  return { sunrise: solarNoonHour - halfDay, sunset: solarNoonHour + halfDay };
}

/** The hour angle (radians, negative before the meridian crossing) of a body that transits at `noonHour`. */
function hourAngleAt(hours, noonHour) {
  let offset = (hours - noonHour) % 24;
  if (offset < -12) offset += 24;
  if (offset > 12) offset -= 24;
  return offset * 15 * DEGREES;
}

function sineOfElevation(hourAngle, declination) {
  const { latitude } = CELESTIAL_SETTING;
  return (
    Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle)
  );
}

/** Converts an hour angle and a declination to a world-space unit vector (east, up, -north). */
function directionFromEquatorial(hourAngle, declination, out) {
  const { latitude } = CELESTIAL_SETTING;
  const east = -Math.cos(declination) * Math.sin(hourAngle);
  const north =
    Math.cos(latitude) * Math.sin(declination) -
    Math.sin(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  const up = sineOfElevation(hourAngle, declination);
  out.x = east;
  out.y = up;
  out.z = -north;
  return out;
}
