// Designs every intersection of the road graph: the arms in order round the node, how far each
// road is trimmed back to make room for the junction, who controls it (signals where avenues
// cross, stop signs on side streets, nothing on a mere bend), the signal phases and the
// crosswalks.
//
//   designIntersections(graph);
//   node.control            // 'signals' | 'stop' | 'none' | 'cul_de_sac' | 'exit'
//   node.arms[0]            // {segment, atStart, dx, dz, angle, trim, phase, mustStop}
//   node.signal.phases      // [{arms: [0, 2], green: 24, yellow: 3}, ...]

/**
 * Fills `arms`, `control`, `radius`, `signal` and `crosswalks` on every node and `trimA` and
 * `trimB` on every segment.
 * @param {{nodes: import('./roadGraphAssembly.js').RoadNode[], segments: import('./roadGraphAssembly.js').RoadSegment[]}} graph
 */
export function designIntersections(graph) {
  for (const node of graph.nodes) {
    const arms = node.segments.map((id) => armOf(graph.segments[id], node));
    arms.sort((p, q) => p.angle - q.angle);
    node.arms = arms;
    node.crosswalks = [];
    const degree = arms.length;
    if (degree === 1) {
      node.control = node.exit ? 'exit' : 'cul_de_sac';
      node.radius = node.exit ? 0 : 9;
      continue;
    }
    if (degree === 2) {
      node.control = 'none';
      continue;
    }
    for (const arm of arms) {
      let trim = 0;
      for (const other of arms) {
        if (other === arm) continue;
        const sine = Math.abs(Math.sin(other.angle - arm.angle));
        if (sine < 0.35) continue;
        const corridor = Math.max(graph.segments[other.segment].corridorLeft, graph.segments[other.segment].corridorRight);
        trim = Math.max(trim, Math.min(34, corridor / sine + 3));
      }
      const segment = graph.segments[arm.segment];
      arm.trim = Math.min(trim, segment.length * 0.45);
      if (arm.atStart) segment.trimA = arm.trim;
      else segment.trimB = arm.trim;
      node.radius = Math.max(node.radius, arm.trim);
    }
    const major = arms.filter((arm) => arm.major).length;
    const top = arms.reduce((best, arm) => (arm.priority > best.priority ? arm : best), arms[0]);
    const through = arms.filter((arm) => Math.abs(Math.cos(arm.angle - top.angle)) > 0.7);
    const across = arms.filter((arm) => !through.includes(arm));
    if (across.length > 0 && (major >= 3 || (major >= 2 && degree >= 4))) {
      node.control = 'signals';
      const phases = [
        { arms: through.map((arm) => arms.indexOf(arm)), green: 24, yellow: 3 },
        { arms: across.map((arm) => arms.indexOf(arm)), green: across.some((arm) => arm.major) ? 20 : 12, yellow: 3 },
      ];
      const allRed = 2;
      const cycle = phases.reduce((sum, phase) => sum + phase.green + phase.yellow + allRed, 0);
      node.signal = { phases, allRed, cycle, offset: (node.id * 7) % cycle };
      through.forEach((arm) => (arm.phase = 0));
      across.forEach((arm) => (arm.phase = 1));
    } else {
      node.control = 'stop';
      // The lesser roads stop; the road that runs through keeps its right of way.
      for (const arm of arms) arm.mustStop = across.length === 0 ? arm.priority < top.priority : !through.includes(arm);
    }
    for (const arm of arms) {
      const segment = graph.segments[arm.segment];
      if (segment.sidewalkLeft + segment.sidewalkRight === 0) continue;
      const reach = Math.max(2, arm.trim - 2.5);
      const cx = node.x + arm.dx * reach;
      const cz = node.z + arm.dz * reach;
      node.crosswalks.push({
        arm: arms.indexOf(arm), segment: arm.segment, width: 3,
        ax: cx + arm.dz * segment.halfWidth, az: cz - arm.dx * segment.halfWidth,
        bx: cx - arm.dz * segment.halfWidth, bz: cz + arm.dx * segment.halfWidth,
      });
    }
  }
}

/**
 * @typedef {Object} RoadArm
 * @property {number} segment Segment id.
 * @property {boolean} atStart Whether the node is the segment's first point.
 * @property {number} dx Unit direction leaving the node along the segment.
 * @property {number} dz
 * @property {number} angle atan2(dz, dx); the arms are sorted by it.
 * @property {number} trim Metres of the segment taken up by the junction.
 * @property {number} priority The road's rank.
 * @property {boolean} major An avenue or the highway.
 * @property {number} phase Index of the signal phase that gives this arm green (-1 without signals).
 * @property {boolean} mustStop Whether traffic entering from this arm has a stop sign.
 */

function armOf(segment, node) {
  const atStart = segment.a === node.id;
  const p = segment.points;
  const last = p.length - 2;
  // Look a little way along the road, so a first short piece does not decide the direction.
  const k = Math.min(2, p.length / 2 - 1) * 2;
  const dx = atStart ? p[k] - p[0] : p[last - k] - p[last];
  const dz = atStart ? p[k + 1] - p[1] : p[last - k + 1] - p[last + 1];
  const length = Math.hypot(dx, dz) || 1;
  return {
    segment: segment.id, atStart, dx: dx / length, dz: dz / length, angle: Math.atan2(dz, dx), trim: 0,
    priority: segment.priority, major: segment.roadClass === 'avenue' || segment.roadClass === 'highway', phase: -1, mustStop: false,
  };
}
