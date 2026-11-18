// The maths of the minimap: the rotation that puts the camera's view up, the projection of a
// world offset onto the flat map, the tilt of that map into the screen (seen from behind and
// above, ahead shrinking toward the top) and its inverse row by row, the pinning of out-of-range
// blips to the map's edge, and the range of map tiles a view needs. Pure functions, no DOM,
// tested in Node (tools/tests/hud/).
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
 * Projects a world offset from the map's centre onto the square radar.
 * @param {number} dx World x minus the centre's x, metres.
 * @param {number} dz World z minus the centre's z, metres.
 * @param {number} rotation From minimapRotationFromForward.
 * @param {number} scale Pixels per metre.
 * @param {number} edge Half the side of the square, in pixels from the centre, beyond which a
 *   blip is pinned to the square's edge along its direction; Infinity never pins.
 * @param {{x: number, y: number, pinned: boolean}} out Receives pixels from the square's centre.
 * @returns {{x: number, y: number, pinned: boolean}} `out`.
 */
export function projectToMinimap(dx, dz, rotation, scale, edge, out) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  let x = (dx * cos - dz * sin) * scale;
  let y = (dx * sin + dz * cos) * scale;
  const reach = Math.max(Math.abs(x), Math.abs(y));
  out.pinned = reach > edge;
  if (out.pinned) {
    x *= edge / reach;
    y *= edge / reach;
  }
  out.x = x;
  out.y = y;
  return out;
}

/**
 * Tilts a point of the flat map into the screen, as if the map lay on the ground seen from
 * behind and above: the map leans back by `tilt` about the horizontal line through the player,
 * seen from `depth` pixels away, so what lies ahead (up the map) shrinks toward the top.
 * @param {number} x Map pixels right of the player.
 * @param {number} y Map pixels below the player (negative: ahead).
 * @param {number} tilt Radians (0: straight down onto the map).
 * @param {number} depth Viewing distance in pixels.
 * @param {{x: number, y: number, ok: boolean}} out Screen pixels from the player's screen point;
 *   ok is false for points so far behind that they leave the view.
 * @returns {{x: number, y: number, ok: boolean}} `out`.
 */
export function tiltToScreen(x, y, tilt, depth, out) {
  const w = depth - y * Math.sin(tilt);
  out.ok = w > depth * 0.05;
  const s = out.ok ? depth / w : 0;
  out.x = x * s;
  out.y = y * Math.cos(tilt) * s;
  return out;
}

/**
 * The inverse of tiltToScreen for one screen row: which map row it shows and how much that row
 * is scaled across (the map is drawn row by row with these).
 * @param {number} screenY Screen pixels below the player's screen point.
 * @param {number} tilt
 * @param {number} depth
 * @param {{y: number, scale: number}} out
 * @returns {{y: number, scale: number}} `out`.
 */
export function tiltRowToMap(screenY, tilt, depth, out) {
  const y = (screenY * depth) / (depth * Math.cos(tilt) + screenY * Math.sin(tilt));
  out.y = y;
  out.scale = depth / (depth - y * Math.sin(tilt));
  return out;
}

/**
 * Pins a screen point to a rectangle around the origin along the ray from the origin: blips out
 * of range ride the map's edge in the direction they lie.
 * @param {number} x
 * @param {number} y
 * @param {number} left Negative.
 * @param {number} top Negative.
 * @param {number} right Positive.
 * @param {number} bottom Positive.
 * @param {{x: number, y: number, pinned: boolean}} out
 * @returns {{x: number, y: number, pinned: boolean}} `out`.
 */
export function clampToRectangle(x, y, left, top, right, bottom, out) {
  let k = 1;
  if (x > right) k = Math.min(k, right / x);
  if (x < left) k = Math.min(k, left / x);
  if (y > bottom) k = Math.min(k, bottom / y);
  if (y < top) k = Math.min(k, top / y);
  out.x = x * k;
  out.y = y * k;
  out.pinned = k < 1;
  return out;
}

/**
 * The heading of a world direction on the turned map, for drawing an arrow: the canvas angle
 * of a blip that faces along (directionX, directionZ), 0 pointing up the map.
 * @param {number} directionX
 * @param {number} directionZ
 * @param {number} rotation From minimapRotationFromForward.
 * @returns {number} Radians, clockwise on screen.
 */
export function minimapArrowAngle(directionX, directionZ, rotation) {
  return Math.atan2(directionZ, directionX) + Math.PI / 2 + rotation;
}

/**
 * The tiles of a square grid of `span` metres within `reach` metres (along x and z) of
 * (centerX, centerZ). Tile (i, j) covers x in [i*span, (i+1)*span) and z likewise. A square map of
 * half-side h that turns needs a reach of h * sqrt(2) to cover its corners.
 * @param {number} centerX
 * @param {number} centerZ
 * @param {number} reach Metres.
 * @param {number} span Metres per tile.
 * @param {{minI: number, maxI: number, minJ: number, maxJ: number}} out
 * @returns {{minI: number, maxI: number, minJ: number, maxJ: number}} `out`.
 */
export function tileRangeAround(centerX, centerZ, reach, span, out) {
  out.minI = Math.floor((centerX - reach) / span);
  out.maxI = Math.floor((centerX + reach) / span);
  out.minJ = Math.floor((centerZ - reach) / span);
  out.maxJ = Math.floor((centerZ + reach) / span);
  return out;
}

/**
 * The compass angle of the player's direction of view as the 16-point name.
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
