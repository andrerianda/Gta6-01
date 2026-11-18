// One pull of the trigger, for anyone: the pellets leave inside the weapon's cone of spread, each
// is traced (hitDetection.js), hurts what it hits (damageRules.js) and is told to the rest of the
// game: WEAPON_FIRED for the ears of pedestrians, police and audio; DAMAGE_DEALT for the owner of
// the target (the vehicle fleet, pedestrians, police, the player); CHARACTER_KILLED on a fatal
// hit; CRIME_COMMITTED for the wanted level when the lead does it; and EFFECT_SPAWN for the
// muzzle flash, the tracer and the impact (only when the effects system handles it). Thrown and
// heavy weapons burst where the aim lands through the physics system's explode().
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { directionInCone } from './aimingAndRecoil.js';
import { crimeOfFiring, crimeOfHit, damageOf } from './damageRules.js';
import { createHitDetector, createShotResult } from './hitDetection.js';

/** Effect ids sent with EFFECT_SPAWN (the effects system's catalogue should know them). */
export const COMBAT_EFFECTS = Object.freeze({
  muzzle: 'muzzle_flash', tracer: 'bullet_tracer', impact: 'bullet_impact', blood: 'blood_hit',
  sparks: 'metal_sparks', blow: 'melee_hit', explosion: 'explosion', fire: 'fire_burst',
});

/**
 * Creates the trigger for every shooter.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {{rules: object, random: () => number}} parts COMBAT_RULES and a seeded generator.
 */
export function createWeaponFiring(context, { rules, random }) {
  const physics = context.systems.find('physics');
  const detector = createHitDetector({ physics, entities: context.entities });
  const shot = createShotResult();
  const cone = new Float32Array(3);
  const lastCrimeAt = new Map();
  const point = (x, y, z) => ({ x, y, z });

  const effect = (effectId, position, direction, scale) => {
    if (context.commands.has(GAME_COMMANDS.EFFECT_SPAWN)) context.commands.send(GAME_COMMANDS.EFFECT_SPAWN, { effectId, position, direction, scale });
  };

  /** Reports a crime by the lead, at most once a second per crime. */
  function crime(crimeId, offender, victimId, position) {
    if (!crimeId || !offender || !offender.tags?.has?.('player')) return;
    const now = context.simulation?.time ?? 0;
    const key = `${crimeId}:${victimId ?? ''}`;
    if (victimId === null && now - (lastCrimeAt.get(key) ?? -9) < 1) return;
    lastCrimeAt.set(key, now);
    context.events.queue(GAME_EVENTS.CRIME_COMMITTED, { crimeId, offenderId: offender.id, victimId, position });
  }

  /** Applies a hit to a target entity and tells everyone. Gives true when it was fatal. */
  function hurt(target, shooter, weapon, amount, kind, at) {
    const data = target.data ?? {};
    const fatal = target.kind === 'character' && typeof data.health === 'number' && data.health > 0 && data.health - amount <= 0;
    context.events.queue(GAME_EVENTS.DAMAGE_DEALT, {
      targetId: target.id, attackerId: shooter ? shooter.id : null, amount, kind, weaponId: weapon.id, position: at, fatal,
    });
    if (target.kind === 'character') {
      const police = target.tags?.has?.('police'), gang = target.tags?.has?.('gang');
      crime(crimeOfHit(weapon, { police, gang, fatal }), shooter, target.id, at);
      if (fatal) {
        context.events.queue(GAME_EVENTS.CHARACTER_KILLED, {
          victimId: target.id, killerId: shooter ? shooter.id : null, weaponId: weapon.id, factionId: data.factionId ?? null, position: at,
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
      effect(COMBAT_EFFECTS.muzzle, point(origin.x, origin.y, origin.z), point(direction.x, direction.y, direction.z), weapon.class === 'handgun' ? 0.7 : 1);
    }
    if (weapon.projectile) {
      directionInCone(cone, direction.x, direction.y, direction.z, how.spread, random(), random());
      detector.cast(shot, origin.x, origin.y, origin.z, cone[0], cone[1], cone[2], weapon.range, skip);
      const t = shot.hit ? shot.distance : weapon.range;
      const at = point(origin.x + cone[0] * t, origin.y + cone[1] * t, origin.z + cone[2] * t);
      const p = weapon.projectile;
      if (physics && physics.explode) physics.explode({ position: at, radius: p.blastRadius, power: p.blastDamage, causeId: skip.shooterId, weaponId: weapon.id });
      else context.events.queue(GAME_EVENTS.EXPLOSION_DETONATED, { position: at, radius: p.blastRadius, power: p.blastDamage, causeId: skip.shooterId, weaponId: weapon.id });
      effect(p.fireSeconds > 0 && p.blastDamage < 100 ? COMBAT_EFFECTS.fire : COMBAT_EFFECTS.explosion, at, null, p.blastRadius / 7);
      crime(weapon.crime, shooter, null, at);
      for (const target of context.entities.within(at.x, at.z, p.blastRadius, null, [])) {
        if (target.id === skip.shooterId || (target.kind !== 'character' && target.kind !== 'vehicle')) continue;
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
        if (!melee) effect(COMBAT_EFFECTS.impact, at, normal, 1);
        continue;
      }
      const target = context.entities.get(shot.targetId);
      if (!target) continue;
      const amount = damageOf(weapon, shot.distance, { zone: shot.zone, vehicle: shot.kind === 'vehicle' });
      if (amount <= 0) continue;
      result.hits += 1;
      effect(melee ? COMBAT_EFFECTS.blow : shot.kind === 'vehicle' ? COMBAT_EFFECTS.sparks : COMBAT_EFFECTS.blood, at, normal, 1);
      const kind = melee ? 'melee' : shot.zone === 'head' ? 'headshot' : 'bullet';
      if (hurt(target, shooter, weapon, amount, kind, at)) result.kills += 1;
    }
    return result;
  }

  return { fire, detector };
}
