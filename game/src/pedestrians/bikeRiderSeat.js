// Where a rider sits on one motorcycle of the fleet: the hip joints at the bike's
// anchor_seat_driver, the hands on anchor_grip_l / _r (children of the fork, so they turn with the
// bars) and the feet on anchor_foot_l / _r, read as live nodes of the bike's near model by the
// character run-time's walker.sit({kind: 'rider', gripL, gripR, footL, footR}) every frame. The
// seat follows the bike's bank (the drawn root carries the physics roll) and the rider's trunk
// leans a little further into the bend. Same shape as the player's carDoorAndSeat points (rig,
// seatPose, yaw), so seatedDrivers.js handles cars and bikes alike. A bike nobody holds up stands
// on its stand and will not drive (physics Motorcycle.riderSeated): mount() puts the rider on.
import * as THREE from 'three';
import { findNode } from '../assets/nodes.js';
import { yawAlong } from '../player/carDoorAndSeat.js';

/** How much further than the bike the rider's trunk leans into a bend (a fraction of the bank). */
export const RIDER_EXTRA_LEAN = 0.3;
/** The seated hip point when a bike model gives no anchor_seat_driver (model space, metres). */
const TYPICAL_SEAT = Object.freeze({ x: 0, y: 0.91, z: 0.12 });

const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const matrix = new THREE.Matrix4();
const scale = new THREE.Vector3();
const forward = new THREE.Vector3();
const turn = new THREE.Quaternion();

/**
 * Whether a vehicle rig is a motorcycle's (the model has handlebar grips).
 * @param {object | null} rig A fleet record's rig.
 */
export function isMotorcycleRig(rig) {
  return Boolean(rig && rig.asset && rig.asset.anchors && rig.asset.anchors.anchor_grip_l);
}

/**
 * Reads the rider's points on a motorcycle, or null when the vehicle is not a drawn motorcycle.
 * @param {object | null} fleet The vehicle fleet (context.systems.find('vehicles')).
 * @param {{id: any}} vehicle The bike's entity.
 */
export function createBikeRiderSeat(fleet, vehicle) {
  const record = fleet && typeof fleet.get === 'function' ? fleet.get(vehicle.id) : null;
  const rig = record && record.rig ? record.rig : null;
  if (!isMotorcycleRig(rig) || !rig.root) return null;
  const seatInfo = rig.asset.anchors.anchor_seat_driver || null;
  const seatLocal = seatInfo ? seatInfo.position.clone() : new THREE.Vector3(TYPICAL_SEAT.x, TYPICAL_SEAT.y, TYPICAL_SEAT.z);
  // Only the anchor's yaw on the bike is used, so an anchor's tilt can never tip the rider.
  const seatTurn = new THREE.Quaternion();
  if (seatInfo && seatInfo.direction) seatTurn.setFromAxisAngle(UP, yawAlong(seatInfo.direction.x, seatInfo.direction.z));
  const seatOffset = new THREE.Matrix4().compose(seatLocal, seatTurn, ONE);
  const node = (name) => (rig.near ? findNode(rig.near, name) : null);
  const bike = record.car || null;

  return {
    rig,
    /** The live anchor nodes the run-time reads (null ones fall back to a typical bike's). */
    gripL: node('anchor_grip_l'),
    gripR: node('anchor_grip_r'),
    footL: node('anchor_foot_l'),
    footR: node('anchor_foot_r'),
    /** No steering wheel on a bike (the shape seatedDrivers reads from a car's points). */
    steeringWheel: null,
    wheelRadius: 0,
    /**
     * The seated hip point and the rider's orientation (world), banked with the bike.
     * @param {THREE.Vector3} outPosition
     * @param {THREE.Quaternion} outQuaternion
     */
    seatPose(outPosition, outQuaternion) {
      rig.root.updateWorldMatrix(true, false);
      matrix.copy(rig.root.matrixWorld).multiply(seatOffset);
      matrix.decompose(outPosition, outQuaternion, scale);
    },
    /** The bike's yaw on the ground (rotation.y). */
    yaw() {
      rig.root.updateWorldMatrix(true, false);
      turn.setFromRotationMatrix(rig.root.matrixWorld);
      forward.set(0, 0, -1).applyQuaternion(turn);
      return yawAlong(forward.x, forward.z);
    },
    /**
     * The extra trunk lean for walker.seat.lean (radians, + to the left): the physics' bank is
     * + to the right, and the seat already carries the bank itself.
     */
    lean() {
      const bank = bike && Number.isFinite(bike.lean) ? bike.lean : 0;
      return -bank * RIDER_EXTRA_LEAN;
    },
    /** Puts the rider on, so the bike holds itself up and drives (idempotent). */
    mount() {
      if (bike && bike.riderSeated === false && typeof bike.mount === 'function') bike.mount();
    },
    /**
     * Whether a crash threw the rider (physics Motorcycle.fallen, or riderSeated false); `out`
     * gets the throw's velocity (Motorcycle.riderThrow), at least 1.5 m/s up.
     * @param {{vx: number, vy: number, vz: number}} out
     */
    thrown(out) {
      // Mounted when seated, so a rider no longer seated was thrown (physics RIDER_THROWN).
      if (!bike || (bike.fallen !== true && bike.riderSeated !== false)) return false;
      const t = bike.riderThrow || null;
      out.vx = t ? t.vx || 0 : 0;
      out.vy = Math.max(1.5, t ? t.vy || 0 : 0);
      out.vz = t ? t.vz || 0 : 0;
      return true;
    },
  };
}
