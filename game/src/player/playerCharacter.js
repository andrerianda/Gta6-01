// The player: the lead character on foot and at the wheel. On foot the move keys walk the lead
// away from the camera (onFootMovement.js: run by default, sprint with Shift, walk, jump, turns
// and starts with inertia) through the physics character capsule (a ground follower until the
// physics system offers one); the body is posed by the character run-time between fixed steps
// (playerAnimation.js). F enters the nearest vehicle and drives it (vehicleEntry.js). It owns
// the entity tagged 'player', answers PLAYER_TELEPORT, PLAYER_ENTER_VEHICLE and PLAYER_HEAL, and
// registers the on-foot showcase scene. Its contract is docs/ARCHITECTURE.md, "player".
import { ENTITY_KINDS, ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';

/**
 * Creates the player character system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createPlayerCharacterSystem(context) {
  const intent = { x: 0, z: 0, sprint: false, walk: false, jump: false };
  let movement = null;
  let figure = null;
  let seat = null;
  let readIntent = null;
  let walkForced = false;

  function teleport({ position, heading }) {
    if (seat.vehicle) seat.exit(false);
    const turn = typeof heading === 'number' ? heading : movement.state.heading;
    const y = typeof position.y === 'number' ? position.y : undefined;
    movement.placeAt(position.x, position.z, turn, y);
    syncEntity();
    const s = movement.state;
    context.events.emit(GAME_EVENTS.PLAYER_TELEPORTED, { position: { x: s.x, y: s.y, z: s.z }, heading: s.heading });
  }

  function syncEntity() {
    const s = movement.state;
    system.entity.position.set(s.x, s.y, s.z);
    system.entity.heading = s.heading;
  }

  const system = {
    name: 'player',
    dependsOn: ['openWorldCity', 'vehicles', 'physics'],
    /** Tells the temporary engine demonstration that the real player is here. */
    drivesTheLead: true,
    /** The lead's entity (kind character); `data` holds characterId, health, armour, vehicleId. */
    entity: null,
    /** 'onFoot' or 'inVehicle'. */
    get mode() { return seat && seat.vehicle ? 'inVehicle' : 'onFoot'; },
    /** The vehicle being driven, or null. */
    get vehicle() { return seat ? seat.vehicle : null; },
    /** The on-foot state: feet position (previous and current step), heading, speed, grounded. */
    get motion() { return movement ? movement.state : null; },
    /** Walk instead of run whatever the keys say (scenes, scripted moments). */
    setWalking(walking) { walkForced = Boolean(walking); },

    async init(progress) {
      const [{ createOnFootMovement, readOnFootIntent }, { createPlayerAnimation }, { createVehicleEntry },
        { createGroundProbe }, { registerOnFootShowcase }, { registerPlayerHealth }, THREE] = await Promise.all([
        import('./onFootMovement.js'), import('./playerAnimation.js'), import('./vehicleEntry.js'),
        import('./groundProbe.js'), import('./onFootShowcase.js'), import('./healthAndRespawn.js'), import('three')]);
      readIntent = readOnFootIntent;
      progress(0.3, 'the lead');
      const characterId = 'dez_tolliver';
      const assetId = context.assets.has(characterId) ? characterId : 'lead_a';
      movement = createOnFootMovement({ physics: context.systems.find('physics'), groundHeightAt: createGroundProbe(context) });
      figure = createPlayerAnimation(context, assetId);
      system.entity = context.entities.add({
        kind: ENTITY_KINDS.CHARACTER, owner: 'player', position: new THREE.Vector3(), radius: 0.4,
        tags: [ENTITY_TAGS.PLAYER, ENTITY_TAGS.PERSISTENT],
        data: { characterId, assetId, health: 100, armour: 0, vehicleId: null },
      });
      seat = createVehicleEntry(context, { entity: system.entity, movement, figure });
      context.commands.handle(GAME_COMMANDS.PLAYER_TELEPORT, teleport);
      context.commands.handle(GAME_COMMANDS.PLAYER_ENTER_VEHICLE, ({ vehicleId, seat: place }) => seat.enter(vehicleId, place));
      registerPlayerHealth(context, system.entity);
      registerOnFootShowcase(context);
      progress(1, 'the lead');
    },

    start() {
      movement.placeAt(2, 10, 0);
      syncEntity();
      const s = movement.state;
      context.events.emit(GAME_EVENTS.PLAYER_SPAWNED, {
        playerId: system.entity.id, characterId: system.entity.data.characterId, position: { x: s.x, y: s.y, z: s.z }, heading: s.heading,
      });
    },

    fixedUpdate(stepSeconds) {
      const input = context.input;
      if (seat.vehicle) {
        seat.drive(input);
      } else if (input.pressed('enterVehicle') && seat.tryEnter()) {
        return;
      } else {
        const camera = context.systems.find('followCamera');
        const yaw = camera && typeof camera.yaw === 'number' ? camera.yaw : movement.state.heading;
        movement.step(readIntent(input, yaw, intent, walkForced), stepSeconds);
      }
      syncEntity();
    },

    update(deltaSeconds, alpha) {
      if (!seat.vehicle) figure.update(deltaSeconds, alpha, movement.state);
    },

    dispose() {
      if (system.entity) context.entities.remove(system.entity);
      if (figure) figure.dispose();
      if (movement) movement.dispose();
    },
  };
  return system;
}
