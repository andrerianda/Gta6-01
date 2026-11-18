// The objective kinds of the story missions, each implemented once and scripted by the
// catalog's parameters (game/src/catalog/storyMissions.js, MISSION_OBJECTIVE_KINDS). A kind is
// { begin(o), update(o, dt), prepare?(o), restore?(o), end?(o) } over an objective context `o`:
//   o.params   the catalog step's params        o.world   the mission world (missionWorld.js)
//   o.memory   what the whole run shares: vehicles by model id, the player's mission vehicle,
//              the tow hook, the current place, the targets that must not be destroyed
//   o.state    this objective's own scratch      o.target  where the HUD and markers point
//   o.timeLimit seconds the run must enforce (set in begin), o.marks small markers to show
// update returns 0 while pending, 1 when done, or a fail kind of MISSION_RULES.failKinds.
// Pure: everything about the game goes through o.world, so Node tests drive it with a fake.
// Where a system the kind needs is missing (enemies without pedestrians and combat, guards
// without a crowd) the kind keeps its place and timing and asks the player to hold the place.

const PENDING = 0;
const DONE = 1;

/** Every objective kind keyed by the catalog's kind name. */
export const OBJECTIVE_KINDS = Object.freeze({
  go_to: reachKind(),
  escort: reachKind({ radius: 10 }),
  enter_vehicle: enterKind(false),
  steal_vehicle: enterKind(true),
  tow_vehicle: towKind(),
  deliver_vehicle: deliverKind(),
  escape_pursuit: escapeKind(),
  lose_wanted: loseWantedKind(),
  switch_lead: switchLeadKind(),
  photograph: pointsKind({ hold: true }),
  collect: pointsKind({ hold: false }),
  stealth: stealthKind(),
  checkpoint_run: checkpointKind('stops'),
  race: raceKind(),
  chase: fleeingKind('chase'),
  tail: fleeingKind('tail'),
  brawl: combatKind('brawl', 10),
  eliminate: combatKind('eliminate', 14),
  subdue: combatKind('subdue', 8),
  defend: combatKind('defend', 45),
  survive: combatKind('survive', 30),
  wear_outfit: outfitKind(),
  cutscene: waitKind(),
});

/** What the HUD and the GPS hear as an objective's place: {x, z}, or null when it has none. */
export function objectiveTarget(target) {
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z)) return null;
  return { x: target.x, z: target.z };
}

/** Plane distance between two points with x and z. */
export function planeDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** The place an objective refers to: a landmark id, or the run's current place. */
function placeOf(o, ref) {
  return (ref && o.world.place(ref)) || o.memory.place || null;
}

/** True when the player is where `by` allows ('foot', 'vehicle', 'any'/'boat'). */
function travelsAs(player, by) {
  if (by === 'foot') return !player.vehicleId;
  if (by === 'vehicle') return Boolean(player.vehicleId);
  return true;
}

/** Seconds a route of `metres` needs at a running pace on foot or a brisk drive, with slack. */
export function fairTimeLimit(given, metres, onFoot) {
  const needed = metres / (onFoot ? 5.2 : 13) + 20;
  return Math.max(given || 0, Math.ceil(needed));
}

function reachKind(defaults = {}) {
  return {
    begin(o) {
      o.target = placeOf(o, o.params.landmark);
      o.memory.place = o.target;
      if (o.params.timeLimit && o.target) o.timeLimit = fairTimeLimit(o.params.timeLimit, planeDistance(o.world.player(), o.target), o.params.by === 'foot');
    },
    update(o) {
      const player = o.world.player();
      if (!o.target) return DONE;
      const radius = (o.params.radius ?? defaults.radius ?? 8) + (player.vehicleId ? 2 : 0);
      return travelsAs(player, o.params.by) && planeDistance(player, o.target) <= radius ? DONE : PENDING;
    },
  };
}

