// Walking routes on the pavement graph (openWorldCity.pedestrianGraph): where a person on a
// pavement edge is, which edge they take at a corner, and whether a crossing is open to walk.
// Pure functions of the graph and plain numbers (Node-tested), no allocation in the per-frame
// calls: positions are written into a caller's object.
//
//   const routes = createWalkingRoutes(graph, roadNodes);
//   routes.place(edgeId, forward, along, lane, out);    // out.x, out.z, out.dirX, out.dirZ
//   const next = routes.chooseNextEdge(nodeId, fromEdgeId, headingX, headingZ, random(), style);
//   routes.crossingOpen(edgeId, seconds);               // false while traffic has green over it
//
// A person walks an edge from one end node to the other ("forward" from node a to node b), a
// lateral `lane` offset to the right of their direction of travel (people keep right and pass
// each other). Crossings with a signal open while the junction's signal is in any phase other
// than the edge's conflictPhase (docs/CITY_PLAN.md); the signal clock is the simulation time.

/** Seconds a walker needs left on the walk phase before stepping onto a signalled crossing. */
export const CROSSING_MARGIN = 5;

/**
 * Index of the active phase of a junction's signal, or -1 during the all-red gap.
 * @param {{phases: {green: number, yellow: number}[], allRed: number, cycle: number, offset: number}} signal
 * @param {number} seconds The signal clock (simulation seconds).
 * @returns {{phase: number, left: number}} The active phase (-1 all red) and seconds left in it.
 */
export function signalStateAt(signal, seconds, out = { phase: -1, left: 0 }) {
  let t = (seconds + signal.offset) % signal.cycle;
  if (t < 0) t += signal.cycle;
  for (let i = 0; i < signal.phases.length; i += 1) {
    const phase = signal.phases[i];
    const lit = phase.green + phase.yellow;
    if (t < lit) { out.phase = i; out.left = lit - t; return out; }
    t -= lit;
    if (t < signal.allRed) { out.phase = -1; out.left = signal.allRed - t; return out; }
    t -= signal.allRed;
  }
  out.phase = -1;
  out.left = 0;
  return out;
}

/**
 * Weight of taking an edge at a corner: straight on is favoured, turning back is rare, crossings
 * are taken less often than pavements (more by people out walking than by strollers), unpaved
 * verges seldom, and the promenade and pier are loved by strollers.
 * @param {{kind: string, paved: boolean, place?: string}} edge
 * @param {number} alignment Cosine between the walker's heading and the edge's way out (-1..1).
 * @param {'walk'|'stroll'|'jog'} style
 */
export function routeWeight(edge, alignment, style = 'walk') {
  let weight = 0.25 + 1.5 * Math.max(0, alignment) ** 2;
  if (alignment < -0.6) weight *= 0.15;
  if (edge.kind === 'crosswalk') weight *= style === 'stroll' ? 0.45 : 0.7;
  if (edge.kind === 'path') weight *= style === 'walk' ? 1 : 2;
  if (!edge.paved) weight *= 0.25;
  return weight;
}

/**
 * Creates the route helpers for one pavement graph.
 * @param {{nodes: {id: number, x: number, z: number, edges: number[]}[], edges: object[]}} graph
 * @param {{signal?: object}[]} [roadNodes] plan.roads.nodes, for the signals of crossings.
 */
