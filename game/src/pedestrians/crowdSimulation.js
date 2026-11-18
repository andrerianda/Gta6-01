// The crowd around the player: keeps the quality tier's share of people within reach of the
// camera, spawned out of sight on the pavement graph by district and hour; walks each along
// pavements and over crossings (waiting for the walk phase), keeping right, steering round each
// other and the player; parks some in talking pairs and at pauses; and carries out their
// reactions: diving out of a car's path, being knocked down, fleeing along the streets at a run,
// cowering, gawking, phoning the police and squaring up to the offender. Positions and moves are
// in world metres; every person is an entity tagged 'pedestrian'.
import * as THREE from 'three';
import { ENTITY_KINDS, ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { archetypeMixAt, bodiesFor, crowdDensityAt, pickAppearance, pickWeighted } from './crowdSpawning.js';
import { createPedestrianBodies } from './pedestrianBodies.js';
import { CALL_SECONDS, FLEE_SECONDS, carThreat, chooseReaction, fleeDirection, knocksDown, witnessHeat } from './pedestrianReactions.js';
import { createWalkingRoutes } from './walkingRoutes.js';
import { assetIdsOfKind } from '../assets/index.js';

const characterIds = assetIdsOfKind('character');

/** Metres: people are kept within, spawned beyond the near ring and out of view. */
const KEEP_RADIUS = 105, SPAWN_RADIUS = 85, SPAWN_NEAR = 18;
const RUN_SPEED = 5.2;
/** Lot styles (or landmark kinds) whose street front is shops people walk in and out of. */
const SHOP_STYLES = new Set(['colonial_shopfront', 'strip_mall', 'office_midrise', 'glass_tower', 'resort_tower',
  'art_deco_hotel', 'pastel_apartment_block', 'stucco_rowhouse', 'roadside_box', 'marina_condo',
  'shopping_mall', 'bank', 'grand_hotel', 'diner', 'clothing_store', 'convenience_store', 'gun_shop', 'bar_cantina', 'nightclub']);

/** The shop doors of a plan: a point at the shop front and the unit direction into the shop. */
function shopDoorsOf(plan) {
  const doors = [];
  for (const lot of (plan && plan.lots) || []) {
    if (!lot.entrance || !(SHOP_STYLES.has(lot.style) || SHOP_STYLES.has(lot.landmarkKind))) continue;
    const ix = lot.x - lot.entrance.x, iz = lot.z - lot.entrance.z, d = Math.hypot(ix, iz) || 1;
    doors.push({ x: lot.entrance.x + (ix / d) * 0.6, z: lot.entrance.z + (iz / d) * 0.6, ix: ix / d, iz: iz / d });
  }
  return doors;
}

/**
 * Creates the crowd.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {object} city The openWorldCity system.
 */
export function createCrowdSimulation(context, city) {
  const archetypes = context.content.get('pedestrianArchetypes').PEDESTRIAN_ARCHETYPES;
  const districts = context.content.get('cityDistricts').CITY_DISTRICTS;
  const routes = createWalkingRoutes(city.pedestrianGraph, city.plan ? city.plan.roads.nodes : []);
  const bodies = createPedestrianBodies(context, context.view.layers.dynamic);
  const generator = context.random('pedestrians');
  const random = () => generator.next();
  const people = [];
  const frustum = new THREE.Frustum(), viewMatrix = new THREE.Matrix4(), sphere = new THREE.Sphere();
  const spot = { x: 0, z: 0, dirX: 0, dirZ: -1, length: 0 };
  const away = { x: 0, z: 0 };
  const threat = { seconds: 0, side: 1, lateral: 0 };
  const next = { edge: -1, forward: true };
  const nearby = [];
  let densityScale = 1, upkeepTimer = 0, filled = false, time = 0, serial = 0, fillAt = 0;
  let candidates = null;
  const candidatesAt = { x: 0, z: 0 };
  const lastFocus = { x: 0, z: 0 };
  const doors = shopDoorsOf(city.plan);
  /** Shop doors within reach of the focus (refreshed with the spawn candidates). */
  const nearDoors = [];
  /** During a fill: the pavement points in the camera's view (null otherwise). */
  let viewPoints = null;

  // Every registered person: pedestrian_* bodies join the crowd as the character artist adds them.
  const bodyChoices = {
    female: bodiesFor(characterIds, 'female').filter((id) => context.assets.get(id)),
    male: bodiesFor(characterIds, 'male').filter((id) => context.assets.get(id)),
  };

  function capacity() {
    const tier = context.quality.tier || {};
    // One draw call a person (merged bodies): three quarters of the tier's people fit the budget.
    return Math.min(64, Math.round((tier.maxPedestrians ?? 80) * 0.75));
  }

  function targetCount() {
    const f = context.focus.position;
    const district = districts[city.districtAt(f.x, f.z)];
    const density = crowdDensityAt(district, context.clock.timeOfDay);
    return Math.min(capacity(), Math.round(capacity() * densityScale * Math.min(1, 0.25 + density)));
  }

  /**
   * Puts a new person on an edge.
   * @param {string|object} archetypeId An archetype id, or a profile of the same shape (a gang member).
   * @param {{tags?: string[], data?: object}} [extra] More entity tags and data (factions).
   */
  function spawn(archetypeId, edgeId, forward, along, mode = 'walk', extra = null) {
    const archetype = typeof archetypeId === 'string' ? archetypes[archetypeId] : archetypeId;
    if (!archetype) return null;
    const look = pickAppearance(archetype.appearance, random);
    const choices = bodyChoices[look.sex] || bodyChoices.male;
    const assetId = choices[Math.floor(random() * choices.length)] || 'dez_tolliver';
    routes.place(edgeId, forward, along, 0, spot);
    const yaw = Math.atan2(-spot.dirX, -spot.dirZ);
    const body = bodies.acquire(assetId, look, yaw);
    const position = new THREE.Vector3(spot.x, city.groundHeightAt(spot.x, spot.z), spot.z);
    const entity = context.entities.add({
      kind: ENTITY_KINDS.CHARACTER, owner: 'pedestrians', position, radius: 0.35, heading: yaw,
      tags: extra && extra.tags ? extra.tags : [ENTITY_TAGS.PEDESTRIAN],
      data: { archetypeId: archetype.id, health: archetype.health || 100, mode, reaction: null, ...(extra && extra.data) },
    });
    const activities = archetype.activities || {};
    const person = {
      id: entity.id, entity, archetype, look, body, edge: edgeId, forward, along,
      lane: 0.25 + random() * 0.55, walkSpeed: (archetype.walkSpeed || 1.3) * (0.9 + random() * 0.2),
      style: activities.jog > 3 ? 'jog' : activities.stroll > 3 ? 'stroll' : 'walk',
      mode, timer: 0, think: random() * 0.3, sourceX: 0, sourceZ: 0, offenderId: null, facing: NaN,
      armed: random() < (archetype.armedChance || 0), dodgeX: 0, dodgeZ: 0, crimeId: null, fall: 0,
      fallDirection: 1, dodgeTimer: 0, input: body.input, waitEdge: -1, waitForward: true, x: spot.x, z: spot.z,
      stance: 'stand', gone: false, carId: null, angry: false, targetX: 0, targetZ: 0,
    };
    entity.data.person = person;
    people.push(person);
    serial += 1;
    return person;
  }

  function despawn(index) {
    const person = people[index];
    bodies.release(person.body);
    context.entities.remove(person.entity);
    people[index] = people[people.length - 1];
    people.pop();
  }

  /** Spawns a person, or a talking pair, at a pavement point chosen out of sight. */
  function spawnNear(allowInView) {
    const f = context.focus.position;
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
      const low = allowInView ? 7 : SPAWN_NEAR, u = random();
      const wantView = allowInView && random() < 0.7;
      if (wantView && !viewPoints) {
        // Once per fill: the pavement points in view within 45 m (the street the camera sees).
        viewPoints = points.filter((q) => {
          const d = Math.hypot(q.x - f.x, q.z - f.z);
          sphere.center.set(q.x, q.y + 1, q.z);
          sphere.radius = 1;
          return d >= low && d < 45 && frustum.intersectsSphere(sphere);
        });
      }
      const pool = wantView && viewPoints.length ? viewPoints : points;
      const wanted = low + ((pool === points ? SPAWN_RADIUS : 45) - low) * u * u;
      let point = null, gap = Infinity;
      for (let k = 0; k < 8; k += 1) {
        const q = pool[Math.floor(random() * pool.length)];
        const off = Math.abs(Math.hypot(q.x - f.x, q.z - f.z) - wanted);
        if (off < gap) { gap = off; point = q; }
      }
      if (!point) continue;
      const d = Math.hypot(point.x - f.x, point.z - f.z);
      if (d < low) continue;
      sphere.center.set(point.x, point.y + 1, point.z);
      sphere.radius = 1;
      if (!allowInView && d < 70 && frustum.intersectsSphere(sphere)) continue;
      if (people.some((p) => Math.abs(p.x - point.x) + Math.abs(p.z - point.z) < 2)) continue;
      const district = districts[city.districtAt(point.x, point.z)];
      const archetypeId = pickWeighted(archetypeMixAt(district, context.clock.timeOfDay, archetypes), random)
        || pickWeighted(archetypeMixAt(districts.centro, 12, archetypes), random);
      const edgeId = point.edge.id;
      const forward = random() < 0.5;
      const along = routes.locate(edgeId, forward, point.x, point.z);
      const archetype = archetypes[archetypeId];
      const chat = archetype && (archetype.activities.stand_chat || 0) / 12;
      const first = spawn(archetypeId, edgeId, forward, along, random() < chat ? 'chat' : 'walk');
      if (first && first.mode === 'chat') {
        first.timer = 20 + random() * 40;
        const second = spawn(pickWeighted(archetypeMixAt(district, context.clock.timeOfDay, archetypes), random) || archetypeId, edgeId, !forward, routes.lengthOf(edgeId) - along - 1.1, 'chat');
        if (second) {
          second.timer = first.timer;
          first.facing = Math.atan2(-(second.x - first.x), -(second.z - first.z));
          second.facing = Math.atan2(-(first.x - second.x), -(first.z - second.z));
        }
      }
      return true;
    }
    return false;
  }

  /**
   * Puts a person at a free spot (off the pavement graph: a shop door, beside a car), joined to
   * the nearest pavement edge so they walk on from there.
   */
  function spawnFree(archetypeId, x, z, mode, extra) {
    const points = city.spawnPointsNear(x, z, 30, 'pedestrian', 80);
    let best = null, bestD = Infinity;
    for (const point of points) { const d = Math.hypot(point.x - x, point.z - z); if (d < bestD) { bestD = d; best = point; } }
    if (!best) return null;
    const forward = random() < 0.5;
    const person = spawn(archetypeId, best.edge.id, forward, routes.locate(best.edge.id, forward, best.x, best.z), mode, extra);
    if (person) { person.x = x; person.z = z; }
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

  function upkeep() {
    const f = context.focus.position;
    for (let i = people.length - 1; i >= 0; i -= 1) {
      const p = people[i];
      if (Math.abs(p.x - f.x) > KEEP_RADIUS || Math.abs(p.z - f.z) > KEEP_RADIUS) despawn(i);
    }
    const target = targetCount();
    const batch = filled ? 2 : target;
    for (let n = 0; n < batch && people.length < target; n += 1) spawnNear(!filled);
    viewPoints = null;
    // Shops near the player let people out now and then (a few over the target is fine).
    if (filled && people.length < target + 4 && random() < 0.3) spawnFromShop();
    filled = true;
  }

  function setStance(p, name) {
    const walker = p.body.walker;
    if (typeof walker.setStance === 'function' && p.stance !== name) { walker.setStance(name); p.stance = name; }
  }

  /** A walker passing a shop door may go in (then leaves the crowd at the door). */
  function maybeEnterShop(p) {
    if (p.style === 'jog' || random() > 0.05) return;
    for (const door of nearDoors) {
      const dx = door.x - p.x, dz = door.z - p.z;
      if (dx * dx + dz * dz > 30) continue;
      p.mode = 'shop';
      p.targetX = door.x + door.ix * 0.5;
      p.targetZ = door.z + door.iz * 0.5;
      p.timer = 12;
      return;
    }
  }

  /** Walks straight to a point; true when there. */
  function walkTo(p, x, z, speed) {
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.45) return true;
    p.input.moveX = (dx / d) * speed * Math.min(1, d + 0.3);
    p.input.moveZ = (dz / d) * speed * Math.min(1, d + 0.3);
    return false;
  }

  /** Makes a person react to a stimulus at x, z. */
  function react(person, stimulus, x, z, offenderId, distance) {
    if (person.mode === 'down' || person.mode === 'dead') return;
    const panicking = person.mode === 'flee' || person.mode === 'cower';
    const reaction = chooseReaction(person.archetype, stimulus, random, { panicking, armed: person.armed, distance });
    person.entity.data.reaction = reaction;
    person.sourceX = x;
    person.sourceZ = z;
    person.offenderId = offenderId ?? null;
    if (person.stance && person.stance !== 'stand' && reaction !== 'cower' && reaction !== 'hands_up') setStance(person, 'stand');
    if (reaction === 'flee' || reaction === 'dive_aside') { person.mode = 'flee'; person.timer = FLEE_SECONDS; }
    else if (reaction === 'cower' || reaction === 'hands_up') {
      person.mode = 'cower';
      person.timer = 6 + random() * 6;
      // Crouched with the hands up, or standing with them raised (the run-time's stances).
      setStance(person, reaction === 'hands_up' ? 'hands_up' : distance < 12 ? 'kneel_hands_up' : 'hands_on_head');
    }
    else if (reaction === 'gawk' || reaction === 'film' || reaction === 'shout') { person.mode = 'gawk'; person.timer = 6 + random() * 6; }
    else if (reaction === 'call_police') { person.mode = 'call'; person.timer = CALL_SECONDS; }
    else if (reaction === 'fight' && offenderId != null) { person.mode = 'fight'; person.timer = 14; }
  }

  /** Stimulates everyone within reach of x, z. */
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
      if (person.mode === 'down' || person.mode === 'dead') continue;
      if (Math.hypot(person.x - x, person.z - z) > 35) continue;
      context.entities.addTag(person.entity, ENTITY_TAGS.WITNESS);
      if (!seen) {
        seen = true;
        context.events.queue(GAME_EVENTS.CRIME_WITNESSED, { crimeId, offenderId, witnessId: person.id, position: { x: person.x, y: 0, z: person.z }, heat: witnessHeat(false) });
      }
      if (random() < (person.archetype.reportsCrimeChance || 0) && person.mode !== 'flee') {
        person.mode = 'call';
        person.timer = CALL_SECONDS;
        person.crimeId = crimeId;
        person.offenderId = offenderId;
      }
    }
  }

  /** Steers a person along their edge; at its end, chooses the next or waits at the kerb. */
  function followRoute(p, dt, speed, fleeing) {
    const length = routes.lengthOf(p.edge);
    routes.place(p.edge, p.forward, p.along, p.lane, spot);
    // Fleeing: run along the pavement away from the trouble, turning round when it lies ahead.
    if (fleeing && (p.x - p.sourceX) * spot.dirX + (p.z - p.sourceZ) * spot.dirZ < -2) {
      p.forward = !p.forward;
      p.along = length - p.along;
      spot.dirX = -spot.dirX;
      spot.dirZ = -spot.dirZ;
    }
    p.along += Math.max(0, p.body.walker.state.speed) * p.body.scale * dt;
    if (p.along >= length - 0.4) {
      const node = routes.endNode(p.edge, p.forward);
      let hx = spot.dirX, hz = spot.dirZ;
      if (fleeing) { fleeDirection(p.x, p.z, p.sourceX, p.sourceZ, hx, hz, away); hx = away.x; hz = away.z; }
      const choice = routes.chooseNextEdge(node, p.edge, hx, hz, random(), fleeing ? 'walk' : p.style, next);
      if (choice && (fleeing || routes.crossingOpen(choice.edge, time))) {
        p.edge = choice.edge;
        p.forward = choice.forward;
        p.along = 0;
        p.mode = fleeing ? 'flee' : 'walk';
      } else if (choice) {
        p.mode = 'wait';
        p.waitEdge = choice.edge;
        p.waitForward = choice.forward;
        p.along = length - 0.4;
      }
    }
    routes.place(p.edge, p.forward, Math.min(p.along + 1.6, length), p.lane, spot);
    const dx = spot.x - p.x, dz = spot.z - p.z, d = Math.hypot(dx, dz) || 1;
    p.input.moveX = (dx / d) * speed;
    p.input.moveZ = (dz / d) * speed;
  }

  /** Pushes a person's wanted move away from others close by and from the player. */
  function avoid(p) {
    let px = 0, pz = 0;
    const count = context.entities.within(p.x, p.z, 1.6, null, nearby).length;
    for (let i = 0; i < count; i += 1) {
      const other = nearby[i];
      if (other === p.entity || other.kind !== ENTITY_KINDS.CHARACTER) continue;
      const dx = p.x - other.position.x, dz = p.z - other.position.z, d = Math.hypot(dx, dz) || 0.01;
      const push = (1.6 - d) * (other.tags && other.tags.has && other.tags.has(ENTITY_TAGS.PLAYER) ? 2.4 : 1.2);
      px += (dx / d) * push;
      pz += (dz / d) * push;
    }
    nearby.length = 0;
    p.input.moveX += px;
    p.input.moveZ += pz;
  }

  /** Looks for cars about to hit a person; knocks them down when one does. */
  function watchCars(p) {
    const count = context.entities.within(p.x, p.z, 16, { kind: ENTITY_KINDS.VEHICLE }, nearby).length;
    for (let i = 0; i < count; i += 1) {
      const car = nearby[i];
      const speed = car.data ? car.data.speed || 0 : 0;
      const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
      const dx = p.x - car.position.x, dz = p.z - car.position.z;
      const ahead = dx * fx + dz * fz, side = dx * -fz + dz * fx;
      const outside = Math.max(Math.abs(ahead) - 2.3, Math.abs(side) - 0.95);
      if (knocksDown(outside, speed) && p.mode !== 'down' && p.mode !== 'dead') {
        p.mode = 'down';
        p.timer = 3.5 + random() * 2;
        p.fall = 0;
        p.fallDirection = ahead * speed > 0 ? 1 : -1;
        context.events.queue(GAME_EVENTS.PEDESTRIAN_KNOCKED_DOWN, { pedestrianId: p.id, causeId: car.id, speed: Math.abs(speed), position: { x: p.x, y: p.entity.position.y, z: p.z } });
        break;
      }
      if (p.mode !== 'down' && p.mode !== 'dead' && carThreat(p.x, p.z, car.position.x, car.position.z, fx, fz, speed, 1.8, threat)) {
        p.dodgeX = -fz * threat.side * 4.5;
        p.dodgeZ = fx * threat.side * 4.5;
        p.dodgeTimer = 0.7;
        if (p.mode === 'wait' || p.mode === 'walk' || p.mode === 'chat') react(p, 'vehicle_near_miss', car.position.x, car.position.z, car.id, 3);
        break;
      }
    }
    nearby.length = 0;
  }

  function steer(p, dt) {
    p.input = p.body.input;
    p.input.facing = NaN;
    p.input.moveX = 0;
    p.input.moveZ = 0;
    p.timer -= dt;
    p.think -= dt;
    const thinking = p.think <= 0;
    if (thinking) { p.think = 0.25; watchCars(p); }
    switch (p.mode) {
      case 'walk':
        followRoute(p, dt, p.style === 'jog' ? 2.8 : p.style === 'stroll' ? p.walkSpeed * 0.8 : p.walkSpeed, false);
        if (thinking && nearDoors.length) maybeEnterShop(p);
        break;
      case 'shop': if (walkTo(p, p.targetX, p.targetZ, p.walkSpeed * 0.85) || p.timer <= 0) p.gone = true; break;
      case 'return': {
        // An angry driver walks back to the driver's door and gets in (leaves the crowd).
        const car = p.carId != null ? context.entities.get(p.carId) : null;
        if (!car || Math.abs(car.position.x - p.x) + Math.abs(car.position.z - p.z) > 16 || p.timer <= 0) { p.mode = 'walk'; p.carId = null; break; }
        if (walkTo(p, car.position.x - Math.cos(car.heading) * 1.3, car.position.z + Math.sin(car.heading) * 1.3, 1.6)) p.gone = true;
        break;
      }
      case 'flee': followRoute(p, dt, RUN_SPEED, true); if (p.timer <= 0) p.mode = 'walk'; break;
      case 'wait':
        routes.place(p.waitEdge, p.waitForward, 1, 0, spot);
        p.input.facing = Math.atan2(-spot.dirX, -spot.dirZ);
        if (thinking && routes.crossingOpen(p.waitEdge, time)) { p.edge = p.waitEdge; p.forward = p.waitForward; p.along = 0; p.mode = 'walk'; }
        break;
      case 'chat': if (p.timer <= 0) p.mode = 'walk'; else p.input.facing = p.facing; break;
      case 'cower': case 'gawk':
        p.input.facing = Math.atan2(-(p.sourceX - p.x), -(p.sourceZ - p.z)) + (p.mode === 'cower' ? Math.PI : 0);
        if (p.timer <= 0) { p.mode = p.mode === 'cower' ? 'flee' : 'walk'; p.timer = FLEE_SECONDS; setStance(p, 'stand'); }
        break;
      case 'call':
        p.input.facing = Math.atan2(-(p.sourceX - p.x), -(p.sourceZ - p.z));
        if (p.timer <= 0) {
          context.events.queue(GAME_EVENTS.CRIME_WITNESSED, { crimeId: p.crimeId || 'reported_disturbance', offenderId: p.offenderId, witnessId: p.id, position: { x: p.x, y: 0, z: p.z }, heat: witnessHeat(true) });
          p.mode = 'flee';
          p.timer = FLEE_SECONDS;
        }
        break;
      case 'fight': {
        const target = p.offenderId != null ? context.entities.get(p.offenderId) : null;
        if (!target || p.timer <= 0) { p.mode = p.carId != null ? 'return' : 'walk'; p.timer = 20; break; }
        const dx = target.position.x - p.x, dz = target.position.z - p.z, d = Math.hypot(dx, dz) || 1;
        if (d > 25) { p.mode = p.carId != null ? 'return' : 'walk'; p.timer = 20; break; }
        // An angry driver strides up and shoves; a crew member or a brawler runs in swinging.
        const approach = p.angry ? 2.3 : RUN_SPEED;
        if (d > 1.1) { p.input.moveX = (dx / d) * approach; p.input.moveZ = (dz / d) * approach; }
        else {
          p.input.facing = Math.atan2(-dx, -dz);
          if (thinking && random() < (p.angry ? 0.12 : 0.3)) context.events.queue(GAME_EVENTS.DAMAGE_DEALT, { targetId: target.id, attackerId: p.id, amount: 4, kind: 'melee', weaponId: 'fists', position: { x: target.position.x, y: target.position.y, z: target.position.z }, fatal: false });
        }
        break;
      }
      case 'down':
        p.fall = Math.min(1, p.fall + dt * 3);
        if (p.timer <= 0 && p.entity.data.health > 0) { p.fall = 0; p.mode = 'flee'; p.timer = FLEE_SECONDS; }
        break;
      case 'dead': p.fall = Math.min(1, p.fall + dt * 3); break;
      default: break;
    }
    if (p.dodgeTimer > 0) { p.dodgeTimer -= dt; p.input.moveX = p.dodgeX; p.input.moveZ = p.dodgeZ; }
    if (p.mode === 'walk' || p.mode === 'flee' || p.mode === 'wait') avoid(p);
    p.entity.data.mode = p.mode;
  }

  return {
    people,
    routes,
    stimulate,
    witness,
    react,
    upkeep,
    spawn,
    spawnFree,
    angryDriver,
    capacity,
    /** Shop doors within reach of the focus. */
    get shopDoors() { return nearDoors; },
    setDensity(scale) { densityScale = Math.max(0, Math.min(2, Number(scale) || 0)); },
    /** Fills the pavements around the focus at the next update, in view too. */
    refill() { filled = false; candidates = null; },
    /**
     * Spawns one person at the pavement point nearest x, z (PEDESTRIAN_SPAWN; factions).
     * @param {string|object} archetypeId An archetype id or a profile of the same shape.
     * @param {string} [mode] 'walk' (default) or 'chat' (standing; timer Infinity stays put).
     * @param {{tags?: string[], data?: object}} [extra]
     * @returns {object|null} The person.
     */
    spawnAt(archetypeId, x, z, mode = 'walk', extra = null) {
      const points = city.spawnPointsNear(x, z, 25, 'pedestrian', 60);
      let best = null, bestD = Infinity;
      for (const point of points) { const d = Math.hypot(point.x - x, point.z - z); if (d < bestD) { bestD = d; best = point; } }
      if (!best) return null;
      const forward = random() < 0.5;
      return spawn(archetypeId, best.edge.id, forward, routes.locate(best.edge.id, forward, best.x, best.z), mode, extra);
    },
    /** Whether a point is in the camera's view (for spawning out of sight). */
    inView(x, y, z) {
      sphere.center.set(x, y + 1, z);
      sphere.radius = 1;
      return frustum.intersectsSphere(sphere);
    },
    /** Takes damage from DAMAGE_DEALT. */
    hurt(person, amount, attackerId, fatal) {
      person.entity.data.health -= amount;
      if (fatal || person.entity.data.health <= 0) {
        person.mode = 'dead';
        person.fall = 0;
        person.entity.data.health = 0;
        context.entities.addTag(person.entity, ENTITY_TAGS.DEAD);
      } else if (person.mode !== 'down') {
        react(person, 'fight_nearby', person.x, person.z, attackerId, 1);
        if (person.mode !== 'fight') { person.mode = 'flee'; person.timer = FLEE_SECONDS; }
      }
    },
    update(dt) {
      time += dt;
      const camera = context.view.camera;
      viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(viewMatrix);
      // A jump of the focus (teleport, respawn, a camera cut) fills the new place at once.
      const f = context.focus.position;
      // The fill waits a few steps so the camera has caught up and the view is the new one.
      if (Math.abs(f.x - lastFocus.x) + Math.abs(f.z - lastFocus.z) > 40) { filled = false; candidates = null; fillAt = time + 0.15; }
      lastFocus.x = f.x;
      lastFocus.z = f.z;
      upkeepTimer -= dt;
      if ((upkeepTimer <= 0 || !filled) && time >= fillAt) { upkeepTimer = 0.5; upkeep(); }
      const cx = camera.position.x, cz = camera.position.z;
      for (let i = 0; i < people.length; i += 1) {
        const p = people[i];
        steer(p, dt);
        if (p.gone) { despawn(i); i -= 1; continue; }
        const state = p.body.walker.state;
        const lying = p.mode === 'down' || p.mode === 'dead';
        if (!lying) { p.x += state.vx * p.body.scale * dt; p.z += state.vz * p.body.scale * dt; }
        const y = city.groundHeightAt(p.x, p.z);
        p.entity.position.set(p.x, y, p.z);
        p.entity.heading = state.yaw;
        const instance = p.body.instance;
        instance.position.set(p.x, y + (lying ? 0.12 * p.fall : 0), p.z);
        instance.rotation.x = lying ? p.fallDirection * (Math.PI / 2) * p.fall * p.fall : 0;
        sphere.center.set(p.x, y + 0.9, p.z);
        sphere.radius = 1.1;
        const distance = Math.hypot(p.x - cx, p.z - cz);
        bodies.animate(p.body, dt, distance, frustum.intersectsSphere(sphere), !lying || p.fall < 0.05);
      }
    },
    dispose() {
      for (let i = people.length - 1; i >= 0; i -= 1) despawn(i);
    },
  };
}
