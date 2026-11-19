// A fixed-wing aircraft: a rigid body flown by real aerodynamics. Each step it reads the air (the
// standard atmosphere, an optional steady wind in world.wind), finds its angle of attack and
// sideslip, and applies lift = 1/2 rho v^2 S CL(alpha) with a stall break, parasitic, induced and
// wave drag, side force, thrust and (through the world) weight. The control surfaces turn it with
// moments that grow with dynamic pressure: the elevator and its trim set the angle of attack the
// aircraft seeks (static stability), the ailerons a roll rate, the rudder a sideslip; the fin
// weathercocks the nose into the relative wind. Three sprung wheels carry it on the ground
// (flight/landingGear.js). The flight assists (casual mode) and the autopilot sit between the
// pilot's input and the surfaces (flight/flightAssists.js, flight/flightAutopilot.js).
// Model space as for every vehicle: origin on the ground under the centre of mass, facing -Z, +X
// to the right. `state` is refreshed every step for the HUD, the cockpit, the audio and the fleet.
import { LAYER, MASK } from '../collisionLayers.js';
import { ConvexPoly, setBoxPoly } from '../collision/ConvexPoly.js';
import { createQueryHit } from '../collision/worldQueries.js';
import { RigidBody } from '../dynamics/RigidBody.js';
import { headingOfQuaternion, multiplyQuaternions, quaternionFromAxisAngle, quaternionFromHeading, rotateVectorByQuaternion } from '../math/vectorMath.js';
import { deriveAirplaneTuning } from '../../flight/airplaneTuning.js';
import { advanceEngineSpool, afterburnerShare, enginePowerShare, engineThrust } from '../../flight/engineThrust.js';
import { createFlightDemand, resolveFlightControls } from '../../flight/flightAssists.js';
import {
  createAutopilotState, disengageAutopilot, engageAutopilot, selectAutopilotMode, setAutopilotRoute, updateAutopilot,
} from '../../flight/flightAutopilot.js';
import { clearLandingGearState, createLandingGearState, stepLandingGear } from '../../flight/landingGear.js';
import { GRAVITY, SEA_LEVEL_DENSITY, createAirSample, recoveryTemperature, standardAtmosphereAt } from '../../flight/standardAtmosphere.js';
import { alphaForLift, dragCoefficient, liftCoefficient, maxLiftCoefficient, sideForceCoefficient } from '../../flight/wingAerodynamics.js';

export { deriveAirplaneTuning };

