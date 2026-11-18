// The physics world: the terrain, the static colliders of the city (added and removed by handle
// or by sector), the rigid bodies, and the fixed 60 Hz step that moves them. One step applies
// gravity, lets the actors (vehicles, boats, characters...) apply their forces, finds contacts,
// solves them, moves the bodies and reports impacts in the event queue. Queries (ray, sphere and
// capsule casts, overlaps, support, line of sight) are methods of the world. No three.js here.
import { LAYER, MASK } from './collisionLayers.js';
import { PHYSICS_EVENT, PhysicsEventQueue } from './physicsEvents.js';
import { quaternionFromHeading, matrixFromQuaternion } from './math/vectorMath.js';
import { collectBodyContacts, collectGroundContacts, collectStaticContacts } from './collision/bodyContacts.js';
import { addStaticDescriptions, buildBodyPieces } from './collision/colliderDescriptions.js';
import { GroundSurface } from './collision/GroundSurface.js';
import { COLLIDER_TYPE, StaticColliderSet } from './collision/StaticColliderSet.js';
import { TriggerTracker } from './collision/triggerTracker.js';
import {
  castCapsule, castRay, castSphere, createOverlapList, createQueryHit, findSupportBelow, hasLineOfSight, overlapCapsule,
  overlapSphere,
} from './collision/worldQueries.js';
import { ContactSolver, GROUND_CONTACT } from './dynamics/contactSolver.js';
import { RigidBody } from './dynamics/RigidBody.js';
import { surfaceIdOf } from './surfaceTypes.js';

/**
 * What a physics world is made with.
 * @typedef {object} PhysicsWorldOptions
 * @property {import('./collision/GroundSurface.js').GroundProvider} [ground] The terrain (flat at y = 0 when missing).
 * @property {(x: number, z: number, time: number) => number} [waterHeightAt] The sea surface height (default 0).
 * @property {number} [gravity] Downward acceleration (default 9.81).
 * @property {number} [cellSize] Side of the static colliders' hash cells in metres (default 16).
 */

/**
 * Something that takes part in every step: a vehicle, a boat, a character, a prop.
 * @typedef {object} PhysicsActor
 * @property {(world: PhysicsWorld, dt: number) => void} [beforeStep] Called after gravity and
 *   before contacts: apply forces and impulses to bodies here.
 * @property {(world: PhysicsWorld, dt: number) => void} [afterStep] Called after the bodies moved.
 */

const IMPACT_SPEED = 1.5;
const SLEEP_ENERGY = 0.02;
const SLEEP_DELAY = 0.6;
const WAKE_SPEED_SQUARED = 0.04;

export class PhysicsWorld {
  /** @param {PhysicsWorldOptions} [options] */
  constructor(options = {}) {
    /** The length of one step in seconds. */
    this.fixedStep = 1 / 60;
    /** Downward acceleration, metres per second squared. */
    this.gravity = options.gravity ?? 9.81;
    /** The terrain. */
    this.ground = new GroundSurface(options.ground);
    /** The sea surface height at a place and time. */
    this.waterHeightAt = options.waterHeightAt ?? flatSea;
    /** The static colliders. */
    this.statics = new StaticColliderSet(options.cellSize ?? 16);
    /** @type {RigidBody[]} Every rigid body in the world. */
    this.bodies = [];
    /** @type {PhysicsActor[]} Everything that acts in each step. */
    this.actors = [];
    /**
     * Every character capsule (CharacterController adds itself): seen by the queries on
     * LAYER.CHARACTER and kept apart from each other after each step. Kept sorted by X.
     * @type {import('./characters/CharacterController.js').CharacterController[]}
     */
    this.characters = [];
    /** Events for the game: read `events.items[0 .. events.count)` after stepping, then clear(). */
    this.events = new PhysicsEventQueue();
    /** The contact solver; its points of the last step stay readable for debug drawing. */
    this.solver = new ContactSolver();
    /** How many steps the world has taken. */
    this.stepCount = 0;
    /** Simulated time in seconds. */
    this.time = 0;
    /** Time handed to advance() that has not been simulated yet. */
    this.accumulator = 0;
    /** How far the world is between its last two steps, 0 to 1, for interpolated drawing. */
    this.alpha = 1;
    /** A hit object the queries use when the caller gives none. */
    this.hit = createQueryHit();
    /** An overlap list the queries use when the caller gives none. */
    this.overlaps = createOverlapList(64);
    /** Who is inside which trigger volume (colliders on LAYER.TRIGGER). */
    this.triggers = new TriggerTracker();
    /** @type {RigidBody[]} */
    this.sorted = [];
  }

