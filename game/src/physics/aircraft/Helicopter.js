// A helicopter: the main rotor's thrust acts along the body's up axis, so tilting the body (the
// cyclic) turns some of it into horizontal pull; the collective sets how much thrust there is; the
// tail rotor sets the yaw rate. Close to the ground the rotor gains thrust (ground effect, up to
// about a fifth more at the skids), which the pilot feels as a cushion when landing. Air drag is
// tuned so that the deepest forward tilt gives the catalog's top speed.
// Keyboard flying uses the hover assist (on by default): the inputs ask for velocities, not
// attitudes. With no input it holds a hover in place; `collective` asks for a climb (or descent)
// up to the catalog climb rate, `pitch` for forward speed, `roll` for sideways speed, `yaw` for a
// turn. With the assist off the inputs are the attitude and thrust themselves. flyTowards() is an
// autopilot for police pursuit: it flies to a point (or keeps following a moving one) and hovers.
// Model space as for every vehicle: origin on the ground under the centre (the skids' bottom),
// facing -Z, +X to the right.
import { LAYER, MASK } from '../collisionLayers.js';
import { ConvexPoly, setBoxPoly } from '../collision/ConvexPoly.js';
import { createQueryHit } from '../collision/worldQueries.js';
import { RigidBody } from '../dynamics/RigidBody.js';
import { headingOfQuaternion, quaternionFromHeading, rotateVectorByQuaternion } from '../math/vectorMath.js';

const G = 9.81;

/**
 * Derives a helicopter's tuning from its catalog entry (class 'helicopter', flag 'aircraft').
 * @param {{mass: number, dimensions: {length: number, width: number, height: number, groundClearance?: number,
 *   rotorDiameter?: number}, handling: {topSpeed: number, timeToTopSpeed?: number, turnRate?: number,
 *   climbRate?: number, maxAltitude?: number}}} spec The catalog entry.
 * @returns {HelicopterTuning}
 */
export function deriveHelicopterTuning(spec) {
  const size = spec.dimensions;
  const handling = spec.handling;
  const mass = spec.mass;
  const topSpeed = handling.topSpeed;
  const maxTilt = 0.5;
  return {
    mass,
    length: size.length,
    width: size.width,
    height: size.height,
    rotorRadius: (size.rotorDiameter ?? size.length * 0.95) * 0.5,
    centreOfMass: { x: 0, y: size.height * 0.4, z: -size.length * 0.12 },
    inertia: {
      x: (mass / 12) * (size.length * size.length + size.height * size.height) * 0.6,
      y: (mass / 12) * (size.length * size.length + size.width * size.width) * 0.6,
      z: (mass / 12) * (size.width * size.width + size.height * size.height),
    },
    // The cabin and the tail boom.
    cabin: { halfX: size.width * 0.5, halfY: size.height * 0.36, halfZ: size.length * 0.24, y: size.height * 0.36, z: -size.length * 0.2 },
    tail: { halfX: 0.25, halfY: size.height * 0.14, halfZ: size.length * 0.22, y: size.height * 0.45, z: size.length * 0.26 },
    maxTilt,
    drag: (mass * G * Math.tan(maxTilt)) / (topSpeed * topSpeed),
    maxThrust: mass * G * 1.8,
    topSpeed,
    climbRate: handling.climbRate ?? 8,
    maxAltitude: handling.maxAltitude ?? 400,
    turnRate: handling.turnRate ?? 0.9,
    spinUpTime: 4,
  };
}

