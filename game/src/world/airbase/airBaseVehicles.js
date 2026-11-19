// The vehicles of Base Aérea Punta Garza, all real fleet vehicles: a Manta Sombra and a Garza
// Negra parked on their stands (they appear when the lead is within sight and are put back when
// gone, like the trainer at Los Pantanos), a patrol jeep that drives the patrol loop inside the
// fence, and two army trucks across the runway while the alarm is up.
//
//   const vehicles = createAirBaseVehicles(context, layout);
//   vehicles.update(dt);  vehicles.setAlarm(true);  vehicles.parked  // [{stand, model, vehicleId}]

/** Metres from the base's centre: vehicles are put out inside `appear`, cleared beyond `clear`. */
const RANGE = Object.freeze({ appear: 1500, clear: 1900, strayed: 60, jeepAppear: 900, jeepClear: 1200 });
const PATROL = Object.freeze({ speed: 7, reach: 9 });
/** Road vehicles of the kit, and what drives in their place until their models are registered. */
const STAND_INS = Object.freeze({ patrol_jeep: 'offroad_4x4', army_truck: 'box_truck' });

/**
 * Keeps the base's vehicles.
 * @param {import('../../core/systems/gameContext.js').GameContext} context
 * @param {import('./airBaseLayout.js').AirBaseLayout} layout
 */