  // ---- static geometry ------------------------------------------------------------------------

  /**
   * Adds static colliders from descriptions (the collision proxies of an asset, or city shapes).
   * @param {import('./collision/colliderDescriptions.js').ColliderDescription[]} descriptions The proxies.
   * @param {import('./collision/colliderDescriptions.js').ColliderPlacement} [placement] Where they stand.
   * @param {import('./collision/colliderDescriptions.js').ColliderOptions} [options] Layer, surface,
   *   user reference and group (a sector id; see removeStaticGroup).
   * @returns {number[]} One handle per description.
   */
  addStatics(descriptions, placement, options) {
    return addStaticDescriptions(this.statics, descriptions, placement, options);
  }

  /**
   * Adds one static oriented box.
   * @param {number} x Centre.
   * @param {number} y
   * @param {number} z
   * @param {number} halfX Half sizes along the box's own axes.
   * @param {number} halfY
   * @param {number} halfZ
   * @param {number} [heading] Compass heading of the box's -Z (0 = north, clockwise).
   * @param {import('./collision/colliderDescriptions.js').ColliderOptions} [options]
   * @returns {number} The handle.
   */
  addStaticBox(x, y, z, halfX, halfY, halfZ, heading = 0, options = {}) {
    matrixFromQuaternion(quaternionFromHeading(heading, scratchQuaternion), scratchRotation);
    return this.statics.add(COLLIDER_TYPE.BOX, options.layer ?? LAYER.STATIC, surfaceIdOf(options.surface ?? 1), x, y, z,
      scratchRotation, halfX, halfY, halfZ, null, options.userRef ?? null, options.group ?? 0);
  }

  /**
   * Adds one static upright cylinder (a pole, a trunk, a bollard).
   * @param {number} x Centre.
   * @param {number} y
   * @param {number} z
   * @param {number} radius
   * @param {number} halfHeight
   * @param {import('./collision/colliderDescriptions.js').ColliderOptions} [options]
   * @returns {number} The handle.
   */
  addStaticCylinder(x, y, z, radius, halfHeight, options = {}) {
    return this.statics.add(COLLIDER_TYPE.CYLINDER, options.layer ?? LAYER.STATIC, surfaceIdOf(options.surface ?? 1),
      x, y, z, IDENTITY_ROTATION, radius, halfHeight, 0, null, options.userRef ?? null, options.group ?? 0);
  }

  /**
   * Adds a box-shaped trigger volume: it blocks nothing, and bodies and characters whose centre
   * enters or leaves it are reported as TRIGGER_ENTER and TRIGGER_EXIT events. (Any description
   * added with `layer: LAYER.TRIGGER` is a trigger too.)
   * @returns {number} The handle (remove it with removeStatic).
   */
  addTriggerBox(x, y, z, halfX, halfY, halfZ, heading = 0, options = {}) {
    return this.addStaticBox(x, y, z, halfX, halfY, halfZ, heading, { ...options, layer: LAYER.TRIGGER });
  }

  /**
   * Removes a static collider.
   * @param {number} handle Its handle.
   * @returns {boolean} True when it existed.
   */
  removeStatic(handle) {
    return this.statics.remove(handle);
  }

  /**
   * Removes every static collider of a group (a city sector streaming out).
   * @param {number} group The group id given when they were added.
   * @returns {number} How many were removed.
   */
  removeStaticGroup(group) {
    return this.statics.removeGroup(group);
  }

  // ---- bodies and actors ----------------------------------------------------------------------

