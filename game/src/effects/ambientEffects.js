// Ambient effects of a coast city, round the camera only: surf breaking along the beaches,
// spray thrown up at the seawalls and rocks and round the pier's piles, steam out of a few
// manholes in Centro, the port and Barrio Hierro, and the wake and bow spray of moving boats:
// any vehicle entity tagged 'boat' (at the fleet's anchors wake / spray_l / spray_r), and any
// boat model handed over with the command 'effects/boat' {object, speed?} (the skyline picture's
// speedboat; its anchor_wake / anchor_spray_l / _r are used, its speed measured when not given;
// {object, remove: true} lets it go). The emitters come from the city plan once
// (findAmbientEmitters, pure: Node tests it), filed in a 64 m grid; every quarter second the
// nearest few within range of the camera are chosen, and each fires on its own interval.
// No allocation per frame.
import * as THREE from 'three';
import { layOutSectorWear } from '../world/props/streetWearLayout.js';

/** The kinds of emitter: the recipe, its mean interval (s), spacing along a shore (m), whether it
 * sits on the water, and how far out to sea from the shore line it stands (m). */
export const AMBIENT_KINDS = Object.freeze([
  Object.freeze({ name: 'surf', effectId: 'surf', every: 1.4, spacing: 16, water: true, seaward: 2.5 }),
  Object.freeze({ name: 'spray', effectId: 'sea_spray', every: 2.4, spacing: 14, water: true, seaward: 0.6 }),
  Object.freeze({ name: 'pier', effectId: 'sea_spray', every: 3, spacing: 12, water: true, seaward: 0 }),
  Object.freeze({ name: 'steam', effectId: 'steam_vent', every: 0.5, spacing: 0, water: false, seaward: 0 }),
]);
export const AMBIENT_RULES = Object.freeze({ range: 110, cell: 64, maxActive: 12, reselect: 0.25, steamEvery: 3, maxSteam: 60, boatRange: 260 });
const SHORE_EMITTER = Object.freeze({ beach: 0, seawall: 1, rocky: 1 });
const STEAM_DISTRICTS = new Set(['centro', 'barrio_hierro', 'puerto_tamarindo']);
const cellKey = (ix, iz) => (ix + 1024) * 4096 + (iz + 1024);

/**
 * Finds every ambient emitter of the city once.
 * @param {object} plan The city plan (coast.landRings with shoreKinds, specialAreas, roads, shoreDistanceAt).
 * @returns {{count: number, kind: Uint8Array, x: Float32Array, z: Float32Array, dx: Float32Array, dz: Float32Array, cells: Map<number, number[]>}}
 *   dx, dz: the unit direction out to sea (steam: 0).
 */
export function findAmbientEmitters(plan) {
  const kinds = []; const xs = []; const zs = []; const dxs = []; const dzs = [];
  const add = (kind, x, z, dx, dz) => { kinds.push(kind); xs.push(x); zs.push(z); dxs.push(dx); dzs.push(dz); };
  const shoreAt = (x, z) => (typeof plan?.shoreDistanceAt === 'function' ? plan.shoreDistanceAt(x, z) : 0);
  const names = plan?.coast?.shoreKinds ?? [];
  for (const land of plan?.coast?.landRings ?? []) {
    const ring = land.ring; const n = ring.length / 2;
    // metres along the shore to the next emitter, carried from one edge to the next
    let toNext = 0;
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const type = SHORE_EMITTER[names[land.kinds[i]]?.name];
      const ax = ring[i * 2]; const az = ring[i * 2 + 1];
      const ex = ring[j * 2] - ax; const ez = ring[j * 2 + 1] - az;
      const length = Math.hypot(ex, ez);
      if (type === undefined || !(length > 0)) { toNext = 0; continue; }
      // the normal that points out to sea (the shore distance falls that way)
      let nx = ez / length; let nz = -ex / length;
      const mx = ax + ex / 2; const mz = az + ez / 2;
      if (shoreAt(mx + nx * 4, mz + nz * 4) > shoreAt(mx - nx * 4, mz - nz * 4)) { nx = -nx; nz = -nz; }
      const { spacing, seaward } = AMBIENT_KINDS[type];
      let s = toNext;
      for (; s <= length; s += spacing) add(type, ax + (ex * s) / length + nx * seaward, az + (ez * s) / length + nz * seaward, nx, nz);
      toNext = s - length;
    }
  }
  // round the pier's piles, both sides, where it stands over open water
  for (const area of plan?.specialAreas ?? []) {
    if (area.kind !== 'pier' || !area.line || area.line.length < 4) continue;
    const [x0, z0, x1, z1] = area.line;
    const length = Math.hypot(x1 - x0, z1 - z0);
    const fx = (x1 - x0) / length; const fz = (z1 - z0) / length;
    const half = (area.width ?? 6) / 2 + 0.3;
    for (let at = 6; at < length; at += AMBIENT_KINDS[2].spacing) {
      const x = x0 + fx * at; const z = z0 + fz * at;
      if (shoreAt(x, z) > -6) continue;
      add(2, x - fz * half, z + fx * half, -fz, fx);
      add(2, x + fz * half, z - fx * half, fz, -fx);
    }
  }
  // steam out of every few manholes the street wear lays in the busy districts
  try {
    const segments = (plan?.roads?.segments ?? []).filter((segment) => STEAM_DISTRICTS.has(segment.district));
    let seen = 0; let steam = 0;
    for (const item of layOutSectorWear({ segments })) {
      if (item.object !== 'manhole_round') continue;
      seen += 1;
      if (seen % AMBIENT_RULES.steamEvery !== 1 || steam >= AMBIENT_RULES.maxSteam) continue;
      add(3, item.x, item.z, 0, 0);
      steam += 1;
    }
  } catch { /* no wear layout: no steam */ }
  const cells = new Map();
  const cell = AMBIENT_RULES.cell;
  for (let i = 0; i < kinds.length; i += 1) {
    const key = cellKey(Math.floor(xs[i] / cell), Math.floor(zs[i] / cell));
    let list = cells.get(key);
    if (!list) cells.set(key, (list = []));
    list.push(i);
  }
  return {
    count: kinds.length, kind: Uint8Array.from(kinds), x: Float32Array.from(xs), z: Float32Array.from(zs),
    dx: Float32Array.from(dxs), dz: Float32Array.from(dzs), cells,
  };
}

