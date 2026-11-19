// Roadblocks from three stars (WANTED_LEVELS[stars].roadblocks): two police cars parked nose to
// nose across the road ahead of the lead, light bars flashing, at most one at a time, a new one
// no sooner than WANTED_RULES.pursuit.roadblockSpacing metres of driving after the last. The
// lead can ram through (the cars are ordinary physics vehicles) or turn off. A roadblock left far
// behind, or one standing when the stars fall under three, is removed. The cars are tagged police
// so the minimap shows them and their crews count as eyes on the lead.
import { ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { modelForUnit } from './policeUnitKinds.js';
import { createSirenLights, releaseSirenLights, updateSirenLights } from './sirenLights.js';

const AHEAD = 150;
const SIGHT = 60;

/**
 * Creates the roadblocks.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @returns {{fixedUpdate: Function, update: Function, sees: Function, clear: Function, list: Array<object>}}
 */
export function createRoadblocks(context) {
  const fleet = context.systems.find('vehicles');
  const city = context.systems.find('openWorldCity');
  const spacing = context.content.get('wantedLevels').WANTED_RULES.pursuit.roadblockSpacing;
  const list = [];
  let travelled = spacing;
  let lastX = null;
  let lastZ = 0;

  function place(lead) {
    if (!fleet || !city || lead.speed < 6) return;
    const fx = lead.vx / lead.speed;
    const fz = lead.vz / lead.speed;
    const points = city.spawnPointsNear(lead.x + fx * AHEAD, lead.z + fz * AHEAD, 35, 'vehicle', 32);
    const spot = points.find((point) => {
      const dot = (point.x - lead.x) * fx + (point.z - lead.z) * fz;
      return dot > AHEAD * 0.6 && Math.abs(Math.cos(point.heading) * fz + Math.sin(point.heading) * fx) > 0.5;
    }) ?? points[0];
    if (!spot) return;
    const modelId = modelForUnit('patrol_car', (id) => Boolean(context.assets?.has?.(id)));
    // Across the lane: the cars face the road's side, one each way, overlapping in the middle.
    const across = spot.heading + Math.PI / 2;
    const sx = -Math.sin(across);
    const sz = -Math.cos(across);
    const cars = [];
    for (const side of [-1, 1]) {
      const x = spot.x + sx * 2.4 * side;
      const z = spot.z + sz * 2.4 * side;
      const yaw = across + (side > 0 ? 0.25 : Math.PI - 0.25);
      const vehicleId = fleet.spawn({ modelId, position: { x, y: city.groundHeightAt(x, z), z }, heading: -yaw, parked: true, ownerSystem: 'policeDispatch' });
      const record = vehicleId === null || vehicleId === undefined ? null : fleet.get(vehicleId);
      if (!record) continue;
      context.entities.addTag(record.entity, ENTITY_TAGS.POLICE);
      record.controls.handbrake = 1;
      cars.push({ vehicleId, entity: record.entity, siren: createSirenLights(record.rig, side > 0 ? 0.5 : 0) });
    }
    if (cars.length) list.push({ x: spot.x, z: spot.z, cars });
    travelled = 0;
  }

  function remove(block) {
    list.splice(list.indexOf(block), 1);
    for (const car of block.cars) {
      releaseSirenLights(car.siren, context.atmosphere);
      if (fleet?.get(car.vehicleId) && !car.entity.tags.has(ENTITY_TAGS.PLAYER)) fleet.remove(car.vehicleId);
    }
  }

  return {
    list,

    fixedUpdate(dt, level, quota, lead) {
      if (lastX !== null) travelled += Math.hypot(lead.x - lastX, lead.z - lastZ);
      lastX = lead.x;
      lastZ = lead.z;
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const block = list[i];
        if (!quota?.roadblocks || Math.hypot(block.x - lead.x, block.z - lead.z) > 260) remove(block);
      }
      if (quota?.roadblocks && list.length === 0 && travelled >= spacing && lead.inVehicle) place(lead);
    },

    update(dt) {
      const camera = context.view.camera.position;
      for (const block of list) {
        const near = Math.hypot(block.x - camera.x, block.z - camera.z);
        for (const car of block.cars) {
          const stolen = car.entity.tags.has(ENTITY_TAGS.PLAYER);
          updateSirenLights(car.siren, dt, !stolen, context.atmosphere, near);
        }
      }
    },

    sees(lead) {
      for (const block of list) if (Math.hypot(block.x - lead.x, block.z - lead.z) < SIGHT) return true;
      return false;
    },

    clear() {
      for (let i = list.length - 1; i >= 0; i -= 1) remove(list[i]);
      travelled = spacing;
    },
  };
}
