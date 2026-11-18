// Turns the physics world's event queue (game/src/physics/physicsEvents.js) into the game events
// docs/ARCHITECTURE.md names, after every step: an impact that involves a vehicle becomes
// VEHICLE_COLLIDED (one per vehicle involved, so a car-to-car crash reaches both), a broken prop
// becomes PROP_BROKEN. It also detonates explosions: an impulse that falls off with distance for
// every body and character in the blast, knocks people down, and EXPLOSION_DETONATED.
// Payloads are plain objects with ids (the bodies' userRefs), as the event contract asks.
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { PHYSICS_EVENT } from '../physics/physicsEvents.js';

/** Impacts slower than this (m/s closing speed) are scrapes and kerb taps, not collisions. */
export const MINIMUM_COLLISION_SPEED = 1.5;

/**
 * The fraction of an explosion's push felt at a distance: 1 at the centre, 0 at the radius,
 * falling off with the square of the distance fraction.
 * @param {number} distance Metres from the centre.
 * @param {number} radius The blast radius.
 * @returns {number} 0..1.
 */
export function blastFalloff(distance, radius) {
  if (!(radius > 0) || distance >= radius) return 0;
  const t = 1 - distance / radius;
  return t * t;
}

/**
 * Creates the publisher for one world.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @param {import('../physics/PhysicsWorld.js').PhysicsWorld} world The world it reads.
 * @returns {{publish: () => number, explode: (blast: {position: {x: number, y: number, z: number},
 *   radius?: number, power?: number, causeId?: unknown, weaponId?: string}) => number}}
 */
export function createPhysicsEventPublisher(context, world) {
  const events = context.events;

  function isVehicleBody(body) {
    // Cars and bikes have wheels; boats (planing) and helicopters (rotorSpeed) do not.
    const owner = body?.owner;
    return owner !== undefined && owner !== null
      && (typeof owner.wheelCount === 'number' || typeof owner.planing === 'number' || typeof owner.rotorSpeed === 'number');
  }

  function collided(vehicleRef, otherRef, event, sign) {
    events.queue(GAME_EVENTS.VEHICLE_COLLIDED, {
      vehicleId: vehicleRef,
      otherId: otherRef ?? null,
      speed: event.speed,
      energy: event.energy,
      position: { x: event.x, y: event.y, z: event.z },
      normal: { x: event.nx * sign, y: event.ny * sign, z: event.nz * sign },
      ground: event.ground,
      surface: event.surface,
    });
  }

  /**
   * Reads and clears the world's queue, emitting the game events.
   * @returns {number} How many game events were queued.
   */
  function publish() {
    const queue = world.events;
    let sent = 0;
    for (let i = 0; i < queue.count; i += 1) {
      const event = queue.items[i];
      if (event.type === PHYSICS_EVENT.IMPACT) {
        if (event.speed < MINIMUM_COLLISION_SPEED) continue;
        if (isVehicleBody(event.a)) {
          collided(event.aRef, event.bRef, event, 1);
          sent += 1;
        }
        if (isVehicleBody(event.b)) {
          collided(event.bRef, event.aRef, event, -1);
          sent += 1;
        }
      } else if (event.type === PHYSICS_EVENT.PROP_BROKEN) {
        events.queue(GAME_EVENTS.PROP_BROKEN, {
          propId: event.aRef,
          kind: event.a?.kind ?? null,
          position: { x: event.x, y: event.y, z: event.z },
          causeId: event.bRef ?? null,
        });
        sent += 1;
      }
    }
    queue.clear();
    return sent;
  }

  /**
   * Detonates an explosion: pushes every body and character within the radius away from the
   * centre (and a little up), knocks characters down, and queues EXPLOSION_DETONATED.
   * @param {{position: {x: number, y: number, z: number}, radius?: number, power?: number,
   *   causeId?: unknown, weaponId?: string}} blast Power is the impulse in newton seconds a body
   *   at the centre receives (default 9000: a car is thrown about 6 m/s).
   * @returns {number} How many things were pushed.
   */
  function explode(blast) {
    const p = blast.position;
    const radius = blast.radius ?? 8;
    const power = blast.power ?? 9000;
    let pushed = 0;
    for (const body of world.bodies) {
      const dx = body.position.x - p.x;
      const dy = body.position.y - p.y;
      const dz = body.position.z - p.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const share = blastFalloff(distance, radius);
      if (share <= 0) continue;
      const inverse = 1 / Math.max(distance, 0.5);
      const impulse = power * share;
      body.wake();
      body.applyImpulse(dx * inverse * impulse, (Math.abs(dy) * inverse + 0.6) * impulse, dz * inverse * impulse,
        p.x + dx * 0.6, p.y + dy * 0.6, p.z + dz * 0.6);
      pushed += 1;
    }
    for (const actor of world.actors) {
      if (!actor.velocity || actor.knockedDown === undefined || !actor.position) continue;
      const dx = actor.position.x - p.x;
      const dz = actor.position.z - p.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const share = blastFalloff(distance, radius);
      if (share <= 0) continue;
      const inverse = 1 / Math.max(distance, 0.5);
      actor.velocity.x += dx * inverse * 14 * share;
      actor.velocity.z += dz * inverse * 14 * share;
      actor.velocity.y += 6 * share;
      if (share > 0.25) actor.knockedDown = true;
      pushed += 1;
    }
    events.queue(GAME_EVENTS.EXPLOSION_DETONATED, {
      position: { x: p.x, y: p.y, z: p.z },
      radius,
      power,
      causeId: blast.causeId ?? null,
      weaponId: blast.weaponId ?? null,
    });
    return pushed;
  }

  return { publish, explode };
}
