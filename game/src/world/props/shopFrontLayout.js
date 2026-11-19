// Shop-front layout: where set_commerce's awnings, café sets, A-frame boards, vending machines,
// news stands, fruit stalls and hot-dog carts stand along the shopping streets, as plain data.
// The fronts are the shop bays the building assembly reports (buildingMeshAssembly shopSigns:
// x, y, z at the wall, outward normal nx, nz, width, district, key). An awning hangs over most
// shops at the lintel (canvas tinted per shop), café sets line wide pavements in Centro and
// Playa Dorada, boards stand by bars and cafés, a vending pair, a news stand, a fruit stall or a
// hot-dog cart now and then. The pavement pieces go through the sector's clearance checks
// (sectorStreetItems.layOutSectorClutter), so nothing lands on the asphalt. No three.js.
import { clutterHash } from './streetClutterLayout.js';

const SET = 'set_commerce';
/** Districts whose shop fronts are dressed, and how lively their pavements are (0..1). */
export const SHOP_FRONT_LIFE = Object.freeze({
  centro: 1, playa_dorada: 1, bahia_vista: 0.7, la_marisma: 0.6, las_lomas: 0.45, isla_coral: 0.5, barrio_hierro: 0.25,
});
/** Awning canvas colours (linear RGB): terracotta, bottle green, navy, mustard, wine, teal, cream, coral. */
export const AWNING_COLOURS = Object.freeze([
  [0.45, 0.12, 0.06], [0.05, 0.2, 0.09], [0.04, 0.07, 0.2], [0.62, 0.42, 0.08], [0.3, 0.04, 0.06],
  [0.03, 0.26, 0.26], [0.72, 0.66, 0.52], [0.8, 0.3, 0.2],
]);
/** Plan sizes [along X, along Z] and pool kind ('shop': two levels, to 110 m; small boards 'clutter'). */
const OBJECTS = Object.freeze({
  awning_shop: [3.1, 1.44, 'shop'], cafe_set: [2.4, 2.4, 'shop'], aframe_board: [0.6, 0.56, 'clutter'],
  vending_drinks: [0.91, 0.79, 'shop'], vending_snacks: [0.94, 0.78, 'shop'], news_stand: [1.7, 0.87, 'shop'],
  fruit_stall: [2.2, 1.23, 'shop'], hotdog_cart: [2.22, 1.9, 'shop'], parasol_closed: [0.5, 0.5, 'clutter'],
});
/** The awning's mount is modelled 2.75 m up; shop lintels sit about 3.05 m (fascia above at 3.3). */
const AWNING_LIFT = 0.3;

function item(object, x, z, rotationY, extra) {
  const [sx, sz, kind] = OBJECTS[object];
  return { assetId: SET, object, x, z, rotationY, kind, halfX: sx / 2, halfZ: sz / 2, radius: Math.hypot(sx, sz) / 2, zone: 'shop', ...extra };
}

/**
 * The furniture of a sector's shop fronts.
 * @param {{x: number, y: number, z: number, nx: number, nz: number, width: number, district: string, key: number}[]} fronts
 * @returns {object[]} Items {assetId, object, x, z, rotationY, kind, halfX, halfZ, radius, base,
 *   y?, tint?, mounted?}; awnings are mounted (no collider, no clearance test).
 */
export function layOutShopFronts(fronts) {
  const items = [];
  for (const front of fronts ?? []) {
    const life = SHOP_FRONT_LIFE[front.district] ?? 0;
    if (life <= 0) continue;
    const key = front.key >>> 0;
    const r = (salt) => clutterHash(key, salt, 401);
    const { nx, nz } = front;
    const tx = -nz;
    const tz = nx;
    // Object -Z out of the wall (awnings, machines and stands face the pavement).
    const facing = Math.atan2(-nx, -nz);
    const at = (along, out) => [front.x + tx * along + nx * out, front.z + tz * along + nz * out];
    const base = front.y ?? 0;
    // Awning over the shop window: one, or two side by side on a wide bay.
    if (front.width >= 3.2 && r(1) < 0.45 + 0.4 * life) {
      const tint = AWNING_COLOURS[Math.floor(r(2) * AWNING_COLOURS.length)];
      const pair = front.width >= 6.4;
      for (const along of pair ? [-1.55, 1.55] : [0]) {
        const [x, z] = at(along, 0.02);
        items.push(item('awning_shop', x, z, facing, { base, y: AWNING_LIFT, tint, mounted: true }));
      }
    }
    const roll = r(3);
    if (roll < 0.3 * life && (front.district === 'centro' || front.district === 'playa_dorada' || front.district === 'bahia_vista')) {
      // A café terrace: sets at a 2.6 m pitch 2.9 m out (only where the pavement takes them), a board by the door.
      const sets = front.width >= 5 ? 2 : 1;
      for (let k = 0; k < sets; k += 1) {
        const [x, z] = at((k - (sets - 1) / 2) * 2.6, 2.9);
        items.push(item('cafe_set', x, z, facing + r(10 + k) * Math.PI, { base, cafe: true }));
      }
      const [bx, bz] = at(front.width / 2 - 0.5, 0.9);
      items.push(item('aframe_board', bx, bz, facing + (r(4) - 0.5) * 0.6, { base }));
    } else if (roll < 0.42 * life) {
      const [bx, bz] = at((r(5) < 0.5 ? -1 : 1) * (front.width / 2 - 0.5), 1.0);
      items.push(item('aframe_board', bx, bz, facing + (r(6) - 0.5) * 0.6, { base }));
    } else if (roll < 0.5 * life) {
      // A vending pair against the wall at the bay's edge.
      const side = r(7) < 0.5 ? -1 : 1;
      const [ax, az] = at(side * (front.width / 2 - 0.5), 0.42);
      const [bx, bz] = at(side * (front.width / 2 - 1.45), 0.42);
      items.push(item('vending_drinks', ax, az, facing, { base }), item('vending_snacks', bx, bz, facing, { base }));
    } else if (roll < 0.56 * life) {
      const [x, z] = at(0, 3.2);
      items.push(item('news_stand', x, z, facing + Math.PI, { base }));
    } else if (roll < 0.61 * life) {
      const [x, z] = at(0, 3.0);
      items.push(item('fruit_stall', x, z, facing + Math.PI, { base }));
    } else if (roll < 0.65 * life && front.district !== 'barrio_hierro') {
      const [x, z] = at(0, 3.0);
      items.push(item('hotdog_cart', x, z, facing + Math.PI * (r(8) < 0.5 ? 1 : 0.5), { base }));
    }
  }
  return items;
}
