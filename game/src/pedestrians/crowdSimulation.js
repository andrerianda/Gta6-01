// The crowd around the player: builds the shared crowd state (people, routes, bodies, bench
// seats, guns, pavement obstacles, the camera's view, the lead this frame) and runs it once a
// frame: tops the crowd up (crowdPopulation.js), steers each person by mode (crowdSteering.js),
// moves and poses their bodies, keeps them out of trunks and the lead's space, and seats drivers
// in the traffic cars near the camera (seatedDrivers.js). Reactions to shots, blasts, crimes and
// damage: crowdResponses.js. Positions and moves are in world metres; every person is an entity
// tagged 'pedestrian'. Everyday activities: crowdActivities.js; guns: crowdShooting.js.
import * as THREE from 'three';
import { ENTITY_KINDS, ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { createBenchSeats } from './crowdActivities.js';
import { createCrowdPopulation } from './crowdPopulation.js';
import { createCrowdResponses } from './crowdResponses.js';
import { createCrowdShooting } from './crowdShooting.js';
import { createCrowdSteering, HOLDS_GROUND, STANDING, stepsRound } from './crowdSteering.js';
import { createPedestrianBodies } from './pedestrianBodies.js';
import { createPavementObstacles, keepOutOfObstacles } from './pavementObstacles.js';
import { stepOutOfLeadSpace } from './personalSpace.js';
import { createSeatedDrivers } from './seatedDrivers.js';
import { createWalkingRoutes } from './walkingRoutes.js';

/**
 * Creates the crowd.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {object} city The openWorldCity system.
 */
export function createCrowdSimulation(context, city) {
  // Crossings follow the city's shared signal clock (read through `city` each time: it is
  // published once streaming starts).
  const signals = { walkOpen: (nodeId, phase) => (city.signals ? city.signals.walkOpen(nodeId, phase) : null) };
  const generator = context.random('pedestrians');
  /** The state every part of the crowd works on. */
  const crowd = {
    context,
    city,
    archetypes: context.content.get('pedestrianArchetypes').PEDESTRIAN_ARCHETYPES,
    districts: context.content.get('cityDistricts').CITY_DISTRICTS,
    routes: createWalkingRoutes(city.pedestrianGraph, city.plan ? city.plan.roads.nodes : [], signals),
    bodies: createPedestrianBodies(context, context.view.layers.dynamic),
    benches: createBenchSeats(city),
    shooting: createCrowdShooting(context),
    obstacles: createPavementObstacles(context, city),
    random: () => generator.next(),
    people: [],
    /** Shop doors within reach of the focus (refreshed with the spawn candidates). */
    nearDoors: [],
    /** The camera's view this frame. */
    frustum: new THREE.Frustum(),
    /** Seconds since the crowd started. */
    time: 0,
    /** This frame: the lead's entity, the lead on foot (null in a car), his aim on the ground. */
    player: null, lead: null, aiming: false, aimX: 0, aimZ: -1,
    setStance, setGesture, sitDown, leaveSeat,
    react: null,
  };
  const { people, bodies, benches, shooting } = crowd;
  const responses = createCrowdResponses(crowd);
  crowd.react = responses.react;
  const population = createCrowdPopulation(crowd);
  const steering = createCrowdSteering(crowd);
  const drivers = createSeatedDrivers(crowd, { dressFor: population.dressFor, onHauled: population.adoptDriver });
  const viewMatrix = new THREE.Matrix4(), sphere = new THREE.Sphere();
  const aimDirection = new THREE.Vector3();

  function setStance(p, name, options) {
    const walker = p.body.walker;
    if (typeof walker.setStance === 'function' && p.stance !== name) { walker.setStance(name, options); p.stance = name; }
  }

  /** The run-time's upper-body gesture ('point' follows the trouble each frame in steering). */
  function setGesture(p, name) {
    if (p.gesture === name) return;
    p.gesture = name;
    const walker = p.body.walker;
    if (typeof walker.setGesture === 'function') walker.setGesture(name === 'point' ? null : name);
  }

  function sitDown(p, seat) {
    benches.take(seat, p.id);
    p.seat = seat;
    p.mode = 'sit';
    p.timer = 25 + crowd.random() * 50;
    setStance(p, 'sit_bench', { seatHeight: seat.seatHeight });
  }

  /** Gets up from a bench (or gives up walking to one). */
  function leaveSeat(p) {
    if (!p.seat) return;
    benches.free(p.seat);
    p.seat = null;
    if (p.stance === 'sit_bench') setStance(p, 'stand');
  }

  /** The lead this frame: on foot or not, aiming or not, and where along the ground. */
  function readLead() {
    crowd.player = context.entities.firstWithTag(ENTITY_TAGS.PLAYER) || null;
    const lead = context.systems.find('player');
    crowd.lead = crowd.player && crowd.player.kind === ENTITY_KINDS.CHARACTER && !(lead && lead.vehicle) ? crowd.player : null;
    const combat = crowd.lead ? context.systems.find('combat') : null;
    crowd.aiming = Boolean(combat && combat.aiming);
    if (crowd.aiming) {
      context.view.camera.getWorldDirection(aimDirection);
      const h = Math.hypot(aimDirection.x, aimDirection.z) || 1;
      crowd.aimX = aimDirection.x / h;
      crowd.aimZ = aimDirection.z / h;
    }
  }

  /**
   * Moves a person by their walk, keeps them clear, sets their entity and body and poses it.
   * False when a dismissed person leaves now (unseen).
   */
  function placeBody(p, dt, cx, cz) {
    const walker = p.body.walker, instance = p.body.instance;
    if ((p.mode === 'dragged' && walker.transit && walker.transit.kind) || walker.ragdolling) {
      // The run-time's haul or ragdoll (a rider thrown off a bike) places the body itself: follow it.
      p.x = instance.position.x;
      p.z = instance.position.z;
      p.entity.position.set(p.x, instance.position.y, p.z);
      walker.update(dt, p.input);
      return true;
    }
    const state = walker.state;
    const lying = p.mode === 'down' || p.mode === 'dead';
    if (!lying) { p.x += state.vx * p.body.scale * dt; p.z += state.vz * p.body.scale * dt; }
    // Never inside a trunk, pole or bench, never in the lead's face (a step at a time).
    if (stepsRound(p) || STANDING.has(p.mode)) keepOutOfObstacles(p, p.obstacles);
    if (crowd.lead && !HOLDS_GROUND.has(p.mode) && !p.entity.data.missionGiver && !p.entity.data.missionEnemy) {
      stepOutOfLeadSpace(p, crowd.lead.position.x, crowd.lead.position.z, dt);
    }
    const y = city.groundHeightAt(p.x, p.z);
    p.entity.position.set(p.x, y, p.z);
    p.entity.heading = state.yaw;
    instance.position.set(p.x, y + (lying ? 0.12 * p.fall : 0), p.z);
    instance.rotation.x = lying ? p.fallDirection * (Math.PI / 2) * p.fall * p.fall : 0;
    sphere.center.set(p.x, y + 0.9, p.z);
    sphere.radius = 1.1;
    const distance = Math.hypot(p.x - cx, p.z - cz);
    const onScreen = crowd.frustum.intersectsSphere(sphere);
    // A dismissed person leaves once nobody sees them go.
    if (p.dismissed && (!onScreen || distance > 60)) return false;
    bodies.animate(p.body, dt, distance, onScreen, !lying || p.fall < 0.05);
    return true;
  }

  /**
   * A carjack (VEHICLE_STOLEN jacked): the driver drawn in the seat is already being hauled out
   * (dragged) and joins the crowd; otherwise one is seated now and hauled out at once, or, with
   * no drawn car, lands lying by the door.
   */
  function carjacked({ vehicleId, position, dragged, door, seat }) {
    if (drivers.handOver(vehicleId) || dragged) return;
    const driver = door && seat ? drivers.seatNow(vehicleId) : null;
    if (driver) {
      driver.walker.exitVehicle({ door, seat, dragged: true });
      drivers.handOver(vehicleId);
    } else if (position) population.jackedDriver(vehicleId, position);
  }

  return {
    people,
    routes: crowd.routes,
    stimulate: responses.stimulate,
    witness: responses.witness,
    react: responses.react,
    hurt: responses.hurt,
    upkeep: population.upkeep,
    spawn: population.spawn,
    spawnFree: population.spawnFree,
    spawnAt: population.spawnAt,
    jackedDriver: population.jackedDriver,
    capacity: population.capacity,
    setDensity: population.setDensity,
    refill: population.refill,
    carjacked,
    /** The seated drivers of the traffic cars near the camera (count, stats). */
    drivers,
    /** The driver drawn at the wheel of a traffic car ({walker}) for the player's carjack, or null. */
    seatedDriverOf: (vehicleId) => drivers.seatedDriverOf(vehicleId),
    /** A rammed traffic driver climbs out and squares up to the player (traffic.onAngryDriver). */
    angryDriver(event) {
      if (event && event.vehicleId != null) drivers.vacate(event.vehicleId, 40);
      return population.angryDriver(event);
    },
    /** Shop doors within reach of the focus. */
    get shopDoors() { return crowd.nearDoors; },
    /**
     * Puts one person down exactly at x, z (the nearest free spot: 1.5 m from anyone, 2.5 m from
     * the lead), with or without a pavement route near: mission givers, guards and pursuers.
     * Standing modes ('chat', timer Infinity stays put) and 'fight' need no route; walking
     * joins the nearest pavement within 60 m.
     * @param {string|object} archetypeId An archetype id or a profile of the same shape.
     * @param {number} x
     * @param {number} z
     * @param {{mode?: string, heading?: number, seconds?: number, tags?: string[], data?: object}} [options]
     *   heading: the yaw to face (three.js rotation.y); seconds: how long a 'chat' stands
     *   (default for ever: removePerson or a new mode ends it).
     * @returns {object|null} The person.
     */
    placeAt(archetypeId, x, z, options = {}) {
      const extra = options.tags || options.data ? { tags: options.tags, data: options.data } : null;
      const person = population.placeAt(archetypeId, x, z, options.mode ?? 'chat', extra, options.heading ?? NaN);
      if (person && person.mode === 'chat') person.timer = options.seconds ?? Infinity;
      return person;
    },
    /** Whether a point is in the camera's view (for spawning out of sight). */
    inView(x, y, z) {
      sphere.center.set(x, y + 1, z);
      sphere.radius = 1;
      return crowd.frustum.intersectsSphere(sphere);
    },
    /**
     * Takes one person out of the crowd (missions: enemies and givers they are done with).
     * @param {number|object} idOrPerson The entity id or the person.
     * @param {{whenUnseen?: boolean}} [options] whenUnseen: they walk on and leave once out of
     *   the camera's view (or 60 m off) instead of vanishing now.
     * @returns {boolean} False when no such person is in the crowd.
     */
    removePerson(idOrPerson, options = null) {
      const id = idOrPerson && typeof idOrPerson === 'object' ? idOrPerson.id : idOrPerson;
      for (let i = 0; i < people.length; i += 1) {
        if (people[i].id !== id) continue;
        if (options && options.whenUnseen) {
          const p = people[i];
          p.dismissed = true;
          context.entities.removeTag(p.entity, ENTITY_TAGS.HOSTILE);
          if (p.mode === 'chat' || p.mode === 'fight') p.mode = 'walk';
        } else population.despawn(i);
        return true;
      }
      return false;
    },
    /** The muzzle (or hand) of an armed person, world metres, for shooters that fire themselves. */
    muzzleOf(person, out = { x: 0, y: 0, z: 0 }) { return shooting.muzzleOf(person, out); },
    /** Draws and aims an armed person's weapon at a world point (call each frame). */
    aimWeapon(person, x, y, z) { return shooting.aim(person, x, y, z); },
    /** A crowd shooter's shot was fired (WEAPON_FIRED): the gun kicks. */
    recoil(shooterId) {
      const target = context.entities.get(shooterId);
      const person = target && target.owner === 'pedestrians' ? target.data.person : null;
      if (person && person.gun) person.body.walker.play('fire');
    },
    update(dt) {
      crowd.time += dt;
      readLead();
      const camera = context.view.camera;
      viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      crowd.frustum.setFromProjectionMatrix(viewMatrix);
      population.tick(dt);
      const cx = camera.position.x, cz = camera.position.z;
      for (let i = 0; i < people.length; i += 1) {
        const p = people[i];
        steering.steer(p, dt);
        if (p.gone) {
          // An angry driver back at the wheel: the seat may be drawn again.
          if (p.mode === 'return' && p.carId != null) drivers.vacate(p.carId, 0);
          population.despawn(i);
          i -= 1;
          continue;
        }
        if (!placeBody(p, dt, cx, cz)) { population.despawn(i); i -= 1; }
      }
      drivers.update(dt);
    },
    dispose() {
      drivers.dispose();
      for (let i = people.length - 1; i >= 0; i -= 1) population.despawn(i);
    },
  };
}
