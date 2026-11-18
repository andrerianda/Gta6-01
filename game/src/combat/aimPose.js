// The upper body aiming, laid over whatever the legs are doing: after the player's locomotion pose
// is written, the chest turns part of the way towards the aim, and both arms reach with the
// character run-time's two-bone inverse kinematics (characters/ik/twoBoneSolver.js) so that the
// right hand holds the weapon on the line to the aim point and the left hand supports it (a
// two-handed pistol grip in front of the chin, or a rifle at the shoulder). It also plays the
// punch and the bat swing. Every change eases in and out with a weight; works on the bones of
// the instance directly (world-space rotations folded back into each bone's parent), so it
// needs nothing from the pose buffer. Temporary until the run-time offers an upper-body layer.
import * as THREE from 'three';
import { createTwoBoneResult, solveTwoBone } from '../characters/ik/twoBoneSolver.js';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Creates the aim pose for one character instance.
 * @param {THREE.Object3D} instance The character's instance (bones named as humanSkeleton.js).
 */
export function createAimPose(instance) {
  const bone = (name) => instance.getObjectByName(name);
  const chest = bone('chest'), spine = bone('spine');
  const arms = [
    { upper: bone('upper_arm_r'), lower: bone('forearm_r'), hand: bone('hand_r'), side: 1 },
    { upper: bone('upper_arm_l'), lower: bone('forearm_l'), hand: bone('hand_l'), side: -1 },
  ];
  const anchor = bone('anchor_hand_r');
  const solved = createTwoBoneResult();
  const v = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(),
    target: new THREE.Vector3(), right: new THREE.Vector3(), forward: new THREE.Vector3(), pole: new THREE.Vector3(),
    shoulders: new THREE.Vector3(), aim: new THREE.Vector3() };
  const q = { a: new THREE.Quaternion(), b: new THREE.Quaternion(), c: new THREE.Quaternion(), parent: new THREE.Quaternion(), local: new THREE.Quaternion() };
  const basis = new THREE.Matrix4();
  const weights = { aim: 0, strike: 0 };
  const ok = Boolean(chest && arms[0].upper && arms[0].lower && arms[0].hand && arms[1].upper);

  /** Turns `node` by a world-space rotation `turn`, blended by `w`. */
  function turnWorld(node, turn, w) {
    node.getWorldQuaternion(q.a);
    q.b.copy(turn).multiply(q.a);
    node.parent.getWorldQuaternion(q.parent).invert();
    q.local.copy(q.parent).multiply(q.b);
    node.quaternion.slerp(q.local, w);
    node.updateMatrixWorld(true);
  }

  /** Points a bone from its joint towards a world direction, blended by `w`. */
  function aimBone(node, child, direction, w) {
    node.getWorldPosition(v.a);
    child.getWorldPosition(v.b);
    v.c.subVectors(v.b, v.a).normalize();
    q.c.setFromUnitVectors(v.c, direction);
    turnWorld(node, q.c, w);
  }

  /** Reaches an arm's wrist for a world point, the elbow towards a world pole direction. */
  function reach(arm, target, pole, w) {
    arm.upper.getWorldPosition(v.a);
    arm.lower.getWorldPosition(v.b);
    arm.hand.getWorldPosition(v.c);
    const upperLength = v.a.distanceTo(v.b), lowerLength = v.b.distanceTo(v.c);
    solveTwoBone(solved, target.x - v.a.x, target.y - v.a.y, target.z - v.a.z, pole.x, pole.y, pole.z, upperLength, lowerLength);
    v.d.set(solved[0], solved[1], solved[2]);
    aimBone(arm.upper, arm.lower, v.d, w);
    v.d.set(solved[3], solved[4], solved[5]);
    aimBone(arm.lower, arm.hand, v.d, w);
  }

  /** Turns the right hand so the anchor's -Z runs along `aim` with its +Y up. */
  function gripAlong(aim, w) {
    v.d.copy(aim).negate();                     // the anchor's +Z
    v.right.crossVectors(UP, v.d).normalize();  // +X
    v.pole.crossVectors(v.d, v.right);          // +Y
    basis.makeBasis(v.right, v.pole, v.d);
    q.a.setFromRotationMatrix(basis);           // wanted world rotation of the anchor
    q.b.copy(anchor.quaternion).invert();
    q.a.multiply(q.b);                          // wanted world rotation of the hand
    const hand = arms[0].hand;
    hand.parent.getWorldQuaternion(q.parent).invert();
    q.local.copy(q.parent).multiply(q.a);
    hand.quaternion.slerp(q.local, w);
    hand.updateMatrixWorld(true);
  }

  /**
   * Poses the upper body for this frame (call after the locomotion pose is applied).
   * @param {number} dt Frame seconds.
   * @param {{aiming: boolean, aimPoint: THREE.Vector3, longGun: boolean, strike: number, strikeKind: string}} how
   *   strike runs 0..1 through a punch or swing (0: none).
   */
  function update(dt, how) {
    if (!ok) return;
    weights.aim += ((how.aiming ? 1 : 0) - weights.aim) * Math.min(1, dt * 12);
    weights.strike += ((how.strike > 0 ? 1 : 0) - weights.strike) * Math.min(1, dt * 20);
    if (weights.aim < 0.01 && weights.strike < 0.01) return;
    instance.updateMatrixWorld(true);
    const yaw = instance.rotation.y;
    v.forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    v.right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    chest.getWorldPosition(v.shoulders);
    v.aim.subVectors(how.aimPoint, v.shoulders).normalize();

    // The chest and spine turn up to about 60 degrees towards the aim and lean with its pitch.
    const w = Math.max(weights.aim, weights.strike);
    let twist = Math.atan2(-v.aim.x, -v.aim.z) - yaw;
    twist = Math.atan2(Math.sin(twist), Math.cos(twist));
    twist = Math.max(-1.05, Math.min(1.05, twist));
    q.c.setFromAxisAngle(UP, twist * 0.45);
    turnWorld(spine ?? chest, q.c, w);
    q.c.setFromAxisAngle(UP, twist * 0.55);
    turnWorld(chest, q.c, w);

    // Shoulder line, after the twist.
    arms[0].upper.getWorldPosition(v.a);
    arms[1].upper.getWorldPosition(v.b);
    v.shoulders.addVectors(v.a, v.b).multiplyScalar(0.5);
    v.right.subVectors(v.a, v.b).normalize();
    v.aim.subVectors(how.aimPoint, v.shoulders).normalize();
    const armLength = arms[0].upper.getWorldPosition(v.c).distanceTo(arms[0].lower.getWorldPosition(v.d)) * 2.05;

    if (weights.strike >= 0.01 && how.strike > 0) {
      const t = how.strike;
      if (how.strikeKind === 'bat') {
        // Wind up high on the right, sweep across in front, finish low on the left.
        const sweep = -1 + 2 * t;
        v.target.copy(v.shoulders).addScaledVector(v.right, -0.45 * sweep).addScaledVector(v.aim, 0.35 + 0.25 * (1 - sweep * sweep)).addScaledVector(UP, 0.12 - 0.3 * t);
      } else {
        const jab = Math.sin(Math.min(1, t * 1.6) * Math.PI);
        v.target.copy(v.shoulders).addScaledVector(v.right, 0.12).addScaledVector(v.aim, 0.2 + armLength * 0.72 * jab);
      }
      v.pole.copy(v.right).addScaledVector(UP, -0.8);
      reach(arms[0], v.target, v.pole, weights.strike);
      return;
    }

    const a = weights.aim;
    if (how.longGun) {
      v.target.copy(v.a).addScaledVector(v.aim, 0.22).addScaledVector(v.right, -0.1).addScaledVector(UP, -0.07);
    } else {
      v.target.copy(v.shoulders).addScaledVector(v.aim, armLength * 0.86).addScaledVector(v.right, 0.03).addScaledVector(UP, 0.03);
    }
    v.pole.copy(v.right).multiplyScalar(0.6).addScaledVector(UP, -1);
    reach(arms[0], v.target, v.pole, a);
    v.aim.subVectors(how.aimPoint, arms[0].hand.getWorldPosition(v.c)).normalize();
    if (anchor) gripAlong(v.aim, a);
    // The support hand: under the pistol's grip, or along the long gun's fore-end.
    arms[0].hand.getWorldPosition(v.target);
    if (how.longGun) v.target.addScaledVector(v.aim, 0.34).addScaledVector(UP, -0.05);
    else v.target.addScaledVector(v.right, -0.06).addScaledVector(UP, -0.035).addScaledVector(v.aim, -0.01);
    v.pole.copy(v.right).multiplyScalar(-0.7).addScaledVector(UP, -1);
    reach(arms[1], v.target, v.pole, a);
  }

  return { update, weights, get ready() { return ok; } };
}
