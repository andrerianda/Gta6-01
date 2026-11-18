// The mission's enemies: crews of a faction (gangsAndFactions FACTION_MEMBERS, dressed in the
// faction's colours) stood up through the pedestrian crowd (pedestrians.simulation.spawnAt)
// around a place, tagged gang and hostile, and fought each fixed step: gunmen hold their ground,
// face the lead and shoot through the combat system's fire call (combat.fire) at their member's
// accuracy and a weapon's rhythm; brawlers (and every enemy of a fists-only fight) run in with the
// crowd's own fight mode. A squad reports how many are still standing. Without a crowd the squad
// is empty and the objective falls back to holding the place.
import { ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { memberProfile } from '../pedestrians/turfCrews.js';
import { standInCrowd } from './crowdPlacement.js';

const ENGAGE_DISTANCE = 45;
const SHOOT_DISTANCE = 38;
const MELEE_DISTANCE = 3.5;
const MAX_PER_SQUAD = 8;
const aim = { x: 0, y: 0, z: 0 };
const muzzle = { x: 0, y: 0, z: 0 };

/**
 * Creates the enemy squads of the missions.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function createMissionEnemies(context) {
  const { entities } = context;
  const random = context.random('missionEnemies');
  const roll = typeof random === 'function' ? random : () => random.next();
  const crowd = () => context.systems.find('pedestrians')?.simulation ?? null;
  const factions = () => context.content.find('gangsAndFactions') ?? null;
  const weapons = () => context.content.find('weaponCatalog')?.WEAPON_CATALOG ?? {};
  /** True for a weapon that shoots (handguns, SMGs, shotguns, rifles), not one swung or thrown. */
  const isFirearm = (id) => Boolean(id) && Boolean(weapons()[id]) && !['unarmed', 'melee', 'thrown', 'heavy'].includes(weapons()[id].class);

  /** The lead's body, or the car the lead drives (what enemies aim at). */
  function quarry() {
    const lead = context.systems.find('player')?.entity ?? entities.firstWithTag(ENTITY_TAGS.PLAYER);
    if (!lead) return null;
    const vehicleId = lead.data?.vehicleId;
    return (vehicleId && entities.get(vehicleId)) || lead;
  }

  /**
   * Stands a squad up around a place.
   * @param {{crew?: string, count?: number, weapon?: string}[]} groups The catalog's enemies.
   * @param {{x: number, z: number}} near
   * @param {{melee?: boolean, limit?: number, distance?: number}} [how]
   */
  function spawnSquad(groups, near, how = {}) {
    const squad = { members: [], total: 0 };
    const simulation = crowd();
    const catalog = factions();
    if (!simulation || !catalog || !near) return squad;
    const limit = Math.min(how.limit ?? MAX_PER_SQUAD, MAX_PER_SQUAD);
    const wanted = [];
    for (const group of groups || []) {
      const member = catalog.FACTION_MEMBERS[group.crew];
      const faction = member && catalog.GANGS_AND_FACTIONS[member.faction];
      if (!member || !faction) continue;
      for (let i = 0; i < (group.count ?? 1) && wanted.length < limit; i += 1) wanted.push({ member, faction, weapon: group.weapon });
    }
    const spread = how.distance ?? 14;
    wanted.forEach(({ member, faction, weapon }, index) => {
      const angle = (index / wanted.length) * Math.PI * 2 + roll() * 0.6;
      const reach = spread * (0.6 + roll() * 0.5);
      // On the pavement near their spot, or on the spot itself where there is no pavement (the port).
      const person = standInCrowd(simulation, memberProfile(member, faction), near.x + Math.cos(angle) * reach, near.z + Math.sin(angle) * reach, {
        extra: { tags: [ENTITY_TAGS.GANG, ENTITY_TAGS.HOSTILE], data: { factionId: faction.id, memberId: member.id, missionEnemy: true } },
      });
      if (!person) return;
      // A fists-only fight: the crowd's own fight mode would shoot with an armed member's gun.
      if (how.melee) person.weaponId = null;
      const gun = how.melee ? null : [weapon, ...member.weapons].find(isFirearm) || null;
      squad.members.push({ id: person.id, person, weapon: gun, accuracy: member.accuracy ?? 0.5, cooldown: 0.8 + roll() * 1.5, down: false });
    });
    squad.total = squad.members.length;
    return squad;
  }

  /** One fixed step of the squad's fight; returns how many are still standing. */
  function fight(squad, dt) {
    const target = quarry();
    const combat = context.systems.find('combat');
    let standing = 0;
    for (const enemy of squad.members) {
      if (enemy.down) continue;
      const entity = entities.get(enemy.id);
      const person = enemy.person;
      if (!entity || person.mode === 'dead' || !(entity.data.health > 0)) { enemy.down = true; continue; }
      standing += 1;
      if (!target || person.mode === 'down') continue;
      const dx = target.position.x - person.x, dz = target.position.z - person.z;
      const gap = Math.hypot(dx, dz);
      if (gap > ENGAGE_DISTANCE) continue;
      if (!enemy.weapon || gap < MELEE_DISTANCE) {
        person.mode = 'fight';
        person.offenderId = target.id;
        person.timer = 8;
        continue;
      }
      // A gunman stands his ground facing the lead and fires in bursts at his accuracy.
      if (person.mode !== 'chat') { person.mode = 'chat'; person.timer = Infinity; }
      person.facing = Math.atan2(-dx, -dz);
      enemy.cooldown -= dt;
      if (enemy.cooldown > 0 || gap > SHOOT_DISTANCE || !combat?.fire) continue;
      enemy.cooldown = 0.55 + roll() * 1.2;
      const y = entity.position.y;
      muzzle.x = person.x + (dx / gap) * 0.45; muzzle.y = y + 1.42; muzzle.z = person.z + (dz / gap) * 0.45;
      aim.x = target.position.x - muzzle.x; aim.y = target.position.y + 1.05 - muzzle.y; aim.z = target.position.z - muzzle.z;
      const length = Math.hypot(aim.x, aim.y, aim.z) || 1;
      aim.x /= length; aim.y /= length; aim.z /= length;
      combat.fire(entity, enemy.weapon, muzzle, aim, { spread: 0.015 + (1 - enemy.accuracy) * 0.09 });
    }
    return standing;
  }

  /** The nearest standing member of the squad to a point, or null. */
  function nearest(squad, from) {
    let best = null, bestGap = Infinity;
    for (const enemy of squad.members) {
      if (enemy.down) continue;
      const gap = Math.hypot(enemy.person.x - from.x, enemy.person.z - from.z);
      if (gap < bestGap) { bestGap = gap; best = enemy.person.entity; }
    }
    return best;
  }

  /** Lets the survivors go: no longer hostile, they walk off and leave once out of view. */
  function release(squad) {
    const simulation = crowd();
    for (const enemy of squad?.members ?? []) {
      const entity = entities.get(enemy.id);
      if (!entity || enemy.down) continue;
      entities.removeTag(entity, ENTITY_TAGS.HOSTILE);
      if (simulation?.removePerson?.(enemy.id, { whenUnseen: true })) continue;
      enemy.person.mode = 'flee';
      enemy.person.timer = 8;
    }
    if (squad) squad.members.length = 0;
  }

  return { spawnSquad, fight, nearest, release };
}
