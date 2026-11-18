// Stages a wreck on a live vehicle for scenes and missions (the cover's crashed police cruiser
// burning against a palm at the roadside): the front crumpled (nose and one corner pushed in,
// the hood buckled up), the glass broken (a cracked windscreen, side windows gone), a door ajar,
// the paint scorched towards black, the front bumper torn off, and the car marked as burning so
// the roster keeps feeding fire and smoke to the effects system at its engine bay. The plans are
// pure maths in the model's space (the model faces -Z, +X is its right, the origin is on the
// ground at its centre) and are tested in tools/tests/vehicle-system/; stageVehicleWreck applies
// them to a rig. The roster (vehicleRoster.js stageWreck) owns the record, events and timing.
import * as THREE from 'three';
import { MAX_DENT } from './vehicleDamage.js';
import { CHARRED_PAINT, dropVehicleBumper, paintVehicleRig, setVehicleWindowState, showVehicleCrash } from './vehicleModelRig.js';
import { doorSideOf } from './vehicleLightsAndDoors.js';

/** What a staged wreck looks like unless the caller says otherwise. */
export const WRECK_DEFAULTS = Object.freeze({
  /** How hard the front is crumpled, 0 (untouched) .. 1 (the deepest dents). */
  front: 1,
  /** The corner that hit: 'left', 'right' or 'centre'. */
  corner: 'left',
  /** 'mixed' (windscreen and rear cracked, side windows gone), 'shattered', 'cracked' or 'none'. */
  glass: 'mixed',
  /** The door left ajar ('driver', 'passenger', 'fl', 'fr', 'rl', 'rr'), or null. */
  door: 'driver',
  /** How far that door hangs open, 0..1 (0.35 is about 20 degrees). */
  doorAmount: 0.35,
  /** Paint blackened towards char, 0 (clean) .. 1 (burnt out). */
  scorch: 0.55,
  /** Tear the front bumper off (when front > 0.5) and throw debris in the car's paint. */
  bumper: true,
  /** Burn: fire and smoke at the engine bay through the effects system. */
  burning: true,
  /** Seconds it burns (Infinity: until repaired, extinguished or removed). */
  burnSeconds: Infinity,
  /** Size of the fire (the effects' scale). */
  fire: 1,
});

const GLASS_PLANS = Object.freeze({
  mixed: { window_front: 1, window_rear: 1, window_l: 2, window_r: 2 },
  shattered: { window_front: 2, window_rear: 2, window_l: 2, window_r: 2 },
  cracked: { window_front: 1, window_rear: 1, window_l: 1, window_r: 1 },
  none: {},
});

/**
 * The options of a staged wreck, with defaults filled and numbers clamped.
 * @param {Partial<typeof WRECK_DEFAULTS>} [options] What the caller asked for.
 * @returns {typeof WRECK_DEFAULTS} A complete, safe set of options.
 */
export function resolveWreckOptions(options = {}) {
  const o = { ...WRECK_DEFAULTS, ...(options ?? {}) };
  const unit = (value, fallback) => (Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback);
  o.front = unit(o.front, WRECK_DEFAULTS.front);
  o.doorAmount = unit(o.doorAmount, WRECK_DEFAULTS.doorAmount);
  o.scorch = unit(o.scorch, WRECK_DEFAULTS.scorch);
  o.corner = ['left', 'right', 'centre'].includes(o.corner) ? o.corner : WRECK_DEFAULTS.corner;
  o.glass = o.glass in GLASS_PLANS ? o.glass : WRECK_DEFAULTS.glass;
  o.door = o.door === null || o.door === false ? null : doorSideOf(String(o.door)) ? String(o.door) : WRECK_DEFAULTS.door;
  o.bumper = Boolean(o.bumper);
  o.burning = Boolean(o.burning);
  o.burnSeconds = Number(o.burnSeconds) > 0 ? Number(o.burnSeconds) : WRECK_DEFAULTS.burnSeconds;
  o.fire = Number(o.fire) > 0 ? Math.min(3, Number(o.fire)) : WRECK_DEFAULTS.fire;
  return o;
}

/**
 * The state each window is left in: 1 cracked, 2 shattered (windows not listed stay whole).
 * @param {string} glass A glass mode of WRECK_DEFAULTS.glass.
 * @returns {Record<string, number>}
 */
