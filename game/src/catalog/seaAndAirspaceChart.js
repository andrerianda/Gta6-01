// The chart of the sea and the airspace around Marazul: where the closed-sea boundary lies, where
// the radars stand, where the navy picket sails and where the Norvast island waits beyond the haze.
// One file so the ocean, the air guard, the radar network and the island zone agree on the map.
// World coordinates (metres, +X east, -Z north, sea level y = 0); frozen data, no imports.

/** The sea and airspace chart. */
export const SEA_AND_AIRSPACE_CHART = Object.freeze({
  /** The middle of Marazul the boundary is measured from. */
  centre: Object.freeze({ x: 0, z: 150 }),
  /** The city's height field ends here; beyond it there is only sea. */
  cityExtent: Object.freeze({ minX: -2048, maxX: 2048, minZ: -1856, maxZ: 2240 }),
  /**
   * The sea boundary (horizontal metres from `centre`, any altitude) while the sea is closed:
   * past `warn` the radio warns, past `intercept` the patrol is sent, past `weaponsFree` the patrol
   * fires, and nothing flies past `hardLimit` (the aircraft is brought down). Back inside `clear`
   * the warning ends.
   */
  boundary: Object.freeze({ clear: 4600, warn: 5000, intercept: 6000, weaponsFree: 7200, hardLimit: 8600 }),
  /** The radio lines of the boundary (text events now; voices later). */
  boundaryCallsign: 'Control Marazul',
  boundaryWarning: 'International airspace: return to Marazul',
  /** The air guard: two Halcón interceptors, callsigns and where they give up the chase once the sea is open. */
  airGuard: Object.freeze({
    callsigns: Object.freeze(['Halcón Uno', 'Halcón Dos']),
    baseId: 'base_aerea_punta_garza',
    /** With the sea open the interceptors turn back this far from `centre` ("the border"). */
    borderRadius: 7000,
  }),
  /** The unmanned coastal radar of Cabo Lejano, on the south-west cape of the wetland bank: the air guard's ground guidance. */
  radarTower: Object.freeze({ id: 'radar_cabo_lejano', name: 'Radar Cabo Lejano', kind: 'tower', x: -1560, z: 752, antennaHeight: 34, range: 16000, sweepSeconds: 6 }),
  /** The navy radar picket for the "stealth test": three ships on a line across the way out to the island. */
  navyPicket: Object.freeze([
    Object.freeze({ id: 'picket_1', name: 'ARM Centinela', kind: 'ship', x: -5650, z: -700, heading: 20, antennaHeight: 24, range: 2600, sweepSeconds: 9 }),
    Object.freeze({ id: 'picket_2', name: 'ARM Vigía', kind: 'ship', x: -5950, z: -2350, heading: 200, antennaHeight: 24, range: 2600, sweepSeconds: 11 }),
    Object.freeze({ id: 'picket_3', name: 'ARM Farallón', kind: 'ship', x: -5500, z: -4000, heading: 20, antennaHeight: 24, range: 2600, sweepSeconds: 8 }),
  ]),
  /**
   * The island of the Federasi Norvast: 9.8 km from the middle of Marazul, west-north-west, the way
   * runway 27 points. `stripHeading` is the compass heading of a landing arriving from Marazul.
   */
  norvastIsland: Object.freeze({
    id: 'norvast_island', name: 'Norvast', x: -9200, z: -3300, radius: 950, peakHeight: 140,
    stripHeading: 285, stripLength: 900, stripWidth: 40, stripHeight: 18,
    /** The zone's models and people load inside this distance (while the sea is open); the faint far shape shows from `visibleFrom`. */
    streamRadius: 5200, visibleFrom: 14000,
  }),
  faction: Object.freeze({ id: 'federasi_norvast', name: 'Federasi Norvast' }),
});
