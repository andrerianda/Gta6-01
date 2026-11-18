// The mission picture, scene `mission-firefight`: a story mission under way (its title and
// objective on the HUD) on Bulevar Dorado in the warm late afternoon. The lead stands on the
// hotel-side pavement, pistol aimed over the right shoulder across the drive at a car that has
// just been shot to pieces: the vehicle system wrecks it, the physics blows it up and the effects
// draw the fireball, the smoke and the debris; the lead's last shot is still flashing.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { leadIdOf, openScene, placeLead, pavementPointNear, pointInFrame, streetFrameOf } from './showcaseStaging.js';

/** The mission shown and the objective it is at. */
const MISSION = Object.freeze({ missionId: 'm05_night_shift', startIndex: 1 });
/** Where along Bulevar Dorado (0 east end, 1 west end). */
const ALONG = 0.55;
/** Metres ahead of the lead the target car stands: close, but outside the 9 m blast push. */
const TARGET_AHEAD = 7.5;
/**
 * Seconds between the blast and the shot that freezes the picture: the fireball at its fullest,
 * the smoke rising. (The pale rectangle over the left half of every aim-view take so far is the
 * aim camera clipping into the lead, being fixed by the player programmer, not an effect.)
 */
const AFTER_BLAST_SECONDS = 0.2;

/**
 * Registers the mission scene.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerMissionFirefight(context) {
  return context.showcase.register({
    name: 'mission-firefight',
    title: 'A mission goes loud on Bulevar Dorado',
    description: 'The mission objective on the HUD, the lead aiming a pistol at a car that has just exploded.',
    async run(game, tools) {
      const { commands } = game;
      // Dusk (the sun on the horizon): the fireball burns against a darker street than by day.
      openScene(game, { hours: 19.4, traffic: 0.5, crowd: 1 });
      const frame = streetFrameOf(game, 'bulevar_dorado', ALONG);
      // The lead on the hotel side (positive side offsets), the target in the near carriageway.
      // 3 m along from the first spot tried: there a lamp post stood in the line of fire.
      const spot = pavementPointNear(game, frame, frame.kerb + 3, 3, [frame.kerb + 1.2, frame.kerb + 9]);
      const target = pointInFrame(frame, frame.laneSide(1), 3 + TARGET_AHEAD);
      const facing = Math.atan2(target.x - spot.x, -(target.z - spot.z));
      await placeLead(game, tools, spot, -facing);
      if (commands.has(GAME_COMMANDS.MISSION_START)) commands.run(GAME_COMMANDS.MISSION_START, { ...MISSION, skipIntro: true });
      commands.run(GAME_COMMANDS.PLAYER_GIVE_WEAPON, { weaponId: 'pistol', ammo: 60 });
      const fleet = game.systems.get('vehicles');
      const car = fleet.spawn({
        modelId: 'family_sedan', position: target, heading: frame.compass + 0.5, colour: '#2D4F7C', parked: false, ownerSystem: 'showcase',
      });
      fleet.spawn({
        modelId: 'taxi_cab', position: pointInFrame(frame, frame.laneSide(1) + 0.4, 15), heading: frame.compass + 0.2, parked: true, ownerSystem: 'showcase',
      });
      tools.advance(0.6);
      clearAroundLead(game, 4);
      game.input.setVirtual('aim', true);
      tools.advance(1.1);
      clearAroundLead(game, 3);
      const at = fleet.get(car)?.entity.position ?? target;
      fleet.damage(car, 1e6, 'weapon', leadIdOf(game), { x: at.x, y: at.y + 0.8, z: at.z });
      tools.advance(AFTER_BLAST_SECONDS);
      // The lead fires into the blaze (the action is 'attack'). The effects hold still 0.02 s after
      // the shot's muzzle flash appears, so its 0.06 s flash and the fireball are in the picture.
      if (commands.has('effects/freeze')) commands.run('effects/freeze', { next: 'muzzle_flash', after: 0.02 });
      game.input.setVirtual('attack', true);
      tools.advance(0.08);
      game.input.setVirtual('attack', false);
      tools.advance(0.04);
    },
  });
}

/** Sends away the passers-by within `radius` metres of the lead (nobody stands inside the aiming lead). */
function clearAroundLead(game, radius) {
  const crowd = game.systems.find('pedestrians');
  const lead = game.systems.find('player')?.motion;
  if (!crowd?.people || typeof crowd.removePerson !== 'function' || !lead) return;
  for (const person of [...crowd.people]) {
    if (Math.hypot(person.x - lead.x, person.z - lead.z) < radius) crowd.removePerson(person.id);
  }
}
