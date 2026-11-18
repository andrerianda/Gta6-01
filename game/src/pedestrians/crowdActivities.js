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
 * A published bench seat made uniform. Accepts {x, y, z} with yaw (three.js, the way the sitter
 * faces), or facingX/facingZ, or heading (physics compass, the negative of yaw); seatHeight or
 * the seat's top y over the ground.
 * @param {object} seat
 * @param {number} groundY Ground height under the seat.
 * @returns {{key: string, x: number, z: number, yaw: number, seatHeight: number}}
 */
export function seatPlace(seat, groundY) {
  const yaw = Number.isFinite(seat.yaw) ? seat.yaw
    : Number.isFinite(seat.facingX) ? Math.atan2(-seat.facingX, -seat.facingZ)
      : Number.isFinite(seat.heading) ? -seat.heading : 0;
  const height = Number.isFinite(seat.seatHeight) ? seat.seatHeight
    : Number.isFinite(seat.y) ? seat.y - groundY : 0.45;
  return {
    key: seat.id != null ? String(seat.id) : `${seat.x.toFixed(2)}:${seat.z.toFixed(2)}`,
    x: seat.x, z: seat.z, yaw, seatHeight: Math.max(0.3, Math.min(0.7, height)),
  };
}

/**
 * The bench seats near a point, from the city (benchSeatsNear) or its dressing, with who sits
 * where. Without a published source there are no seats (nobody sits).
 * @param {{groundHeightAt: (x: number, z: number) => number, benchSeatsNear?: Function, dressing?: object}} city
 */
export function createBenchSeats(city) {
  const taken = new Map();
  const source = () => (typeof city.benchSeatsNear === 'function' ? city
    : city.dressing && typeof city.dressing.benchSeatsNear === 'function' ? city.dressing : null);
  return {
    get available() { return source() !== null; },
    /** The nearest free seat within radius of x, z (uniform: seatPlace), or null. */
    freeNear(x, z, radius) {
      const from = source();
      if (!from) return null;
      let best = null, bestD = radius;
      for (const seat of from.benchSeatsNear(x, z, radius) || []) {
        const d = Math.hypot(seat.x - x, seat.z - z);
        if (d >= bestD) continue;
        const place = seatPlace(seat, city.groundHeightAt(seat.x, seat.z));
        if (taken.has(place.key)) continue;
        best = place;
        bestD = d;
      }
      return best;
    },
    take(seat, personId) { taken.set(seat.key, personId); },
    free(seat) { if (seat) taken.delete(seat.key); },
    /** How many seats are taken. */
    get taken() { return taken.size; },
  };
}
