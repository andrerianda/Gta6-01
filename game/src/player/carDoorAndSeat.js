// Where the lead gets in, sits and swings the door on one car of the fleet: the model's anchors
// (anchor_door_driver on the ground beside the driver's door, anchor_seat_driver at the seated
// hip joints) carried into the world by the car's drawn root, as the two anchor "nodes" the
// character run-time's vehicle transit reads (walker.enterVehicle / exitVehicle take any object
// with matrixWorld), the steering wheel the hands hold, and the driver's door. The door goes
// through the fleet's setDoorOpen(vehicleId, 'driver', amount) when the fleet has one; otherwise
// this file turns the near model's door_fl node about its hinge itself. A stand-in body without
// anchors gets points measured from the car's size. The walk to the door is planned round the
// model's box (wayRoundCar); useDoor switches to anchor_door_passenger, moveDoor puts the door
// point on the quay a boat is left onto.
import * as THREE from 'three';
import { findNode } from '../assets/nodes.js';

/** How far the driver's door swings when fully open without the fleet's doors, radians. */
export const DOOR_SWING = 1.05;

/**
 * The seat fits the cabin's headroom (shift 8, /tmp/marazul/player/window4.*): at the coupe's
 * anchor_seat_driver (0.36 m) the 1.86 m lead's crown stood 1.25 m up under a 1.26 m roof, so
 * the head hid in the roof and only the shoulders showed through the side window while driving.
 * The seated point drops until the crown (SEATED_CROWN over the seat anchor, measured) clears the
 * roof's top by HEADROOM, at most SEAT_DROP_MAX; a tall car (SUV, van) keeps its anchor.
 */
export const SEAT_FIT = Object.freeze({ crown: 0.89, headroom: 0.14, maxDrop: 0.12 });

/**
 * How far the seated point drops in a car whose roof top stands `roofHeight` over its root.
 * @param {number} seatHeight The seat anchor's height over the root, metres.
 * @param {number} roofHeight 0 when unknown (no drop).
 */
export function seatDrop(seatHeight, roofHeight) {
  if (!(roofHeight > 0)) return 0;
  const drop = seatHeight + SEAT_FIT.crown - (roofHeight - SEAT_FIT.headroom);
  return drop < 0 ? 0 : drop > SEAT_FIT.maxDrop ? SEAT_FIT.maxDrop : drop;
}

/** Metres the walk to a door keeps round the car's model box (the capsule's 0.3 and a little). */
export const FOOTPRINT_MARGIN = 0.42;
/** Corners of the footprint, in order round it: nose-left, tail-left, tail-right, nose-right. */
const CORNER_X = [-1, -1, 1, 1], CORNER_Z = [-1, 1, 1, -1];

/** Whether the segment a-b passes through the inside of the box |x| < hw, |z| < hl (edges excluded). */
function crossesBox(ax, az, bx, bz, hw, hl) {
  const w = hw - 0.02, l = hl - 0.02, dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  for (let axis = 0; axis < 2; axis += 1) {
    const a = axis ? az : ax, d = axis ? dz : dx, h = axis ? l : w;
    if (Math.abs(d) < 1e-9) { if (a <= -h || a >= h) return false; continue; }
    let ta = (-h - a) / d, tb = (h - a) / d;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 >= t1) return false;
  }
  return true;
}

/**
 * Shift 14 (a lead pressed against the car's side for 4 s, then given up): the next point of the
 * shortest walk to a door round the car's footprint, in the car's frame (x right, z to the
 * tail): the door's stand point when nothing of the car is in the way, else the footprint corner
 * that starts the shorter way round (corners stand `round` out, so the next leg shows before the
 * corner is reached). Re-planned every step, so a car that moves or a shove never strands the
 * lead on the wrong side. No allocation.
 * @param {{x: number, z: number}} out The waypoint (written).
 * @param {number} px The lead (car frame).
 * @param {number} pz
 * @param {number} tx The door's stand point (car frame, outside the footprint).
 * @param {number} tz
 * @param {number} hw Half width of the footprint, margin included.
 * @param {number} hl Half length, margin included.
 * @param {number} [round] How far out of the footprint the corners stand.
 * @returns {number} The length of the way, metres.
 */
