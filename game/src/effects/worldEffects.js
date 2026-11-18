// World effects: the particles, lights, marks and debris that make actions readable. Engine
// smoke, fire and explosions (a white-hot core in orange billows under sooty smoke that rolls up,
// a flash and shock ring, sparks, lit 3D debris chunks, a scorch mark, a passing light, a wreck
// that burns on), muzzle flashes and tracers, bullet impacts, blood mist, tyre smoke, dust and
// spray. Textures are painted by code; smoke is lit by the atmosphere and drifts with its wind.
// Budget: one particle draw, one decal draw and one draw per debris kind in flight, within the
// tier's maxParticles and maxDecals; nothing is allocated per frame.
//
// Command EFFECT_SPAWN {effectId, position, direction?, scale?, colour?}: ids are the keys of
//   EFFECT_RECIPES in effectCatalogue.js plus EFFECT_ALIASES. Bullet impacts: direction = surface
//   normal; muzzle_flash and tracer: the aim, and a tracer's scale is its length (m). colour is
//   a car's paint for the panels an explosion throws.
// Pictures: MARAZUL.command('effects/freeze', {after: seconds}) holds every effect still once
//   `after` more seconds of effect time have passed (0 or no payload: now), so a 0.06 s muzzle
//   flash can be caught; 'effects/thaw' lets them run again. Same as members freeze()/thaw().
// Driving (vehicleDrivingEffects.js): tyre smoke, skid marks, dust and spray near the camera;
//   VEHICLE_COLLIDED throws sparks. Showcase scenes in effectsShowcaseScene.js.
// Members: spawn(request), addDecal(cell, x, y, z, nx, ny, nz, angle, width, length, opacity?,
//   life?), freeze(after), thaw(), stats(). Listens: QUALITY_CHANGED (rebuilds the pools).
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';

/**
 * Creates the world effects system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createWorldEffectsSystem(context) {
  let director = null;
  let driving = null;
  let city = null;
  let fleet = null;
  const stops = [];
  const ground = (x, z) => (city ? city.groundHeightAt(x, z) : context.focus.groundLevel ?? 0);

  const system = {
    name: 'effects',
    dependsOn: ['worldRenderPipeline'],

    async init(progress) {
      const [{ createEffectsDirector }, { createVehicleDrivingEffects }, { registerEffectsShowcase }] = await Promise.all([
        import('./effectsDirector.js'), import('./vehicleDrivingEffects.js'), import('./effectsShowcaseScene.js')]);
      const tier = context.quality.tier;
      const low = context.quality.name === 'low';
      const random = context.random('effects');
      director = createEffectsDirector({
        document: context.page.document,
        parent: context.view.layers.effects,
        atmosphere: context.atmosphere ?? null,
        maxParticles: tier.maxParticles,
        maxDecals: tier.maxDecals,
        maxDebrisPerKind: low ? 12 : 24,
        cellSize: low ? 128 : 256,
        random: () => random.next(),
        groundHeightAt: ground,
        shake: (strength, seconds) => {
          if (context.commands.has(GAME_COMMANDS.CAMERA_SHAKE)) context.commands.send(GAME_COMMANDS.CAMERA_SHAKE, { strength, seconds });
        },
        listener: () => context.focus.position ?? null,
      });
      const { commands } = context;
      stops.push(commands.handle(GAME_COMMANDS.EFFECT_SPAWN, (request) => director.spawn(request)));
      stops.push(commands.handle('effects/freeze', (payload) => director.freeze(payload?.after ?? 0)));
      stops.push(commands.handle('effects/thaw', () => director.thaw()));
      driving = createVehicleDrivingEffects({
        spawn: (request) => director.spawn(request),
        addDecal: (...args) => director.addDecal(...args),
        vehicles: () => context.entities.ofKind('vehicle'),
        carOf: (id) => fleet?.get?.(id)?.car ?? null,
        listener: () => context.focus.position ?? null,
        groundHeightAt: ground,
      });
      registerEffectsShowcase(context);
      progress(1, 'effects');
    },

    start() {
      city = context.systems.find('openWorldCity');
      if (city && typeof city.groundHeightAt !== 'function') city = null;
      fleet = context.systems.find('vehicles');
      stops.push(context.events.on(GAME_EVENTS.VEHICLE_COLLIDED, (payload) => driving.collided(payload)));
      stops.push(context.events.on(GAME_EVENTS.QUALITY_CHANGED, () => {
        director.setBudgets(context.quality.tier.maxParticles, context.quality.tier.maxDecals);
      }));
    },

    update(deltaSeconds) {
      if (fleet && !director.frozen) driving.update(deltaSeconds);
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
    /** Holds every effect still after `after` seconds of effect time (0: now). */
    freeze: (after = 0) => director?.freeze(after),
    /** Lets held effects run again. */
    thaw: () => director?.thaw(),
    /** Live counts: particles, decals, chunks, lights, sustained fires, dropped, frozen. */
    stats: () => (director ? director.stats() : null),
  };
  return system;
}
