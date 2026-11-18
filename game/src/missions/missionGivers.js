// The mission givers in person: each offered mission's giver (storyCharacters, dressed from the
// character's own appearance spec) stands beside the start marker, facing the street, as a member
// of the pedestrian crowd that the crowd neither walks off nor recycles while the lead is near; in
// the intro the giver steps in front of the lead so the cutscene's establishing and reverse shots
// frame the two of them talking. A few locals of the district (mechanics by the tow garage,
// dockers at the port) chat a few steps along the frontage, so the place is alive in the opening
// and in the establishing shot. Everyone stands at an exact point (crowdPlacement.js), also where
// the crowd has no pavement route (the port). Givers are stood up again when the lead comes back.
import { moveCrowdPerson, standInCrowd } from './crowdPlacement.js';

const SHOW_DISTANCE = 75;
const STAGE_CLEAR_RADIUS = 6;        // metres around the lead and the giver kept clear in the intro
const COMPANY_ALONG = 6.5;           // metres along the frontage from the intro's stage, giver's side
const COMPANY_RING = 0.92;           // radius of the chatting circle (three people 1.6 m apart)
/** Locals who fit a district's mission starts; elsewhere anyone the district's crowd has. */
const LOCALS = Object.freeze({
  barrio_hierro: ['mechanic', 'factory_worker', 'mechanic'],
  puerto_tamarindo: ['dock_worker', 'dock_worker', 'factory_worker'],
});

/** A crowd profile (the shape of a pedestrian archetype) from a story character. */
export function giverProfile(character) {
  const a = character.appearance;
  const o = a.outfit;
  return {
    id: character.id,
    name: character.name,
    health: 200,
    courage: 0.6,
    aggression: 0.1,
    armedChance: 0,
    reportsCrimeChance: 0,
    walkSpeed: 1.2,
    activities: { stand_chat: 12 },
    reactions: {
      gunfire: { cower: 6, flee: 2 }, explosion: { flee: 6 }, fight_nearby: { gawk: 6 }, body_seen: { gawk: 6 },
      vehicle_near_miss: { shout: 6, dive_aside: 4 }, aimed_at: { hands_up: 6 }, bumped: { shout: 8 },
    },
    appearance: {
      sexes: { [a.sex]: 1 },
      heightRange: [a.height, a.height],
      skinTones: [a.skinTone],
      hairStyles: { [a.sex]: [a.hairStyle] },
      hairColors: [a.hairColor],
      outfits: [{
        sex: 'any', weight: 1,
        top: { piece: o.top.piece, colors: [o.top.color], ...(o.top.secondaryColor ? { secondaryColors: [o.top.secondaryColor] } : {}) },
        bottom: { piece: o.bottom.piece, colors: [o.bottom.color] },
        shoes: { piece: o.shoes.piece, colors: [o.shoes.color] },
      }],
      builds: { [a.build]: 1 },
      ageBands: { [a.ageBand]: 1 },
    },
  };
}

/**
 * The archetype ids of the locals chatting near a mission start (pure).
 * @param {string} district The start's district id.
 * @param {Record<string, {districts?: string[]}>} archetypes PEDESTRIAN_ARCHETYPES.
 * @param {() => number} random
 * @returns {string[]} Three ids (fewer when the catalog has nobody for the district).
 */
export function companyFor(district, archetypes, random) {
  const fixed = LOCALS[district]?.filter((id) => archetypes[id]);
  if (fixed?.length) return fixed.slice(0, 3);
  const local = Object.keys(archetypes).filter((id) => archetypes[id].districts?.includes(district));
  return local.length ? [0, 1, 2].map(() => local[Math.floor(random() * local.length)]) : [];
}

/**
 * Where the locals stand: a small circle along the frontage, past the giver (pure).
 * @param {{x: number, z: number, frontX: number, frontZ: number}} point The start marker.
 * @param {number} count
 * @param {number} turn A turn of the circle (radians).
 * @returns {{x: number, z: number, facing: number}[]} Each facing the circle's middle.
 */
export function companySpots(point, count, turn = 0) {
  const fx = point.frontX, fz = point.frontZ;
  // The intro stands the lead 1.2 m back from the marker; the giver's side is to its right (-fz, fx).
  const cx = point.x - fx * 0.9 - fz * COMPANY_ALONG, cz = point.z - fz * 0.9 + fx * COMPANY_ALONG;
  const spots = [];
  for (let i = 0; i < count; i += 1) {
    const angle = turn + (i / count) * Math.PI * 2;
    const x = cx + Math.cos(angle) * COMPANY_RING, z = cz + Math.sin(angle) * COMPANY_RING;
    spots.push({ x, z, facing: Math.atan2(-(cx - x), -(cz - z)) });
  }
  return spots;
}

/**
 * Creates the givers.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {Record<string, object>} cast STORY_CHARACTERS.
 * @param {{markerRadius?: number}} [options] The start marker's radius: the giver stands outside it.
 */
