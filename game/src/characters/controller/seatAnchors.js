// Reads a vehicle's seat anchors into the seated person's own frame each frame: the steering
// wheel's centre, column axis and the rim's 12 o'clock (which turns with the wheel, so the hands
// follow it, up to WHEEL_FOLLOW_LIMIT either way before they slide on the rim), and a motorcycle's
// grips and foot pegs. It reads only matrixWorld.elements of the nodes and of the person's
// instance (column-major 4x4, as three.js keeps them), so it runs on plain objects in Node tests.
import { WHEEL_FOLLOW_LIMIT } from '../motion/seatedPose.js';

const d = new Float32Array(3);

/** Brings a node's world matrix up to date when it is a three.js object. */
function refresh(node) {
  if (typeof node.updateWorldMatrix === 'function') node.updateWorldMatrix(true, false);
  return node.matrixWorld.elements;
}

/** World point or direction into the frame of the matrix m (uniform scale): out[o..o+2]. */
function toLocal(out, o, m, x, y, z, point) {
  if (point) { x -= m[12]; y -= m[13]; z -= m[14]; }
  for (let i = 0; i < 3; i += 1) {
    const c = i * 4;
    out[o + i] = (m[c] * x + m[c + 1] * y + m[c + 2] * z) / (m[c] * m[c] + m[c + 1] * m[c + 1] + m[c + 2] * m[c + 2]);
  }
}

function normalize(out, o) {
  const n = 1 / Math.max(1e-9, Math.hypot(out[o], out[o + 1], out[o + 2]));
  out[o] *= n; out[o + 1] *= n; out[o + 2] *= n;
}

/**
 * Takes the rim's 12 o'clock in the steering wheel node's own frame: world up, flattened onto the
 * rim's plane (the node's local +Y is the column axis). Call while the wheel is straight.
 * @param {{ wheel: object, wheelUp: Float32Array }} nodes
 */
export function takeWheelReference(nodes) {
  const m = refresh(nodes.wheel);
  toLocal(nodes.wheelUp, 0, m, 0, 1, 0, false);
  nodes.wheelUp[1] = 0;
  if (Math.hypot(nodes.wheelUp[0], nodes.wheelUp[2]) < 1e-6) nodes.wheelUp[2] = -1;
  normalize(nodes.wheelUp, 0);
}

/**
 * Fills a SeatInput's wheel, grips and feet (with their `known` flags) from the anchor nodes.
 * @param {import('../motion/seatedPose.js').SeatInput} seat
 * @param {{ wheel: object | null, gripL: object | null, gripR: object | null, footL: object | null,
 *   footR: object | null, wheelUp: Float32Array, radius: number }} nodes
 * @param {object} instance The person (its matrixWorld is refreshed here).
 */
export function readSeatAnchors(seat, nodes, instance) {
  seat.wheelKnown = false; seat.gripsKnown = false; seat.feetKnown = false;
  if (!nodes.wheel && !nodes.gripL && !nodes.footL) return;
  if (!instance.matrixWorld) return;
  const me = refresh(instance), w = seat.wheel;
  if (nodes.wheel) {
    const n = refresh(nodes.wheel);
    toLocal(w, 0, me, n[12], n[13], n[14], true);
    toLocal(w, 3, me, n[4], n[5], n[6], false);
    normalize(w, 3);
    const u = nodes.wheelUp;
    toLocal(w, 6, me, n[0] * u[0] + n[8] * u[2], n[1] * u[0] + n[9] * u[2], n[2] * u[0] + n[10] * u[2], false);
    // The wheel's turn from straight (character up on the rim's plane), held to the follow limit.
    const ax = w[3], ay = w[4], az = w[5];
    let ux = -ay * ax, uy = 1 - ay * ay, uz = -ay * az; // up minus its part along the axis
    const un = 1 / Math.max(1e-6, Math.hypot(ux, uy, uz));
    ux *= un; uy *= un; uz *= un;
    const sx = ay * uz - az * uy, sy = az * ux - ax * uz, sz = ax * uy - ay * ux; // axis x up
    let angle = Math.atan2(w[6] * sx + w[7] * sy + w[8] * sz, w[6] * ux + w[7] * uy + w[8] * uz);
    angle = Math.max(-WHEEL_FOLLOW_LIMIT, Math.min(WHEEL_FOLLOW_LIMIT, angle));
    const c = Math.cos(angle), s = Math.sin(angle);
    w[6] = c * ux + s * sx; w[7] = c * uy + s * sy; w[8] = c * uz + s * sz;
    w[9] = nodes.radius;
    seat.wheelKnown = true;
  }
  if (nodes.gripL && nodes.gripR) {
    const l = refresh(nodes.gripL), r = refresh(nodes.gripR);
    toLocal(seat.grips, 0, me, l[12], l[13], l[14], true);
    toLocal(seat.grips, 3, me, r[12], r[13], r[14], true);
    seat.gripsKnown = true;
  }
  if (nodes.footL && nodes.footR) {
    const l = refresh(nodes.footL), r = refresh(nodes.footR);
    toLocal(d, 0, me, l[12], l[13], l[14], true);
    seat.feet[0] = d[0]; seat.feet[1] = d[1]; seat.feet[2] = d[2];
    toLocal(seat.feet, 3, me, r[12], r[13], r[14], true);
    seat.feetKnown = true;
  }
}
