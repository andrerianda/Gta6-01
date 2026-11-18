// The directed lane graph that traffic drives on. Every road segment gives one lane per traffic
// lane, as a centre line in the direction of travel between the two junction areas; at every
// intersection each arriving lane is joined to the lanes it may continue on, with the turn it
// makes. Traffic keeps to the right. A lane knows its neighbours for lane changes, its speed
// limit and what governs its far end (a signal phase, a stop sign, nothing).
//
//   const lanes = buildLaneGraph(plan.roads);
//   lanes[i].points                 // flat [x, z, ...] in the direction of travel
//   lanes[i].successors             // [{lane: id, turn: 'straight' | 'left' | 'right' | 'uturn'}]

import { offsetPolyline, polylineLength, reversePoints, slicePolyline } from './planGeometry.js';
import { laneOffset } from './roadSpecifications.js';

/**
 * Builds the lanes of every segment and their connections through the intersections.
 * @param {{nodes: import('./roadGraphAssembly.js').RoadNode[], segments: import('./roadGraphAssembly.js').RoadSegment[]}} roads
 *   The designed road graph (designIntersections has run).
 * @returns {TrafficLane[]}
 */
export function buildLaneGraph(roads) {
  const lanes = [];
  // Lane ids by segment and direction: groups[segment * 2] forward, groups[segment * 2 + 1] backward.
  const groups = [];
  for (const segment of roads.segments) {
    const centre = slicePolyline(segment.points, segment.trimA, Math.max(segment.trimA + 1, segment.length - segment.trimB));
    for (const direction of [1, -1]) {
      const count = direction === 1 ? segment.lanesForward : segment.lanesBackward;
      const line = direction === 1 ? centre : reversePoints(centre.slice());
      const toNode = roads.nodes[direction === 1 ? segment.b : segment.a];
      const arm = toNode.arms.find((candidate) => candidate.segment === segment.id && candidate.atStart === (direction === -1));
      const group = [];
      for (let index = 0; index < count; index += 1) {
        const points = offsetPolyline(line, laneOffset(segment, direction, index));
        group.push(lanes.length);
        lanes.push({
          id: lanes.length, segment: segment.id, direction, index, lanesInGroup: count, points, length: polylineLength(points),
          speedLimit: segment.speedLimit, roadClass: segment.roadClass, fromNode: direction === 1 ? segment.a : segment.b, toNode: toNode.id,
          leftLane: index > 0 ? lanes.length - 1 : -1, rightLane: index < count - 1 ? lanes.length + 1 : -1,
          control: toNode.control, signalNode: toNode.control === 'signals' ? toNode.id : -1, phase: arm ? arm.phase : -1,
          mustStop: arm ? arm.mustStop : false, successors: [],
        });
      }
      groups.push(group);
    }
  }
  for (const node of roads.nodes) {
    for (const arrival of node.arms) {
      // Lanes that arrive along this arm travel against the arm's outward direction.
      const arriving = groups[arrival.segment * 2 + (arrival.atStart ? 1 : 0)];
      if (arriving.length === 0) continue;
      const exits = [];
      for (const departure of node.arms) {
        if (departure === arrival && node.arms.length > 1) continue;
        const leaving = groups[departure.segment * 2 + (departure.atStart ? 0 : 1)];
        if (leaving.length === 0) continue;
        const cross = -arrival.dx * departure.dz + arrival.dz * departure.dx;
        const dot = -arrival.dx * departure.dx - arrival.dz * departure.dz;
        const angle = Math.atan2(cross, dot);
        const turn = departure === arrival || Math.abs(angle) > 2.7 ? 'uturn' : Math.abs(angle) < 0.6 ? 'straight' : angle > 0 ? 'right' : 'left';
        exits.push({ leaving, turn });
      }
      for (const id of arriving) {
        const lane = lanes[id];
        for (const { leaving, turn } of exits) {
          const innermost = lane.index === 0;
          const outermost = lane.index === lane.lanesInGroup - 1;
          if (turn === 'right' && !outermost) continue;
          if (turn === 'left' && !innermost) continue;
          const target = turn === 'right' ? leaving.length - 1 : turn === 'left' ? 0 : Math.min(lane.index, leaving.length - 1);
          lane.successors.push({ lane: leaving[target], turn });
        }
        // A middle lane where the road ends in a T may still turn, so that no lane is a trap.
        if (lane.successors.length === 0) {
          for (const { leaving, turn } of exits) lane.successors.push({ lane: leaving[Math.min(lane.index, leaving.length - 1)], turn });
        }
      }
    }
  }
  return lanes;
}

/**
 * @typedef {Object} TrafficLane
 * @property {number} id Index in the lane list.
 * @property {number} segment Road segment id.
 * @property {1 | -1} direction 1 along the segment's points, -1 against them.
 * @property {number} index 0 is the innermost lane (next to the median or the centre line).
 * @property {number} lanesInGroup Lanes of this segment in this direction.
 * @property {number[]} points Centre line, flat [x, z, ...], in the direction of travel, between the junction areas.
 * @property {number} length
 * @property {number} speedLimit Metres per second.
 * @property {string} roadClass
 * @property {number} fromNode Node id the lane leaves.
 * @property {number} toNode Node id the lane arrives at.
 * @property {number} leftLane Lane id for a change to the left (-1 for none).
 * @property {number} rightLane
 * @property {'signals'|'stop'|'none'|'cul_de_sac'|'exit'} control What governs the far end.
 * @property {number} signalNode Node id whose signal governs the far end (-1 for none).
 * @property {number} phase Index of the signal phase that gives this lane green (-1 without signals).
 * @property {boolean} mustStop Whether the far end has a stop sign for this lane.
 * @property {{lane: number, turn: 'straight'|'left'|'right'|'uturn'}[]} successors
 */
