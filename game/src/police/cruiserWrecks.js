// Crashed and shot-up police cars at run time (the rules are crashRules.js). A pursuing car that
// hits a pole, palm or wall hard stays where it stopped: brakes on, the light bar still flashing,
// burning steady or dead, the crew climbing out dazed after a moment or slumped in the seats, and
// after a hard enough hit burning (effects' 'effects/burn', stage 'burning', over the fleet's own
// damage call) until the fleet blows it up. A car shot or blown to a burnt shell stays as a wreck
// with its bar dead. Wrecks stop counting toward the wanted level's quota (reinforcements come)
// and traffic stops giving way to them. A scene stages one with POLICE_SPAWN_UNIT {..., wreck: true
// | {lights, crew, burning, hold, corner}}: crumpled, glass broken and scorched by the fleet's
// stageWreck (a wreck that never explodes; without it, dented through the fleet's own crash path
// and held), and when burning set ablaze by effects' 'effects/burn' at the 'blazing' stage (the
// whole car alight under a standing smoke column), put out again when the unit is removed.
// policeDispatchRuntime.js owns the units and calls this.
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { ENTITY_KINDS, ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { burningDamage, heldBurningHealth, isWreckingImpact, stagedImpact, stagedWreck, wreckFor } from './crashRules.js';

/** The wreck of a car the fleet already destroyed (shot, blown up). */
const BURNT_OUT = Object.freeze({ lights: 'dead', crew: 'slumped', burning: false, hold: false, crewDelay: 0 });
/** effects/burn requests: a staged wreck blazes for the picture; a crashed one burns until it blows. */
const STAGED_FIRE = Object.freeze({ stage: 'blazing', seconds: 600, warm: 10 });
const CRASH_FIRE = Object.freeze({ stage: 'burning', seconds: 4.6, warm: 1.5 });
const BURN = 'effects/burn';
const EXTINGUISH = 'effects/extinguish';

/**
 * Creates the wreck keeper.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {{fleet: object, officers: object, units: object[], uncount: (unit: object) => void,
 *   spawnUnit: (kind: string, position: object, heading: number | null) => number | null}} parts
 * @returns {{wreck: Function, collided: Function, hold: Function, stage: Function, burntOut: Function, forget: Function}}
 */
export function createCruiserWrecks(context, parts) {
  const { entities, events, commands } = context;
  const { fleet, officers, units, uncount, spawnUnit } = parts;
  const random = context.random('policeWrecks');
  const roll = () => random.next();

  /** Starts a fire on the unit's car through the effects; returns the fire's slot or -1. */
  function ignite(unit, fire) {
    if (!commands?.has?.(BURN)) return -1;
    const slot = commands.run(BURN, { vehicleId: unit.vehicleId, stage: fire.stage, seconds: fire.seconds, warm: fire.warm });
    return typeof slot === 'number' ? slot : -1;
  }

  /** Turns a unit into a wreck where it stands. */
  function wreck(unit, rules) {
    if (unit.wreck || unit.vehicleId === null) return;
    unit.wreck = rules;
    unit.wreckSeconds = 0;
    unit.dismounted = false;
    uncount(unit);
    const record = fleet.get(unit.vehicleId);
    if (!record) return;
    const data = record.entity.data;
    data.siren = false;
    entities.removeTag(record.entity, ENTITY_TAGS.EMERGENCY);
    if (rules.burning && data.health > 0) {
      fleet.damage(unit.vehicleId, burningDamage(data.health, data.maxHealth), 'collision', null, record.entity.position);
      // The flames that read: the fleet's own engine-bay fire is small at a distance.
      if (!rules.hold) ignite(unit, CRASH_FIRE);
    }
  }

  /** VEHICLE_COLLIDED: a pursuing car's hard crash into something fixed makes it a wreck. */
  function collided(impact) {
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      if (unit.vehicleId !== impact.vehicleId) continue;
      if (unit.wreck || unit.leaving || unit.staging) return;
      const other = impact.otherId === null || impact.otherId === undefined ? null : entities.get(impact.otherId);
      const moves = Boolean(other && (other.kind === ENTITY_KINDS.VEHICLE || other.kind === ENTITY_KINDS.CHARACTER));
      if (isWreckingImpact(impact, moves)) wreck(unit, wreckFor(impact.speed, roll));
      return;
    }
  }

  /** A car the fleet destroyed while it chased: a burnt shell with its bar dead. */
  function burntOut(unit) {
    wreck(unit, BURNT_OUT);
  }

  /** Every step for a wreck: brakes on, the crew out once dazed, a held fire kept alight. */
  function hold(unit, record, dt) {
    const controls = record.controls;
    controls.throttle = 0;
    controls.brake = 1;
    controls.steer = 0;
    controls.handbrake = 1;
    controls.reverse = false;
    const rules = unit.wreck;
    const data = record.entity.data;
    if (rules.hold && rules.burning && !rules.fleetStaged) data.health = heldBurningHealth(data.health, data.maxHealth);
    unit.wreckSeconds += dt;
    if (rules.crew !== 'out' || unit.dismounted || unit.wreckSeconds < rules.crewDelay) return;
    unit.dismounted = true;
    const p = record.entity.position;
    const yaw = record.entity.heading;
    const sx = Math.cos(yaw);
    const sz = -Math.sin(yaw);
    for (let i = 0; i < Math.min(2, unit.crewSize); i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      unit.crew.push(officers.spawn(p.x + sx * 1.5 * side, p.z + sz * 1.5 * side, yaw, unit.id, { swat: unit.kind === 'tactical_team' }));
    }
  }

  /**
   * Sends a unit and wrecks it at once (a scene's crashed cruiser).
   * @param {string} kind Unit kind.
   * @param {{x: number, y?: number, z: number}} position
   * @param {number | null} heading Compass heading, as POLICE_SPAWN_UNIT takes it.
   * @param {boolean | object} options See crashRules.stagedWreck; also `corner` ('left' | 'right'
   *   | 'centre', the corner that hit) for the fleet's crumple.
   * @returns {number | null} The unit id.
   */
  function stage(kind, position, heading, options) {
    const unitId = spawnUnit(kind, position, heading);
    const unit = units.find((candidate) => candidate.id === unitId);
    const record = unit && unit.vehicleId !== null ? fleet.get(unit.vehicleId) : null;
    if (!record) return unitId;
    const rules = stagedWreck(options);
    unit.staging = true;
    if (typeof fleet.stageWreck === 'function') {
      // Crumpled, glass broken, scorched and the bumper torn off; the fleet never blows it up.
      const corner = options && typeof options === 'object' && options.corner ? options.corner : 'right';
      fleet.stageWreck(unit.vehicleId, { corner, door: rules.crew === 'out' ? 'driver' : null, doorAmount: 0.45, scorch: rules.burning ? 0.6 : 0.2, burning: false });
      rules.fleetStaged = true;
    } else {
      // Dented and bumper-torn through the fleet's own crash path (it takes about half the health).
      const mass = record.entry?.mass ?? 1700;
      events.emit(GAME_EVENTS.VEHICLE_COLLIDED, stagedImpact(unit.vehicleId, record.entity.position, record.entity.heading, mass, record.entity.data.maxHealth * 0.45));
    }
    unit.staging = false;
    wreck(unit, rules);
    if (rules.burning) unit.fireSlot = ignite(unit, STAGED_FIRE);
    return unitId;
  }

  /** A unit is being removed: its held fire goes out with it. */
  function forget(unit) {
    if (unit.fireSlot >= 0 && commands?.has?.(EXTINGUISH)) commands.run(EXTINGUISH, { slot: unit.fireSlot });
    unit.fireSlot = -1;
  }

  return { wreck, collided, hold, stage, burntOut, forget };
}
