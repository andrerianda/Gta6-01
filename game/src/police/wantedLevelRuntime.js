// The wanted level at run time: wires the pure rules (crimeHeat.js, witnessRules.js) to the game.
// Crimes arrive as CRIME_COMMITTED events and CRIME_REPORT commands; a crime that needs a witness
// waits for one (officers and police cars nearby, pedestrians) to finish reporting it. Until
// combat and the pedestrians publish their own crimes, it recognises three itself and publishes
// them as CRIME_COMMITTED: taking a car the lead has not driven before (a police car is
// steal_police_vehicle), hitting a police car harder than 5 m/s, and running a person down.
// Each step it asks policeDispatch whether any unit sees the lead (else: a police entity within
// sight range), runs the search and the cool-down, and publishes WANTED_LEVEL_CHANGED,
// WANTED_SEARCH_STARTED, WANTED_CLEARED and CRIME_WITNESSED. wantedLevel.js is the system around it.
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { ENTITY_KINDS, ENTITY_TAGS } from '../core/entities/entityKinds.js';
import {
  WANTED_STEP, addCrimeHeat, clearWanted, createWantedState, crimeForDestroyedVehicle, removeStars, searchSecondsLeft,
  setWantedLevel, stepWanted, wayToLoseAllows,
} from './crimeHeat.js';
import { WITNESS_KIND, chooseWitness, createReportQueue, queueReport, stepReports } from './witnessRules.js';

/** Without the dispatch system, a police entity this close sees the lead (metres). */
const FALLBACK_SIGHT = 60;
/** A hit on a police car faster than this (m/s) is ramming (crimeCatalog: 5 m/s). */
const RAMMING_SPEED = 5;
/** A person hit by a car faster than this (m/s) has been run down. */
const RUN_DOWN_SPEED = 3;

/**
 * Creates the wanted level run-time.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @returns {object} The run-time (see wantedLevel.js for the members it backs).
 */