function enterKind(stealing) {
  function ensure(o, near) {
    const model = o.params.vehicle;
    let id = o.memory.vehicles[model];
    if (!id || !o.world.vehicle(id)) {
      id = o.world.spawnVehicle(model, near, { colour: o.params.color, parked: true, minDistance: stealing ? 20 : 6, maxDistance: 45 });
      if (id) o.memory.vehicles[model] = id;
    }
    return id;
  }
  return {
    begin(o) {
      const player = o.world.player();
      if (o.params.ownVehicleAllowed && player.vehicleId) { o.state.own = true; return; }
      const near = placeOf(o, o.params.at) || player;
      o.state.id = ensure(o, near);
      const vehicle = o.state.id ? o.world.vehicle(o.state.id) : null;
      o.target = vehicle ? { x: vehicle.position.x, y: vehicle.position.y, z: vehicle.position.z } : null;
      if (o.state.id) o.memory.playerVehicleId = o.state.id;
    },
    update(o) {
      const player = o.world.player();
      if (o.state.own || (o.params.ownVehicleAllowed && player.vehicleId)) {
        o.memory.playerVehicleId = player.vehicleId;
        return DONE;
      }
      if (!o.state.id) return player.vehicleId ? DONE : PENDING;
      if (isWrecked(o.world.vehicle(o.state.id))) return 'vehicle_destroyed';
      return player.vehicleId === o.state.id ? DONE : PENDING;
    },
    restore(o) {
      const id = ensure(o, o.world.player());
      if (id) { o.memory.playerVehicleId = id; o.world.enterVehicle(id); }
    },
  };
}

/** True for a vehicle that is gone or wrecked. */
export function isWrecked(vehicle) {
  if (!vehicle) return true;
  if (vehicle.alive === false) return true;
  const data = vehicle.data || {};
  return (typeof data.health === 'number' && data.health <= 0) || data.stage >= 3;
}

function spawnTarget(o, model, near) {
  let id = o.memory.vehicles[model];
  if (!id || !o.world.vehicle(id)) {
    id = o.world.spawnVehicle(model, near, { colour: o.params.color, parked: true, minDistance: 4, maxDistance: 40 });
    if (id) o.memory.vehicles[model] = id;
  }
  if (id) o.memory.targets.add(id);
  return id;
}

function towKind() {
  return {
    prepare(o) { spawnTarget(o, o.params.target, o.memory.place || o.world.player()); },
    begin(o) {
      o.state.id = spawnTarget(o, o.params.target, o.memory.place || o.world.player());
      o.state.hold = 0;
      const vehicle = o.state.id ? o.world.vehicle(o.state.id) : null;
      o.target = vehicle ? { x: vehicle.position.x, y: vehicle.position.y, z: vehicle.position.z } : o.memory.place;
      o.world.help('Reverse the tow truck slowly up to the car and hold still to hook it');
    },
    update(o, dt) {
      if (!o.state.id) return DONE;
      const car = o.world.vehicle(o.state.id);
      if (isWrecked(car)) return 'target_destroyed';
      const truckId = o.memory.playerVehicleId;
      const player = o.world.player();
      const truck = truckId ? o.world.vehicle(truckId) : null;
      if (!truck || player.vehicleId !== truckId) { o.state.hold = 0; return isWrecked(truck) && truckId ? 'vehicle_destroyed' : PENDING; }
      const h = truck.heading;
      // The boom's reach to the nearer bumper (the world knows the models' lengths); the fake
      // world of the tests measures from a point behind the truck to the car's centre.
      const gap = o.world.boomGap ? o.world.boomGap(truckId, o.state.id)
        : Math.max(0, Math.hypot(car.position.x - truck.position.x - Math.sin(h) * 3.2, car.position.z - truck.position.z - Math.cos(h) * 3.2) - 2.6);
      const aligned = Math.abs(Math.sin(h - car.heading)) <= Math.sin(((o.params.alignDegrees ?? 20) * Math.PI) / 180) * 1.6;
      const still = Math.abs(truck.data?.speed ?? 0) < 1.8;
      if (gap < 2.2 && aligned && still) o.state.hold += dt;
      else o.state.hold = Math.max(0, o.state.hold - dt * 2);
      if (o.state.hold < (o.params.holdSeconds ?? 3)) return PENDING;
      o.memory.hook = { truckId, targetId: o.state.id };
      o.world.hook(truckId, o.state.id);
      return DONE;
    },
    restore(o) {
      const id = spawnTarget(o, o.params.target, o.world.player());
      if (id && o.memory.playerVehicleId) { o.memory.hook = { truckId: o.memory.playerVehicleId, targetId: id }; o.world.hook(o.memory.playerVehicleId, id); }
    },
    end(o) { o.world.help(null); },
  };
}

