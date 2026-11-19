// Getting into and out of a vehicle as one timed motion between two anchors: the door anchor (on
// the ground beside the door, facing it) and the seat anchor (the seated hip joints, facing
// forward). Entering: turn to the door, reach for the handle, pull the door open while stepping
// back with it, step round it into the doorway ducking under the roof, sit down and swing in, reach
// out and pull the door shut. Optionally (a carjack) both hands reach in and haul the occupant out
// before stepping in. Leaving: push the door open from inside, swing out and stand up in the
// doorway, step clear and push the door shut. Dragged out: yanked from the seat to the doorway and
// thrown onto the ground beside the car. Everything is computed in world space from the anchors'
// matrixWorld (so it follows a vehicle that moves a little) and written into the transit object:
// where the person's root stands and faces, how far the door is open (0..1, for the fleet's
// setDoorOpen), the seated weight, the duck under the roof, and where the busy hand goes. The
// controller (locomotionController.js) turns that into a pose; any vehicle with the two anchors
// works, any door side (the door's hinge is taken at its front edge).
import { smoothStep } from '../skeleton/quaternionMath.js';

/** The door's widest opening, radians (the fleet's setDoorOpen amount 1). */
export const DOOR_OPEN_ANGLE = 1.1;
/**
 * The typical door the hands find, metres, measured from the door anchor: the anchor stands
 * standOff out from the body side; the hinge is hingeAhead in front of it; the outer handle at
 * handleReach from the hinge along the door, the inner pull at innerReach; their heights above the
 * ground.
 */
export const DOOR_SHAPE = Object.freeze({
  standOff: 0.55, hingeAhead: 0.6, handleReach: 0.92, innerReach: 0.55, handleHeight: 1.0, innerHeight: 0.85,
});

const P = Object.freeze({ start: 0, D: 1, B: 2, W: 3, S: 4, X: 5, F: 6 });
const Y = Object.freeze({ start: 0, in: 1, open: 2, seat: 3, out: 4 });

function seg(stage, seconds, path, yaw, o = {}) {
  return Object.freeze({
    stage, seconds, path: path.map((k) => P[k]), yaw: [Y[yaw[0]], Y[yaw[yaw.length - 1]]], seat: o.seat ?? [0, 0, 0, 1],
    door: o.door ?? [0, 0, 0], hand: o.hand ?? null, grip: o.grip ?? 'handle', w: o.w ?? [0, 0, 0],
    duck: o.duck ?? 0, fall: Boolean(o.fall),
  });
}

