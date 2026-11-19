// One radar at work: the antenna turns once every `sweepSeconds`, and each time its beam crosses
// an aircraft it paints it if the aircraft is within reach (the emitter's range scaled by the
// fourth root of the signature: the radar equation), above the radar horizon and in line of sight
// over the terrain. A track builds over consecutive paints and decays between them, so an aircraft
// that is in reach for only one pass, or shows a small enough echo, slips between the sweeps.
// Pure numbers: no DOM, no three.js.
import { radarHorizonMetres } from './radarSignature.js';

/** The beam's full width in degrees by emitter kind, and how a track builds and fades. */
export const RADAR_SWEEP = Object.freeze({
  beamWidthDegrees: Object.freeze({ tower: 5, ship: 7 }),
  /** Track quality gained by one paint, and lost per sweep period without one. */
  paintGain: 0.5,
  decayPerSweep: 0.3,
  /** A track is held from `hold` up and dropped under `drop`. */
  hold: 0.6,
  drop: 0.25,
  /** Terrain samples along the line of sight. */
  sightSamples: 14,
});

/**
 * The beam's compass azimuth at a time.
 * @param {{sweepSeconds: number, phaseDegrees?: number}} emitter
 * @param {number} timeSeconds
 * @returns {number} 0..360, clockwise from north.
 */
export function beamAzimuthAt(emitter, timeSeconds) {
  const turn = ((emitter.phaseDegrees ?? 0) + (360 * timeSeconds) / emitter.sweepSeconds) % 360;
  return turn < 0 ? turn + 360 : turn;
}

/**
 * The compass bearing from one point to another.
 * @returns {number} 0..360 (north is -Z, east +X).
 */
export function compassBearing(fromX, fromZ, toX, toZ) {
  const degrees = (Math.atan2(toX - fromX, -(toZ - fromZ)) * 180) / Math.PI;
  return degrees < 0 ? degrees + 360 : degrees;
}

/**
 * Whether the beam swept over a bearing while it turned from `azimuth` through `turned` degrees.
 * @param {number} azimuth The beam's azimuth at the start of the step.
 * @param {number} turned Degrees turned in the step (clockwise, >= 0).
 * @param {number} bearing The target's bearing from the emitter.
 * @param {number} beamWidth The beam's full width, degrees.
 */
export function beamCrossed(azimuth, turned, bearing, beamWidth) {
  const half = beamWidth / 2;
  let ahead = (bearing - (azimuth - half)) % 360;
  if (ahead < 0) ahead += 360;
  return ahead <= turned + beamWidth;
}

/**
 * The distance at which an emitter picks up a signature.
 * @param {number} range The emitter's range against a signature of 1, metres.
 * @param {number} signature 0..1.
 */
export function detectionRange(range, signature) {
  return signature > 0 ? range * Math.sqrt(Math.sqrt(Math.min(1, signature))) : 0;
}

/**
 * The signature an emitter needs to pick a target up at a distance (the cockpit meter's red line).
 * @returns {number} 0.. (above 1: out of reach whatever the aircraft does).
 */
export function signatureNeededAt(range, distance) {
  const share = distance / range;
  return share * share * share * share;
}

/**
 * Whether the terrain leaves the line from the antenna to the target free.
 * @param {(x: number, z: number) => number} heightAt Terrain height (the sea counts as 0).
 */
export function terrainSightFree(heightAt, ax, ay, az, bx, by, bz, samples = RADAR_SWEEP.sightSamples) {
  if (typeof heightAt !== 'function') return true;
  for (let i = 1; i < samples; i += 1) {
    const t = i / samples;
    const ground = heightAt(ax + (bx - ax) * t, az + (bz - az) * t);
    if (Number.isFinite(ground) && Math.max(0, ground) > ay + (by - ay) * t) return false;
  }
  return true;
}

/**
 * What an emitter could see of a target, whatever its beam does now.
 * @param {{x: number, y: number, z: number, range: number, alive?: boolean}} emitter `y` is the antenna's height above the sea.
 * @param {{x: number, y: number, z: number}} target
 * @param {number} signature 0..1 as this emitter sees it.
 * @param {((x: number, z: number) => number) | null} heightAt
 * @param {{distance: number, reach: number, inRange: boolean, aboveHorizon: boolean, sight: boolean, visible: boolean}} out
 */
export function emitterView(emitter, target, signature, heightAt, out) {
  out.distance = Math.hypot(target.x - emitter.x, target.z - emitter.z);
  out.reach = detectionRange(emitter.range, signature);
  out.inRange = emitter.alive !== false && out.distance <= out.reach;
  out.aboveHorizon = out.distance <= radarHorizonMetres(emitter.y, target.y);
  out.sight = out.inRange && out.aboveHorizon ? terrainSightFree(heightAt, emitter.x, emitter.y, emitter.z, target.x, target.y, target.z) : false;
  out.visible = out.inRange && out.aboveHorizon && out.sight;
  return out;
}

/**
 * A fresh track of one target by one emitter.
 * @returns {{quality: number, tracked: boolean, paints: number, sincePaint: number, heldSeconds: number, painted: boolean}}
 */
export function createRadarTrack() {
  return { quality: 0, tracked: false, paints: 0, sincePaint: Infinity, heldSeconds: 0, painted: false };
}

/**
 * Advances a track by one step.
 * @param {ReturnType<typeof createRadarTrack>} track
 * @param {boolean} paint The beam crossed the visible target in this step.
 * @param {number} dt Seconds.
 * @param {number} sweepSeconds The emitter's turn.
 * @param {number} [strength] 0..1 how far inside the reach the target is (a paint at the very edge is weak).
 * @returns {boolean} True when `tracked` changed.
 */
export function stepRadarTrack(track, paint, dt, sweepSeconds, strength = 1) {
  const before = track.tracked;
  track.sincePaint += dt;
  if (paint) {
    track.quality = Math.min(1, track.quality + RADAR_SWEEP.paintGain * (0.6 + 0.4 * Math.min(1, Math.max(0, strength))));
    track.paints += 1;
    track.sincePaint = 0;
  } else if (track.quality > 0) {
    track.quality = Math.max(0, track.quality - (RADAR_SWEEP.decayPerSweep * dt) / sweepSeconds);
    if (track.quality === 0) track.paints = 0;
  }
  // "Painted" lasts until the beam has come round once more without an echo.
  track.painted = track.sincePaint < sweepSeconds * 1.15;
  if (!track.tracked && track.quality >= RADAR_SWEEP.hold) track.tracked = true;
  else if (track.tracked && track.quality < RADAR_SWEEP.drop) track.tracked = false;
  track.heldSeconds = track.tracked ? track.heldSeconds + dt : 0;
  return before !== track.tracked;
}

/** Forgets a track. */
export function resetRadarTrack(track) {
  track.quality = 0; track.tracked = false; track.paints = 0; track.sincePaint = Infinity; track.heldSeconds = 0; track.painted = false;
  return track;
}
