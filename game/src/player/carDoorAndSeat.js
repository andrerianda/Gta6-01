// Where the lead stands, sits and swings the door on one car of the fleet: the model's anchors
// (anchor_door_driver on the ground beside the driver's door, anchor_seat_driver at the seated
// hip joints) carried into the world by the car's drawn root, the steering wheel the hands hold,
// and the driver's door (door_fl, hinged at its front edge) swung open and shut. The door goes
// through the fleet's setDoorOpen(vehicleId, 'driver', amount) when the fleet has one; until then
// this file turns the near model's door_fl node about its hinge itself. A stand-in body without
// anchors gets points measured from the car's size.
import * as THREE from 'three';
import { findNode } from '../assets/nodes.js';

/** How far the driver's door swings when fully open, radians (about 60 degrees). */
export const DOOR_SWING = 1.05;
/** How far outside the door anchor the lead waits while the door swings, metres. */
export const DOOR_CLEARANCE = 0.22;

const UP = new THREE.Vector3(0, 1, 0);
const swing = new THREE.Quaternion();
const rootQuaternion = new THREE.Quaternion();
const direction = new THREE.Vector3();

/** Smooth 0..1 ease (the door's and the body's carry). */
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
  const door = rig && rig.near ? findNode(rig.near, 'door_fl') : null;
  // The shut pose is kept on the node: a door left hanging open must not become the new rest.
  if (door && !door.userData.shutQuaternion) door.userData.shutQuaternion = door.quaternion.clone();
  const doorRest = door ? door.userData.shutQuaternion : null;
  const halfWidth = Math.max(0.8, (vehicle.radius ?? 2.4) * 0.38);
  const seatLocal = seatAnchor ? seatAnchor.position.clone() : new THREE.Vector3(-0.36, 0.52, 0.1);
  const doorLocal = doorAnchor ? doorAnchor.position.clone() : new THREE.Vector3(-halfWidth - 0.55, 0, -0.2);
  // Only the seat's yaw in the car is used, so an anchor's roll can never tip the body.
  const seatTurn = new THREE.Quaternion();
  if (seatAnchor && seatAnchor.direction) seatTurn.setFromAxisAngle(UP, yawAlong(seatAnchor.direction.x, seatAnchor.direction.z));
  const steeringWheel = rig ? rig.steeringWheel ?? null : null;
  const extras = asset && asset.extras ? asset.extras : {};
  let doorShown = -1;
  let sentTarget = -1;

  /** The car's world matrix (the drawn root, else its entity). */
  function rootMatrix(out) {
    if (rig && rig.root) {
      rig.root.updateWorldMatrix(true, false);
      return out.copy(rig.root.matrixWorld);
    }
    rootQuaternion.setFromAxisAngle(UP, vehicle.heading ?? 0);
    return out.compose(vehicle.position, rootQuaternion, direction.set(1, 1, 1));
  }
  const matrix = new THREE.Matrix4();

  return {
    rig,
    /** The steering wheel node (its hands follow it) and its rim radius. */
    steeringWheel,
    wheelRadius: extras.steering_wheel_radius || 0.185,
    /**
     * Where the lead waits by the driver's door (ground, world) and the yaw that faces the car.
     * @param {THREE.Vector3} out
     * @returns {number} The yaw facing the door.
     */
    standPoint(out) {
      rootMatrix(matrix);
      rootQuaternion.setFromRotationMatrix(matrix);
      direction.set(1, 0, 0).applyQuaternion(rootQuaternion);
      direction.y = 0;
      direction.normalize();
      out.copy(doorLocal).applyMatrix4(matrix).addScaledVector(direction, -DOOR_CLEARANCE);
      return yawAlong(direction.x, direction.z);
    },
    /**
     * The seated hip point and the body's orientation in the seat (world).
     * @param {THREE.Vector3} outPosition
     * @param {THREE.Quaternion} outQuaternion
     */
    seatPose(outPosition, outQuaternion) {
      rootMatrix(matrix);
      outPosition.copy(seatLocal).applyMatrix4(matrix);
      outQuaternion.setFromRotationMatrix(matrix).multiply(seatTurn);
    },
    /** The car's yaw on the ground (rotation.y). */
    yaw() {
      rootMatrix(matrix);
      rootQuaternion.setFromRotationMatrix(matrix);
      direction.set(0, 0, -1).applyQuaternion(rootQuaternion);
      return yawAlong(direction.x, direction.z);
    },
    /**
     * Swings the driver's door: 0 shut .. 1 open, called with the progress of a swing. The
     * fleet's setDoorOpen eases towards a target by itself (about 0.4 s a swing), so it is sent
     * where the swing is heading (or the amount itself on a jump, e.g. a door left hanging).
     */
    setDoor(amount) {
      const open = Math.round(easeInOut(amount) * 200) / 200;
      if (open === doorShown) return;
      if (fleet && typeof fleet.setDoorOpen === 'function') {
        const target = doorShown < 0 || Math.abs(open - doorShown) > 0.3 ? open : open > doorShown ? 1 : 0;
        doorShown = open;
        if (target !== sentTarget) { sentTarget = target; fleet.setDoorOpen(vehicle.id, 'driver', target); }
        return;
      }
      doorShown = open;
      if (!door) return;
      door.quaternion.copy(doorRest).premultiply(swing.setFromAxisAngle(UP, -DOOR_SWING * open));
    },
  };
}
