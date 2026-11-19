// A boat on the injected sea surface (world.waterHeightAt(x, z, time): the game passes the wave
// model the water is drawn with). Twelve points on the hull bottom each feel the water: a spring by
// how deep the point is under the surface and a damper by how fast it moves through it, so the boat
// floats at its draft, pitches and rolls over the waves and settles. The outboards push from the
// stern only while the propeller is in the water; the keel resists sliding sideways, so a turn
// carves; past about a third of its top speed the hull rises onto the plane (the bow lifts first,
// then the drag falls). On a beach the hull rests on the terrain and the propeller runs dry.
// Outputs for drawing: spray (0..1) at two bow anchors and a wake (0..1) at the stern anchor.
// Model space as for every vehicle: origin at the centre of the keel (the lowest point of the
// hull), facing -Z, +X to the right; the waterline at rest is at y = draft.
import { LAYER } from '../collisionLayers.js';
import { ConvexPoly, setBoxPoly } from '../collision/ConvexPoly.js';
import { RigidBody } from '../dynamics/RigidBody.js';
import { headingOfQuaternion, quaternionFromHeading, rotateVectorByQuaternion } from '../math/vectorMath.js';

const G = 9.81;
const ACROSS = [-0.42, 0, 0.42];
const ALONG = [-0.4, -0.14, 0.14, 0.4];

/**
 * Derives a boat's tuning from its catalog entry (class 'boat', flag 'watercraft').
 * @param {{mass: number, dimensions: {length: number, width: number, height: number, draft?: number},
 *   handling: {topSpeed: number, timeToTopSpeed?: number, turnRate?: number}}} spec The catalog entry.
 * @returns {BoatTuning}
 */
export function deriveBoatTuning(spec) {
  const size = spec.dimensions;
  const handling = spec.handling;
  const mass = spec.mass;
  const length = size.length;
  const width = size.width;
  const draft = size.draft ?? 0.5;
  const hullTop = Math.min(size.height * 0.5, draft + 1.1);
  const points = [];
  let depthSum = 0;
  for (const along of ALONG) {
    for (const across of ACROSS) {
      // A vee hull: the chines sit higher than the keel.
      const y = across === 0 ? 0 : draft * 0.35;
      points.push({ x: across * width, y, z: along * length });
      depthSum += draft - y;
    }
  }
  const spring = (mass * G) / depthSum;
  const topSpeed = handling.topSpeed;
  const timeToTop = handling.timeToTopSpeed ?? 8;
  // Constant thrust against quadratic drag reaches 90 percent of the top speed in atanh(0.9) top / a.
  const acceleration = (1.47 * topSpeed) / timeToTop;
  const thrust = mass * acceleration;
  return {
    mass,
    length,
    width,
    draft,
    hull: { halfX: width * 0.5, halfY: hullTop * 0.5, halfZ: length * 0.5, y: hullTop * 0.5 },
    centreOfMass: { x: 0, y: draft * 0.9, z: length * 0.06 },
    inertia: {
      x: (mass / 12) * (length * length + hullTop * hullTop),
      y: (mass / 12) * (length * length + width * width),
      z: (mass / 12) * (width * width + hullTop * hullTop),
    },
    points,
    spring,
    damper: 2 * 0.4 * Math.sqrt(spring * (mass / points.length)),
    thrust,
    // Planed out, the drag is 0.65 of the displacement drag; at the top speed it equals the thrust.
    drag: thrust / (0.65 * topSpeed * topSpeed),
    sideDrag: mass * 2.6,
    topSpeed,
    turnRate: handling.turnRate ?? 0.8,
    planingSpeed: topSpeed * 0.32,
    propeller: { x: 0, y: 0.15, z: length * 0.5 },
    sprayAnchors: [{ x: -width * 0.42, y: draft + 0.1, z: -length * 0.28 }, { x: width * 0.42, y: draft + 0.1, z: -length * 0.28 }],
    wakeAnchor: { x: 0, y: draft, z: length * 0.5 },
    idleRpm: 800,
    redlineRpm: 5800,
  };
}

