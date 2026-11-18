// A motorcycle: the Vehicle core on two wheels in line (wheel_f, wheel_r) with a lean model. While a
// rider holds it, the wheels' springs and tyres push through the bike's upright centre plane, so
// they cannot tip it, and a lean controller rolls the body to the lean the turn needs (the angle
// whose tangent is the sideways acceleration over g, which is what a real rider settles at). The
// tyres touch the road on their round profile, so the bike sinks a little as it leans and the
// wheels stay on the road in the picture. A hard hit throws the rider off (PHYSICS_EVENT.
// RIDER_THROWN with the seat point and a launch velocity); without a rider the springs push at the
// real contact points and the bike falls over and slides on its side. A parked bike without a
// rider stands on its side stand (a small lean to the left).
import { LAYER } from '../collisionLayers.js';
import { createRayShapeHit } from '../collision/rayShapes.js';
import { PHYSICS_EVENT } from '../physicsEvents.js';
import { SURFACE_ROLLING, surfaceGripAt } from '../surfaceTypes.js';
import { Vehicle } from './Vehicle.js';

const G = 9.81;
const STAND_LEAN = -0.13;
const LEAN_RATE = 7;

export class Motorcycle extends Vehicle {
  /**
   * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world to ride in.
   * @param {import('./vehicleTuning.js').VehicleTuning} tuning From deriveVehicleTuning() of a
   *   two-wheeler (catalog class 'motorcycle', or two hubs given: wheel_f then wheel_r).
   * @param {{x?: number, z?: number, y?: number, heading?: number, userRef?: unknown, rider?: boolean}} [options]
   *   As for Vehicle; `rider: true` starts it with a rider on (otherwise it stands on its stand).
   */
  constructor(world, tuning, options = {}) {
    super(world, tuning, options);
    /** Lean angle, radians, positive to the right (the top of the bike towards its right). */
    this.lean = 0;
    /** True while someone sits on it and holds it up. */
    this.riderSeated = options.rider === true;
    /** True once it has fallen over (no rider holding it); mount() picks it up again. */
    this.fallen = false;
    /** Where and how fast the rider left the seat in the last crash (the game launches its character from it). */
    this.riderThrow = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    /** A sudden change of velocity (m/s within one step) above this throws the rider. */
    this.crashSpeedChange = 5.5;
    this.lastVelocity = { x: 0, y: 0, z: 0 };
  }

  /** Puts a rider on; a fallen bike is stood up where it lies. */
  mount() {
    if (this.fallen) {
      const p = this.body.modelPosition(scratch);
      this.placeAt(p.x, undefined, p.z, this.heading);
    }
    this.fallen = false;
    this.riderSeated = true;
    this.body.canSleep = false;
    this.body.wake();
  }

  /** The rider gets off; a slow bike is left on its stand, a moving one falls over. */
  dismount() {
    this.riderSeated = false;
    if (Math.abs(this.speed) > 3) this.fallen = true;
  }

  /**
   * The seat point in world space, where the rider sits.
   * @param {{x: number, y: number, z: number}} out Receives it.
   * @returns {{x: number, y: number, z: number}} `out`.
   */
  seatPosition(out) {
    const seat = this.tuning.seat;
    const com = this.tuning.centreOfMass;
    return this.body.localToWorld(seat.x - com.x, seat.y - com.y, seat.z - com.z, out);
  }

