// World effects: what makes actions readable. Engine smoke, layered car fires under a lit smoke
// column, explosions (fireball, flash, glowing 3D debris, scorch, a wreck that burns on), muzzle
// flashes, screen-space tracers, spent cases, gun smoke and back-blast, impacts, blood, tyre
// smoke, dust and spray. Lights are capped by the exposure. Budget: one particle and one decal
// draw, plus one per debris kind, cases or tracers in flight; no per-frame garbage.
//
// EFFECT_SPAWN {effectId, position, direction?, scale?, colour?}: keys of EFFECT_RECIPES and
//   EFFECT_ALIASES (effectCatalogue.js). Impacts: direction = the normal; muzzle_flash, tracer:
//   the aim (a tracer's scale is its length, m); colour: a car's paint. WEAPON_FIRED adds the
//   spent cases and long-gun wisps (weaponDischargeEffects.js).
// 'effects/burn' {vehicleId | position, stage?, seconds?, scale?, warm?}: a fire holding a stage
//   ('smoking', 'burning', 'blazing' default, 'dying'), `warm` s (8) simulated at once; it does
//   not damage the car. Returns a slot for 'effects/extinguish' {slot?}.
// 'effects/freeze' {after?, next?}: holds every effect `after` s later, counted from the next
//   `next` spawn ({next: 'muzzle_flash', after: 0.02}); 'effects/thaw' lets them run.
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
  let discharge = null;
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
      const [{ createEffectsDirector }, { createVehicleDrivingEffects }, { registerEffectsShowcase }, { createWeaponDischargeEffects }] = await Promise.all([
        import('./effectsDirector.js'), import('./vehicleDrivingEffects.js'), import('./effectsShowcaseScene.js'), import('./weaponDischargeEffects.js')]);
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
        maxCasings: low ? 16 : 40,
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
      discharge = createWeaponDischargeEffects(context, director);
      registerEffectsShowcase(context);
      progress(1, 'effects');
    },

    start() {
      city = context.systems.find('openWorldCity');
      if (city && typeof city.groundHeightAt !== 'function') city = null;
      fleet = context.systems.find('vehicles');
      stops.push(context.events.on(GAME_EVENTS.VEHICLE_COLLIDED, (payload) => driving.collided(payload)));
      stops.push(context.events.on(GAME_EVENTS.WEAPON_FIRED, (payload) => discharge.fired(payload)));
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
