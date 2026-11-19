// The cross-sections of Marazul's roads. Every road segment of the plan carries one of these
// specifications: its class, lanes in each direction, widths of lanes, median, parking lanes,
// shoulders and sidewalks, its speed limit and how it is dressed (palms, trees, plain).
//
//   const spec = ROAD_PROFILES.grand_avenue;
//   spec.halfWidth          // centre line to kerb
//   spec.corridorRight      // centre line to the back of the right-hand sidewalk
//
// Across the road, from the left kerb to the right kerb when looking along the segment:
// shoulder, left parking lane, backward lanes, median, forward lanes, right parking lane,
// shoulder. Traffic keeps to the right.

/**
 * @typedef {Object} RoadSpecification
 * @property {string} profile The name of the cross-section.
 * @property {'highway'|'ramp'|'avenue'|'street'|'alley'|'service'|'dirt'} roadClass
 * @property {number} lanesForward Lanes along the segment's direction.
 * @property {number} lanesBackward Lanes against it (0 for a one-way road).
 * @property {boolean} oneWay
 * @property {number} laneWidth
 * @property {number} medianWidth
 * @property {number} shoulder Paved or gravel strip outside the outer lanes, each side.
 * @property {number} parkingLeft Width of the kerbside parking lane on the left (0 for none).
 * @property {number} parkingRight
 * @property {number} sidewalkLeft Width of the sidewalk (0 for a verge without one).
 * @property {number} sidewalkRight
 * @property {number} speedLimit Metres per second.
 * @property {number} priority Rank used where roads meet: the higher one runs straight through.
 * @property {string} streetscape How the street is dressed: 'palm_median', 'tree_median',
 *   'trees', 'plain', 'old_town', 'hillside', 'industrial', 'rural', 'highway', 'bridge', 'track'.
 * @property {boolean} paved
 * @property {number} halfWidth Centre line to kerb.
 * @property {number} corridorLeft Centre line to the back of the left sidewalk or verge.
 * @property {number} corridorRight
 */

const VERGE = 1.6;

function profile(name, roadClass, values) {
  const spec = {
    profile: name,
    roadClass,
    lanesForward: 1,
    lanesBackward: 1,
    laneWidth: 3.25,
    medianWidth: 0,
    shoulder: 0,
    parkingLeft: 0,
    parkingRight: 0,
    sidewalkLeft: 0,
    sidewalkRight: 0,
    speedLimit: 13.9,
    priority: 3,
    streetscape: 'plain',
    paved: true,
    ...values,
  };
  spec.oneWay = spec.lanesBackward === 0;
  const roadway =
    (spec.lanesForward + spec.lanesBackward) * spec.laneWidth + spec.medianWidth + spec.parkingLeft + spec.parkingRight + spec.shoulder * 2;
  spec.halfWidth = roadway / 2;
  spec.corridorLeft = spec.halfWidth + (spec.sidewalkLeft > 0 ? spec.sidewalkLeft : VERGE);
  spec.corridorRight = spec.halfWidth + (spec.sidewalkRight > 0 ? spec.sidewalkRight : VERGE);
  return Object.freeze(spec);
}

/**
 * The cross-sections used in the city, by name.
 * @type {Readonly<Record<string, RoadSpecification>>}
 */
