// Turf crews: the members of the gangs and street factions who stand on their corners. On a
// faction's turf (gangsAndFactions: turf districts) a few crews of two or three members, dressed
// from the faction's member appearance (its colours), stand at pavement corners near the player,
// spawned out of sight through the crowd simulation. Attacking one turns the faction's attitude
// down (perAssault, perKill) and every member nearby on the attacker; at or below
// attackOnSightAtOrBelow members go for the player on sight inside their turf. Attitudes are
// saved. The rule functions are pure (Node-tested).
import { ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { crewRolesFor } from './crewIdle.js';
import { pickOne } from './crowdSpawning.js';

/** Faction kinds whose members stand on corners. */
export const CORNER_KINDS = Object.freeze(['gang', 'neighbourhood', 'syndicate', 'private_security']);

/** Weapons of the catalog that are swung, thrown or shoulder-fired, not a firearm held in hand. */
const NOT_FIREARMS = new Set(['fists', 'tire_iron', 'baseball_bat', 'grenade', 'fire_bottle', 'rocket_launcher']);

/**
 * The faction that holds a district's corners, or null.
 * @param {string} districtId
 * @param {Record<string, {id: string, kind: string, turf: string[], members: string[]}>} factions
 */
export function turfFactionAt(districtId, factions) {
  for (const id in factions) {
    const faction = factions[id];
    if (CORNER_KINDS.includes(faction.kind) && faction.turf.includes(districtId) && faction.members.length) return faction;
  }
  return null;
}

/**
 * A crowd profile (the shape of a pedestrian archetype) for a faction member.
 * @param {{id: string, appearance: object, health: number, weapons: string[]}} member
 * @param {{id: string}} faction
 */
export function memberProfile(member, faction) {
  const armed = member.weapons.some((weapon) => weapon !== 'fists');
  // An armed member carries his first firearm (a mission's gunman fires it through combat, so a
  // tire iron in his hand would shoot with no gun); one with none carries his swung weapon.
  const carried = member.weapons.find((weapon) => !NOT_FIREARMS.has(weapon)) || member.weapons.find((weapon) => weapon !== 'fists') || null;
  return {
    id: member.id,
    name: member.name,
    appearance: member.appearance,
    health: member.health,
    factionId: faction.id,
    courage: 0.85,
    aggression: 0.8,
    armedChance: armed ? 1 : 0,
    weapon: armed ? carried : null,
    reportsCrimeChance: 0,
    walkSpeed: 1.15,
    activities: { stand_chat: 10 },
    reactions: {
      gunfire: { fight: 6, flee: 2, cower: 1 },
      explosion: { flee: 6, fight: 3 },
      fight_nearby: { fight: 7, gawk: 3 },
      body_seen: { fight: 4, gawk: 4, flee: 2 },
      vehicle_near_miss: { shout: 6, dive_aside: 4 },
      aimed_at: { fight: 6, hands_up: 2, flee: 2 },
      bumped: { shout: 7, fight: 3 },
    },
  };
}

/**
 * A faction's attitude after something the player did, clamped to the rules' range.
 * @param {number} attitude
 * @param {'assault'|'kill'|'vehicleStolen'} deed
 * @param {{range: [number, number], perKill: number, perAssault: number, perVehicleStolen: number}} rules
 */
export function attitudeAfter(attitude, deed, rules) {
  const change = deed === 'kill' ? rules.perKill : deed === 'vehicleStolen' ? rules.perVehicleStolen : rules.perAssault;
  return Math.max(rules.range[0], Math.min(rules.range[1], attitude + change));
}

/** True when members attack the player on sight inside their turf. */
export function attacksOnSight(attitude, rules) {
  return attitude <= rules.attackOnSightAtOrBelow;
}

/**
 * Creates the crews of the factions.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {object} crowd The crowd simulation (pedestrians.simulation).
 * @param {object} city The openWorldCity system.
 */
export function createTurfCrews(context, crowd, city) {
  const catalog = context.content.get('gangsAndFactions');
  const factions = catalog.GANGS_AND_FACTIONS, members = catalog.FACTION_MEMBERS, rules = catalog.FACTION_ATTITUDE_RULES;
  const generator = context.random('factions');
  const random = () => generator.next();
  /** Attitude of each faction towards the player (0 neutral). */
  const attitudes = {};
  for (const id in factions) attitudes[id] = 0;
  let timer = 0;

  const crewOf = (person) => person.entity.data.factionId || null;

  function setAttitude(factionId, value) {
    const previous = attitudes[factionId] ?? 0;
    if (value === previous) return;
    attitudes[factionId] = value;
    context.events.queue(GAME_EVENTS.FACTION_ATTITUDE_CHANGED, { factionId, attitude: value, previous });
  }

  /** Turns the members of a faction near x, z on an attacker. */
  function rally(factionId, attackerId, x, z, radius) {
    for (const person of crowd.people) {
      if (crewOf(person) !== factionId || person.mode === 'dead' || person.mode === 'down') continue;
      if (Math.hypot(person.x - x, person.z - z) > radius) continue;
      context.entities.addTag(person.entity, ENTITY_TAGS.HOSTILE);
      person.mode = 'fight';
      person.timer = 30;
      person.offenderId = attackerId;
    }
  }

  /** Stands a crew of two or three at a pavement corner near the focus, out of sight. */
  function placeCrew(faction) {
    const f = context.focus.position;
    const points = city.spawnPointsNear(f.x, f.z, 75, 'pedestrian', 160);
    for (let tries = 0; tries < 6; tries += 1) {
      const point = pickOne(points, random);
      if (!point) return;
      const d = Math.hypot(point.x - f.x, point.z - f.z);
      if (d < 30 || crowd.inView(point.x, point.y, point.z)) continue;
      if (!faction.turf.includes(city.districtAt(point.x, point.z))) continue;
      const size = 2 + (random() < 0.5 ? 1 : 0) + (random() < 0.25 ? 1 : 0);
      // A loose huddle, not a ring: uneven gaps and distances, each with an idle role
      // (crewIdle.js: talker, squatting, lookout, smoker...).
      const roles = crewRolesFor(size, random());
      const turn = random() * Math.PI * 2;
      const crew = [];
      for (let i = 0; i < size; i += 1) {
        const member = members[pickOne(faction.members, random)];
        if (!member) continue;
        const angle = turn + (i / size) * Math.PI * 2 + (random() - 0.5) * 0.9;
        const reach = 0.85 + random() * 0.5 + (roles[i] === 'lookout' ? 0.5 : 0);
        const x = point.x + Math.cos(angle) * reach, z = point.z + Math.sin(angle) * reach;
        const person = crowd.spawnAt(memberProfile(member, faction), x, z, 'chat',
          { tags: [ENTITY_TAGS.GANG], data: { factionId: faction.id, memberId: member.id } });
        if (person) {
          person.timer = Infinity;
          person.x = x;
          person.z = z;
          person.crewRole = roles[i];
          crew.push(person);
        }
      }
      for (const person of crew) person.facing = Math.atan2(-(point.x - person.x), -(point.z - person.z));
      return;
    }
  }

  return {
    attitudes,
    rally,
    /** Called on DAMAGE_DEALT and CHARACTER_KILLED: the player hurt a member. */
    attacked(targetId, attackerId, killed) {
      const target = context.entities.get(targetId);
      const factionId = target && target.data ? target.data.factionId : null;
      if (!factionId) return;
      const attacker = context.entities.get(attackerId);
      if (attacker && attacker.tags.has(ENTITY_TAGS.PLAYER)) setAttitude(factionId, attitudeAfter(attitudes[factionId], killed ? 'kill' : 'assault', rules));
      rally(factionId, attackerId, target.position.x, target.position.z, 45);
    },
    update(dt) {
      timer -= dt;
      if (timer > 0) return;
      timer = 1;
      const f = context.focus.position;
      const faction = turfFactionAt(city.districtAt(f.x, f.z), factions);
      if (!faction) return;
      let standing = 0;
      for (const person of crowd.people) if (crewOf(person) === faction.id) standing += 1;
      if (standing < 6) placeCrew(faction);
      // On sight: a faction that hates the player goes for them inside its turf.
      if (attacksOnSight(attitudes[faction.id], rules)) {
        const player = context.entities.firstWithTag(ENTITY_TAGS.PLAYER);
        if (player) {
          for (const person of crowd.people) {
            if (crewOf(person) !== faction.id || person.mode === 'fight' || person.mode === 'dead') continue;
            if (Math.hypot(person.x - player.position.x, person.z - player.position.z) < 25) rally(faction.id, player.id, person.x, person.z, 1);
          }
        }
      }
    },
    serialise() { return { attitudes: { ...attitudes } }; },
    restore(data) {
      if (!data || !data.attitudes) return;
      for (const id in data.attitudes) if (id in attitudes) attitudes[id] = Number(data.attitudes[id]) || 0;
    },
  };
}
