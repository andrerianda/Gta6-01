// The pavement graph that pedestrians walk on. Every junction gets one corner node between each
// pair of neighbouring arms; a sidewalk edge runs along each walkable side of a road from corner
// to corner, and a crossing edge runs over each arm of a junction from one corner to the next,
// over the painted crosswalk where there is one. Crossings carry the signal phase that conflicts
// with them, so a walker waits while that phase has green.
//
//   const graph = buildPedestrianGraph(plan.roads);
//   graph.nodes[i]     // {id, x, y, z, roadNode, edges: [edge ids]}
//   graph.edges[i]     // {id, a, b, kind: 'sidewalk' | 'crosswalk' | 'path', points, length, ...}
//   addPavementPaths(graph, special.paths);    // the promenade and the pier

import { lineIntersection, offsetPolyline, polylineLength, projectOnPolyline, slicePolyline } from './planGeometry.js';
import { walkwayOffset } from './roadSpecifications.js';

const VERGE_WALKING = new Set(['dirt', 'service', 'alley']);

/**
 * Builds the pedestrian graph from the designed road graph.
 * @param {{nodes: import('./roadGraphAssembly.js').RoadNode[], segments: import('./roadGraphAssembly.js').RoadSegment[]}} roads
 * @returns {{nodes: PavementNode[], edges: PavementEdge[]}}
 */
export function buildPedestrianGraph(roads) {
  const nodes = [];
  const edges = [];
  const addNode = (x, z, roadNode) => {
    nodes.push({ id: nodes.length, x, y: roads.nodes[roadNode].y, z, roadNode, edges: [] });
    return nodes.length - 1;
  };
  const addEdge = (a, b, kind, points, more) => {
    const edge = { id: edges.length, a, b, kind, points, length: polylineLength(points), ...more };
    edges.push(edge);
    nodes[a].edges.push(edge.id);
    nodes[b].edges.push(edge.id);
    return edge;
  };
  // The end of the walkway on one side of an arm: sign 1 is the right of the arm's outward direction.
  const sideEnd = (node, arm, sign) => {
    const segment = roads.segments[arm.segment];
    const side = (sign > 0) === arm.atStart ? 'right' : 'left';
    const offset = walkwayOffset(segment, side) * sign;
    return [node.x + arm.dx * arm.trim - arm.dz * offset, node.z + arm.dz * arm.trim + arm.dx * offset];
  };

  // corners[node][i]: the corner between arm i (its right) and the next arm round the node (its left).
  const corners = roads.nodes.map(() => []);
  for (const node of roads.nodes) {
    const { arms } = node;
    if (arms.length === 1) {
      const right = sideEnd(node, arms[0], 1);
      const left = sideEnd(node, arms[0], -1);
      corners[node.id] = [addNode(right[0], right[1], node.id), addNode(left[0], left[1], node.id)];
      continue;
    }
    for (let i = 0; i < arms.length; i += 1) {
      const next = arms[(i + 1) % arms.length];
      const p = sideEnd(node, arms[i], 1);
      const q = sideEnd(node, next, -1);
      let x = (p[0] + q[0]) / 2;
      let z = (p[1] + q[1]) / 2;
      const hit = lineIntersection(p[0], p[1], arms[i].dx, arms[i].dz, q[0], q[1], next.dx, next.dz);
      if (hit && Math.hypot(hit[0] - node.x, hit[1] - node.z) < Math.max(arms[i].trim, next.trim) + 8) [x, z] = hit;
      corners[node.id].push(addNode(x, z, node.id));
    }
  }
  const cornerAt = (node, armIndex, sign) => {
    const list = corners[node.id];
    const count = node.arms.length;
    if (count === 1) return sign > 0 ? list[0] : list[1];
    return sign > 0 ? list[armIndex] : list[(armIndex - 1 + count) % count];
  };

  for (const segment of roads.segments) {
    const nodeA = roads.nodes[segment.a];
    const nodeB = roads.nodes[segment.b];
    const armA = nodeA.arms.findIndex((arm) => arm.segment === segment.id && arm.atStart);
    const armB = nodeB.arms.findIndex((arm) => arm.segment === segment.id && !arm.atStart);
    if (armA < 0 || armB < 0) continue;
    const from = segment.trimA + 1;
    const to = segment.length - segment.trimB - 1;
    const middle = to - from > 2 ? slicePolyline(segment.points, from, to) : null;
    for (const side of ['right', 'left']) {
      const sidewalk = side === 'right' ? segment.sidewalkRight : segment.sidewalkLeft;
      if (sidewalk <= 0 && !VERGE_WALKING.has(segment.roadClass)) continue;
      const sign = side === 'right' ? 1 : -1;
      const a = cornerAt(nodeA, armA, sign);
      const b = cornerAt(nodeB, armB, -sign);
      const points = [nodes[a].x, nodes[a].z];
      if (middle) for (const value of offsetPolyline(middle, walkwayOffset(segment, side) * sign)) points.push(value);
      points.push(nodes[b].x, nodes[b].z);
      addEdge(a, b, 'sidewalk', points, { segment: segment.id, side, width: sidewalk > 0 ? sidewalk : 1.5, paved: sidewalk > 0, roadNode: -1, arm: -1, signalNode: -1, conflictPhase: -1 });
    }
  }

  for (const node of roads.nodes) {
    const { arms } = node;
    if (arms.length === 1) {
      if (node.exit) continue;
      const [right, left] = corners[node.id];
      addEdge(right, left, 'crosswalk', [nodes[right].x, nodes[right].z, nodes[left].x, nodes[left].z],
        { segment: arms[0].segment, side: null, width: 3, paved: false, roadNode: node.id, arm: 0, signalNode: -1, conflictPhase: -1 });
      continue;
    }
    if (arms.length < 3) continue;
    const signals = node.control === 'signals';
    for (let i = 0; i < arms.length; i += 1) {
      const segment = roads.segments[arms[i].segment];
      if (!signals && (segment.roadClass === 'highway' || segment.roadClass === 'ramp')) continue;
      const a = cornerAt(node, i, -1);
      const b = cornerAt(node, i, 1);
      const painted = node.crosswalks.find((crosswalk) => crosswalk.arm === i);
      const points = painted
        ? [nodes[a].x, nodes[a].z, painted.ax, painted.az, painted.bx, painted.bz, nodes[b].x, nodes[b].z]
        : [nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z];
      addEdge(a, b, 'crosswalk', points, {
        segment: segment.id, side: null, width: 3, paved: Boolean(painted), roadNode: node.id, arm: i,
        signalNode: signals ? node.id : -1, conflictPhase: signals ? arms[i].phase : -1,
      });
    }
  }
  return { nodes, edges };
}

