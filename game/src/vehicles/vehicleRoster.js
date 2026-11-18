// The live vehicles of the fleet: spawning a catalog model as a physics vehicle with its model,
// lamps and entity; removing it; seats, entering and leaving; applying each driver's controls
// before the physics steps; drawing every vehicle where the physics put it (interpolated), at
// its level of detail; and the road from a crash to a wreck (health, dents, windows, bumpers,
// smoke, fire, explosion). vehicleFleet.js is the system around it.
import * as THREE from 'three';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { ENTITY_KINDS, ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { Vehicle } from '../physics/vehicles/Vehicle.js';
import { deriveVehicleTuning } from '../physics/vehicles/vehicleTuning.js';
import { brakeLampsLit, createVehicleControls, releaseVehicleControls, resolveDriveInput } from './vehicleControls.js';
import { planVehicleSpawn, vehicleRadiusOf, wheelPlacementsOf } from './vehicleSpawning.js';
import {
  charVehicleRig, createVehicleRig, dropVehicleBumper, paintVehicleRig, poseVehicleRig, repairVehicleRig, setVehicleRigLook,
  showVehicleCrash, showVehicleLevel,
} from './vehicleModelRig.js';
import {
  createVehicleDoors, createVehicleLamps, doorSideOf, poseVehicleDoors, releaseVehicleLights, setVehicleLamp, sirenBitsOf,
  updateVehicleLamps,
} from './vehicleLightsAndDoors.js';
import { VEHICLE_LEVEL, chooseVehicleLevel } from './vehicleLevelOfDetail.js';
import { CONTACT_SHADOW_DISTANCE, contactShadowFootprint, createVehicleContactShadows } from './vehicleContactShadows.js';
import {
  BUMPER_STRENGTH, BURN_RATE, DAMAGE_STAGE, bumperHitBy, damageStageOf, dentDepthOf, impactDamage,
} from './vehicleDamage.js';

const UNDRIVABLE = new Set(['boat', 'helicopter']);
const pose = { x: 0, y: 0, z: 0, w: 1 };
const local = new THREE.Vector3();
const inverse = new THREE.Matrix4();
const lampWish = { head: false, brake: false, reverse: false, hazard: false, near: false, important: false, groundY: 0, length: 4, dt: 0 };

/**
 * Creates the roster.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {object} The roster (see vehicleFleet.js for the members it backs).
 */
export function createVehicleRoster(context) {
  const physics = context.systems.get('physics');
  const catalog = context.content.get('vehicleCatalog').VEHICLE_CATALOG;
  const random = context.random('vehicles');
  const log = context.log.child('vehicles');
  const tunings = new Map();
  /** @type {Map<number, object>} */
  const byId = new Map();
  const list = [];
  const enterFilter = { kind: ENTITY_KINDS.VEHICLE, accept: (entity) => entity.owner === 'vehicles' && entity.data.health > 0 };
  const shadows = createVehicleContactShadows(context.view.layers.dynamic, 128);
  const footprints = new Map();

  function footprintOf(entry) {
    if (!footprints.has(entry.id)) footprints.set(entry.id, contactShadowFootprint(entry));
    return footprints.get(entry.id);
  }

  function tuningOf(entry, wheels) {
    if (!tunings.has(entry.id)) tunings.set(entry.id, deriveVehicleTuning(entry, wheels));
    return tunings.get(entry.id);
  }

  function spawn(request) {
    const entry = catalog[request.modelId];
    if (!entry) throw new Error(`vehicles: no catalog model "${request.modelId}"`);
    if (UNDRIVABLE.has(entry.class)) {
      log.warn(`vehicles: ${entry.id} (${entry.class}) needs boat or helicopter physics, not written yet`);
      return null;
    }
    const plan = planVehicleSpawn(entry, request, random);
    const loaded = context.assets?.has?.(entry.id) ? context.assets.get(entry.id) : null;
    const wheels = wheelPlacementsOf(entry, loaded?.extras ?? null);
    const rig = createVehicleRig(context.assets, entry, plan.colour, wheels);
    const position = new THREE.Vector3(plan.position.x, 0, plan.position.z);
    const entity = context.entities.add({
      kind: ENTITY_KINDS.VEHICLE, owner: 'vehicles', position, heading: -plan.heading, radius: vehicleRadiusOf(entry),
      tags: plan.parked ? [ENTITY_TAGS.PARKED] : [],
      data: { modelId: entry.id, health: plan.maxHealth, maxHealth: plan.maxHealth, speed: 0, driverId: null, controls: createVehicleControls(), colour: plan.colour, stage: 0 },
    });
    const car = new Vehicle(physics.world, tuningOf(entry, wheels), {
      x: plan.position.x, y: plan.position.y ?? undefined, z: plan.position.z, heading: plan.heading, userRef: entity.id,
    });
    const record = {
      id: entity.id, entity, entry, car, rig, lamps: createVehicleLamps(rig), doors: createVehicleDoors(rig), footprint: footprintOf(entry),
      controls: entity.data.controls, seats: plan.seats,
      bumperDamage: { front: 0, rear: 0 }, stage: DAMAGE_STAGE.INTACT, wrecked: false, effectTimer: 0, important: false, level: VEHICLE_LEVEL.NEAR,
    };
    car.body.interpolatedPose(1, position, pose);
    rig.root.position.copy(position);
    rig.root.quaternion.set(pose.x, pose.y, pose.z, pose.w);
    context.view.layers.dynamic.add(rig.root);
    byId.set(entity.id, record);
    list.push(record);
    context.events.queue(GAME_EVENTS.VEHICLE_SPAWNED, {
      vehicleId: entity.id, modelId: entry.id, position: { x: position.x, y: position.y, z: position.z }, ownerSystem: request.ownerSystem ?? 'vehicles',
    });
    return entity.id;
  }

  function remove(vehicleId) {
    const record = byId.get(vehicleId);
    if (!record) return false;
    releaseVehicleLights(record.lamps, context.atmosphere);
    record.car.dispose();
    record.rig.root.removeFromParent();
    for (const dentable of record.rig.dentables) if (dentable.original) dentable.mesh.geometry.dispose();
    context.entities.remove(record.entity);
    byId.delete(vehicleId);
    list.splice(list.indexOf(record), 1);
    context.events.queue(GAME_EVENTS.VEHICLE_REMOVED, { vehicleId, modelId: record.entry.id });
    return true;
  }

  function where(record) {
    const p = record.entity.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  /** A model-space anchor of a vehicle in world space (engine_bay, anchor_siren, ...). */
  function anchorOf(vehicleId, name, out = { x: 0, y: 0, z: 0 }) {
    const record = byId.get(vehicleId);
    const anchor = record?.rig.anchors[name] ?? record?.rig.anchors[`anchor_${name}`];
    if (!anchor) return null;
    local.copy(anchor);
    record.rig.root.updateMatrixWorld();
    record.rig.root.localToWorld(local);
    out.x = local.x;
    out.y = local.y;
    out.z = local.z;
    return out;
  }

  function sendEffect(effectId, record, scale = 1) {
    if (!context.commands.has(GAME_COMMANDS.EFFECT_SPAWN)) return;
    const p = record.entity.position;
    const fromBay = effectId === 'engine_smoke' || effectId === 'vehicle_fire';
    const position = fromBay ? anchorOf(record.id, 'engine_bay') : { x: p.x, y: p.y + 1, z: p.z };
    context.commands.send(GAME_COMMANDS.EFFECT_SPAWN, { effectId, position, scale });
  }

  function setDoorOpen(vehicleId, side, amount) {
    const door = byId.get(vehicleId)?.doors[doorSideOf(side)];
    if (!door) return false;
    door.target = Math.max(0, Math.min(1, Number(amount) || 0));
    return true;
  }

  function repaint(vehicleId, colour) {
    const record = byId.get(vehicleId);
    if (!record || record.wrecked) return false;
    record.entity.data.colour = colour;
    paintVehicleRig(record.rig, colour);
    return true;
  }

  function setLamp(vehicleId, group, on) {
    const record = byId.get(vehicleId);
    if (!record) return false;
    return setVehicleLamp(record.lamps, group.startsWith('lamp_') ? group : `lamp_${group}`, Boolean(on));
  }

  function damage(vehicleId, amount, cause = 'impact', attackerId = null, position = null) {
    const record = byId.get(vehicleId);
    if (!record || record.wrecked || !(amount > 0)) return;
    const data = record.entity.data;
    data.health = Math.max(0, data.health - amount);
    context.events.queue(GAME_EVENTS.VEHICLE_DAMAGED, {
      vehicleId, amount, health: data.health, cause, attackerId, position: position ?? where(record),
    });
    const stage = damageStageOf(data.health, data.maxHealth);
    if (stage !== record.stage) {
      record.stage = stage;
      data.stage = stage;
      if (stage === DAMAGE_STAGE.WRECKED) wreck(record, cause, attackerId);
    }
  }

  function wreck(record, cause, attackerId) {
    record.wrecked = true;
    record.entity.data.health = 0;
    releaseVehicleControls(record.controls);
    context.entities.addTag(record.entity, ENTITY_TAGS.DEAD);
    charVehicleRig(record.rig);
    record.lamps.lit.lamp_head = null;
    const position = where(record);
    physics.explode({ position: { x: position.x, y: position.y + 0.4, z: position.z }, radius: 9, power: 13000, causeId: record.id });
    sendEffect('vehicle_explosion', record, 1.5);
    context.events.queue(GAME_EVENTS.VEHICLE_DESTROYED, { vehicleId: record.id, modelId: record.entry.id, cause, attackerId, position });
  }

  function crash(payload) {
    const record = byId.get(payload.vehicleId);
    if (!record || record.wrecked) return;
    const amount = impactDamage(payload.energy, record.entry.mass, payload.ground ? 0.5 : 1);
    if (amount <= 0) return;
    const normal = payload.normal;
    showVehicleCrash(record.rig, payload.position, { x: -normal.x, y: -normal.y, z: -normal.z }, amount, dentDepthOf(amount));
    inverse.copy(record.rig.root.matrixWorld).invert();
    local.set(payload.position.x, payload.position.y, payload.position.z).applyMatrix4(inverse);
    const which = bumperHitBy(local.z, record.entry.dimensions.length);
    if (which) {
      record.bumperDamage[which] += amount;
      if (record.bumperDamage[which] > BUMPER_STRENGTH && dropVehicleBumper(record.rig, which)) sendEffect('vehicle_debris', record);
    }
    damage(record.id, amount, 'collision', payload.otherId ?? null, payload.position);
  }

  function repair(vehicleId) {
    const record = byId.get(vehicleId);
    if (!record) return;
    const data = record.entity.data;
    data.health = data.maxHealth;
    data.stage = record.stage = DAMAGE_STAGE.INTACT;
    record.wrecked = false;
    record.bumperDamage.front = record.bumperDamage.rear = 0;
    context.entities.removeTag(record.entity, ENTITY_TAGS.DEAD);
    repairVehicleRig(record.rig, data.colour);
  }

  function enter(vehicleId, occupantId, options = {}) {
    const record = byId.get(vehicleId);
    if (!record) return false;
    const seat = record.seats.find((each) => each.name === (options.seat ?? 'driver'));
    if (!seat || (seat.occupantId !== null && seat.occupantId !== occupantId)) return false;
    seat.occupantId = occupantId;
    if (seat.name === 'driver') {
      record.entity.data.driverId = occupantId;
      record.controls.autoReverse = Boolean(options.isPlayer);
      record.important = Boolean(options.isPlayer);
    }
    context.entities.removeTag(record.entity, ENTITY_TAGS.PARKED);
    context.events.queue(GAME_EVENTS.VEHICLE_ENTERED, {
      vehicleId, modelId: record.entry.id, occupantId, seat: seat.name, isPlayer: Boolean(options.isPlayer),
    });
    return true;
  }

  function exit(vehicleId, occupantId, options = {}) {
    const record = byId.get(vehicleId);
    if (!record) return false;
    const seat = record.seats.find((each) => each.occupantId === occupantId);
    if (!seat) return false;
    seat.occupantId = null;
    if (seat.name === 'driver') {
      record.entity.data.driverId = null;
      releaseVehicleControls(record.controls);
      record.important = false;
    }
    if (record.seats.every((each) => each.occupantId === null)) context.entities.addTag(record.entity, ENTITY_TAGS.PARKED);
    context.events.queue(GAME_EVENTS.VEHICLE_EXITED, {
      vehicleId, modelId: record.entry.id, occupantId, isPlayer: Boolean(options.isPlayer), bailedOut: Boolean(options.bailedOut),
    });
    return true;
  }

  function fixedUpdate(dt) {
    for (let i = 0; i < list.length; i += 1) {
      const record = list[i];
      const car = record.car;
      if (record.wrecked) {
        car.input.drive = 0;
        car.input.steer = 0;
        car.input.handbrake = 1;
      } else {
        resolveDriveInput(record.controls, car.speed, car.input, dt);
        if (record.stage === DAMAGE_STAGE.BURNING) damage(record.id, BURN_RATE * record.entity.data.maxHealth * dt, 'fire');
        if (record.stage >= DAMAGE_STAGE.SMOKING) {
          record.effectTimer -= dt;
          if (record.effectTimer <= 0) {
            record.effectTimer = 0.4;
            sendEffect(record.stage === DAMAGE_STAGE.BURNING ? 'vehicle_fire' : 'engine_smoke', record);
          }
        }
      }
      const entity = record.entity;
      car.body.interpolatedPose(1, entity.position, pose);
      entity.heading = -car.heading;
      entity.data.speed = car.speed;
    }
  }

  function update(dt, alpha) {
    const camera = context.view.camera.position;
    const tier = context.quality?.tier ?? {};
    const night = (context.atmosphere?.state?.nightFactor ?? 0) > 0.35;
    shadows.begin();
    for (let i = 0; i < list.length; i += 1) {
      const record = list[i];
      const { car, rig, controls } = record;
      const root = rig.root;
      car.body.interpolatedPose(alpha, root.position, pose);
      root.quaternion.set(pose.x, pose.y, pose.z, pose.w);
      const distance = root.position.distanceTo(camera);
      record.level = chooseVehicleLevel(distance, record.level, tier.lodBias ?? 1, tier.drawDistance ?? Infinity, record.important);
      root.visible = record.level !== VEHICLE_LEVEL.HIDDEN;
      if (!root.visible) {
        releaseVehicleLights(record.lamps, context.atmosphere);
        continue;
      }
      showVehicleLevel(rig, record.level);
      if (record.level === VEHICLE_LEVEL.NEAR) {
        poseVehicleRig(rig, car);
        poseVehicleDoors(record.doors, dt);
      }
      root.updateMatrixWorld();
      if (distance < CONTACT_SHADOW_DISTANCE) shadows.add(root, record.footprint);
      const driven = !record.wrecked && (record.entity.data.driverId !== null || controls.throttle > 0 || controls.brake > 0 || controls.steer !== 0);
      lampWish.head = !record.wrecked && (controls.headlights ?? (night && driven));
      lampWish.brake = driven && brakeLampsLit(car.input, car.speed, controls);
      lampWish.reverse = driven && car.gear === -1 && car.speed < -0.3;
      lampWish.hazard = !record.wrecked && record.stage >= DAMAGE_STAGE.SMOKING;
      lampWish.near = record.level === VEHICLE_LEVEL.NEAR;
      lampWish.important = record.important;
      lampWish.groundY = root.position.y;
      lampWish.length = record.entry.dimensions.length;
      lampWish.dt = dt;
      updateVehicleLamps(record.lamps, context.atmosphere, lampWish);
      if (record.level !== VEHICLE_LEVEL.NEAR) setVehicleRigLook(rig, record.entity.data.colour, lampWish.head, sirenBitsOf(record.lamps));
    }
    shadows.end();
  }

  function onExplosion(blast) {
    for (let i = 0; i < list.length; i += 1) {
      const record = list[i];
      if (record.wrecked || blast.causeId === record.id) continue;
      const p = record.entity.position;
      const distance = Math.hypot(p.x - blast.position.x, p.y - blast.position.y, p.z - blast.position.z);
      const radius = blast.radius ?? 8;
      if (distance < radius) damage(record.id, (1 - distance / radius) * record.entity.data.maxHealth * 0.75, 'explosion', blast.causeId ?? null);
    }
  }

  return {
    list,
    spawn,
    remove,
    damage,
    repair,
    enter,
    exit,
    crash,
    onExplosion,
    fixedUpdate,
    update,
    setDoorOpen,
    repaint,
    setLamp,
    anchorOf,
    get: (vehicleId) => byId.get(vehicleId) ?? null,
    controlsOf: (vehicleId) => byId.get(vehicleId)?.controls ?? null,
    seatsOf: (vehicleId) => byId.get(vehicleId)?.seats ?? [],
    nearestEnterable: (x, z, maxDistance = 6) => context.entities.nearest(x, z, maxDistance, enterFilter),
    removeAll() {
      for (let i = list.length - 1; i >= 0; i -= 1) remove(list[i].id);
    },
    dispose() {
      for (let i = list.length - 1; i >= 0; i -= 1) remove(list[i].id);
      shadows.dispose();
    },
  };
}
