// The chance that one cannon burst of an interceptor hits the lead's aircraft: best from close
// behind on a steady target; range, an off-boresight shot, the target's jinking and its speed all
// take from it. A steady autopilot flight is the easiest target there is. Pure.

/**
 * @param {{x: number, y: number, z: number, heading: number}} shooter
 * @param {{x: number, y: number, z: number, speed: number, autopilot?: boolean}} target
 * @param {number} manoeuvre 0 steady .. 1 jinking hard (leadBehaviour.js).
 * @param {object} gunnery AIR_GUARD_TUNING.gunnery.
 * @returns {number} 0..gunnery.maxChance.
 */
export function burstHitChance(shooter, target, manoeuvre, gunnery) {
  const dx = target.x - shooter.x;
  const dy = target.y - shooter.y;
  const dz = target.z - shooter.z;
  const range = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (range > gunnery.maxRange) return 0;
  const rangeFactor = range <= gunnery.fullRange ? 1 : 1 - (range - gunnery.fullRange) / (gunnery.maxRange - gunnery.fullRange);

  // Off-boresight: the angle between the nose and the line to the target.
  const level = Math.sqrt(dx * dx + dz * dz);
  let off = Math.atan2(dx, -dz) - shooter.heading;
  off = Math.abs(((off + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  const elevation = Math.abs(Math.atan2(dy, level || 1));
  const cone = (gunnery.coneDegrees * Math.PI) / 180;
  const aspect = 1 - Math.max(off, elevation) / cone;
  if (aspect <= 0) return 0;

  const jink = 1 - gunnery.jinkShare * (manoeuvre < 0 ? 0 : manoeuvre > 1 ? 1 : manoeuvre);
  let speedFactor = 1 - Math.max(0, target.speed - gunnery.speedFrom) / gunnery.speedSpan;
  if (speedFactor < gunnery.speedFloor) speedFactor = gunnery.speedFloor;
  let chance = gunnery.baseChance * rangeFactor * aspect * jink * speedFactor;
  if (target.autopilot) chance *= gunnery.autopilotBonus;
  return chance > gunnery.maxChance ? gunnery.maxChance : chance;
}