export class Airplane {
  /**
   * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world to fly in.
   * @param {object} tuning From deriveAirplaneTuning().
   * @param {{x?: number, y?: number, z?: number, heading?: number, userRef?: unknown, speed?: number, engineOn?: boolean}} [options]
   *   Where the model's origin is. Without `y`: parked on its wheels, engine off. With `y`: in
   *   flight at `speed` m/s (default: cruise, within the limits at that height), engine running,
   *   trimmed, gear up when it retracts.
   */
  constructor(world, tuning, options = {}) {
    this.world = world;
    this.tuning = tuning;
    /**
     * The pilot's controls, written by the driver each fixed step: pitch -1..1 (+1 stick back, nose
     * up), roll -1..1 (+1 right wing down), yaw -1..1 (+1 nose right), throttle 0..1 (the lever),
     * brake 0..1 (wheel brakes).
     */
    this.input = { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: 0 };
    /** 'casual' (assists: auto-trim, stall protection, self-levelling) or 'realistic'. */
    this.mode = 'casual';
    this.engineOn = false;
    /** The flap lever: an index into tuning.flapNotches; `flaps` is the travel, 0..1. */
    this.flapNotch = 0;
    this.flaps = 0;
    /** The gear lever and the gear's travel (1 = down and locked). */
    this.gearDown = true;
    this.gear = 1;
    /** Elevator trim, -1 (nose down, fast) .. 1 (nose up, slow). Casual mode trims itself. */
    this.trim = 0;
    this.autopilot = createAutopilotState();
    this.state = createFlightState();
    /** Forward speed (m/s), engine speed (0..1) and delivered power (0..1), as the fleet and the audio read a car. */
    this.speed = 0;
    this.rpm = 0;
    this.throttle = 0;
    /** Height over what is below, metres (the same as state.radarAltitude). */
    this.altitude = 0;
    const com = tuning.centreOfMass;
    const pieces = [boxPiece(tuning.fuselage, com), boxPiece(tuning.wingBox, com)];
    if (tuning.tail) pieces.push(boxPiece(tuning.tail, com));
    /** The rigid body; its origin is the centre of mass. */
    this.body = new RigidBody({
      mass: tuning.mass, inertia: tuning.inertia, pieces, layer: LAYER.VEHICLE, friction: 0.5, restitution: 0.05,
      linearDamping: 0, angularDamping: 0.02, modelOffset: { x: -com.x, y: -com.y, z: -com.z }, userRef: options.userRef ?? null,
    });
    this.body.owner = this;
    this.body.canSleep = false;
    this.wheels = createLandingGearState();
    this.air = createAirSample();
    this.demand = createFlightDemand();
    this.guidance = { active: false, bankTarget: 0, verticalSpeedTarget: 0, throttle: -1 };
    this.sense = {
      x: 0, z: 0, heading: 0, track: 0, altitude: 0, verticalSpeed: 0, airspeed: 0, indicatedAirspeed: 0, groundSpeed: 0,
      acceleration: 0, throttle: 0, onGround: true, stalled: false, roll: 0, rollRate: 0, gamma: 0, stallSpeed: 0,
      dynamicPressure: 0, overspeed: 0, flaps: 0, trim: 0, airborne: 0,
    };
    this.hit = createQueryHit();
    this.ignore = [this.body];
    this.airTime = 0;
    this.restTime = 0;
    this.clock = 0;
    this.gearImpact = 0;
    this.hullTime = 0;
    this.lastSpeed = 0;
    this.before = { x: 0, y: 0, z: 0 };
    this.placeAt(options.x ?? 0, options.y, options.z ?? 0, options.heading ?? 0, options.speed);
    if (options.engineOn !== undefined) this.engineOn = options.engineOn;
    world.addBody(this.body);
    world.addActor(this);
  }

  /**
   * Puts the aircraft somewhere: on its wheels at rest with the engine off when `y` is undefined,
   * otherwise in trimmed level flight at `speed` with the engine running.
   * @param {number} x Where the model's origin goes.
   * @param {number | undefined} y Its height above sea level; on the ground when undefined.
   * @param {number} z
   * @param {number} heading Compass heading (0 = -Z, clockwise seen from above).
   * @param {number} [speed] True airspeed in flight, m/s.
   */
  placeAt(x, y, z, heading, speed) {
    const body = this.body;
    const tuning = this.tuning;
    const com = tuning.centreOfMass;
    const airborne = y !== undefined && y !== null;
    const state = this.state;
    quaternionFromHeading(heading, scratchQuaternion);
    let baseY = this.world.ground.heightAt(x, z);
    let v = 0;
    this.flapNotch = 0;
    this.flaps = 0;
    this.trim = 0;
    this.rpm = 0;
    if (airborne) {
      baseY = y;
      standardAtmosphereAt(y, this.air);
      const air = this.air;
      const limit = Math.min(0.85 * tuning.neverExceedSpeed / Math.sqrt(air.densityRatio), 0.92 * tuning.maxMach * air.speedOfSound);
      v = Math.max(1.3 * tuning.stallSpeedClean / Math.sqrt(air.densityRatio), Math.min(speed ?? tuning.cruiseSpeed, limit));
      const pressure = 0.5 * air.density * v * v;
      const lift = (tuning.mass * GRAVITY) / (pressure * tuning.wing.area);
      const alpha = alphaForLift(tuning.wing, lift, 0);
      // Nose up by the angle of attack level flight needs at this speed.
      quaternionFromAxisAngle(1, 0, 0, alpha, pitchQuaternion);
      multiplyQuaternions(scratchQuaternion, pitchQuaternion, scratchQuaternion);
      this.trim = clampTo((alpha - tuning.trimAlpha) / tuning.trimRange, -1, 1);
      const drag = pressure * tuning.wing.area * dragCoefficient(tuning.wing, lift, alpha, v / air.speedOfSound, 0, 0, 0);
      this.rpm = spoolForThrust(tuning.engine, drag, v, v / air.speedOfSound, air.densityRatio, y);
      this.input.throttle = enginePowerShare(tuning.engine, this.rpm);
    } else {
      this.input.throttle = 0;
    }
    this.engineOn = airborne;
    this.gearDown = !(airborne && tuning.retractableGear);
    this.gear = this.gearDown ? 1 : 0;
    this.input.pitch = this.input.roll = this.input.yaw = this.input.brake = 0;
    rotateVectorByQuaternion(scratchQuaternion, com.x, com.y, com.z, scratch);
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    body.linearVelocity.x = sin * v;
    body.linearVelocity.y = 0;
    body.linearVelocity.z = -cos * v;
    body.angularVelocity.x = body.angularVelocity.y = body.angularVelocity.z = 0;
    body.setPose(x + scratch.x, baseY + scratch.y, z + scratch.z, scratchQuaternion);
    body.wake();
    clearLandingGearState(this.wheels);
    disengageAutopilot(this.autopilot);
    this.airTime = airborne ? 5 : 0;
    this.restTime = 0;
    this.gearImpact = 0;
    this.hullTime = 0;
    this.lastSpeed = v;
    this.speed = v;
    this.throttle = this.input.throttle;
    state.crashed = false;
    state.impact = 0;
    state.stalled = false;
    state.onGround = !airborne;
    state.skinTemperature = this.air.temperature - 273.15;
    state.autopilotDisengaged = 0;
  }