  /**
   * Creates a rigid body and adds it to the world.
   * @param {import('./dynamics/RigidBody.js').RigidBodyOptions & {colliders?: import('./collision/colliderDescriptions.js').ColliderDescription[],
   *   centreOfMass?: {x: number, y: number, z: number}}} options The body; `colliders` are proxies
   *   in model space and `centreOfMass` is where the body's origin sits in that space.
   * @returns {RigidBody}
   */
  createBody(options) {
    const centre = options.centreOfMass ?? ZERO;
    const pieces = options.pieces ?? buildBodyPieces(options.colliders ?? [], centre.x, centre.y, centre.z);
    const body = new RigidBody({
      ...options, pieces, modelOffset: options.modelOffset ?? { x: -centre.x, y: -centre.y, z: -centre.z },
    });
    return this.addBody(body);
  }

  /**
   * Adds a rigid body.
   * @param {RigidBody} body The body.
   * @returns {RigidBody} The same body.
   */
  addBody(body) {
    this.bodies.push(body);
    this.sorted.push(body);
    return body;
  }

  /**
   * Removes a rigid body.
   * @param {RigidBody} body The body.
   */
  removeBody(body) {
    removeFrom(this.bodies, body);
    removeFrom(this.sorted, body);
    this.triggers.forget(body);
  }

  /**
   * Adds an actor: its beforeStep and afterStep run in every step, in the order actors were added.
   * @param {PhysicsActor} actor The actor.
   * @returns {PhysicsActor} The same actor.
   */
  addActor(actor) {
    this.actors.push(actor);
    return actor;
  }

  /** @param {PhysicsActor} actor The actor to remove. */
  removeActor(actor) {
    removeFrom(this.actors, actor);
  }

