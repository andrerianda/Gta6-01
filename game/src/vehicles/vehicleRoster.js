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
import { Motorcycle } from '../physics/vehicles/Motorcycle.js';
import { isTwoWheeler, planVehicleSpawn, vehicleModelIdOf, vehicleRadiusOf, wheelPlacementsOf } from './vehicleSpawning.js';
import {
  charVehicleRig, createVehicleRig, dropVehicleBumper, paintVehicleRig, poseVehicleRig, repairVehicleRig, setVehicleRigLook,
  showVehicleCrash, showVehicleLevel,
} from './vehicleModelRig.js';
import {
  createVehicleDoors, createVehicleLamps, doorSideOf, poseVehicleDoors, releaseVehicleLights, setVehicleLamp, sirenBitsOf,
  headlampBeamScale, updateVehicleLamps,
} from './vehicleLightsAndDoors.js';
import { VEHICLE_LEVEL, chooseVehicleLevel } from './vehicleLevelOfDetail.js';
import { CONTACT_SHADOW_DISTANCE, contactShadowFootprint, createVehicleContactShadows } from './vehicleContactShadows.js';
import { settleMergedVehicleLevels } from './vehicleMergedLevels.js';
import { INSTANCE_LAMP_FLAGS, createVehicleInstanceBatches } from './vehicleInstancedLevels.js';
import { nearModeOf, setNearMerged, setNearMergedLook, settleNearStill } from './vehicleNearMerge.js';
import {
  BUMPER_STRENGTH, BURN_RATE, DAMAGE_STAGE, bumperHitBy, damageStageOf, dentDepthOf, impactDamage,
} from './vehicleDamage.js';
import { resolveWreckOptions, stageVehicleWreck } from './vehicleWreckStaging.js';
import { clearParkedSpawn } from './vehicleSpawnClearance.js';
import { updateVehicleNightReflections } from './vehicleNightReflections.js';
import {
  boardCraft, craftKindOf, createCraftBody, createCraftParts, driveCraft, holdCraft, leaveCraft, liftCraftRoot, poseCraftRig,
} from './vehicleCraft.js';

/** Seconds between fire bursts sent to the effects system by a burning wreck. */
const WRECK_FIRE_INTERVAL = 0.4;
const NO_GLASS = Object.freeze({ cracked: 0, shattered: 0 });
/**
 * Seconds after a spawn in which collisions do no damage: a car placed against a kerb, a post or
 * another car is pushed out by the physics, and that push must not dent it or start it smoking
 * (player's report: smoke around a freshly spawned parked coupe).
 */
const SPAWN_SETTLE_SECONDS = 1.2;

