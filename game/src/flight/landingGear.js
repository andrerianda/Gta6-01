// The ground roll: three wheels (nose, left main, right main), each a spring and damper that finds
// the ground under it with a query straight down, rolls with a little friction, grips sideways,
// brakes (the mains) and steers (the nose wheel). The wheels carry the aircraft, so a normal
// landing never touches the hull; a touchdown is measured by its sink rate, and a leg pushed past
// its travel is reported as bottomed. No allocation per step.
import { MASK } from '../physics/collisionLayers.js';

/**
 * One step of the three wheels: applies their forces to the body and refreshes `state`.
 * @param {LandingGearSpec} spec From deriveLandingGear (airplaneTuning.js).
 * @param {LandingGearState} state From createLandingGearState.
 * @param {object} body The aircraft's RigidBody.
 * @param {object} world The PhysicsWorld (supportBelow).
 * @param {{x: number, y: number, z: number}} centreOfMass In model space.
 * @param {number} steer Nose-wheel demand, -1..1 (+ right).
 * @param {number} brake Wheel brakes, 0..1.
 * @param {object[]} ignore Bodies the wheel queries skip (the aircraft itself).
 * @param {object} hit A query-hit record to reuse.
 * @param {number} dt Seconds.
 * @returns {number} How many wheels are on the ground.
 */
export function stepLandingGear(spec, state, body, world, centreOfMass, steer, brake, ignore, hit, dt) {
  const r = body.rotation;
  // The nose and the right side, flattened onto the ground.
  let forwardX = -r[2];
  let forwardZ = -r[8];
  const flat = Math.sqrt(forwardX * forwardX + forwardZ * forwardZ) || 1;
  forwardX /= flat;
  forwardZ /= flat;
  const speed = Math.abs(body.linearVelocity.x * forwardX + body.linearVelocity.z * forwardZ);
  const fade = speed / spec.steerFadeSpeed;
  const angle = (steer * spec.maxSteer) / (1 + fade * fade);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let grounded = 0;
  state.touchdownSink = 0;
  state.bottomed = false;
  for (let i = 0; i < 3; i += 1) {
    const wheel = spec.wheels[i];
    const tip = body.localToWorld(wheel.x - centreOfMass.x, -spec.sag - centreOfMass.y, wheel.z - centreOfMass.z, point);
    const px = tip.x;
    const pz = tip.z;
    const found = world.supportBelow(px, tip.y + 1.2, pz, 1.2 + 0.25, MASK.SOLID, ignore, hit);
    const squeeze = found ? hit.y - tip.y : -1;
    if (squeeze <= 0) {
      state.contact[i] = 0;
      state.compression[i] = 0;
      continue;
    }
    const py = hit.y;
    body.velocityAt(px, py, pz, velocity);
    const sink = -velocity.y;
    if (state.contact[i] === 0 && sink > state.touchdownSink) state.touchdownSink = sink;
    state.contact[i] = 1;
    state.compression[i] = squeeze;
    let force = wheel.stiffness * squeeze + wheel.damping * sink;
    if (squeeze > spec.travel) {
      force += wheel.stiffness * 6 * (squeeze - spec.travel);
      state.bottomed = true;
    }
    if (force < 0) force = 0;
    else if (force > wheel.load * 14) force = wheel.load * 14;
    if (force <= 0) continue;
    grounded += 1;
    body.applyImpulse(0, force * dt, 0, px, py, pz);

    // The tyre: where it rolls (the nose wheel turned by the steering) and where it grips.
    let rollX = forwardX;
    let rollZ = forwardZ;
    if (wheel.steers) {
      rollX = forwardX * cos - forwardZ * sin;
      rollZ = forwardZ * cos + forwardX * sin;
    }
    const sideX = -rollZ;
    const sideZ = rollX;
    body.velocityAt(px, py, pz, velocity);
    const slide = velocity.x * sideX + velocity.z * sideZ;
    let grip = -slide * body.effectiveMassAt(px, py, pz, sideX, 0, sideZ) * 0.55;
    const most = spec.sideFriction * force * dt;
    grip = grip > most ? most : grip < -most ? -most : grip;
    body.applyImpulse(sideX * grip, 0, sideZ * grip, px, py, pz);
    body.velocityAt(px, py, pz, velocity);
    const rolling = velocity.x * rollX + velocity.z * rollZ;
    const resist = (spec.rollingFriction + (wheel.brakes ? spec.brakeFriction * brake : 0)) * force * dt;
    let drag = -rolling * body.effectiveMassAt(px, py, pz, rollX, 0, rollZ) * 0.9;
    drag = drag > resist ? resist : drag < -resist ? -resist : drag;
    body.applyImpulse(rollX * drag, 0, rollZ * drag, px, py, pz);
  }
  state.wheelsOnGround = grounded;
  return grounded;
}

/**
 * The wheels' state between steps.
 * @returns {LandingGearState}
 */
export function createLandingGearState() {
  return { compression: new Float64Array(3), contact: new Uint8Array(3), wheelsOnGround: 0, touchdownSink: 0, bottomed: false };
}

/** Forgets every contact (the gear is up, or the aircraft was placed somewhere). */
export function clearLandingGearState(state) {
  state.compression.fill(0);
  state.contact.fill(0);
  state.wheelsOnGround = 0;
  state.touchdownSink = 0;
  state.bottomed = false;
}

const point = { x: 0, y: 0, z: 0 };
const velocity = { x: 0, y: 0, z: 0 };

/**
 * @typedef {object} LandingGearSpec
 * @property {number} sag Metres each leg is squeezed standing still.
 * @property {number} travel Metres of squeeze a leg takes before it bottoms.
 * @property {{x: number, z: number, load: number, stiffness: number, damping: number, steers: boolean, brakes: boolean}[]} wheels
 *   Nose, left main, right main: where each touches in model space, its static load (N), spring (N/m) and damper (N s/m).
 * @property {number} rollingFriction
 * @property {number} brakeFriction With the brakes full on.
 * @property {number} sideFriction
 * @property {number} maxSteer Nose-wheel angle at a walk, radians.
 * @property {number} steerFadeSpeed Speed (m/s) at which the steering has halved.
 */

/**
 * @typedef {object} LandingGearState
 * @property {Float64Array} compression Metres per wheel.
 * @property {Uint8Array} contact 1 per wheel on the ground.
 * @property {number} wheelsOnGround
 * @property {number} touchdownSink The hardest sink rate (m/s) of a wheel that touched down this step, 0 otherwise.
 * @property {boolean} bottomed A leg is past its travel this step.
 */
