// Where the lead gets in, sits and swings the door on one car of the fleet: the model's anchors
// (anchor_door_driver on the ground beside the driver's door, anchor_seat_driver at the seated
// hip joints) carried into the world by the car's drawn root, as the two anchor "nodes" the
// character run-time's vehicle transit reads (walker.enterVehicle / exitVehicle take any object
// with matrixWorld), the steering wheel the hands hold, and the driver's door. The door goes
// through the fleet's setDoorOpen(vehicleId, 'driver', amount) when the fleet has one; otherwise
// this file turns the near model's door_fl node about its hinge itself. A stand-in body without
// anchors gets points measured from the car's size.
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

const UP = new THREE.Vector3(0, 1, 0);
const bounds = new THREE.Box3();

/** The top of a car's drawn body over its root (0 without one), metres. */
function roofHeightOf(root) {
  if (!root) return 0;
  root.updateWorldMatrix(true, true);
  bounds.setFromObject(root);
  return bounds.isEmpty() ? 0 : bounds.max.y - root.matrixWorld.elements[13];
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
  const doorNode = rig && rig.near ? findNode(rig.near, 'door_fl') : null;
  // The shut pose is kept on the node: a door left hanging open must not become the new rest.
  if (doorNode && !doorNode.userData.shutQuaternion) doorNode.userData.shutQuaternion = doorNode.quaternion.clone();
  const halfWidth = Math.max(0.8, (vehicle.radius ?? 2.4) * 0.38);
  const seatLocal = seatAnchor ? seatAnchor.position.clone() : new THREE.Vector3(-0.36, 0.52, 0.1);
  seatLocal.y -= seatDrop(seatLocal.y, rig ? roofHeightOf(rig.root) : 0);
  const doorLocal = doorAnchor ? doorAnchor.position.clone() : new THREE.Vector3(-halfWidth - 0.55, 0, -0.2);
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
      direction.set(1, 0, 0).applyQuaternion(rootQuaternion);
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
     * The corner a lead on the passenger side walks round to reach the driver's door: `side` +1
     * the passenger side, -1 the driver's; `end` -1 the nose, +1 the tail (world, ground).
     * @param {THREE.Vector3} out
     */
    corner(out, side, end) {
      rootMatrix(matrix);
      const halfLength = Math.max(2.0, (vehicle.radius ?? 2.4) * 0.92) + 0.45;
      return out.set(side * (Math.abs(doorLocal.x) + 0.1), 0, end * halfLength).applyMatrix4(matrix);
    },
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
      if (fleet && typeof fleet.setDoorOpen === 'function') { fleet.setDoorOpen(vehicle.id, 'driver', open); return; }
      if (doorNode) doorNode.quaternion.copy(doorNode.userData.shutQuaternion).premultiply(swing.setFromAxisAngle(UP, -DOOR_SWING * easeInOut(open)));
    },
  };
}