// Points: start (where the transit began), D door anchor, B stepped back while the door swings,
// W in the doorway, S seat anchor, X clear of the door after leaving, F on the ground when thrown.
// Hands: 'outer' (facing the car: the hand towards its rear, at the outer handle), 'door' (seated:
// the hand on the door's side, at the inner pull), 'car' (standing beside it: the hand towards the
// car), 'both' (a carjack: both hands into the cabin).
const OPEN = seg('open', 0.6, ['D', 'B'], ['in', 'open'], { door: [0, 0.6, 1], hand: 'outer', w: [1, 1, 1] });
const CLOSE_INSIDE = seg('close', 0.7, ['S'], ['seat'], { seat: [1, 1, 0, 1], door: [1, 0.45, 0], hand: 'door', grip: 'inner', w: [0, 1, 0] });
/** The segments of each transit: stage name, seconds, path, yaw keys, weights. */
export const TRANSIT_SEGMENTS = Object.freeze({
  enter: Object.freeze([
    seg('turn', 0.35, ['start', 'D'], ['start', 'in'], { hand: 'outer', w: [0, 0.4, 0.7] }),
    seg('reach', 0.3, ['D'], ['in'], { hand: 'outer', w: [0.7, 1, 1] }),
    OPEN,
    seg('step_in', 1.0, ['B', 'W', 'S'], ['open', 'seat'], { seat: [0, 1, 0.2, 0.95], door: [1, 1, 1], hand: 'outer', w: [1, 0, 0], duck: 1 }),
    CLOSE_INSIDE,
  ]),
  jack: Object.freeze([
    seg('turn', 0.3, ['start', 'D'], ['start', 'in'], { hand: 'outer', w: [0, 0.5, 0.8] }),
    seg('reach', 0.2, ['D'], ['in'], { hand: 'outer', w: [0.8, 1, 1] }),
    seg('open', 0.45, ['D', 'B'], ['in', 'open'], { door: [0, 0.7, 1], hand: 'outer', w: [1, 1, 1] }),
    seg('pull', 1.0, ['B', 'W'], ['open', 'in'], { door: [1, 1, 1], hand: 'both', grip: 'victim', w: [0, 1, 0], duck: 0.6 }),
    seg('step_in', 0.9, ['W', 'W', 'S'], ['in', 'seat'], { seat: [0, 1, 0.15, 0.95], door: [1, 1, 1], duck: 1 }),
    CLOSE_INSIDE,
  ]),
  exit: Object.freeze([
    seg('open', 0.8, ['S'], ['seat'], { seat: [1, 1, 0, 1], door: [0, 0.05, 1], hand: 'door', grip: 'inner', w: [0, 1, 0] }),
    seg('step_out', 1.1, ['S', 'W'], ['seat', 'out'], { seat: [1, 0, 0.05, 0.85], door: [1, 1, 1], duck: 1 }),
    seg('close', 0.7, ['W', 'X'], ['out', 'seat'], { door: [1, 0.9, 0], hand: 'car', w: [0, 1, 0] }),
  ]),
  dragged: Object.freeze([
    seg('pulled', 0.45, ['S', 'W'], ['seat', 'in'], { seat: [1, 0, 0, 1], door: [1, 1, 1], duck: 0.7 }),
    seg('thrown', 0.9, ['W', 'F'], ['in', 'in'], { door: [1, 1, 1], fall: true }),
  ]),
});

/** Seconds of each whole transit. */
export const TRANSIT_SECONDS = Object.freeze(Object.fromEntries(Object.entries(TRANSIT_SEGMENTS)
  .map(([kind, list]) => [kind, list.reduce((sum, s) => sum + s.seconds, 0)])));

/**
 * The state of one person's transit, reused for every one. Read x, y, z, yaw (the root), door,
 * seatWeight, duck, fall (-1 or the fall's progress 0..1), hand ('left' | 'right' | 'both' | null),
 * handWeight and hand (world) targets handL / handR.
 */
export function createVehicleTransit() {
  return {
    kind: null, stage: null, index: 0, age: 0, total: 0, u: 0,
    points: new Float64Array(21), yaws: new Float64Array(5), fx: 0, fz: -1, ox: -1, oz: 0, ground: 0, seatY: 0,
    x: 0, y: 0, z: 0, yaw: 0, door: 0, seatWeight: 0, duck: 0, fall: -1,
    hand: null, handWeight: 0, handL: new Float64Array(3), handR: new Float64Array(3),
  };
}

function refresh(node) {
  if (typeof node.updateWorldMatrix === 'function') node.updateWorldMatrix(true, false);
  return node.matrixWorld.elements;
}
const yawOf = (x, z) => Math.atan2(-x, -z);
function wrap(a) {
  a %= Math.PI * 2;
  return a > Math.PI ? a - Math.PI * 2 : a < -Math.PI ? a + Math.PI * 2 : a;
}

/**
 * Reads the door and seat anchors (any objects with matrixWorld.elements) into the transit's
 * points and yaws. Called every frame by the controller, so a vehicle that drifts is followed.
 */
