// The road ahead of one traffic car: a short chain of pieces taken from the city's lane graph,
// alternating a lane (lane.points, between two junction areas) and the connector curve through
// the next junction (lane.successors[i].points), extended as the car drives on and chosen with
// a driver's habits (mostly straight on, sometimes a turn, a U-turn only when nothing else is
// left). It answers where a distance along the route lies, how far it is to the next stop line,
// and where the car is on its piece. Pure data and arithmetic: no three.js, tested in Node.
//
//   const route = createLaneRoute(laneGraph, random);
//   startLaneRoute(route, laneId, along);
//   advanceLaneRoute(route, metres);          // or route.s = projectOnPiece(...).s, then normaliseLaneRoute
//   routePointAhead(route, 12, point);       // {x, z, dx, dz} twelve metres on

/** Most pieces a route holds; enough for about 100 m of town streets ahead. */
export const ROUTE_PIECES = 8;
/** How far ahead a route is kept extended, metres. */
export const ROUTE_REACH = 90;
/** Relative weights of the turns a driver takes at a junction. */
export const TURN_WEIGHTS = Object.freeze({ straight: 6, right: 2.2, left: 1.8, uturn: 0.05 });

const cumulativeCache = new WeakMap();

/**
 * Cumulative lengths of a flat [x, z, ...] polyline, cached per points array.
 * @param {number[]} points Flat x, z pairs.
 * @returns {Float64Array}
 */
export function cumulativeLengthsOf(points) {
  let lengths = cumulativeCache.get(points);
  if (lengths) return lengths;
  const count = points.length >> 1;
  lengths = new Float64Array(Math.max(1, count));
  for (let i = 1; i < count; i += 1) {
    lengths[i] = lengths[i - 1] + Math.hypot(points[2 * i] - points[2 * i - 2], points[2 * i + 1] - points[2 * i - 1]);
  }
  cumulativeCache.set(points, lengths);
  return lengths;
}

/**
 * The point at a distance along a polyline, with the unit direction of travel there.
 * @param {number[]} points Flat x, z pairs.
 * @param {number} s Metres from the start (clamped to the line).
 * @param {{x: number, z: number, dx: number, dz: number}} out Receives the point.
 * @returns {{x: number, z: number, dx: number, dz: number}} `out`.
 */
export function pointAlongPolyline(points, s, out) {
  const lengths = cumulativeLengthsOf(points);
  const last = lengths.length - 1;
  if (last < 1) {
    out.x = points[0];
    out.z = points[1];
    out.dx = 0;
    out.dz = -1;
    return out;
  }
  let low = 0;
  let high = last - 1;
  if (s >= lengths[last]) low = high;
  else if (s > 0) {
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (lengths[middle] <= s) low = middle;
      else high = middle - 1;
    }
  }
  const ax = points[2 * low];
  const az = points[2 * low + 1];
  const ex = points[2 * low + 2] - ax;
  const ez = points[2 * low + 3] - az;
  const span = lengths[low + 1] - lengths[low] || 1;
  const t = Math.min(Math.max((s - lengths[low]) / span, 0), 1);
  out.x = ax + ex * t;
  out.z = az + ez * t;
  out.dx = ex / span;
  out.dz = ez / span;
  return out;
}

/**
 * Projects a point on a polyline near a hint: the distance along it and the signed offset
 * (positive to the right of the direction of travel).
 * @param {number[]} points Flat x, z pairs.
 * @param {number} x
 * @param {number} z
 * @param {{s: number, lateral: number, distance: number}} out Receives the projection.
 * @returns {{s: number, lateral: number, distance: number}} `out`.
 */
export function projectOnPolyline(points, x, z, out) {
  const lengths = cumulativeLengthsOf(points);
  let best = Infinity;
  out.s = 0;
  out.lateral = 0;
  out.distance = Infinity;
  for (let i = 0; i + 1 < lengths.length; i += 1) {
    const ax = points[2 * i];
    const az = points[2 * i + 1];
    const ex = points[2 * i + 2] - ax;
    const ez = points[2 * i + 3] - az;
    const span2 = ex * ex + ez * ez || 1;
    let t = ((x - ax) * ex + (z - az) * ez) / span2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + ex * t - x;
    const pz = az + ez * t - z;
    const d2 = px * px + pz * pz;
    if (d2 < best) {
      best = d2;
      const span = Math.sqrt(span2);
      out.s = lengths[i] + t * span;
      out.lateral = ((x - ax) * -ez + (z - az) * ex) / span;
      out.distance = Math.sqrt(d2);
    }
  }
  return out;
}

/**
 * A new, empty route over a lane graph.
 * @param {object[]} lanes The plan's lanes (openWorldCity.laneGraph).
 * @param {() => number} random A 0..1 generator for the driver's choices.
 */