  /**
   * Lean, suspension, tyre, engine and air forces for one step (called by the world).
   * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world.
   * @param {number} dt The step.
   */
  beforeStep(world, dt) {
    const body = this.body;
    const input = this.input;
    const velocity = body.linearVelocity;
    if (body.asleep) {
      if (input.drive === 0 || this.fallen) return;
      body.wake();
      this.restTimer = 0;
    }
    const tuning = this.tuning;
    const wheels = tuning.wheels;
    const r = body.rotation;
    const upX = r[1];
    const upY = r[4];
    const upZ = r[7];
    const forwardX = -r[2];
    const forwardY = -r[5];
    const forwardZ = -r[8];
    // The upright frame: the bike's forward axis with the lean taken out.
    let ruX = -forwardZ;
    let ruZ = forwardX;
    const horizontal = Math.sqrt(ruX * ruX + ruZ * ruZ);
    if (horizontal < 1e-3) {
      ruX = r[0];
      ruZ = r[6];
    } else {
      ruX /= horizontal;
      ruZ /= horizontal;
    }
    const uuX = -ruZ * forwardY;
    const uuY = ruZ * forwardX - ruX * forwardZ;
    const uuZ = ruX * forwardY;
    const lean = Math.atan2(-(r[0] * uuX + r[3] * uuY + r[6] * uuZ), r[0] * ruX + r[6] * ruZ);
    this.lean = lean;
    const forwardSpeed = velocity.x * forwardX + velocity.y * forwardY + velocity.z * forwardZ;
    const absSpeed = Math.abs(forwardSpeed);
    this.speed = forwardSpeed;
    if (!this.riderSeated && !this.fallen && absSpeed > 3) this.fallen = true;
    const held = !this.fallen;

    // Pedals as in a car: the drive key brakes first when rolling the other way. Only a rider rides.
    const drive = this.riderSeated ? input.drive : 0;
    let throttle = 0;
    let brake = 0;
    let reverse = false;
    if (drive > 0) {
      if (forwardSpeed < -1) brake = drive;
      else throttle = drive;
    } else if (drive < 0) {
      if (forwardSpeed > 1) brake = -drive;
      else {
        throttle = -drive;
        reverse = true;
      }
    }
    const parked = throttle === 0 && absSpeed < 1.2;
    if (parked || !this.riderSeated) brake = 1;
    this.throttle = throttle;
    this.brake = brake;
    const handbrake = this.riderSeated && input.handbrake > 0;

    const speedSquared = velocity.x * velocity.x + velocity.z * velocity.z;
    let lock = Math.atan((tuning.wheelbase * G * tuning.grip * 1.2) / Math.max(speedSquared, 1)) + 0.01;
    if (lock > tuning.maxSteer) lock = tuning.maxSteer;
    const steerTarget = (this.riderSeated ? input.steer : 0) * lock;
    const steerStep = tuning.steerSpeed * dt * (Math.abs(steerTarget) < Math.abs(this.steerAngle) ? 1.6 : 1);
    if (steerTarget > this.steerAngle + steerStep) this.steerAngle += steerStep;
    else if (steerTarget < this.steerAngle - steerStep) this.steerAngle -= steerStep;
    else this.steerAngle = steerTarget;

    let driveForce = 0;
    if (throttle > 0) {
      if (reverse) {
        if (forwardSpeed > -tuning.reverseSpeed * 0.5) driveForce = -throttle * tuning.maxDriveForce * 0.3;
      } else if (forwardSpeed < tuning.topSpeed * 1.04) {
        driveForce = throttle * Math.min(tuning.maxDriveForce, tuning.power / Math.max(absSpeed, 3));
      }
    }
    const engineBrake = throttle === 0 && !parked ? tuning.mass * 0.6 : 0;

    const set = world.statics;
    const near = this.near;
    near.count = 0;
    if (set.count > 0) {
      const b = body.bounds;
      set.query(b[0] - 0.4, b[1] - 1.2, b[2] - 0.4, b[3] + 0.4, b[4], b[5] + 0.4, LAYER.STATIC | LAYER.SEE_THROUGH, near);
    }

    // Wheels: held up, each ray runs down the upright frame and the tyre meets the road on its
    // round profile; fallen, the rays run down the bike's own up axis like a car's.
    const ground = world.ground;
    const com = tuning.centreOfMass;
    const cosLean = Math.abs(Math.cos(lean));
    const dirX = held ? -uuX : -upX;
    const dirY = held ? -uuY : -upY;
    const dirZ = held ? -uuZ : -upZ;
    const pos = body.position;
    let grounded = 0;
    for (let i = 0; i < 2; i += 1) {
      const wheel = wheels[i];
      const reachRadius = held ? (wheel.radius - tuning.tyreCrown) * cosLean + tuning.tyreCrown : wheel.radius;
      body.localToWorld(wheel.x - com.x, wheel.y - com.y, wheel.z - com.z, scratch);
      const ox = scratch.x - dirX * wheel.travelUp;
      const oy = scratch.y - dirY * wheel.travelUp;
      const oz = scratch.z - dirZ * wheel.travelUp;
      const reach = wheel.travelUp + wheel.travelDown + reachRadius;
      let best = reach;
      let found = false;
      let nx = 0;
      let ny = 1;
      let nz = 0;
      let surface = 0;
      if (ground.castShort(ox, oy, oz, dirX, dirY, dirZ, reach, rayHit)) {
        best = rayHit.t;
        found = true;
        nx = rayHit.nx;
        ny = rayHit.ny;
        nz = rayHit.nz;
        surface = ground.surfaceAt(ox + dirX * best, oz + dirZ * best);
      }
      for (let n = 0; n < near.count; n += 1) {
        const index = near.items[n];
        if (!set.raycastOne(index, ox, oy, oz, dirX, dirY, dirZ, best, rayHit)) continue;
        if (-(rayHit.nx * dirX + rayHit.ny * dirY + rayHit.nz * dirZ) < 0.35) continue;
        best = rayHit.t;
        found = true;
        nx = rayHit.nx;
        ny = rayHit.ny;
        nz = rayHit.nz;
        surface = set.surface[index];
      }
      this.wheelSteer[i] = i === 0 ? this.steerAngle : 0;
      if (!found) {
        this.wheelContact[i] = 0;
        this.wheelOffset[i] = -wheel.travelDown;
        this.wheelLoad[i] = 0;
        this.wheelSlip[i] = 0;
        this.wheelSpinSpeed[i] *= 0.99;
        continue;
      }
      let px = ox + dirX * best;
      let py = oy + dirY * best;
      let pz = oz + dirZ * best;
      if (held) {
        // Through the centre plane: no leverage about the roll axis.
        const side = (px - pos.x) * ruX + (pz - pos.z) * ruZ;
        px -= ruX * side;
        pz -= ruZ * side;
      }
      const offset = wheel.travelUp - (best - reachRadius);
      body.velocityAt(px, py, pz, pointVelocity);
      const closing = -(pointVelocity.x * nx + pointVelocity.y * ny + pointVelocity.z * nz);
      let force = wheel.spring * (offset + wheel.staticLoad / wheel.spring) + wheel.damper * closing;
      if (offset > wheel.travelUp) force += wheel.spring * 5 * (offset - wheel.travelUp);
      if (force < 0) force = 0;
      else if (force > wheel.staticLoad * 6) force = wheel.staticLoad * 6;
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
    }
    this.groundedWheels = grounded;

    // Tyres along the upright frame (a lean does not turn the wheel's rolling direction).
    const wetness = ground.wetness;
    const stopLimit = grounded > 0 ? tuning.mass / grounded / dt : 0;
    for (let i = 0; i < 2; i += 1) {
      if (this.wheelContact[i] === 0) continue;
      const wheel = wheels[i];
      const load = this.wheelLoad[i];
      const px = this.wheelPoint[i * 3];
      const py = this.wheelPoint[i * 3 + 1];
      const pz = this.wheelPoint[i * 3 + 2];
      const nx = this.wheelNormal[i * 3];
      const ny = this.wheelNormal[i * 3 + 1];
      const nz = this.wheelNormal[i * 3 + 2];
      const cos = Math.cos(this.wheelSteer[i]);
      const sin = Math.sin(this.wheelSteer[i]);
      let fx = forwardX * cos + ruX * sin;
      let fy = forwardY * cos;
      let fz = forwardZ * cos + ruZ * sin;
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
      const grip = tuning.grip * surfaceGripAt(surface, wetness) * (held ? 1 : 0.6);
      const locked = handbrake && i === 1;
      let longForce = wheel.driven && !locked ? driveForce : 0;
      let resist = tuning.rollingResistance * load * SURFACE_ROLLING[surface]
        + brake * tuning.brakeForce * (i === 0 ? tuning.brakeBias : 1 - tuning.brakeBias);
      if (wheel.driven) resist += engineBrake;
      if (locked) resist += grip * load;
      const stop = Math.abs(rolling) * stopLimit;
      if (resist > stop) resist = stop;
      longForce -= rolling > 0 ? resist : -resist;
      // Under power the weight shifts onto the rear tyre, up to all of it.
      const driveLoad = wheel.driven && longForce > 0 ? Math.max(load, Math.min(this.wheelLoad[0] + load, tuning.mass * G)) : load;
      const longLimit = grip * 1.1 * driveLoad;
      let spinning = 0;
      if (Math.abs(longForce) > longLimit) {
        spinning = Math.abs(longForce) / longLimit - 1;
        longForce = longForce > 0 ? longLimit : -longLimit;
      }
      const slipAngle = Math.atan2(Math.abs(sliding), Math.abs(rolling) + 0.6);
      const ratio = slipAngle / tuning.peakSlipAngle;
      const shape = ratio < 1 ? ratio * (2 - ratio) : 1 - (1 - tuning.slideGrip) * Math.min((ratio - 1) * 0.5, 1);
      const sideGrip = grip * (locked ? tuning.handbrakeGrip : 1);
      let sideForce = sideGrip * load * shape;
      const sideStop = Math.abs(sliding) * stopLimit;
      if (sideForce > sideStop) sideForce = sideStop;
      if (sliding > 0) sideForce = -sideForce;
      const used = Math.hypot(longForce / (longLimit + 1e-9), sideForce / (sideGrip * load + 1e-9));
      if (used > 1) {
        longForce /= used;
        sideForce /= used;
      }
      const moving = rolling * rolling + sliding * sliding > 9;
      const slip = (locked && moving) ? 1 : Math.max(ratio - 1, used - 1, spinning) * 0.7;
      this.wheelSlip[i] = !moving || slip < 0 ? 0 : slip > 1 ? 1 : slip;
      this.wheelSpinSpeed[i] = locked ? 0 : rolling / wheel.radius;
      body.applyImpulse(nx * load * dt, ny * load * dt, nz * load * dt, px, py, pz);
      // Held up, the side force acts at the height of the centre of mass (it turns the bike but
      // cannot tip it) and the drive and brakes at half of it (the bike dips under braking).
      const height = (pos.x - px) * uuX + (pos.y - py) * uuY + (pos.z - pz) * uuZ;
      const sideLift = held ? height : height * 0.5;
      const longLift = height * 0.5;
      body.applyImpulse(sx * sideForce * dt, sy * sideForce * dt, sz * sideForce * dt,
        px + uuX * sideLift, py + uuY * sideLift, pz + uuZ * sideLift);
      body.applyImpulse(fx * longForce * dt, fy * longForce * dt, fz * longForce * dt,
        px + uuX * longLift, py + uuY * longLift, pz + uuZ * longLift);
    }

    // The lean controller: roll towards the lean the turn needs (or the stand's lean when parked).
    const w = body.angularVelocity;
    if (held) {
      let target;
      if (this.riderSeated) {
        const yawRate = w.x * uuX + w.y * uuY + w.z * uuZ;
        const fade = absSpeed < 2 ? absSpeed / 2 : 1;
        target = Math.atan((forwardSpeed * -yawRate) / G) * fade;
        if (target > tuning.maxLean) target = tuning.maxLean;
        else if (target < -tuning.maxLean) target = -tuning.maxLean;
      } else {
        target = STAND_LEAN;
      }
      const rollRate = w.x * forwardX + w.y * forwardY + w.z * forwardZ;
      const change = ((target - lean) * LEAN_RATE - rollRate) * 0.5;
      w.x += forwardX * change;
      w.y += forwardY * change;
      w.z += forwardZ * change;
    }

    const airSpeed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
    if (airSpeed > 0.5) {
      const drag = tuning.dragCoefficient * airSpeed * dt;
      body.applyCentralImpulse(-velocity.x * drag, -velocity.y * drag, -velocity.z * drag);
    }

    const ladder = tuning.gearTopSpeeds;
    if (reverse || forwardSpeed < -0.5) {
      this.gear = -1;
      this.rpm = tuning.idleRpm + (tuning.redlineRpm - tuning.idleRpm) * Math.min(absSpeed / 4, 1);
    } else {
      let gear = this.gear < 1 ? 1 : this.gear;
      if (gear > ladder.length) gear = ladder.length;
      if (gear < ladder.length && absSpeed > ladder[gear - 1] * 0.93) gear += 1;
      else if (gear > 1 && absSpeed < ladder[gear - 2] * 0.62) gear -= 1;
      this.gear = gear;
      const target = tuning.idleRpm + (tuning.redlineRpm - tuning.idleRpm) * Math.min(absSpeed / ladder[gear - 1], 1.02);
      this.rpm += (Math.max(target, tuning.idleRpm + throttle * 1400) - this.rpm) * Math.min(dt * 12, 1);
    }
    this.lastVelocity.x = velocity.x;
    this.lastVelocity.y = velocity.y;
    this.lastVelocity.z = velocity.z;
  }

