// Everyday life on the pavement: where companions walk beside their leader (couples, friends,
// small groups), which upper-body gesture of the character run-time suits what a person is doing
// (talking, a phone call, pointing at trouble, the panic run), and the bench seats the city
// dressing publishes (who sits where). Pure rules (Node-tested) used by crowdSimulation.js;
// the crowd's guns are in crowdShooting.js.

/** Places of companions beside their leader: metres to the leader's right (+) and ahead (+). */
export const COMPANION_SLOTS = Object.freeze([
  Object.freeze({ right: 0.74, ahead: -0.12 }),
  Object.freeze({ right: -0.74, ahead: -0.22 }),
]);

/**
 * Where a companion walks: beside its leader, in the leader's frame.
 * @param {number} x Leader's world x.
 * @param {number} z Leader's world z.
 * @param {number} yaw Leader's three.js yaw (0 faces -Z).
 * @param {number} slot Index into COMPANION_SLOTS.
 * @param {{x: number, z: number}} out
 */
export function companionSpot(x, z, yaw, slot, out) {
  const place = COMPANION_SLOTS[slot % COMPANION_SLOTS.length];
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  out.x = x - fz * place.right + fx * place.ahead;
  out.z = z + fx * place.right + fz * place.ahead;
  return out;
}

/**
 * The upper-body gesture that suits a mode (the run-time's setGesture names, or 'point').
 * @param {string} mode The person's mode.
 * @param {() => number} random
 * @param {boolean} [company] Walking with others (they talk as they go).
 * @returns {'talk'|'phone'|'panic'|'point'|null}
 */
export function gestureFor(mode, random, company = false) {
  const r = random();
  switch (mode) {
    case 'call': return 'phone';
    case 'chat': return r < 0.55 ? 'talk' : null;
    case 'walk': return company ? (r < 0.45 ? 'talk' : null) : r < 0.08 ? 'phone' : null;
    case 'sit': return r < 0.3 ? 'phone' : null;
    case 'gawk': return r < 0.45 ? 'point' : r < 0.75 ? 'phone' : null;
    case 'flee': return r < 0.3 ? 'panic' : null;
    default: return null;
  }
}

/**
 * The street seats a passer-by may sit on (set object -> the seat surface's height over the
 * object's base, from the anchor_seat_* nodes of the .glb files). Every published seat of another
 * object is refused: forklift and tractor cabs (1.2-1.75 m up), pedal boats on the water. A
 * cafe_set's chairs face the table (their anchors turn), so they are used only when the record
 * carries its own yaw. A seat's measured height must match the object's within SEAT_HEIGHT_SLACK
 * (a bench raised or sunk by its base, or a record off the drawn object, is refused, never clamped).
 */
export const SITTABLE_SEATS = Object.freeze({
  bench_slat: 0.45, bench_concrete: 0.46, bus_shelter: 0.48, promenade_bench: 0.47,
  bench_backless: 0.46, sofa_broken: 0.5, cafe_chair: 0.45, cafe_set: 0.45,
});
/** Seats that need the record's own yaw (the object's -Z is not the sitter's facing). */
const NEEDS_OWN_YAW = new Set(['cafe_set']);
export const SEAT_HEIGHT_SLACK = 0.06;
/** Metres round a knocked prop's break point whose seats go with it (a bench is ~1.7 m long). */
export const KNOCK_RADIUS = 1.8;
/** Heights a record without a known object may have (a bench or a low wall's top). */
const SEAT_HEIGHT_RANGE = [0.38, 0.56];

/**
 * A published bench seat made uniform, or null when nobody may sit there (SITTABLE_SEATS).
 * Accepts {x, y, z, object?} with yaw (three.js, the way the sitter faces), or facingX/facingZ,
 * or heading (physics compass, the negative of yaw); seatHeight or the seat's top y over the ground.
 * @param {object} seat
 * @param {number} groundY Ground height under the seat (where the sitter's feet are).
 * @returns {{key: string, x: number, z: number, yaw: number, seatHeight: number}|null}
 */