export function createWantedLevelRuntime(context) {
  const { WANTED_LEVELS, WANTED_RULES } = context.content.get('wantedLevels');
  const { CRIME_CATALOG, CRIME_REPORTING } = context.content.get('crimeCatalog');
  const { events, entities, commands } = context;
  const log = context.log.child('wantedLevel');
  const random = context.random('wantedLevel');
  const randomUnit = () => random.next ? random.next() : random();
  const state = createWantedState();
  const reports = createReportQueue();
  const candidates = [];
  const nearby = [];
  const knownVehicles = new Set();
  const struck = new Map();
  const conditions = { night: 0, rain: false };
  const sightFilter = { tag: ENTITY_TAGS.POLICE };
  const witnessFilter = { accept: (entity) => entity.alive !== false && !entity.tags.has(ENTITY_TAGS.PLAYER) && !entity.tags.has(ENTITY_TAGS.DEAD) };
  let playerCharacterId = null;
  const stops = [];

  function leadEntity() {
    return entities.firstWithTag(ENTITY_TAGS.PLAYER);
  }

  function leadPosition() {
    return leadEntity()?.position ?? context.focus.position;
  }

  function isLead(id) {
    if (id === null || id === undefined) return true;
    if (id === playerCharacterId) return true;
    const entity = entities.get(id);
    return Boolean(entity && entity.tags.has(ENTITY_TAGS.PLAYER));
  }

  function witnessKindOf(entity) {
    if (entity.tags.has(ENTITY_TAGS.POLICE)) return WITNESS_KIND.OFFICER;
    if (entity.tags.has('guard')) return WITNESS_KIND.GUARD;
    if (entity.kind === ENTITY_KINDS.CHARACTER && (entity.tags.has(ENTITY_TAGS.PEDESTRIAN) || entity.tags.has(ENTITY_TAGS.WITNESS))) return WITNESS_KIND.CIVILIAN;
    return null;
  }

  function announce(previous) {
    if (state.level === previous) return;
    events.emit(GAME_EVENTS.WANTED_LEVEL_CHANGED, { level: state.level, previous, heat: state.heat });
  }

  function deliver(report) {
    const crime = CRIME_CATALOG[report.crimeId];
    const previous = state.level;
    const heat = addCrimeHeat(state, crime, WANTED_RULES, CRIME_REPORTING, report.position);
    if (heat <= 0) return;
    events.emit(GAME_EVENTS.CRIME_WITNESSED, {
      crimeId: crime.id, offenderId: report.offenderId ?? null, witnessId: report.witnessId ?? null, position: report.position, heat,
    });
    if (commands.has(GAME_COMMANDS.UI_NOTIFY)) commands.send(GAME_COMMANDS.UI_NOTIFY, { text: crime.name, kind: 'crime', seconds: CRIME_REPORTING.hudFlashSeconds });
    announce(previous);
  }

  /** Takes a crime: at once when no witness is needed, else through the first witness who reports it. */
  function report({ crimeId, offenderId = null, victimId = null, position = null }) {
    const crime = CRIME_CATALOG[crimeId];
    if (!crime) {
      log.warn(`wantedLevel: unknown crime "${crimeId}"`);
      return;
    }
    if (!isLead(offenderId)) return;
    const at = position ?? leadPosition();
    const where = { x: at.x, y: at.y ?? 0, z: at.z };
    if (!crime.needsWitness) {
      deliver({ crimeId, offenderId, witnessId: null, position: where });
      return;
    }
    candidates.length = 0;
    entities.within(where.x, where.z, Math.max(crime.seenRadius, crime.heardRadius), witnessFilter, nearby);
    for (let i = 0; i < nearby.length; i += 1) {
      const entity = nearby[i];
      if (entity.id === victimId) continue;
      const kind = witnessKindOf(entity);
      if (kind) candidates.push({ id: entity.id, kind, x: entity.position.x, z: entity.position.z });
    }
    nearby.length = 0;
    const witness = chooseWitness(crime, where.x, where.z, candidates, WANTED_RULES, randomUnit, conditions);
    if (!witness) return;
    const pending = { crimeId, offenderId, witnessId: witness.witnessId, position: where, delay: witness.delay };
    if (witness.delay <= 0) deliver(pending);
    else queueReport(reports, pending);
  }

  function clear(reason) {
    if (!wayToLoseAllows(reason, state.level, WANTED_RULES) && reason !== 'escaped') return false;
    const previous = state.level;
    clearWanted(state);
    reports.pending.length = 0;
    if (previous > 0) {
      events.emit(GAME_EVENTS.WANTED_LEVEL_CHANGED, { level: 0, previous, heat: 0 });
      events.emit(GAME_EVENTS.WANTED_CLEARED, { reason });
    }
    return true;
  }

  function setLevel(level) {
    const previous = state.level;
    if ((Math.round(level) || 0) <= 0) {
      clear('debug');
      return;
    }
    setWantedLevel(state, level, WANTED_RULES, leadPosition());
    announce(previous);
  }

  function commit(crimeId, victimId, position) {
    events.emit(GAME_EVENTS.CRIME_COMMITTED, { crimeId, offenderId: leadEntity()?.id ?? null, victimId, position: { x: position.x, y: position.y ?? 0, z: position.z } });
  }

  // Temporary crime sources, until combat and the pedestrians publish their own.
  function onVehicleEntered({ vehicleId, isPlayer }) {
    if (!isPlayer || knownVehicles.has(vehicleId)) return;
    knownVehicles.add(vehicleId);
    const vehicle = entities.get(vehicleId);
    if (!vehicle) return;
    commit(vehicle.tags.has(ENTITY_TAGS.POLICE) ? 'steal_police_vehicle' : 'vehicle_theft', vehicle.data?.driverId ?? null, vehicle.position);
  }

  function onVehicleCollided({ vehicleId, otherId, speed, position }) {
    if (otherId === null || otherId === undefined) return;
    const vehicle = entities.get(vehicleId);
    if (!vehicle || !vehicle.tags.has(ENTITY_TAGS.PLAYER)) return;
    const other = entities.get(otherId);
    if (!other) return;
    if (other.kind === ENTITY_KINDS.VEHICLE && other.tags.has(ENTITY_TAGS.POLICE) && speed > RAMMING_SPEED) {
      commit('ramming_police_vehicle', otherId, position);
    } else if (other.kind === ENTITY_KINDS.CHARACTER && speed > RUN_DOWN_SPEED && !struck.has(otherId)) {
      struck.set(otherId, state.time);
      commit('vehicular_assault', otherId, position);
    }
  }

  return {
    state,

    start() {
      stops.push(
        commands.handle(GAME_COMMANDS.CRIME_REPORT, report),
        commands.handle(GAME_COMMANDS.WANTED_SET_LEVEL, ({ level }) => setLevel(level)),
        commands.handle(GAME_COMMANDS.WANTED_CLEAR, ({ reason = 'debug' } = {}) => clear(reason)),
        events.on(GAME_EVENTS.CRIME_COMMITTED, report),
        events.on(GAME_EVENTS.PLAYER_SPAWNED, ({ playerId }) => { playerCharacterId = playerId; }),
        events.on(GAME_EVENTS.VEHICLE_STOLEN, ({ vehicleId, thiefId, driverId, position }) => {
          knownVehicles.add(vehicleId);
          const vehicle = entities.get(vehicleId);
          const crimeId = vehicle?.tags.has(ENTITY_TAGS.POLICE) ? 'steal_police_vehicle' : driverId ? 'carjacking' : 'vehicle_theft';
          report({ crimeId, offenderId: thiefId, victimId: driverId, position });
        }),
        events.on(GAME_EVENTS.VEHICLE_ENTERED, onVehicleEntered),
        events.on(GAME_EVENTS.VEHICLE_COLLIDED, onVehicleCollided),
        // A car the lead shot or blew up: witnesses report it (one star from destroy_vehicle's heat).
        events.on(GAME_EVENTS.VEHICLE_DESTROYED, (event) => {
          const wreck = entities.get(event.vehicleId);
          const crimeId = crimeForDestroyedVehicle(event, isLead, Boolean(wreck?.tags.has(ENTITY_TAGS.POLICE)));
          if (crimeId) commit(crimeId, event.vehicleId ?? null, event.position ?? wreck?.position ?? leadPosition());
        }),
        events.on(GAME_EVENTS.PEDESTRIAN_KNOCKED_DOWN, ({ pedestrianId, causeId, position }) => {
          if (struck.has(pedestrianId) || !isLead(causeId)) return;
          struck.set(pedestrianId, state.time);
          commit('vehicular_assault', pedestrianId, position);
        }),
        events.on(GAME_EVENTS.POLICE_SPOTTED_PLAYER, () => { state.unseenSeconds = 0; }),
        events.on(GAME_EVENTS.VEHICLE_RESPRAYED, ({ vehicleId }) => {
          if (state.level > 0 && entities.get(vehicleId)?.tags.has(ENTITY_TAGS.PLAYER)) clear('respray');
        }),
        events.on(GAME_EVENTS.PLAYER_BUSTED, () => clear('busted')),
        events.on(GAME_EVENTS.PLAYER_WASTED, () => clear('wasted')),
        events.on(GAME_EVENTS.NEW_GAME_STARTED, () => clear('debug')),
      );
    },

    fixedUpdate(dt) {
      const atmosphere = context.atmosphere?.state;
      conditions.night = atmosphere?.nightFactor ?? 0;
      conditions.rain = (atmosphere?.wetness ?? 0) > 0.4;
      stepReports(reports, dt, (id) => {
        const witness = entities.get(id);
        return Boolean(witness && witness.alive !== false && !witness.tags.has(ENTITY_TAGS.DEAD));
      }, deliver);
      if (struck.size > 0) for (const [id, time] of struck) if (state.time - time > 8) struck.delete(id);
      const position = leadPosition();
      const dispatch = context.systems.find('policeDispatch');
      const seen = typeof dispatch?.playerSeen === 'boolean'
        ? dispatch.playerSeen
        : entities.countWithin(position.x, position.z, FALLBACK_SIGHT, sightFilter) > 0;
      const previous = state.level;
      const result = stepWanted(state, dt, seen, position, WANTED_RULES, WANTED_LEVELS);
      if (result === WANTED_STEP.SEARCH_STARTED) {
        events.emit(GAME_EVENTS.WANTED_SEARCH_STARTED, {
          lastKnownPosition: { x: state.lastKnown.x, y: state.lastKnown.y, z: state.lastKnown.z },
          seconds: searchSecondsLeft(state, WANTED_LEVELS),
        });
      } else if (result === WANTED_STEP.CLEARED) {
        events.emit(GAME_EVENTS.WANTED_LEVEL_CHANGED, { level: 0, previous, heat: 0 });
        events.emit(GAME_EVENTS.WANTED_CLEARED, { reason: 'escaped' });
      }
    },

    report,
    setLevel,
    clear,
    loseStars(count) {
      const previous = state.level;
      removeStars(state, count, WANTED_RULES);
      if (state.level === 0 && previous > 0) events.emit(GAME_EVENTS.WANTED_CLEARED, { reason: 'change_outfit' });
      announce(previous);
    },
    searchSecondsLeft: () => searchSecondsLeft(state, WANTED_LEVELS),
    levelInfo: () => WANTED_LEVELS[state.level],

    dispose() {
      for (const stop of stops.splice(0)) if (typeof stop === 'function') stop();
    },
  };
}