function spawnPursuers(o, list, near) {
  const ids = [];
  for (const group of list || []) {
    if (!group.vehicle) continue;
    for (let i = 0; i < (group.count ?? 1); i += 1) {
      const id = o.world.spawnVehicle(group.vehicle, near, { pursuer: true, minDistance: 45 + i * 12, maxDistance: 110 });
      if (id) { ids.push(id); o.memory.spawned.push(id); }
    }
  }
  return ids;
}

function escapeKind() {
  return {
    begin(o) {
      const player = o.world.player();
      o.state.pursuers = spawnPursuers(o, o.params.pursuers, player);
      o.state.lost = 0;
      if (o.params.landmark) {
        o.target = placeOf(o, o.params.landmark);
        o.memory.place = o.target;
        if (o.params.timeLimit && o.target) o.timeLimit = fairTimeLimit(o.params.timeLimit, planeDistance(player, o.target), o.params.by === 'foot');
      } else {
        o.target = null;
      }
      // Pursuers on foot (a crew with no vehicle): a squad that runs at the lead from behind,
      // away from the goal, swinging fists and tire irons through the crowd's fight mode.
      const onFoot = (o.params.pursuers || []).filter((group) => !group.vehicle && group.crew);
      o.state.squad = null;
      if (onFoot.length && o.world.spawnSquad) {
        const away = o.target ? planeDistance(player, o.target) || 1 : 1;
        const bx = o.target ? (player.x - o.target.x) / away : 0, bz = o.target ? (player.z - o.target.z) / away : 1;
        o.state.squad = o.world.spawnSquad(onFoot, { x: player.x + bx * 18, y: player.y, z: player.z + bz * 18 }, { melee: true, limit: 6, distance: 6 });
      }
    },
    update(o, dt) {
      const player = o.world.player();
      let nearest = Infinity;
      for (const id of o.state.pursuers) {
        const car = o.world.vehicle(id);
        if (isWrecked(car)) continue;
        o.world.drive(id, player, 1);
        nearest = Math.min(nearest, planeDistance(car.position, player));
      }
      if (o.state.squad?.total > 0 && o.world.fightSquad(o.state.squad, dt) > 0) {
        const foe = o.world.nearestEnemy?.(o.state.squad, player);
        if (foe) nearest = Math.min(nearest, planeDistance(foe.position, player));
      }
      if (o.target) {
        const radius = (o.params.radius ?? 8) + (player.vehicleId ? 2 : 0);
        return travelsAs(player, o.params.by) && planeDistance(player, o.target) <= radius ? DONE : PENDING;
      }
      if (nearest > (o.params.loseDistance ?? 150)) o.state.lost += dt;
      else o.state.lost = 0;
      return o.state.lost >= (o.params.loseSeconds ?? 10) ? DONE : PENDING;
    },
    end(o) {
      for (const id of o.state.pursuers || []) o.world.halt(id);
      if (o.state.squad) o.world.releaseSquad?.(o.state.squad);
      o.state.squad = null;
    },
  };
}

function deliverKind() {
  return {
    begin(o) {
      o.target = placeOf(o, o.params.landmark);
      o.memory.place = o.target;
      o.state.id = (o.params.target && o.memory.vehicles[o.params.target]) || o.memory.playerVehicleId;
      if (o.state.id) o.memory.targets.add(o.state.id);
      o.state.pursuers = spawnPursuers(o, o.params.pursuers, o.world.player());
    },
    update(o) {
      const player = o.world.player();
      for (const id of o.state.pursuers) if (!isWrecked(o.world.vehicle(id))) o.world.drive(id, player, 1);
      const car = o.state.id ? o.world.vehicle(o.state.id) : null;
      if (o.state.id && isWrecked(car)) return 'target_destroyed';
      const data = car?.data;
      if (data && data.maxHealth > 0 && 1 - data.health / data.maxHealth > (o.params.maxDamageFraction ?? 1)) return 'cargo_ruined';
      const subject = car ? car.position : player;
      const close = planeDistance(subject, o.target) <= (o.params.radius ?? 10) + 4;
      return close && Math.abs(player.speed) < 4 ? DONE : PENDING;
    },
    end(o) { for (const id of o.state.pursuers || []) o.world.halt(id); },
  };
}

