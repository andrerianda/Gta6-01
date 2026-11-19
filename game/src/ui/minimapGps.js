// The radar's GPS: keeps two routes along the roads current, one to the player's waypoint and one
// to the mission objective, and recomputes them when a target changes or the player has moved
// on (at most a few times a second), so the radar only draws the buffers. Routes vanish once the
// player is close to their target.
import { createRoadRouter, createRoute } from './gpsRoute.js';

const RECOMPUTE_SECONDS = 0.6;     // the shortest time between two recomputations of one route
const MOVED_METRES = 5;            // how far the player moves before a route is recomputed
const ARRIVED_METRES = 18;         // closer than this to the target, the route is not drawn

/**
 * Creates the GPS of the radar.
 * @param {{roads?: {nodes: object[], segments: object[]}}} plan The city plan.
 */
export function createMinimapGps(plan) {
  const router = plan?.roads?.nodes?.length ? createRoadRouter(plan.roads) : null;
  const track = () => ({ target: null, route: createRoute(), fromX: 0, fromZ: 0, wait: 0, dirty: false });
  const waypoint = track();
  const objective = track();

  function aim(entry, position) {
    entry.target = position && Number.isFinite(position.x) && Number.isFinite(position.z) ? { x: position.x, z: position.z } : null;
    entry.route.count = 0;
    entry.dirty = entry.target !== null;
  }

  function refresh(entry, deltaSeconds, x, z) {
    if (!entry.target || !router) return;
    entry.wait -= deltaSeconds;
    if (Math.hypot(entry.target.x - x, entry.target.z - z) < ARRIVED_METRES) {
      entry.route.count = 0;
      entry.dirty = true;
      return;
    }
    const moved = Math.hypot(x - entry.fromX, z - entry.fromZ) > MOVED_METRES;
    if (!entry.dirty && !(moved && entry.wait <= 0)) return;
    router.route(x, z, entry.target.x, entry.target.z, entry.route);
    entry.fromX = x;
    entry.fromZ = z;
    entry.wait = RECOMPUTE_SECONDS;
    entry.dirty = false;
  }

  return {
    /** The route to the waypoint (points x, z; count). */
    waypointRoute: waypoint.route,
    /** The route to the mission objective. */
    objectiveRoute: objective.route,
    /** @param {{x: number, z: number}|null} position */
    setWaypoint(position) { aim(waypoint, position); },
    /** @param {{x: number, z: number}|null} position */
    setObjective(position) { aim(objective, position); },
    /**
     * Recomputes what is due. Objective and waypoint never both recompute in one frame.
     * @param {number} deltaSeconds
     * @param {number} x The player's position.
     * @param {number} z
     */
    update(deltaSeconds, x, z) {
      const before = objective.wait;
      refresh(objective, deltaSeconds, x, z);
      if (objective.wait > before && objective.wait === RECOMPUTE_SECONDS) {
        waypoint.wait = Math.max(waypoint.wait - deltaSeconds, 0.1);
        return;
      }
      refresh(waypoint, deltaSeconds, x, z);
    },
  };
}