  /**
   * Rolls the wheels on, throws the rider off in a crash, lets a fallen bike sleep.
   * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world.
   * @param {number} dt The step.
   */
  afterStep(world, dt) {
    const body = this.body;
    if (body.asleep) return;
    const v = body.linearVelocity;
    const last = this.lastVelocity;
    const dx = v.x - last.x;
    const dy = v.y - last.y;
    const dz = v.z - last.z;
    const change = Math.sqrt(dx * dx + dz * dz + dy * dy * 0.25);
    if (this.riderSeated) {
      if (change > this.crashSpeedChange || Math.abs(this.lean) > this.tuning.maxLean + 0.5) this.#throwRider(world, change);
    } else if (!this.fallen && change > 2.5) {
      this.fallen = true;
    }
    body.canSleep = this.fallen;
    if (this.fallen) {
      for (let i = 0; i < 2; i += 1) this.wheelSpin[i] += this.wheelSpinSpeed[i] * dt;
      return;
    }
    super.afterStep(world, dt);
  }

  #throwRider(world, change) {
    const last = this.lastVelocity;
    const seat = this.seatPosition(scratch);
    const out = this.riderThrow;
    const speed = Math.sqrt(last.x * last.x + last.z * last.z);
    out.x = seat.x;
    out.y = seat.y;
    out.z = seat.z;
    out.vx = last.x * 0.85;
    out.vy = Math.max(last.y, 0) + 1.5 + speed * 0.12;
    out.vz = last.z * 0.85;
    this.riderSeated = false;
    this.fallen = true;
    const event = world.events.push(PHYSICS_EVENT.RIDER_THROWN, world.stepCount);
    event.a = this.body;
    event.aRef = this.body.userRef;
    event.x = seat.x;
    event.y = seat.y;
    event.z = seat.z;
    event.speed = speed;
    event.impulse = change * this.tuning.mass;
  }
}

const scratch = { x: 0, y: 0, z: 0 };
const pointVelocity = { x: 0, y: 0, z: 0 };
const rayHit = createRayShapeHit();
