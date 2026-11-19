// The radar-signature model: how brightly an aircraft shows on a radar, 0 (lost in the clutter)
// to 1 (painted bright), from its type, the side it turns to the emitter, its height, its speed
// and what hangs open. The Manta Sombra is tiny nose-on and from below and large from above, from
// the side and in a bank; the Garza Negra is moderate and grows with Mach and skin temperature;
// the trainer, the interceptor and helicopters are conventional. Near the surface the echo drowns
// in sea and terrain clutter, and below the emitter's radar horizon nothing is seen at all.
// The horizon uses the game's compressed scale (the map is a few kilometres, not a few hundred).
// Pure numbers: no DOM, no three.js, nothing allocated per call when `out` is passed.

/**
 * The echo of each type by the side shown (nose, tail, side, top, bottom: 0..1), the extra of a
 * bank, of speed (per Mach above 0.7, capped), of hot skin (above 100 C, per 250 C), of the
 * afterburner, of the gear and of an open hatch or bomb bay.
 */
export const RADAR_PROFILES = Object.freeze({
  manta_sombra: Object.freeze({ nose: 0.04, tail: 0.09, side: 0.16, top: 0.7, bottom: 0.12, bank: 0.38, speedGain: 0.5, speedCap: 0.15, heatGain: 0.05, burner: 0.2, gear: 0.3, hatch: 0.25, bay: 0.35 }),
  garza_negra: Object.freeze({ nose: 0.2, tail: 0.32, side: 0.42, top: 0.55, bottom: 0.5, bank: 0.12, speedGain: 0.22, speedCap: 0.45, heatGain: 0.3, burner: 0.15, gear: 0.2, hatch: 0.15, bay: 0.2 }),
  gaviota_t2: Object.freeze({ nose: 0.55, tail: 0.5, side: 0.7, top: 0.8, bottom: 0.8, bank: 0.05, speedGain: 0.1, speedCap: 0.1, heatGain: 0, burner: 0, gear: 0, hatch: 0.05, bay: 0.05 }),
  halcon: Object.freeze({ nose: 0.45, tail: 0.55, side: 0.7, top: 0.85, bottom: 0.8, bank: 0.05, speedGain: 0.15, speedCap: 0.15, heatGain: 0.05, burner: 0.15, gear: 0.1, hatch: 0.05, bay: 0.1 }),
  helicopter: Object.freeze({ nose: 0.6, tail: 0.6, side: 0.75, top: 0.85, bottom: 0.8, bank: 0, speedGain: 0, speedCap: 0, heatGain: 0, burner: 0, gear: 0, hatch: 0, bay: 0 }),
});

/** The profile of an unknown type: conventional. */
export const DEFAULT_RADAR_PROFILE = RADAR_PROFILES.halcon;
/** Below this height above the surface (metres) the echo sinks into the clutter; at the surface this share is left. */
export const CLUTTER = Object.freeze({ topMetres: 300, floorShare: 0.25, onGroundShare: 0.15 });
/** Radar horizon, metres per square root of a metre of height (the game's compressed sea). */
export const HORIZON_METRES_PER_ROOT_METRE = 520;

/**
 * The profile for a catalog id (or 'helicopter').
 * @param {string | null | undefined} typeId
 */
export function radarProfileOf(typeId) {
  return RADAR_PROFILES[typeId] ?? DEFAULT_RADAR_PROFILE;
}

/**
 * How far an antenna at `antennaHeight` sees a target at `targetHeight` over the curve of the sea.
 * @param {number} antennaHeight Metres above the sea.
 * @param {number} targetHeight Metres above the sea.
 * @returns {number} Metres.
 */
export function radarHorizonMetres(antennaHeight, targetHeight) {
  return HORIZON_METRES_PER_ROOT_METRE * (Math.sqrt(Math.max(0, antennaHeight)) + Math.sqrt(Math.max(0, targetHeight)));
}

/**
 * The share of the echo left above the clutter at a height over the surface.
 * @param {number} heightAboveSurface Metres over the sea or the terrain.
 * @param {boolean} [onGround]
 * @returns {number} CLUTTER.floorShare .. 1.
 */
export function clutterShareAt(heightAboveSurface, onGround = false) {
  if (onGround) return CLUTTER.onGroundShare;
  const t = Math.min(1, Math.max(0, (Number.isFinite(heightAboveSurface) ? heightAboveSurface : 0) / CLUTTER.topMetres));
  return CLUTTER.floorShare + (1 - CLUTTER.floorShare) * t * t * (3 - 2 * t);
}

const scratch = { forward: 0, right: 0, up: 0 };