  /** The compass heading of the nose. */
  get heading() {
    return headingOfQuaternion(this.body.quaternion);
  }

  /**
   * Moves the flap lever to a notch of tuning.flapNotches (clamped).
   * @param {number} notch
   * @returns {number} The notch selected.
   */
  setFlaps(notch) {
    const last = this.tuning.flapNotches.length - 1;
    this.flapNotch = notch < 0 ? 0 : notch > last ? last : Math.round(notch);
    return this.flapNotch;
  }

  /**
   * Moves the gear lever. Refused with fixed gear, and on the ground (the wheels carry the aircraft).
   * @param {boolean} down
   * @returns {boolean} Whether the lever is where it was asked to be.
   */
  setGear(down) {
    if (!this.tuning.retractableGear) return down;
    if (!down && (this.state.onGround || this.wheels.wheelsOnGround > 0)) return false;
    this.gearDown = Boolean(down);
    return true;
  }

  /** Engages the autopilot on the present heading and altitude; false on the ground or in a stall. */
  engageAutopilot() {
    return engageAutopilot(this.autopilot, this.sense);
  }

  /** Hands the aircraft back to the pilot. */
  disengageAutopilot() {
    disengageAutopilot(this.autopilot);
  }

  /**
   * Selects 'HDG', 'NAV', 'ALT' or 'VS', or toggles 'ATHR' (engaging the autopilot when it is off).
   * @param {'HDG' | 'NAV' | 'ALT' | 'VS' | 'ATHR'} mode
   * @returns {boolean} Whether the mode is on now.
   */
  setAutopilotMode(mode) {
    return selectAutopilotMode(this.autopilot, mode, this.sense, this.tuning.autoThrottle);
  }

  /**
   * Gives NAV a route to follow (the GPS route), or null to take it away.
   * @param {{x: number, z: number}[] | null} points
   */
  setAutopilotRoute(points) {
    this.sense.x = this.body.position.x;
    this.sense.z = this.body.position.z;
    setAutopilotRoute(this.autopilot, points, this.sense);
  }

  /** Removes the aircraft from its world. */
  dispose() {
    this.world.removeBody(this.body);
    this.world.removeActor(this);
  }

