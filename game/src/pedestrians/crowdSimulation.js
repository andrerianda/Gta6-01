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
const KEEP_RADIUS = 105, SPAWN_RADIUS = 85, SPAWN_NEAR = 38;
const RUN_SPEED = 5.2;

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
  const random = context.random('pedestrians');
  const people = [];
  const frustum = new THREE.Frustum(), viewMatrix = new THREE.Matrix4(), sphere = new THREE.Sphere();
  const spot = { x: 0, z: 0, dirX: 0, dirZ: -1, length: 0 };
  const away = { x: 0, z: 0 };
  const threat = { seconds: 0, side: 1, lateral: 0 };
  const next = { edge: -1, forward: true };
  const nearby = [];
  let densityScale = 1, upkeepTimer = 0, filled = false, time = 0, serial = 0;

  // Every registered person: pedestrian_* bodies join the crowd as the character artist adds them.
  const bodyChoices = {
    female: bodiesFor(characterIds, 'female').filter((id) => context.assets.get(id)),
    male: bodiesFor(characterIds, 'male').filter((id) => context.assets.get(id)),
  };

  function capacity() {
    const tier = context.quality.tier || {};
    return Math.min(60, Math.round((tier.maxPedestrians ?? 80) / 2));
  }

  function targetCount() {
    const f = context.focus.position;
    const district = districts[city.districtAt(f.x, f.z)];
    const density = crowdDensityAt(district, context.clock.timeOfDay);
    return Math.round(capacity() * densityScale * Math.min(1, 0.25 + density));
  }

  /** Puts a new person on an edge. */
  function spawn(archetypeId, edgeId, forward, along, mode = 'walk') {
    const archetype = archetypes[archetypeId];
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
      tags: [ENTITY_TAGS.PEDESTRIAN],
      data: { archetypeId, health: 100, mode, reaction: null },
    });
    const activities = archetype.activities || {};
    const person = {
      id: entity.id, entity, archetype, look, body, edge: edgeId, forward, along,
      lane: 0.25 + random() * 0.55, walkSpeed: (archetype.walkSpeed || 1.3) * (0.9 + random() * 0.2),
      style: activities.jog > 3 ? 'jog' : activities.stroll > 3 ? 'stroll' : 'walk',
      mode, timer: 0, think: random() * 0.3, sourceX: 0, sourceZ: 0, offenderId: null, facing: NaN,
      armed: random() < (archetype.armedChance || 0), dodgeX: 0, dodgeZ: 0, crimeId: null, fall: 0,
      fallDirection: 1, dodgeTimer: 0, input: body.input, waitEdge: -1, waitForward: true, x: spot.x, z: spot.z,
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
    const points = city.spawnPointsNear(f.x, f.z, SPAWN_RADIUS, 'pedestrian', 200);
    if (!points.length) return false;
    for (let tries = 0; tries < 6; tries += 1) {
      const point = points[Math.floor(random() * points.length)];
      const d = Math.hypot(point.x - f.x, point.z - f.z);
      if (d < (allowInView ? 7 : SPAWN_NEAR)) continue;
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

  function upkeep() {
    const f = context.focus.position;
    for (let i = people.length - 1; i >= 0; i -= 1) {
      const p = people[i];
      if (Math.abs(p.x - f.x) > KEEP_RADIUS || Math.abs(p.z - f.z) > KEEP_RADIUS) despawn(i);
    }
    const target = targetCount();
    const batch = filled ? 2 : target;
    for (let n = 0; n < batch && people.length < target; n += 1) spawnNear(!filled);
    filled = true;
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
    if (reaction === 'flee' || reaction === 'dive_aside') { person.mode = 'flee'; person.timer = FLEE_SECONDS; }
    else if (reaction === 'cower' || reaction === 'hands_up') { person.mode = 'cower'; person.timer = 6 + random() * 6; }
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
      case 'walk': followRoute(p, dt, p.style === 'jog' ? 2.8 : p.style === 'stroll' ? p.walkSpeed * 0.8 : p.walkSpeed, false); break;
      case 'flee': followRoute(p, dt, RUN_SPEED, true); if (p.timer <= 0) p.mode = 'walk'; break;
      case 'wait':
        routes.place(p.waitEdge, p.waitForward, 1, 0, spot);
        p.input.facing = Math.atan2(-spot.dirX, -spot.dirZ);
        if (thinking && routes.crossingOpen(p.waitEdge, time)) { p.edge = p.waitEdge; p.forward = p.waitForward; p.along = 0; p.mode = 'walk'; }
        break;
      case 'chat': if (p.timer <= 0) p.mode = 'walk'; else p.input.facing = p.facing; break;
      case 'cower': case 'gawk':
        p.input.facing = Math.atan2(-(p.sourceX - p.x), -(p.sourceZ - p.z)) + (p.mode === 'cower' ? Math.PI : 0);
        if (p.timer <= 0) { p.mode = p.mode === 'cower' ? 'flee' : 'walk'; p.timer = FLEE_SECONDS; }
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
        if (!target || p.timer <= 0) { p.mode = 'walk'; break; }
        const dx = target.position.x - p.x, dz = target.position.z - p.z, d = Math.hypot(dx, dz) || 1;
        if (d > 25) { p.mode = 'walk'; break; }
        if (d > 1.1) { p.input.moveX = (dx / d) * RUN_SPEED; p.input.moveZ = (dz / d) * RUN_SPEED; }
        else {
          p.input.facing = Math.atan2(-dx, -dz);
          if (thinking && random() < 0.3) context.events.queue(GAME_EVENTS.DAMAGE_DEALT, { targetId: target.id, attackerId: p.id, amount: 4, kind: 'melee', weaponId: 'fists', position: { x: target.position.x, y: target.position.y, z: target.position.z }, fatal: false });
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
    capacity,
    setDensity(scale) { densityScale = Math.max(0, Math.min(2, Number(scale) || 0)); },
    /** Fills the pavements around the focus at the next update, in view too. */
    refill() { filled = false; },
    /** Spawns one person of an archetype at a point (PEDESTRIAN_SPAWN). */
    spawnAt(archetypeId, x, z) {
      const points = city.spawnPointsNear(x, z, 25, 'pedestrian', 60);
      let best = null, bestD = Infinity;
      for (const point of points) { const d = Math.hypot(point.x - x, point.z - z); if (d < bestD) { bestD = d; best = point; } }
      if (!best) return null;
      const person = spawn(archetypeId, best.edge.id, true, routes.locate(best.edge.id, true, best.x, best.z));
      return person ? person.id : null;
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
      upkeepTimer -= dt;
      if (upkeepTimer <= 0 || !filled) { upkeepTimer = 0.5; upkeep(); }
      const cx = camera.position.x, cz = camera.position.z;
      for (let i = 0; i < people.length; i += 1) {
        const p = people[i];
        steer(p, dt);
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
