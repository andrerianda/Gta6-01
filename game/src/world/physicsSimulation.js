// The physics simulation: owns the game's one collision world (the library in game/src/physics/,
// docs/PHYSICS.md), steps it once per 60 Hz fixed step after every system has set its intents,
// and turns its event queue into game events (world/physicsEvents.js). Every other system adds
// and removes what it owns through the members below; nobody else creates a PhysicsWorld.
//
// Members (all synchronous, allocation-free unless said; valid from init() on):
//   world                                  the PhysicsWorld (vehicles pass it to new Vehicle(world, ...))
//   alpha                                  blend between the last two steps for drawing (set each frame)
//   addStaticColliders(descriptions, placement, options) -> handles[]
//       asset collider proxies or colliderDescriptions; placement {x, y, z, heading|quaternion, scale};
//       options {layer, surface, userRef, group} (group: a sector key, for removal in one call)
//   removeStaticColliders(handlesOrGroup)  an array of handles, one handle, or a group key
//   addBody(bodyOrOptions) -> RigidBody    a RigidBody, or createBody options ({colliders, mass, x, y, z, heading, layer, userRef})
//   removeBody(body)
//   addActor(actor) / removeActor(actor)   anything with beforeStep/afterStep (vehicles add themselves)
//   createCharacterController(options) -> CharacterController   {x, y?, z, radius?, height?, userRef}
//   raycast(ox, oy, oz, dx, dy, dz, maxDistance, mask?, ignore?, out?) -> boolean (hit in out or world.hit)
//   sweepSphere(ox, oy, oz, dx, dy, dz, maxDistance, radius, mask?, ignore?, out?) -> boolean
//   lineOfSight(ax, ay, az, bx, by, bz, mask?, ignore?) -> boolean (true when clear)
//   groundHeightAt(x, z)                   the terrain height the physics uses
//   setGround(provider)                    {heightAt, normalAt?, surfaceAt?}; openWorldCity's ground is
//                                          picked up by itself in start(); until a city exists the ground
//                                          is flat at context.focus.groundLevel (or 0)
//   explode({position, radius, power, causeId, weaponId}) pushes bodies and characters away,
//                                          emits EXPLOSION_DETONATED; returns how many things it pushed
// Events it publishes (queued, delivered at the end of the step): VEHICLE_COLLIDED for each vehicle
// in an impact over 1.5 m/s (vehicleId and otherId are the bodies' userRefs: entity ids),
// PROP_BROKEN, EXPLOSION_DETONATED. Determinism: same seed and calls give the same world.digest().

/**
 * Creates the physics simulation system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createPhysicsSimulationSystem(context) {
  let world = null;
  let publisher = null;
  let CharacterController = null;
  let city = null;
  const fallbackGround = {
    heightAt() {
      const level = context.focus?.groundLevel;
      return Number.isFinite(level) ? level : 0;
    },
  };
  const ground = {
    provider: fallbackGround,
    heightAt(x, z) {
      return this.provider.heightAt(x, z);
    },
    get wetness() {
      return context.atmosphere?.state?.wetness ?? 0;
    },
  };

  const system = {
    name: 'physics',
    dependsOn: [],
    loadWeight: 1,
    world: null,
    alpha: 1,

    async init(progress) {
      const [{ PhysicsWorld }, characters, events] = await Promise.all([
        import('../physics/PhysicsWorld.js'),
        import('../physics/characters/CharacterController.js'),
        import('./physicsEvents.js'),
      ]);
      CharacterController = characters.CharacterController;
      world = new PhysicsWorld({ ground });
      system.world = world;
      publisher = events.createPhysicsEventPublisher(context, world);
      progress(1, 'physics world');
    },

    start() {
      city = context.systems.find('openWorldCity');
      if (city && typeof city.groundHeightAt === 'function' && ground.provider === fallbackGround) {
        system.setGround({ heightAt: (x, z) => city.groundHeightAt(x, z) });
      }
    },

    fixedUpdate() {
      world.step();
      publisher.publish();
    },

    update(deltaSeconds, alpha) {
      system.alpha = alpha;
      world.alpha = alpha;
    },

    dispose() {
      if (world) world.events.clear();
      world = null;
      system.world = null;
    },

    setGround(provider) {
      ground.provider = provider ?? fallbackGround;
      world.ground.hasNormal = typeof provider?.normalAt === 'function';
      world.ground.hasSurface = typeof provider?.surfaceAt === 'function';
      if (world.ground.hasNormal) ground.normalAt = (x, z, out) => ground.provider.normalAt(x, z, out);
      else delete ground.normalAt;
      if (world.ground.hasSurface) ground.surfaceAt = (x, z) => ground.provider.surfaceAt(x, z);
      else delete ground.surfaceAt;
    },
    groundHeightAt: (x, z) => ground.heightAt(x, z),
    addStaticColliders: (descriptions, placement, options) => world.addStatics(descriptions, placement, options),
    removeStaticColliders(handlesOrGroup) {
      if (Array.isArray(handlesOrGroup)) for (const handle of handlesOrGroup) world.removeStatic(handle);
      else if (typeof handlesOrGroup === 'number') world.removeStatic(handlesOrGroup);
      else world.removeStaticGroup(handlesOrGroup);
    },
    addBody: (body) => (typeof body.applyImpulse === 'function' ? (world.addBody(body), body) : world.createBody(body)),
    removeBody: (body) => world.removeBody(body),
    addActor: (actor) => world.addActor(actor),
    removeActor: (actor) => world.removeActor(actor),
    createCharacterController: (options) => new CharacterController(world, options),
    raycast: (ox, oy, oz, dx, dy, dz, max, mask, ignore, out) => world.raycast(ox, oy, oz, dx, dy, dz, max, mask, ignore, out),
    sweepSphere: (ox, oy, oz, dx, dy, dz, max, radius, mask, ignore, out) =>
      world.sphereCast(ox, oy, oz, dx, dy, dz, max, radius, mask, ignore, out),
    lineOfSight: (ax, ay, az, bx, by, bz, mask, ignore) => world.lineOfSight(ax, ay, az, bx, by, bz, mask, ignore),
    explode: (blast) => publisher.explode(blast),
  };
  return system;
}
