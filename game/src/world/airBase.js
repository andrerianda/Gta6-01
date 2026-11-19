// Base Aérea Punta Garza drawn in the world: runway 27 / 09 on its causeway, taxiways, the floodlit
// apron, four hardened shelters, the control tower with its red beacon, the fence with its gate and
// guard post, the access road from the Autopista, runway lights, a Manta Sombra and a Garza Negra
// parked on their stands and the patrol jeep on its loop (catalog/puntaGarzaAirBase.js is the plan
// of the base; the city plan flattens its ground). Built only while the focus is within reach.
//
// Public members: `runway` ({x0, z0, x1, z1, y, width, length, heading}; end 0 is the east
// threshold, heading 276 compass degrees), `gate` ({x, z, open}), `setGateOpen(bool)`, `layout`
// (every placement, world/airbase/airBaseLayout.js), `vehicles` (parked aircraft, jeep, road block)
// and `stats()`. World flags: base.alarm makes the beacons flash and puts two army trucks across
// the runway; base.officerAccess opens the gate. `?stage=base` starts the lead here
// (player/aircraftLaunch.js).

/**
 * Creates the air base system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem & Record<string, any>}
 */
export function createAirBaseSystem(context) {
  let runtime = null;
  const gate = { x: 0, z: 0, get open() { return runtime ? runtime.gateOpen : false; } };
  const system = {
    name: 'airBase',
    dependsOn: ['openWorldCity'],
    /** Runway 27: {x0, z0, x1, z1, y, width, length, heading}, end 0 the east threshold; null before init. */
    runway: null,
    /** The gate on the south fence: {x, z, open}. */
    gate,
    /** Every placement of the base in world coordinates, or null before init. */
    layout: null,
    /** The parked aircraft, the patrol jeep and the road block, or null before init. */
    vehicles: null,

    async init() {
      const { createAirBaseRuntime } = await import('./airbase/airBaseRuntime.js');
      runtime = createAirBaseRuntime(context);
      system.layout = runtime.layout;
      system.runway = runtime.layout.runway;
      system.vehicles = runtime.vehicles;
      gate.x = runtime.layout.gate.x;
      gate.z = runtime.layout.gate.z;
    },

    update(deltaSeconds) {
      if (runtime) runtime.update(deltaSeconds);
    },

    /** Opens or closes the gate (leaves, boom and its collider). */
    setGateOpen(open) {
      if (runtime) runtime.setGateOpen(Boolean(open));
    },

    /** Draw calls, triangles and lamps of what is built now, and which kit models are real. */
    stats: () => (runtime ? runtime.stats() : { built: false, draws: 0, triangles: 0, lamps: 0, models: {}, alarm: false, gateOpen: false }),

    dispose() {
      if (runtime) runtime.dispose();
      runtime = null;
    },
  };
  return system;
}