function loseWantedKind() {
  return {
    begin(o) {
      o.state.clear = 0;
      if (o.params.stars && o.world.wantedLevel() < o.params.stars) o.world.setWanted(o.params.stars);
      if (o.params.method === 'respray' && o.params.landmark) {
        o.target = placeOf(o, o.params.landmark);
        o.memory.place = o.target;
      } else {
        o.target = null;
      }
    },
    update(o, dt) {
      const player = o.world.player();
      if (o.target) {
        if (!player.vehicleId || planeDistance(player, o.target) > 10) return PENDING;
        o.world.clearWanted('respray');
        return DONE;
      }
      o.state.clear = o.world.wantedLevel() > 0 ? 0 : o.state.clear + dt;
      return o.state.clear >= 1.5 ? DONE : PENDING;
    },
  };
}

function switchLeadKind() {
  function apply(o) {
    o.world.switchLead(o.params.to);
    if (o.params.vehicle) {
      const id = o.world.spawnVehicle(o.params.vehicle, o.world.player(), { minDistance: 4, maxDistance: 30 });
      if (id) { o.memory.vehicles[o.params.vehicle] = id; o.memory.playerVehicleId = id; o.world.enterVehicle(id); }
    }
  }
  return {
    begin(o) { o.state.t = 0; apply(o); },
    update(o, dt) { o.state.t += dt; return o.state.t >= 0.5 ? DONE : PENDING; },
    restore: apply,
  };
}

function pointsKind({ hold }) {
  return {
    begin(o) {
      const place = o.memory.place || o.world.player();
      const count = hold ? (o.params.targets?.length ?? 1) : (o.params.count ?? 1);
      o.marks = [];
      for (let i = 0; i < count; i += 1) o.marks.push(o.world.pointNear(place, i, count, hold ? 4 : 6));
      o.state.taken = 0;
      o.state.hold = 0;
      o.target = o.marks[0] || null;
      if (hold) o.world.help('Stand close to the marked spot and hold E to take the photograph');
    },
    update(o, dt) {
      const point = o.marks[o.state.taken];
      if (!point) return DONE;
      const player = o.world.player();
      const reach = hold ? (o.params.maxDistance ?? 6) : (player.vehicleId ? 3.5 : 1.8);
      const near = planeDistance(player, point) <= reach;
      if (hold) o.state.hold = near && o.world.holding('interact') ? o.state.hold + dt : 0;
      if (!near || (hold && o.state.hold < (o.params.holdSeconds ?? 1.5))) return PENDING;
      o.state.hold = 0;
      o.state.taken += 1;
      o.world.notify(hold ? `Photograph ${o.state.taken} of ${o.marks.length}` : `Collected ${o.state.taken} of ${o.marks.length}`);
      o.target = o.marks[o.state.taken] || null;
      o.retarget = true;
      return o.state.taken >= o.marks.length ? DONE : PENDING;
    },
    end(o) { o.world.help(null); },
  };
}

function stealthKind() {
  return {
    begin(o) {
      const zone = placeOf(o, o.params.zone);
      o.target = zone ? o.world.pointNear(zone, 2, 3, 12) : null;
      if (zone) o.memory.place = zone;
    },
    update(o) {
      const player = o.world.player();
      return !o.target || (!player.vehicleId && planeDistance(player, o.target) <= 3) ? DONE : PENDING;
    },
  };
}

function checkpointKind(field) {
  return {
    begin(o) {
      const ids = o.params[field] || o.params.via || [];
      o.marks = ids.map((id) => o.world.place(id)).filter(Boolean);
      o.state.left = o.marks.slice();
      o.state.inOrder = o.params.order !== 'any';
      let length = 0, from = o.world.player();
      for (const point of o.marks) { length += planeDistance(from, point); from = point; }
      if (o.params.timeLimit) o.timeLimit = fairTimeLimit(o.params.timeLimit, length, o.params.by === 'foot');
      o.target = o.state.left[0] || null;
    },
    update(o) {
      const player = o.world.player();
      const radius = (o.params.radius ?? 8) + (player.vehicleId ? 4 : 0);
      const left = o.state.left;
      for (let i = 0; i < left.length; i += 1) {
        if (o.state.inOrder && i > 0) break;
        if (planeDistance(player, left[i]) > radius) continue;
        left.splice(i, 1);
        o.world.notify(`Checkpoint: ${o.marks.length - left.length} of ${o.marks.length}`);
        o.marks = left.slice();
        o.target = left[0] || null;
        o.retarget = true;
        break;
      }
      return left.length === 0 ? DONE : PENDING;
    },
  };
}

