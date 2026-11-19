// The small shared vocabulary of the objective kinds (objectiveKinds.js, fightObjectives.js):
// what update() answers, plane distances, the place an objective refers to, how the lead
// travels, fair time limits, wrecked vehicles, and the target the HUD and the GPS hear.

/** update() answers PENDING while an objective runs and DONE when it is complete. */
export const PENDING = 0;
export const DONE = 1;

/** What the HUD and the GPS hear as an objective's place: {x, z}, or null when it has none. */
export function objectiveTarget(target) {
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z)) return null;
  return { x: target.x, z: target.z };
}

/** Plane distance between two points with x and z. */
export function planeDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** The place an objective refers to: a landmark id, or the run's current place. */
export function placeOf(o, ref) {
  return (ref && o.world.place(ref)) || o.memory.place || null;
}

/** True when the player is where `by` allows ('foot', 'vehicle', 'any'/'boat'). */
export function travelsAs(player, by) {
  if (by === 'foot') return !player.vehicleId;
  if (by === 'vehicle') return Boolean(player.vehicleId);
  return true;
}

/** Seconds a route of `metres` needs at a running pace on foot or a brisk drive, with slack. */
export function fairTimeLimit(given, metres, onFoot) {
  const needed = metres / (onFoot ? 5.2 : 13) + 20;
  return Math.max(given || 0, Math.ceil(needed));
}

/** True for a vehicle that is gone or wrecked. */
export function isWrecked(vehicle) {
  if (!vehicle) return true;
  if (vehicle.alive === false) return true;
  const data = vehicle.data || {};
  return (typeof data.health === 'number' && data.health <= 0) || data.stage >= 3;
}
