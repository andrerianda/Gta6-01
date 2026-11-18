// The player: the lead character on foot and at the wheel. The move keys walk the lead away from
// the camera (run by default, sprint with Shift, walk, jump, turns and starts with inertia); F
// walks to the nearest car's door, opens it, sits in at the wheel and drives (vehicleEntry.js);
// taking a car emits VEHICLE_STOLEN with the lead as thiefId. The lead has health and armour, is wasted at zero
// health or busted by the police, and respawns at the nearest hospital or police station. The
// implementation is playerLead.js and its neighbours, loaded in init(). It owns the entity
// tagged 'player' and answers PLAYER_TELEPORT, PLAYER_ENTER_VEHICLE, PLAYER_HEAL and
// PLAYER_SWITCH_CHARACTER. Contract: docs/ARCHITECTURE.md, "player".
// Members for other systems (police, missions, combat, camera):
//   player.health, player.armour        0..100;
//   player.down                         'wasted' | 'busted' | null;
//   player.arrestable                   on foot under 1 m/s or in a car under 2 m/s, not down;
//   player.damage(amount, {cause, attackerId}) -> health taken (armour soaks first);
//   player.kill(cause, killerId), player.bust({officerId}) -> whether the lead went down;
//   player.switchCharacter(characterId) -> boolean;
//   player.figure                       the drawn body ({instance} is the lead's Object3D);
//   player.motion, player.mode, player.vehicle, player.entity, player.setWalking(on).

/**
 * Creates the player character system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createPlayerCharacterSystem(context) {
  let lead = null;

  const system = {
    name: 'player',
    dependsOn: ['openWorldCity', 'vehicles', 'physics'],
    /** Tells the temporary engine demonstration that the real player is here. */
    drivesTheLead: true,
    /** The lead's entity (kind character); `data` holds characterId, health, armour, vehicleId. */
    entity: null,
    get mode() { return lead && lead.seat.vehicle ? 'inVehicle' : 'onFoot'; },
    get vehicle() { return lead ? lead.seat.vehicle : null; },
    get motion() { return lead ? lead.movement.state : null; },
    get figure() { return lead ? lead.figure : null; },
    get characterId() { return system.entity ? system.entity.data.characterId : null; },
    get health() { return system.entity ? system.entity.data.health : 0; },
    get armour() { return system.entity ? system.entity.data.armour : 0; },
    get down() { return lead ? lead.vitals.down : null; },
    get arrestable() { return lead ? lead.vitals.arrestable : false; },
    damage(amount, options) { return lead ? lead.vitals.damage(amount, options) : 0; },
    kill(cause, killerId) { return lead ? lead.vitals.kill(cause, killerId) : false; },
    bust(options) { return lead ? lead.vitals.bust(options) : false; },
    switchCharacter(characterId) { return lead ? lead.switchCharacter(characterId) : false; },
    /** Walk instead of run whatever the keys say (scenes, scripted moments). */
    setWalking(walking) { if (lead) lead.walkForced = Boolean(walking); },
    /** Save section: {characterId, position, heading, health, armour, vehicle {modelId, colour, damage} | null}. */
    serialise() { return lead ? lead.serialise() : null; },
    restore(data) { if (lead) lead.restore(data); },

    async init(progress) {
      progress(0.3, 'the lead');
      const { createPlayerLead } = await import('./playerLead.js');
      lead = createPlayerLead(context, system);
      progress(1, 'the lead');
    },

    start() { lead.start(); },
    fixedUpdate(stepSeconds) { lead.fixedUpdate(stepSeconds); },
    update(deltaSeconds, alpha) { lead.update(deltaSeconds, alpha); },
    dispose() { if (lead) lead.dispose(); },
  };
  return system;
}