export const ROAD_PROFILES = Object.freeze({
  highway: profile('highway', 'highway', {
    lanesForward: 3, lanesBackward: 3, laneWidth: 3.6, medianWidth: 4, shoulder: 2.4, speedLimit: 27.8, priority: 6, streetscape: 'highway',
  }),
  highway_bridge: profile('highway_bridge', 'highway', {
    lanesForward: 3, lanesBackward: 3, laneWidth: 3.6, medianWidth: 2, shoulder: 1.2, speedLimit: 27.8, priority: 6, streetscape: 'bridge',
  }),
  highway_ramp: profile('highway_ramp', 'ramp', {
    lanesForward: 1, lanesBackward: 0, laneWidth: 4.4, shoulder: 1.2, speedLimit: 13.9, priority: 4.5, streetscape: 'highway',
  }),
  grand_avenue: profile('grand_avenue', 'avenue', {
    lanesForward: 3, lanesBackward: 3, laneWidth: 3.3, medianWidth: 5, parkingLeft: 2.4, parkingRight: 2.4,
    sidewalkLeft: 5, sidewalkRight: 5, speedLimit: 16.7, priority: 5.5, streetscape: 'palm_median',
  }),
  avenue: profile('avenue', 'avenue', {
    lanesForward: 2, lanesBackward: 2, laneWidth: 3.3, medianWidth: 3, parkingLeft: 2.4, parkingRight: 2.4,
    sidewalkLeft: 4, sidewalkRight: 4, speedLimit: 16.7, priority: 5, streetscape: 'tree_median',
  }),
  beach_drive: profile('beach_drive', 'avenue', {
    lanesForward: 2, lanesBackward: 2, laneWidth: 3.3, medianWidth: 5, parkingLeft: 2.4, parkingRight: 2.4,
    sidewalkLeft: 4.5, sidewalkRight: 4.5, speedLimit: 13.9, priority: 5.2, streetscape: 'palm_median',
  }),
  rural_avenue: profile('rural_avenue', 'avenue', {
    lanesForward: 2, lanesBackward: 2, laneWidth: 3.4, shoulder: 1.2, speedLimit: 19.4, priority: 5, streetscape: 'rural',
  }),
  avenue_bridge: profile('avenue_bridge', 'avenue', {
    lanesForward: 2, lanesBackward: 2, laneWidth: 3.3, medianWidth: 1.2, shoulder: 0.4,
    sidewalkLeft: 2.2, sidewalkRight: 2.2, speedLimit: 16.7, priority: 5, streetscape: 'bridge',
  }),
  street: profile('street', 'street', {
    parkingLeft: 2.3, parkingRight: 2.3, sidewalkLeft: 3, sidewalkRight: 3, streetscape: 'trees',
  }),
  street_one_way: profile('street_one_way', 'street', {
    lanesForward: 2, lanesBackward: 0, parkingLeft: 2.3, parkingRight: 2.3, sidewalkLeft: 3, sidewalkRight: 3, streetscape: 'trees',
  }),
  resort_street: profile('resort_street', 'street', {
    parkingLeft: 2.3, parkingRight: 2.3, sidewalkLeft: 3.5, sidewalkRight: 3.5, streetscape: 'palms',
  }),
  industrial_street: profile('industrial_street', 'street', {
    laneWidth: 3.6, parkingLeft: 2.6, parkingRight: 2.6, sidewalkLeft: 2.2, sidewalkRight: 2.2, streetscape: 'industrial',
  }),
  old_town_street: profile('old_town_street', 'street', {
    laneWidth: 2.9, parkingRight: 2.1, sidewalkLeft: 2.2, sidewalkRight: 2.2, speedLimit: 8.3, priority: 2.6, streetscape: 'old_town',
  }),
  old_town_lane: profile('old_town_lane', 'alley', {
    lanesForward: 1, lanesBackward: 0, laneWidth: 3.4, parkingRight: 2.1, sidewalkLeft: 1.7, sidewalkRight: 1.7,
    speedLimit: 8.3, priority: 2.2, streetscape: 'old_town',
  }),
  hill_street: profile('hill_street', 'street', {
    laneWidth: 3.1, shoulder: 0.3, sidewalkLeft: 1.8, sidewalkRight: 1.8, speedLimit: 11.1, priority: 2.8, streetscape: 'hillside',
  }),
  service_road: profile('service_road', 'service', {
    laneWidth: 3.4, shoulder: 0.4, speedLimit: 11.1, priority: 2, streetscape: 'plain',
  }),
  dirt_track: profile('dirt_track', 'dirt', {
    laneWidth: 2.8, speedLimit: 8.3, priority: 1, streetscape: 'track', paved: false,
  }),
});

/**
 * The offset of a lane's centre line from the road's centre line, to the right of the lane's own
 * direction of travel.
 * @param {RoadSpecification} spec
 * @param {1 | -1} direction 1 for the lanes along the segment, -1 for those against it.
 * @param {number} laneIndex 0 is the innermost lane (next to the median or the centre).
 * @returns {number} Metres.
 */
export function laneOffset(spec, direction, laneIndex) {
  const nearParking = direction > 0 ? spec.parkingLeft : spec.parkingRight;
  const opposing = direction > 0 ? spec.lanesBackward : spec.lanesForward;
  return -spec.halfWidth + spec.shoulder + nearParking + opposing * spec.laneWidth + spec.medianWidth + (laneIndex + 0.5) * spec.laneWidth;
}

/**
 * How far from the centre line a pedestrian walks on one side of a road: the middle of the
 * sidewalk, or of the verge where there is none.
 * @param {RoadSpecification} spec
 * @param {'left' | 'right'} side
 * @returns {number} Metres from the centre line.
 */
export function walkwayOffset(spec, side) {
  const sidewalk = side === 'left' ? spec.sidewalkLeft : spec.sidewalkRight;
  return spec.halfWidth + (sidewalk > 0 ? sidewalk / 2 : VERGE / 2);
}

/** The classes of road in drawing order, least important first. */
export const ROAD_CLASSES = Object.freeze(['dirt', 'service', 'alley', 'street', 'ramp', 'avenue', 'highway']);