export function createMissionGivers(context, cast, { markerRadius = 2.2 } = {}) {
  const clearance = markerRadius + 0.9;
  const wanted = new Map();          // missionId -> {characterId, x, z, facing, person, company, away}
  const random = context.random?.('missionGivers');
  const roll = typeof random === 'function' ? random : random?.next ? () => random.next() : Math.random;
  let timer = 0;

  const crowd = () => context.systems.find('pedestrians')?.simulation ?? null;
  const archetypes = () => context.content.find('pedestrianArchetypes')?.PEDESTRIAN_ARCHETYPES ?? {};
  const living = (person) => Boolean(person) && Boolean(context.entities.get(person.id)) && person.mode !== 'dead';
  const alive = (giver) => living(giver.person);

  function standUp(giver) {
    const simulation = crowd();
    const character = cast[giver.characterId];
    if (!simulation || !character?.appearance || !simulation.inView) return;
    const extra = { tags: ['pedestrian'], data: { characterId: giver.characterId, missionGiver: true } };
    const person = standInCrowd(simulation, giverProfile(character), giver.x, giver.z, { extra, exact: true });
    if (!person) return;
    giver.person = person;
    pose(giver);
  }

  /** The locals near the start, once per visit (someone the lead scares off is not replaced in view). */
  function standCompany(giver) {
    const simulation = crowd();
    if (!simulation || !giver.point || giver.company?.some((each) => living(each.person))) return;
    const ids = companyFor(giver.district, archetypes(), roll);
    const spots = companySpots(giver.point, ids.length, roll() * Math.PI);
    giver.company = [];
    ids.forEach((id, index) => {
      const spot = spots[index];
      const person = standInCrowd(simulation, id, spot.x, spot.z, { exact: true, heading: spot.facing, extra: { tags: ['pedestrian'], data: { missionCompany: true } } });
      if (!person) return;
      giver.company.push({ person, spot });
    });
  }

  function release(people, now) {
    const simulation = crowd();
    for (const person of people) {
      if (!living(person)) continue;
      if (simulation?.removePerson?.(person.id, now ? null : { whenUnseen: true })) continue;
      person.mode = 'walk';
      person.timer = 0;
    }
  }

  /** Takes passers-by off the intro's stage (the cutscene cuts in, so nobody sees them go). */
  function clearStage(giver, lead) {
    const simulation = crowd();
    if (!simulation?.people || typeof simulation.removePerson !== 'function') return;
    const midX = (giver.x + lead.x) / 2, midZ = (giver.z + lead.z) / 2;
    const leaving = [];
    for (const person of simulation.people) {
      const data = person.entity?.data;
      if (person === giver.person || data?.missionGiver || data?.missionEnemy || data?.missionCompany) continue;
      if (Math.hypot(person.x - midX, person.z - midZ) < STAGE_CLEAR_RADIUS) leaving.push(person.id);
    }
    for (const id of leaving) simulation.removePerson(id);
  }

  function pose(giver) {
    const person = giver.person;
    person.mode = 'chat';
    person.timer = Infinity;
    person.facing = giver.facing;
    moveCrowdPerson(person, giver.x, giver.z);
  }

  return {
    /**
     * Stands the giver of a mission beside its marker (point with frontX, frontZ) with a few locals
     * of the district, or removes them with null.
     */
    show(missionId, characterId, point, district = '') {
      const giver = wanted.get(missionId);
      if (!point || !characterId || characterId === 'either') {
        if (!giver) return;
        wanted.delete(missionId);
        release([giver.person, ...(giver.company ?? []).map((each) => each.person)], false);
        return;
      }
      // Beside the marker and clear of its glowing cylinder, a step towards the door, facing the street.
      const x = point.x - point.frontZ * clearance - point.frontX * 0.6, z = point.z + point.frontX * clearance - point.frontZ * 0.6;
      if (giver && giver.characterId === characterId && Math.abs(giver.x - x) + Math.abs(giver.z - z) < 0.1) return;
      wanted.set(missionId, {
        characterId, x, z, facing: Math.atan2(-point.frontX, -point.frontZ), person: giver?.person ?? null,
        point, district, company: giver?.company ?? null, away: !giver,
      });
    },
    /** Puts a mission's giver in front of the lead for the intro (lead {x, z, heading}). */
    stage(missionId, lead) {
      const giver = wanted.get(missionId);
      if (!giver) return;
      const fx = -Math.sin(lead.heading), fz = -Math.cos(lead.heading);
      giver.x = lead.x + fx * 2.4 - fz * 0.35;
      giver.z = lead.z + fz * 2.4 + fx * 0.35;
      giver.facing = Math.atan2(-(lead.x - giver.x), -(lead.z - giver.z));
      if (!alive(giver)) standUp(giver);
      else pose(giver);
      if (giver.away || !giver.company) { giver.away = false; standCompany(giver); }
      clearStage(giver, lead);
    },
    /** Takes a mission's giver away at once (the giver has just become the lead); the locals stay. */
    dismiss(missionId) {
      const giver = wanted.get(missionId);
      if (!giver) return;
      wanted.delete(missionId);
      release([giver.person], true);
      release((giver.company ?? []).map((each) => each.person), false);
    },
    /** Where a mission's giver stands (or null). */
    of: (missionId) => wanted.get(missionId) ?? null,
    /** The people standing round a mission's start: the giver, then the locals. */
    peopleAt: (missionId) => {
      const giver = wanted.get(missionId);
      return giver ? [giver.person, ...(giver.company ?? []).map((each) => each.person)].filter(living) : [];
    },
    update(dt) {
      timer -= dt;
      if (timer > 0) return;
      timer = 0.5;
      const focus = context.focus.position;
      for (const giver of wanted.values()) {
        const near = Math.hypot(giver.x - focus.x, giver.z - focus.z) < SHOW_DISTANCE;
        if (!near) { giver.away = true; continue; }
        if (!alive(giver)) { giver.person = null; standUp(giver); }
        // Back to the spot after a scare (the crowd's reactions move people about).
        else if (giver.person.mode === 'walk' || giver.person.mode === 'wait') pose(giver);
        // Locals scared off walk away for good this visit (no one pops back in view).
        if (giver.away) { giver.away = false; standCompany(giver); }
      }
    },
    dispose() { wanted.clear(); },
  };
}
