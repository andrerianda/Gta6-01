// One pull of the trigger, for anyone: the pellets leave inside the weapon's cone of spread, each
// is traced (hitDetection.js), hurts what it hits (damageRules.js) and is told to the rest of the
// game: WEAPON_FIRED for the ears of pedestrians, police and audio; DAMAGE_DEALT for the owner of
// the target (the vehicle fleet, pedestrians, gangs, police, the player); CHARACTER_KILLED on a
// fatal hit; CRIME_COMMITTED for the wanted level when the lead does it; and EFFECT_SPAWN with the
// ids of effects/effectCatalogue.js: the muzzle flash and the tracer along the aim, an impact by
// the surface struck (direction = its normal), blood on people, metal on cars. Thrown and heavy
// weapons burst where the aim lands through the physics system's explode().
//
// DEATHS. The owner of a person keeps data.health and applies DAMAGE_DEALT to it (adding the tag
// 'dead' at 0). Combat works out `fatal` from that health less the damage it has sent and the
// owner has not applied yet (several pellets or shooters in one frame), so CHARACTER_KILLED is
// published exactly once per death. A person whose owner keeps no data.health gets FALLBACK_HEALTH
// kept here, so they still die once and are not hit again.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { directionInCone } from './aimingAndRecoil.js';
import { crimeOfFiring, crimeOfHit, damageOf } from './damageRules.js';
import { createHitDetector, createShotResult } from './hitDetection.js';

/** Effect ids sent with EFFECT_SPAWN (keys of EFFECT_RECIPES in effects/effectCatalogue.js). */
export const COMBAT_EFFECTS = Object.freeze({
  muzzle: 'muzzle_flash', tracer: 'tracer', blood: 'blood_hit', vehicle: 'bullet_impact_metal', blow: 'blood_hit',
  explosion: 'vehicle_explosion', fire: 'vehicle_fire',
});

/** The impact effect per SURFACE id of physics/surfaceTypes.js (asphalt, concrete, sand, grass,
 * dirt, wood, metal, water). */
export const IMPACT_BY_SURFACE = Object.freeze([
  'bullet_impact_asphalt', 'bullet_impact_concrete', 'sand_dust', 'dirt_dust', 'dirt_dust',
  'bullet_impact_concrete', 'bullet_impact_metal', 'bullet_impact_water',
]);

/** Health combat keeps for a person whose owner keeps none. */
export const FALLBACK_HEALTH = 100;

/**
 * Creates the trigger for every shooter.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {{rules: object, random: () => number}} parts COMBAT_RULES and a seeded generator.
 */
