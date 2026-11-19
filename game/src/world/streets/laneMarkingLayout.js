// Where the paint goes on Marazul's streets, as pure data in the frame of a road segment (s =
// metres right of the centre line, looking along the segment): the dashed lines between lanes
// running the same way, the double yellow line between opposing traffic (none on one-way
// streets, none where a raised median parts the carriageways), the solid edge lines along
// parking lanes and shoulders, and at a junction the stop bar and lane arrows of every approach
// that must stop. The lane centres are the plan's own (laneOffset), so the paint lies exactly
// under the traffic lanes of plan.lanes.
//
//   const lines = laneLinesOf(segment, section);           // [{ s, width, color, dash, period }]
//   const approach = approachOf(segment, node, atEnd);    // null or { from, to, lanes, signals }

import { laneOffset } from '../plan/roadSpecifications.js';

/** Width of an ordinary painted line, metres. */
export const LINE_WIDTH = 0.15;
/** Width of each of the two lines of a double yellow line, and their centre spacing. */
export const DOUBLE_LINE_WIDTH = 0.12;
export const DOUBLE_LINE_SPACING = 0.26;
/** Width of a stop bar, metres (measured along the road). */
export const STOP_BAR_WIDTH = 0.5;

/**
 * @typedef {Object} MarkingLine
 * @property {number} s Offset of the line's centre right of the segment's centre line.
 * @property {number} width Metres across.
 * @property {'white' | 'yellow'} color
 * @property {number} dash Metres painted in each period; 0 for a solid line.
 * @property {number} period Metres of one dash and its gap; 0 for a solid line.
 */

/**
 * The long lines painted along a segment.
 * @param {Object} segment A plan segment (carries its road specification).
 * @param {{paved: boolean, median: ?[number, number]}} section Its cross-section (roadCrossSection).
 * @returns {MarkingLine[]}
 */
export function laneLinesOf(segment, section) {
  const lines = [];
  const backward = segment.lanesBackward | 0;
  const forward = segment.lanesForward | 0;
  if (!section.paved || segment.roadClass === 'dirt' || backward + forward < 2) return lines;
  const laneWidth = segment.laneWidth;
  const median = segment.medianWidth || 0;
  const shoulder = segment.shoulder || 0;
  const period = segment.roadClass === 'highway' ? 12 : 9;
  const dashed = (s) => lines.push({ s, width: LINE_WIDTH, color: 'white', dash: 3, period });
  const solid = (s, color = 'white') => lines.push({ s, width: LINE_WIDTH, color, dash: 0, period: 0 });

  const left = -segment.halfWidth + shoulder + (segment.parkingLeft || 0);
  const centre = left + backward * laneWidth;
  const inner = centre + median;
  const right = inner + forward * laneWidth;
  for (let k = 1; k < backward; k += 1) dashed(left + k * laneWidth);
  if (backward > 0 && forward > 0 && !section.median) {
    const c = centre + median / 2;
    lines.push(
      { s: c - DOUBLE_LINE_SPACING / 2, width: DOUBLE_LINE_WIDTH, color: 'yellow', dash: 0, period: 0 },
      { s: c + DOUBLE_LINE_SPACING / 2, width: DOUBLE_LINE_WIDTH, color: 'yellow', dash: 0, period: 0 },
    );
  }
  for (let k = 1; k < forward; k += 1) dashed(inner + k * laneWidth);
  // Edge lines where a parking lane or a shoulder lies beyond the traffic lanes. On a one-way
  // street the left edge is yellow, as drivers expect.
  const oneWay = backward === 0 || forward === 0;
  if (shoulder + (segment.parkingLeft || 0) >= 0.5) solid(left + LINE_WIDTH / 2, oneWay ? 'yellow' : 'white');
  if (shoulder + (segment.parkingRight || 0) >= 0.5) solid(right - LINE_WIDTH / 2);
  return lines;
}

/**
 * The approach of a segment to one of its nodes, when traffic arriving there must stop (a
 * signalled junction, or a stop sign on this arm).
 * @param {Object} segment
 * @param {Object} node The plan node at that end.
 * @param {boolean} atEnd True for the segment's last point (node b), false for its first (node a).
 * @returns {?{from: number, to: number, signals: boolean, direction: 1 | -1,
 *   lanes: {s: number, index: number}[]}} Stop-bar span [from, to] and the arriving lanes'
 *   centres, all as offsets right of the segment's centre line.
 */
export function approachOf(segment, node, atEnd) {
  if (!node || segment.paved === false || segment.roadClass === 'dirt') return null;
  const direction = atEnd ? 1 : -1;
  const count = direction > 0 ? segment.lanesForward | 0 : segment.lanesBackward | 0;
  if (count === 0) return null;
  const signals = node.control === 'signals';
  if (!signals) {
    if (node.control !== 'stop') return null;
    const arm = (node.arms || []).find((candidate) => candidate.segment === segment.id && candidate.atStart === !atEnd);
    if (!arm || !arm.mustStop) return null;
  }
  const lanes = [];
  let from = Infinity;
  let to = -Infinity;
  const half = segment.laneWidth / 2;
  for (let index = 0; index < count; index += 1) {
    const s = direction * laneOffset(segment, direction, index);
    lanes.push({ s, index });
    from = Math.min(from, s - half);
    to = Math.max(to, s + half);
  }
  return { from, to, signals, direction, lanes };
}

/**
 * The arrow painted in a lane before a signalled stop line, from the plan lane's turns.
 * @param {?{successors: {turn: string}[]}} lane The plan lane (or null when unknown).
 * @returns {'straight' | 'left' | 'right'}
 */
export function arrowTurnOf(lane) {
  if (!lane || !lane.successors) return 'straight';
  let straight = false;
  let left = false;
  let right = false;
  for (const successor of lane.successors) {
    if (successor.turn === 'straight') straight = true;
    else if (successor.turn === 'left') left = true;
    else if (successor.turn === 'right') right = true;
  }
  if (straight || (left && right)) return 'straight';
  if (left) return 'left';
  return right ? 'right' : 'straight';
}

/**
 * The painted (on) parts of a dashed line between two distances along it.
 * @param {number} a0 Start, metres along the segment.
 * @param {number} a1 End, a1 > a0.
 * @param {number} dash Painted metres per period.
 * @param {number} period
 * @param {(from: number, to: number) => void} emit Called for each painted stretch.
 */
export function forEachDash(a0, a1, dash, period, emit) {
  if (!(period > 0)) {
    emit(a0, a1);
    return;
  }
  for (let k = Math.floor(a0 / period); k * period < a1; k += 1) {
    const from = Math.max(a0, k * period);
    const to = Math.min(a1, k * period + dash);
    if (to - from > 0.05) emit(from, to);
  }
}

/**
 * The road mesh's crown height at s: the parabola sampled at the section's long edges and
 * interpolated linearly between them, exactly as the carriageway mesh is built.
 * @param {{lateral: number[], halfWidth: number, crown: number}} section
 * @param {number} s
 * @param {(section: Object, s: number) => number} crownHeight
 * @returns {number}
 */
export function meshCrownAt(section, s, crownHeight) {
  const lateral = section.lateral;
  for (let k = 0; k < lateral.length - 1; k += 1) {
    if (s <= lateral[k + 1] || k === lateral.length - 2) {
      const a = lateral[k];
      const b = lateral[k + 1];
      const t = Math.min(1, Math.max(0, (s - a) / (b - a || 1)));
      return crownHeight(section, a) * (1 - t) + crownHeight(section, b) * t;
    }
  }
  return 0;
}