export function createWalkingRoutes(graph, roadNodes = [], signals = null) {
  const { nodes, edges } = graph;
  /** Per edge: true when its points run from node a to node b. */
  const pointsFromA = edges.map((edge) => {
    const p = edge.points, a = nodes[edge.a], n = p.length;
    const first = (p[0] - a.x) ** 2 + (p[1] - a.z) ** 2;
    const last = (p[n - 2] - a.x) ** 2 + (p[n - 1] - a.z) ** 2;
    return first <= last;
  });
  /** Per edge: cumulative length at each point. */
  const cumulative = edges.map((edge) => {
    const p = edge.points, out = new Float64Array(p.length / 2);
    for (let i = 1; i < out.length; i += 1) out[i] = out[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
    return out;
  });
  const signalScratch = { phase: -1, left: 0 };
  const candidates = [];
  const weights = [];

  /** Length of an edge as walked (its polyline). */
  function lengthOf(edgeId) {
    const c = cumulative[edgeId];
    return c[c.length - 1];
  }

  /**
   * Where a person is: on edge, walking forward (a to b) or back, `along` metres from where they
   * started it, `lane` metres right of their direction of travel.
   */
  function place(edgeId, forward, along, lane, out) {
    const edge = edges[edgeId], p = edge.points, c = cumulative[edgeId];
    const total = c[c.length - 1];
    const runsWithPoints = forward === pointsFromA[edgeId];
    let s = runsWithPoints ? along : total - along;
    s = s < 0 ? 0 : s > total ? total : s;
    let i = 1;
    while (i < c.length - 1 && c[i] < s) i += 1;
    const span = c[i] - c[i - 1] || 1;
    const t = (s - c[i - 1]) / span;
    const x0 = p[i * 2 - 2], z0 = p[i * 2 - 1], x1 = p[i * 2], z1 = p[i * 2 + 1];
    let dx = (x1 - x0) / span, dz = (z1 - z0) / span;
    if (!runsWithPoints) { dx = -dx; dz = -dz; }
    out.x = x0 + (x1 - x0) * t - dz * lane;
    out.z = z0 + (z1 - z0) * t + dx * lane;
    out.dirX = dx;
    out.dirZ = dz;
    out.length = total;
    return out;
  }

  /** How far along an edge (walked forward or back) the point nearest to x, z lies. */
  function locate(edgeId, forward, x, z) {
    const p = edges[edgeId].points, c = cumulative[edgeId];
    let best = Infinity, bestS = 0;
    for (let i = 1; i < c.length; i += 1) {
      const x0 = p[i * 2 - 2], z0 = p[i * 2 - 1], dx = p[i * 2] - x0, dz = p[i * 2 + 1] - z0;
      const span2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / span2));
      const ex = x0 + dx * t - x, ez = z0 + dz * t - z;
      const d2 = ex * ex + ez * ez;
      if (d2 < best) { best = d2; bestS = c[i - 1] + t * Math.sqrt(span2); }
    }
    return forward === pointsFromA[edgeId] ? bestS : c[c.length - 1] - bestS;
  }

  /** The node a person reaches at the end of an edge. */
  function endNode(edgeId, forward) {
    return forward ? edges[edgeId].b : edges[edgeId].a;
  }

  /**
   * Picks the edge to take at a corner.
   * @param {number} nodeId The corner reached.
   * @param {number} fromEdgeId The edge arrived on (-1 for none).
   * @param {number} headingX Walking direction (unit) on arrival.
   * @param {number} headingZ
   * @param {number} roll A uniform number in [0, 1).
   * @param {'walk'|'stroll'|'jog'} [style]
   * @returns {{edge: number, forward: boolean} | null} null for a node with no edges.
   */
  function chooseNextEdge(nodeId, fromEdgeId, headingX, headingZ, roll, style = 'walk', out = { edge: -1, forward: true }) {
    const node = nodes[nodeId];
    if (!node || node.edges.length === 0) return null;
    candidates.length = 0;
    weights.length = 0;
    let total = 0;
    for (const edgeId of node.edges) {
      if (edgeId === fromEdgeId && node.edges.length > 1) continue;
      const edge = edges[edgeId];
      const other = nodes[edge.a === nodeId ? edge.b : edge.a];
      const dx = other.x - node.x, dz = other.z - node.z;
      const d = Math.hypot(dx, dz) || 1;
      const weight = routeWeight(edge, (dx * headingX + dz * headingZ) / d, style);
      candidates.push(edgeId);
      weights.push(weight);
      total += weight;
    }
    let pick = roll * total;
    let chosen = candidates[candidates.length - 1];
    for (let i = 0; i < candidates.length; i += 1) {
      pick -= weights[i];
      if (pick < 0) { chosen = candidates[i]; break; }
    }
    out.edge = chosen;
    out.forward = edges[chosen].a === nodeId;
    return out;
  }

  /**
   * True when a crossing may be stepped onto now (always for pavements and plain crossings).
   * With the city's shared signal clock (openWorldCity.signals) walkers agree with the cars and
   * the lamps; without it (Node tests) the plan's signal is read at `seconds`.
   */
  function crossingOpen(edgeId, seconds) {
    const edge = edges[edgeId];
    if (edge.kind !== 'crosswalk' || edge.signalNode < 0) return true;
    const shared = signals ? signals.walkOpen(edge.signalNode, edge.conflictPhase) : null;
    if (typeof shared === 'boolean') return shared;
    const signal = roadNodes[edge.signalNode] && roadNodes[edge.signalNode].signal;
    if (!signal) return true;
    const state = signalStateAt(signal, seconds, signalScratch);
    if (state.phase < 0 || state.phase === edge.conflictPhase) return false;
    // Do not start across when the walk phase is about to end and traffic gets green next.
    const next = (state.phase + 1) % signal.phases.length;
    return !(next === edge.conflictPhase && state.left < CROSSING_MARGIN);
  }

  return { nodes, edges, lengthOf, place, locate, endNode, chooseNextEdge, crossingOpen };
}
