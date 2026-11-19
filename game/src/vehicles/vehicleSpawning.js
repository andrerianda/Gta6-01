// What a new vehicle is, before any model or physics exists: its catalog entry, paint colour,
// health, seats, where its wheels sit and its starting tags. Pure data from the vehicle catalog
// and the model's registry extras (wheel_radius, track, wheelbase); tested in Node.

/** Seat names in order: the driver first, then passengers (anchor_seat_<name> on the model). */
export const SEAT_NAMES = Object.freeze(['driver', 'passenger_1', 'passenger_2', 'passenger_3', 'passenger_4', 'passenger_5']);

/**
 * The spawn description of one vehicle.
 * @typedef {object} VehicleSpawnPlan
 * @property {string} modelId The catalog id.
 * @property {string} colour The paint, '#rrggbb'.
 * @property {number} maxHealth Health when new (the catalog's durability).
 * @property {{name: string, occupantId: unknown}[]} seats Every seat, empty.
 * @property {boolean} parked True when nobody drives it.
 * @property {{x: number, y: number | null, z: number}} position Where its origin stands.
 * @property {number} heading Compass heading (0 = -Z, clockwise from above).
 */

/**
 * Plans a spawn.
 * @param {object} entry The vehicleCatalog entry.
 * @param {{position: {x: number, y?: number, z: number}, heading?: number, colour?: string,
 *   parked?: boolean}} request What the caller asked for.
 * @param {{next: () => number} | (() => number) | null} [random] A seeded generator (0..1) for the colour.
 * @returns {VehicleSpawnPlan}
 */
export function planVehicleSpawn(entry, request, random = null) {
  const colours = entry.colors?.length ? entry.colors : ['#C8CCD0'];
  let colour = request.colour;
  if (!colour) {
    const roll = typeof random === 'function' ? random() : random && typeof random.next === 'function' ? random.next() : 0;
    colour = colours[Math.min(colours.length - 1, Math.floor(roll * colours.length))];
  }
  const seatCount = Math.max(1, Math.min(SEAT_NAMES.length, entry.seats ?? 2));
  return {
    modelId: entry.id,
    colour,
    maxHealth: entry.durability ?? 1000,
    seats: SEAT_NAMES.slice(0, seatCount).map((name) => ({ name, occupantId: null })),
    parked: request.parked ?? true,
    position: { x: request.position.x, y: request.position.y ?? null, z: request.position.z },
    heading: request.heading ?? 0,
    /** An aircraft spawned in the air: its speed, m/s (default its cruise speed). */
    airspeed: request.airspeed ?? null,
  };
}

/**
 * Whether a catalog entry rides on two wheels in line (the physics' Motorcycle).
 * @param {object} entry The vehicleCatalog entry.
 * @returns {boolean}
 */
export function isTwoWheeler(entry) {
  return entry.class === 'motorcycle' || (entry.flags ?? []).includes('two_wheeled');
}

/**
 * The wheel hubs in model space, from the model's registry extras when it has them, else from
 * the catalog dimensions: four for a car (front left, front right, rear left, rear right), two
 * in line for a two-wheeler (front, rear).
 * @param {object} entry The vehicleCatalog entry.
 * @param {{wheel_radius?: number, track?: number, wheelbase?: number} | null} extras The model's scene extras.
 * @returns {{x: number, y: number, z: number, radius: number}[]}
 */
export function wheelPlacementsOf(entry, extras = null) {
  const size = entry.dimensions;
  const radius = extras?.wheel_radius ?? size.wheelRadius ?? 0.32;
  const halfTrack = (extras?.track ?? size.width - 0.26) * 0.5;
  const halfBase = (extras?.wheelbase ?? size.wheelbase ?? size.length * 0.6) * 0.5;
  if (isTwoWheeler(entry)) {
    // The bike models give each wheel its own radius (wheel_radius_f / _r) and the wheelbase.
    const front = extras?.wheel_radius_f ?? radius;
    const rear = extras?.wheel_radius_r ?? radius;
    return [{ x: 0, y: front, z: -halfBase, radius: front }, { x: 0, y: rear, z: halfBase, radius: rear }];
  }
  return [
    { x: -halfTrack, y: radius, z: -halfBase, radius },
    { x: halfTrack, y: radius, z: -halfBase, radius },
    { x: -halfTrack, y: radius, z: halfBase, radius },
    { x: halfTrack, y: radius, z: halfBase, radius },
  ];
}

/** Registered models that stand in for a catalog model not built yet (craft: chopper -> sport bike). */
const MODEL_STAND_INS = Object.freeze({ chopper_motorcycle: 'sport_motorcycle' });

/**
 * The asset id that dresses a catalog model: its own when registered, else a registered stand-in.
 * @param {object} entry The vehicleCatalog entry.
 * @param {{has: (id: string) => boolean} | null} assets The asset library.
 * @returns {string | null} The asset id, or null for none (the code-built stand-in body).
 */
export function vehicleModelIdOf(entry, assets) {
  if (!assets || typeof assets.has !== 'function') return null;
  if (assets.has(entry.id)) return entry.id;
  const standIn = MODEL_STAND_INS[entry.id];
  return standIn && assets.has(standIn) ? standIn : null;
}

/**
 * Whether a catalog entry is a four-wheeled road vehicle the physics can drive today.
 * @param {object} entry The vehicleCatalog entry.
 * @returns {boolean}
 */
export function drivesOnFourWheels(entry) {
  const kind = entry.class ?? '';
  return !['motorcycle', 'boat', 'helicopter', 'aircraft', 'bicycle'].includes(kind) && Boolean(entry.dimensions && entry.handling);
}

/**
 * The radius the entity registry and the enter prompt use for a vehicle.
 * @param {object} entry The vehicleCatalog entry.
 * @returns {number} Metres.
 */
export function vehicleRadiusOf(entry) {
  const size = entry.dimensions;
  return 0.5 * Math.hypot(size.length, size.width);
}