export class Helicopter {
  /**
   * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world to fly in.
   * @param {HelicopterTuning} tuning From deriveHelicopterTuning().
   * @param {{x?: number, y?: number, z?: number, heading?: number, userRef?: unknown, engineOn?: boolean}} [options]
   *   Where the model's origin is (on the ground when `y` is missing); `engineOn` (default true when
   *   `y` is given, so a helicopter placed in the air hovers at once).
   */
  constructor(world, tuning, options = {}) {
    this.world = world;
    this.tuning = tuning;
    /**
     * The pilot's inputs, each -1..1: `collective` (climb / descend), `pitch` (1 forward), `roll`
     * (1 right), `yaw` (1 turn right). With `assist` (default) they ask for velocities and no input
     * holds a hover; without it they are thrust and attitude.
     */
    this.input = { collective: 0, pitch: 0, roll: 0, yaw: 0 };
    this.assist = true;
    const com = tuning.centreOfMass;
    const cabin = tuning.cabin;
    const tail = tuning.tail;
    const pieces = [
      setBoxPoly(new ConvexPoly(8, 6, 12), -com.x, cabin.y - com.y, cabin.z - com.z, IDENTITY, cabin.halfX, cabin.halfY, cabin.halfZ).clone(),
      setBoxPoly(new ConvexPoly(8, 6, 12), -com.x, tail.y - com.y, tail.z - com.z, IDENTITY, tail.halfX, tail.halfY, tail.halfZ).clone(),
    ];
    /** The rigid body; its origin is the centre of mass. */
    this.body = new RigidBody({
      mass: tuning.mass, inertia: tuning.inertia, pieces, layer: LAYER.VEHICLE, friction: 0.6, restitution: 0.08,
      linearDamping: 0, angularDamping: 0.8, modelOffset: { x: -com.x, y: -com.y, z: -com.z }, userRef: options.userRef ?? null,
    });
    this.body.owner = this;
    this.body.canSleep = false;
    /** True while the engines run; the rotor spins up over tuning.spinUpTime seconds. */
    this.engineOn = options.engineOn ?? options.y !== undefined;
    /** Rotor speed, 0 (stopped) .. 1 (flight speed). */
    this.rotorSpeed = this.engineOn ? 1 : 0;
    /** Rotor angle for drawing the blades, radians. */
    this.rotorAngle = 0;
    /** Height of the skids over what is below (ground, roof), metres (capped at 100). */
    this.altitude = 0;
    /** Extra thrust from the ground, 0 (high up) .. about 0.2 (at the skids). */
    this.groundEffect = 0;
    /** Thrust now, as a share of the weight (for the audio's blade load). */
    this.load = 0;
    /** Horizontal speed along the nose and vertical speed, m/s. */
    this.speed = 0;
    this.verticalSpeed = 0;
    /** The autopilot's target, or null. */
    this.target = null;
    /** The height the assist holds while the collective is centred (null: take the current one). */
    this.holdHeight = null;
    this.targetSpeed = tuning.topSpeed;
    this.arriveRadius = 6;
    this.hit = createQueryHit();
    this.ignore = [this.body];
    this.placeAt(options.x ?? 0, options.y, options.z ?? 0, options.heading ?? 0);
    world.addBody(this.body);
    world.addActor(this);
  }

  /**
   * Puts the helicopter somewhere, at rest.
   * @param {number} x Where the model's origin goes.
   * @param {number | undefined} y Its height; on the ground when undefined.
   * @param {number} z
   * @param {number} heading Compass heading (0 = -Z, clockwise seen from above).
   */
  placeAt(x, y, z, heading) {
    const body = this.body;
    const com = this.tuning.centreOfMass;
    quaternionFromHeading(heading, scratchQuaternion);
    rotateVectorByQuaternion(scratchQuaternion, com.x, com.y, com.z, scratch);
    const baseY = y ?? this.world.ground.heightAt(x, z);
    body.linearVelocity.x = body.linearVelocity.y = body.linearVelocity.z = 0;
    body.angularVelocity.x = body.angularVelocity.y = body.angularVelocity.z = 0;
    body.setPose(x + scratch.x, baseY + scratch.y, z + scratch.z, scratchQuaternion);
    body.wake();
  }

  /** The compass heading of the nose. */
  get heading() {
    return headingOfQuaternion(this.body.quaternion);
  }