function raceKind() {
  const base = checkpointKind('via');
  return {
    begin(o) {
      base.begin(o);
      o.state.rivals = [];
      for (const rival of o.params.opponents || []) {
        const id = o.world.spawnVehicle(rival.vehicle, o.world.player(), { minDistance: 6, maxDistance: 25 });
        if (id) { o.memory.spawned.push(id); o.state.rivals.push({ id, next: 0, skill: rival.skill ?? 0.7 }); }
      }
    },
    update(o, dt) {
      const route = o.params.via.map((id) => o.world.place(id));
      for (const rival of o.state.rivals) {
        const car = o.world.vehicle(rival.id);
        const point = route[rival.next];
        if (isWrecked(car) || !point) continue;
        o.world.drive(rival.id, point, rival.skill);
        if (planeDistance(car.position, point) < 14) rival.next += 1;
        if (rival.next >= route.length) return 'race_lost';
      }
      return base.update(o, dt);
    },
    end(o) { for (const rival of o.state.rivals || []) o.world.halt(rival.id); },
  };
}

function fleeingKind(mode) {
  return {
    begin(o) {
      const player = o.world.player();
      const destination = placeOf(o, mode === 'tail' ? o.params.to : o.params.before);
      o.state.destination = destination;
      o.state.near = 0; o.state.far = 0; o.state.stopped = 0;
      if (o.params.providedVehicle && !player.vehicleId) {
        const own = o.world.spawnVehicle(o.params.providedVehicle, player, { minDistance: 4, maxDistance: 20 });
        if (own) { o.memory.playerVehicleId = own; o.world.enterVehicle(own); }
      }
      o.state.id = spawnTarget(o, o.params.target, player);
      if (o.params.timeLimit) o.timeLimit = o.params.timeLimit;
      const car = o.state.id ? o.world.vehicle(o.state.id) : null;
      o.target = car ? car.position : destination;
    },
    update(o, dt) {
      const car = o.state.id ? o.world.vehicle(o.state.id) : null;
      if (!o.state.id) return DONE;
      const player = o.world.player();
      if (isWrecked(car)) return mode === 'chase' && !o.params.mustSurvive ? DONE : 'target_destroyed';
      const gap = planeDistance(car.position, player);
      const goal = o.state.destination;
      if (goal) o.world.drive(o.state.id, goal, mode === 'tail' ? 0.5 : 0.85);
      const arrived = goal && planeDistance(car.position, goal) < 16;
      if (mode === 'tail') {
        if (arrived) return DONE;
        o.state.near = gap < (o.params.minDistance ?? 12) ? o.state.near + dt : 0;
        o.state.far = gap > (o.params.maxDistance ?? 120) ? o.state.far + dt : 0;
        if (o.state.near > (o.params.tooCloseSeconds ?? 4)) return 'detected';
        return o.state.far > (o.params.lostSeconds ?? 8) ? 'target_escaped' : PENDING;
      }
      if (arrived || gap > (o.params.escapeDistance ?? 260)) return 'target_escaped';
      const data = car.data || {};
      const beaten = data.maxHealth > 0 && data.health / data.maxHealth < 0.4;
      o.state.stopped = Math.abs(data.speed ?? 0) < 1 && gap < 14 && o.state.near > 2 ? o.state.stopped + dt : 0;
      o.state.near += dt;
      return beaten || o.state.stopped > 2.5 ? DONE : PENDING;
    },
    end(o) { if (o.state.id) o.world.halt(o.state.id); },
  };
}

/** The waves of enemies an objective sends, each a list of {crew, count, weapon?} groups. */
export function wavesOf(mode, params) {
  if (mode === 'subdue') return typeof params.target === 'string' ? [[{ crew: params.target, count: 1 }]] : [];
  if (mode === 'defend') return (params.waves || []).map((wave) => [wave]);
  const enemies = (params.enemies || []).slice();
  if (params.boss?.character) enemies.unshift({ crew: params.boss.crew ?? 'circle_enforcer', count: 1 });
  // eliminate with waves: each catalog group is a wave; otherwise one fight with everyone.
  if (mode === 'eliminate' && Number(params.waves) > 1 && enemies.length > 1) return enemies.map((group) => [group]);
  return enemies.length ? [enemies] : [];
}