export class Boat {
  /**
   * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world (its waterHeightAt is the sea).
   * @param {BoatTuning} tuning From deriveBoatTuning().
   * @param {{x?: number, z?: number, heading?: number, userRef?: unknown}} [options] Where it floats.
   */
  constructor(world, tuning, options = {}) {
    this.world = world;
    this.tuning = tuning;
    /** `drive` 1 full ahead .. -1 astern (reverses after slowing), `steer` -1 left .. 1 right. */
    this.input = { drive: 0, steer: 0 };
    const com = tuning.centreOfMass;
    const hull = tuning.hull;
    const piece = setBoxPoly(new ConvexPoly(8, 6, 12), -com.x, hull.y - com.y, -com.z, IDENTITY, hull.halfX, hull.halfY, hull.halfZ).clone();
    /** The rigid body; its origin is the centre of mass. */
    this.body = new RigidBody({
      mass: tuning.mass, inertia: tuning.inertia, pieces: [piece], layer: LAYER.VEHICLE, friction: 0.5, restitution: 0.1,
      linearDamping: 0, angularDamping: 0.6, modelOffset: { x: -com.x, y: -com.y, z: -com.z }, userRef: options.userRef ?? null,
    });
    this.body.owner = this;
    this.body.canSleep = false;
    /** Speed along the bow, m/s (negative astern). */
    this.speed = 0;
    /** 0 in displacement mode .. 1 fully on the plane. */
    this.planing = 0;
    /** Share of the hull points under water, 0 (airborne or beached) .. 1. */
    this.submerged = 0;
    /** True while the propeller is in the water. */
    this.propellerWet = false;
    /** Spray at the bow anchors (tuning.sprayAnchors, model space), 0..1. */
    this.spray = 0;
    /** Wake at the stern anchor (tuning.wakeAnchor, model space), 0..1. */
    this.wake = 0;
    /** Throttle the engines get, 0..1, and an engine speed for the audio. */
    this.throttle = 0;
    this.rpm = tuning.idleRpm;
    this.placeAt(options.x ?? 0, options.z ?? 0, options.heading ?? 0);
    world.addBody(this.body);
    world.addActor(this);
  }

  /**
   * Puts the boat on the water at rest.
   * @param {number} x Where the model's origin goes.
   * @param {number} z
   * @param {number} heading Compass heading (0 = -Z, clockwise seen from above).
   */
  placeAt(x, z, heading) {
    const body = this.body;
    const com = this.tuning.centreOfMass;
    quaternionFromHeading(heading, scratchQuaternion);
    rotateVectorByQuaternion(scratchQuaternion, com.x, com.y, com.z, scratch);
    const y = this.world.waterHeightAt(x, z, this.world.time) - this.tuning.draft;
    body.linearVelocity.x = body.linearVelocity.y = body.linearVelocity.z = 0;
    body.angularVelocity.x = body.angularVelocity.y = body.angularVelocity.z = 0;
    body.setPose(x + scratch.x, y + scratch.y, z + scratch.z, scratchQuaternion);
    body.wake();
  }

  /** The compass heading the bow points at. */
  get heading() {
    return headingOfQuaternion(this.body.quaternion);
  }

  /**
   * A model-space anchor in world space (for effects: tuning.sprayAnchors[i], tuning.wakeAnchor).
   * @param {{x: number, y: number, z: number}} anchor In model space.
   * @param {{x: number, y: number, z: number}} out Receives the world position.
   * @returns {{x: number, y: number, z: number}} `out`.
   */
  anchorPosition(anchor, out) {
    const com = this.tuning.centreOfMass;
    return this.body.localToWorld(anchor.x - com.x, anchor.y - com.y, anchor.z - com.z, out);
  }

  /** Removes the boat from its world. */
  dispose() {
    this.world.removeBody(this.body);
    this.world.removeActor(this);
  }

  /**
   * Buoyancy, thrust, steering and water drag for one step (called by the world).
   * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world.
   * @param {number} dt The step.
   */
  beforeStep(world, dt) {
    const body = this.body;
    const tuning = this.tuning;
    const com = tuning.centreOfMass;
    const r = body.rotation;
    const forwardX = -r[2];
    const forwardY = -r[5];
    const forwardZ = -r[8];
    const v = body.linearVelocity;
    const w = body.angularVelocity;
    const speed = v.x * forwardX + v.y * forwardY + v.z * forwardZ;
    this.speed = speed;
    const absSpeed = Math.abs(speed);
    const time = world.time;
    let planing = (absSpeed - tuning.planingSpeed) / tuning.planingSpeed;
    planing = speed < 0 || planing < 0 ? 0 : planing > 1 ? 1 : planing * planing * (3 - 2 * planing);
    this.planing = planing;

    // Buoyancy at the hull points; on the plane the water lifts the aft hull harder.
    const points = tuning.points;
    let wet = 0;
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      body.localToWorld(point.x - com.x, point.y - com.y, point.z - com.z, scratch);
      let depth = world.waterHeightAt(scratch.x, scratch.z, time) - scratch.y;
      if (depth <= 0) continue;
      wet += 1;
      // The hull's sides and deck add volume above the waterline: buoyancy keeps rising with depth.
      const deepest = tuning.draft * 4;
      if (depth > deepest) depth = deepest;
      body.velocityAt(scratch.x, scratch.y, scratch.z, pointVelocity);
      const lift = point.z > -tuning.length * 0.2 ? 1 + 0.5 * planing : 1;
      let force = tuning.spring * depth * lift - tuning.damper * pointVelocity.y;
      if (force < 0) force = 0;
      body.applyImpulse(0, force * dt, 0, scratch.x, scratch.y, scratch.z);
    }
    const submerged = wet / points.length;
    this.submerged = submerged;
    const inWater = submerged > 0 ? Math.min(submerged * 2, 1) : 0;

