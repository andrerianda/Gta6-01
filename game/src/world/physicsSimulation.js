// The physics simulation: owns the game's one collision world (the library in game/src/physics/,
// docs/PHYSICS.md), steps it once per 60 Hz fixed step after every system has set its intents,
// and turns its event queue into game events (world/physicsEvents.js). Every other system adds
// and removes what it owns through the members below; nobody else creates a PhysicsWorld.
//
// Members (valid from init(); queries allocate nothing; signatures as in docs/PHYSICS.md):
//   world, alpha       the PhysicsWorld (new Vehicle(physics.world, ...)); the draw blend
//   addStaticColliders(descriptions, placement, {layer, surface, userRef, group}) -> handles
//   removeStaticColliders(handles | handle | group)   a sector streams out with its group key
//   addBody(RigidBody | createBody options) -> body; removeBody(body); addActor/removeActor
//   createCharacterController({x, y?, z, radius?, height?, userRef}) -> CharacterController
//   raycast(ox, oy, oz, dx, dy, dz, max, mask?, ignore?, out?) -> boolean (hit in out | world.hit)
//   sweepSphere(ox, oy, oz, dx, dy, dz, max, radius, mask?, ignore?, out?); lineOfSight(a.., b..)
//   groundHeightAt(x, z); setGround({heightAt, normalAt?, surfaceAt?}): start() takes
//     openWorldCity.groundHeightAt itself; until a city exists, flat at focus.groundLevel or 0
//   explode({position, radius, power, causeId, weaponId}) -> things pushed; EXPLOSION_DETONATED
// Publishes (queued to the end of the step): VEHICLE_COLLIDED per vehicle in an impact over
// 1.5 m/s (ids are the bodies' userRefs, entity ids), PROP_BROKEN. Same calls, same digest().

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
      // The sea boats float on and people wade in: the waves the water is drawn with.
      const waterHeightAt = (x, z) => context.atmosphere?.getWaveHeight?.(x, z) ?? 0;
      world = new PhysicsWorld({ ground, waterHeightAt });
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