const pose = { x: 0, y: 0, z: 0, w: 1 };
const local = new THREE.Vector3();
const inverse = new THREE.Matrix4();
const lampWish = { head: false, brake: false, reverse: false, hazard: false, near: false, important: false, groundY: 0, length: 4, dt: 0, beam: 1 };
const ahead = new THREE.Vector3();

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
  const batches = createVehicleInstanceBatches(context.view.layers.dynamic);
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
    // Boats and helicopters are the physics library's Boat / Helicopter (vehicleCraft.js).
    const craftKind = craftKindOf(entry);
    const plan = planVehicleSpawn(entry, request, random);
    // A parked car never starts inside a post, wall, prop or another car (it jittered and smoked).
    if (!craftKind && plan.parked && request.clearance !== false && clearParkedSpawn(physics.world, entry, plan) === 'nudged') {
      log.debug?.(`vehicles: parked ${entry.id} nudged clear to (${plan.position.x.toFixed(2)}, ${plan.position.z.toFixed(2)})`);
    }
    const modelId = vehicleModelIdOf(entry, context.assets);
    const loaded = modelId ? context.assets.get(modelId) : null;
    const wheels = wheelPlacementsOf(entry, loaded?.extras ?? null);
    const rig = createVehicleRig(context.assets, entry, plan.colour, wheels);
    const position = new THREE.Vector3(plan.position.x, 0, plan.position.z);
    const tags = plan.parked ? [ENTITY_TAGS.PARKED] : [];
    if (craftKind) tags.push(craftKind); // 'boat' (effects draw its wake and spray) or 'helicopter'
    const entity = context.entities.add({
      kind: ENTITY_KINDS.VEHICLE, owner: 'vehicles', position, heading: -plan.heading, radius: vehicleRadiusOf(entry), tags,
      data: { modelId: entry.id, health: plan.maxHealth, maxHealth: plan.maxHealth, speed: 0, driverId: null, controls: createVehicleControls(), colour: plan.colour, stage: 0 },
    });
    let car;
    if (craftKind) car = createCraftBody(physics.world, entry, plan, entity.id);
    else {
      const Body = isTwoWheeler(entry) ? Motorcycle : Vehicle;
      car = new Body(physics.world, tuningOf(entry, wheels), {
        x: plan.position.x, y: plan.position.y ?? undefined, z: plan.position.z, heading: plan.heading, userRef: entity.id,
      });
    }
    const record = {
      id: entity.id, entity, entry, car, rig, lamps: createVehicleLamps(rig), doors: createVehicleDoors(rig), footprint: footprintOf(entry),
      controls: entity.data.controls, seats: plan.seats,
      bumperDamage: { front: 0, rear: 0 }, stage: DAMAGE_STAGE.INTACT, wrecked: false, effectTimer: 0, important: false, level: VEHICLE_LEVEL.NEAR,
      burnLeft: 0, fireScale: 1, settleLeft: SPAWN_SETTLE_SECONDS, stilled: false,
      spawnY: plan.position.y ?? undefined, standUps: 0,
      /** Boats and helicopters: their moving parts and input (vehicleCraft.js); null for road vehicles. */
      craft: craftKind ? createCraftParts(rig, entry) : null,
    };
    car.body.interpolatedPose(1, position, pose);
    rig.root.position.copy(position);
    rig.root.quaternion.set(pose.x, pose.y, pose.z, pose.w);
    if (record.craft) liftCraftRoot(record.craft, rig.root);
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
    record.rig.root.updateWorldMatrix(true, false);
    record.rig.root.localToWorld(local);
    out.x = local.x;
    out.y = local.y;
    out.z = local.z;
    return out;
  }

  function sendEffect(effectId, record, scale = 1, at = null) {
    if (!context.commands.has(GAME_COMMANDS.EFFECT_SPAWN)) return;
    const p = record.entity.position;
    const fromBay = effectId === 'engine_smoke' || effectId === 'vehicle_fire' || effectId === 'wreck_fire';
    const position = at ?? (fromBay ? anchorOf(record.id, 'engine_bay') : { x: p.x, y: p.y + 1, z: p.z });
    // The car's own paint (not the char) for the body panels an explosion or a crash throws.
    context.commands.send(GAME_COMMANDS.EFFECT_SPAWN, { effectId, position, scale, colour: record.entity.data.colour });
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

  /** VEHICLE_DAMAGED with the damage stage before and after, and the glass this hit broke. */
  function reportDamage(record, amount, cause, attackerId, position, previousStage, glass) {
    context.events.queue(GAME_EVENTS.VEHICLE_DAMAGED, {
      vehicleId: record.id, amount, health: record.entity.data.health, cause, attackerId, position: position ?? where(record),
      stage: record.stage, previousStage, glass: glass.shattered > 0 ? 'shattered' : glass.cracked > 0 ? 'cracked' : null,
      windowsCracked: glass.cracked, windowsShattered: glass.shattered,
    });
  }

  function damage(vehicleId, amount, cause = 'impact', attackerId = null, position = null, glass = NO_GLASS) {
    const record = byId.get(vehicleId);
    if (!record || record.wrecked || !(amount > 0)) return;
    const data = record.entity.data;
    data.health = Math.max(0, data.health - amount);
    const previousStage = record.stage;
    const stage = damageStageOf(data.health, data.maxHealth);
    record.stage = data.stage = stage;
    reportDamage(record, amount, cause, attackerId, position, previousStage, glass);
    if (stage !== previousStage && stage === DAMAGE_STAGE.WRECKED) wreck(record, cause, attackerId);
  }

  /** A wreck staged for a scene (vehicleWreckStaging.js): no explosion, burning if asked. */
  function stageWreck(vehicleId, options) {
    const record = byId.get(vehicleId);
    if (!record) return null;
    const o = resolveWreckOptions(options);
    const data = record.entity.data;
    const shown = stageVehicleWreck(record.rig, record.doors, record.entry, data.colour, o);
    const previousStage = record.stage;
    const amount = data.health;
    record.wrecked = true;
    record.important = true; // stays at the near level, where dents, glass and doors show
    data.health = 0;
    record.stage = data.stage = DAMAGE_STAGE.WRECKED;
    releaseVehicleControls(record.controls);
    context.entities.addTag(record.entity, ENTITY_TAGS.DEAD);
    context.entities.removeTag(record.entity, ENTITY_TAGS.PARKED);
    record.lamps.lit.lamp_head = null;
    record.burnLeft = o.burning ? o.burnSeconds : 0;
    record.fireScale = o.fire;
    record.effectTimer = 0;
    if (shown.bumper) {
      const nose = anchorOf(vehicleId, 'engine_bay');
      if (nose) sendEffect('vehicle_debris', record, 1, { x: nose.x, y: nose.y - 0.3, z: nose.z });
    }
    reportDamage(record, amount, 'staged', null, null, previousStage, shown);
    return { stage: record.stage, burning: record.burnLeft > 0, paint: shown.paint, windowsCracked: shown.cracked, windowsShattered: shown.shattered, bumper: shown.bumper };
  }

  /** Puts out a burning wreck (staged or not); false when it was not burning. */
  function extinguish(vehicleId) {
    const record = byId.get(vehicleId);
    if (!record || !(record.burnLeft > 0)) return false;
    record.burnLeft = 0;
    return true;
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
    if (!record || record.wrecked || record.settleLeft > 0) return;
    const amount = impactDamage(payload.energy, record.entry.mass, payload.ground ? 0.5 : 1);
    if (amount <= 0) return;
    // A riderless bike tipping over onto the road is not a crash: no dents, it stays merged.
    if (payload.ground && record.car.fallen && !record.car.riderSeated && amount < record.entity.data.maxHealth * 0.1) return;
    const normal = payload.normal;
    const glass = showVehicleCrash(record.rig, payload.position, { x: -normal.x, y: -normal.y, z: -normal.z }, amount, dentDepthOf(amount));
    inverse.copy(record.rig.root.matrixWorld).invert();
    local.set(payload.position.x, payload.position.y, payload.position.z).applyMatrix4(inverse);
    const which = bumperHitBy(local.z, record.entry.dimensions.length);
    if (which) {
      record.bumperDamage[which] += amount;
      if (record.bumperDamage[which] > BUMPER_STRENGTH && dropVehicleBumper(record.rig, which)) sendEffect('vehicle_debris', record);
    }
    damage(record.id, amount, 'collision', payload.otherId ?? null, payload.position, glass);
  }

  function repair(vehicleId) {
    const record = byId.get(vehicleId);
    if (!record) return;
    const data = record.entity.data;
    data.health = data.maxHealth;
    data.stage = record.stage = DAMAGE_STAGE.INTACT;
    record.wrecked = false;
    record.important = record.entity.data.driverId !== null && record.important;
    record.burnLeft = 0;
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
      // A two-wheeler is held up by its rider (off its stand, or picked up if it had fallen).
      record.car.mount?.();
      if (record.craft) boardCraft(record.craft, record.car);
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
      record.car.dismount?.();
      if (record.craft) leaveCraft(record.craft, record.car);
    }
    if (record.seats.every((each) => each.occupantId === null)) context.entities.addTag(record.entity, ENTITY_TAGS.PARKED);
    context.events.queue(GAME_EVENTS.VEHICLE_EXITED, {
      vehicleId, modelId: record.entry.id, occupantId, isPlayer: Boolean(options.isPlayer), bailedOut: Boolean(options.bailedOut),
    });
    return true;
  }

  /** Stands a fallen, riderless bike back on its stand where it lies (spawn settling only). */
  function standBikeUp(record) {
    const car = record.car;
    const p = record.entity.position;
    record.standUps += 1;
    car.placeAt(p.x, record.spawnY, p.z, car.heading);
    car.fallen = false;
    car.body.canSleep = false;
    car.speed = 0;
    car.wheelSlip.fill(0);
    record.settleLeft = Math.max(record.settleLeft, 0.6);
    log.debug?.(`vehicles: parked ${record.entry.id} stood back on its stand`);
  }

  function fixedUpdate(dt) {
    for (let i = 0; i < list.length; i += 1) {
      const record = list[i];
      const car = record.car;
      if (record.settleLeft > 0) {
        record.settleLeft -= dt;
        // A riderless bike knocked over while it settles (pushed out of a kerb, a post or a
        // neighbour, or dropped onto the road) goes back on its stand where it lies, at most twice.
        if (car.fallen && !car.riderSeated && !record.wrecked && record.standUps < 2) standBikeUp(record);
      }
      if (record.wrecked) {
        if (record.craft) holdCraft(record.craft, car);
        else {
          car.input.drive = 0;
          car.input.steer = 0;
          car.input.handbrake = 1;
        }
        if (record.burnLeft > 0) {
          record.burnLeft -= dt;
          record.effectTimer -= dt;
          if (record.effectTimer <= 0) {
            record.effectTimer = WRECK_FIRE_INTERVAL;
            sendEffect('wreck_fire', record, record.fireScale);
          }
        }
      } else {
        if (record.craft) driveCraft(record.craft, record.controls, car, record.entity.data.driverId !== null);
        else resolveDriveInput(record.controls, car.speed, car.input, dt);
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
      // Vehicle.beforeStep leaves `speed` and `wheelSlip` at their last values while the body
      // sleeps (traffic saw a parked coupe report 6-11 m/s standing still; the driving effects
      // read the slip as tyre smoke). A sleeping car is not moving: zero them once as it falls
      // asleep. Physics may take this into Vehicle.beforeStep; then this does nothing.
      if (car.body.asleep) {
        if (!record.stilled) {
          record.stilled = true;
          car.speed = 0;
          car.wheelSlip?.fill(0);
        }
      } else record.stilled = false;
      entity.data.speed = car.speed;
    }
  }

  /** Metres from a near car's nose to the nearest near vehicle in its lane ahead (Infinity: none). */
  function gapAhead(record) {
    const root = record.rig.root;
    ahead.set(0, 0, -1).applyQuaternion(root.quaternion);
    let best = Infinity;
    for (let i = 0; i < list.length; i += 1) {
      const other = list[i];
      if (other === record || other.level !== VEHICLE_LEVEL.NEAR) continue;
      const dx = other.rig.root.position.x - root.position.x;
      const dz = other.rig.root.position.z - root.position.z;
      const along = dx * ahead.x + dz * ahead.z;
      if (along <= 0 || along > 20 || Math.abs(dx * ahead.z - dz * ahead.x) > 2.2) continue;
      const gap = along - (record.entry.dimensions.length + other.entry.dimensions.length) / 2;
      if (gap < best) best = gap;
    }
    return best;
  }

  function update(dt, alpha) {
    const camera = context.view.camera.position;
    const tier = context.quality?.tier ?? {};
    const nightFactor = context.atmosphere?.state?.nightFactor ?? 0;
    const night = nightFactor > 0.35;
    updateVehicleNightReflections(nightFactor);
    shadows.begin();
    batches.begin(context.view.camera);
    for (let i = 0; i < list.length; i += 1) {
      const record = list[i];
      const { car, rig, controls } = record;
      const root = rig.root;
      car.body.interpolatedPose(alpha, root.position, pose);
      root.quaternion.set(pose.x, pose.y, pose.z, pose.w);
      const craft = record.craft;
      if (craft) liftCraftRoot(craft, root);
      const distance = root.position.distanceTo(camera);
      // A helicopter stays at the near level: its merged levels bake the rotor blur as a solid plate.
      const keepNear = record.important || craft?.kind === 'helicopter';
      record.level = chooseVehicleLevel(distance, record.level, tier.lodBias ?? 1, tier.drawDistance ?? Infinity, keepNear);
      root.visible = record.level !== VEHICLE_LEVEL.HIDDEN;
      // Only the root's own matrix here: the scene updates the drawn parts (and skips hidden ones,
      // a hidden car whole: vehicleMatrixUpdates.js); sirens, seats and lamps read the root.
      root.updateWorldMatrix(false, false);
      if (!root.visible) {
        releaseVehicleLights(record.lamps, context.atmosphere);
        continue;
      }
      showVehicleLevel(rig, record.level);
      if (craft) {
        // Boats and helicopters draw their parts near (rotors, outboards and propellers move).
        if (record.level === VEHICLE_LEVEL.NEAR) {
          setNearMerged(rig, nearModeOf(true, record.doors, false));
          poseCraftRig(craft, car, dt);
          poseVehicleDoors(record.doors, dt);
        }
      } else {
        if (record.level === VEHICLE_LEVEL.NEAR) {
          // A handful of draws unless it is the player's (full quality) or damaged (dents show).
          // A riderless bike on its stand may stay awake (physics lets only a fallen bike sleep), so
          // standing still is enough for the one-piece STILL mode.
          const still = car.body.asleep || (car.riderSeated === false && !car.fallen && Math.abs(car.speed) < 0.05);
          setNearMerged(rig, nearModeOf(record.important || rig.damaged, record.doors, still));
          poseVehicleRig(rig, car);
          poseVehicleDoors(record.doors, dt);
        }
        const ground = settleMergedVehicleLevels(rig, car);
        if (record.level === VEHICLE_LEVEL.NEAR) settleNearStill(rig, ground);
        if (distance < CONTACT_SHADOW_DISTANCE) shadows.add(root, record.footprint, ground);
      }
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
      lampWish.beam = lampWish.head && lampWish.near ? headlampBeamScale(gapAhead(record)) : 1;
      updateVehicleLamps(record.lamps, context.atmosphere, lampWish);
      // rig.paintColour, not data.colour: a charred or scorched wreck stays black at a distance.
      if (record.level === VEHICLE_LEVEL.NEAR) setNearMergedLook(rig, rig.paintColour, record.lamps);
      else if (rig.mid) {
        // The hidden merged level carries the pose the batch copies: refresh it (the scene skips it).
        const carrier = record.level === VEHICLE_LEVEL.FAR ? rig.far : rig.mid;
        carrier.updateWorldMatrix(false, false);
        batches.add(carrier, record.level, rig.asset, rig.paintColour, instanceFlagsOf(record.lamps));
      } else setVehicleRigLook(rig, rig.paintColour, lampWish.head, sirenBitsOf(record.lamps));
    }
    shadows.end();
    batches.end();
  }

  function instanceFlagsOf(lamps) {
    const lit = lamps.lit;
    return (lit.lamp_head || lit.lamp_tail ? INSTANCE_LAMP_FLAGS.lamps : 0) | (lit.lamp_siren_a ? INSTANCE_LAMP_FLAGS.sirenA : 0)
      | (lit.lamp_siren_b ? INSTANCE_LAMP_FLAGS.sirenB : 0) | (lit.lamp_brake ? INSTANCE_LAMP_FLAGS.brake : 0);
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
    stageWreck,
    extinguish,
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
      batches.dispose();
    },
  };
}
