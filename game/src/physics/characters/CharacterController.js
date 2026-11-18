// The kinematic capsule controller of a character (the player, a police officer, a pedestrian
// close to the player). Each step it turns the wanted walking velocity into a move that slides
// along walls, cars and props, steps up curbs and stairs, refuses slopes that are too steep,
// follows the ground down slopes, jumps, falls and lands, and is pushed aside (and knocked down)
// by vehicles that drive into it. It never goes under the terrain.
import { LAYER } from '../collisionLayers.js';
import { ConvexPoly, setCapsulePoly } from '../collision/ConvexPoly.js';
import { createSeparatingAxis, findSeparatingAxis } from '../collision/separatingAxis.js';
import { createQueryHit } from '../collision/worldQueries.js';
import { PHYSICS_EVENT } from '../physicsEvents.js';

const SKIN = 0.02;
const SNAP_DISTANCE = 0.3;
const LANDING_SPEED = 5;
const KNOCKDOWN_SPEED = 3.5;
const WALL_MASK = LAYER.STATIC | LAYER.SEE_THROUGH | LAYER.VEHICLE | LAYER.PROP;
const FLOOR_MASK = LAYER.GROUND | LAYER.STATIC | LAYER.SEE_THROUGH;
const PUSHER_LAYERS = LAYER.VEHICLE | LAYER.PROP;

export class CharacterController {
  /**
   * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world to walk in.
   * @param {{x?: number, y?: number, z?: number, radius?: number, height?: number, stepHeight?: number,
   *   slopeLimit?: number, jumpSpeed?: number, mass?: number, userRef?: unknown}} [options] Where the
   *   feet stand (on the ground when `y` is missing), the capsule (radius 0.3, height 1.75), the
   *   highest step (0.35), the steepest walkable slope in radians (0.87, about 50 degrees).
   */
  constructor(world, options = {}) {
    this.world = world;
    this.radius = options.radius ?? 0.3;
    this.height = options.height ?? 1.75;
    this.stepHeight = options.stepHeight ?? 0.35;
    /** The smallest upward part a floor's normal may have and still be walkable. */
    this.minFloorNormal = Math.cos(options.slopeLimit ?? 0.87);
    this.jumpSpeed = options.jumpSpeed ?? 4.6;
    this.mass = options.mass ?? 80;
    /** How fast the walking velocity follows the input, on the ground and in the air, m/s^2. */
    this.acceleration = 32;
    this.airAcceleration = 5;
    const x = options.x ?? 0;
    const z = options.z ?? 0;
    /** Where the feet are. */
    this.position = { x, y: options.y ?? world.ground.heightAt(x, z), z };
    /** Where the feet were at the start of the last step, for interpolated drawing. */
    this.previousPosition = { x, y: this.position.y, z };
    /** Velocity, metres per second. */
    this.velocity = { x: 0, y: 0, z: 0 };
    /** What the character wants: a horizontal velocity in world axes (m/s), and a jump. */
    this.input = { x: 0, z: 0, jump: false };
    /** True while the feet are on something. */
    this.grounded = false;
    /** SURFACE id under the feet (for footsteps). */
    this.surface = 0;
    /** How deep the feet are under the water surface (0 when dry): wading from about 0.4, swimming from about 1.3. */
    this.waterDepth = 0;
    /** Set when a vehicle knocked the character down; the game clears it when the character is up again. */
    this.knockedDown = false;
    /** The game's reference. */
    this.userRef = options.userRef ?? null;
    /** Things the capsule passes through (the vehicle the character is getting into, for example). */
    this.ignore = [];
    world.addActor(this);
  }

  /** Removes the character from its world. */
  dispose() {
    this.world.removeActor(this);
    this.world.triggers.forget(this);
  }

  /**
   * Puts the character somewhere, at rest.
   * @param {number} x Where the feet go.
   * @param {number} y
   * @param {number} z
   */
  placeAt(x, y, z) {
    this.position.x = this.previousPosition.x = x;
    this.position.y = this.previousPosition.y = y;
    this.position.z = this.previousPosition.z = z;
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
    this.grounded = false;
  }