/**
 * The nearest emitters within `range` of (x, z), nearest first, written into `out`.
 * @returns {number} How many were written (at most out.length).
 */
export function nearestEmitters(emitters, x, z, range, out, distances) {
  const cell = AMBIENT_RULES.cell;
  const reach = Math.ceil(range / cell);
  const cx = Math.floor(x / cell); const cz = Math.floor(z / cell);
  let count = 0;
  for (let ix = cx - reach; ix <= cx + reach; ix += 1) {
    for (let iz = cz - reach; iz <= cz + reach; iz += 1) {
      const list = emitters.cells.get(cellKey(ix, iz));
      if (!list) continue;
      for (const i of list) {
        const d = Math.hypot(emitters.x[i] - x, emitters.z[i] - z);
        if (d > range || (count === out.length && d >= distances[count - 1])) continue;
        // insertion into the short sorted list
        let k = count < out.length ? count++ : count - 1;
        while (k > 0 && distances[k - 1] > d) { out[k] = out[k - 1]; distances[k] = distances[k - 1]; k -= 1; }
        out[k] = i; distances[k] = d;
      }
    }
  }
  return count;
}

/**
 * Creates the ambient effects.
 * @param {object} context The game context (systems, entities, commands, view, atmosphere).
 * @param {{spawn: Function}} director The effects director.
 * @param {(x: number, z: number) => number} groundHeightAt Ground height.
 * @param {() => number} random 0..1.
 */
