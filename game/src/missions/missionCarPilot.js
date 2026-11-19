// The driver of the mission's own cars (pursuers, race rivals, fleeing targets): it drives along
// the city's lane graph (openWorldCity.laneGraph) and, at each junction, takes the connector
// whose next lane ends nearest the goal, so a pursuer comes round the block after the player
// instead of ploughing through the buildings in a straight line. Within a short reach of the goal
// (or off the graph) it steers straight at it, and a car that sticks reverses out for a moment.
// It writes the fleet's controls (vehicles.controlsOf) once per fixed step; nothing allocates
// per step once a car has its route.
import { cumulativeLengthsOf, pointAlongPolyline, projectOnPolyline } from '../traffic/laneRoute.js';

const TAU = Math.PI * 2;
const UTURN_PENALTY = 60;
const scratchPoint = { x: 0, z: 0, dx: 0, dz: 0 };
const scratchProjection = { s: 0, lateral: 0, distance: 0 };

/**
 * Creates the pilot of the mission cars.
 * @param {{entities: object, fleet: () => object | null, city: () => object | null, stepSeconds: () => number}} where
 */
export function createMissionCarPilot({ entities, fleet, city, stepSeconds }) {
  const pilots = new Map();          // vehicleId -> pilot state
  let bySegment = null;              // road segment id -> its lanes

  function stateOf(id) {
    let pilot = pilots.get(id);
    if (!pilot) {
      pilot = { stuck: 0, reversing: 0, piece: null, next: null, offLane: 0, replan: 0 };
      pilots.set(id, pilot);
    }
    return pilot;
  }

  function lanePiece(lane) {
    return { points: lane.points, length: lane.length ?? cumulativeLengthsOf(lane.points).at(-1), lane: lane.id, toLane: -1, limit: lane.speedLimit ?? 14 };
  }

  /** The piece after `piece`: a lane's best connector towards the goal, or the connector's lane. */
  function after(piece, goal) {
    const lanes = city()?.laneGraph;
    if (!lanes || !piece) return null;
    if (piece.lane < 0) return lanes[piece.toLane] ? lanePiece(lanes[piece.toLane]) : null;
    const lane = lanes[piece.lane];
    let best = null, bestScore = Infinity;
    for (const successor of lane?.successors ?? []) {
      const next = lanes[successor.lane];
      if (!next) continue;
      const end = next.points.length - 2;
      let score = Math.hypot(next.points[end] - goal.x, next.points[end + 1] - goal.z);
      if (successor.turn === 'uturn') score += UTURN_PENALTY;
      if (score < bestScore) { bestScore = score; best = successor; }
    }
    if (!best) return null;
    const points = best.points && best.points.length >= 4 ? best.points : lanes[best.lane].points.slice(0, 2);
    return { points, length: Math.max(0.01, best.length ?? cumulativeLengthsOf(points).at(-1)), lane: -1, toLane: best.lane, limit: 9 };
  }

  /** The lanes of a lane's road segment, both directions (indexed once from the lane graph). */
  function segmentLanes(lane) {
    const lanes = city()?.laneGraph;
    if (!bySegment && lanes) {
      bySegment = new Map();
      for (const each of lanes) {
        let list = bySegment.get(each.segment);
        if (!list) { list = []; bySegment.set(each.segment, list); }
        list.push(each);
      }
    }
    return bySegment?.get(lane.segment) ?? [lane];
  }

  /**
   * Puts the car on the lane of its nearest road that leads towards the goal: what is left of
   * the lane plus its end's distance to the goal, with a turn-around costing 30 m, so a pursuer
   * does not run off down the far side of the street (null when the graph is out of reach).
   */
  function attach(pilot, car, goal) {
    const found = city()?.nearestLane?.(car.position.x, car.position.z, 40);
    if (!found) { pilot.piece = null; return; }
    const h = car.heading ?? 0, fx = -Math.sin(h), fz = -Math.cos(h);
    let best = found.lane, bestScore = Infinity;
    for (const lane of segmentLanes(found.lane)) {
      projectOnPolyline(lane.points, car.position.x, car.position.z, scratchProjection);
      pointAlongPolyline(lane.points, scratchProjection.s, scratchPoint);
      const end = lane.points.length - 2;
      let score = Math.max(0, (lane.length ?? 0) - scratchProjection.s) + Math.hypot(lane.points[end] - goal.x, lane.points[end + 1] - goal.z);
      if (scratchPoint.dx * fx + scratchPoint.dz * fz < 0) score += 30;
      if (score < bestScore) { bestScore = score; best = lane; }
    }
    pilot.piece = lanePiece(best);
    pilot.next = after(pilot.piece, goal);
  }

  /** Writes throttle, brake and steering for a heading error and a wanted speed. */
  function steer(controls, error, speed, wanted) {
    controls.reverse = false;
    controls.handbrake = 0;
    controls.steer = Math.max(-1, Math.min(1, -error * 2.2));
    const sharp = Math.abs(error) > 0.7;
    const slow = sharp ? Math.min(wanted, 9) : wanted;
    if (speed > slow + 2) { controls.throttle = 0; controls.brake = Math.min(1, (speed - slow) * 0.15); }
    else { controls.throttle = speed < slow ? (Math.abs(error) < 1.3 ? 1 : 0.5) : 0.25; controls.brake = 0; }
  }

  /**
   * One fixed step of driving the car `id` towards `goal`.
   * @param {number} id
   * @param {{x: number, z: number}} goal
   * @param {number} [skill] 0..1: the share of its pace a car drives at.
   * @param {{direct?: number}} [how] Steer straight at the goal inside this reach (default 35 m).
   */
  function drive(id, goal, skill = 1, how = {}) {
    const car = entities.get(id);
    const controls = fleet()?.controlsOf?.(id);
    if (!car || !controls || !goal) return;
    const pilot = stateOf(id);
    const step = stepSeconds();
    const speed = car.data?.speed ?? 0;
    pilot.stuck = Math.abs(speed) < 0.8 ? pilot.stuck + step : 0;
    if (pilot.stuck > 2.2) { pilot.reversing = 1.4; pilot.stuck = 0; pilot.piece = null; }
    const heading = car.heading ?? 0;
    let aimX = goal.x, aimZ = goal.z;
    const gap = Math.hypot(goal.x - car.position.x, goal.z - car.position.z);
    const pace = 10 + 22 * Math.max(0.3, Math.min(1, skill));
    let wanted = pace;
    if (gap > (how.direct ?? 35)) {
      // The goal moves (a fleeing player): every few seconds choose the road's direction again.
      pilot.replan -= step;
      if (!pilot.piece || pilot.replan <= 0) { pilot.replan = 3; attach(pilot, car, goal); }
      if (pilot.piece) {
        projectOnPolyline(pilot.piece.points, car.position.x, car.position.z, scratchProjection);
        if (scratchProjection.distance > 14) pilot.offLane += step; else pilot.offLane = 0;
        if (pilot.offLane > 1.5) { pilot.offLane = 0; attach(pilot, car, goal); }
        if (pilot.piece && scratchProjection.s >= pilot.piece.length - 0.5 && pilot.next) {
          pilot.piece = pilot.next;
          pilot.next = after(pilot.piece, goal);
          projectOnPolyline(pilot.piece.points, car.position.x, car.position.z, scratchProjection);
        }
      }
      if (pilot.piece) {
        let ahead = scratchProjection.s + 7 + Math.abs(speed) * 0.45;
        let piece = pilot.piece;
        if (ahead > piece.length && pilot.next) { ahead -= piece.length; piece = pilot.next; }
        pointAlongPolyline(piece.points, Math.min(ahead, piece.length), scratchPoint);
        aimX = scratchPoint.x; aimZ = scratchPoint.z;
        wanted = Math.min(pace, Math.max(12, piece.limit * 1.7));
      }
    } else {
      pilot.piece = null;
    }
    let error = Math.atan2(-(aimX - car.position.x), -(aimZ - car.position.z)) - heading;
    error -= Math.round(error / TAU) * TAU;
    if (pilot.reversing > 0) {
      pilot.reversing -= step;
      controls.reverse = true; controls.throttle = 0.7; controls.brake = 0; controls.steer = error > 0 ? 1 : -1;
      return;
    }
    steer(controls, error, speed, wanted);
  }

  /** Stops the car with the brakes on and forgets its route. */
  function halt(id) {
    pilots.delete(id);
    const controls = fleet()?.controlsOf?.(id);
    if (!controls) return;
    controls.throttle = 0; controls.brake = 1; controls.steer = 0; controls.reverse = false;
  }

  return { drive, halt, has: (id) => pilots.has(id), track: (id) => stateOf(id), forget: (id) => pilots.delete(id), ids: () => pilots.keys() };
}
