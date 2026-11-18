// Pure rules of the gang territories: whose corners a district is, the crowd profile of a member
// (in the faction's colours, ready to fight), and how attitudes fall with what the player does.
import assert from 'node:assert/strict';
import test from 'node:test';
import { attacksOnSight, attitudeAfter, memberProfile, turfFactionAt } from '../../../game/src/pedestrians/turfCrews.js';
import { pickAppearance } from '../../../game/src/pedestrians/crowdSpawning.js';
import { chooseReaction } from '../../../game/src/pedestrians/pedestrianReactions.js';
import { FACTION_ATTITUDE_RULES, FACTION_MEMBERS, GANGS_AND_FACTIONS } from '../../../game/src/catalog/gangsAndFactions.js';

test('each gang holds its own turf; the police and open districts have no corner crews', () => {
  assert.equal(turfFactionAt('puerto_tamarindo', GANGS_AND_FACTIONS).id, 'la_corriente');
  assert.equal(turfFactionAt('barrio_hierro', GANGS_AND_FACTIONS).id, 'los_remaches');
  assert.equal(turfFactionAt('la_marisma', GANGS_AND_FACTIONS).id, 'vecinos_marisma');
  assert.equal(turfFactionAt('centro', GANGS_AND_FACTIONS), null, 'centro is police turf only');
  assert.equal(turfFactionAt('nowhere', GANGS_AND_FACTIONS), null);
});

test('members wear their faction colours and fight back', () => {
  let s = 9;
  const random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const faction = GANGS_AND_FACTIONS.los_remaches;
  for (const memberId of faction.members) {
    const profile = memberProfile(FACTION_MEMBERS[memberId], faction);
    assert.equal(profile.factionId, 'los_remaches');
    const look = pickAppearance(profile.appearance, random);
    const tops = FACTION_MEMBERS[memberId].appearance.outfits.flatMap((outfit) => outfit.top.colors);
    assert.ok(tops.includes(look.paints.paint_jacket), `${memberId} wears a catalog top colour`);
    let fights = 0;
    for (let i = 0; i < 400; i += 1) if (chooseReaction(profile, 'fight_nearby', random, { distance: 3 }) === 'fight') fights += 1;
    assert.ok(fights > 200, `${memberId} usually fights when a fight breaks out`);
  }
});

test('attitudes fall with assaults and kills, clamp, and turn to attack on sight', () => {
  const rules = FACTION_ATTITUDE_RULES;
  assert.equal(attitudeAfter(0, 'assault', rules), rules.perAssault);
  assert.equal(attitudeAfter(0, 'kill', rules), rules.perKill);
  assert.equal(attitudeAfter(-99, 'kill', rules), rules.range[0]);
  let attitude = 0;
  let kills = 0;
  while (!attacksOnSight(attitude, rules)) { attitude = attitudeAfter(attitude, 'kill', rules); kills += 1; }
  assert.ok(kills >= 3 && kills <= 5, `a handful of kills makes a gang hostile on sight (${kills})`);
});