/**
 * Fights at a place: eliminate, brawl and subdue end when every wave is down; defend and
 * survive hold the place for their seconds while waves keep coming. Enemies are real squads from
 * the world (missionEnemies.js); without them the place is simply held for the seconds.
 */
function combatKind(mode, defaultSeconds) {
  const melee = mode === 'brawl' || mode === 'subdue';
  const timed = mode === 'defend' || mode === 'survive';
  function nextWave(o) {
    if (o.state.squad) o.world.releaseSquad?.(o.state.squad);
    o.state.wave += 1;
    o.state.waveTime = 0;
    const waves = o.state.waves;
    const groups = timed ? waves[o.state.wave % Math.max(1, waves.length)] : waves[o.state.wave];
    o.state.squad = groups && o.world.spawnSquad ? o.world.spawnSquad(groups, o.state.place, { melee, limit: timed ? 6 : 8, distance: timed ? 22 : 14 }) : null;
    o.state.foe = null;
  }
  return {
    begin(o) {
      const named = o.params.at || o.params.landmark || (typeof o.params.target === 'string' ? o.params.target : null);
      const p = o.world.player();
      o.target = placeOf(o, named);
      // No place of its own and the run's place is out of reach (after a checkpoint run, or
      // started from a checkpoint): the enemies come to where the lead stands.
      if (!o.target || (!(named && o.world.place(named)) && planeDistance(p, o.target) > 40)) o.target = { x: p.x, y: p.y, z: p.z, frontX: 0, frontZ: 1 };
      o.memory.place = o.target;
      o.state.place = o.target;
      o.state.held = 0;
      o.state.seconds = o.params.seconds ?? defaultSeconds;
      o.state.waves = wavesOf(mode, o.params);
      o.state.wave = -1;
      o.state.squad = null;
      o.state.engaged = false;
      o.state.pause = 0;
    },
    update(o, dt) {
      const player = o.world.player();
      const place = o.state.place;
      if (!place) return DONE;
      const gap = planeDistance(player, place);
      if (!o.state.engaged) {
        if (gap > 40) return PENDING;
        o.state.engaged = true;
        o.world.help(melee ? 'Fists and melee weapons only' : timed ? 'Hold this place' : null);
        nextWave(o);
      }
      if (gap > 90) return 'left_area';
      const squad = o.state.squad;
      const real = squad && squad.total > 0;
      const standing = real ? o.world.fightSquad(squad, dt) : 0;
      o.state.held += dt;
      o.state.waveTime += dt;
      if (real && standing > 0) {
        // The HUD and the beam follow the nearest enemy still standing.
        const foe = o.world.nearestEnemy(squad, player);
        if (foe && foe !== o.state.foe) { o.state.foe = foe; o.target = foe.position; o.retarget = true; }
      }
      if (timed) {
        const between = o.params.secondsBetweenWaves ?? 20;
        if (real && (standing === 0 ? o.state.waveTime > 4 : o.state.waveTime > between * 3)) nextWave(o);
        return o.state.held >= o.state.seconds ? DONE : PENDING;
      }
      if (!real) return o.state.held >= o.state.seconds ? DONE : PENDING;
      if (standing > 0) return PENDING;
      if (o.state.wave + 1 >= o.state.waves.length) return DONE;
      o.state.pause += dt;
      if (o.state.pause < 3) return PENDING;
      o.state.pause = 0;
      nextWave(o);
      return PENDING;
    },
    end(o) {
      if (o.state.squad) o.world.releaseSquad?.(o.state.squad);
      o.state.squad = null;
      o.world.help(null);
    },
  };
}

function outfitKind() {
  const reach = reachKind({ radius: 6 });
  return {
    begin(o) { if (o.params.soldAt) reach.begin(Object.assign(o, { params: { ...o.params, landmark: o.params.soldAt } })); },
    update(o, dt) { return o.params.landmark ? reach.update(o, dt) : DONE; },
  };
}

function waitKind() {
  return {
    begin(o) { o.state.t = 0; },
    update(o, dt) { o.state.t += dt; return o.state.t >= (o.params.seconds ?? 3) ? DONE : PENDING; },
  };
}