  /**
   * Air data, controls, wheels, engine, aerodynamic forces and moments for one step (called by the world).
   * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world.
   * @param {number} dt The step.
   */
  beforeStep(world, dt) {
    const body = this.body;
    const tuning = this.tuning;
    const wing = tuning.wing;
    const state = this.state;
    const input = this.input;
    if (body.asleep) {
      if (!this.engineOn && input.throttle < 0.02) return;
      body.wake();
    }
    this.clock += dt;
    const r = body.rotation;
    const rightX = r[0], rightY = r[3], rightZ = r[6];
    const upX = r[1], upY = r[4], upZ = r[7];
    const forwardX = -r[2], forwardY = -r[5], forwardZ = -r[8];
    const v = body.linearVelocity;
    const w = body.angularVelocity;
    const p = body.modelPosition(scratch);
    const px = p.x, py = p.y, pz = p.z;

    // The air: density and the speed of sound at this height, and the wind.
    const air = standardAtmosphereAt(py, this.air);
    const wind = world.wind;
    const ax = v.x - (wind ? wind.x : 0);
    const ay = v.y;
    const az = v.z - (wind ? wind.z : 0);
    const airspeed = Math.sqrt(ax * ax + ay * ay + az * az);
    const along = ax * forwardX + ay * forwardY + az * forwardZ;
    const across = ax * rightX + ay * rightY + az * rightZ;
    const through = ax * upX + ay * upY + az * upZ;
    const moving = airspeed > 1;
    const alpha = moving ? Math.atan2(-through, along) : 0;
    const slip = moving ? Math.asin(clampTo(across / airspeed, -1, 1)) : 0;
    const pressure = 0.5 * air.density * airspeed * airspeed;
    const mach = airspeed / air.speedOfSound;
    const indicated = airspeed * Math.sqrt(air.densityRatio);
    const groundSpeed = Math.sqrt(v.x * v.x + v.z * v.z);

    // What is below: the terrain or the sea, and anything solid close under the wheels.
    const terrain = world.ground.heightAt(px, pz);
    const water = world.waterHeightAt(px, pz, world.time);
    let below = terrain > water ? terrain : water;
    if (py - below < 60 && world.supportBelow(px, py + 0.5, pz, 61, MASK.SOLID, this.ignore, this.hit) && this.hit.y > below) below = this.hit.y;
    const radar = Math.min(Math.max(py - below, 0), 2500);
    this.altitude = radar;

    // Flaps and gear travel towards their levers.
    const notches = tuning.flapNotches;
    const flapTarget = notches.length > 1 ? this.flapNotch / (notches.length - 1) : 0;
    this.flaps = approach(this.flaps, flapTarget, dt / tuning.flapTime);
    this.gear = approach(this.gear, this.gearDown ? 1 : 0, dt / tuning.gearTime);
    const flaps = this.flaps;

    // Attitude.
    const pitch = Math.asin(clampTo(forwardY, -1, 1));
    const roll = Math.atan2(-rightY, upY);
    const heading = headingOfQuaternion(body.quaternion);
    const gamma = airspeed > 2 ? Math.asin(clampTo(ay / airspeed, -1, 1)) : 0;
    const rollRate = w.x * forwardX + w.y * forwardY + w.z * forwardZ;
    const pitchRate = w.x * rightX + w.y * rightY + w.z * rightZ;
    const yawRate = -(w.x * upX + w.y * upY + w.z * upZ);

    // Stall and speed limits.
    const clMax = maxLiftCoefficient(wing, flaps);
    const weight = tuning.mass * GRAVITY;
    const stallSpeed = Math.sqrt(weight / (0.5 * SEA_LEVEL_DENSITY * wing.area * clMax));
    const wheelsBefore = this.wheels.wheelsOnGround;
    const flying = wheelsBefore === 0 && airspeed > 5;
    const warnAlpha = alphaForLift(wing, clMax * (stallSpeed / (stallSpeed + 2.6)) ** 2, flaps);
    const stallWarning = flying ? smooth(warnAlpha, wing.criticalAlpha, alpha) : 0;
    const buffet = flying ? smooth(wing.criticalAlpha - 0.02, wing.criticalAlpha + 0.07, alpha) : 0;
    if (!flying) state.stalled = false;
    else if (alpha > wing.criticalAlpha) state.stalled = true;
    else if (alpha < wing.criticalAlpha - 0.035) state.stalled = false;
    const speedRatio = Math.max(indicated / tuning.neverExceedSpeed, mach / tuning.maxMach);
    const overspeed = smooth(0.95, 1.05, speedRatio);

    // The autopilot and the assists: from the pilot's input to what the surfaces ask for.
    const sense = this.sense;
    sense.x = px;
    sense.z = pz;
    sense.heading = heading;
    sense.track = groundSpeed > 3 ? Math.atan2(v.x, -v.z) : heading;
    sense.altitude = py;
    sense.verticalSpeed = v.y;
    sense.airspeed = airspeed;
    sense.indicatedAirspeed = indicated;
    sense.groundSpeed = groundSpeed;
    sense.acceleration = (airspeed - this.lastSpeed) / dt;
    this.lastSpeed = airspeed;
    sense.throttle = input.throttle;
    sense.onGround = wheelsBefore > 0;
    sense.stalled = state.stalled;
    sense.roll = roll;
    sense.rollRate = rollRate;
    sense.gamma = gamma;
    sense.stallSpeed = stallSpeed;
    sense.dynamicPressure = pressure;
    sense.overspeed = overspeed;
    sense.flaps = flaps;
    sense.trim = this.trim;
    this.airTime = wheelsBefore > 0 ? 0 : this.airTime + dt;
    sense.airborne = clampTo(this.airTime / 0.8, 0, 1);
    const autopilot = this.autopilot;
    if (autopilot.engaged && (sense.onGround || state.stalled || state.crashed || Math.abs(input.pitch) > 0.5 || Math.abs(input.roll) > 0.5)) {
      disengageAutopilot(autopilot);
      state.autopilotDisengaged += 1;
    }
    const limits = autopilotLimits;
    limits.maxBank = tuning.autopilotBank;
    limits.maxVerticalSpeed = tuning.autopilotVerticalSpeed;
    limits.autoThrottle = tuning.autoThrottle;
    const guidance = updateAutopilot(autopilot, sense, limits, dt, this.guidance);
    const demand = resolveFlightControls(this.mode, input, sense, tuning, guidance, this.demand);
    this.trim = clampTo(demand.trim, -1, 1);

    // The wheels.
    const parked = !this.engineOn && input.throttle < 0.02;
    const brake = parked ? 1 : clampTo(input.brake, 0, 1);
    let wheels = 0;
    this.gearImpact = 0;
    if (this.gear > 0.95 && radar < 6) {
      wheels = stepLandingGear(tuning.gear, this.wheels, body, world, tuning.centreOfMass, demand.rudder, brake, this.ignore, this.hit, dt);
      const sink = this.wheels.touchdownSink;
      if (sink > tuning.touchdownLimit) {
        this.gearImpact = sink - tuning.touchdownLimit;
        if (sink > tuning.touchdownLimit * 2.2) state.crashed = true;
      }
    } else if (wheelsBefore > 0) clearLandingGearState(this.wheels);

    // The engine.
    if (state.crashed) this.engineOn = false;
    this.rpm = advanceEngineSpool(tuning.engine, this.rpm, demand.throttle, this.engineOn, dt);
    const thrust = engineThrust(tuning.engine, this.rpm, along > 0 ? along : 0, mach, air.densityRatio, py);
    this.throttle = enginePowerShare(tuning.engine, this.rpm);
    body.applyCentralImpulse(forwardX * thrust * dt, forwardY * thrust * dt, forwardZ * thrust * dt);

    // Lift, drag and side force.
    let loadFactor = 0;
    if (airspeed > 0.5) {
      const ux = ax / airspeed, uy = ay / airspeed, uz = az / airspeed;
      const nearGround = clampTo(1 - (radar + tuning.height * 0.35) / (0.5 * tuning.span), 0, 1);
      const groundEffect = nearGround * nearGround;
      const cl = liftCoefficient(wing, alpha, flaps) * (1 + 0.14 * groundEffect);
      let cd = dragCoefficient(wing, cl, alpha, mach, flaps, this.gear, groundEffect);
      // Past the limits the airframe meets a wall of drag (and the pilot an alarm).
      if (speedRatio > 1.02) cd += wing.cd0 * 10 * (speedRatio - 1.02);
      const area = pressure * wing.area;
      const lift = clampTo(area * cl, -12 * weight, 12 * weight);
      const drag = area * cd;
      const side = area * sideForceCoefficient(wing, slip);
      loadFactor = lift / weight;
      // Lift is square to the airflow, in the aircraft's plane of symmetry; the side force along the wing.
      const upAlong = upX * ux + upY * uy + upZ * uz;
      let lx = upX - ux * upAlong, ly = upY - uy * upAlong, lz = upZ - uz * upAlong;
      const liftLength = Math.sqrt(lx * lx + ly * ly + lz * lz);
      let fx = -ux * drag, fy = -uy * drag, fz = -uz * drag;
      if (liftLength > 0.001) {
        const k = lift / liftLength;
        fx += lx * k;
        fy += ly * k;
        fz += lz * k;
      }
      const rightAlong = rightX * ux + rightY * uy + rightZ * uz;
      lx = rightX - ux * rightAlong;
      ly = rightY - uy * rightAlong;
      lz = rightZ - uz * rightAlong;
      const sideLength = Math.sqrt(lx * lx + ly * ly + lz * lz);
      if (sideLength > 0.001) {
        const k = side / sideLength;
        fx += lx * k;
        fy += ly * k;
        fz += lz * k;
      }
      body.applyCentralImpulse(fx * dt, fy * dt, fz * dt);
    }

    // The control and stability moments, as angular accelerations that grow with dynamic pressure.
    const authority = clampTo(pressure / tuning.referencePressure, 0, 3);
    if (authority > 0.001) {
      const root = Math.sqrt(authority);
      const raw = this.mode !== 'casual' && !demand.assisted;
      let alphaTarget = demand.alphaTarget;
      // On the wheels the tail's clearance stops the rotation.
      if (wheels > 0) alphaTarget = Math.min(alphaTarget, alpha + (tuning.maxGroundPitch - pitch));
      const shake = raw ? buffet : buffet * 0.3;
      const pitchPush = tuning.pitchFrequency * tuning.pitchFrequency * authority * (alphaTarget - alpha) + shake * 0.3 * Math.sin(this.clock * 41);
      const pitchNew = (pitchRate + pitchPush * dt) / (1 + 2 * tuning.pitchDamping * tuning.pitchFrequency * root * dt);

      const rollGain = Math.min(1, authority * 2) / tuning.rollTime;
      const rollWanted = demand.rollCommand * tuning.rollRate * Math.min(1, root * 1.15);
      let rollPush = rollGain * rollWanted - tuning.dihedral * slip * authority + shake * 0.35 * Math.sin(this.clock * 29 + 1);
      let yawPush = tuning.yawFrequency * tuning.yawFrequency * authority * (slip * (1 + 2 * demand.coordination) + demand.rudder * tuning.rudderSlip);
      if (raw) {
        // Aileron drag pulls the nose the wrong way; in a stall a dropping wing winds into a gentle spin.
        yawPush -= tuning.yawFrequency * tuning.yawFrequency * authority * 0.05 * demand.rollCommand;
        rollPush += buffet * (1.2 * Math.sin(roll) + 1.6 * yawRate);
        yawPush += buffet * 0.5 * rollRate;
      }
      const rollNew = (rollRate + rollPush * dt) / (1 + rollGain * (1 - 0.6 * (raw ? buffet : 0)) * dt);
      const yawNew = (yawRate + yawPush * dt) / (1 + 2 * tuning.yawDamping * tuning.yawFrequency * root * dt);
      const dRoll = rollNew - rollRate;
      const dPitch = pitchNew - pitchRate;
      const dYaw = yawNew - yawRate;
      w.x += forwardX * dRoll + rightX * dPitch - upX * dYaw;
      w.y += forwardY * dRoll + rightY * dPitch - upY * dYaw;
      w.z += forwardZ * dRoll + rightZ * dPitch - upZ * dYaw;
    }

    // Down in the sea: the flight is over.
    if (water > terrain + 0.2 && py < water - 0.5) {
      if (!state.crashed && airspeed > 8) this.gearImpact = Math.max(this.gearImpact, 3 + airspeed * 0.3);
      state.crashed = true;
      const keep = 1 - Math.min(1, 2.5 * dt);
      v.x *= keep;
      v.y *= keep;
      v.z *= keep;
    }

    // A parked aircraft with its engine off goes to sleep on its wheels.
    if (parked && wheels === 3 && groundSpeed < 0.05 && Math.abs(v.y) < 0.05) {
      this.restTime += dt;
      if (this.restTime > 1.5) {
        v.x = v.y = v.z = 0;
        w.x = w.y = w.z = 0;
        body.sleep();
      }
    } else this.restTime = 0;

    this.speed = v.x * forwardX + v.y * forwardY + v.z * forwardZ;
    this.before.x = v.x;
    this.before.y = v.y;
    this.before.z = v.z;

    state.airspeed = airspeed;
    state.indicatedAirspeed = indicated;
    state.groundSpeed = groundSpeed;
    state.mach = mach;
    state.altitude = py;
    state.radarAltitude = radar;
    state.verticalSpeed = v.y;
    state.heading = heading;
    state.pitch = pitch;
    state.roll = roll;
    state.alpha = alpha;
    state.slip = slip;
    state.loadFactor = wheels > 0 && airspeed < 5 ? 1 : loadFactor;
    state.turnRate = -w.y;
    state.onGround = wheels > 0;
    state.wheelsOnGround = wheels;
    state.stallWarning = stallWarning;
    state.buffet = buffet;
    state.overspeed = overspeed;
    state.thrust = thrust;
    state.throttle = this.throttle;
    state.rpm = this.rpm;
    state.afterburner = afterburnerShare(tuning.engine, this.rpm);
    state.flaps = flaps;
    state.flapNotch = this.flapNotch;
    state.gear = this.gear;
    state.trim = this.trim;
    state.brake = brake;
    state.density = air.density;
    state.outsideTemperature = air.temperature - 273.15;
    const skin = recoveryTemperature(air.temperature, mach) - 273.15;
    state.skinTemperature += (skin - state.skinTemperature) * Math.min(1, dt / tuning.skinTimeConstant);
    state.stallSpeed = stallSpeed;
  }