export function seatPlace(seat, groundY) {
  const object = typeof seat.object === 'string' ? seat.object : null;
  const expected = object ? SITTABLE_SEATS[object] : undefined;
  if (object && expected === undefined) return null;
  if (object && NEEDS_OWN_YAW.has(object) && !Number.isFinite(seat.yaw)) return null;
  const yaw = Number.isFinite(seat.yaw) ? seat.yaw
    : Number.isFinite(seat.facingX) ? Math.atan2(-seat.facingX, -seat.facingZ)
      : Number.isFinite(seat.heading) ? -seat.heading : 0;
  const height = Number.isFinite(seat.seatHeight) ? seat.seatHeight
    : Number.isFinite(seat.y) && Number.isFinite(groundY) ? seat.y - groundY : expected;
  if (!Number.isFinite(height)) return null;
  if (expected !== undefined ? Math.abs(height - expected) > SEAT_HEIGHT_SLACK
    : height < SEAT_HEIGHT_RANGE[0] || height > SEAT_HEIGHT_RANGE[1]) return null;
  return {
    key: seat.id != null ? String(seat.id) : `${seat.x.toFixed(2)}:${seat.z.toFixed(2)}`,
    x: seat.x, z: seat.z, yaw, seatHeight: height, object,
  };
}

/**
 * The function that lists seats near a point: the city's or its dressing's seatsNear(x, z,
 * radius, out) (the dressing's records: {x, y, z, rotationY, heading}), or benchSeatsNear.
 * @param {object} city
 * @returns {Function|null} Bound to its owner, or null when nothing publishes seats.
 */
export function seatSourceOf(city) {
  for (const owner of [city, city && city.dressing]) {
    if (!owner) continue;
    for (const name of ['seatsNear', 'benchSeatsNear']) {
      if (typeof owner[name] === 'function') return owner[name].bind(owner);
    }
  }
  return null;
}

/**
 * The bench seats near a point, from the city or its dressing (seatSourceOf), with who sits
 * where. Without a published source there are no seats (nobody sits).
 * @param {{groundHeightAt: (x: number, z: number) => number, seatsNear?: Function, dressing?: object}} city
 */
export function createBenchSeats(city) {
  const taken = new Map();
  /** Keys of seats whose bench was knocked away (knockAt). */
  const knocked = new Set();
  const found = [];
  let lookup = null;
  // The city publishes its dressing once streaming starts: look again until there is a source.
  const source = () => lookup || (lookup = seatSourceOf(city));
  return {
    get available() { return source() !== null; },
    /** The nearest free seat within radius of x, z (uniform: seatPlace), or null. */
    freeNear(x, z, radius) {
      const from = source();
      if (!from) return null;
      let best = null, bestD = radius;
      for (const seat of from(x, z, radius, found) || []) {
        const d = Math.hypot(seat.x - x, seat.z - z);
        if (d >= bestD || seat.knocked === true) continue;
        const place = seatPlace(seat, city.groundHeightAt(seat.x, seat.z));
        if (!place || taken.has(place.key) || knocked.has(place.key)) continue;
        best = place;
        bestD = d;
      }
      return best;
    },
    /**
     * Whether a seat handed out earlier is still published where it was (its sector is still
     * built and the dressing still lists it): false once the bench is gone, and its sitter stands.
     */
    stillThere(seat) {
      const from = source();
      if (!from || !seat || knocked.has(seat.key)) return false;
      for (const each of from(seat.x, seat.z, 0.05, found) || []) {
        if (each.knocked === true) continue;
        const place = seatPlace(each, city.groundHeightAt(each.x, each.z));
        if (place && place.key === seat.key) return true;
      }
      return false;
    },
    /**
     * A bench (or anything with seats) was knocked off its base near x, z (PROP_BROKEN): its
     * seats within `radius` are gone for good, so their sitters stand up and walk on
     * (stillThere is false) and nobody sits there again, even while the dressing still lists them.
     * @returns {number} How many seats were marked.
     */
    knockAt(x, z, radius = KNOCK_RADIUS) {
      const from = source();
      if (!from) return 0;
      let count = 0;
      for (const seat of from(x, z, radius, found) || []) {
        const place = seatPlace(seat, city.groundHeightAt(seat.x, seat.z));
        if (place && !knocked.has(place.key)) { knocked.add(place.key); count += 1; }
      }
      return count;
    },
    take(seat, personId) { taken.set(seat.key, personId); },
    free(seat) { if (seat) taken.delete(seat.key); },
    /** How many seats are taken. */
    get taken() { return taken.size; },
  };
}