export function wreckGlassPlan(glass) {
  return GLASS_PLANS[glass] ?? GLASS_PLANS.mixed;
}

/**
 * Paint scorched towards char: '#rrggbb' mixed with CHARRED_PAINT.
 * @param {string} colour The paint ('#rrggbb'; anything else is treated as mid grey).
 * @param {number} amount 0 (as is) .. 1 (charred).
 * @returns {string} '#rrggbb'.
 */
export function scorchedPaint(colour, amount) {
  const from = /^#[0-9a-f]{6}$/i.test(colour ?? '') ? parseInt(colour.slice(1), 16) : 0x808080;
  const to = parseInt(CHARRED_PAINT.slice(1), 16);
  const t = Math.max(0, Math.min(1, amount));
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const a = (from >> shift) & 255;
    const b = (to >> shift) & 255;
    out |= Math.round(a + (b - a) * t) << shift;
  }
  return `#${out.toString(16).padStart(6, '0')}`;
}

/**
 * The dents of a crumpled front, in model space: the nose pushed in and down, the corner that
 * hit pushed in and across, and the hood buckled upwards behind them.
 * @param {{length: number, width: number, height: number}} size The vehicle's dimensions (m).
 * @param {number} front 0..1 (WRECK_DEFAULTS.front).
 * @param {'left' | 'right' | 'centre'} corner The corner that hit.
 * @returns {{point: {x: number, y: number, z: number}, direction: {x: number, y: number, z: number}, depth: number}[]}
 */
export function wreckDentPlan(size, front, corner) {
  if (!(front > 0)) return [];
  const { length, width, height } = size;
  const side = corner === 'left' ? -1 : corner === 'right' ? 1 : 0;
  const nose = -length / 2;
  const unit = (x, y, z) => {
    const n = Math.hypot(x, y, z);
    return { x: x / n, y: y / n, z: z / n };
  };
  const plan = [
    { point: { x: side * width * 0.12, y: height * 0.38, z: nose + 0.05 }, direction: unit(0, -0.25, 1), depth: MAX_DENT * front },
    { point: { x: side * width * 0.08, y: height * 0.55, z: nose + length * 0.2 }, direction: unit(0, 1, 0.35), depth: MAX_DENT * 0.45 * front },
  ];
  if (side !== 0) {
    plan.push({ point: { x: side * width * 0.42, y: height * 0.4, z: nose + 0.2 }, direction: unit(-side * 0.55, -0.15, 0.85), depth: MAX_DENT * front });
  }
  return plan;
}

const point = new THREE.Vector3();
const direction = new THREE.Vector3();

/**
 * Shows a staged wreck on a rig: dents, glass, a door ajar, the bumper and the paint.
 * @param {object} rig From createVehicleRig.
 * @param {object} doors From createVehicleDoors.
 * @param {{dimensions: {length: number, width: number, height: number}}} entry The catalog model.
 * @param {string} colour The car's paint before scorching.
 * @param {typeof WRECK_DEFAULTS} options From resolveWreckOptions.
 * @returns {{cracked: number, shattered: number, bumper: boolean, paint: string}} What changed.
 */
export function stageVehicleWreck(rig, doors, entry, colour, options) {
  rig.root.updateMatrixWorld(true);
  for (const dent of wreckDentPlan(entry.dimensions, options.front, options.corner)) {
    rig.near.localToWorld(point.set(dent.point.x, dent.point.y, dent.point.z));
    direction.set(dent.direction.x, dent.direction.y, dent.direction.z).transformDirection(rig.near.matrixWorld);
    // Damage 0: the glass follows the staged plan below, not the dents.
    showVehicleCrash(rig, point, direction, 0, dent.depth);
  }
  const result = { cracked: 0, shattered: 0, bumper: false, paint: colour };
  const glass = wreckGlassPlan(options.glass);
  for (const name in glass) {
    if (setVehicleWindowState(rig, name, glass[name])) result[glass[name] === 2 ? 'shattered' : 'cracked'] += 1;
  }
  const door = options.door ? doors[doorSideOf(options.door)] : null;
  if (door) door.target = options.doorAmount;
  if (options.bumper && options.front > 0.5) result.bumper = dropVehicleBumper(rig, 'front');
  if (options.scorch > 0) {
    result.paint = scorchedPaint(colour, options.scorch);
    paintVehicleRig(rig, result.paint);
  }
  return result;
}