export function createLaneRoute(lanes, random) {
  const pieces = [];
  for (let i = 0; i < ROUTE_PIECES; i += 1) pieces.push({ points: null, length: 0, lane: -1, fromLane: -1, turn: 'straight' });
  return { lanes, random, pieces, count: 0, s: 0 };
}

function setLanePiece(route, piece, laneId) {
  const lane = route.lanes[laneId];
  piece.points = lane.points;
  piece.length = cumulativeLengthsOf(lane.points).at(-1);
  piece.lane = laneId;
  piece.fromLane = -1;
  piece.turn = 'straight';
}

/**
 * Picks the way on from a lane with the driver's habits.
 * @param {object} lane A lane of the graph.
 * @param {number} roll 0..1.
 * @returns {object | null} One of lane.successors.
 */
export function chooseSuccessor(lane, roll) {
  const successors = lane.successors;
  if (!successors || successors.length === 0) return null;
  let total = 0;
  for (const successor of successors) total += TURN_WEIGHTS[successor.turn] ?? 1;
  let pick = roll * total;
  for (const successor of successors) {
    pick -= TURN_WEIGHTS[successor.turn] ?? 1;
    if (pick < 0) return successor;
  }
  return successors[successors.length - 1];
}

function extend(route) {
  let ahead = -route.s;
  for (let i = 0; i < route.count; i += 1) ahead += route.pieces[i].length;
  while (route.count < ROUTE_PIECES && ahead < ROUTE_REACH) {
    const last = route.pieces[route.count - 1];
    const piece = route.pieces[route.count];
    if (last.lane >= 0) {
      const successor = chooseSuccessor(route.lanes[last.lane], route.random());
      if (!successor) return;
      piece.points = successor.points;
      piece.length = Math.max(0.01, cumulativeLengthsOf(successor.points).at(-1));
      piece.lane = -1;
      piece.fromLane = last.lane;
      piece.turn = successor.turn;
      piece.toLane = successor.lane;
    } else {
      setLanePiece(route, piece, last.toLane);
    }
    route.count += 1;
    ahead += piece.length;
  }
}

/**
 * Starts a route on a lane.
 * @param {ReturnType<typeof createLaneRoute>} route
 * @param {number} laneId
 * @param {number} along Metres from the lane's start.
 */
export function startLaneRoute(route, laneId, along) {
  setLanePiece(route, route.pieces[0], laneId);
  route.count = 1;
  route.s = Math.min(Math.max(along, 0), route.pieces[0].length);
  extend(route);
  return route;
}

/**
 * Drops the pieces the car has left behind (route.s past the first piece) and extends ahead.
 * @param {ReturnType<typeof createLaneRoute>} route
 * @returns {boolean} True when the first piece changed.
 */
export function normaliseLaneRoute(route) {
  let changed = false;
  while (route.count > 1 && route.s >= route.pieces[0].length) {
    route.s -= route.pieces[0].length;
    const done = route.pieces.shift();
    route.pieces.push(done);
    route.count -= 1;
    changed = true;
  }
  if (route.s < 0) route.s = 0;
  extend(route);
  return changed;
}

/**
 * Moves along the route.
 * @param {ReturnType<typeof createLaneRoute>} route
 * @param {number} metres
 */
export function advanceLaneRoute(route, metres) {
  route.s += metres;
  return normaliseLaneRoute(route);
}

/**
 * The point a distance ahead of the car's place on its route.
 * @param {ReturnType<typeof createLaneRoute>} route
 * @param {number} ahead Metres past route.s.
 * @param {{x: number, z: number, dx: number, dz: number}} out
 * @returns {{x: number, z: number, dx: number, dz: number}} `out`.
 */
export function routePointAhead(route, ahead, out) {
  let s = route.s + ahead;
  for (let i = 0; i < route.count; i += 1) {
    const piece = route.pieces[i];
    if (s <= piece.length || i === route.count - 1) return pointAlongPolyline(piece.points, s, out);
    s -= piece.length;
  }
  return out;
}

/**
 * Metres from the car to the end of the lane piece at `index` (counted from the car).
 * @param {ReturnType<typeof createLaneRoute>} route
 * @param {number} index Piece index.
 */
export function distanceToPieceEnd(route, index) {
  let distance = -route.s;
  for (let i = 0; i <= index && i < route.count; i += 1) distance += route.pieces[i].length;
  return distance;
}

/**
 * The lane the car is on, or the lane it is turning onto when it is in a junction.
 * @param {ReturnType<typeof createLaneRoute>} route
 */
export function currentLaneOf(route) {
  const first = route.pieces[0];
  return first.lane >= 0 ? first.lane : first.toLane;
}
