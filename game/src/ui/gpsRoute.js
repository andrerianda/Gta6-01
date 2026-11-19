// GPS routes along the city's roads: the shortest way over the road graph of the city plan
// (plan.roads: intersections joined by segments with their centre-line points) from a point to a
// target, as a flat x, z polyline the radar draws. The router snaps both ends to the nearest point
// of a road, runs A* between the intersections and writes the way into a route buffer made once,
// so a query allocates nothing. Pure: no DOM, no three.js.

/**
 * A route buffer: up to `capacity` points of x, z.
 * @param {number} [capacity]
 * @returns {{points: Float32Array, count: number, length: number}}
 */
export function createRoute(capacity = 2048) {
  return { points: new Float32Array(capacity * 2), count: 0, length: 0 };
}

/**
 * Builds a router over a road graph.
 * @param {{nodes: Array<{id: number, x: number, z: number}>,
 *   segments: Array<{a: number, b: number, points: ArrayLike<number>, length?: number}>}} roads
 *   plan.roads.
 */
export function createRoadRouter(roads) {
  const nodes = roads.nodes;
  const segments = roads.segments;
  const nodeCount = nodes.length;
  const segmentCount = segments.length;
  const nodeIndex = new Map();
  for (let i = 0; i < nodeCount; i += 1) nodeIndex.set(nodes[i].id, i);

  // Each segment's ends (node indices) and the distance along it at each of its points.
  const endA = new Int32Array(segmentCount);
  const endB = new Int32Array(segmentCount);
  const firstPoint = new Int32Array(segmentCount + 1);
  for (let s = 0; s < segmentCount; s += 1) firstPoint[s + 1] = firstPoint[s] + (segments[s].points.length >> 1);
  const along = new Float64Array(firstPoint[segmentCount]);
  const segmentLength = new Float64Array(segmentCount);
  const degree = new Int32Array(nodeCount + 1);
  for (let s = 0; s < segmentCount; s += 1) {
    const segment = segments[s];
    endA[s] = nodeIndex.get(segment.a) ?? -1;
    endB[s] = nodeIndex.get(segment.b) ?? -1;
    const p = segment.points;
    const base = firstPoint[s];
    let total = 0;
    along[base] = 0;
    for (let k = 1; k < p.length >> 1; k += 1) {
      total += Math.hypot(p[k * 2] - p[k * 2 - 2], p[k * 2 + 1] - p[k * 2 - 1]);
      along[base + k] = total;
    }
    segmentLength[s] = total;
    if (endA[s] >= 0 && endB[s] >= 0) { degree[endA[s] + 1] += 1; degree[endB[s] + 1] += 1; }
  }
  // Adjacency in compressed rows: the segments that leave each node.
  for (let i = 0; i < nodeCount; i += 1) degree[i + 1] += degree[i];
  const leaving = new Int32Array(degree[nodeCount]);
  const fill = degree.slice(0, nodeCount);
  for (let s = 0; s < segmentCount; s += 1) {
    if (endA[s] < 0 || endB[s] < 0) continue;
    leaving[fill[endA[s]]++] = s;
    leaving[fill[endB[s]]++] = s;
  }

  // Search state, reused by every query.
  const cost = new Float64Array(nodeCount);
  const score = new Float64Array(nodeCount);
  const viaSegment = new Int32Array(nodeCount);
  const previous = new Int32Array(nodeCount);
  const state = new Uint8Array(nodeCount);        // 0 unseen, 1 open, 2 closed
  const open = new Int32Array(nodeCount);
  const chain = new Int32Array(nodeCount);
  const snapFrom = { segment: -1, along: 0, x: 0, z: 0 };
  const snapTo = { segment: -1, along: 0, x: 0, z: 0 };

  /** The nearest point of any road to (x, z), into `out`. */
  function snap(x, z, out) {
    let best = Infinity;
    out.segment = -1;
    for (let s = 0; s < segmentCount; s += 1) {
      const p = segments[s].points;
      const count = p.length >> 1;
      for (let k = 0; k < count - 1; k += 1) {
        const ax = p[k * 2], az = p[k * 2 + 1];
        const dx = p[k * 2 + 2] - ax, dz = p[k * 2 + 3] - az;
        const lengthSq = dx * dx + dz * dz;
        let t = lengthSq > 0 ? ((x - ax) * dx + (z - az) * dz) / lengthSq : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ax + dx * t, pz = az + dz * t;
        const d = (px - x) * (px - x) + (pz - z) * (pz - z);
        if (d < best) {
          best = d;
          out.segment = s;
          out.x = px; out.z = pz;
          const base = firstPoint[s] + k;
          out.along = along[base] + (along[base + 1] - along[base]) * t;
        }
      }
    }
    return out.segment >= 0;
  }

  function push(route, x, z) {
    if (route.count * 2 >= route.points.length) return;
    const i = route.count * 2;
    if (route.count > 0) {
      const lx = route.points[i - 2], lz = route.points[i - 1];
      const step = Math.hypot(x - lx, z - lz);
      if (step < 0.05) return;
      route.length += step;
    }
    route.points[i] = x;
    route.points[i + 1] = z;
    route.count += 1;
  }

  /** Writes the points of segment s strictly between distances `from` and `to` along it. */
  function pushAlong(route, s, from, to) {
    const p = segments[s].points;
    const base = firstPoint[s];
    const count = p.length >> 1;
    if (to >= from) {
      for (let k = 0; k < count; k += 1) if (along[base + k] > from && along[base + k] < to) push(route, p[k * 2], p[k * 2 + 1]);
    } else {
      for (let k = count - 1; k >= 0; k -= 1) if (along[base + k] < from && along[base + k] > to) push(route, p[k * 2], p[k * 2 + 1]);
    }
  }

  function openNode(n, g, segment, from, goalX, goalZ, openCount) {
    if (state[n] === 2 || (state[n] === 1 && cost[n] <= g)) return openCount;
    cost[n] = g;
    score[n] = g + Math.hypot(nodes[n].x - goalX, nodes[n].z - goalZ);
    viaSegment[n] = segment;
    previous[n] = from;
    if (state[n] !== 1) { state[n] = 1; open[openCount] = n; return openCount + 1; }
    return openCount;
  }

  return {
    /** Number of intersections in the graph. */
    nodeCount,
    /**
     * The shortest way along the roads from (fromX, fromZ) to (toX, toZ), written into `route`
     * (start and target included). Gives false (and an empty route) when no road joins them.
     * @param {number} fromX @param {number} fromZ @param {number} toX @param {number} toZ
     * @param {{points: Float32Array, count: number, length: number}} route
     */
    route(fromX, fromZ, toX, toZ, route) {
      route.count = 0;
      route.length = 0;
      if (!snap(fromX, fromZ, snapFrom) || !snap(toX, toZ, snapTo)) return false;
      const sp = snapFrom.segment, sq = snapTo.segment;
      push(route, fromX, fromZ);
      push(route, snapFrom.x, snapFrom.z);
      if (sp === sq) {
        pushAlong(route, sp, snapFrom.along, snapTo.along);
        push(route, snapTo.x, snapTo.z);
        push(route, toX, toZ);
        return true;
      }
      state.fill(0);
      let openCount = 0;
      openCount = openNode(endA[sp], snapFrom.along, -1, -1, snapTo.x, snapTo.z, openCount);
      openCount = openNode(endB[sp], segmentLength[sp] - snapFrom.along, -1, -1, snapTo.x, snapTo.z, openCount);
      const goalA = endA[sq], goalB = endB[sq];
      let bestTotal = Infinity;
      let bestEnd = -1;
      while (openCount > 0) {
        let pick = 0;
        for (let i = 1; i < openCount; i += 1) if (score[open[i]] < score[open[pick]]) pick = i;
        const n = open[pick];
        if (score[n] >= bestTotal) break;
        open[pick] = open[--openCount];
        state[n] = 2;
        if (n === goalA && cost[n] + snapTo.along < bestTotal) { bestTotal = cost[n] + snapTo.along; bestEnd = n; }
        if (n === goalB && cost[n] + segmentLength[sq] - snapTo.along < bestTotal) {
          bestTotal = cost[n] + segmentLength[sq] - snapTo.along; bestEnd = n;
        }
        for (let e = degree[n]; e < degree[n + 1]; e += 1) {
          const s = leaving[e];
          const other = endA[s] === n ? endB[s] : endA[s];
          openCount = openNode(other, cost[n] + segmentLength[s], s, n, snapTo.x, snapTo.z, openCount);
        }
      }
      if (bestEnd < 0) { route.count = 0; route.length = 0; return false; }
      // The intersections from the start to bestEnd, then the segments between them in order.
      let length = 0;
      for (let n = bestEnd; n >= 0; n = previous[n]) chain[length++] = n;
      const firstNode = chain[length - 1];
      pushAlong(route, sp, snapFrom.along, firstNode === endA[sp] ? -1 : segmentLength[sp] + 1);
      for (let i = length - 1; i >= 0; i -= 1) {
        const n = chain[i];
        if (i < length - 1) {
          const s = viaSegment[n];
          pushAlong(route, s, endA[s] === n ? segmentLength[s] + 1 : -1, endA[s] === n ? -1 : segmentLength[s] + 1);
        }
        push(route, nodes[n].x, nodes[n].z);
      }
      pushAlong(route, sq, bestEnd === endA[sq] ? -1 : segmentLength[sq] + 1, snapTo.along);
      push(route, snapTo.x, snapTo.z);
      push(route, toX, toZ);
      return true;
    },
  };
}
