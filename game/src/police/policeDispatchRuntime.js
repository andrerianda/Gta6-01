// Police dispatch at run time: the response to the wanted level. While the lead has stars it sends
// the units WANTED_LEVELS[stars].dispatch asks for, every reinforceSeconds up to the level's quota:
// cruisers, the SUV and the tactical van (each falls back to the cruiser while its model is not
// loaded) from the nearest police station when one is close, else out of sight on a lane behind the
// lead; officers on foot from the pavement. Cars drive the pursuit (pursuitDriving.js) with the light
// bar flashing (sirenLights.js) and data.siren true (traffic pulls over for emergency vehicles); a
// car that has boxed in a slow lead lets its crew out to draw, aim and arrest, or at three stars and
// above to shoot (officerBehaviour.js, arrestRules.js); officers take DAMAGE_DEALT and go down;
// roadblocks come from roadblocks.js at three stars; ambulances answer casualties near the lead
// (ambulanceResponse.js); at five stars the helicopter flies over the chase with its searchlight
// on the lead (policeHelicopter.js). It works
// out whether any unit sees the lead (`playerSeen`, read by the wanted level; POLICE_SPOTTED_PLAYER
// when sight is regained), holds the lead only while player.arrestable, and calls player.bust()
// (or, with no player system, runs the arrest itself: PLAYER_BUSTED, the busted state, the fine
// and the release at the precinct). On PLAYER_BUSTED / PLAYER_WASTED the police stand down (no
// reinforcements, no arrest), and on PLAYER_RESPAWNED every unit, officer, roadblock and the
// helicopter is cleared. When the stars clear the units switch their sirens off, drive away and are
// removed. A car that hits a pole, palm or wall hard, or is shot to a wreck, stays where it stopped
// as a wreck (cruiserWrecks.js), out of the quota, removed only once the lead is far from it; a
// scene stages one with POLICE_SPAWN_UNIT {..., wreck: true | {lights, crew, burning, hold}}.
// policeDispatch.js is the system around it.
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { ENTITY_KINDS, ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { UNIT_PROFILES, colourForUnit, modelForUnit, nextUnitToSend } from './policeUnitKinds.js';
import { PURSUIT_MODE, choosePursuitMode, createPursuitState, drivePursuit, joinLane, laneWaypoint } from './pursuitDriving.js';
import { createSirenLights, releaseSirenLights, streetDarkness, updateSirenLights } from './sirenLights.js';
import { createOfficerSquad } from './officerBehaviour.js';
import { arrestFine, canArrest, stationDoorstep, stepArrest } from './arrestRules.js';
import { createRoadblocks } from './roadblocks.js';
import { createAmbulanceResponse } from './ambulanceResponse.js';
import { createPoliceHelicopter } from './policeHelicopter.js';
import { createCruiserWrecks } from './cruiserWrecks.js';

const SPAWN_RANGE = [95, 175];
/** A wreck is removed once the lead is this far from it (metres), stars or not. */
const WRECK_FORGET_DISTANCE = 160;
const LEAVE_SECONDS = 18;
const RELEASE_AFTER = 1.8;
/** Longest stand-down after a bust or a death if no PLAYER_RESPAWNED follows (seconds). */
const STAND_DOWN_LIMIT = 20;
const vehicleFilter = { kind: ENTITY_KINDS.VEHICLE };

/**
 * Creates the dispatch run-time.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @returns {object} See policeDispatch.js for the members it backs.
 */
export function createPoliceDispatchRuntime(context) {
  const { WANTED_LEVELS, WANTED_RULES, BUSTED_RULES } = context.content.get('wantedLevels');
  const { events, entities, commands } = context;
  const fleet = context.systems.find('vehicles');
  const city = context.systems.find('openWorldCity');
  const lanes = city?.laneGraph ?? [];
  const stations = (city?.plan?.landmarks ?? []).filter((landmark) => landmark.kind === 'police_station');
  const random = context.random('policeDispatch');
  const log = context.log.child('policeDispatch');
  const officers = createOfficerSquad(context);
  const roadblocks = createRoadblocks(context);
  const ambulances = createAmbulanceResponse(context);
  const helicopter = createPoliceHelicopter(context);
  const units = [];
  const counts = {};
  const lead = { x: 0, y: 0, z: 0, vx: 0, vz: 0, speed: 0, yaw: 0, inVehicle: false, id: null, ready: false };
  const car = { x: 0, z: 0, yaw: 0, speed: 0 };
  const waypoint = { x: 0, z: 0 };
  const stops = [];
  let nextUnitId = 1;
  let reinforce = 0;
  let level = 0;
  let arrestHeld = 0;
  let bustedSeconds = -1;
  let seenBefore = false;
  let standDown = -1;

  const runtime = {
    units, playerSeen: false, officers: officers.list, ambulances, helicopter, lightBarPattern: 'flash', helicopterStars: 5,
  };

  /** True while the lead may be held for an arrest (player.arrestable when the player has it). */
  function leadArrestable() {
    const player = context.systems.find('player');
    return !player || player.arrestable !== false;
  }

  /** Removes every unit, officer, roadblock and the helicopter, and forgets the arrest. */
  function clearStreet() {
    runtime.removeAll();
    arrestHeld = 0;
    runtime.arrestProgress = 0;
    standDown = -1;
  }

  /** Drops officers who were removed (fallen and cleared away) from their unit. */
  function pruneCrew(unit) {
    for (let i = unit.crew.length - 1; i >= 0; i -= 1) if (unit.crew[i].removed) unit.crew.splice(i, 1);
  }

  function firstStanding(unit) {
    for (let i = 0; i < unit.crew.length; i += 1) if (!unit.crew[i].dead) return unit.crew[i];
    return null;
  }

  function crewBack(unit, x, z) {
    for (let i = 0; i < unit.crew.length; i += 1) {
      const officer = unit.crew[i];
      if (officer.dead) continue;
      if (officer.state !== 'board' || Math.hypot(officer.instance.position.x - x, officer.instance.position.z - z) >= 2.4) return false;
    }
    return true;
  }

  function readLead(dt) {
    const entity = entities.firstWithTag(ENTITY_TAGS.PLAYER);
    const p = entity ? entity.position : context.focus.position;
    if (lead.ready && dt > 0) {
      lead.vx = (p.x - lead.x) / dt;
      lead.vz = (p.z - lead.z) / dt;
    }
    lead.x = p.x;
    lead.y = p.y;
    lead.z = p.z;
    lead.ready = true;
    lead.id = entity ? entity.id : null;
    lead.inVehicle = Boolean(entity && entity.kind === ENTITY_KINDS.VEHICLE);
    lead.yaw = entity ? entity.heading ?? 0 : 0;
    lead.speed = lead.inVehicle ? Math.abs(entity.data.speed ?? 0) : Math.hypot(lead.vx, lead.vz);
  }

  function hasModel(id) {
    return Boolean(context.assets?.has?.(id));
  }

  function canField(kind) {
    const profile = UNIT_PROFILES[kind];
    if (!profile || !profile.ground) return false;
    if (profile.onFoot) return !lead.inVehicle;
    return Boolean(fleet);
  }

  function count(kind, delta) {
    counts[kind] = Math.max(0, (counts[kind] ?? 0) + delta);
  }

  /** Takes a unit out of the quota once (a wreck, or removed). */
  function uncount(unit) {
    if (unit.counted === false) return;
    unit.counted = false;
    count(unit.kind, -1);
  }

  const wrecks = createCruiserWrecks(context, { fleet, officers, units, uncount, spawnUnit: (...args) => spawnUnit(...args) });

  /** A lane point out of sight, behind the lead when there is one, or by the nearest station. */
  function findCarSpawn() {
    if (!city) return null;
    for (const station of stations) {
      const d = Math.hypot(station.x - lead.x, station.z - lead.z);
      if (d > 70 && d < 320) {
        const door = stationDoorstep(station);
        const near = city.spawnPointsNear(door.x, door.z, 45, 'vehicle', 12);
        const free = near.find((point) => entities.countWithin(point.x, point.z, 7, vehicleFilter) === 0);
        if (free) return free;
      }
    }
    const points = city.spawnPointsNear(lead.x, lead.z, SPAWN_RANGE[1], 'vehicle', 256);
    const fx = -Math.sin(lead.yaw);
    const fz = -Math.cos(lead.yaw);
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      const dx = point.x - lead.x;
      const dz = point.z - lead.z;
      const d = Math.hypot(dx, dz);
      if (d < SPAWN_RANGE[0]) continue;
      const ahead = (dx * fx + dz * fz) / d;
      const score = ahead * 60 + Math.abs(d - 120) * 0.3 + random.next() * 25;
      if (score < bestScore && entities.countWithin(point.x, point.z, 7, vehicleFilter) === 0) {
        best = point;
        bestScore = score;
      }
    }
    return best;
  }

  function spawnUnit(kind, position = null, heading = null) {
    const unitId = nextUnitId++;
    const profile = UNIT_PROFILES[kind] ?? UNIT_PROFILES.patrol_car;
    if (profile.onFoot) {
      let spot = position;
      if (!spot && city) {
        const points = city.spawnPointsNear(lead.x, lead.z, 80, 'pedestrian', 64).filter((p) => Math.hypot(p.x - lead.x, p.z - lead.z) > 40);
        spot = points.length ? points[random.int(0, points.length - 1)] : null;
      }
      if (!spot) return null;
      const unit = { id: unitId, kind: profile.kind, vehicleId: null, entity: null, crew: [], leaving: false, leaveSeconds: 0 };
      for (let i = 0; i < profile.crew; i += 1) unit.crew.push(officers.spawn(spot.x + i * 1.2, spot.z + i * 0.8, heading ?? 0, unitId));
      units.push(unit);
      count(unit.kind, 1);
      events.emit(GAME_EVENTS.POLICE_UNIT_DISPATCHED, { unitId, unitKind: unit.kind, position: { x: spot.x, y: spot.y ?? 0, z: spot.z }, level });
      return unitId;
    }
    if (!fleet) return null;
    const modelId = modelForUnit(profile.kind, hasModel);
    if (!modelId) return null;
    const spot = position ? { ...position, heading: heading ?? 0, lane: city?.nearestLane?.(position.x, position.z, 30)?.lane ?? null } : findCarSpawn();
    if (!spot) return null;
    const y = spot.y ?? (city ? city.groundHeightAt(spot.x, spot.z) : 0);
    const colour = colourForUnit(profile.kind, modelId);
    const vehicleId = fleet.spawn({
      modelId, position: { x: spot.x, y, z: spot.z }, heading: -(spot.heading ?? 0), parked: false, ownerSystem: 'policeDispatch', ...(colour ? { colour } : {}),
    });
    const record = vehicleId === null || vehicleId === undefined ? null : fleet.get(vehicleId);
    if (!record) return null;
    entities.addTag(record.entity, ENTITY_TAGS.POLICE);
    entities.addTag(record.entity, ENTITY_TAGS.EMERGENCY);
    record.entity.data.siren = true;
    const pursuit = createPursuitState(unitId % 2 === 0 ? 1 : -1);
    const laneRef = spot.lane;
    const laneId = typeof laneRef === 'number' ? laneRef : laneRef?.id;
    if (typeof laneId === 'number') joinLane(pursuit, lanes, laneId, spot.x, spot.z);
    const unit = {
      id: unitId, kind: profile.kind, vehicleId, entity: record.entity, pursuit, siren: createSirenLights(record.rig, unitId * 0.37),
      crew: [], crewSize: profile.crew, dismounted: false, leaving: false, leaveSeconds: 0, sight: profile.sight, home: record.entity.position,
      counted: true, wreck: null, wreckSeconds: 0, staging: false,
    };
    units.push(unit);
    count(unit.kind, 1);
    events.emit(GAME_EVENTS.POLICE_UNIT_DISPATCHED, { unitId, unitKind: unit.kind, position: { x: spot.x, y, z: spot.z }, level });
    return unitId;
  }

  function removeUnit(unit) {
    const index = units.indexOf(unit);
    if (index >= 0) units.splice(index, 1);
    uncount(unit);
    for (const officer of unit.crew) officers.remove(officer);
    unit.crew.length = 0;
    if (unit.siren) releaseSirenLights(unit.siren, context.atmosphere);
    if (unit.vehicleId !== null && fleet?.get(unit.vehicleId)) fleet.remove(unit.vehicleId);
  }

  function homeOf(officer) {
    for (const unit of units) if (unit.id === officer.unitId) return unit.vehicleId !== null && !unit.wreck ? unit.home : null;
    return null;
  }

  function driveCar(unit, dt) {
    const record = fleet.get(unit.vehicleId);
    if (!record) return false;
    const theirs = record.entity.tags.has(ENTITY_TAGS.PLAYER);
    // Shot or blown up: the burnt shell stays as a wreck (cruiserWrecks.js).
    if (!unit.wreck && record.entity.data.health <= 0 && !theirs) wrecks.burntOut(unit);
    if (unit.wreck && !theirs) {
      wrecks.hold(unit, record, dt);
      return true;
    }
    if (record.entity.data.health <= 0) {
      unit.vehicleId = null;
      return false;
    }
    const entity = record.entity;
    if (entity.tags.has(ENTITY_TAGS.PLAYER)) {
      // The lead took the car: it is theirs now.
      entities.removeTag(entity, ENTITY_TAGS.POLICE);
      entities.removeTag(entity, ENTITY_TAGS.EMERGENCY);
      entity.data.siren = false;
      releaseSirenLights(unit.siren, context.atmosphere);
      unit.vehicleId = null;
      return false;
    }
    const controls = record.controls;
    car.x = entity.position.x;
    car.z = entity.position.z;
    car.yaw = entity.heading;
    car.speed = entity.data.speed ?? 0;
    const pursuit = unit.pursuit;
    choosePursuitMode(pursuit, car, lead, unit.leaving);
    if ((pursuit.mode === PURSUIT_MODE.LANES || pursuit.mode === PURSUIT_MODE.LEAVE) && pursuit.lane >= 0) {
      const goalX = unit.leaving ? car.x * 2 - lead.x : lead.x;
      const goalZ = unit.leaving ? car.z * 2 - lead.z : lead.z;
      if (laneWaypoint(pursuit, lanes, car.x, car.z, goalX, goalZ, waypoint)) {
        pursuit.targetX = waypoint.x;
        pursuit.targetZ = waypoint.z;
      }
    } else if (pursuit.distance > 40 && pursuit.lane >= 0 && pursuit.mode === PURSUIT_MODE.CHASE) {
      joinLane(pursuit, lanes, pursuit.lane, car.x, car.z);
    }
    if (pursuit.mode === PURSUIT_MODE.CHASE || pursuit.mode === PURSUIT_MODE.RAM) {
      const near = city?.nearestLane?.(car.x, car.z, 20);
      if (near && typeof near.lane === 'number') pursuit.lane = near.lane;
    }
    const factor = WANTED_LEVELS[level]?.pursuitSpeedFactor ?? 1;
    const cruise = unit.leaving ? 12 : (pursuit.mode === PURSUIT_MODE.LANES ? 27 : 33) * factor;
    if (unit.dismounted) {
      controls.throttle = 0;
      controls.brake = 1;
      controls.steer = 0;
      controls.handbrake = 1;
      controls.reverse = false;
    } else {
      drivePursuit(controls, pursuit, car, cruise, dt);
    }
    // A slow, boxed-in lead: the crew gets out.
    if (!unit.leaving && !unit.dismounted && pursuit.mode === PURSUIT_MODE.BOX && Math.abs(car.speed) < 1.5 && pursuit.distance < 20) {
      unit.dismounted = true;
      const sx = Math.cos(car.yaw);
      const sz = -Math.sin(car.yaw);
      // Two from the cab; a tactical van's team also climbs out of the back.
      for (let i = 0; i < Math.min(4, unit.crewSize); i += 1) {
        const side = i % 2 === 0 ? -1 : 1;
        const back = i < 2 ? 0 : 2.6;
        const x = car.x + sx * 1.4 * side + Math.sin(car.yaw) * back;
        const z = car.z + sz * 1.4 * side + Math.cos(car.yaw) * back;
        unit.crew.push(officers.spawn(x, z, car.yaw, unit.id, { swat: unit.kind === 'tactical_team' }));
      }
    }
    if (unit.dismounted && crewBack(unit, car.x, car.z)) {
      for (const officer of unit.crew) officers.remove(officer);
      unit.crew.length = 0;
      unit.dismounted = false;
    }
    return true;
  }

  function bust() {
    const player = context.systems.find('player');
    if (typeof player?.bust === 'function') {
      player.bust();
      return;
    }
    const economy = context.systems.find('economy');
    const fine = arrestFine(typeof economy?.cash === 'number' ? economy.cash : 0, BUSTED_RULES);
    // The economy takes the fine from the event itself: no ECONOMY_SPEND_MONEY here (it paid twice).
    events.emit(GAME_EVENTS.PLAYER_BUSTED, { position: { x: lead.x, y: lead.y, z: lead.z }, fine, weaponsTaken: BUSTED_RULES.losesAmmunition });
    if (context.state.is('playing')) context.state.enter('busted', { fine });
    bustedSeconds = 0;
  }

  function release() {
    bustedSeconds = -1;
    const district = city?.districtAt?.(lead.x, lead.z);
    const stationId = BUSTED_RULES.releaseAt[district] ?? 'mpd_headquarters';
    const station = city?.plan?.landmarkById?.[stationId] ?? city?.plan?.landmarkById?.get?.(stationId) ?? stations[0];
    clearStreet();
    if (station && commands.has(GAME_COMMANDS.PLAYER_TELEPORT)) {
      commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: stationDoorstep(station), heading: station.facing ?? 0 });
    }
    if (context.state.is('busted')) context.state.enter('playing');
    if (commands.has(GAME_COMMANDS.UI_NOTIFY)) {
      commands.send(GAME_COMMANDS.UI_NOTIFY, { text: BUSTED_RULES.lines[random.int(0, BUSTED_RULES.lines.length - 1)], kind: 'info', seconds: 5 });
    }
  }

  runtime.start = function start() {
    stops.push(
      commands.handle(GAME_COMMANDS.POLICE_SPAWN_UNIT, ({ unitKind = 'patrol_car', position = null, heading = null, wreck = null } = {}) => (
        wreck && position ? wrecks.stage(unitKind, position, heading, wreck) : spawnUnit(unitKind, position, heading))),
      events.on(GAME_EVENTS.VEHICLE_COLLIDED, wrecks.collided),
      events.on(GAME_EVENTS.WANTED_LEVEL_CHANGED, ({ level: next, previous }) => {
        if (next > previous) reinforce = Math.min(reinforce, 1.5);
      }),
      events.on(GAME_EVENTS.DAMAGE_DEALT, ({ targetId, amount, attackerId }) => {
        const attacker = attackerId === null || attackerId === undefined ? null : entities.get(attackerId);
        officers.hurt(targetId, amount ?? 0, attacker ? attacker.position : null);
      }),
      // The lead is down or in cuffs: hold off; once the lead is back on the street, clear it all.
      events.on(GAME_EVENTS.PLAYER_BUSTED, () => { standDown = 0; arrestHeld = 0; }),
      events.on(GAME_EVENTS.PLAYER_WASTED, () => { standDown = 0; arrestHeld = 0; }),
      events.on(GAME_EVENTS.PLAYER_RESPAWNED, () => clearStreet()),
    );
    ambulances.start();
  };

  runtime.fixedUpdate = function fixedUpdate(dt) {
    readLead(dt);
    if (bustedSeconds >= 0) {
      bustedSeconds += dt;
      if (bustedSeconds > RELEASE_AFTER) release();
      return;
    }
    if (standDown >= 0) {
      standDown += dt;
      if (standDown > STAND_DOWN_LIMIT) clearStreet();
    }
    const wanted = context.systems.find('wantedLevel');
    level = wanted && standDown < 0 ? wanted.level : 0;
    const quota = WANTED_LEVELS[level];
    if (level > 0) {
      reinforce -= dt;
      if (reinforce <= 0) {
        const kind = nextUnitToSend(quota, counts, canField);
        if (kind) spawnUnit(kind);
        reinforce = units.length <= 1 ? 3 : quota.reinforceSeconds;
      }
    } else {
      reinforce = 1.5;
    }
    roadblocks.fixedUpdate(dt, level, quota, lead);
    ambulances.fixedUpdate(dt);
    let seen = false;
    let seer = null;
    let closest = Infinity;
    for (let i = units.length - 1; i >= 0; i -= 1) {
      const unit = units[i];
      if (level === 0 && !unit.leaving && !unit.wreck) {
        unit.leaving = true;
        unit.dismounted = false;
        for (const officer of unit.crew) officers.remove(officer);
        unit.crew.length = 0;
      }
      if (unit.leaving) unit.leaveSeconds += dt;
      pruneCrew(unit);
      if (unit.vehicleId !== null && !driveCar(unit, dt) && unit.crew.length === 0) {
        removeUnit(unit);
        continue;
      }
      const at = unit.vehicleId !== null ? unit.entity.position : firstStanding(unit)?.instance.position;
      if (!at) {
        removeUnit(unit);
        continue;
      }
      const distance = Math.hypot(at.x - lead.x, at.z - lead.z);
      const gone = unit.wreck
        ? distance > WRECK_FORGET_DISTANCE
        : distance > WANTED_RULES.pursuit.unitDespawnDistance || (unit.leaving && (unit.leaveSeconds > LEAVE_SECONDS || distance > 160));
      if (gone) {
        removeUnit(unit);
        continue;
      }
      if (!unit.leaving && !unit.wreck && distance < (unit.sight ?? 45)) {
        seen = true;
        seer = unit;
      }
    }
    for (const officer of officers.list) {
      if (officer.dead) continue;
      const d = Math.hypot(officer.instance.position.x - lead.x, officer.instance.position.z - lead.z);
      if (d < closest) closest = d;
      if (level > 0 && d < 45) seen = true;
    }
    seen = seen || roadblocks.sees(lead) || (level > 0 && helicopter.sees(lead));
    if (seen && !seenBefore && level > 0 && wanted?.searching) {
      const unitId = seer ? seer.id : null;
      events.emit(GAME_EVENTS.POLICE_SPOTTED_PLAYER, { unitId, position: { x: lead.x, y: lead.y, z: lead.z } });
    }
    seenBefore = seen;
    runtime.playerSeen = seen;
    const situation = { level, officerDistance: closest, leadSpeed: lead.speed, inVehicle: lead.inVehicle };
    arrestHeld = standDown < 0 && leadArrestable() ? stepArrest(arrestHeld, dt, situation, BUSTED_RULES, WANTED_RULES) : 0;
    runtime.arrestProgress = Math.min(1, arrestHeld / BUSTED_RULES.holdSeconds);
    if (arrestHeld >= BUSTED_RULES.holdSeconds && context.state.is('playing') && leadArrestable()) {
      arrestHeld = 0;
      bust();
    }
  };

  runtime.update = function update(dt) {
    const arresting = canArrest({ level, officerDistance: 0, leadSpeed: 0, inVehicle: lead.inVehicle }, BUSTED_RULES, WANTED_RULES);
    const shooting = level >= 3 && Boolean(WANTED_LEVELS[level]?.lethalForce);
    officers.update(dt, lead, homeOf, arresting, shooting);
    const camera = context.view.camera.position;
    const darkness = streetDarkness(context);
    for (const unit of units) {
      if (unit.vehicleId === null || !unit.siren) continue;
      const p = unit.entity.position;
      const near = Math.hypot(p.x - camera.x, p.z - camera.z);
      const wreck = unit.wreck;
      // A wreck's bar keeps flashing, burns steady or is dead; traffic stops giving way to it.
      const on = wreck ? wreck.lights !== 'dead' : !unit.leaving;
      const steady = wreck ? wreck.lights === 'steady' || runtime.lightBarPattern === 'steady' : runtime.lightBarPattern === 'steady';
      unit.entity.data.siren = !unit.leaving && !wreck;
      updateSirenLights(unit.siren, dt, on, context.atmosphere, near, steady, darkness);
    }
    roadblocks.update(dt);
    ambulances.update(dt);
    helicopter.update(dt, lead, runtime.forceHelicopter === true || (level >= runtime.helicopterStars && standDown < 0));
  };

  runtime.spawnUnit = spawnUnit;
  runtime.stageWreck = wrecks.stage;
  runtime.wreckUnit = wrecks.wreck;
  runtime.removeAll = function removeAll() {
    for (let i = units.length - 1; i >= 0; i -= 1) removeUnit(units[i]);
    officers.removeAll();
    roadblocks.clear();
    helicopter.remove();
  };
  runtime.dispose = function dispose() {
    for (const stop of stops.splice(0)) if (typeof stop === 'function') stop();
    ambulances.dispose();
    runtime.removeAll();
  };
  runtime.log = log;
  return runtime;
}
