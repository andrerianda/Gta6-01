// Pavement obstacles for walkers: the small things standing on the pavement (tree trunks in their
// pits, lamp posts, sign and signal poles, benches, bus shelters, bins and other clutter) as
// circles on the ground plane, and the steering that walks a person round them. The circles come
// from the city when it publishes them (obstaclesNear(x, z, radius, out) on openWorldCity or its
// dressing: records {x, z, radius}), otherwise from the collision world's static colliders: every
// pole, trunk and box between ankle and head height that is small enough to walk round (walls and
// buildings are left to the routes). Pure steering functions are exported for the tests.
//
//   const obstacles = createPavementObstacles(context, city);
//   obstacles.gather(person.x, person.z, groundY, person.obstacles);   // a few times a second
//   steerAroundObstacles(x, z, input, person.obstacles, person.side);  // every step, before moving
//   keepOutOfObstacles(person, person.obstacles);                      // every step, after moving

/** A walker's body radius (metres) plus the gap they keep from a trunk or pole. */
export const BODY_CLEARANCE = 0.42;
/** Extra room round a trunk (its pit: people step round the grate, not over the soil). */
export const TRUNK_MARGIN = 0.3;
/** Most circles one person keeps (x, z, radius each). */
export const MAX_CIRCLES = 10;
/** How far round a person obstacles are gathered, metres. */
export const GATHER_RADIUS = 4.5;

/** A circle list a person keeps: {count, data: Float32Array of x, z, radius}. */
export function createCircleList() {
  return { count: 0, data: new Float32Array(MAX_CIRCLES * 3) };
}

/** Appends one circle (ignored once the list is full). */
export function pushCircle(list, x, z, radius) {
  if (list.count >= MAX_CIRCLES) return;
  const k = list.count * 3;
  list.data[k] = x;
  list.data[k + 1] = z;
  list.data[k + 2] = radius;
  list.count += 1;
}

/** Turns (radians) tried from the wanted direction, the preferred side first. */
const TURNS = [0.3, 0.6, 0.95, 1.3, 1.75, 2.3];

/** How far a walker can go along a unit ray before their body meets a circle (up to `look`). */
function freeDistance(px, pz, rx, rz, circles, look, body) {
  let best = look;
  const data = circles.data;
  for (let i = 0; i < circles.count; i += 1) {
    const cx = data[i * 3] - px, cz = data[i * 3 + 1] - pz, r = data[i * 3 + 2] + body;
    const m = cx * rx + cz * rz;
    if (m <= 0) continue; // behind, or inside and walking out
    const d2 = cx * cx + cz * cz - m * m;
    if (d2 >= r * r) continue;
    const t = Math.max(0, m - Math.sqrt(r * r - d2));
    if (t < best) best = t;
  }
  return best;
}

/**
 * Bends a wanted move round the circles ahead: of the wanted direction and turns of up to about
 * 130 degrees either way (the preferred side first), takes the one that leaves the most free
 * room over the next couple of metres with the least turn, so a walker slips through a gap or
 * goes round a cluster instead of stopping. The speed is kept. Allocates nothing.
 * @param {number} px Position.
 * @param {number} pz
 * @param {{moveX: number, moveZ: number}} move The wanted move (metres per second), changed in place.
 * @param {{count: number, data: Float32Array}} circles
 * @param {number} [side] +1 or -1: the side tried first when a circle stands dead ahead.
 */
export function steerAroundObstacles(px, pz, move, circles, side = 1) {
  const speed = Math.hypot(move.moveX, move.moveZ);
  if (speed < 0.05 || circles.count === 0) return;
  const dx = move.moveX / speed, dz = move.moveZ / speed;
  const look = 1.4 + speed * 0.9;
  const body = BODY_CLEARANCE - 0.06;
  let free = freeDistance(px, pz, dx, dz, circles, look, body);
  if (free >= look) return;
  let bestScore = free / look, bestX = dx, bestZ = dz;
  for (let k = 0; k < TURNS.length * 2; k += 1) {
    const a = TURNS[k >> 1] * (k & 1 ? -side : side);
    const c = Math.cos(a), s = Math.sin(a);
    const rx = dx * c - dz * s, rz = dx * s + dz * c;
    free = freeDistance(px, pz, rx, rz, circles, look, body);
    const score = free / look - Math.abs(a) * 0.12;
    if (score > bestScore + 1e-6) { bestScore = score; bestX = rx; bestZ = rz; }
  }
  move.moveX = bestX * speed;
  move.moveZ = bestZ * speed;
}

/**
 * Moves a point out of every circle it has entered (its edge plus the body radius): the last
 * guard that keeps a walker out of a trunk whatever the steering did. Allocates nothing.
 * @param {{x: number, z: number}} p Changed in place.
 * @param {{count: number, data: Float32Array}} circles
 * @param {number} [body] The body radius kept from a circle's edge.
 * @returns {boolean} True when the point was moved.
 */
