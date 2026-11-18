// The lead as the player system runs it: the on-foot mover (onFootMovement.js), the drawn body
// (playerAnimation.js), the vehicle seat (vehicleEntry.js) and the vitals (healthAndRespawn.js),
// wired to the lead's entity. It teleports, steps the lead every fixed step (facing along the
// camera while aiming, no sprint while aiming), poses the body every frame, and switches the
// playable lead (PLAYER_SWITCH_CHARACTER): a lead with a model of their own gets their body,
// one without is drawn on the starting lead's body recoloured from the catalog.
import * as THREE from 'three';
import { ENTITY_KINDS, ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { createGroundProbe } from './groundProbe.js';
import { createLeadVitals } from './healthAndRespawn.js';
import { dressLead, storyCharacter } from './leadAppearance.js';
import { createOnFootMovement, readOnFootIntent } from './onFootMovement.js';
import { registerOnFootShowcase, stagingSpot } from './onFootShowcase.js';
import { createPlayerAnimation } from './playerAnimation.js';
import { createVehicleEntry } from './vehicleEntry.js';

/** The lead the game starts with, and the body every lead falls back to. */
export const STARTING_LEAD = 'dez_tolliver';

/**
 * Creates the lead and registers its commands.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {{entity: object}} system The player system (its `entity` is set here).
 */
export function createPlayerLead(context, system) {
  const intent = { x: 0, z: 0, sprint: false, walk: false, jump: false };
  const stops = [];
  const bodyOf = (characterId) => (context.assets.has(characterId) ? characterId
    : context.assets.has(STARTING_LEAD) ? STARTING_LEAD : 'lead_a');
  const heightOf = (assetId) => { const asset = context.assets.get(assetId); return asset && asset.extras && asset.extras.height || 1.86; };

  const lead = {
    movement: createOnFootMovement({ physics: context.systems.find('physics'), groundHeightAt: createGroundProbe(context) }),
    figure: null, seat: null, vitals: null, walkForced: false,
    teleport, start, fixedUpdate, update, switchCharacter, serialise, restore, dispose,
  };
  const entity = context.entities.add({
    kind: ENTITY_KINDS.CHARACTER, owner: 'player', position: new THREE.Vector3(), radius: 0.4,
    tags: [ENTITY_TAGS.PLAYER, ENTITY_TAGS.PERSISTENT],
    data: { characterId: STARTING_LEAD, assetId: bodyOf(STARTING_LEAD), health: 100, armour: 0, vehicleId: null },
  });
  system.entity = entity;

  function buildBody(characterId) {
    const assetId = bodyOf(characterId);
    lead.figure = createPlayerAnimation(context, assetId);
    if (assetId !== characterId) dressLead(lead.figure.instance, characterId, heightOf(assetId));
    lead.seat = createVehicleEntry(context, { entity, movement: lead.movement, figure: lead.figure });
    entity.data.assetId = assetId;
  }
  buildBody(STARTING_LEAD);
  lead.vitals = createLeadVitals(context, { entity, lead });

  function syncEntity() {
    const s = lead.movement.state;
    entity.position.set(s.x, s.y, s.z);
    entity.heading = s.heading;
  }

  function teleport({ position, heading }) {
    if (lead.seat.vehicle || lead.seat.phase) lead.seat.exit(false, true);
    const turn = typeof heading === 'number' ? heading : lead.movement.state.heading;
    lead.movement.placeAt(position.x, position.z, turn, typeof position.y === 'number' ? position.y : undefined);
    lead.figure.reset(turn);
    syncEntity();
    const s = lead.movement.state;
    context.events.emit(GAME_EVENTS.PLAYER_TELEPORTED, { position: { x: s.x, y: s.y, z: s.z }, heading: s.heading });
  }

  /** Switches the playable lead; false for an unknown or non-playable id, or while down. */
  function switchCharacter(characterId) {
    const character = storyCharacter(characterId);
    if (!character || character.playable === false || lead.vitals.down) return false;
    const previousId = entity.data.characterId;
    if (previousId === characterId) return true;
    if (bodyOf(characterId) !== entity.data.assetId) {
      if (lead.seat.vehicle || lead.seat.phase) lead.seat.exit(false, true);
      lead.figure.dispose();
      buildBody(characterId);
      lead.figure.reset(lead.movement.state.heading);
    } else {
      dressLead(lead.figure.instance, characterId, heightOf(entity.data.assetId));
    }
    entity.data.characterId = characterId;
    context.events.emit(GAME_EVENTS.PLAYER_CHARACTER_SWITCHED, { characterId, previousId });
    return true;
  }

  function start() {
    const spot = stagingSpot(context, 0.42);
    lead.movement.placeAt(spot.x, spot.z, spot.heading);
    lead.figure.reset(spot.heading);
    syncEntity();
    const s = lead.movement.state;
    context.events.emit(GAME_EVENTS.PLAYER_SPAWNED, {
      playerId: entity.id, characterId: entity.data.characterId, position: { x: s.x, y: s.y, z: s.z }, heading: s.heading,
    });
  }

  function fixedUpdate(stepSeconds) {
    const input = context.input;
    const { movement, seat } = lead;
    const down = lead.vitals.down;
    if (seat.vehicle) {
      if (!down) seat.drive(input, stepSeconds);
    } else if (!down && !seat.phase && input.pressed('enterVehicle') && seat.tryEnter()) {
      // The walk to the door starts on the next step.
    } else {
      const camera = context.systems.find('followCamera');
      const yaw = camera && typeof camera.yaw === 'number' ? camera.yaw : movement.state.heading;
      const aiming = !down && !seat.phase && Boolean(camera && camera.aiming);
      readOnFootIntent(input, yaw, intent, lead.walkForced || aiming);
      if (down) { intent.x = 0; intent.z = 0; intent.jump = false; }
      if (!seat.phase || !seat.boardStep(intent, stepSeconds)) {
        if (aiming) intent.sprint = false;
        movement.state.facing = aiming ? yaw : NaN;
        movement.step(intent, stepSeconds);
      }
    }
    syncEntity();
  }

  function update(deltaSeconds, alpha) {
    if (!lead.seat.frame(deltaSeconds, alpha)) lead.figure.update(deltaSeconds, alpha, lead.movement.state, lead.movement);
    lead.vitals.update(deltaSeconds);
  }

  /** The lead for a save: who, where, health and armour, and the car they sit in. */
  function serialise() {
    const s = lead.movement.state;
    const car = lead.seat.vehicle;
    const round = (value) => Math.round(value * 100) / 100;
    return {
      characterId: entity.data.characterId,
      position: { x: round(s.x), y: round(s.y), z: round(s.z) },
      heading: round(s.heading),
      health: entity.data.health,
      armour: entity.data.armour,
      vehicle: car && car.data ? { modelId: car.data.modelId, colour: car.data.colour ?? null, damage: round(1 - (car.data.health ?? 1) / (car.data.maxHealth || car.data.health || 1)) } : null,
    };
  }

  /** Puts a saved lead back: the character, the place, the vitals, and their car if they sat in one. */
  function restore(data) {
    if (!data || typeof data !== 'object') return;
    if (data.characterId && data.characterId !== entity.data.characterId) switchCharacter(data.characterId);
    if (data.position) teleport({ position: data.position, heading: data.heading });
    const clamp = (value, fallback) => (Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback);
    entity.data.health = clamp(data.health, entity.data.health) || 100;
    entity.data.armour = clamp(data.armour, entity.data.armour);
    context.events.emit(GAME_EVENTS.PLAYER_HEALTH_CHANGED, { health: entity.data.health, armour: entity.data.armour, delta: 0, cause: 'restore' });
    const fleet = context.systems.find('vehicles');
    if (data.vehicle && data.vehicle.modelId && data.position && fleet && typeof fleet.spawn === 'function') {
      const yaw = typeof data.heading === 'number' ? data.heading : 0;
      const vehicleId = fleet.spawn({ modelId: data.vehicle.modelId, position: data.position, heading: -yaw, colour: data.vehicle.colour ?? undefined, parked: true });
      if (vehicleId != null) lead.seat.enter(vehicleId);
    }
  }

  function dispose() {
    for (const stop of stops) if (typeof stop === 'function') stop();
    lead.vitals.dispose();
    context.entities.remove(entity);
    lead.figure.dispose();
    lead.movement.dispose();
  }

  stops.push(context.commands.handle(GAME_COMMANDS.PLAYER_TELEPORT, teleport));
  stops.push(context.commands.handle(GAME_COMMANDS.PLAYER_ENTER_VEHICLE, ({ vehicleId, seat: place }) => lead.seat.enter(vehicleId, place)));
  stops.push(context.commands.handle(GAME_COMMANDS.PLAYER_SWITCH_CHARACTER, ({ characterId } = {}) => switchCharacter(characterId)));
  registerOnFootShowcase(context);
  return lead;
}
