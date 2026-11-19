// Beach layout: where set_beach's parasols, loungers, lifeguard towers, beach bars and volleyball
// nets stand on the sand below the promenade, as plain data. The beach is cut into 60 m
// frontages: about two in three are a bar's concession (rows of parasols 4.5 m apart parallel to
// the water, two loungers under each with their feet to the sea, a quarter of the parasols
// furled, the canvas in the concession's colour, the bar at the back of the sand by the
// promenade); the open stretches between get a volleyball net now and then; a lifeguard tower
// stands every ~320 m about 30 m from the water. Positions follow the plan's shore distance, so
// the rows bend with the water line. No three.js: Node tests it.
import { clutterHash } from './streetClutterLayout.js';

const SET = 'set_beach';
/** Canvas colours (linear RGB): coral, ocean blue, sun yellow, sea green. */
export const CANVAS_COLOURS = Object.freeze([[0.8, 0.25, 0.18], [0.05, 0.22, 0.5], [0.85, 0.62, 0.1], [0.06, 0.42, 0.3]]);
const OBJECTS = Object.freeze({
  parasol_open: [2.2, 2.2], parasol_closed: [0.25, 0.25], lounger: [0.72, 1.92], lounger_towel: [0.72, 1.92],
  lifeguard_tower: [2.64, 7.23], beach_bar_kiosk: [3.7, 3.5], volleyball_net: [12.2, 0.14],
});
/** Shore distances (metres from the water line) of the parasol rows. */
export const PARASOL_ROWS = Object.freeze([12, 16.5, 21]);
const PITCH = 4.6;
const FRONTAGE = 60;
const TOWER_EVERY = 320;

function item(object, x, z, rotationY, extra) {
  const [sx, sz] = OBJECTS[object];
  return { assetId: SET, object, x, z, rotationY, kind: 'beach', halfX: sx / 2, halfZ: sz / 2, radius: Math.hypot(sx, sz) / 2, zone: 'beach', ...extra };
}

/**
 * The beach furniture along a promenade.
 * @param {{line: number[], width?: number}} promenade The plan's promenade (line [ax, az, bx, bz]).
 * @param {{shoreDistanceAt: (x: number, z: number) => number, surfaceAt: (x: number, z: number) => string}} plan
 * @param {{avoid?: (x: number, z: number) => boolean}} [options] avoid: places to keep clear (piers).
 * @returns {object[]} Items {assetId, object, x, z, rotationY, kind 'beach', halfX, halfZ, radius,
 *   tint?, block}; heights come from the ground where they stand.
 */
export function layOutBeach(promenade, plan, options = {}) {
  const items = [];
  const line = promenade?.line;
  if (!line || line.length < 4 || !plan?.shoreDistanceAt || !plan?.surfaceAt) return items;
  const [ax, az, bx, bz] = line;
  const length = Math.hypot(bx - ax, bz - az);
  const tx = (bx - ax) / length;
  const tz = (bz - az) / length;
  // The seaward normal: the side where the shore distance falls.
  let nx = -tz;
  let nz = tx;
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  if (plan.shoreDistanceAt(mx + nx * 20, mz + nz * 20) > plan.shoreDistanceAt(mx, mz)) { nx = -nx; nz = -nz; }
  const sand = (x, z) => plan.surfaceAt(x, z) === 'sand';
  /** The point `target` metres from the water seaward of the promenade point (px, pz), on sand, or null. */
  const atShore = (px, pz, target) => {
    let out = plan.shoreDistanceAt(px, pz) - target;
    for (let k = 0; k < 3 && out > 0; k += 1) {
      const error = plan.shoreDistanceAt(px + nx * out, pz + nz * out) - target;
      if (Math.abs(error) < 0.5) break;
      out += error;
    }
    if (!(out > 4) || out > 160) return null;
    const x = px + nx * out;
    const z = pz + nz * out;
    return sand(x, z) ? [x, z] : null;
  };
  const feetToSea = Math.atan2(-nx, -nz); // object -Z towards the water
  const toPromenade = Math.atan2(nx, nz); // object -Z towards the promenade
  const alongWater = Math.atan2(-tz, tx);
  let lastTower = -TOWER_EVERY / 2;
  for (let s = 20; s < length - 20; s += PITCH) {
    const px = ax + tx * s;
    const pz = az + tz * s;
    const frontage = Math.floor(s / FRONTAGE);
    const inFrontage = s - frontage * FRONTAGE;
    const station = Math.round(s / PITCH);
    const concession = clutterHash(frontage, 1, 501) < 0.66;
    if (concession && inFrontage < FRONTAGE - 14) {
      const tint = CANVAS_COLOURS[Math.floor(clutterHash(frontage, 2, 502) * CANVAS_COLOURS.length)];
      PARASOL_ROWS.forEach((target, row) => {
        const spot = atShore(px, pz, target);
        if (!spot) return;
        const roll = clutterHash(station, row, 503);
        const block = `beach:${station}:${row}`;
        if (roll < 0.25) {
          items.push(item('parasol_closed', spot[0], spot[1], roll * 20, { block }));
          return;
        }
        items.push(item('parasol_open', spot[0], spot[1], roll * 40, { tint, block }));
        for (const side of [-0.45, 0.45]) {
          if (clutterHash(station, row * 3 + (side > 0 ? 1 : 0), 504) < 0.15) continue;
          const towel = clutterHash(station, row * 5 + (side > 0 ? 1 : 0), 505) < 0.33;
          items.push(item(towel ? 'lounger_towel' : 'lounger', spot[0] + tx * side - nx * 0.3, spot[1] + tz * side - nz * 0.3, feetToSea, { block }));
        }
      });
      // The concession's bar at the back of the sand, its counter towards the promenade.
      if (Math.abs(inFrontage - 22) < PITCH / 2) {
        for (let out = 6; out < 40; out += 1) {
          if (!sand(px + nx * out, pz + nz * out)) continue;
          items.push(item('beach_bar_kiosk', px + nx * (out + 3), pz + nz * (out + 3), toPromenade, { tint, block: `bar:${frontage}` }));
          break;
        }
      }
    } else if (!concession && Math.abs(inFrontage - 30) < PITCH / 2 && clutterHash(frontage, 3, 506) < 0.5) {
      const spot = atShore(px, pz, 24);
      if (spot) items.push(item('volleyball_net', spot[0], spot[1], alongWater, { block: `net:${frontage}` }));
    }
    if (s - lastTower >= TOWER_EVERY && !concession) {
      const spot = atShore(px, pz, 30);
      if (spot) {
        items.push(item('lifeguard_tower', spot[0], spot[1], feetToSea, { block: `tower:${station}` }));
        lastTower = s;
      }
    }
  }
  return options.avoid ? items.filter((each) => !options.avoid(each.x, each.z)) : items;
}
