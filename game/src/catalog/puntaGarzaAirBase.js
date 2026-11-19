// Base Aérea Punta Garza: the secret air base of the Marazul air guard on the wetland block across
// the Río Tamarindo from Aeródromo Los Pantanos. Its runway 27 runs parallel to the aerodrome's,
// out onto a causeway built into the western sea, so departures go out over the water.
// This file is the one plan of the base: the city plan flattens its ground from it, the base
// builder draws it, the restricted-area rules and the air guard read their posts from it.
// Frozen data, no imports.
//
// Coordinates are CITY coordinates (e east, n north, metres; the street grid is turned six degrees):
// puntaGarzaToWorld(e, n) gives world { x, z }. Headings are compass degrees in the world
// (0 = north = -Z, clockwise): the runway heads 276 on take-off.

const COS = Math.cos((6 * Math.PI) / 180);
const SIN = Math.sin((6 * Math.PI) / 180);

/**
 * World position of a city coordinate of the base (the same turn as world/plan/cityFrame.js).
 * @param {number} e Metres east in the city frame.
 * @param {number} n Metres north in the city frame.
 * @returns {{x: number, z: number}}
 */
export function puntaGarzaToWorld(e, n) {
  return { x: e * COS + n * SIN, z: e * SIN - n * COS };
}

