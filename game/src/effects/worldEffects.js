// World effects: the particles, lights and marks that make actions readable. Engine smoke, fire
// and explosions of wrecked cars (a fireball with a flash and shock ring, sparks, flying debris,
// a smoke column, a scorch mark, a strong passing light and a wreck that burns on), muzzle
// flashes and tracers, bullet impacts on asphalt, concrete, glass, metal and water, blood mist,
// tyre smoke, dust and spray, sparks, sea spray and steam. All textures are painted by code at
// start; smoke is lit by the sun, moon and sky of the atmosphere and drifts with its wind.
//
// Budget: one pooled particle draw and one pooled decal draw, within the quality tier's
// maxParticles and maxDecals; nothing is allocated per frame.
//
// Command EFFECT_SPAWN {effectId, position, direction?, scale?}: effect ids are the keys of
//   EFFECT_RECIPES in effects/effectCatalogue.js. For bullet impacts `direction` is the surface
//   normal; for muzzle_flash and tracer it is the aim, and a tracer's `scale` is its length (m).
//   Vehicles send engine_smoke and vehicle_fire every 0.4 s, vehicle_explosion and vehicle_debris.
// Members: spawn(request) (same as the command, now), addDecal(cell, x, y, z, nx, ny, nz, angle,
//   width, length, opacity?, life?), stats() -> {particles, decals, lights, sustained, ...}.
// Listens: QUALITY_CHANGED (rebuilds the pools at the new budgets).
// Flow: update(dt) steps sustained emitters, particles, marks and lights; lateUpdate() writes
//   the pools into the GPU buffers, lit by atmosphere.state, for the main camera.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';

/**
 * Creates the world effects system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createWorldEffectsSystem(context) {
  let director = null;
  let city = null;
  const stops = [];

  const system = {
    name: 'effects',
    dependsOn: ['worldRenderPipeline'],

    async init(progress) {
      const { createEffectsDirector } = await import('./effectsDirector.js');
      const tier = context.quality.tier;
      const random = context.random('effects');
      director = createEffectsDirector({
        document: context.page.document,
        parent: context.view.layers.effects,
        atmosphere: context.atmosphere ?? null,
        maxParticles: tier.maxParticles,
        maxDecals: tier.maxDecals,
        cellSize: context.quality.name === 'low' ? 128 : 256,
        random: () => random.next(),
        groundHeightAt: (x, z) => (city ? city.groundHeightAt(x, z) : context.focus.groundLevel ?? 0),
        shake: (strength, seconds) => {
          if (context.commands.has(GAME_COMMANDS.CAMERA_SHAKE)) context.commands.send(GAME_COMMANDS.CAMERA_SHAKE, { strength, seconds });
        },
        listener: () => context.focus.position ?? null,
      });
      stops.push(context.commands.handle(GAME_COMMANDS.EFFECT_SPAWN, (request) => director.spawn(request)));
      progress(1, 'effects');
    },

    start() {
      city = context.systems.find('openWorldCity');
      if (city && typeof city.groundHeightAt !== 'function') city = null;
      stops.push(context.events.on(GAME_EVENTS.QUALITY_CHANGED, () => {
        director.setBudgets(context.quality.tier.maxParticles, context.quality.tier.maxDecals);
      }));
    },

    update(deltaSeconds) {
      director.update(deltaSeconds);
    },

    lateUpdate() {
      director.prepare(context.view.camera);
    },

    dispose() {
      for (const stop of stops.splice(0)) stop?.();
      director?.dispose();
      director = null;
    },

    /** Shows an effect now (the EFFECT_SPAWN payload); false for an unknown id. */
    spawn: (request) => (director ? director.spawn(request) : false),
    /** Leaves a mark on the ground or a wall (effectsDirector.js addDecal). */
    addDecal: (...args) => (director ? director.addDecal(...args) : -1),
    /** Live counts: particles, decals, lights, sustained fires, dropped particles. */
    stats: () => (director ? director.stats() : null),
  };
  return system;
}
