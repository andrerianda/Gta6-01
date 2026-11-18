// World effects: the particles, lights, marks and debris that make actions readable. Engine
// smoke, fire (layered flame cards with a flickering core, licks, embers, a tall lit smoke
// column), explosions (a hot core in orange billows under rolling soot, a flash, sparks, glowing
// 3D debris, a scorch mark, a passing light, a wreck that burns on), muzzle flashes, tracers,
// impacts, blood mist, tyre smoke, dust and spray. Lights are capped by the exposure.
// Budget: one particle draw, one decal draw, one per debris kind in flight; no per-frame garbage.
//
// Command EFFECT_SPAWN {effectId, position, direction?, scale?, colour?}: ids are the keys of
//   EFFECT_RECIPES in effectCatalogue.js plus EFFECT_ALIASES. Impacts: direction = the normal;
//   muzzle_flash and tracer: the aim (a tracer's scale is its length, m); colour: a car's paint.
// Command 'effects/burn' {vehicleId | position, stage?, seconds?, scale?, warm?}: a fire that
//   holds a stage for a picture: 'smoking', 'burning' (engine bay), 'blazing' (whole car, tall
//   smoke column; default), 'dying'; warm (default 8 s) is simulated at once so the column
//   already stands. It does not damage the car (fleet.damage does). Returns the fire's slot;
//   'effects/extinguish' {slot?}. Example: run('effects/burn', {vehicleId: id, warm: 10}).
// Command 'effects/freeze' {after?, next?}: holds every effect still after `after` s of effect
//   time; with next: 'muzzle_flash' the count starts at that effect's next spawn (a flash lives
//   0.06 s: {next: 'muzzle_flash', after: 0.02}). 'effects/thaw' lets them run again.
// Members: spawn, addDecal, burn, extinguish, freeze, thaw, stats (effectsDirector.js).
// Driving effects: vehicleDrivingEffects.js. Showcase scenes: effectsShowcaseScene.js.
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
  // a fire's place on a vehicle: its engine bay, or the middle of its body
  const vehicleAnchor = (id, name) => {
    const p = fleet?.get?.(id)?.entity?.position;
    const body = p && { x: p.x, y: p.y + 1.05, z: p.z };
    return name === 'body' ? body : fleet?.anchorOf?.(id, name) ?? body;
  };

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
        vehicleAnchor,
      });
      const { commands } = context;
      stops.push(commands.handle(GAME_COMMANDS.EFFECT_SPAWN, (request) => director.spawn(request)));
      stops.push(commands.handle('effects/burn', (request) => director.burn(request ?? {})));
      stops.push(commands.handle('effects/extinguish', (payload) => director.extinguish(payload?.slot)));
      stops.push(commands.handle('effects/freeze', (payload) => director.freeze(payload?.after ?? 0, payload?.next)));
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

    spawn: (request) => (director ? director.spawn(request) : false),
    addDecal: (...args) => (director ? director.addDecal(...args) : -1),
    burn: (request) => (director ? director.burn(request ?? {}) : -1),
    extinguish: (slot) => director?.extinguish(slot),
    freeze: (after = 0, next) => director?.freeze(after, next),
    thaw: () => director?.thaw(),
    stats: () => (director ? director.stats() : null),
  };
  return system;
}