  /**
   * Moves the character for one step (called by the world after the bodies moved).
   * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world.
   * @param {number} dt The step.
   */
  afterStep(world, dt) {
    const p = this.position;
    const v = this.velocity;
    const input = this.input;
    const radius = this.radius;
    const ignore = this.ignore.length > 0 ? this.ignore : null;
    const startX = p.x;
    const startY = p.y;
    const startZ = p.z;
    this.previousPosition.x = startX;
    this.previousPosition.y = startY;
    this.previousPosition.z = startZ;

    // The walking velocity follows the input; gravity and the jump own the vertical part.
    const rate = (this.grounded ? this.acceleration : this.airAcceleration) * dt;
    let changeX = input.x - v.x;
    let changeZ = input.z - v.z;
    const change = Math.sqrt(changeX * changeX + changeZ * changeZ);
    if (change > rate) {
      changeX *= rate / change;
      changeZ *= rate / change;
    }
    v.x += changeX;
    v.z += changeZ;
    if (this.grounded) {
      v.y = 0;
      if (input.jump) {
        v.y = this.jumpSpeed;
        this.grounded = false;
      }
    }
    if (!this.grounded) v.y -= world.gravity * dt;

    // Sideways: sweep the capsule, raised by the step height so that curbs do not stop it, and
    // slide along whatever it meets.
    let moveX = v.x * dt;
    let moveZ = v.z * dt;
    for (let pass = 0; pass < 3; pass += 1) {
      const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
      if (length < 1e-6) break;
      const dx = moveX / length;
      const dz = moveZ / length;
      const low = p.y + this.stepHeight + radius;
      const high = Math.max(p.y + this.height - radius, low + 0.05);
      if (!world.capsuleCast(p.x, low, p.z, p.x, high, p.z, radius, dx, 0, dz, length + SKIN, WALL_MASK, ignore, hit)) {
        p.x += moveX;
        p.z += moveZ;
        break;
      }
      const travel = hit.distance > SKIN ? hit.distance - SKIN : 0;
      p.x += dx * travel;
      p.z += dz * travel;
      let nx = hit.nx;
      let nz = hit.nz;
      const flat = Math.sqrt(nx * nx + nz * nz);
      if (flat < 1e-3) break;
      nx /= flat;
      nz /= flat;
      const rest = length - travel;
      moveX = dx * rest;
      moveZ = dz * rest;
      const into = moveX * nx + moveZ * nz;
      if (into < 0) {
        moveX -= nx * into;
        moveZ -= nz * into;
      }
      const speedInto = v.x * nx + v.z * nz;
      if (speedInto < 0) {
        v.x -= nx * speedInto;
        v.z -= nz * speedInto;
      }
    }

    // The floor under the new place: step up onto it, follow it down, or refuse it when too steep.
    const reach = this.stepHeight + 0.05 + (this.grounded ? SNAP_DISTANCE : 0) + (v.y < 0 ? -v.y * dt : 0);
    let found = world.supportBelow(p.x, p.y + this.stepHeight + 0.05, p.z, reach, FLOOR_MASK, ignore, hit);
    if (found && hit.ny < this.minFloorNormal && hit.y > startY + 0.01) {
      p.x = startX;
      p.z = startZ;
      v.x = 0;
      v.z = 0;
      found = world.supportBelow(p.x, p.y + this.stepHeight + 0.05, p.z, reach, FLOOR_MASK, ignore, hit);
    }
    if (found && v.y <= 0 && (this.grounded || p.y + v.y * dt <= hit.y)) {
      if (!this.grounded && v.y < -LANDING_SPEED) {
        const event = world.events.push(PHYSICS_EVENT.LANDING, world.stepCount);
        event.a = this;
        event.aRef = this.userRef;
        event.x = p.x;
        event.y = hit.y;
        event.z = p.z;
        event.speed = -v.y;
        event.impulse = -v.y * this.mass;
        event.energy = 0.5 * this.mass * v.y * v.y;
        event.surface = hit.surface;
      }
      p.y = hit.y;
      v.y = 0;
      this.grounded = true;
      this.surface = hit.surface;
    } else {
      p.y += v.y * dt;
      this.grounded = false;
      const floor = world.ground.heightAt(p.x, p.z);
      if (p.y < floor) {
        p.y = floor;
        v.y = 0;
        this.grounded = true;
      }
    }

    this.#yieldToBodies(world);
    world.triggers.update(world, this, this.userRef, p.x, p.y + this.height * 0.5, p.z);
    const depth = world.waterHeightAt(p.x, p.z, world.time) - p.y;
    this.waterDepth = depth > 0 ? depth : 0;
  }

  /** Moves out of bodies that overlap the capsule; a fast one knocks the character down. */
  #yieldToBodies(world) {
    const p = this.position;
    const v = this.velocity;
    const radius = this.radius;
    const top = p.y + this.height;
    const bodies = world.bodies;
    for (let i = 0; i < bodies.length; i += 1) {
      const body = bodies[i];
      const b = body.bounds;
      if ((body.layer & PUSHER_LAYERS) === 0 || b[0] > p.x + radius || b[3] < p.x - radius || b[1] > top || b[4] < p.y
        || b[2] > p.z + radius || b[5] < p.z - radius) continue;
      if (this.ignore.includes(body) || (body.userRef !== null && this.ignore.includes(body.userRef))) continue;
      body.refreshPieces();
      for (let k = 0; k < body.worldPieces.length; k += 1) {
        const piece = body.worldPieces[k];
        setCapsulePoly(probe, p.x, p.y + radius, p.z, p.x, Math.max(top - radius, p.y + radius + 0.05), p.z, radius);
        const reach = radius + piece.radius;
        if (!findSeparatingAxis(probe, piece, reach, axis) || axis.separation >= reach) continue;
        let nx = -axis.nx;
        let nz = -axis.nz;
        const flat = Math.sqrt(nx * nx + nz * nz);
        if (flat < 0.2) continue;
        nx /= flat;
        nz /= flat;
        const push = (reach - axis.separation) / flat;
        p.x += nx * push;
        p.z += nz * push;
        body.velocityAt(p.x, p.y + this.height * 0.5, p.z, pointVelocity);
        const closing = (pointVelocity.x - v.x) * nx + (pointVelocity.z - v.z) * nz;
        if (closing <= 0) continue;
        v.x += nx * closing;
        v.z += nz * closing;
        if (closing < KNOCKDOWN_SPEED || this.knockedDown) continue;
        this.knockedDown = true;
        const event = world.events.push(PHYSICS_EVENT.KNOCKDOWN, world.stepCount);
        event.a = this;
        event.aRef = this.userRef;
        event.b = body;
        event.bRef = body.userRef;
        event.x = p.x;
        event.y = p.y + this.height * 0.5;
        event.z = p.z;
        event.nx = nx;
        event.ny = 0;
        event.nz = nz;
        event.speed = closing;
        event.impulse = closing * this.mass;
        event.energy = 0.5 * this.mass * closing * closing;
      }
    }
  }
}

const hit = createQueryHit();
const axis = createSeparatingAxis();
const probe = new ConvexPoly(24, 14, 36);
const pointVelocity = { x: 0, y: 0, z: 0 };