  /**
   * Autopilot: fly to a point and hover there (call again each frame to follow a moving one).
   * The pilot's inputs are ignored until clearTarget().
   * @param {number} x
   * @param {number} y Height of the point to hover at.
   * @param {number} z
   * @param {{speed?: number, arriveRadius?: number}} [options] Cruise speed (default the top
   *   speed) and the distance within which it counts as there.
   */
  flyTowards(x, y, z, options = {}) {
    if (this.target === null) this.target = { x, y, z };
    this.target.x = x;
    this.target.y = y;
    this.target.z = z;
    this.targetSpeed = options.speed ?? this.tuning.topSpeed;
    this.arriveRadius = options.arriveRadius ?? 6;
    this.engineOn = true;
  }

  /** Hands the helicopter back to the pilot's inputs. */
  clearTarget() {
    this.target = null;
    this.holdHeight = null;
  }

  /** True when the autopilot has a target and is within its arrive radius. */
  get arrived() {
    const t = this.target;
    if (t === null) return false;
    const p = this.body.modelPosition(scratch);
    return Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z) < this.arriveRadius;
  }

  /** Removes the helicopter from its world. */
  dispose() {
    this.world.removeBody(this.body);
    this.world.removeActor(this);
  }

  /**
   * Rotor thrust, attitude and yaw control, and drag for one step (called by the world).
   * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world.
   * @param {number} dt The step.
   */
  beforeStep(world, dt) {
    const body = this.body;
    const tuning = this.tuning;
    const r = body.rotation;
    const rightX = r[0];
    const rightY = r[3];
    const rightZ = r[6];
    const upX = r[1];
    const upY = r[4];
    const upZ = r[7];
    const forwardX = -r[2];
    const forwardY = -r[5];
    const forwardZ = -r[8];
    const v = body.linearVelocity;
    const w = body.angularVelocity;
    // The heading frame: the nose and the right side, level.
    let hx = forwardX;
    let hz = forwardZ;
    const flat = Math.sqrt(hx * hx + hz * hz) || 1;
    hx /= flat;
    hz /= flat;
    const sideX = -hz;
    const sideZ = hx;
    const along = v.x * hx + v.z * hz;
    const across = v.x * sideX + v.z * sideZ;
    this.speed = along;
    this.verticalSpeed = v.y;

    const spin = this.engineOn ? 1 : 0;
    const rate = dt / tuning.spinUpTime;
    this.rotorSpeed += Math.max(-rate, Math.min(rate, spin - this.rotorSpeed));
    this.rotorAngle = (this.rotorAngle + this.rotorSpeed * 40 * dt) % (Math.PI * 2);

    // What is under the skids, for ground effect and landing.
    const p = body.modelPosition(scratch);
    const reach = tuning.rotorRadius * 2;
    const below = world.supportBelow(p.x, p.y + 0.3, p.z, reach + 0.3, MASK.SOLID, this.ignore, this.hit) ? this.hit.y : world.ground.heightAt(p.x, p.z);
    const altitude = Math.max(p.y - below, 0);
    this.altitude = Math.min(altitude, 100);
    const effect = altitude < reach ? 0.2 * (1 - altitude / reach) ** 2 : 0;
    this.groundEffect = effect;

    // What the pilot (or the autopilot) asks for: an attitude, a yaw rate and a thrust.
    const input = this.input;
    let pitchTarget;
    let rollTarget;
    let yawWanted;
    let thrust;
    const tilt = tuning.maxTilt;
    const cosTilt = Math.max(upY, 0.5);
    if (this.assist || this.target !== null) {
      let wantAlong = input.pitch * tuning.topSpeed;
      let wantAcross = input.roll * tuning.topSpeed * 0.4;
      let wantUp = input.collective * tuning.climbRate;
      yawWanted = input.yaw * tuning.turnRate;
      const t = this.target;
      if (t !== null) {
        const dx = t.x - p.x;
        const dz = t.z - p.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        const cruise = Math.min(this.targetSpeed, Math.sqrt(2 * 3.2 * Math.max(distance - 1, 0)));
        const ux = distance > 0.01 ? dx / distance : 0;
        const uz = distance > 0.01 ? dz / distance : 0;
        wantAlong = (ux * hx + uz * hz) * cruise;
        wantAcross = (ux * sideX + uz * sideZ) * cruise;
        wantUp = Math.max(-tuning.climbRate, Math.min(tuning.climbRate, (t.y - p.y) * 0.8));
        // Turn the nose towards the way it flies when the point is far.
        if (distance > 20) {
          let turn = Math.atan2(ux * sideX + uz * sideZ, ux * hx + uz * hz);
          yawWanted = Math.max(-1, Math.min(1, turn * 1.5)) * tuning.turnRate;
        } else {
          yawWanted = 0;
        }
      }
      // No collective: hold the height it would stop at (keyboard flying never sinks or creeps).
      if (t === null && input.collective === 0) {
        if (this.holdHeight === null) this.holdHeight = p.y + (v.y + G * body.gravityScale * dt) * 0.45;
        wantUp = Math.max(-tuning.climbRate, Math.min(tuning.climbRate, (this.holdHeight - p.y) * 0.8));
      } else {
        this.holdHeight = null;
      }
      if (p.y > tuning.maxAltitude - 2) wantUp = Math.min(wantUp, (tuning.maxAltitude - p.y) * 0.5);
      // Settling on the skids: the sink rate allowed shrinks with the height left (about 0.5 m/s at
      // touchdown, whatever the pilot holds); the profile's slowing down is fed forward.
      let flare = 0;
      if (wantUp < 0) {
        const steep = 0.5 + Math.sqrt(4 * altitude);
        const shallow = 0.5 + 1.2 * altitude;
        const limit = shallow < steep ? shallow : steep;
        if (wantUp < -limit) {
          wantUp = -limit;
          flare = (shallow < steep ? 1.2 : 1 / Math.sqrt(Math.max(altitude, 0.01))) * limit;
        }
      }
      const maxPull = G * Math.tan(tilt);
      // At speed the nose turns no faster than a banked turn can carry the flight path round
      // (keyboard yaw in fast flight then sweeps a wide curve instead of skidding sideways).
      // A pilot also eases off the speed to turn tighter.
      if (t === null) wantAlong *= 1 - 0.4 * Math.abs(input.yaw);
      const fast = Math.abs(along);
      if (fast > 5) {
        const coordinated = (maxPull * 0.9) / fast;
        if (yawWanted > coordinated) yawWanted = coordinated;
        else if (yawWanted < -coordinated) yawWanted = -coordinated;
      }
      let aAlong = (wantAlong - along) * 0.7;
      let aAcross = (wantAcross - across) * 0.9;
      aAlong = aAlong > maxPull ? maxPull : aAlong < -maxPull ? -maxPull : aAlong;
      aAcross = aAcross > maxPull ? maxPull : aAcross < -maxPull ? -maxPull : aAcross;
      // The drag at this speed is what the tilt must also hold against.
      const dragAlong = (tuning.drag / tuning.mass) * along * Math.abs(along);
      const dragAcross = (tuning.drag / tuning.mass) * across * Math.abs(across);
      pitchTarget = Math.atan((aAlong + dragAlong) / G);
      rollTarget = Math.atan((aAcross + dragAcross) / G);
      pitchTarget = pitchTarget > tilt ? tilt : pitchTarget < -tilt ? -tilt : pitchTarget;
      rollTarget = rollTarget > tilt ? tilt : rollTarget < -tilt ? -tilt : rollTarget;
      // The vertical speed before this step's gravity (the world applied it already), so a hover
      // does not settle into a slow climb; the descent profile's slope is fed forward.
      const climbNow = v.y + G * body.gravityScale * dt;
      // (On the profile wantUp < 0; the flare scales with the actual sink, none while not sinking.)
      const aUp = (wantUp - climbNow) * 2.2 + (flare > 0 ? flare * Math.min(1, Math.max(0, climbNow / wantUp)) : 0);
      // The assist takes back most of the ground effect, so it can land; the rest is the cushion.
      thrust = (tuning.mass * (G + aUp)) / cosTilt / (1 + effect * 0.6);
      if (altitude < 0.03 && wantUp <= 0 && Math.abs(wantAlong) < 0.5 && t === null) {
        thrust = tuning.mass * G * 0.4;
        pitchTarget = 0;
        rollTarget = 0;
      }
    } else {
      this.holdHeight = null;
      pitchTarget = input.pitch * tilt;
      rollTarget = input.roll * tilt;
      yawWanted = input.yaw * tuning.turnRate;
      thrust = (tuning.mass * G * (1 + input.collective * 0.6)) / cosTilt;
    }
    const available = tuning.maxThrust * this.rotorSpeed * this.rotorSpeed;
    if (thrust > available) thrust = available;
    if (thrust < 0) thrust = 0;
    thrust *= 1 + effect;
    this.load = thrust / (tuning.mass * G);
    const impulse = thrust * dt;
    body.applyCentralImpulse(upX * impulse, upY * impulse, upZ * impulse);

    // The cyclic and the tail rotor: the attitude and yaw rate follow the targets (only with the
    // rotor turning; a stopped helicopter just sits).
    const authority = this.rotorSpeed * this.rotorSpeed;
    if (authority > 0.05) {
      const pitchNow = Math.asin(Math.max(-1, Math.min(1, -forwardY)));
      const rollNow = Math.asin(Math.max(-1, Math.min(1, -rightY)));
      const noseDownRate = -(w.x * rightX + w.y * rightY + w.z * rightZ);
      const rollRate = w.x * forwardX + w.y * forwardY + w.z * forwardZ;
      const pitchChange = ((pitchTarget - pitchNow) * 3.5 - noseDownRate) * 0.25 * authority;
      const rollChange = ((rollTarget - rollNow) * 3.5 - rollRate) * 0.25 * authority;
      w.x += -rightX * pitchChange + forwardX * rollChange;
      w.y += -rightY * pitchChange + forwardY * rollChange;
      w.z += -rightZ * pitchChange + forwardZ * rollChange;
      const yawNow = w.x * upX + w.y * upY + w.z * upZ;
      const want = -yawWanted;
      const yawChange = ((want - yawNow) * 0.12 + want * body.angularDamping * dt) * authority;
      w.x += upX * yawChange;
      w.y += upY * yawChange;
      w.z += upZ * yawChange;
    }

    // Air drag.
    const airSpeed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (airSpeed > 0.1) {
      const drag = (tuning.drag * airSpeed * dt);
      body.applyCentralImpulse(-v.x * drag, -v.y * drag * 2, -v.z * drag);
    }
  }
}