    // The propeller pushes only in the water.
    const prop = tuning.propeller;
    body.localToWorld(prop.x - com.x, prop.y - com.y, prop.z - com.z, scratch);
    this.propellerWet = world.waterHeightAt(scratch.x, scratch.z, time) > scratch.y;
    const drive = this.input.drive;
    let thrust = 0;
    if (drive > 0) thrust = speed < -1 ? drive * 0.8 : drive;
    else if (drive < 0) thrust = speed > 1 ? drive * 0.8 : drive * 0.45;
    this.throttle = Math.abs(thrust);
    if (this.propellerWet && thrust !== 0) {
      const force = thrust * tuning.thrust * dt;
      let hx = forwardX;
      let hz = forwardZ;
      const flat = Math.sqrt(hx * hx + hz * hz) || 1;
      hx /= flat;
      hz /= flat;
      body.applyImpulse(hx * force, 0, hz * force, scratch.x, body.position.y, scratch.z);
    }

    if (inWater > 0) {
      // Drag along the bow (less on the plane), and the keel against sliding sideways.
      const along = tuning.drag * (1 - 0.35 * planing) * speed * absSpeed * inWater * dt;
      const rightX = r[0];
      const rightZ = r[6];
      const side = v.x * rightX + v.z * rightZ;
      const across = (tuning.sideDrag * side + tuning.mass * 0.4 * side * Math.abs(side)) * inWater * dt;
      body.applyCentralImpulse(-forwardX * along - rightX * across, -forwardY * along, -forwardZ * along - rightZ * across);
      // The helm: the rudder turns the boat with authority that grows with speed (and with
      // thrust at low speed), reversed when going astern; the hull banks into the turn.
      const authority = Math.min(Math.max(absSpeed / 6, this.propellerWet ? Math.abs(thrust) * 0.35 : 0), 1) * inWater;
      const wanted = -this.input.steer * tuning.turnRate * (speed < -0.5 ? -1 : 1) * authority;
      const blend = Math.min(dt * 3, 1);
      // (plus what the world's angular damping takes off in this step, so the rate is reached).
      w.y += (wanted - w.y) * blend + wanted * body.angularDamping * dt;
      const bank = this.input.steer * 0.12 * Math.min(absSpeed / tuning.topSpeed * 2, 1);
      const roll = -r[3];
      const rollRate = w.x * forwardX + w.y * forwardY + w.z * forwardZ;
      const change = ((bank - roll) * 2 - rollRate) * blend * 0.5;
      w.x += forwardX * change;
      w.z += forwardZ * change;
      // Coming onto the plane the bow rises, then levels.
      const hump = planing * (1 - planing) * 4 + (absSpeed > tuning.planingSpeed * 0.5 && planing === 0 ? 0.5 : 0);
      const pitchTorque = hump * 0.05 * tuning.inertia.x * dt;
      body.applyAngularImpulse(r[0] * pitchTorque, r[3] * pitchTorque, r[6] * pitchTorque);
    }

    this.spray = inWater > 0 ? Math.min((absSpeed / tuning.topSpeed) * 1.4, 1) * (0.4 + 0.6 * planing) : 0;
    this.wake = inWater * Math.min(absSpeed / tuning.topSpeed + Math.abs(thrust) * 0.15, 1);
    const target = tuning.idleRpm + (tuning.redlineRpm - tuning.idleRpm) * Math.min(absSpeed / tuning.topSpeed * 0.8 + this.throttle * 0.3, 1.05);
    this.rpm += (target - this.rpm) * Math.min(dt * 6, 1);
  }
}

/**
 * The numbers a Boat is built from (see deriveBoatTuning).
 * @typedef {object} BoatTuning
 * @property {number} mass
 * @property {number} length
 * @property {number} width
 * @property {number} draft Depth of the keel under the waterline at rest.
 * @property {{halfX: number, halfY: number, halfZ: number, y: number}} hull The hull box (model space).
 * @property {{x: number, y: number, z: number}} centreOfMass
 * @property {{x: number, y: number, z: number}} inertia
 * @property {{x: number, y: number, z: number}[]} points The buoyancy points (model space).
 * @property {number} spring Newtons per metre of depth at each point.
 * @property {number} damper Newton seconds per metre at each point.
 * @property {number} thrust Newtons at full throttle.
 * @property {number} drag Newtons per (m/s)^2 along the bow in displacement mode.
 * @property {number} sideDrag Newtons per m/s across the keel.
 * @property {number} topSpeed
 * @property {number} turnRate Radians per second at full helm.
 * @property {number} planingSpeed Speed where the hull starts to rise onto the plane.
 * @property {{x: number, y: number, z: number}} propeller
 * @property {{x: number, y: number, z: number}[]} sprayAnchors Left and right bow (model space).
 * @property {{x: number, y: number, z: number}} wakeAnchor The stern (model space).
 * @property {number} idleRpm
 * @property {number} redlineRpm
 */

const IDENTITY = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const scratch = { x: 0, y: 0, z: 0 };
const scratchQuaternion = { x: 0, y: 0, z: 0, w: 1 };
const pointVelocity = { x: 0, y: 0, z: 0 };