export function readTransitAnchors(tr, door, seat) {
  const d = refresh(door), s = refresh(seat), pt = tr.points;
  let fx = -s[8], fz = -s[10], n = Math.hypot(fx, fz);
  if (n < 1e-6) { fx = 0; fz = -1; n = 1; }
  fx /= n; fz /= n;
  let ox = d[12] - s[12], oz = d[14] - s[14];
  const along = ox * fx + oz * fz;
  ox -= along * fx; oz -= along * fz;
  n = Math.hypot(ox, oz);
  if (n < 1e-6) { ox = fz; oz = -fx; n = 1; }
  ox /= n; oz /= n;
  tr.fx = fx; tr.fz = fz; tr.ox = ox; tr.oz = oz; tr.ground = d[13]; tr.seatY = s[13];
  const put = (i, f, o) => { pt[i * 3] = d[12] + fx * f + ox * o; pt[i * 3 + 1] = d[13]; pt[i * 3 + 2] = d[14] + fz * f + oz * o; };
  put(P.D, 0, 0); put(P.B, -0.5, 0.12); put(P.W, 0.05, -0.12); put(P.X, -0.35, 0.3); put(P.F, -0.15, 0.55);
  pt[P.S * 3] = s[12]; pt[P.S * 3 + 1] = s[13]; pt[P.S * 3 + 2] = s[14];
  const y = tr.yaws;
  y[Y.in] = yawOf(-ox, -oz);
  y[Y.open] = yawOf(0.8 * fx - 0.6 * ox, 0.8 * fz - 0.6 * oz);
  y[Y.seat] = yawOf(fx, fz);
  y[Y.out] = yawOf(0.6 * fx + 0.8 * ox, 0.6 * fz + 0.8 * oz);
}

/** Starts a transit of `kind` (a key of TRANSIT_SEGMENTS) from the person's root and yaw. */
export function beginTransit(tr, kind, x, z, yaw) {
  tr.kind = kind; tr.index = 0; tr.age = 0; tr.u = 0; tr.total = TRANSIT_SECONDS[kind];
  tr.stage = TRANSIT_SEGMENTS[kind][0].stage;
  tr.points[0] = x; tr.points[2] = z; tr.yaws[0] = yaw;
}

/**
 * Advances the transit by dt and evaluates it. Returns 1 when a new stage began, 2 when the
 * transit finished (tr.kind is then still set; the caller clears it), else 0.
 */
export function stepTransit(tr, dt) {
  const list = TRANSIT_SEGMENTS[tr.kind];
  tr.age += dt;
  let result = 0, start = 0;
  for (let i = 0; i < tr.index; i += 1) start += list[i].seconds;
  while (tr.index < list.length - 1 && tr.age >= start + list[tr.index].seconds) {
    start += list[tr.index].seconds;
    tr.index += 1; result = 1;
  }
  const s = list[tr.index];
  tr.u = Math.min(1, Math.max(0, (tr.age - start) / s.seconds));
  tr.stage = s.stage;
  evaluate(tr, s, tr.u);
  return tr.age >= tr.total ? 2 : result;
}

const three = (a, b, c, u) => (u < 0.5 ? a + (b - a) * smoothStep(0, 0.5, u) : b + (c - b) * smoothStep(0.5, 1, u));

