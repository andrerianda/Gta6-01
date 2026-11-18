// The maths of the minimap: the rotation that puts the camera's view up, the projection of a
// world offset onto the radar disc (with blips beyond the rim pinned to its edge), and the range
// of map tiles a view needs. Pure functions, no DOM, tested in Node (tools/tests/hud/).
// World axes as everywhere: +X east, -Z north; on the canvas +x is right and +y is down, so a
// north-up map draws world z straight down the canvas.

/**
 * The canvas rotation that turns the map so the camera's forward direction points up.
 * @param {number} forwardX World x of the camera's horizontal forward direction.
 * @param {number} forwardZ World z of the same.
 * @returns {number} Radians for CanvasRenderingContext2D.rotate (0 when looking north).
 */
export function minimapRotationFromForward(forwardX, forwardZ) {
  if (forwardX === 0 && forwardZ === 0) return 0;
  return -Math.PI / 2 - Math.atan2(forwardZ, forwardX);
}

/**
 * Projects a world offset from the map's centre onto the disc.
 * @param {number} dx World x minus the centre's x, metres.
 * @param {number} dz World z minus the centre's z, metres.
 * @param {number} rotation From minimapRotationFromForward.
 * @param {number} scale Pixels per metre.
 * @param {number} rimRadius Pixels from the centre beyond which a blip is pinned to the rim;
 *   Infinity never pins.
 * @param {{x: number, y: number, pinned: boolean}} out Receives pixels from the disc's centre.
 * @returns {{x: number, y: number, pinned: boolean}} `out`.
 */
export function projectToMinimap(dx, dz, rotation, scale, rimRadius, out) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  let x = (dx * cos - dz * sin) * scale;
  let y = (dx * sin + dz * cos) * scale;
  const distance = Math.hypot(x, y);
  out.pinned = distance > rimRadius;
  if (out.pinned) {
    x *= rimRadius / distance;
    y *= rimRadius / distance;
  }
  out.x = x;
  out.y = y;
  return out;
}

/**
 * The heading of a world direction on the rotated disc, for drawing an arrow: the canvas angle
 * of a blip that faces along (directionX, directionZ), 0 pointing up the disc.
 * @param {number} directionX
 * @param {number} directionZ
 * @param {number} rotation From minimapRotationFromForward.
 * @returns {number} Radians, clockwise on screen.
 */
export function minimapArrowAngle(directionX, directionZ, rotation) {
  return Math.atan2(directionZ, directionX) + Math.PI / 2 + rotation;
}

/**
 * The tiles of a square grid of `span` metres that a disc of `radius` metres around
 * (centerX, centerZ) touches. Tile (i, j) covers x in [i*span, (i+1)*span) and z likewise.
 * @param {number} centerX
 * @param {number} centerZ
 * @param {number} radius Metres.
 * @param {number} span Metres per tile.
 * @param {{minI: number, maxI: number, minJ: number, maxJ: number}} out
 * @returns {{minI: number, maxI: number, minJ: number, maxJ: number}} `out`.
 */
export function tileRangeForDisc(centerX, centerZ, radius, span, out) {
  out.minI = Math.floor((centerX - radius) / span);
  out.maxI = Math.floor((centerX + radius) / span);
  out.minJ = Math.floor((centerZ - radius) / span);
  out.maxJ = Math.floor((centerZ + radius) / span);
  return out;
}

/**
 * The compass angle of the player's direction of view as the 16-point name shown on the bezel.
 * @param {number} forwardX
 * @param {number} forwardZ
 * @returns {string} "N", "NNE", ... "NNW".
 */
export function compassPointName(forwardX, forwardZ) {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const bearing = Math.atan2(forwardX, -forwardZ);               // 0 north, growing clockwise (east)
  const index = Math.round(((bearing / (Math.PI * 2)) * 16 + 16)) % 16;
  return names[index];
}
