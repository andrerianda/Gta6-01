// World effects: smoke, car fires with heat haze, explosions with debris, muzzle flashes,
// tracers, spent cases, gun smoke, back-blast, impacts, blood, tyre smoke, surf, sea spray,
// street steam, boat wakes. One particle and one decal draw, one per debris kind in flight.
// EFFECT_SPAWN {effectId, position, direction?, scale?, colour?}: effectCatalogue.js ids
//   (impacts: direction = normal; a tracer's scale = its length). WEAPON_FIRED: cases, wisps.
// 'effects/eject' {shooterId, weaponId}: a pump/bolt case flies now (weaponDischargeEffects.js).
// 'effects/boat' {object, speed?, remove?}: a boat's wake (ambientEffects.js).
// 'effects/burn' {vehicleId | position, stage?, warm?}: a held fire ('smoking', 'burning',
//   'blazing', 'dying'); returns a slot for 'effects/extinguish' {slot?}.
// 'effects/freeze' {after?, next?}: holds every effect `after` s after the next `next` spawn;
//   'effects/thaw' lets them run.
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
  let ambient = null;
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
      const [{ createEffectsDirector }, { createVehicleDrivingEffects }, { registerEffectsShowcase }, { createWeaponDischargeEffects }, { createAmbientEffects }] = await Promise.all([
        import('./effectsDirector.js'), import('./vehicleDrivingEffects.js'), import('./effectsShowcaseScene.js'), import('./weaponDischargeEffects.js'), import('./ambientEffects.js')]);
      const tier = context.quality.tier;
      const low = context.quality.name === 'low';
      const random = context.random('effects');
      const next = () => random.next();
      director = createEffectsDirector({
        document: context.page.document,
        parent: context.view.layers.effects,
        atmosphere: context.atmosphere ?? null,
        maxParticles: tier.maxParticles,
        maxDecals: tier.maxDecals,
        maxDebrisPerKind: low ? 12 : 24,
        maxCasings: low ? 16 : 40,
        cellSize: low ? 128 : 256,
        random: next,
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
      stops.push(commands.handle('effects/eject', (payload) => discharge.eject(payload)));
      driving = createVehicleDrivingEffects({
        spawn: (request) => director.spawn(request),
        addDecal: (...args) => director.addDecal(...args),
        vehicles: () => context.entities.ofKind('vehicle'),
        carOf: (id) => fleet?.get?.(id)?.car ?? null,
        listener: () => context.focus.position ?? null,
        groundHeightAt: ground,
      });
      discharge = createWeaponDischargeEffects(context, director);
      ambient = createAmbientEffects(context, director, ground, next);
      stops.push(() => ambient.dispose());
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
      if (!director.frozen) {
        discharge.update(deltaSeconds);
        ambient.update(deltaSeconds);
        if (fleet) driving.update(deltaSeconds);
      }
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
    stats: () => (director ? { ...director.stats(), ambient: ambient.stats(), waiting: discharge.waiting } : null),
  };
  return system;
}
