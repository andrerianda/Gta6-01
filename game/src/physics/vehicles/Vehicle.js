// A car or truck: a rigid body on four wheels. Each step every wheel casts a ray down its
// suspension onto the terrain and the static colliders under the car, the springs, dampers and
// anti-roll bars push the body up, and the tyres push it along and across with a grip that peaks
// at a small slip angle and then lets go gradually, all inside one traction circle per wheel. The
// engine is a power curve with a launch limit; the gear and engine speed are derived for the audio.
// The hull (one box) collides through the world's contact solver like any other body.
import { LAYER } from '../collisionLayers.js';
import { ConvexPoly, setBoxPoly } from '../collision/ConvexPoly.js';
import { createRayShapeHit } from '../collision/rayShapes.js';
import { IndexList } from '../collision/StaticColliderSet.js';
import { RigidBody } from '../dynamics/RigidBody.js';
import { headingOfQuaternion, quaternionFromHeading, rotateVectorByQuaternion } from '../math/vectorMath.js';
import { SURFACE_ROLLING, surfaceGripAt } from '../surfaceTypes.js';

const G = 9.81;
const REST_SPEED_SQUARED = 0.01;
const REST_DELAY = 1;
const RIGHTING_DELAY = 1.2;
const RIGHTING_SPEED = 2.2;
const RIGHTING_ACCELERATION = 26;

export class Vehicle {
  /**
   * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world to drive in.
   * @param {import('./vehicleTuning.js').VehicleTuning} tuning From deriveVehicleTuning().
   * @param {{x?: number, z?: number, y?: number, heading?: number, userRef?: unknown}} [options] Where
   *   the model's origin stands (on the ground when `y` is missing) and which way it faces
   *   (compass heading: 0 = -Z, clockwise seen from above).
   */
  constructor(world, tuning, options = {}) {
    this.world = world;
    this.tuning = tuning;
    /**
     * What the driver asks for. `drive` is 1 for full ahead and -1 for full back (it brakes first
     * when the car moves the other way), `steer` is -1 full left to 1 full right, `handbrake` 0 or 1.
     */
    this.input = { drive: 0, steer: 0, handbrake: 0 };
    const hull = tuning.hull;
    const com = tuning.centreOfMass;
    const piece = setBoxPoly(new ConvexPoly(8, 6, 12), -com.x, hull.y - com.y, hull.z - com.z, IDENTITY,
      hull.halfX, hull.halfY, hull.halfZ).clone();
    /** The rigid body; its origin is the centre of mass. */
    this.body = new RigidBody({
      mass: tuning.mass, inertia: tuning.inertia, pieces: [piece], layer: LAYER.VEHICLE, friction: 0.35, restitution: 0.12,
      linearDamping: 0, angularDamping: 0.35, modelOffset: { x: -com.x, y: -com.y, z: -com.z }, userRef: options.userRef ?? null,
    });
    this.body.owner = this;
    this.body.canSleep = false;
    const count = tuning.wheels.length;
    /** How many wheels the vehicle has. */
    this.wheelCount = count;
    /** 1 for each wheel that touches the ground. */
    this.wheelContact = new Uint8Array(count);
    /** How far each hub sits above its rest position along the body's up axis (negative: drooping). */
    this.wheelOffset = new Float64Array(count);
    /** Rolling angle of each wheel, radians. */
    this.wheelSpin = new Float64Array(count);
    /** Steering angle of each wheel, radians, positive to the right. */
    this.wheelSteer = new Float64Array(count);
    /** How hard each tyre is sliding, 0 (rolling) to 1 (fully sliding): for skid marks, smoke and sound. */
    this.wheelSlip = new Float64Array(count);
    /** SURFACE id under each wheel. */
    this.wheelSurface = new Uint8Array(count);
    /** Where each tyre touches the ground, three numbers per wheel. */
    this.wheelPoint = new Float64Array(count * 3);
    this.wheelNormal = new Float64Array(count * 3);
    this.wheelLoad = new Float64Array(count);
    this.wheelSpinSpeed = new Float64Array(count);
    /** The steering angle of the front wheels right now. */
    this.steerAngle = 0;
    /** Speed along the car's nose, metres per second (negative in reverse). */
    this.speed = 0;
    /** Engine speed for the audio, revolutions per minute. */
    this.rpm = tuning.idleRpm;
    /** The gear: 1 and up, 0 in neutral at rest, -1 in reverse. */
    this.gear = 1;
    /** Throttle the engine is getting, 0 to 1 (after the arcade mapping of `input.drive`). */
    this.throttle = 0;
    /** Brake pedal, 0 to 1. */
    this.brake = 0;
    /** How many wheels are on the ground. */
    this.groundedWheels = 0;
    this.restTimer = 0;
    this.flipTimer = 0;
    this.near = new IndexList(16);
    this.placeAt(options.x ?? 0, options.y, options.z ?? 0, options.heading ?? 0);
    world.addBody(this.body);
    world.addActor(this);
  }