export function keepOutOfObstacles(p, circles, body = 0.3) {
  let moved = false;
  const data = circles.data;
  for (let i = 0; i < circles.count; i += 1) {
    const cx = data[i * 3], cz = data[i * 3 + 1], need = data[i * 3 + 2] + body;
    const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d >= need) continue;
    const ux = d > 1e-4 ? dx / d : 1, uz = d > 1e-4 ? dz / d : 0;
    p.x = cx + ux * need;
    p.z = cz + uz * need;
    moved = true;
  }
  return moved;
}

/** Collider shapes (physics/collision/StaticColliderSet.js COLLIDER_TYPE). */
const BOX = 1, CYLINDER = 2;
/** Layers the walkers keep out of: STATIC | SEE_THROUGH (physics/collisionLayers.js). */
const OBSTACLE_LAYERS = 2 | 4;
/** Larger than this (half size, metres) is a wall or a building: the routes keep clear of it. */
const LARGEST_HALF = 3.2;

/**
 * Turns the static colliders round a point into circles: cylinders as they are, boxes as a row of
 * circles along their long side, anything else by its footprint. Only things between ankle and
 * head height that are small enough to walk round. Allocates nothing.
 * @param {object} statics The collision world's StaticColliderSet (world.statics).
 * @param {{count: number, items: Int32Array, push: Function}} found A scratch index list.
 * @param {number} x Centre of the search.
 * @param {number} z
 * @param {number} groundY Ground height there.
 * @param {number} radius Search radius.
 * @param {{count: number, data: Float32Array}} out Receives the circles (cleared first).
 */
export function circlesFromStatics(statics, found, x, z, groundY, radius, out) {
  out.count = 0;
  found.count = 0;
  statics.query(x - radius, groundY + 0.25, z - radius, x + radius, groundY + 1.8, z + radius, OBSTACLE_LAYERS, found);
  const { type, position, half, rotation, bounds } = statics;
  for (let k = 0; k < found.count && out.count < MAX_CIRCLES; k += 1) {
    const i = found.items[k];
    const t = type[i];
    if (bounds[i * 6 + 4] < groundY + 0.3) continue; // kerbs, steps, a pit's rim
    const px = position[i * 3], pz = position[i * 3 + 2];
    if (t === CYLINDER) {
      const r = half[i * 3];
      if (r > 2.5) continue;
      // A trunk (round, thin) gets the room of its pit; a lamp or sign pole the plain gap.
      pushCircle(out, px, pz, r + (r > 0.18 && r < 0.6 ? TRUNK_MARGIN : 0.08));
    } else if (t === BOX) {
      const hx = half[i * 3], hz = half[i * 3 + 2];
      if (Math.max(hx, hz) > LARGEST_HALF) continue;
      // The box's long axis in the world (rotation rows: column 0 is local X, column 2 local Z).
      const alongX = hx >= hz;
      const ax = alongX ? rotation[i * 9] : rotation[i * 9 + 2], az = alongX ? rotation[i * 9 + 6] : rotation[i * 9 + 8];
      const long = alongX ? hx : hz, short = alongX ? hz : hx;
      const n = Math.min(5, Math.max(1, Math.ceil(long / Math.max(0.25, short * 1.4))));
      const step = n > 1 ? (2 * (long - short)) / (n - 1) : 0;
      const r = n > 1 ? short * 1.15 : Math.hypot(hx, hz);
      for (let j = 0; j < n; j += 1) {
        const o = n > 1 ? -(long - short) + j * step : 0;
        pushCircle(out, px + ax * o, pz + az * o, r);
      }
    } else {
      const b = i * 6;
      const hx = (bounds[b + 3] - bounds[b]) / 2, hz = (bounds[b + 5] - bounds[b + 2]) / 2;
      if (Math.max(hx, hz) > LARGEST_HALF) continue;
      pushCircle(out, bounds[b] + hx, bounds[b + 2] + hz, Math.max(hx, hz));
    }
  }
}

/**
 * The obstacle source of the crowd.
 * @param {object} context The game context (systems: physics).
 * @param {object} city The openWorldCity system.
 * @returns {{gather: (x: number, z: number, groundY: number, out: object) => number}}
 */
export function createPavementObstacles(context, city) {
  const found = { items: new Int32Array(64), count: 0, push(value) {
    if (this.count === this.items.length) { const grown = new Int32Array(this.items.length * 2); grown.set(this.items); this.items = grown; }
    this.items[this.count] = value;
    this.count += 1;
  } };
  const published = [];
  let physics = null;
  return {
    /** Fills `out` with the circles within GATHER_RADIUS of x, z; returns how many. */
    gather(x, z, groundY, out) {
      out.count = 0;
      const source = typeof city.obstaclesNear === 'function' ? city
        : city.dressing && typeof city.dressing.obstaclesNear === 'function' ? city.dressing : null;
      if (source) {
        source.obstaclesNear(x, z, GATHER_RADIUS, published);
        for (const c of published) pushCircle(out, c.x, c.z, c.radius);
        return out.count;
      }
      if (!physics) physics = context.systems.find('physics');
      const statics = physics && physics.world && physics.world.statics;
      if (statics && typeof statics.query === 'function') circlesFromStatics(statics, found, x, z, groundY, GATHER_RADIUS, out);
      return out.count;
    },
  };
}