/**
 * Adds walkways that follow no road (the promenade, the pier) to the graph: each becomes a chain
 * of `path` edges, linked to every pavement corner that lies beside it.
 * @param {{nodes: PavementNode[], edges: PavementEdge[]}} graph Changed in place.
 * @param {{kind: string, points: number[], y: number, width: number}[]} paths
 */
export function addPavementPaths(graph, paths) {
  const { nodes, edges } = graph;
  const addEdge = (a, b, points, path, link) => {
    const edge = {
      id: edges.length, a, b, kind: 'path', points, length: polylineLength(points), segment: -1, side: null, width: link ? 3 : path.width,
      paved: true, roadNode: -1, arm: -1, signalNode: -1, conflictPhase: -1, place: path.kind,
    };
    edges.push(edge);
    nodes[a].edges.push(edge.id);
    nodes[b].edges.push(edge.id);
  };
  for (const path of paths) {
    const last = path.points.length - 2;
    const stops = [
      { along: 0, x: path.points[0], z: path.points[1], node: -1, distance: 0 },
      { along: polylineLength(path.points), x: path.points[last], z: path.points[last + 1], node: -1, distance: 0 },
    ];
    for (const node of nodes) {
      const hit = projectOnPolyline(path.points, node.x, node.z);
      if (hit.distance <= 16) stops.push({ along: hit.along, x: hit.x, z: hit.z, node: node.id, distance: hit.distance });
    }
    stops.sort((p, q) => p.along - q.along);
    let previous = null;
    for (const stop of stops) {
      // A corner that lies on the path itself becomes one of its nodes.
      if (stop.node >= 0 && stop.distance < 0.5) {
        if (previous && stop.along - previous.along < 1.5 && nodes[previous.id].edges.length === 0 && previous.id === nodes.length - 1) nodes.pop();
        else if (previous && stop.along - previous.along >= 0.5) addEdge(previous.id, stop.node, slicePolyline(path.points, previous.along, stop.along), path, false);
        previous = { id: stop.node, along: stop.along };
        continue;
      }
      if (!previous || stop.along - previous.along >= 1.5) {
        nodes.push({ id: nodes.length, x: stop.x, y: path.y, z: stop.z, roadNode: -1, edges: [] });
        const id = nodes.length - 1;
        if (previous) addEdge(previous.id, id, slicePolyline(path.points, previous.along, stop.along), path, false);
        previous = { id, along: stop.along };
      }
      if (stop.node >= 0) addEdge(stop.node, previous.id, [nodes[stop.node].x, nodes[stop.node].z, nodes[previous.id].x, nodes[previous.id].z], path, true);
    }
  }
}

/**
 * @typedef {Object} PavementNode
 * @property {number} id Index in the node list.
 * @property {number} x
 * @property {number} y Height of the junction it belongs to.
 * @property {number} z
 * @property {number} roadNode Id of the road node whose corner this is.
 * @property {number[]} edges Ids of the edges that meet here.
 */

/**
 * @typedef {Object} PavementEdge
 * @property {number} id Index in the edge list.
 * @property {number} a Pavement node id at the first point.
 * @property {number} b Pavement node id at the last point.
 * @property {'sidewalk'|'crosswalk'|'path'} kind A path follows no road (`place` says which: promenade, pier).
 * @property {number[]} points Flat [x, z, ...] from a to b.
 * @property {number} length
 * @property {number} segment Road segment walked along or crossed.
 * @property {?('left'|'right')} side Side of the segment (sidewalks only).
 * @property {number} width Walkable width in metres.
 * @property {boolean} paved A real sidewalk or a painted crosswalk; false for a verge or an unmarked crossing.
 * @property {number} roadNode Junction of a crossing (-1 for sidewalks).
 * @property {number} arm Index of the crossed arm in that junction's `arms` (-1 for sidewalks).
 * @property {number} signalNode Road node whose signal governs the crossing (-1 for none).
 * @property {number} conflictPhase Signal phase during which traffic drives over the crossing: walk in any other phase (-1 without signals).
 */