  /**
   * Puts the vehicle somewhere, at rest.
   * @param {number} x Where the model's origin goes.
   * @param {number | undefined} y Its height; the ground height there when undefined.
   * @param {number} z
   * @param {number} heading Compass heading (0 = -Z, clockwise seen from above).
   */
  placeAt(x, y, z, heading) {
    const body = this.body;
    const com = this.tuning.centreOfMass;
    quaternionFromHeading(heading, scratchQuaternion);
    rotateVectorByQuaternion(scratchQuaternion, com.x, com.y, com.z, scratch);
    const groundY = y ?? this.world.ground.heightAt(x, z);
    body.linearVelocity.x = body.linearVelocity.y = body.linearVelocity.z = 0;
    body.angularVelocity.x = body.angularVelocity.y = body.angularVelocity.z = 0;
    body.setPose(x + scratch.x, groundY + scratch.y, z + scratch.z, scratchQuaternion);
    body.wake();
    this.restTimer = 0;
  }

  /** The compass heading the car faces (0 = -Z, clockwise seen from above). */
  get heading() {
    return headingOfQuaternion(this.body.quaternion);
  }

  /**
   * Where a wheel hub is now, in model space (the space of the vehicle's .glb: origin on the
   * ground at the centre, facing -Z), for placing the wheel node. Turn it by `wheelSteer[index]`
   * about Y (negated for three.js) and roll it by `wheelSpin[index]`.
   * @param {number} index Wheel number: 0 front left, 1 front right, 2 rear left, 3 rear right.
   * @param {{x: number, y: number, z: number}} out Receives the hub position.
   * @returns {{x: number, y: number, z: number}} `out`.
   */
  wheelHubPosition(index, out) {
    const wheel = this.tuning.wheels[index];
    out.x = wheel.x;
    out.y = wheel.y + this.wheelOffset[index];
    out.z = wheel.z;
    return out;
  }

  /** Removes the vehicle from its world. */
  dispose() {
    this.world.removeBody(this.body);
    this.world.removeActor(this);
  }