  /**
   * After the contacts are solved: how hard the hull or the gear was hit this step.
   * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world.
   * @param {number} dt The step.
   */
  afterStep(world, dt) {
    const body = this.body;
    const state = this.state;
    let impact = this.gearImpact;
    if (body.contactCount > 0 && !body.asleep) {
      const v = body.linearVelocity;
      const jolt = Math.hypot(v.x - this.before.x, v.y - this.before.y, v.z - this.before.z);
      if (jolt > 1.2 && jolt > impact) impact = jolt;
      const speed = Math.hypot(v.x, v.y, v.z);
      // The hull dragging along something at flying speed does not end well.
      this.hullTime = speed > 0.6 * this.tuning.stallSpeedClean ? this.hullTime + dt : 0;
      if (this.hullTime > 0.05 && impact < 1 + speed * 0.04) impact = 1 + speed * 0.04;
      if (jolt > 9 || this.hullTime > 0.3) state.crashed = true;
    } else this.hullTime = 0;
    state.impact = impact;
  }
}

/**
 * A fresh flight state record (every field the HUD, the cockpit, the audio and the fleet read).
 * @returns {object}
 */
export function createFlightState() {
  return {
    airspeed: 0, indicatedAirspeed: 0, groundSpeed: 0, mach: 0, altitude: 0, radarAltitude: 0, verticalSpeed: 0,
    heading: 0, pitch: 0, roll: 0, alpha: 0, slip: 0, loadFactor: 1, turnRate: 0, onGround: true, wheelsOnGround: 3,
    stalled: false, stallWarning: 0, buffet: 0, overspeed: 0, thrust: 0, throttle: 0, rpm: 0, afterburner: 0,
    flaps: 0, flapNotch: 0, gear: 1, trim: 0, brake: 0, density: SEA_LEVEL_DENSITY, outsideTemperature: 15,
    skinTemperature: 15, fuel: 1, stallSpeed: 0, impact: 0, crashed: false, autopilotDisengaged: 0,
  };
}