/**
 * The numbers a Helicopter is built from (see deriveHelicopterTuning).
 * @typedef {object} HelicopterTuning
 * @property {number} mass
 * @property {number} length
 * @property {number} width
 * @property {number} height
 * @property {number} rotorRadius
 * @property {{x: number, y: number, z: number}} centreOfMass In model space.
 * @property {{x: number, y: number, z: number}} inertia
 * @property {{halfX: number, halfY: number, halfZ: number, y: number, z: number}} cabin Hull box (model space).
 * @property {{halfX: number, halfY: number, halfZ: number, y: number, z: number}} tail Tail boom box.
 * @property {number} maxTilt The deepest cyclic tilt, radians (it gives the top speed).
 * @property {number} drag Newtons per (m/s)^2.
 * @property {number} maxThrust Newtons at full rotor speed.
 * @property {number} topSpeed
 * @property {number} climbRate Metres per second with the collective full up (assist).
 * @property {number} maxAltitude The assist does not climb above it.
 * @property {number} turnRate Radians per second at full yaw.
 * @property {number} spinUpTime Seconds for the rotor to reach flight speed.
 */

const IDENTITY = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const scratch = { x: 0, y: 0, z: 0 };
const scratchQuaternion = { x: 0, y: 0, z: 0, w: 1 };