export function wayRoundCar(out, px, pz, tx, tz, hw, hl, round = 0.2) {
  // A lead inside the margin band plans from the nearest edge (the capsule cannot be inside).
  if (Math.abs(px) < hw && Math.abs(pz) < hl) {
    if (hw - Math.abs(px) < hl - Math.abs(pz)) px = (px < 0 ? -1 : 1) * (hw + 0.01);
    else pz = (pz < 0 ? -1 : 1) * (hl + 0.01);
  }
  out.x = tx; out.z = tz;
  if (!crossesBox(px, pz, tx, tz, hw, hl)) return Math.hypot(tx - px, tz - pz);
  const cw = hw + round, cl = hl + round;
  let best = Infinity;
  for (let i = 0; i < 4; i += 1) {
    const cx = CORNER_X[i] * cw, cz = CORNER_Z[i] * cl;
    if (crossesBox(px, pz, cx, cz, hw, hl)) continue;
    for (let turn = -1; turn <= 1; turn += 2) {
      let length = Math.hypot(cx - px, cz - pz), j = i;
      for (let k = 0; k < 4; k += 1) {
        const jx = CORNER_X[j] * cw, jz = CORNER_Z[j] * cl;
        if (!crossesBox(jx, jz, tx, tz, hw, hl)) { length += Math.hypot(tx - jx, tz - jz); break; }
        const n = (j + turn + 4) % 4;
        length += Math.hypot(CORNER_X[n] * cw - jx, CORNER_Z[n] * cl - jz);
        j = n;
      }
      if (length < best) { best = length; out.x = cx; out.z = cz; }
    }
  }
  return best;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The top of a car's model over its root (0 when unknown), metres: the asset's own bounding box
 * (asset.bounds, from the build; the coupe 1.248). Shift 9: a Box3 of the drawn near level read
 * no drop in the game (window6: head 1.073 m over the road under a 1.25 m roof), since the live
 * level also holds merged and instanced pose carriers; the asset's box does not change.
 */
function roofHeightOf(rig) {
  const box = rig.asset && rig.asset.bounds;
  return box && typeof box.isEmpty === 'function' && !box.isEmpty() ? box.max.y : 0;
}
const swing = new THREE.Quaternion();
const rootQuaternion = new THREE.Quaternion();
const direction = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

/** Smooth 0..1 ease. */
export function easeInOut(amount) {
  const a = amount < 0 ? 0 : amount > 1 ? 1 : amount;
  return a * a * (3 - 2 * a);
}

/**
 * The yaw (three.js rotation.y) that looks along a world direction on the ground.
 * @param {number} x
 * @param {number} z
 */
export function yawAlong(x, z) {
  return Math.atan2(-x, -z);
}

/**
 * Reads the boarding points of a car.
 * @param {object | null} fleet The vehicle fleet (context.systems.find('vehicles')).
 * @param {{id: any, position: THREE.Vector3, heading?: number, radius?: number}} vehicle The car's entity.
 */
export function createCarDoorAndSeat(fleet, vehicle) {
  const record = fleet && typeof fleet.get === 'function' ? fleet.get(vehicle.id) : null;
  const rig = record && record.rig ? record.rig : null;
  const asset = rig ? rig.asset : null;
  const anchors = asset && asset.anchors ? asset.anchors : {};
  const seatAnchor = anchors.anchor_seat_driver || null;
  const doorAnchor = anchors.anchor_door_driver || null;
  // A boat has no driver's door: the lead steps aboard on the swim platform (anchor_board), never
  // from the fallback point beside the hull in the water (vehicle-system 11:20).
  const boardAnchor = doorAnchor ? null : anchors.anchor_board || null;
  const doorNode = rig && rig.near ? findNode(rig.near, 'door_fl') : null;
  // The shut pose is kept on the node: a door left hanging open must not become the new rest.
  if (doorNode && !doorNode.userData.shutQuaternion) doorNode.userData.shutQuaternion = doorNode.quaternion.clone();
  const halfWidth = Math.max(0.8, (vehicle.radius ?? 2.4) * 0.38);
  const seatLocal = seatAnchor ? seatAnchor.position.clone() : new THREE.Vector3(-0.36, 0.52, 0.1);
  seatLocal.y -= seatDrop(seatLocal.y, rig ? roofHeightOf(rig) : 0);
  const doorLocal = doorAnchor ? doorAnchor.position.clone()
    : boardAnchor ? boardAnchor.position.clone() : new THREE.Vector3(-halfWidth - 0.55, 0, -0.2);
  const doorHome = doorLocal.clone();
  // Shift 14: from the pavement side the lead may get in by the passenger door and slide across.
  const passengerDoor = doorAnchor && anchors.anchor_door_passenger ? anchors.anchor_door_passenger.position : null;
  let doorSide = 'driver';
  // The walk's footprint: the model's box (asset.bounds) and FOOTPRINT_MARGIN, never so wide that
  // the door's stand point falls inside it; a stand-in body uses its radius.
  const box = asset && asset.bounds && typeof asset.bounds.isEmpty === 'function' && !asset.bounds.isEmpty() ? asset.bounds : null;
  const footWidth = Math.min(Math.min(Math.abs(doorLocal.x), passengerDoor ? Math.abs(passengerDoor.x) : Infinity) - 0.06, (box ? Math.max(-box.min.x, box.max.x) : halfWidth) + FOOTPRINT_MARGIN);
  const footLength = (box ? Math.max(-box.min.z, box.max.z) : Math.max(2.0, (vehicle.radius ?? 2.4) * 0.92)) + FOOTPRINT_MARGIN;
  // Only the seat's yaw in the car is used, so an anchor's roll can never tip the body.
  const seatTurn = new THREE.Quaternion();
  if (seatAnchor && seatAnchor.direction) seatTurn.setFromAxisAngle(UP, yawAlong(seatAnchor.direction.x, seatAnchor.direction.z));
  const seatOffset = new THREE.Matrix4().compose(seatLocal, seatTurn, ONE);
  const doorOffset = new THREE.Matrix4().makeTranslation(doorLocal.x, doorLocal.y, doorLocal.z);
  const extras = asset && asset.extras ? asset.extras : {};
  const matrix = new THREE.Matrix4(), inverse = new THREE.Matrix4();
  let doorShown = -1;

  /** The car's world matrix (the drawn root, else its entity). */
  function rootMatrix(out) {
    if (rig && rig.root) {
      rig.root.updateWorldMatrix(true, false);
      return out.copy(rig.root.matrixWorld);
    }
    rootQuaternion.setFromAxisAngle(UP, vehicle.heading ?? 0);
    return out.compose(vehicle.position, rootQuaternion, ONE);
  }

  /** An anchor as the run-time reads it: matrixWorld refreshed from the car on every read. */
  function anchorNode(offset) {
    const node = {
      matrixWorld: new THREE.Matrix4(),
      updateWorldMatrix() { rootMatrix(node.matrixWorld).multiply(offset); },
    };
    node.updateWorldMatrix();
    return node;
  }

  return {
    rig,
    /** True when the lead boards over a boat's swim platform (no door, no walk round the hull). */
    fromBoard: Boolean(boardAnchor),
    /** The door and seat anchors for walker.enterVehicle / exitVehicle. */
    doorAnchor: anchorNode(doorOffset),
    seatAnchor: anchorNode(seatOffset),
    /** The steering wheel node (the hands follow it) and its rim radius. */
    steeringWheel: rig ? rig.steeringWheel ?? null : null,
    wheelRadius: extras.steering_wheel_radius || 0.185,
    /**
     * Where the lead walks to by the driver's door (ground, world) and the yaw that faces the car.
     * @param {THREE.Vector3} out
     * @returns {number} The yaw facing the door.
     */
    standPoint(out) {
      rootMatrix(matrix);
      rootQuaternion.setFromRotationMatrix(matrix);
      // At a door the lead faces the car's side; on a swim platform, the bow.
      direction.set(boardAnchor ? 0 : doorLocal.x > 0 ? -1 : 1, 0, boardAnchor ? -1 : 0).applyQuaternion(rootQuaternion);
      out.copy(doorLocal).applyMatrix4(matrix);
      return yawAlong(direction.x, direction.z);
    },
    /**
     * The seated hip point and the body's orientation in the seat (world).
     * @param {THREE.Vector3} outPosition
     * @param {THREE.Quaternion} outQuaternion
     */
    seatPose(outPosition, outQuaternion) {
      rootMatrix(matrix).multiply(seatOffset);
      matrix.decompose(outPosition, outQuaternion, direction);
    },
    /**
     * The next point of the walk from x, z (world) to the door round the car (wayRoundCar), world
     * and on the ground; returns the length of the whole way. A boat's swim platform is walked
     * to straight.
     * @param {THREE.Vector3} out
     * @param {number} x
     * @param {number} z
     */
    way(out, x, z) {
      rootMatrix(matrix);
      inverse.copy(matrix).invert();
      out.set(x, matrix.elements[13], z).applyMatrix4(inverse);
      const length = boardAnchor ? Math.hypot(doorLocal.x - out.x, doorLocal.z - out.z)
        : wayRoundCar(out, out.x, out.z, doorLocal.x, doorLocal.z, footWidth, footLength);
      if (boardAnchor) { out.x = doorLocal.x; out.z = doorLocal.z; }
      out.y = 0;
      out.applyMatrix4(matrix);
      return length;
    },
    /**
     * Moves the door anchor (the transit's door point) to a world point, held in the car's frame
     * so it follows a drifting boat: getting out of a boat onto the quay beside it. Without
     * arguments it goes back to the model's own anchor.
     * @param {number} [x]
     * @param {number} [z]
     */
    moveDoor(x, z) {
      if (x === undefined) doorLocal.copy(doorHome);
      else {
        rootMatrix(matrix);
        inverse.copy(matrix).invert();
        doorLocal.set(x, matrix.elements[13], z).applyMatrix4(inverse);
        doorLocal.y = doorHome.y;
      }
      doorOffset.makeTranslation(doorLocal.x, doorLocal.y, doorLocal.z);
    },
    /** Whether the model has a passenger door to get in by (and slide across to the wheel). */
    hasPassengerDoor: Boolean(passengerDoor),
    /** The door used from now on ('driver' | 'passenger'): its anchor, stand point and swing. */
    useDoor(side) {
      const passenger = side === 'passenger' && passengerDoor;
      doorSide = passenger ? 'passenger' : 'driver';
      doorLocal.copy(passenger ? passengerDoor : doorHome);
      doorOffset.makeTranslation(doorLocal.x, doorLocal.y, doorLocal.z);
      doorShown = -1;
    },
    /** The door in use ('driver' | 'passenger'). */
    get doorSide() { return doorSide; },
    /**
     * A world point in the car's frame (x right, z towards the tail), on the ground.
     * @param {THREE.Vector3} out
     */
    toCar(out, x, z) {
      rootMatrix(matrix);
      inverse.copy(matrix).invert();
      return out.set(x, matrix.elements[13], z).applyMatrix4(inverse);
    },
    /** The car's yaw on the ground (rotation.y). */
    yaw() {
      rootMatrix(matrix);
      rootQuaternion.setFromRotationMatrix(matrix);
      direction.set(0, 0, -1).applyQuaternion(rootQuaternion);
      return yawAlong(direction.x, direction.z);
    },
    /** Swings the driver's door: 0 shut .. 1 open (the fleet eases towards it, ~0.4 s a swing). */
    setDoor(amount) {
      const open = Math.round(Math.min(1, Math.max(0, amount)) * 100) / 100;
      if (open === doorShown) return;
      doorShown = open;
      if (fleet && typeof fleet.setDoorOpen === 'function') { fleet.setDoorOpen(vehicle.id, doorSide, open); return; }
      if (doorNode && doorSide === 'driver') doorNode.quaternion.copy(doorNode.userData.shutQuaternion).premultiply(swing.setFromAxisAngle(UP, -DOOR_SWING * easeInOut(open)));
    },
  };
}