export function createWeaponFiring(context, { rules, random }) {
  const physics = context.systems.find('physics');
  /** Per person hit: the health last seen, the damage sent since, whether combat keeps the health. */
  const ledger = new Map();
  /** People dead to combat whose owner has not (or cannot) mark them dead. */
  const fallen = new Set();
  const detector = createHitDetector({ physics, entities: context.entities, fallen });
  const shot = createShotResult();
  const cone = new Float32Array(3);
  const lastCrimeAt = new Map();
  const point = (x, y, z) => ({ x, y, z });

  const effect = (effectId, position, direction, scale) => {
    if (context.commands.has(GAME_COMMANDS.EFFECT_SPAWN)) context.commands.send(GAME_COMMANDS.EFFECT_SPAWN, { effectId, position, direction, scale });
  };

  /** Reports a crime by the lead, at most once a second per crime. */
  function crime(crimeId, offender, victimId, position) {
    // The lead on foot carries the tag; at the wheel the tag rides the car, so ask the player too.
    if (!crimeId || !offender) return;
    if (!offender.tags?.has?.('player') && context.systems.find('player')?.entity !== offender) return;
    const now = context.simulation?.time ?? 0;
    const key = `${crimeId}:${victimId ?? ''}`;
    if (victimId === null && now - (lastCrimeAt.get(key) ?? -9) < 1) return;
    lastCrimeAt.set(key, now);
    context.events.queue(GAME_EVENTS.CRIME_COMMITTED, { crimeId, offenderId: offender.id, victimId, position });
  }

  /** The person's health less the damage sent that the owner has not applied yet. */
  function healthLeft(target) {
    const own = target.data && typeof target.data.health === 'number' ? target.data.health : null;
    let entry = ledger.get(target.id);
    if (!entry) {
      if (ledger.size > 256) prune();
      entry = { seen: own ?? FALLBACK_HEALTH, sent: 0, kept: own === null };
      ledger.set(target.id, entry);
    } else if (own !== null && (entry.kept || own !== entry.seen)) {
      // The owner keeps (or has applied) the health: start again from what it says.
      entry.seen = own; entry.sent = 0; entry.kept = false;
    }
    return entry.seen - entry.sent;
  }

  function prune() {
    for (const id of ledger.keys()) if (!context.entities.get(id)) { ledger.delete(id); fallen.delete(id); }
  }

  /** Applies a hit to a target entity and tells everyone. Gives true when it was fatal. */
  function hurt(target, shooter, weapon, amount, kind, at, headshot = false) {
    const data = target.data ?? {};
    let fatal = false;
    if (target.kind === 'character') {
      const left = healthLeft(target);
      fatal = left > 0 && left - amount <= 0;
      ledger.get(target.id).sent += amount;
      if (fatal) fallen.add(target.id);
    }
    context.events.queue(GAME_EVENTS.DAMAGE_DEALT, {
      targetId: target.id, attackerId: shooter ? shooter.id : null, amount, kind, weaponId: weapon.id, position: at, fatal, headshot,
    });
    if (target.kind === 'character') {
      const police = target.tags?.has?.('police'), gang = target.tags?.has?.('gang') || Boolean(data.factionId);
      crime(crimeOfHit(weapon, { police, gang, fatal }), shooter, target.id, at);
      if (fatal) {
        context.events.queue(GAME_EVENTS.CHARACTER_KILLED, {
          victimId: target.id, killerId: shooter ? shooter.id : null, weaponId: weapon.id, factionId: data.factionId ?? null,
          police: Boolean(police), headshot, position: at,
        });
      }
    }
    return fatal;
  }

  /**
   * Fires once.
   * @param {object} shooter The shooter's entity.
   * @param {object} weapon A WEAPON_CATALOG entry.
   * @param {{x: number, y: number, z: number}} origin Muzzle (or fist) position.
   * @param {{x: number, y: number, z: number}} direction Unit direction of the aim.
   * @param {{spread: number, ignore?: unknown[] | null, melee?: boolean}} how
   * @returns {{hits: number, kills: number}}
   */
  function fire(shooter, weapon, origin, direction, how) {
    const result = { hits: 0, kills: 0 };
    const skip = { shooterId: shooter ? shooter.id : null, ignore: how.ignore ?? null };
    const melee = weapon.class === 'unarmed' || weapon.class === 'melee';
    if (!melee) {
      context.events.queue(GAME_EVENTS.WEAPON_FIRED, {
        shooterId: skip.shooterId, weaponId: weapon.id, origin: point(origin.x, origin.y, origin.z),
        direction: point(direction.x, direction.y, direction.z), loudness: weapon.noiseRadius,
      });
      crime(crimeOfFiring(weapon), shooter, null, point(origin.x, origin.y, origin.z));
      // Sized for the over-the-shoulder view (about 1.5 m from the camera): larger and the glow
      // hid the gun and the hand (GPU pictures with effects/freeze, 08:45).
      effect(COMBAT_EFFECTS.muzzle, point(origin.x, origin.y, origin.z), point(direction.x, direction.y, direction.z), weapon.class === 'handgun' ? 0.36 : weapon.class === 'smg' ? 0.42 : 0.5);
    }
    if (weapon.projectile) {
      directionInCone(cone, direction.x, direction.y, direction.z, how.spread, random(), random());
      detector.cast(shot, origin.x, origin.y, origin.z, cone[0], cone[1], cone[2], weapon.range, skip);
      const t = shot.hit ? shot.distance : weapon.range;
      const at = point(origin.x + cone[0] * t, origin.y + cone[1] * t, origin.z + cone[2] * t);
      const p = weapon.projectile;
      // The fleet takes EXPLOSION_DETONATED itself, so vehicles get DAMAGE_DEALT here only without it.
      if (physics && physics.explode) physics.explode({ position: at, radius: p.blastRadius, power: p.blastDamage, causeId: skip.shooterId, weaponId: weapon.id });
      else context.events.queue(GAME_EVENTS.EXPLOSION_DETONATED, { position: at, radius: p.blastRadius, power: p.blastDamage, causeId: skip.shooterId, weaponId: weapon.id });
      effect(p.fireSeconds > 0 && p.blastDamage < 100 ? COMBAT_EFFECTS.fire : COMBAT_EFFECTS.explosion, at, point(0, 1, 0), p.blastRadius / 7);
      crime(weapon.crime, shooter, null, at);
      const fleetHears = Boolean(context.systems.find('vehicles'));
      for (const target of context.entities.within(at.x, at.z, p.blastRadius, null, [])) {
        if (target.id === skip.shooterId || (target.kind !== 'character' && (target.kind !== 'vehicle' || fleetHears))) continue;
        if (target.kind === 'character' && (fallen.has(target.id) || target.tags?.has?.('dead'))) continue;
        const d = Math.hypot(target.position.x - at.x, target.position.z - at.z);
        const share = 1 - d / p.blastRadius;
        const amount = Math.round((target.kind === 'vehicle' ? p.vehicleBlastDamage : p.blastDamage) * share);
        if (amount <= 0) continue;
        result.hits += 1;
        if (hurt(target, shooter, weapon, amount, 'explosion', point(target.position.x, target.position.y, target.position.z))) result.kills += 1;
      }
      return result;
    }
    const pellets = melee ? 1 : weapon.pellets;
    for (let i = 0; i < pellets; i += 1) {
      directionInCone(cone, direction.x, direction.y, direction.z, melee ? 0 : how.spread, random(), random());
      detector.cast(shot, origin.x, origin.y, origin.z, cone[0], cone[1], cone[2], weapon.maxRange, skip);
      const t = shot.hit ? shot.distance : Math.min(weapon.maxRange, 120);
      if (!melee && i === 0) effect(COMBAT_EFFECTS.tracer, point(origin.x, origin.y, origin.z), point(cone[0], cone[1], cone[2]), t);
      if (!shot.hit) continue;
      const at = point(shot.x, shot.y, shot.z);
      const normal = point(shot.nx, shot.ny, shot.nz);
      if (shot.kind === 'world') {
        if (!melee) effect(IMPACT_BY_SURFACE[shot.surface] ?? IMPACT_BY_SURFACE[1], at, normal, 1);
        continue;
      }
      const target = context.entities.get(shot.targetId);
      if (!target) continue;
      const amount = damageOf(weapon, shot.distance, { zone: shot.zone, vehicle: shot.kind === 'vehicle' });
      if (amount <= 0) continue;
      result.hits += 1;
      if (shot.kind === 'vehicle') effect(melee ? 'scrape_sparks' : COMBAT_EFFECTS.vehicle, at, normal, 1);
      else effect(melee ? COMBAT_EFFECTS.blow : COMBAT_EFFECTS.blood, at, point(cone[0], cone[1], cone[2]), melee ? 0.6 : 1);
      // Every gunshot is kind 'bullet' (audio and effects key on it); a head hit says so apart.
      if (hurt(target, shooter, weapon, amount, melee ? 'melee' : 'bullet', at, !melee && shot.zone === 'head')) result.kills += 1;
    }
    return result;
  }

  return { fire, detector, fallen };
}