  /**
   * Pushes everything near a blast away from it: impulses with a quadratic falloff to the bodies
   * (lifting them a little) and a velocity kick to the characters through their push(), which
   * knocks down those in the inner half of the radius. Reports nothing: the game announces the
   * explosion itself.
   * @param {number} x The centre of the blast.
   * @param {number} y
   * @param {number} z
   * @param {{radius?: number, power?: number, characterSpeed?: number, ignore?: ArrayLike<unknown> | null}} [options]
   *   Radius (8 m), the impulse at the centre in N s (9000), the kick a character gets at the centre
   *   in m/s (14 out, 6 up), and bodies, characters or userRefs left alone.
   * @returns {number} How many bodies and characters were pushed.
   */
  explode(x, y, z, options = {}) {
    const radius = options.radius ?? 8;
    const power = options.power ?? 9000;
    const kick = options.characterSpeed ?? 14;
    const ignore = options.ignore ?? null;
    let pushed = 0;
    for (let i = 0; i < this.bodies.length; i += 1) {
      const body = this.bodies[i];
      if (body.kinematic || (ignore !== null && isIgnoredBy(ignore, body, body.userRef))) continue;
      const dx = body.position.x - x;
      const dy = body.position.y - y;
      const dz = body.position.z - z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance >= radius) continue;
      const share = (1 - distance / radius) ** 2;
      const inverse = 1 / Math.max(distance, 0.5);
      const impulse = power * share;
      body.wake();
      body.applyImpulse(dx * inverse * impulse, (Math.abs(dy) * inverse + 0.6) * impulse, dz * inverse * impulse,
        x + dx * 0.6, y + dy * 0.6, z + dz * 0.6);
      pushed += 1;
    }
    for (let i = 0; i < this.characters.length; i += 1) {
      const character = this.characters[i];
      if (!character.active || (ignore !== null && isIgnoredBy(ignore, character, character.userRef))) continue;
      const p = character.position;
      const dx = p.x - x;
      const dy = p.y + character.height * 0.5 - y;
      const dz = p.z - z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance >= radius) continue;
      const share = (1 - distance / radius) ** 2;
      const flat = Math.sqrt(dx * dx + dz * dz);
      const ux = flat > 0.05 ? dx / flat : 0;
      const uz = flat > 0.05 ? dz / flat : 0;
      character.push(ux * kick * share, kick * 0.43 * share, uz * kick * share, share > 0.25);
      pushed += 1;
    }
    return pushed;
  }

  /** Adds a character capsule (CharacterController does this itself). */
  addCharacter(character) {
    this.characters.push(character);
    return character;
  }

  /** Removes a character capsule. */
  removeCharacter(character) {
    removeFrom(this.characters, character);
  }

  /**
   * Keeps the active, solid character capsules apart: each overlapping pair moves apart along the
   * line between them (the lighter one more) without going through walls, and loses the speed it
   * closes with. Runs after the characters moved in each step.
   */
  #separateCharacters() {
    const list = this.characters;
    const count = list.length;
    if (count < 2) return;
    let widest = 0;
    for (let i = 1; i < count; i += 1) {
      const character = list[i];
      let j = i - 1;
      while (j >= 0 && list[j].position.x > character.position.x) {
        list[j + 1] = list[j];
        j -= 1;
      }
      list[j + 1] = character;
    }
    for (let i = 0; i < count; i += 1) if (list[i].radius > widest) widest = list[i].radius;
    // A few relaxation passes: a crowd pressing together needs more than one.
    for (let pass = 0; pass < 3; pass += 1) if (this.#separationPass(list, count, widest, pass === 0) === 0) break;
  }

  /** One pass over the overlapping pairs; returns how many it moved apart. */
  #separationPass(list, count, widest, firstPass) {
    let moved = 0;
    for (let i = 0; i < count; i += 1) {
      const a = list[i];
      if (!a.active || !a.solid) continue;
      const pa = a.position;
      for (let j = i + 1; j < count; j += 1) {
        const b = list[j];
        const pb = b.position;
        if (pb.x - pa.x >= a.radius + widest) break;
        if (!b.active || !b.solid) continue;
        const reach = a.radius + b.radius;
        const inner = reach - 0.001;
        const dx = pb.x - pa.x;
        const dz = pb.z - pa.z;
        const squared = dx * dx + dz * dz;
        if (squared >= inner * inner || pa.y >= pb.y + b.height || pb.y >= pa.y + a.height) continue;
        if (a.ignores(b) || b.ignores(a)) continue;
        const distance = Math.sqrt(squared);
        // Two on the same spot part along a direction fixed by their order (deterministic).
        const nx = distance > 1e-4 ? dx / distance : 1;
        const nz = distance > 1e-4 ? dz / distance : 0;
        const overlap = reach - distance;
        const shareA = b.mass / (a.mass + b.mass);
        const shareB = 1 - shareA;
        // What one cannot take (it stands against a wall) the other takes.
        const movedA = a.nudge(this, -nx * overlap * shareA, -nz * overlap * shareA);
        const rest = overlap - movedA;
        b.nudge(this, nx * rest, nz * rest);
        moved += 1;
        if (!firstPass) continue;
        const va = a.velocity;
        const vb = b.velocity;
        const closing = (vb.x - va.x) * nx + (vb.z - va.z) * nz;
        if (closing < 0) {
          va.x += nx * closing * shareA;
          va.z += nz * closing * shareA;
          vb.x -= nx * closing * shareB;
          vb.z -= nz * closing * shareB;
        }
      }
    }
    return moved;
  }

  // ---- stepping -------------------------------------------------------------------------------

  /**
   * Advances the world by real time in fixed steps. Time beyond `maxSteps` steps is dropped, so a
   * slow frame slows the game down instead of piling up work.
   * @param {number} seconds Time since the last call.
   * @param {number} [maxSteps] The most steps to take now.
   * @returns {number} How many steps were taken.
   */
  advance(seconds, maxSteps = 5) {
    this.accumulator += seconds;
    let steps = 0;
    while (this.accumulator >= this.fixedStep && steps < maxSteps) {
      this.step();
      this.accumulator -= this.fixedStep;
      steps += 1;
    }
    if (this.accumulator >= this.fixedStep) this.accumulator = 0;
    this.alpha = this.accumulator / this.fixedStep;
    return steps;
  }

  /** Takes one fixed step. */
  step() {
    const dt = this.fixedStep;
    const bodies = this.bodies;
    const actors = this.actors;
    const solver = this.solver;
    const statics = this.statics;
    const gravity = this.gravity * dt;

    for (let i = 0; i < bodies.length; i += 1) {
      const body = bodies[i];
      body.storePrevious();
      body.contactCount = 0;
      if (body.asleep || body.kinematic) continue;
      const v = body.linearVelocity;
      const w = body.angularVelocity;
      v.y -= gravity * body.gravityScale;
      const keepLinear = 1 - body.linearDamping * dt;
      const keepAngular = 1 - body.angularDamping * dt;
      v.x *= keepLinear;
      v.y *= keepLinear;
      v.z *= keepLinear;
      w.x *= keepAngular;
      w.y *= keepAngular;
      w.z *= keepAngular;
    }

    for (let i = 0; i < actors.length; i += 1) {
      const actor = actors[i];
      if (actor.beforeStep !== undefined) actor.beforeStep(this, dt);
    }

    // Contacts of every awake body with the terrain and the static colliders near it.
    solver.begin();
    for (let i = 0; i < bodies.length; i += 1) {
      const body = bodies[i];
      const v = body.linearVelocity;
      const w = body.angularVelocity;
      const margin = 0.02 + (Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
        + Math.sqrt(w.x * w.x + w.y * w.y + w.z * w.z) * body.boundRadius) * dt;
      body.sweepMargin = margin;
      if (body.asleep || body.kinematic) continue;
      if ((body.collidesWith & LAYER.GROUND) !== 0) collectGroundContacts(body, this.ground, margin, solver);
      const near = body.nearStatics;
      near.count = 0;
      if (statics.count > 0) {
        const b = body.bounds;
        statics.query(b[0] - margin, b[1] - margin, b[2] - margin, b[3] + margin, b[4] + margin, b[5] + margin,
          body.collidesWith & STATIC_LAYERS, near);
        collectStaticContacts(body, statics, margin, solver);
      }
    }
    this.#collectPairs();

    solver.solve(dt);
    this.#reportImpacts();

    for (let i = 0; i < bodies.length; i += 1) {
      const body = bodies[i];
      if (body.asleep) continue;
      body.integratePose(dt);
      if (body.kinematic) continue;
      const v = body.linearVelocity;
      const w = body.angularVelocity;
      const energy = v.x * v.x + v.y * v.y + v.z * v.z
        + (w.x * w.x + w.y * w.y + w.z * w.z) * body.boundRadius * body.boundRadius;
      if (body.canSleep && body.contactCount > 0 && energy < SLEEP_ENERGY) {
        body.sleepTimer += dt;
        if (body.sleepTimer > SLEEP_DELAY) body.sleep();
      } else {
        body.sleepTimer = 0;
      }
      this.triggers.update(this, body, body.userRef, body.position.x, body.position.y, body.position.z);
    }

    this.stepCount += 1;
    this.time += dt;
    for (let i = 0; i < actors.length; i += 1) {
      const actor = actors[i];
      if (actor.afterStep !== undefined) actor.afterStep(this, dt);
    }
    this.#separateCharacters();
  }

  /** Sweeps the bodies along X and collides every pair whose bounds meet. */
  #collectPairs() {
    const sorted = this.sorted;
    // Insertion sort by the low X bound: nearly sorted from the last step, so close to linear.
    for (let i = 1; i < sorted.length; i += 1) {
      const body = sorted[i];
      const key = body.bounds[0] - body.sweepMargin;
      let j = i - 1;
      while (j >= 0 && (sorted[j].bounds[0] - sorted[j].sweepMargin > key
        || (sorted[j].bounds[0] - sorted[j].sweepMargin === key && sorted[j].id > body.id))) {
        sorted[j + 1] = sorted[j];
        j -= 1;
      }
      sorted[j + 1] = body;
    }
    const solver = this.solver;
    for (let i = 0; i < sorted.length; i += 1) {
      const a = sorted[i];
      const boundsA = a.bounds;
      const marginA = a.sweepMargin;
      const restA = a.asleep || a.kinematic;
      const maxX = boundsA[3] + marginA;
      for (let j = i + 1; j < sorted.length; j += 1) {
        const b = sorted[j];
        const boundsB = b.bounds;
        const margin = marginA + b.sweepMargin;
        if (boundsB[0] - b.sweepMargin > maxX) break;
        if (restA && (b.asleep || b.kinematic)) continue;
        if ((a.layer & b.collidesWith) === 0 || (b.layer & a.collidesWith) === 0) continue;
        if (boundsA[1] - margin > boundsB[4] || boundsA[4] + margin < boundsB[1]
          || boundsA[2] - margin > boundsB[5] || boundsA[5] + margin < boundsB[2]) continue;
        // The body made first is always the pair's first body, whatever the sort order.
        const first = a.id < b.id ? a : b;
        const second = first === a ? b : a;
        const deepest = collectBodyContacts(first, second, margin, solver);
        // A resting body wakes as soon as a moving one is about to touch it, so that the very
        // first contact already shares the momentum between them.
        if (deepest > -Infinity) {
          if (first.asleep && speedSquared(second) > WAKE_SPEED_SQUARED) first.wake();
          else if (second.asleep && speedSquared(first) > WAKE_SPEED_SQUARED) second.wake();
        }
      }
    }
  }

  /** Turns the solved contact points into impact events, one per run of points of the same pair. */
  #reportImpacts() {
    const solver = this.solver;
    const data = solver.data;
    const count = solver.count;
    let i = 0;
    while (i < count) {
      const a = solver.bodyA[i];
      const b = solver.bodyB[i];
      const staticIndex = solver.staticIndex[i];
      let impulse = 0;
      let speed = 0;
      let strongest = i;
      let strongestImpulse = -1;
      let end = i;
      while (end < count && solver.bodyA[end] === a && solver.bodyB[end] === b && solver.staticIndex[end] === staticIndex) {
        const pointImpulse = solver.normalImpulse(end);
        impulse += pointImpulse;
        if (pointImpulse > strongestImpulse) {
          strongestImpulse = pointImpulse;
          strongest = end;
        }
        if (pointImpulse > 0 && solver.closingSpeed(end) > speed) speed = solver.closingSpeed(end);
        end += 1;
      }
      i = end;
      if (speed < IMPACT_SPEED || impulse <= 0) continue;
      const o = solver.offsetOf(strongest);
      const event = this.events.push(PHYSICS_EVENT.IMPACT, this.stepCount);
      event.a = a;
      event.aRef = a.userRef;
      event.b = b;
      event.x = data[o];
      event.y = data[o + 1];
      event.z = data[o + 2];
      event.nx = data[o + 3];
      event.ny = data[o + 4];
      event.nz = data[o + 5];
      event.speed = speed;
      event.impulse = impulse;
      event.energy = impulse * speed * 0.5;
      if (b !== null) {
        event.bRef = b.userRef;
        event.surface = 6;
      } else if (staticIndex === GROUND_CONTACT) {
        event.ground = true;
        event.surface = this.ground.surfaceAt(event.x, event.z);
      } else if (staticIndex >= 0) {
        event.staticHandle = this.statics.handleOf(staticIndex);
        event.bRef = this.statics.userRef[staticIndex];
        event.surface = this.statics.surface[staticIndex];
      }
    }
  }

  /**
   * A number that changes when any body's pose changes: equal inputs must give equal digests.
   * @returns {number} A 32-bit hash of every body's position and orientation.
   */
  digest() {
    let hash = 2166136261;
    for (let i = 0; i < this.bodies.length; i += 1) {
      const body = this.bodies[i];
      digestFloats[0] = body.position.x;
      digestFloats[1] = body.position.y;
      digestFloats[2] = body.position.z;
      digestFloats[3] = body.quaternion.x;
      digestFloats[4] = body.quaternion.y;
      digestFloats[5] = body.quaternion.z;
      digestFloats[6] = body.quaternion.w;
      for (let k = 0; k < 14; k += 1) hash = Math.imul(hash ^ digestWords[k], 16777619);
    }
    for (let i = 0; i < this.characters.length; i += 1) {
      const p = this.characters[i].position;
      digestFloats[0] = p.x;
      digestFloats[1] = p.y;
      digestFloats[2] = p.z;
      for (let k = 0; k < 6; k += 1) hash = Math.imul(hash ^ digestWords[k], 16777619);
    }
    return hash >>> 0;
  }

  // ---- queries --------------------------------------------------------------------------------

  /**
   * Casts a ray; the direction must be a unit vector. The result is in `out` (default `world.hit`).
   * @param {number} [mask] LAYER bits to accept (default MASK.SOLID).
   * @param {ArrayLike<unknown> | null} [ignore] Static handles, bodies or user references to skip.
   * @param {import('./collision/worldQueries.js').QueryHit} [out]
   * @returns {boolean} True on a hit.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDistance, mask = MASK.SOLID, ignore = null, out = this.hit) {
    return castRay(this, ox, oy, oz, dx, dy, dz, maxDistance, mask, ignore, out);
  }

  /**
   * Sweeps a sphere along a unit direction. The result is in `out` (default `world.hit`).
   * @returns {boolean} True when it touches something within `maxDistance`.
   */
  sphereCast(ox, oy, oz, dx, dy, dz, maxDistance, radius, mask = MASK.SOLID, ignore = null, out = this.hit) {
    return castSphere(this, ox, oy, oz, dx, dy, dz, maxDistance, radius, mask, ignore, out);
  }

  /**
   * Sweeps a capsule (core segment a to b, radius) along a unit direction without turning it.
   * @returns {boolean} True when it touches something within `maxDistance`.
   */
  capsuleCast(ax, ay, az, bx, by, bz, radius, dx, dy, dz, maxDistance, mask = MASK.SOLID, ignore = null, out = this.hit) {
    return castCapsule(this, ax, ay, az, bx, by, bz, radius, dx, dy, dz, maxDistance, mask, ignore, out);
  }

  /**
   * Finds what a sphere overlaps. The result is in `results` (default `world.overlaps`).
   * @returns {number} How many things it overlaps.
   */
  overlapSphere(x, y, z, radius, mask = MASK.SOLID, ignore = null, results = this.overlaps) {
    return overlapSphere(this, x, y, z, radius, mask, ignore, results);
  }

  /**
   * Finds what a capsule overlaps. The result is in `results` (default `world.overlaps`).
   * @returns {number} How many things it overlaps.
   */
  overlapCapsule(ax, ay, az, bx, by, bz, radius, mask = MASK.SOLID, ignore = null, results = this.overlaps) {
    return overlapCapsule(this, ax, ay, az, bx, by, bz, radius, mask, ignore, results);
  }

  /**
   * Finds the terrain, static collider or body straight below a point.
   * @returns {boolean} True when there is one within `maxDrop`; `out.y` is its height.
   */
  supportBelow(x, y, z, maxDrop = 100, mask = MASK.SOLID, ignore = null, out = this.hit) {
    return findSupportBelow(this, x, y, z, maxDrop, mask, ignore, out);
  }

  /**
   * Whether one point can see another.
   * @returns {boolean} True when nothing on the mask's layers is in the way.
   */
  lineOfSight(ax, ay, az, bx, by, bz, mask = MASK.SIGHT, ignore = null) {
    return hasLineOfSight(this, ax, ay, az, bx, by, bz, mask, ignore);
  }
}

const STATIC_LAYERS = LAYER.STATIC | LAYER.SEE_THROUGH | LAYER.PROP;
const ZERO = { x: 0, y: 0, z: 0 };
const IDENTITY_ROTATION = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const scratchQuaternion = { x: 0, y: 0, z: 0, w: 1 };
const scratchRotation = new Float64Array(9);
const digestFloats = new Float64Array(7);
const digestWords = new Uint32Array(digestFloats.buffer);

function flatSea() {
  return 0;
}

function speedSquared(body) {
  const v = body.linearVelocity;
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

function isIgnoredBy(ignore, thing, userRef) {
  for (let i = 0; i < ignore.length; i += 1) {
    if (ignore[i] === thing || (userRef !== null && userRef !== undefined && ignore[i] === userRef)) return true;
  }
  return false;
}

function removeFrom(list, item) {
  const at = list.indexOf(item);
  if (at >= 0) list.splice(at, 1);
}
