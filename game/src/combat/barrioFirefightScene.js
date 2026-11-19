// The combat picture, scene `combat-firefight-barrio`: a firefight in a narrow, worn street of
// Barrio Hierro in the low evening sun. The lead stands on one pavement in the full shooter's
// stance, the pistol up in both hands, seen by the game's own aim camera (behind-right, a little
// above the head); across the street and a little ahead a crew of Los Remaches (the barrio's
// own gang, in their colours, pistols and a machine pistol drawn and aimed back) stands on the
// far pavement among the street's clutter. One of them and the lead fire in the same instant and
// the effects are held still just after the flashes (small muzzle flashes, tracers across the
// street). For the showcase director's second judged picture (SHOTS-PLAN.md "AIM").
// Query tuning for takes: &street=<n> picks the n-th candidate street, &across=<m> the crew's
// distance ahead, &hours=<h> (showcaseStaging) the time of day.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { memberProfile } from '../pedestrians/turfCrews.js';
import { openScene, placeLead } from '../showcase/showcaseStaging.js';

/** The crew: member id, the weapon drawn, metres along the street from the crew's centre, metres off the kerb line. */
const CREW = Object.freeze([
  { member: 'remache_racer', weapon: 'pistol', along: -1.6, off: 0.6 },
  { member: 'remache_stripper', weapon: 'pistol', along: 0.4, off: 1.4 },
  { member: 'remache_racer', weapon: 'smg', along: 2.3, off: 0.8 },
]);
/** Metres ahead along the street where the crew stands, and the hour (the sun low, warm). */
const ACROSS_AHEAD = 11;
const HOURS = 18.55;

/**
 * The candidate streets of a district, best first: two-way streets with pavements on both
 * sides, narrow (a dense street, not an avenue) and long enough for the shot.
 * @param {{roads: {segments: object[]}}} plan
 * @param {string} districtId
 */
export function candidateStreets(plan, districtId) {
  const list = [];
  for (const segment of plan?.roads?.segments ?? []) {
    if (segment.district !== districtId || segment.bridge || !(segment.length >= 60)) continue;
    if (!(segment.sidewalkLeft > 1.2 && segment.sidewalkRight > 1.2)) continue;
    const width = segment.width ?? segment.halfWidth * 2;
    if (!(width >= 7 && width <= 17)) continue;
    // The segment's district is its start's; the picture's place must be inside the district.
    if (typeof plan.districtAt === 'function') {
      const middle = segmentFrame(segment);
      if (plan.districtAt(middle.x, middle.z) !== districtId) continue;
    }
    list.push({ segment, score: Math.abs(width - 11) + Math.abs(segment.length - 110) * 0.02 });
  }
  return list.sort((a, b) => a.score - b.score).map((each) => each.segment);
}

/**
 * The street frame at a segment's middle: centre, unit direction (fx, fz), the right-hand side's
 * pavement and the left-hand one as side offsets.
 */
export function segmentFrame(segment) {
  const points = segment.points;
  const flat = typeof points[0] === 'number';
  const count = flat ? points.length / 2 : points.length;
  const at = (i) => (flat ? { x: points[i * 2], z: points[i * 2 + 1] } : { x: points[i].x, z: points[i].z });
  const middle = Math.floor(count / 2);
  const a = at(Math.max(0, middle - 1)), b = at(Math.min(count - 1, middle + 1)), c = at(middle);
  const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const half = segment.halfWidth ?? (segment.width ?? 10) / 2;
  return {
    x: c.x, z: c.z, fx: (b.x - a.x) / length, fz: (b.z - a.z) / length,
    right: half + Math.min(1.6, segment.sidewalkRight * 0.5), left: -(half + Math.min(1.6, segment.sidewalkLeft * 0.5)),
  };
}

/** A point `side` metres right of the frame's direction and `ahead` metres along it. */
const pointIn = (frame, side, ahead) => ({ x: frame.x + frame.fx * ahead - frame.fz * side, z: frame.z + frame.fz * ahead + frame.fx * side });
/** The player's heading (minus the compass heading) facing from one point to another. */
const headingTo = (from, to) => -Math.atan2(to.x - from.x, -(to.z - from.z));