export function createAirBaseVehicles(context, layout) {
  const parked = layout.stands.filter((stand) => stand.model && stand.model !== 'halcon').map((stand) => ({ stand, model: stand.model, vehicleId: null }));
  const trucks = layout.roadBlock.map((spot) => ({ spot, vehicleId: null }));
  const jeep = { vehicleId: null, target: 0, modelId: null };
  const loading = new Map();
  let wait = 0;
  let alarm = false;
  const fleet = () => {
    const found = context.systems.find('vehicles');
    return found && typeof found.spawn === 'function' && typeof found.get === 'function' ? found : null;
  };
  const catalog = () => context.content?.get?.('vehicleCatalog')?.VEHICLE_CATALOG ?? null;

  // Whether a model is in memory (or has none: the fleet's stand-in body); starts loading it once.
  const modelReady = (id) => {
    const assets = context.assets;
    if (!assets || typeof assets.has !== 'function' || assets.has(id)) return true;
    if (!assets.registry || !assets.registry[id]) return true;
    if (!loading.has(id)) {
      loading.set(id, false);
      Promise.resolve(assets.load([id])).catch(() => {}).then(() => loading.set(id, true));
    }
    return loading.get(id) === true;
  };
  // The kit's own vehicle when its row and model exist, else the civilian stand-in.
  const roadModel = (id) => (catalog()?.[id] && context.assets?.registry?.[id] ? id : STAND_INS[id]);
  const alive = (vehicles, id) => (id === null ? null : vehicles.get(id) ?? null);

  function keepParked(vehicles, focus, away) {
    for (const slot of parked) {
      const record = alive(vehicles, slot.vehicleId);
      if (record) {
        const p = record.entity.position;
        const lost = record.wrecked || Math.hypot(p.x - slot.stand.x, p.z - slot.stand.z) > RANGE.strayed;
        const empty = record.entity.data.driverId === null;
        if (away > RANGE.clear && empty && !lost) {
          vehicles.remove(slot.vehicleId);
          slot.vehicleId = null;
        } else if (lost && empty && away > RANGE.clear) {
          if (Math.hypot(p.x - focus.x, p.z - focus.z) > RANGE.clear) vehicles.remove(slot.vehicleId);
          slot.vehicleId = null;
        }
        continue;
      }
      slot.vehicleId = null;
      if (away > RANGE.appear || !catalog()?.[slot.model] || !modelReady(slot.model)) continue;
      slot.vehicleId = vehicles.spawn({ modelId: slot.model, position: { x: slot.stand.x, z: slot.stand.z }, heading: slot.stand.heading, parked: true, clearance: false, ownerSystem: 'airBase' }) ?? null;
    }
  }

  function keepJeep(vehicles, away) {
    const record = alive(vehicles, jeep.vehicleId);
    if (record) {
      if (away > RANGE.jeepClear && record.entity.data.driverId === null) {
        vehicles.remove(jeep.vehicleId);
        jeep.vehicleId = null;
      }
      return;
    }
    jeep.vehicleId = null;
    if (away > RANGE.jeepAppear) return;
    const modelId = roadModel('patrol_jeep');
    if (!catalog()?.[modelId] || !modelReady(modelId)) return;
    const route = layout.patrolRoute;
    const start = route[0];
    const next = route[1];
    jeep.target = 1;
    jeep.modelId = modelId;
    jeep.vehicleId = vehicles.spawn({ modelId, position: { x: start.x, z: start.z }, heading: Math.atan2(next.x - start.x, -(next.z - start.z)), parked: false, ownerSystem: 'airBase' }) ?? null;
  }

  function keepRoadBlock(vehicles, away) {
    for (const truck of trucks) {
      const record = alive(vehicles, truck.vehicleId);
      if (record && (!alarm || away > RANGE.clear) && record.entity.data.driverId === null) {
        vehicles.remove(truck.vehicleId);
        truck.vehicleId = null;
      }
      if (record || !alarm || away > RANGE.appear) continue;
      const modelId = roadModel('army_truck');
      if (!catalog()?.[modelId] || !modelReady(modelId)) continue;
      truck.vehicleId = vehicles.spawn({ modelId, position: { x: truck.spot.x, z: truck.spot.z }, heading: truck.spot.heading, parked: true, clearance: false, ownerSystem: 'airBase' }) ?? null;
    }
  }

  // Steers the jeep at its next route point (the pursuit rule of the police cars, gently).
  function drivePatrol(vehicles) {
    const record = alive(vehicles, jeep.vehicleId);
    if (!record || record.wrecked || record.entity.data.driverId !== null) return;
    const controls = vehicles.controlsOf(jeep.vehicleId);
    if (!controls) return;
    const route = layout.patrolRoute;
    const p = record.entity.position;
    let aim = route[jeep.target];
    if (Math.hypot(aim.x - p.x, aim.z - p.z) < PATROL.reach) {
      jeep.target = (jeep.target + 1) % route.length;
      aim = route[jeep.target];
    }
    let angle = Math.atan2(-(aim.x - p.x), -(aim.z - p.z)) - (record.entity.heading ?? 0);
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    const speed = Math.abs(record.entity.data.speed ?? 0);
    const wanted = Math.abs(angle) > 0.5 ? PATROL.speed * 0.5 : PATROL.speed;
    controls.steer = Math.max(-1, Math.min(1, -angle * 1.8));
    controls.reverse = false;
    controls.handbrake = 0;
    controls.throttle = speed < wanted ? 0.5 : 0;
    controls.brake = speed > wanted + 2.5 ? 0.4 : 0;
  }

  return {
    /** The parked aircraft: [{stand, model, vehicleId}] (vehicleId null while not out). */
    parked,
    /** The patrol jeep: {vehicleId, target, modelId}. */
    jeep,
    /** The road block's trucks: [{spot, vehicleId}]. */
    trucks,
    setAlarm(on) {
      alarm = Boolean(on);
      wait = 0;
    },
    /** Every frame: drives the jeep; once a second puts vehicles out or clears them away. */
    update(dt) {
      const vehicles = fleet();
      if (!vehicles) return;
      drivePatrol(vehicles);
      wait -= dt;
      if (wait > 0) return;
      wait = 1;
      const focus = context.focus?.position;
      if (!focus || context.launch?.shot) return;
      const away = Math.hypot(focus.x - layout.centre.x, focus.z - layout.centre.z);
      keepParked(vehicles, focus, away);
      keepJeep(vehicles, away);
      keepRoadBlock(vehicles, away);
    },
    dispose() {
      const vehicles = fleet();
      if (!vehicles) return;
      for (const id of [...parked.map((slot) => slot.vehicleId), jeep.vehicleId, ...trucks.map((truck) => truck.vehicleId)]) {
        if (id !== null && vehicles.get(id)) vehicles.remove(id);
      }
    },
  };
}