export function createAmbientEffects(context, director, groundHeightAt, random) {
  let emitters = null; let lookFor = 0; let reselect = 0; let active = 0;
  let timers = null;
  const chosen = new Int32Array(AMBIENT_RULES.maxActive);
  const distances = new Float32Array(AMBIENT_RULES.maxActive);
  const request = { effectId: '', position: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 }, scale: 1 };
  const waterAt = (x, z) => context.atmosphere?.getWaveHeight?.(x, z) ?? 0;
  const at = new THREE.Vector3();
  /** Boats: commanded models and entities tagged 'boat'. */
  const boats = [];
  const stop = context.commands?.handle?.('effects/boat', (payload) => {
    const object = payload?.object;
    if (!object) return false;
    const i = boats.findIndex((boat) => boat.object === object);
    if (payload.remove) { if (i >= 0) boats.splice(i, 1); return true; }
    const boat = i >= 0 ? boats[i] : newBoat(object, null);
    boat.given = Number.isFinite(payload.speed) ? payload.speed : null;
    if (i < 0) boats.push(boat);
    return true;
  });

  function newBoat(object, entity) {
    const find = (name) => object?.getObjectByName?.(name) ?? null;
    return { object, entity, given: null, speed: 0, lastX: NaN, lastZ: NaN, vx: 0, vz: 0, wake: 0, spray: 0, anchors: object ? [find('anchor_wake'), find('anchor_spray_l'), find('anchor_spray_r')] : null };
  }

  function send(effectId, x, y, z, dx, dy, dz, scale) {
    request.effectId = effectId;
    request.position.x = x; request.position.y = y; request.position.z = z;
    request.direction.x = dx; request.direction.y = dy; request.direction.z = dz;
    request.scale = scale;
    director.spawn(request);
  }

  function fire(i) {
    const type = AMBIENT_KINDS[emitters.kind[i]];
    const x = emitters.x[i]; const z = emitters.z[i];
    const y = type.water ? waterAt(x, z) : groundHeightAt(x, z) + 0.03;
    // surf runs up the sand (toward the land); spray and steam go up
    if (emitters.kind[i] === 0) send(type.effectId, x, y, z, -emitters.dx[i], 0.15, -emitters.dz[i], 0.8 + random() * 0.5);
    else send(type.effectId, x, y, z, emitters.dx[i] * 0.3, 1, emitters.dz[i] * 0.3, 0.7 + random() * 0.5);
  }

  /** Where a boat's anchor is (the object's, else the fleet's, else estimated), into `at`. */
  function anchorAt(boat, k, side) {
    const node = boat.anchors?.[k];
    if (node) return node.getWorldPosition(at);
    const entity = boat.entity;
    const fleet = context.systems?.find?.('vehicles');
    if (entity && fleet?.anchorOf?.(entity.id, k === 0 ? 'wake' : k === 1 ? 'spray_l' : 'spray_r', at)) return at;
    const p = entity ? entity.position : boat.object.position;
    const fx = boat.speed > 0 ? boat.vx / boat.speed : 0; const fz = boat.speed > 0 ? boat.vz / boat.speed : -1;
    const ahead = k === 0 ? -4.4 : 3; const lateral = k === 0 ? 0 : side * 1.1;
    return at.set(p.x + fx * ahead - fz * lateral, waterAt(p.x, p.z), p.z + fz * ahead + fx * lateral);
  }

  function updateBoats(dt, eyeX, eyeZ) {
    const vehicles = context.entities?.ofKind?.('vehicle');
    if (vehicles && lookFor <= 0) {
      for (const entity of vehicles) if (entity.tags?.has('boat') && !boats.some((b) => b.entity === entity)) boats.push(newBoat(null, entity));
      for (let i = boats.length - 1; i >= 0; i -= 1) if (boats[i].entity && !boats[i].entity.alive) boats.splice(i, 1);
    }
    for (const boat of boats) {
      const p = boat.entity ? boat.entity.position : boat.object.getWorldPosition(at);
      const px = p.x; const pz = p.z;
      if (Number.isFinite(boat.lastX) && dt > 0) {
        const vx = (px - boat.lastX) / dt; const vz = (pz - boat.lastZ) / dt;
        boat.vx += (vx - boat.vx) * Math.min(1, dt * 4); boat.vz += (vz - boat.vz) * Math.min(1, dt * 4);
      }
      boat.lastX = px; boat.lastZ = pz;
      const measured = Math.hypot(boat.vx, boat.vz);
      boat.speed = boat.given ?? measured;
      if (boat.speed < 1.5 || Math.hypot(px - eyeX, pz - eyeZ) > AMBIENT_RULES.boatRange) continue;
      const fx = measured > 0.5 ? boat.vx / measured : 0; const fz = measured > 0.5 ? boat.vz / measured : 0;
      boat.wake -= dt;
      if (boat.wake <= 0) {
        boat.wake = 0.08;
        anchorAt(boat, 0, 0);
        send('boat_wake', at.x, at.y, at.z, -fx, 0.05, -fz, Math.min(2, Math.max(0.5, boat.speed / 10)));
      }
      boat.spray -= dt;
      if (boat.speed > 4 && boat.spray <= 0) {
        boat.spray = 0.11;
        for (let side = -1; side <= 1; side += 2) {
          anchorAt(boat, side < 0 ? 1 : 2, side);
          send('bow_spray', at.x, at.y, at.z, -fz * side * 0.8 + fx * 0.2, 0.7, fx * side * 0.8 + fz * 0.2, Math.min(1.6, boat.speed / 12));
        }
      }
    }
  }

  return {
    /** Per frame (not while the effects are frozen). */
    update(dt) {
      lookFor -= dt;
      const eye = context.view?.camera?.matrixWorld?.elements;
      if (!eye) return;
      if (!emitters && lookFor <= 0) {
        const plan = context.systems?.find?.('openWorldCity')?.plan;
        if (plan) {
          emitters = findAmbientEmitters(plan);
          timers = new Float32Array(emitters.count);
          for (let i = 0; i < emitters.count; i += 1) timers[i] = random() * AMBIENT_KINDS[emitters.kind[i]].every;
        }
      }
      updateBoats(dt, eye[12], eye[14]);
      if (lookFor <= 0) lookFor = 1;
      if (!emitters) return;
      reselect -= dt;
      if (reselect <= 0) {
        reselect = AMBIENT_RULES.reselect;
        active = nearestEmitters(emitters, eye[12], eye[14], AMBIENT_RULES.range, chosen, distances);
      }
      for (let k = 0; k < active; k += 1) {
        const i = chosen[k];
        timers[i] -= dt;
        if (timers[i] > 0) continue;
        timers[i] = AMBIENT_KINDS[emitters.kind[i]].every * (0.6 + random() * 0.8);
        fire(i);
      }
    },
    /** Emitters found, and the ones working now. */
    stats: () => ({ emitters: emitters?.count ?? 0, active, boats: boats.length }),
    dispose() { stop?.(); boats.length = 0; },
  };
}
