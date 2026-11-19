// The international standard atmosphere from the sea to 32 km: temperature, pressure, density and
// the speed of sound by height, in three layers (the troposphere cooling 6.5 K per km, the
// isothermal tropopause from 11 km, the stratosphere warming 1 K per km from 20 km). The flight
// model reads the density for lift, drag and thrust and the speed of sound for the Mach number.
// Pure numbers, no imports.

/**
 * Fills `out` with the standard air at a height above sea level.
 * @param {number} altitude Metres above sea level (clamped to -500 .. 32000).
 * @param {{temperature: number, pressure: number, density: number, speedOfSound: number, densityRatio: number}} out
 * @returns {typeof out} `out`: kelvin, pascals, kg/m^3, m/s and density over the sea-level density.
 */
export function standardAtmosphereAt(altitude, out) {
  const h = altitude < -500 ? -500 : altitude > 32000 ? 32000 : altitude;
  let temperature;
  let pressure;
  if (h <= 11000) {
    temperature = SEA_LEVEL_TEMPERATURE - 0.0065 * h;
    pressure = SEA_LEVEL_PRESSURE * Math.pow(temperature / SEA_LEVEL_TEMPERATURE, 5.25588);
  } else if (h <= 20000) {
    temperature = 216.65;
    pressure = 22632.1 * Math.exp(-(h - 11000) / 6341.62);
  } else {
    temperature = 216.65 + 0.001 * (h - 20000);
    pressure = 5474.89 * Math.pow(temperature / 216.65, -34.1632);
  }
  out.temperature = temperature;
  out.pressure = pressure;
  out.density = pressure / (GAS_CONSTANT * temperature);
  out.speedOfSound = Math.sqrt(1.4 * GAS_CONSTANT * temperature);
  out.densityRatio = out.density / SEA_LEVEL_DENSITY;
  return out;
}

/** Sea-level standard temperature, kelvin (15 C). */
export const SEA_LEVEL_TEMPERATURE = 288.15;
/** Sea-level standard pressure, pascals. */
export const SEA_LEVEL_PRESSURE = 101325;
/** Sea-level standard density, kg/m^3. */
export const SEA_LEVEL_DENSITY = 1.225;
/** The gas constant of dry air, J/(kg K). */
export const GAS_CONSTANT = 287.053;
/** Standard gravity, m/s^2 (the physics world's own value). */
export const GRAVITY = 9.81;

/** A fresh record for standardAtmosphereAt. */
export function createAirSample() {
  return { temperature: SEA_LEVEL_TEMPERATURE, pressure: SEA_LEVEL_PRESSURE, density: SEA_LEVEL_DENSITY, speedOfSound: 340.29, densityRatio: 1 };
}

/**
 * The temperature the skin of an aircraft settles at: the air's recovery temperature at a Mach number.
 * @param {number} temperature Outside air, kelvin.
 * @param {number} mach
 * @returns {number} Kelvin.
 */
export function recoveryTemperature(temperature, mach) {
  return temperature * (1 + 0.165 * mach * mach);
}
