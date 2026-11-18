// The event queue of the physics world: impacts, landings, trigger crossings and the like, as
// pooled plain objects. The world appends during a step; the game reads `items[0 .. count)` after
// each step and then calls clear(). Events are never cleared by the world itself, so nothing is
// lost when the game advances several steps in a row before it looks.

/** The kinds of event the physics reports. */
export const PHYSICS_EVENT = Object.freeze({
  IMPACT: 'impact',
  LANDING: 'landing',
  TRIGGER_ENTER: 'triggerEnter',
  TRIGGER_EXIT: 'triggerExit',
  KNOCKDOWN: 'knockdown',
  PROP_BROKEN: 'propBroken',
  WATER_ENTRY: 'waterEntry',
  RIDER_THROWN: 'riderThrown',
});

/**
 * One physics event. Every event has the same fields; those a kind does not use are null or 0.
 * @typedef {object} PhysicsEvent
 * @property {string} type A PHYSICS_EVENT value.
 * @property {number} step The world step that produced it.
 * @property {unknown} a The first thing involved (a RigidBody, or a character).
 * @property {unknown} b The second thing (a RigidBody), or null for the fixed world.
 * @property {unknown} aRef The game's reference of `a`.
 * @property {unknown} bRef The game's reference of `b`, or of the static collider that was hit.
 * @property {number} staticHandle Handle of the static collider involved, -1 when none.
 * @property {boolean} ground True when `a` hit the terrain.
 * @property {number} x Where it happened.
 * @property {number} y
 * @property {number} z
 * @property {number} nx The contact normal, a unit vector from `a` towards `b`.
 * @property {number} ny
 * @property {number} nz
 * @property {number} speed Closing speed along the normal, metres per second.
 * @property {number} impulse The impulse exchanged, newton seconds.
 * @property {number} energy Roughly the energy the impact took out, joules (impulse x speed / 2).
 * @property {number} surface SURFACE id of the static or ground surface involved.
 */

export class PhysicsEventQueue {
  /** @param {number} [capacity] The most events kept between two clear() calls. */
  constructor(capacity = 256) {
    /** @type {PhysicsEvent[]} The pooled events; only the first `count` are current. */
    this.items = [];
    for (let i = 0; i < capacity; i += 1) this.items.push(createEvent());
    /** How many events are waiting. */
    this.count = 0;
    /** How many events were dropped because the queue was full since the last clear(). */
    this.dropped = 0;
    this.overflow = createEvent();
  }

  /**
   * Takes the next free event, reset and stamped with a type. When the queue is full the event
   * returned is a scratch one that is not kept.
   * @param {string} type A PHYSICS_EVENT value.
   * @param {number} step The world step.
   * @returns {PhysicsEvent}
   */
  push(type, step) {
    let event = this.overflow;
    if (this.count < this.items.length) {
      event = this.items[this.count];
      this.count += 1;
    } else {
      this.dropped += 1;
    }
    event.type = type;
    event.step = step;
    event.a = event.b = event.aRef = event.bRef = null;
    event.staticHandle = -1;
    event.ground = false;
    event.x = event.y = event.z = 0;
    event.nx = event.nz = 0;
    event.ny = 1;
    event.speed = event.impulse = event.energy = 0;
    event.surface = 0;
    return event;
  }

  /** Forgets the waiting events (the game calls this once it has read them). */
  clear() {
    for (let i = 0; i < this.count; i += 1) {
      const event = this.items[i];
      event.a = event.b = event.aRef = event.bRef = null;
    }
    this.count = 0;
    this.dropped = 0;
  }
}

function createEvent() {
  return {
    type: '', step: 0, a: null, b: null, aRef: null, bRef: null, staticHandle: -1, ground: false,
    x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, speed: 0, impulse: 0, energy: 0, surface: 0,
  };
}
