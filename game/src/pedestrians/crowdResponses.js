// How the crowd responds to what happens near it: a stimulus (gunfire, a blast, a near miss, an
// aimed gun, a fight) sets each person's reaction from their archetype (pedestrianReactions.js
// holds the rules), witnesses of a crime report it, and damage hurts, provokes or kills. Works
// on the shared crowd state that crowdSimulation.js builds.
import { ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { CALL_SECONDS, FLEE_SECONDS, chooseReaction, witnessHeat } from './pedestrianReactions.js';

/**
 * Creates the crowd's responses.
 * @param {object} crowd The shared crowd state (crowdSimulation.js).
 */
export function createCrowdResponses(crowd) {
  const { context, people } = crowd;

  /** Makes a person react to a stimulus at x, z. */
  function react(person, stimulus, x, z, offenderId, distance) {
    if (person.mode === 'down' || person.mode === 'dead' || person.mode === 'dragged') return;
    const panicking = person.mode === 'flee' || person.mode === 'cower';
    const reaction = chooseReaction(person.archetype, stimulus, crowd.random, { panicking, armed: person.armed, distance });
    person.entity.data.reaction = reaction;
    person.sourceX = x;
    person.sourceZ = z;
    person.offenderId = offenderId ?? null;
    if (person.seat) crowd.leaveSeat(person);
    person.leader = null;
    if (person.stance && person.stance !== 'stand' && reaction !== 'cower' && reaction !== 'hands_up') crowd.setStance(person, 'stand');
    if (reaction === 'flee' || reaction === 'dive_aside') { person.mode = 'flee'; person.timer = FLEE_SECONDS; }
    else if (reaction === 'cower' || reaction === 'hands_up') {
      person.mode = 'cower';
      person.timer = 6 + crowd.random() * 6;
      // Down with the arms over the head close to the trouble, crouched further off, or
      // standing with the hands raised (the run-time's stances).
      crowd.setStance(person, reaction === 'hands_up' ? 'hands_up' : distance < 14 ? 'cower' : 'crouch');
    }
    else if (reaction === 'gawk' || reaction === 'film' || reaction === 'shout') { person.mode = 'gawk'; person.timer = 6 + crowd.random() * 6; }
    else if (reaction === 'call_police') { person.mode = 'call'; person.timer = CALL_SECONDS; }
    else if (reaction === 'fight' && offenderId != null) { person.mode = 'fight'; person.timer = 14; }
  }

  /** Stimulates everyone within reach of x, z; returns how many. */
  function stimulate(stimulus, x, z, radius, offenderId) {
    let count = 0;
    for (const person of people) {
      const d = Math.hypot(person.x - x, person.z - z);
      if (d > radius || person.id === offenderId) continue;
      react(person, stimulus, x, z, offenderId, d);
      count += 1;
    }
    if (count > 0 && (stimulus === 'gunfire' || stimulus === 'explosion')) {
      context.events.queue(GAME_EVENTS.PEDESTRIANS_PANICKED, { position: { x, y: 0, z }, radius, cause: stimulus });
    }
    return count;
  }

  /** People near a crime see it: one reports at once, some phone it in. */
  function witness(crimeId, offenderId, x, z) {
    let seen = false;
    for (const person of people) {
      if (person.mode === 'down' || person.mode === 'dead' || person.mode === 'dragged') continue;
      if (Math.hypot(person.x - x, person.z - z) > 35) continue;
      context.entities.addTag(person.entity, ENTITY_TAGS.WITNESS);
      if (!seen) {
        seen = true;
        context.events.queue(GAME_EVENTS.CRIME_WITNESSED, { crimeId, offenderId, witnessId: person.id, position: { x: person.x, y: 0, z: person.z }, heat: witnessHeat(false) });
      }
      if (crowd.random() < (person.archetype.reportsCrimeChance || 0) && person.mode !== 'flee') {
        person.mode = 'call';
        person.timer = CALL_SECONDS;
        person.crimeId = crimeId;
        person.offenderId = offenderId;
      }
    }
  }

  /** Takes damage from DAMAGE_DEALT: provoked, fleeing or fighting back, or dead. */
  function hurt(person, amount, attackerId, fatal) {
    person.entity.data.health -= amount;
    person.provoked = true;
    if (fatal || person.entity.data.health <= 0) {
      person.mode = 'dead';
      person.fall = 0;
      person.entity.data.health = 0;
      context.entities.addTag(person.entity, ENTITY_TAGS.DEAD);
    } else if (person.mode !== 'down' && person.mode !== 'dragged') {
      react(person, 'fight_nearby', person.x, person.z, attackerId, 1);
      // (A sentry, archetype.sentry, stands his ground whoever hurt him.)
      if (person.mode !== 'fight' && !person.archetype.sentry) { person.mode = 'flee'; person.timer = FLEE_SECONDS; }
    }
  }

  return { react, stimulate, witness, hurt };
}
