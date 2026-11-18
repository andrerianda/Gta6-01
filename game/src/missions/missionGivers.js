// The mission givers in person: each offered mission's giver (storyCharacters, dressed from the
// character's own appearance spec) stands beside the start marker, facing the street, as a member
// of the pedestrian crowd that the crowd neither walks off nor recycles while the lead is near; in
// the intro the giver steps in front of the lead so the cutscene's establishing and reverse shots
// frame the two of them talking. Givers are stood up again when the lead comes back after the
// crowd let them go.
const SHOW_DISTANCE = 75;

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
 * Creates the givers.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {Record<string, object>} cast STORY_CHARACTERS.
 */
export function createMissionGivers(context, cast) {
  const wanted = new Map();          // missionId -> {characterId, x, z, facing, person}
  let timer = 0;

  const crowd = () => context.systems.find('pedestrians')?.simulation ?? null;
  const alive = (giver) => giver.person && context.entities.get(giver.person.id) && giver.person.mode !== 'dead';

  function standUp(giver) {
    const simulation = crowd();
    const character = cast[giver.characterId];
    if (!simulation || !character?.appearance || !simulation.inView) return;
    const person = simulation.spawnAt(giverProfile(character), giver.x, giver.z, 'chat', { tags: ['pedestrian'], data: { characterId: giver.characterId, missionGiver: true } });
    if (!person) return;
    giver.person = person;
    pose(giver);
  }

  function pose(giver) {
    const person = giver.person;
    person.mode = 'chat';
    person.timer = Infinity;
    person.x = giver.x;
    person.z = giver.z;
    person.facing = giver.facing;
    person.entity.position.x = giver.x;
    person.entity.position.z = giver.z;
  }

  return {
    /** Stands the giver of a mission beside its marker (point with frontX, frontZ), or removes it with null. */
    show(missionId, characterId, point) {
      const giver = wanted.get(missionId);
      if (!point || !characterId || characterId === 'either') {
        if (!giver) return;
        wanted.delete(missionId);
        if (alive(giver)) { giver.person.mode = 'walk'; giver.person.timer = 0; }
        return;
      }
      // Beside the marker, a step towards the door, facing the street.
      const x = point.x - point.frontZ * 1.6 - point.frontX * 0.6, z = point.z + point.frontX * 1.6 - point.frontZ * 0.6;
      if (giver && giver.characterId === characterId && Math.abs(giver.x - x) + Math.abs(giver.z - z) < 0.1) return;
      wanted.set(missionId, { characterId, x, z, facing: Math.atan2(-point.frontX, -point.frontZ), person: giver?.person ?? null });
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
    },
    /** Where a mission's giver stands (or null). */
    of: (missionId) => wanted.get(missionId) ?? null,
    update(dt) {
      timer -= dt;
      if (timer > 0) return;
      timer = 0.5;
      const focus = context.focus.position;
      for (const giver of wanted.values()) {
        const near = Math.hypot(giver.x - focus.x, giver.z - focus.z) < SHOW_DISTANCE;
        if (!near) continue;
        if (!alive(giver)) { giver.person = null; standUp(giver); continue; }
        // Back to the spot after a scare (the crowd's reactions move people about).
        if (giver.person.mode === 'walk' || giver.person.mode === 'wait') pose(giver);
      }
    },
    dispose() { wanted.clear(); },
  };
}