  /**
   * Applies suspension, tyre, engine and air forces for one step (called by the world).
   * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world.
   * @param {number} dt The step.
   */
  beforeStep(world, dt) {
    const body = this.body;
    const input = this.input;
    if (body.asleep) {
      if (input.drive === 0) return;
      body.wake();
      this.restTimer = 0;
    }
    const tuning = this.tuning;
    const wheels = tuning.wheels;
    const count = this.wheelCount;
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
    const velocity = body.linearVelocity;
    const forwardSpeed = velocity.x * forwardX + velocity.y * forwardY + velocity.z * forwardZ;
    const absSpeed = Math.abs(forwardSpeed);
    this.speed = forwardSpeed;

    // The righting assist: a car left on its side or roof and nearly still is rolled back onto
    // its wheels, about the axis that brings its up direction to the sky.
    if (upY < 0.35 && velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z < 9) this.flipTimer += dt;
    else this.flipTimer = 0;
    if (this.flipTimer > RIGHTING_DELAY) {
      let ax = -upZ;
      let az = upX;
      if (ax * ax + az * az < 0.01) {
        ax = forwardX;
        az = forwardZ;
      }
      const inverse = 1 / Math.sqrt(ax * ax + az * az);
      ax *= inverse;
      az *= inverse;
      const w = body.angularVelocity;
      if (w.x * ax + w.z * az < RIGHTING_SPEED) {
        const turn = tuning.inertia.z * RIGHTING_ACCELERATION * dt;
        body.applyAngularImpulse(ax * turn, 0, az * turn);
        body.applyCentralImpulse(0, tuning.mass * G * 0.6 * dt, 0);
      }
    }

    // The arcade pedal mapping: the drive key brakes first when the car rolls the other way.
    let throttle = 0;
    let brake = 0;
    let reverse = false;
    if (input.drive > 0) {
      if (forwardSpeed < -1) brake = input.drive;
      else throttle = input.drive;
    } else if (input.drive < 0) {
      if (forwardSpeed > 1) brake = -input.drive;
      else {
        throttle = -input.drive;
        reverse = true;
      }
    }
    const handbrake = input.handbrake > 0;
    const parked = throttle === 0 && absSpeed < 1.2;
    if (parked) brake = 1;
    this.throttle = throttle;
    this.brake = brake;

    // Speed-sensitive steering: full lock when slow, at speed just past what the tyres can hold.
    const speedSquared = velocity.x * velocity.x + velocity.z * velocity.z;
    let lock = Math.atan((tuning.wheelbase * G * tuning.grip * 1.5) / Math.max(speedSquared, 1)) + 0.012;
    if (lock > tuning.maxSteer) lock = tuning.maxSteer;
    const steerTarget = input.steer * lock;
    const steerStep = tuning.steerSpeed * dt * (Math.abs(steerTarget) < Math.abs(this.steerAngle) ? 1.6 : 1);
    if (steerTarget > this.steerAngle + steerStep) this.steerAngle += steerStep;
    else if (steerTarget < this.steerAngle - steerStep) this.steerAngle -= steerStep;
    else this.steerAngle = steerTarget;

    // The engine: constant power above the launch limit, nothing beyond the top speed.
    let driveForce = 0;
    if (throttle > 0) {
      if (reverse) {
        if (forwardSpeed > -tuning.reverseSpeed) driveForce = -throttle * Math.min(tuning.maxDriveForce * 0.6, tuning.power / Math.max(absSpeed, 3));
      } else if (forwardSpeed < tuning.topSpeed * 1.04) {
        driveForce = throttle * Math.min(tuning.maxDriveForce, tuning.power / Math.max(absSpeed, 3));
      }
    }
    const engineBrake = throttle === 0 && !parked ? tuning.mass * 0.5 : 0;

    // Static colliders under the car (curbs, ramps, decks), found once for all wheels.
    const set = world.statics;
    const near = this.near;
    near.count = 0;
    if (set.count > 0) {
      const b = body.bounds;
      set.query(b[0] - 0.4, b[1] - 1.2, b[2] - 0.4, b[3] + 0.4, b[4], b[5] + 0.4, LAYER.STATIC | LAYER.SEE_THROUGH, near);
    }

    // Pass 1: where each wheel touches and how hard its spring pushes.
    const ground = world.ground;
    const com = tuning.centreOfMass;
    let grounded = 0;
    let drivenGrounded = 0;
    for (let i = 0; i < count; i += 1) {
      const wheel = wheels[i];
      body.localToWorld(wheel.x - com.x, wheel.y - com.y + wheel.travelUp, wheel.z - com.z, scratch);
      const reach = wheel.travelUp + wheel.travelDown + wheel.radius;
      let best = reach;
      let found = false;
      let nx = 0;
      let ny = 1;
      let nz = 0;
      let surface = 0;
      if (ground.castShort(scratch.x, scratch.y, scratch.z, -upX, -upY, -upZ, reach, rayHit)) {
        best = rayHit.t;
        found = true;
        nx = rayHit.nx;
        ny = rayHit.ny;
        nz = rayHit.nz;
        surface = ground.surfaceAt(scratch.x - upX * best, scratch.z - upZ * best);
      }
      for (let n = 0; n < near.count; n += 1) {
        const index = near.items[n];
        if (!set.raycastOne(index, scratch.x, scratch.y, scratch.z, -upX, -upY, -upZ, best, rayHit)) continue;
        if (rayHit.nx * upX + rayHit.ny * upY + rayHit.nz * upZ < 0.35) continue;
        best = rayHit.t;
        found = true;
        nx = rayHit.nx;
        ny = rayHit.ny;
        nz = rayHit.nz;
        surface = set.surface[index];
      }
      this.wheelSteer[i] = wheel.steered ? this.steerAngle : 0;
      if (!found) {
        this.wheelContact[i] = 0;
        this.wheelOffset[i] = -wheel.travelDown;
        this.wheelLoad[i] = 0;
        this.wheelSlip[i] = 0;
        continue;
      }
      const px = scratch.x - upX * best;
      const py = scratch.y - upY * best;
      const pz = scratch.z - upZ * best;
      const offset = wheel.travelUp - (best - wheel.radius);
      body.velocityAt(px, py, pz, pointVelocity);
      const closing = -(pointVelocity.x * nx + pointVelocity.y * ny + pointVelocity.z * nz);
      let force = wheel.spring * (offset + wheel.staticLoad / wheel.spring) + wheel.damper * closing;
      if (offset > wheel.travelUp) force += wheel.spring * 5 * (offset - wheel.travelUp);
      this.wheelContact[i] = 1;
      this.wheelOffset[i] = offset > wheel.travelUp ? wheel.travelUp : offset;
      this.wheelLoad[i] = force;
      this.wheelSurface[i] = surface;
      this.wheelPoint[i * 3] = px;
      this.wheelPoint[i * 3 + 1] = py;
      this.wheelPoint[i * 3 + 2] = pz;
      this.wheelNormal[i * 3] = nx;
      this.wheelNormal[i * 3 + 1] = ny;
      this.wheelNormal[i * 3 + 2] = nz;
      grounded += 1;
      if (wheel.driven) drivenGrounded += 1;
    }
    // Anti-roll bars move load from the lighter wheel of an axle to the more compressed one.
    for (let i = 0; i + 1 < count; i += 2) {
      if (this.wheelContact[i] === 0 && this.wheelContact[i + 1] === 0) continue;
      const transfer = tuning.antiRoll * (this.wheelOffset[i] - this.wheelOffset[i + 1]);
      if (this.wheelContact[i] !== 0) this.wheelLoad[i] += transfer;
      if (this.wheelContact[i + 1] !== 0) this.wheelLoad[i + 1] -= transfer;
    }
    this.groundedWheels = grounded;

    // Pass 2: tyre forces from the velocities as they are now, then applied all at once.
    const wetness = ground.wetness;
    const massShare = grounded > 0 ? tuning.mass / grounded : 0;
    const stopLimit = massShare / dt;
    for (let i = 0; i < count; i += 1) {
      impulses[i * 3] = impulses[i * 3 + 1] = impulses[i * 3 + 2] = 0;
      if (this.wheelContact[i] === 0) continue;
      const wheel = wheels[i];
      let load = this.wheelLoad[i];
      const maxLoad = wheel.staticLoad * 6;
      if (load < 0) load = 0;
      else if (load > maxLoad) load = maxLoad;
      this.wheelLoad[i] = load;
      const px = this.wheelPoint[i * 3];
      const py = this.wheelPoint[i * 3 + 1];
      const pz = this.wheelPoint[i * 3 + 2];
      const nx = this.wheelNormal[i * 3];
      const ny = this.wheelNormal[i * 3 + 1];
      const nz = this.wheelNormal[i * 3 + 2];
      // The wheel's rolling direction in the ground plane, and the direction across it (to the right).
      const steer = this.wheelSteer[i];
      const cos = Math.cos(steer);
      const sin = Math.sin(steer);
      let fx = forwardX * cos + rightX * sin;
      let fy = forwardY * cos + rightY * sin;
      let fz = forwardZ * cos + rightZ * sin;
      const along = fx * nx + fy * ny + fz * nz;
      fx -= nx * along;
      fy -= ny * along;
      fz -= nz * along;
      const inverse = 1 / Math.sqrt(fx * fx + fy * fy + fz * fz);
      fx *= inverse;
      fy *= inverse;
      fz *= inverse;
      const sx = fy * nz - fz * ny;
      const sy = fz * nx - fx * nz;
      const sz = fx * ny - fy * nx;
      body.velocityAt(px, py, pz, pointVelocity);
      const rolling = pointVelocity.x * fx + pointVelocity.y * fy + pointVelocity.z * fz;
      const sliding = pointVelocity.x * sx + pointVelocity.y * sy + pointVelocity.z * sz;
      const surface = this.wheelSurface[i];
      const grip = tuning.grip * surfaceGripAt(surface, wetness) * (wheel.steered ? 1 : tuning.rearGripScale);
      const locked = handbrake && wheel.handbrake;

      // Along the wheel: engine, then everything that resists rolling (never more than stops it).
      let longForce = wheel.driven && drivenGrounded > 0 && !locked ? driveForce / drivenGrounded : 0;
      let resist = tuning.rollingResistance * load * SURFACE_ROLLING[surface]
        + brake * tuning.brakeForce * (wheel.steered ? tuning.brakeBias : 1 - tuning.brakeBias) * 0.5;
      if (wheel.driven && drivenGrounded > 0) resist += engineBrake / drivenGrounded;
      if (locked) resist += grip * load;
      const stop = Math.abs(rolling) * stopLimit;
      if (resist > stop) resist = stop;
      longForce -= rolling > 0 ? resist : -resist;
      const longLimit = grip * 1.1 * load;
      let spinning = 0;
      if (longForce > longLimit) {
        spinning = longForce / longLimit - 1;
        longForce = longLimit;
      } else if (longForce < -longLimit) {
        spinning = -longForce / longLimit - 1;
        longForce = -longLimit;
      }

      // Across the wheel: rises to the peak at a small slip angle, then lets go gradually.
      const slipAngle = Math.atan2(Math.abs(sliding), Math.abs(rolling) + 0.6);
      const ratio = slipAngle / tuning.peakSlipAngle;
      let shape;
      if (ratio < 1) shape = ratio * (2 - ratio);
      else shape = 1 - (1 - tuning.slideGrip) * Math.min((ratio - 1) * 0.5, 1);
      const sideGrip = grip * (locked ? tuning.handbrakeGrip : 1);
      let sideForce = sideGrip * load * shape;
      const sideStop = Math.abs(sliding) * stopLimit;
      if (sideForce > sideStop) sideForce = sideStop;
      if (sliding > 0) sideForce = -sideForce;

      // One traction circle for both.
      const used = Math.hypot(longForce / (longLimit + 1e-9), sideForce / (sideGrip * load + 1e-9));
      if (used > 1) {
        longForce /= used;
        sideForce /= used;
      }
      const moving = rolling * rolling + sliding * sliding > 9;
      let slip = Math.max(ratio - 1, used - 1, spinning) * 0.7;
      if (locked && moving) slip = 1;
      this.wheelSlip[i] = !moving || slip < 0 ? 0 : slip > 1 ? 1 : slip;
      this.wheelSpinSpeed[i] = locked ? 0 : rolling / wheel.radius;
      impulses[i * 3] = nx * load * dt;
      impulses[i * 3 + 1] = ny * load * dt;
      impulses[i * 3 + 2] = nz * load * dt;
      tyre[i * 3] = (fx * longForce + sx * sideForce) * dt;
      tyre[i * 3 + 1] = (fy * longForce + sy * sideForce) * dt;
      tyre[i * 3 + 2] = (fz * longForce + sz * sideForce) * dt;
    }
    const lift = 1 - tuning.rollInfluence;
    for (let i = 0; i < count; i += 1) {
      if (this.wheelContact[i] === 0) continue;
      const px = this.wheelPoint[i * 3];
      const py = this.wheelPoint[i * 3 + 1];
      const pz = this.wheelPoint[i * 3 + 2];
      // The spring pushes at the contact point; the tyre force is raised towards the centre of
      // mass so that cornering and braking lean the body without tipping it over at once.
      body.applyImpulse(impulses[i * 3], impulses[i * 3 + 1], impulses[i * 3 + 2], px, py, pz);
      const height = ((body.position.x - px) * upX + (body.position.y - py) * upY + (body.position.z - pz) * upZ) * lift;
      body.applyImpulse(tyre[i * 3], tyre[i * 3 + 1], tyre[i * 3 + 2], px + upX * height, py + upY * height, pz + upZ * height);
    }

    // Air: drag against the motion, a little downforce onto the wheels.
    const airSpeed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
    if (airSpeed > 0.5) {
      const drag = tuning.dragCoefficient * airSpeed * dt;
      const down = grounded > 0 ? tuning.downforce * airSpeed * airSpeed * dt : 0;
      body.applyCentralImpulse(-velocity.x * drag - upX * down, -velocity.y * drag - upY * down, -velocity.z * drag - upZ * down);
    }

    // The gear and the engine speed, for the audio and the dashboard.
    const ladder = tuning.gearTopSpeeds;
    if (reverse || forwardSpeed < -0.5) {
      this.gear = -1;
      this.rpm = tuning.idleRpm + (tuning.redlineRpm - tuning.idleRpm) * Math.min(absSpeed / (tuning.reverseSpeed * 1.2), 1);
    } else {
      let gear = this.gear < 1 ? 1 : this.gear;
      if (gear > ladder.length) gear = ladder.length;
      if (gear < ladder.length && absSpeed > ladder[gear - 1] * 0.93) gear += 1;
      else if (gear > 1 && absSpeed < ladder[gear - 2] * 0.62) gear -= 1;
      this.gear = gear;
      const target = tuning.idleRpm + (tuning.redlineRpm - tuning.idleRpm) * Math.min(absSpeed / ladder[gear - 1], 1.02);
      this.rpm += (Math.max(target, tuning.idleRpm + throttle * 900) - this.rpm) * Math.min(dt * 9, 1);
    }
  }

  /**
   * Rolls the wheels on and lets a car at rest go to sleep (called by the world).
   * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world.
   * @param {number} dt The step.
   */
  afterStep(world, dt) {
    const body = this.body;
    if (body.asleep) return;
    for (let i = 0; i < this.wheelCount; i += 1) this.wheelSpin[i] += this.wheelSpinSpeed[i] * dt;
    const v = body.linearVelocity;
    const w = body.angularVelocity;
    const still = v.x * v.x + v.y * v.y + v.z * v.z < REST_SPEED_SQUARED && w.x * w.x + w.y * w.y + w.z * w.z < REST_SPEED_SQUARED;
    if (still && this.input.drive === 0 && this.groundedWheels === this.wheelCount) {
      this.restTimer += dt;
      if (this.restTimer > REST_DELAY) body.sleep();
    } else {
      this.restTimer = 0;
    }
  }
}

const IDENTITY = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const scratch = { x: 0, y: 0, z: 0 };
const scratchQuaternion = { x: 0, y: 0, z: 0, w: 1 };
const pointVelocity = { x: 0, y: 0, z: 0 };
const rayHit = createRayShapeHit();
const impulses = new Float64Array(24);
const tyre = new Float64Array(24);
