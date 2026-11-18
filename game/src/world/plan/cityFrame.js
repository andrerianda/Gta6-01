// The city frame of Marazul. The street grid is not aligned with the compass: it is turned six
// degrees, so that the long east-west streets (the beach drive, the Gran Paseo) look almost due
// west at a compass heading of 276 degrees, where the golden-hour sun sets just to the right of
// the vanishing point. The plan is drawn in "city coordinates" (e, n), metres along the grid's
// east and north axes from the world origin, and converted to world (x, z) here.
//
//   const [x, z] = cityToWorld(600, -860);      // a corner on the beach drive
//   const [e, n] = worldToCity(player.x, player.z);

/**
 * The fixed measures of the city frame.
 * @type {Readonly<{gridAzimuthDegrees: number, westwardStreetAzimuthDegrees: number,
 *   eastX: number, eastZ: number, northX: number, northZ: number,
 *   extent: Readonly<{minX: number, maxX: number, minZ: number, maxZ: number}>,
 *   seaFloorHeight: number}>}
 */
export const CITY_FRAME = (() => {
  const gridAzimuthDegrees = 6;
  const angle = (gridAzimuthDegrees * Math.PI) / 180;
  return Object.freeze({
    /** Compass azimuth of the grid's north axis, in degrees clockwise from true north (-Z). */
    gridAzimuthDegrees,
    /** Compass azimuth of the grid's east-west streets when driven westwards. */
    westwardStreetAzimuthDegrees: 270 + gridAzimuthDegrees,
    /** The grid's east axis as a world direction. */
    eastX: Math.cos(angle),
    eastZ: Math.sin(angle),
    /** The grid's north axis as a world direction. */
    northX: Math.sin(angle),
    northZ: -Math.cos(angle),
    /** The world rectangle the height field covers: every piece of land, with sea around it. */
    extent: Object.freeze({ minX: -2048, maxX: 2048, minZ: -1856, maxZ: 2240 }),
    /** The height the sea floor falls to far from the coast. */
    seaFloorHeight: -32,
  });
})();

/**
 * Converts city coordinates to world coordinates.
 * @param {number} e Metres along the grid's east axis.
 * @param {number} n Metres along the grid's north axis.
 * @returns {[number, number]} World [x, z].
 */
export function cityToWorld(e, n) {
  return [e * CITY_FRAME.eastX + n * CITY_FRAME.northX, e * CITY_FRAME.eastZ + n * CITY_FRAME.northZ];
}

/**
 * Converts world coordinates to city coordinates.
 * @param {number} x
 * @param {number} z
 * @returns {[number, number]} City [e, n].
 */
export function worldToCity(x, z) {
  return [x * CITY_FRAME.eastX + z * CITY_FRAME.eastZ, x * CITY_FRAME.northX + z * CITY_FRAME.northZ];
}

/**
 * Converts a list of city coordinates (e0, n0, e1, n1, ...) to a flat world polyline.
 * @param {ArrayLike<number>} cityPoints
 * @returns {number[]} Flat [x, z, ...].
 */
export function cityPointsToWorld(cityPoints) {
  const out = new Array(cityPoints.length);
  for (let i = 0; i < cityPoints.length; i += 2) {
    const e = cityPoints[i];
    const n = cityPoints[i + 1];
    out[i] = e * CITY_FRAME.eastX + n * CITY_FRAME.northX;
    out[i + 1] = e * CITY_FRAME.eastZ + n * CITY_FRAME.northZ;
  }
  return out;
}

/**
 * Converts a city direction (de, dn) to a world direction.
 * @returns {[number, number]}
 */
export function cityDirectionToWorld(de, dn) {
  return cityToWorld(de, dn);
}