/** The base: ground, runway, buildings, posts. Every [e, n] pair is a city coordinate. */
export const PUNTA_GARZA_AIR_BASE = Object.freeze({
  id: 'base_aerea_punta_garza',
  name: 'Base Aérea Punta Garza',
  shortName: 'Punta Garza',
  /** Height of the whole pad (apron, runway, causeway) above the sea, metres. */
  groundHeight: 1.6,
  /** The ground the plan raises and flattens to groundHeight: the fenced land block and the runway causeway. */
  pad: Object.freeze([[-1690, 830], [-1255, 830], [-1165, 1050], [-1165, 1335], [-1140, 1335], [-1140, 1435], [-2185, 1435], [-2185, 1335], [-1690, 1335]]),
  /** Runway 27 / 09: the east threshold (take-off start) first; 980 m by 45 m, heading 276 from end 0 to end 1. */
  runway: Object.freeze({ id: 'runway_punta_garza', from: [-1175, 1385], to: [-2155, 1385], width: 45, heading: 276, designators: ['27', '09'] }),
  /** The parallel taxiway and its three links to the runway (centre lines, 18 m wide). */
  taxiways: Object.freeze([
    Object.freeze({ id: 'taxi_parallel', line: [[-1185, 1310], [-1660, 1310]], width: 18 }),
    Object.freeze({ id: 'taxi_link_east', line: [[-1195, 1310], [-1195, 1385]], width: 18 }),
    Object.freeze({ id: 'taxi_link_mid', line: [[-1420, 1310], [-1420, 1385]], width: 18 }),
    Object.freeze({ id: 'taxi_link_west', line: [[-1650, 1310], [-1650, 1385]], width: 18 }),
  ]),
  /** The floodlit apron (a rectangle: west, east, south, north), joined to the taxiway along its north edge. */
  apron: Object.freeze({ west: -1645, east: -1255, south: 1150, north: 1301 }),
  /** Hardened aircraft shelters on the apron's south edge, doors facing north (heading 6 in the world). 58 m wide, 40 m deep. */
  shelters: Object.freeze([
    Object.freeze({ id: 'shelter_1', at: [-1605, 1128], facing: 6, holds: 'manta_sombra' }),
    Object.freeze({ id: 'shelter_2', at: [-1540, 1128], facing: 6, holds: 'garza_negra' }),
    Object.freeze({ id: 'shelter_3', at: [-1460, 1128], facing: 6, holds: 'halcon' }),
    Object.freeze({ id: 'shelter_4', at: [-1395, 1128], facing: 6, holds: 'halcon' }),
  ]),
  /** Where the aircraft stand on the apron, nose north towards the taxiway (heading 6). */
  stands: Object.freeze([
    Object.freeze({ id: 'stand_manta', at: [-1605, 1215], heading: 6, model: 'manta_sombra' }),
    Object.freeze({ id: 'stand_garza', at: [-1540, 1205], heading: 6, model: 'garza_negra' }),
    Object.freeze({ id: 'alert_1', at: [-1460, 1190], heading: 6, model: 'halcon' }),
    Object.freeze({ id: 'alert_2', at: [-1395, 1190], heading: 6, model: 'halcon' }),
  ]),
  /**
   * The rest of the squadron, parked and static (scenery, not vehicles): a line of four Halcón on
   * the east apron, wing to wing 22 m apart, nose north like every stand, and one in each of the
   * two fighter shelters, nose out of the door. The alert pair on alert_1 / alert_2 is not in here.
   */
  parkedFighters: Object.freeze([
    Object.freeze({ id: 'line_1', at: [-1356, 1250], heading: 6, model: 'halcon', place: 'apron' }),
    Object.freeze({ id: 'line_2', at: [-1334, 1250], heading: 6, model: 'halcon', place: 'apron' }),
    Object.freeze({ id: 'line_3', at: [-1312, 1250], heading: 6, model: 'halcon', place: 'apron' }),
    Object.freeze({ id: 'line_4', at: [-1290, 1250], heading: 6, model: 'halcon', place: 'apron' }),
    Object.freeze({ id: 'sheltered_1', at: [-1460, 1128], heading: 6, model: 'halcon', place: 'shelter', shelter: 'shelter_3' }),
    Object.freeze({ id: 'sheltered_2', at: [-1395, 1128], heading: 6, model: 'halcon', place: 'shelter', shelter: 'shelter_4' }),
  ]),
  controlTower: Object.freeze({ at: [-1300, 1125], facing: 6 }),
  /**
   * Floodlight masts around the apron. The north row stands 30 m south of the parallel taxiway's
   * centre line (on the apron, between the ways out of the stands), so the Manta Sombra's 46 m wing
   * passes them on its taxi to the runway. The last stands by the walkway at the west end of the
   * Halcón line, between the alert pair's way out and the equipment park.
   */
  floodlights: Object.freeze([[-1640, 1155], [-1500, 1158], [-1345, 1155], [-1258, 1200], [-1640, 1280], [-1500, 1280], [-1428, 1280], [-1258, 1280], [-1383, 1234]]),
  /** The fence: an open line from the river side round the land block to the causeway root; the sea closes the rest. */
  fence: Object.freeze([[-1160, 1335], [-1160, 1050], [-1250, 835], [-1492, 835], null, [-1508, 835], [-1685, 835], [-1685, 1330]]),
  /** The one gate, on the south fence where the access road comes in; the lead is challenged inside `challengeRadius`. */
  gate: Object.freeze({ at: [-1500, 835], facing: 186, width: 16, challengeRadius: 26, guardPost: [-1487, 842], turnBackTo: [-1500, 790] }),
  /** Camino de la Garza: from the Autopista del Golfo junction (where Camino Jade leaves south) north through the gate to the apron. */
  accessRoad: Object.freeze({ name: 'Camino de la Garza', line: [[-1500, 752], [-1500, 835], [-1500, 1150]], width: 8 }),
  /** The restricted area: inside this ring (and above it, below 600 m) the lead trespasses unless he has officer access. */
  restrictedRing: Object.freeze([[-1688, 833], [-1252, 833], [-1162, 1050], [-1138, 1335], [-1138, 1437], [-2187, 1437], [-2187, 1333], [-1688, 1333]]),
  /** The patrol jeep's loop inside the fence (closed). */
  patrolRoute: Object.freeze([[-1500, 860], [-1280, 860], [-1190, 1060], [-1190, 1290], [-1250, 1320], [-1655, 1320], [-1670, 1150], [-1670, 860]]),
  /** Where guards stand (role 'guard') and ground crew work (role 'groundCrew'); facing is a world compass heading. */
  posts: Object.freeze([
    Object.freeze({ id: 'gate_guard_1', role: 'guard', at: [-1494, 831], facing: 186 }),
    Object.freeze({ id: 'gate_guard_2', role: 'guard', at: [-1506, 831], facing: 186 }),
    Object.freeze({ id: 'road_guard', role: 'guard', at: [-1496, 1000], facing: 186 }),
    Object.freeze({ id: 'tower_guard', role: 'guard', at: [-1300, 1150], facing: 6 }),
    Object.freeze({ id: 'apron_guard_w', role: 'guard', at: [-1635, 1180], facing: 96 }),
    Object.freeze({ id: 'apron_guard_e', role: 'guard', at: [-1270, 1240], facing: 276 }),
    Object.freeze({ id: 'crew_manta_1', role: 'groundCrew', at: [-1585, 1200], facing: 276 }),
    Object.freeze({ id: 'crew_manta_2', role: 'groundCrew', at: [-1622, 1232], facing: 96 }),
    Object.freeze({ id: 'crew_garza_1', role: 'groundCrew', at: [-1528, 1190], facing: 276 }),
    Object.freeze({ id: 'crew_garza_2', role: 'groundCrew', at: [-1552, 1228], facing: 96 }),
    Object.freeze({ id: 'crew_alert', role: 'groundCrew', at: [-1428, 1180], facing: 6 }),
    Object.freeze({ id: 'duty_officer', role: 'officer', at: [-1500, 1170], facing: 186 }),
  ]),
});
