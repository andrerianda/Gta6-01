// Keeps the crowd populated: the quality tier's share of people within reach of the camera,
// spawned out of sight on the pavement graph by district and hour (a fill after a jump puts most
// in view), as walkers, groups walking together, talking pairs and trios, people on the bench
// seats where the dressing has them and shoppers stepping out of doors; people put down at exact
// points (missions), rammed drivers who climb out, carjacked drivers hauled out of their seat;
// and removes those left behind. Works on the shared crowd state that crowdSimulation.js builds.
import * as THREE from 'three';
import { ENTITY_KINDS, ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { assetIdsOfKind } from '../assets/index.js';
import { companionSpot } from './crowdActivities.js';
import { archetypeMixAt, bodiesFor, crowdDensityAt, gangBaseFor, pickAppearance, pickWeighted } from './crowdSpawning.js';
import { createCircleList } from './pavementObstacles.js';
import { freeSpotNear, spotIsFree } from './personalSpace.js';

/** Metres: people are kept within, spawned beyond the near ring and out of view. */
export const KEEP_RADIUS = 105, SPAWN_RADIUS = 85, SPAWN_NEAR = 18;
/** Landmarks whose pavements are always busy (the first mission opens at Tolliver Tow), and how far. */
const BUSY_LANDMARKS = ['tolliver_tow'], BUSY_RADIUS = 90;
/** Bench seats looked at in a fill (metres round the focus) and the most people sat at once. */
const SEAT_REACH = 45, MAX_SITTERS = 10;
/** Lot styles (or landmark kinds) whose street front is shops people walk in and out of. */
const SHOP_STYLES = new Set(['colonial_shopfront', 'strip_mall', 'office_midrise', 'glass_tower', 'resort_tower',
  'art_deco_hotel', 'pastel_apartment_block', 'stucco_rowhouse', 'roadside_box', 'marina_condo',
  'shopping_mall', 'bank', 'grand_hotel', 'diner', 'clothing_store', 'convenience_store', 'gun_shop', 'bar_cantina', 'nightclub']);

/** The shop doors of a plan: a point at the shop front and the unit direction into the shop. */
export function shopDoorsOf(plan) {
  const doors = [];
  for (const lot of (plan && plan.lots) || []) {
    if (!lot.entrance || !(SHOP_STYLES.has(lot.style) || SHOP_STYLES.has(lot.landmarkKind))) continue;
    const ix = lot.x - lot.entrance.x, iz = lot.z - lot.entrance.z, d = Math.hypot(ix, iz) || 1;
    doors.push({ x: lot.entrance.x + (ix / d) * 0.6, z: lot.entrance.z + (iz / d) * 0.6, ix: ix / d, iz: iz / d });
  }
  return doors;
}

/**
 * Creates the crowd's population keeper.
 * @param {object} crowd The shared crowd state (crowdSimulation.js).
 */
export function createCrowdPopulation(crowd) {
  const { context, city, archetypes, districts, routes, bodies, benches, shooting, people, random, nearDoors } = crowd;
  const characterIds = assetIdsOfKind('character');
  // Every registered person: pedestrian_* bodies join the crowd as the character artist adds them.
  const bodyChoices = {
    female: bodiesFor(characterIds, 'female').filter((id) => context.assets.get(id)),
    male: bodiesFor(characterIds, 'male').filter((id) => context.assets.get(id)),
  };
  /** Whether a character base is registered and loaded (a gang's own). */
  const hasBase = (id) => characterIds.includes(id) && (typeof context.assets.has === 'function' ? context.assets.has(id) : false);
  const doors = shopDoorsOf(city.plan);
  const busySpots = BUSY_LANDMARKS.map((id) => city.plan && city.plan.landmarkById && city.plan.landmarkById[id]).filter(Boolean)
    .map((l) => ({ x: l.entrance ? l.entrance.x : l.x, z: l.entrance ? l.entrance.z : l.z }));
  const spot = { x: 0, z: 0, dirX: 0, dirZ: -1, length: 0 };
  const companion = { x: 0, z: 0 };
  const freeSpot = { x: 0, z: 0 };
  const at = { x: 0, z: 0, heading: 0 };
  const sphere = new THREE.Sphere();
  const seatList = [];
  const lastFocus = { x: 0, z: 0 };
  const candidatesAt = { x: 0, z: 0 };
  let candidates = null;
  /** During a fill: the pavement points in the camera's view (null otherwise). */
  let viewPoints = null;
  let densityScale = 1, upkeepTimer = 0, filled = false, fillAt = 0;

  function capacity() {
    const tier = context.quality.tier || {};
    // One draw call a person (merged bodies): three quarters of the tier's people fit the budget.
    return Math.min(64, Math.round((tier.maxPedestrians ?? 80) * 0.75));
  }

  function targetCount() {
    const f = context.focus.position;
    const district = districts[city.districtAt(f.x, f.z)];
    let density = crowdDensityAt(district, context.clock.timeOfDay);
    for (const b of busySpots) if (Math.abs(b.x - f.x) + Math.abs(b.z - f.z) < BUSY_RADIUS) density = Math.max(density, 0.95);
    return Math.min(capacity(), Math.round(capacity() * densityScale * Math.min(1, 0.25 + density)));
  }

  /** An archetype of the district at x, z (no joggers: a driver, a sitter) with a look and a body. */
  function dressFor(x, z) {
    const mix = archetypeMixAt(districts[city.districtAt(x, z)], context.clock.timeOfDay, archetypes);
    let id = pickWeighted(mix, random);
    if (id === 'jogger') id = pickWeighted(mix, random);
    const archetype = archetypes[id] || archetypes.office_worker;
    if (!archetype) return null;
    const look = pickAppearance(archetype.appearance, random);
    const choices = bodyChoices[look.sex] || bodyChoices.male;
    return { archetype, look, assetId: choices[Math.floor(random() * choices.length)] || 'dez_tolliver' };
  }

  /**
   * Puts a new person on an edge.
   * @param {string|object} archetypeId An archetype id, or a profile of the same shape (a gang member).
   * @param {{tags?: string[], data?: object}} [extra] More entity tags and data (factions).
   * @param {{x: number, z: number, heading: number} | null} [place] Off the routes (edgeId -1):
   *   the point and the yaw to stand at.
   * @param {{look: object, body: object} | null} [dressed] A body already posed (a hauled-out
   *   driver): taken as it is, not reset.
   */
  function spawn(archetypeId, edgeId, forward, along, mode = 'walk', extra = null, place = null, dressed = null) {
    const archetype = typeof archetypeId === 'string' ? archetypes[archetypeId] : archetypeId;
    if (!archetype) return null;
    if (edgeId >= 0) routes.place(edgeId, forward, along, 0, spot);
    else {
      spot.x = place.x; spot.z = place.z;
      spot.dirX = -Math.sin(place.heading || 0); spot.dirZ = -Math.cos(place.heading || 0);
    }
    const yaw = Math.atan2(-spot.dirX, -spot.dirZ);
    let look = dressed ? dressed.look : null, body = dressed ? dressed.body : null;
    if (!body) {
      look = pickAppearance(archetype.appearance, random);
      // A gang with its own built bases but none for this sex (La Corriente's dock crew has only
      // a man's) draws the member as the sex it has: no office skirt under a hi-vis vest.
      if (archetype.factionId && !gangBaseFor(archetype.factionId, look.sex, hasBase)) {
        const other = look.sex === 'female' ? 'male' : 'female';
        if (gangBaseFor(archetype.factionId, other, hasBase)) look = pickAppearance({ ...archetype.appearance, sexes: { [other]: 1 } }, random);
      }
      const choices = bodyChoices[look.sex] || bodyChoices.male;
      // A gang member wears the gang's own base when it is built.
      const gangBase = gangBaseFor(archetype.factionId, look.sex, hasBase);
      body = bodies.acquire(gangBase || choices[Math.floor(random() * choices.length)] || 'dez_tolliver', look, yaw);
    }
    const position = new THREE.Vector3(spot.x, city.groundHeightAt(spot.x, spot.z), spot.z);
    const entity = context.entities.add({
      kind: ENTITY_KINDS.CHARACTER, owner: 'pedestrians', position, radius: 0.35, heading: yaw,
      tags: extra && extra.tags ? extra.tags : [ENTITY_TAGS.PEDESTRIAN],
      data: { archetypeId: archetype.id, health: archetype.health || 100, mode, reaction: null, ...(extra && extra.data) },
    });
    const activities = archetype.activities || {};
    const armed = !dressed && random() < (archetype.armedChance || 0);
    if (body.walker.gesture && typeof body.walker.setGesture === 'function') body.walker.setGesture(null);
    const person = {
      id: entity.id, entity, archetype, look, body, edge: edgeId, forward, along,
      lane: 0.25 + random() * 0.55, walkSpeed: (archetype.walkSpeed || 1.3) * (0.9 + random() * 0.2),
      style: activities.jog > 3 ? 'jog' : activities.stroll > 3 ? 'stroll' : 'walk',
      mode, timer: 0, think: random() * 0.3, sourceX: 0, sourceZ: 0, offenderId: null, facing: NaN,
      armed, dodgeX: 0, dodgeZ: 0, crimeId: null, fall: 0,
      fallDirection: 1, dodgeTimer: 0, input: body.input, waitEdge: -1, waitForward: true, x: spot.x, z: spot.z,
      stance: 'stand', gone: false, carId: null, angry: false, targetX: 0, targetZ: 0, rising: false,
      // Company, seats, hands and guns (crowdActivities.js).
      leader: null, slot: 0, seat: null, gesture: null, gestureMode: '', gestureTimer: 0,
      weaponId: armed ? archetype.weapon || 'pistol' : null, gun: null, fireTimer: 1, provoked: false,
      dismissed: false, removed: false,
      // Pavement obstacles round them (pavementObstacles.js), the side they pass one on, and
      // when an off-route person last looked for a pavement to join.
      obstacles: createCircleList(), side: random() < 0.5 ? -1 : 1, routeCheck: 0,
    };
    entity.data.person = person;
    people.push(person);
    return person;
  }

  /** Takes the person at `index` out of the crowd (the body goes back to the pool). */
  function despawn(index) {
    const person = people[index];
    if (person.gun) shooting.holster(person);
    if (person.seat) { benches.free(person.seat); person.seat = null; }
    person.removed = true;
    bodies.release(person.body);
    context.entities.remove(person.entity);
    people[index] = people[people.length - 1];
    people.pop();
  }

  /** Faces each member of a standing group towards the group's middle. */
  function faceTogether(group) {
    let mx = 0, mz = 0;
    for (const p of group) { mx += p.x / group.length; mz += p.z / group.length; }
    for (const p of group) p.facing = Math.atan2(-(mx - p.x), -(mz - p.z));
  }

  /** Stands a second (and sometimes a third) talker with a chatting person. */
  function spawnTalkers(first, mix, archetypeId) {
    first.timer = 20 + random() * 40;
    const length = routes.lengthOf(first.edge);
    const second = spawn(pickWeighted(mix, random) || archetypeId, first.edge, !first.forward, length - first.along - 1.1, 'chat');
    if (!second) return;
    second.timer = first.timer;
    const group = [first, second];
    if (random() < 0.35) {
      // A third closes the circle, a step along from the pair.
      const third = spawn(pickWeighted(mix, random) || archetypeId, first.edge, first.forward, Math.min(length, first.along + 0.55), 'chat');
      if (third) {
        third.timer = first.timer;
        routes.place(first.edge, first.forward, Math.min(length, first.along + 0.55), 0, spot);
        third.x = spot.x + spot.dirX * 0.8;
        third.z = spot.z + spot.dirZ * 0.8;
        group.push(third);
      }
    }
    faceTogether(group);
  }

  /** One or two companions who walk beside a walker (a couple, friends, a family). */
  function spawnCompanions(leader, mix, archetypeId, count) {
    const yaw = leader.body.walker.state.yaw;
    for (let slot = 0; slot < count; slot += 1) {
      const p = spawn(pickWeighted(mix, random) || archetypeId, leader.edge, leader.forward, leader.along, 'walk');
      if (!p) return;
      p.leader = leader;
      p.slot = slot;
      p.style = leader.style;
      companionSpot(leader.x, leader.z, yaw, slot, companion);
      p.x = companion.x;
      p.z = companion.z;
      p.body.walker.reset(yaw);
    }
  }

  /**
   * Sits people on the free bench and shelter seats round the focus (a fill): more where the
   * seats are dense (a promenade, a plaza), never right at the lead's feet.
   */
  function seatSome(count) {
    if (typeof city.seatsNear !== 'function') return;
    const f = context.focus.position;
    const seats = city.seatsNear(f.x, f.z, SEAT_REACH, seatList);
    if (!seats.length) return;
    const want = Math.min(seats.length, MAX_SITTERS, count + Math.floor(seats.length / 3));
    for (let n = 0, tries = 0; n < want && tries < want * 3; tries += 1) {
      const near = seats[Math.floor(random() * seats.length)];
      const seat = benches.freeNear(near.x, near.z, 0.8);
      if (!seat || Math.hypot(seat.x - f.x, seat.z - f.z) < 6) continue;
      const dressed = dressFor(seat.x, seat.z);
      const p = dressed ? spawnFree(dressed.archetype, seat.x, seat.z, 'walk', null, false) : null;
      if (!p) continue;
      p.body.walker.reset(seat.yaw);
      crowd.sitDown(p, seat);
      n += 1;
    }
  }

  /** Spawns a person, a group walking together, or a talking pair or trio, out of sight. */
  function spawnNear(allowInView) {
    const f = context.focus.position;
    const frustum = crowd.frustum;
    // Every pavement point in reach (the query stops at its limit cell by cell, so ask for all),
    // queried again only once the focus has moved on.
    if (!candidates || Math.hypot(f.x - candidatesAt.x, f.z - candidatesAt.z) > 12) {
      candidates = city.spawnPointsNear(f.x, f.z, SPAWN_RADIUS, 'pedestrian', 5000);
      candidatesAt.x = f.x;
      candidatesAt.z = f.z;
      nearDoors.length = 0;
      for (const door of doors) if (Math.abs(door.x - f.x) < 50 && Math.abs(door.z - f.z) < 50) nearDoors.push(door);
    }
    const points = candidates;
    if (!points.length) return false;
    for (let tries = 0; tries < (allowInView ? 12 : 6); tries += 1) {
      // A wanted distance, weighted towards the player (the pavement area grows with the
      // distance, so uniform points would leave the near street thin), then the candidate of
      // eight whose distance is closest to it: the crowd is thickest around the camera. A fill
      // puts most people inside the camera's view, where the street is seen.
      const low = allowInView ? 8 : SPAWN_NEAR, u = random();
      const wantView = allowInView && random() < 0.85;
      if (wantView && !viewPoints) {
        // Once per fill: the pavement points in view within 45 m (the street the camera sees).
        // Points behind a block are in the frustum too: keep those the camera really sees.
        const physics = context.systems.find('physics');
        const sight = physics && physics.world && typeof physics.world.lineOfSight === 'function' ? physics.world : null;
        const eye = context.view.camera.position;
        viewPoints = points.filter((q) => {
          const d = Math.hypot(q.x - f.x, q.z - f.z);
          sphere.center.set(q.x, q.y + 1, q.z);
          sphere.radius = 1;
          return d >= low && d < 45 && frustum.intersectsSphere(sphere)
            && (!sight || sight.lineOfSight(eye.x, eye.y, eye.z, q.x, q.y + 1.2, q.z));
        });
      }
      const pool = wantView && viewPoints.length ? viewPoints : points;
      // In view: spread over 8 to 42 m ahead (the street the camera looks along).
      const wanted = pool === points ? low + (SPAWN_RADIUS - low) * u * u : low + (42 - low) * Math.pow(u, 1.3);
      let point = null, gap = Infinity;
      for (let k = 0; k < 8; k += 1) {
        const q = pool[Math.floor(random() * pool.length)];
        const off = Math.abs(Math.hypot(q.x - f.x, q.z - f.z) - wanted);
        if (off < gap) { gap = off; point = q; }
      }
      if (!point) continue;
      const edgeId = point.edge.id;
      const forward = random() < 0.5;
      const length = routes.lengthOf(edgeId);
      // Pavement points stand about ten metres apart: spread people along the edge between them
      // (without it the street the camera sees holds one person per point).
      let along = routes.locate(edgeId, forward, point.x, point.z) + (random() - 0.5) * 9;
      // Some of a fill start near the kerb, so the camera sees people waiting at the crossings.
      if (allowInView && random() < 0.2) along = Math.max(along, length - 1.2);
      along = Math.max(0, Math.min(length, along));
      routes.place(edgeId, forward, along, 0, spot);
      const sx = spot.x, sz = spot.z;
      const d = Math.hypot(sx - f.x, sz - f.z);
      if (d < low) continue;
      sphere.center.set(sx, point.y + 1, sz);
      sphere.radius = 1;
      if (!allowInView && d < 70 && frustum.intersectsSphere(sphere)) continue;
      if (!spotIsFree(sx, sz, people, crowd.player && crowd.player.position)) continue;
      const district = districts[city.districtAt(sx, sz)];
      const mix = archetypeMixAt(district, context.clock.timeOfDay, archetypes);
      let archetypeId = pickWeighted(mix, random) || pickWeighted(archetypeMixAt(districts.centro, 12, archetypes), random);
      // The promenade and park paths have their joggers.
      if (point.edge.kind === 'path' && archetypes.jogger && random() < 0.35) archetypeId = 'jogger';
      const archetype = archetypes[archetypeId];
      const chat = archetype && (archetype.activities.stand_chat || 0) / 12;
      const first = spawn(archetypeId, edgeId, forward, along, random() < chat ? 'chat' : 'walk');
      if (first && first.mode === 'chat') spawnTalkers(first, mix, archetypeId);
      else if (first && first.style !== 'jog' && random() < (allowInView ? 0.4 : 0.25)) spawnCompanions(first, mix, archetypeId, random() < 0.3 ? 2 : 1);
      return true;
    }
    return false;
  }

  /**
   * Puts a person at a free spot (off the pavement graph: a shop door, beside a car), joined to
   * the nearest pavement edge so they walk on from there.
   */
  function spawnFree(archetypeId, x, z, mode, extra, keepApart = true) {
    const points = city.spawnPointsNear(x, z, 30, 'pedestrian', 80);
    let best = null, bestD = Infinity;
    for (const point of points) { const d = Math.hypot(point.x - x, point.z - z); if (d < bestD) { bestD = d; best = point; } }
    if (!best) return placeAt(archetypeId, x, z, mode, extra);
    const forward = random() < 0.5;
    const person = spawn(archetypeId, best.edge.id, forward, routes.locate(best.edge.id, forward, best.x, best.z), mode, extra);
    if (person) { person.x = x; person.z = z; if (keepApart) settle(person); }
    return person;
  }

  /**
   * Puts a person down exactly at x, z (or the nearest free spot, 1.5 m from anyone and 2.5 m
   * from the lead), on or off the route network: missions' givers, guards and pursuers at the
   * port. Off the routes they stand (chat) or fight; walking, they join the nearest pavement.
   * @param {number} [heading] Yaw to face (three.js rotation.y); random when omitted.
   */
  function placeAt(archetypeId, x, z, mode = 'chat', extra = null, heading = NaN) {
    const free = freeSpotNear(x, z, people, crowd.lead && crowd.lead.position, freeSpot);
    at.x = free ? free.x : x;
    at.z = free ? free.z : z;
    at.heading = Number.isFinite(heading) ? heading : random() * Math.PI * 2;
    const person = spawn(archetypeId, -1, true, 0, mode, extra, at);
    if (!person) return null;
    person.edge = -1;
    person.facing = at.heading;
    person.body.walker.reset(at.heading);
    return person;
  }

  /** Moves a person just put down (the last in the list) off anyone they would stand inside. */
  function settle(person) {
    people.pop();
    const free = freeSpotNear(person.x, person.z, people, crowd.lead && crowd.lead.position, freeSpot);
    people.push(person);
    if (free) { person.x = free.x; person.z = free.z; person.entity.position.x = free.x; person.entity.position.z = free.z; }
  }

  /** Spawns one person at the pavement point nearest x, z (PEDESTRIAN_SPAWN; factions). */
  function spawnAt(archetypeId, x, z, mode = 'walk', extra = null) {
    const points = city.spawnPointsNear(x, z, 25, 'pedestrian', 60);
    let best = null, bestD = Infinity;
    for (const point of points) { const d = Math.hypot(point.x - x, point.z - z); if (d < bestD) { bestD = d; best = point; } }
    // No pavement in reach (the port, a yard): stand them exactly there.
    if (!best) return placeAt(archetypeId, x, z, mode, extra);
    const forward = random() < 0.5;
    const person = spawn(archetypeId, best.edge.id, forward, routes.locate(best.edge.id, forward, best.x, best.z), mode, extra);
    if (person) settle(person);
    return person;
  }

  /** Someone steps out of a shop door near the player (in view is fine: they come out of a door). */
  function spawnFromShop() {
    const f = context.focus.position;
    if (!nearDoors.length) return null;
    const door = nearDoors[Math.floor(random() * nearDoors.length)];
    const d = Math.hypot(door.x - f.x, door.z - f.z);
    if (d < 6 || d > 45) return null;
    for (const p of people) if (Math.abs(p.x - door.x) + Math.abs(p.z - door.z) < 2.5) return null;
    const district = districts[city.districtAt(door.x, door.z)];
    const archetypeId = pickWeighted(archetypeMixAt(district, context.clock.timeOfDay, archetypes), random);
    const person = archetypeId ? spawnFree(archetypeId, door.x, door.z, 'walk') : null;
    if (person) person.body.walker.reset(Math.atan2(door.ix, door.iz));
    return person;
  }

  /** A rammed traffic driver climbs out and squares up to the player (traffic.onAngryDriver). */
  function angryDriver({ vehicleId, position, heading, targetId }) {
    if (!position || targetId == null) return null;
    // Physics heading: forward (sin h, -cos h); the driver's door is on the left.
    const x = position.x - Math.cos(heading) * 1.5, z = position.z - Math.sin(heading) * 1.5;
    const district = districts[city.districtAt(x, z)];
    const archetypeId = pickWeighted(archetypeMixAt(district, context.clock.timeOfDay, archetypes), random) || 'office_worker';
    const person = spawnFree(archetypeId, x, z, 'fight', { tags: [ENTITY_TAGS.PEDESTRIAN], data: { driverOf: vehicleId } });
    if (!person) return null;
    person.offenderId = targetId;
    person.carId = vehicleId;
    person.angry = true;
    person.timer = 6 + random() * 3;
    return person;
  }

  /**
   * A driver the lead hauls out of a car (the run-time's dragged-out motion is already playing
   * on the seated body): joins the crowd where the body is, lies by the door, gets up and runs.
   * @param {{vehicleId: number, archetype: object, look: object, body: object}} driver
   */
  function adoptDriver(driver) {
    const instance = driver.body.instance;
    at.x = instance.position.x;
    at.z = instance.position.z;
    at.heading = driver.body.walker.state.yaw;
    const extra = { tags: [ENTITY_TAGS.PEDESTRIAN], data: { driverOf: driver.vehicleId, jacked: true } };
    const person = spawn(driver.archetype, -1, true, 0, 'dragged', extra, at, driver);
    if (!person) { bodies.release(driver.body); return null; }
    const car = context.entities.get(driver.vehicleId);
    person.sourceX = car ? car.position.x : at.x;
    person.sourceZ = car ? car.position.z : at.z;
    person.offenderId = crowd.player ? crowd.player.id : null;
    person.timer = 6;
    return person;
  }

  /**
   * A traffic driver hauled out by a carjack with no body drawn to play it: lies on the road by
   * the driver's door, gets up and runs off.
   */
  function jackedDriver(vehicleId, position) {
    const car = context.entities.get(vehicleId);
    const heading = car ? car.heading : 0;
    const cx = car ? car.position.x : position.x, cz = car ? car.position.z : position.z;
    const x = cx - Math.cos(heading) * 1.6, z = cz - Math.sin(heading) * 1.6;
    const district = districts[city.districtAt(x, z)];
    const archetypeId = pickWeighted(archetypeMixAt(district, context.clock.timeOfDay, archetypes), random) || 'office_worker';
    const person = spawnFree(archetypeId, x, z, 'down', { tags: [ENTITY_TAGS.PEDESTRIAN], data: { driverOf: vehicleId, jacked: true } }, false);
    if (!person) return null;
    person.x = x;
    person.z = z;
    person.fall = 1;
    person.fallDirection = -1;
    person.timer = 1.4 + random() * 0.8;
    person.sourceX = cx;
    person.sourceZ = cz;
    person.offenderId = crowd.player ? crowd.player.id : null;
    person.body.walker.reset(-heading + Math.PI / 2);
    return person;
  }

  function upkeep() {
    const f = context.focus.position;
    for (let i = people.length - 1; i >= 0; i -= 1) {
      const p = people[i];
      if (Math.abs(p.x - f.x) > KEEP_RADIUS || Math.abs(p.z - f.z) > KEEP_RADIUS) despawn(i);
    }
    const target = targetCount();
    const batch = filled ? 2 : target;
    // A fill also sits people on the benches around (seats published by the dressing).
    if (!filled && benches.available) seatSome(Math.max(1, Math.round(target * 0.08)));
    for (let n = 0; n < batch && people.length < target; n += 1) spawnNear(!filled);
    viewPoints = null;
    // Shops near the player let people out now and then (a few over the target is fine).
    if (filled && people.length < target + 4 && random() < 0.3) spawnFromShop();
    filled = true;
  }

  return {
    spawn, despawn, spawnFree, spawnAt, placeAt, angryDriver, jackedDriver, adoptDriver, dressFor, capacity, upkeep,
    setDensity(scale) { densityScale = Math.max(0, Math.min(2, Number(scale) || 0)); },
    /** Fills the pavements around the focus at the next update, in view too. */
    refill() { filled = false; candidates = null; },
    /** Once per frame: refills after a jump of the focus, tops the crowd up twice a second. */
    tick(dt) {
      const f = context.focus.position;
      // A jump (teleport, respawn, a camera cut) fills the new place once the camera has caught up.
      if (Math.abs(f.x - lastFocus.x) + Math.abs(f.z - lastFocus.z) > 40) { filled = false; candidates = null; fillAt = crowd.time + 0.15; }
      lastFocus.x = f.x;
      lastFocus.z = f.z;
      upkeepTimer -= dt;
      if ((upkeepTimer <= 0 || !filled) && crowd.time >= fillAt) { upkeepTimer = 0.5; upkeep(); }
    },
  };
}