/** The engine speed (0..1) at which the engines give a thrust, by bisection. */
function spoolForThrust(engine, thrust, airspeed, mach, densityRatio, altitude) {
  let low = engine.idle;
  let high = 1;
  for (let i = 0; i < 14; i += 1) {
    const middle = (low + high) * 0.5;
    if (engineThrust(engine, middle, airspeed, mach, densityRatio, altitude) < thrust) low = middle;
    else high = middle;
  }
  return (low + high) * 0.5;
}

function boxPiece(box, com) {
  return setBoxPoly(new ConvexPoly(8, 6, 12), -com.x, box.y - com.y, box.z - com.z, IDENTITY, box.halfX, box.halfY, box.halfZ).clone();
}

function approach(value, target, step) {
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}

function clampTo(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function smooth(low, high, value) {
  const t = value <= low ? 0 : value >= high ? 1 : (value - low) / (high - low);
  return t * t * (3 - 2 * t);
}

const IDENTITY = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const scratch = { x: 0, y: 0, z: 0 };
const scratchQuaternion = { x: 0, y: 0, z: 0, w: 1 };
const pitchQuaternion = { x: 0, y: 0, z: 0, w: 1 };
const autopilotLimits = { maxBank: 0.44, maxVerticalSpeed: 5, autoThrottle: false };