function evaluate(tr, s, u) {
  const pt = tr.points, path = s.path;
  let a = path[0], b = path[path.length > 1 ? 1 : 0], k = smoothStep(0, 1, u);
  if (path.length === 3) {
    if (u < 0.45) k = smoothStep(0, 0.45, u);
    else { a = path[1]; b = path[2]; k = smoothStep(0.45, 1, u); }
  }
  tr.x = pt[a * 3] + (pt[b * 3] - pt[a * 3]) * k;
  tr.z = pt[a * 3 + 2] + (pt[b * 3 + 2] - pt[a * 3 + 2]) * k;
  const y0 = tr.yaws[s.yaw[0]], y1 = tr.yaws[s.yaw[1]];
  tr.yaw = wrap(y0 + wrap(y1 - y0) * smoothStep(0, 1, u));
  const seat = s.seat;
  tr.seatWeight = seat[0] + (seat[1] - seat[0]) * smoothStep(seat[2], seat[3], u);
  tr.y = tr.ground + (tr.seatY - tr.ground) * tr.seatWeight;
  tr.door = Math.max(0, Math.min(1, three(s.door[0], s.door[1], s.door[2], u)));
  tr.duck = s.duck * Math.sin(Math.PI * u);
  tr.fall = s.fall ? u : -1;
  tr.handWeight = s.hand ? Math.max(0, Math.min(1, three(s.w[0], s.w[1], s.w[2], u))) : 0;
  tr.hand = null;
  if (!s.hand) return;
  // Which hand: the person's right in world is (cos yaw, -sin yaw).
  const rx = Math.cos(tr.yaw), rz = -Math.sin(tr.yaw), fx = tr.fx, fz = tr.fz, ox = tr.ox, oz = tr.oz;
  if (s.hand === 'both') tr.hand = 'both';
  else if (s.hand === 'outer') tr.hand = -(rx * fx + rz * fz) > 0 ? 'right' : 'left';
  else if (s.hand === 'door') tr.hand = rx * ox + rz * oz > 0 ? 'right' : 'left';
  else tr.hand = -(rx * ox + rz * oz) > 0 ? 'right' : 'left';
  const D = P.D * 3, theta = tr.door * DOOR_OPEN_ANGLE, c = Math.cos(theta), sn = Math.sin(theta);
  const hx = pt[D] + fx * DOOR_SHAPE.hingeAhead - ox * DOOR_SHAPE.standOff;
  const hz = pt[D + 2] + fz * DOOR_SHAPE.hingeAhead - oz * DOOR_SHAPE.standOff;
  const out = tr.hand === 'left' ? tr.handL : tr.handR;
  if (s.grip === 'victim') { // the occupant's near shoulder and collar, then hauled back to the chest
    const S = P.S * 3, pull = smoothStep(0.5, 1, u);
    for (const [hand, side] of [[tr.handL, -1], [tr.handR, 1]]) {
      const vx = pt[S] + ox * 0.2 + fx * 0.12 * side * (rx * fx + rz * fz > 0 ? 1 : -1), vy = tr.seatY + 0.45, vz = pt[S + 2] + oz * 0.2 + fz * 0.12 * side * (rx * fx + rz * fz > 0 ? 1 : -1);
      const cx = tr.x - Math.sin(tr.yaw) * 0.32 + rx * 0.12 * side, cy = tr.ground + 1.15, cz = tr.z - Math.cos(tr.yaw) * 0.32 + rz * 0.12 * side;
      hand[0] = vx + (cx - vx) * pull; hand[1] = vy + (cy - vy) * pull; hand[2] = vz + (cz - vz) * pull;
    }
    return;
  }
  const reach = s.grip === 'inner' ? DOOR_SHAPE.innerReach : DOOR_SHAPE.handleReach;
  out[0] = hx + reach * (-c * fx + sn * ox);
  out[1] = tr.ground + (s.grip === 'inner' ? DOOR_SHAPE.innerHeight : DOOR_SHAPE.handleHeight);
  out[2] = hz + reach * (-c * fz + sn * oz);
}

/**
 * Steers a walking person towards a point (the door anchor): writes input.moveX / moveZ at
 * `speed` (m/s), slowing within 0.8 m, and returns the distance left. Call enterVehicle when it
 * is under about 0.2 m; the transit's first stage blends the last centimetres and the turn.
 */
export function steerTo(input, fromX, fromZ, toX, toZ, speed = 1.4) {
  const dx = toX - fromX, dz = toZ - fromZ, dist = Math.hypot(dx, dz);
  const v = dist > 1e-4 ? speed * Math.min(1, dist / 0.8) / dist : 0;
  input.moveX = dx * v; input.moveZ = dz * v;
  return dist;
}