/**
 * Registers the scene.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function registerBarrioFirefight(context) {
  if (!context.showcase || context.showcase.has('combat-firefight-barrio')) return;
  context.showcase.register({
    name: 'combat-firefight-barrio',
    title: 'A firefight in Barrio Hierro',
    description: 'The lead in the two-handed shooter stance on a worn Barrio Hierro street, a Los Remaches crew firing back from across the street, flashes held.',
    async run(game, tools) {
      const query = new URLSearchParams(globalThis.location?.search ?? '');
      const city = game.systems.find('openWorldCity');
      const streets = candidateStreets(city?.plan, 'barrio_hierro');
      const segment = streets[Math.min(streets.length - 1, Number(query.get('street')) || 0)];
      openScene(game, { hours: HOURS, traffic: 0.2, crowd: 0.6 });
      if (!segment) return;
      const frame = segmentFrame(segment);
      const ahead = Number(query.get('across')) || ACROSS_AHEAD;
      const lead = pointIn(frame, frame.right, -ahead * 0.5);
      const crewCentre = pointIn(frame, frame.left, ahead * 0.5);
      await placeLead(game, tools, lead, headingTo(lead, crewCentre));
      game.commands.run(GAME_COMMANDS.PLAYER_GIVE_WEAPON, { weaponId: 'pistol', ammo: 56 });

      // The crew on the far pavement, facing the lead, guns drawn.
      const crowd = game.systems.find('pedestrians');
      const simulation = crowd?.simulation ?? null;
      const factions = game.content.find?.('gangsAndFactions') ?? game.content.get('gangsAndFactions');
      const people = [];
      if (simulation && typeof simulation.placeAt === 'function' && factions) {
        const faction = factions.GANGS_AND_FACTIONS.los_remaches;
        for (const one of CREW) {
          const member = factions.FACTION_MEMBERS[one.member];
          if (!member || !faction) continue;
          const spot = pointIn(frame, frame.left - Math.sign(frame.left) * one.off * 0.5, ahead * 0.5 + one.along);
          const profile = { ...memberProfile(member, faction), weapon: one.weapon, armedChance: 1 };
          const person = simulation.placeAt(profile, spot.x, spot.z, {
            mode: 'chat', tags: [ENTITY_TAGS.GANG, ENTITY_TAGS.HOSTILE], data: { factionId: faction.id, memberId: member.id },
          });
          if (person) { person.weaponId = one.weapon; people.push(person); }
        }
      }
      const at = game.systems.find('player')?.entity?.position ?? { x: lead.x, y: 0, z: lead.z };
      const faceAndAim = () => {
        for (const person of people) {
          const dx = at.x - person.x, dz = at.z - person.z;
          person.facing = Math.atan2(-dx, -dz);
          if (typeof simulation.aimWeapon === 'function') simulation.aimWeapon(person, at.x, at.y + 1.3, at.z);
        }
      };
      tools.advance(0.4);
      clearPassersBy(game, lead, crewCentre, people);
      game.input.setVirtual('aim', true);
      faceAndAim();
      tools.advance(0.6);
      faceAndAim();
      tools.advance(0.6);
      clearPassersBy(game, lead, crewCentre, people);
      faceAndAim();
      // Both sides fire in the same instant; the effects hold still 0.02 s after the first flash.
      const combat = game.systems.find('combat');
      if (game.commands.has('effects/freeze')) game.commands.run('effects/freeze', { next: 'muzzle_flash', after: 0.02 });
      const shooter = people[1] ?? people[0];
      if (shooter && combat && typeof simulation.muzzleOf === 'function') {
        const muzzle = simulation.muzzleOf(shooter, { x: 0, y: 0, z: 0 });
        // Wide of the lead (into the wall behind): a near miss reads in the picture, a hit would flinch.
        const towards = { x: at.x + frame.fx * 2.5 - muzzle.x, y: at.y + 1.6 - muzzle.y, z: at.z + frame.fz * 2.5 - muzzle.z };
        combat.fire(shooter.entity, shooter.weaponId, muzzle, towards, { accuracy: 1, walker: shooter.body?.walker ?? null });
      }
      game.input.setVirtual('attack', true);
      tools.advance(0.06);
      game.input.setVirtual('attack', false);
    },
  });
}

/** Sends away the passers-by near the lead and in the line of fire (not the crew). */
function clearPassersBy(game, lead, crew, keep) {
  const crowd = game.systems.find('pedestrians');
  if (!crowd?.people || typeof crowd.removePerson !== 'function') return;
  const mx = (lead.x + crew.x) / 2, mz = (lead.z + crew.z) / 2;
  const half = Math.hypot(crew.x - lead.x, crew.z - lead.z) / 2;
  for (const person of [...crowd.people]) {
    if (keep.includes(person)) continue;
    const nearLead = Math.hypot(person.x - lead.x, person.z - lead.z) < 4;
    const inLine = Math.hypot(person.x - mx, person.z - mz) < half * 0.8;
    if (nearLead || inLine) crowd.removePerson(person.id);
  }
}