/**
 * The direction from the aircraft to the emitter in the aircraft's own axes.
 * @param {{x: number, y: number, z: number, heading: number, pitch?: number, roll?: number}} craft World metres;
 *   compass heading, pitch (nose up +) and roll (right wing down +) in radians.
 * @param {{x: number, y: number, z: number}} emitter The antenna.
 * @param {{forward: number, right: number, up: number}} [out] Unit components: nose-on is forward 1, the
 *   emitter over the canopy is up 1, under the belly up -1.
 */
export function aspectTo(craft, emitter, out = scratch) {
  let dx = emitter.x - craft.x;
  let dy = emitter.y - craft.y;
  let dz = emitter.z - craft.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  dx /= length; dy /= length; dz /= length;
  const h = craft.heading || 0;
  const p = craft.pitch || 0;
  const r = craft.roll || 0;
  const sh = Math.sin(h), ch = Math.cos(h), sp = Math.sin(p), cp = Math.cos(p), sr = Math.sin(r), cr = Math.cos(r);
  // Level axes: nose (sh, 0, -ch), right wing (ch, 0, sh), up (0, 1, 0); then pitch, then roll about the nose.
  const fx = sh * cp, fy = sp, fz = -ch * cp;
  const ux0 = -sh * sp, uy0 = cp, uz0 = ch * sp;
  const rx0 = ch, rz0 = sh;
  const rx = rx0 * cr - ux0 * sr, ry = -uy0 * sr, rz = rz0 * cr - uz0 * sr;
  const ux = ux0 * cr + rx0 * sr, uy = uy0 * cr, uz = uz0 * cr + rz0 * sr;
  out.forward = dx * fx + dy * fy + dz * fz;
  out.right = dx * rx + dy * ry + dz * rz;
  out.up = dx * ux + dy * uy + dz * uz;
  return out;
}

/**
 * The signature of an aircraft as one emitter sees it.
 * @param {string} typeId A key of RADAR_PROFILES (others read as conventional).
 * @param {{x: number, y: number, z: number, heading: number, pitch?: number, roll?: number, mach?: number,
 *   skinTemperatureC?: number, heightAboveSurface?: number, onGround?: boolean, gear?: number, afterburner?: boolean,
 *   hatchOpen?: boolean, bayOpen?: boolean}} craft The aircraft: `gear` is 0 (up) .. 1 (down) and counts only
 *   for a retractable gear (pass 0 for a fixed one, it is in the type's echo already).
 * @param {{x: number, y: number, z: number}} emitter The antenna (world metres).
 * @returns {number} 0..1.
 */
export function radarSignatureOf(typeId, craft, emitter) {
  const profile = radarProfileOf(typeId);
  const a = aspectTo(craft, emitter, scratch);
  const f2 = a.forward * a.forward;
  const u2 = a.up * a.up;
  let echo = (a.forward > 0 ? profile.nose : profile.tail) * f2 + profile.side * a.right * a.right + (a.up > 0 ? profile.top : profile.bottom) * u2;
  // A bank turns the edges and the deflected surfaces to the radar whichever way it is flown.
  const bank = Math.abs(Math.sin(Number.isFinite(craft.roll) ? craft.roll : 0));
  echo += profile.bank * bank * Math.sqrt(bank);
  const mach = Number.isFinite(craft.mach) ? craft.mach : 0;
  if (mach > 0.7) echo += Math.min(profile.speedCap, (mach - 0.7) * profile.speedGain);
  const skin = Number.isFinite(craft.skinTemperatureC) ? craft.skinTemperatureC : 0;
  if (skin > 100) echo += profile.heatGain * Math.min(1, (skin - 100) / 250);
  if (craft.afterburner) echo += profile.burner;
  if (craft.gear > 0) echo += profile.gear * Math.min(1, craft.gear);
  if (craft.hatchOpen) echo += profile.hatch;
  if (craft.bayOpen) echo += profile.bay;
  const height = Number.isFinite(craft.heightAboveSurface) ? craft.heightAboveSurface : craft.y;
  echo *= clutterShareAt(height, Boolean(craft.onGround));
  return echo < 0 ? 0 : echo > 1 ? 1 : Number.isFinite(echo) ? echo : 1;
}

/**
 * The cockpit meter's word for a signature and the state of the track.
 * @param {number} signature 0..1.
 * @param {number} threshold The signature the nearest radar needs at this distance (Infinity out of reach).
 * @param {boolean} tracked
 * @param {boolean} painted A radar painted the aircraft on its last pass.
 * @returns {'HIDDEN' | 'LOW' | 'EXPOSED' | 'PAINTED' | 'TRACKED'}
 */
export function signatureWord(signature, threshold, tracked, painted) {
  if (tracked) return 'TRACKED';
  if (painted) return 'PAINTED';
  if (signature >= threshold) return 'EXPOSED';
  return signature >= threshold * 0.4 || signature >= 0.3 ? 'LOW' : 'HIDDEN';
}
