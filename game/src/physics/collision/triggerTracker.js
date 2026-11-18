// Trigger volumes: static colliders on LAYER.TRIGGER that block nothing and only report who
// enters and who leaves. The tracker remembers, for every body and character that is inside at
// least one trigger, which triggers those are, and turns the changes into events.
import { LAYER } from '../collisionLayers.js';
import { PHYSICS_EVENT } from '../physicsEvents.js';
import { IndexList } from './StaticColliderSet.js';

export class TriggerTracker {
  constructor() {
    /** @type {Map<unknown, {handles: number[], refs: unknown[]}>} The triggers each thing is inside. */
    this.inside = new Map();
    this.candidates = new IndexList(16);
    /** @type {number[]} */
    this.current = [];
  }

  /**
   * Checks one thing against the trigger volumes and reports the triggers it entered or left as
   * TRIGGER_ENTER and TRIGGER_EXIT events (`a` is the thing, `staticHandle` and `bRef` the trigger).
   * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world.
   * @param {unknown} thing The body or character.
   * @param {unknown} userRef Its game reference, copied into the events.
   * @param {number} x The point of the thing that counts (its centre).
   * @param {number} y
   * @param {number} z
   */
  update(world, thing, userRef, x, y, z) {
    const set = world.statics;
    const candidates = this.candidates;
    const current = this.current;
    candidates.count = 0;
    current.length = 0;
    if (set.count > 0) set.query(x, y, z, x, y, z, LAYER.TRIGGER, candidates);
    for (let n = 0; n < candidates.count; n += 1) {
      const index = candidates.items[n];
      if (set.containsPoint(index, x, y, z)) current.push(set.handleOf(index));
    }
    let held = this.inside.get(thing);
    if (held === undefined) {
      if (current.length === 0) return;
      held = { handles: [], refs: [] };
      this.inside.set(thing, held);
    }
    for (let i = held.handles.length - 1; i >= 0; i -= 1) {
      if (current.includes(held.handles[i])) continue;
      report(world, PHYSICS_EVENT.TRIGGER_EXIT, thing, userRef, held.handles[i], held.refs[i], x, y, z);
      held.handles.splice(i, 1);
      held.refs.splice(i, 1);
    }
    for (let i = 0; i < current.length; i += 1) {
      const handle = current[i];
      if (held.handles.includes(handle)) continue;
      const ref = set.userRef[set.indexOf(handle)];
      held.handles.push(handle);
      held.refs.push(ref);
      report(world, PHYSICS_EVENT.TRIGGER_ENTER, thing, userRef, handle, ref, x, y, z);
    }
    if (held.handles.length === 0) this.inside.delete(thing);
  }

  /**
   * Forgets a thing that left the world (no exit events are sent).
   * @param {unknown} thing The body or character.
   */
  forget(thing) {
    this.inside.delete(thing);
  }
}

function report(world, type, thing, userRef, handle, ref, x, y, z) {
  const event = world.events.push(type, world.stepCount);
  event.a = thing;
  event.aRef = userRef;
  event.staticHandle = handle;
  event.bRef = ref;
  event.x = x;
  event.y = y;
  event.z = z;
}
