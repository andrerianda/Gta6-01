// Where each person of the crowd wants to go this frame, by mode: walking along pavements and
// over crossings on the walk phase (keeping right, beside a group's leader), waiting at the
// kerb, walking to a bench and sitting, into a shop, back to a car, fleeing at a run, cowering,
// gawking, phoning the police, fighting or shooting, lying down and getting up after a carjack;
// round each other, the lead's personal space, the line of his gun, cars about to hit them and
// the pavement's trunks, poles and benches. Writes the run-time's move input on the person's
// body. Works on the shared crowd state that crowdSimulation.js builds.
import { ENTITY_KINDS, ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { companionSpot, gestureFor } from './crowdActivities.js';
import { createCrewIdle } from './crewIdle.js';
import { steerAroundObstacles } from './pavementObstacles.js';
import { FLEE_SECONDS, CALL_SECONDS, carThreat, fleeDirection, knocksDown, witnessHeat } from './pedestrianReactions.js';
import { keepFromLead, lineOfFire } from './personalSpace.js';

export const RUN_SPEED = 5.2;
/** Modes that walk round pavement obstacles (and are kept out of them). */
export const STEPPING = new Set(['walk', 'flee', 'wait', 'to_bench', 'shop', 'return', 'fight']);
/** Standing modes: never left inside a trunk or a pole either (a talker put down by one steps clear). */
export const STANDING = new Set(['chat', 'gawk', 'call', 'cower']);
/** Modes the lead's personal space does not move (a fight, a seat, the fallen, a hauled driver). */
export const HOLDS_GROUND = new Set(['fight', 'sit', 'down', 'dead', 'dragged']);

/** Whether a person walks round (and is kept out of) pavement obstacles now: not on the last steps to a seat. */
export function stepsRound(p) {
  if (!STEPPING.has(p.mode)) return false;
  return !(p.mode === 'to_bench' && p.seat && Math.abs(p.seat.x - p.x) + Math.abs(p.seat.z - p.z) < 2.2);
}

/**
 * Creates the crowd's steering.
 * @param {object} crowd The shared crowd state (crowdSimulation.js).
 */
export function createCrowdSteering(crowd) {
  const { context, city, routes, benches, shooting, obstacles, random, nearDoors } = crowd;
  const spot = { x: 0, z: 0, dirX: 0, dirZ: -1, length: 0 };
  const away = { x: 0, z: 0 };
  const companion = { x: 0, z: 0 };
  const threat = { seconds: 0, side: 1, lateral: 0 };
  const next = { edge: -1, forward: true };
  const fire = { ahead: 0, lateral: 0, aimedAt: false, near: false };
  const nearby = [];
  /** Guards on watch and gang crews hanging out (crewIdle.js). */
  const idle = createCrewIdle(crowd);

  /** A companion keeps its place beside the leader; alone again when the leader stops walking. */
  function followLeader(p) {
    const leader = p.leader;
    if (leader.removed || (leader.mode !== 'walk' && leader.mode !== 'wait')) {
      p.leader = null;
      if (!leader.removed) { p.edge = leader.edge; p.forward = leader.forward; p.along = leader.along; }
      return false;
    }
    const state = leader.body.walker.state;
    companionSpot(leader.x, leader.z, state.yaw, p.slot, companion);
    const dx = companion.x - p.x, dz = companion.z - p.z;
    // Match the leader's velocity and close the gap.
    let mx = state.vx * leader.body.scale + dx * 1.6, mz = state.vz * leader.body.scale + dz * 1.6;
    const speed = Math.hypot(mx, mz);
    if (speed > 2.6) { mx *= 2.6 / speed; mz *= 2.6 / speed; }
    if (speed < 0.25 && dx * dx + dz * dz < 0.09) { mx = 0; mz = 0; p.input.facing = state.yaw; }
    p.input.moveX = mx / p.body.scale;
    p.input.moveZ = mz / p.body.scale;
    // Keep the route in step so the companion walks on from there when alone.
    p.edge = leader.edge; p.forward = leader.forward; p.along = leader.along;
    return true;
  }

  /**
   * A person off the route network: joins the nearest pavement within 60 m when walking; until
   * then stands, or runs straight away from the trouble when fleeing. True while still off.
   */
  function offRoute(p, thinking, fleeing) {
    if (thinking && p.routeCheck <= crowd.time) {
      p.routeCheck = crowd.time + 3;
      const points = city.spawnPointsNear(p.x, p.z, 60, 'pedestrian', 120);
      let best = null, bestD = Infinity;
      for (const q of points) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bestD) { bestD = d; best = q; } }
      if (best) {
        p.edge = best.edge.id;
        p.forward = random() < 0.5;
        p.along = routes.locate(p.edge, p.forward, best.x, best.z);
        return false;
      }
    }
    if (fleeing) {
      const dx = p.x - p.sourceX, dz = p.z - p.sourceZ, d = Math.hypot(dx, dz) || 1;
      p.input.moveX = (dx / d) * RUN_SPEED;
      p.input.moveZ = (dz / d) * RUN_SPEED;
    } else if (Number.isFinite(p.facing)) p.input.facing = p.facing;
    return true;
  }

  /** A walker passing a free bench seat may sit down for a while. */
  function maybeSit(p) {
    if (p.style === 'jog' || p.leader || random() > 0.04) return;
    const seat = benches.freeNear(p.x, p.z, 7);
    if (!seat) return;
    benches.take(seat, p.id);
    p.seat = seat;
    p.mode = 'to_bench';
    p.timer = 12;
  }

  /** Armed and fighting: keeps a shooting distance, aims and fires; false without a gun. */
  function shootAt(p, target, dt) {
    const tx = target.position.x, ty = target.position.y + 1.25, tz = target.position.z;
    if (!shooting.aim(p, tx, ty, tz)) return false;
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) || 1;
    p.input.facing = Math.atan2(-dx, -dz);
    if (d > 16) { p.input.moveX = (dx / d) * 3.2; p.input.moveZ = (dz / d) * 3.2; }
    else if (d < 5) { p.input.moveX = -(dx / d) * 1.2; p.input.moveZ = -(dz / d) * 1.2; }
    p.fireTimer -= dt;
    // Gang members open fire; anyone else only once hurt by the target.
    const shoots = p.entity.data.factionId || p.provoked;
    if (shoots && p.fireTimer <= 0 && d < 30) {
      p.fireTimer = 0.55 + random() * 1.1;
      shooting.fire(p, tx, ty, tz, 0.45);
    }
    return true;
  }

  /** A walker passing a shop door may go in (then leaves the crowd at the door). */
  function maybeEnterShop(p) {
    if (p.style === 'jog' || random() > 0.05) return;
    for (const door of nearDoors) {
      const dx = door.x - p.x, dz = door.z - p.z;
      if (dx * dx + dz * dz > 30) continue;
      p.mode = 'shop';
      p.targetX = door.x + door.ix * 0.5;
      p.targetZ = door.z + door.iz * 0.5;
      p.timer = 12;
      return;
    }
  }

  /** Walks straight to a point; true when there. */
  function walkTo(p, x, z, speed) {
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.45) return true;
    p.input.moveX = (dx / d) * speed * Math.min(1, d + 0.3);
    p.input.moveZ = (dz / d) * speed * Math.min(1, d + 0.3);
    return false;
  }

  /** Steers a person along their edge; at its end, chooses the next or waits at the kerb. */
  function followRoute(p, dt, speed, fleeing) {
    const length = routes.lengthOf(p.edge);
    routes.place(p.edge, p.forward, p.along, p.lane, spot);
    // Fleeing: run along the pavement away from the trouble, turning round when it lies ahead.
    if (fleeing && (p.x - p.sourceX) * spot.dirX + (p.z - p.sourceZ) * spot.dirZ < -2) {
      p.forward = !p.forward;
      p.along = length - p.along;
      spot.dirX = -spot.dirX;
      spot.dirZ = -spot.dirZ;
    }
    p.along += Math.max(0, p.body.walker.state.speed) * p.body.scale * dt;
    if (p.along >= length - 0.4) {
      const node = routes.endNode(p.edge, p.forward);
      let hx = spot.dirX, hz = spot.dirZ;
      if (fleeing) { fleeDirection(p.x, p.z, p.sourceX, p.sourceZ, hx, hz, away); hx = away.x; hz = away.z; }
      const choice = routes.chooseNextEdge(node, p.edge, hx, hz, random(), fleeing ? 'walk' : p.style, next);
      if (choice && (fleeing || routes.crossingOpen(choice.edge, crowd.time))) {
        p.edge = choice.edge;
        p.forward = choice.forward;
        p.along = 0;
        p.mode = fleeing ? 'flee' : 'walk';
      } else if (choice) {
        p.mode = 'wait';
        p.waitEdge = choice.edge;
        p.waitForward = choice.forward;
        p.along = length - 0.4;
      }
    }
    routes.place(p.edge, p.forward, Math.min(p.along + 1.6, length), p.lane, spot);
    const dx = spot.x - p.x, dz = spot.z - p.z, d = Math.hypot(dx, dz) || 1;
    p.input.moveX = (dx / d) * speed;
    p.input.moveZ = (dz / d) * speed;
  }

  /** Pushes a person's wanted move away from others close by and from the player. */
  function avoid(p) {
    let px = 0, pz = 0;
    const count = context.entities.within(p.x, p.z, 1.6, null, nearby).length;
    for (let i = 0; i < count; i += 1) {
      const other = nearby[i];
      if (other === p.entity || other.kind !== ENTITY_KINDS.CHARACTER) continue;
      // Members of a walking group keep their places beside each other.
      const q = other.data && other.data.person;
      if (q && (q === p.leader || q.leader === p || (p.leader && q.leader === p.leader))) continue;
      const dx = p.x - other.position.x, dz = p.z - other.position.z, d = Math.hypot(dx, dz) || 0.01;
      const push = (1.6 - d) * (other.tags && other.tags.has && other.tags.has(ENTITY_TAGS.PLAYER) ? 2.4 : 1.2);
      px += (dx / d) * push;
      pz += (dz / d) * push;
    }
    nearby.length = 0;
    p.input.moveX += px;
    p.input.moveZ += pz;
  }

  /** Looks for cars about to hit a person; knocks them down when one does. */
  function watchCars(p) {
    if (p.mode === 'down' || p.mode === 'dead' || p.mode === 'dragged') return;
    const count = context.entities.within(p.x, p.z, 16, { kind: ENTITY_KINDS.VEHICLE }, nearby).length;
    for (let i = 0; i < count; i += 1) {
      const car = nearby[i];
      const speed = car.data ? car.data.speed || 0 : 0;
      const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
      const dx = p.x - car.position.x, dz = p.z - car.position.z;
      const ahead = dx * fx + dz * fz, side = dx * -fz + dz * fx;
      const outside = Math.max(Math.abs(ahead) - 2.3, Math.abs(side) - 0.95);
      if (knocksDown(outside, speed)) {
        p.mode = 'down';
        p.timer = 3.5 + random() * 2;
        p.fall = 0;
        p.fallDirection = ahead * speed > 0 ? 1 : -1;
        context.events.queue(GAME_EVENTS.PEDESTRIAN_KNOCKED_DOWN, { pedestrianId: p.id, causeId: car.id, speed: Math.abs(speed), position: { x: p.x, y: p.entity.position.y, z: p.z } });
        break;
      }
      if (carThreat(p.x, p.z, car.position.x, car.position.z, fx, fz, speed, 1.8, threat)) {
        p.dodgeX = -fz * threat.side * 4.5;
        p.dodgeZ = fx * threat.side * 4.5;
        p.dodgeTimer = 0.7;
        if (p.mode === 'wait' || p.mode === 'walk' || p.mode === 'chat') crowd.react(p, 'vehicle_near_miss', car.position.x, car.position.z, car.id, 3);
        break;
      }
    }
    nearby.length = 0;
  }

  /**
   * The lead aims: those the gun points at put their hands up, cower or run (their archetype's
   * aimed_at reaction); those beside its line step out of it.
   */
  function faceTheGun(p) {
    const lead = crowd.lead.position;
    lineOfFire(p.x, p.z, lead.x, lead.z, crowd.aimX, crowd.aimZ, fire);
    if (fire.aimedAt) {
      if (p.mode !== 'cower' && p.mode !== 'flee' && p.mode !== 'fight') crowd.react(p, 'aimed_at', lead.x, lead.z, crowd.lead.id, fire.ahead);
    } else if (fire.near && p.dodgeTimer <= 0 && p.mode !== 'cower' && p.mode !== 'flee') {
      if (p.seat) return;
      const s = fire.lateral >= 0 ? 1 : -1;
      p.dodgeX = -crowd.aimZ * s * 2.2;
      p.dodgeZ = crowd.aimX * s * 2.2;
      p.dodgeTimer = 0.7;
    }
  }

  /** The mode's wanted move (and facing) for one person this frame. */
  function moveByMode(p, dt, thinking) {
    switch (p.mode) {
      case 'walk':
        if (!p.leader && p.edge < 0 && offRoute(p, thinking, false)) break;
        if (!p.leader || !followLeader(p)) followRoute(p, dt, p.style === 'jog' ? 2.8 : p.style === 'stroll' ? p.walkSpeed * 0.8 : p.walkSpeed, false);
        if (thinking && nearDoors.length && !p.leader) maybeEnterShop(p);
        if (thinking && p.mode === 'walk' && benches.available) maybeSit(p);
        break;
      case 'to_bench':
        if (!p.seat || p.timer <= 0 || (thinking && !benches.stillThere(p.seat))) { crowd.leaveSeat(p); p.mode = 'walk'; break; }
        if (walkTo(p, p.seat.x, p.seat.z, p.walkSpeed * 0.8)) {
          // Turn round to face out from the bench, then sit.
          p.input.facing = p.seat.yaw;
          const turn = Math.atan2(Math.sin(p.seat.yaw - p.body.walker.state.yaw), Math.cos(p.seat.yaw - p.body.walker.state.yaw));
          if (Math.abs(turn) < 0.3) crowd.sitDown(p, p.seat);
        }
        break;
      case 'sit':
        // The bench gone (its sector unbuilt, the dressing re-laid): stand up and walk on.
        if (!p.seat || (thinking && !benches.stillThere(p.seat))) { crowd.leaveSeat(p); p.mode = 'walk'; break; }
        // On the seat's front edge, facing out; the last few centimetres glide in.
        p.x += (p.seat.x - p.x) * Math.min(1, dt * 4);
        p.z += (p.seat.z - p.z) * Math.min(1, dt * 4);
        p.input.facing = p.seat.yaw;
        if (p.timer <= 0) { crowd.leaveSeat(p); p.mode = 'walk'; }
        break;
      case 'shop': if (walkTo(p, p.targetX, p.targetZ, p.walkSpeed * 0.85) || p.timer <= 0) p.gone = true; break;
      case 'return': {
        // An angry driver walks back to the driver's door and gets in (leaves the crowd).
        const car = p.carId != null ? context.entities.get(p.carId) : null;
        if (!car || Math.abs(car.position.x - p.x) + Math.abs(car.position.z - p.z) > 16 || p.timer <= 0) { p.mode = 'walk'; p.carId = null; break; }
        if (walkTo(p, car.position.x - Math.cos(car.heading) * 1.3, car.position.z + Math.sin(car.heading) * 1.3, 1.6)) p.gone = true;
        break;
      }
      case 'flee':
        if (!(p.edge < 0 && offRoute(p, thinking, true))) followRoute(p, dt, RUN_SPEED, true);
        if (p.timer <= 0) p.mode = 'walk';
        break;
      case 'wait':
        routes.place(p.waitEdge, p.waitForward, 1, 0, spot);
        p.input.facing = Math.atan2(-spot.dirX, -spot.dirZ);
        if (thinking && routes.crossingOpen(p.waitEdge, crowd.time)) { p.edge = p.waitEdge; p.forward = p.waitForward; p.along = 0; p.mode = 'walk'; }
        break;
      case 'chat':
        if (p.timer <= 0) { p.mode = 'walk'; break; }
        p.input.facing = p.facing;
        // A hostile gunman standing his ground (a mission's) aims at the lead.
        if (p.weaponId && crowd.player && p.entity.tags.has(ENTITY_TAGS.HOSTILE)
          && Math.abs(crowd.player.position.x - p.x) + Math.abs(crowd.player.position.z - p.z) < 45) {
          idle.clear(p);
          shooting.aim(p, crowd.player.position.x, crowd.player.position.y + 1.25, crowd.player.position.z);
        } else if (idle.update(p, dt, thinking)) {
          // A guard on watch or a crew member hanging out: crewIdle.js posed them.
        } else if (p.gestureTimer <= 0) {
          // Talkers take turns with their hands.
          p.gestureTimer = 2 + random() * 4;
          crowd.setGesture(p, gestureFor('chat', random));
        }
        break;
      case 'cower': case 'gawk':
        p.input.facing = Math.atan2(-(p.sourceX - p.x), -(p.sourceZ - p.z)) + (p.mode === 'cower' ? Math.PI : 0);
        if (p.gesture === 'point') p.body.walker.pointAt(p.sourceX, p.entity.position.y + 1, p.sourceZ);
        if (p.timer <= 0) { p.mode = p.mode === 'cower' ? 'flee' : 'walk'; p.timer = FLEE_SECONDS; crowd.setStance(p, 'stand'); }
        break;
      case 'call':
        p.input.facing = Math.atan2(-(p.sourceX - p.x), -(p.sourceZ - p.z));
        if (p.timer <= 0) {
          context.events.queue(GAME_EVENTS.CRIME_WITNESSED, { crimeId: p.crimeId || 'reported_disturbance', offenderId: p.offenderId, witnessId: p.id, position: { x: p.x, y: 0, z: p.z }, heat: witnessHeat(true) });
          p.mode = 'flee';
          p.timer = FLEE_SECONDS;
        }
        break;
      case 'fight': {
        const target = p.offenderId != null ? context.entities.get(p.offenderId) : null;
        if (!target || p.timer <= 0) { p.mode = p.carId != null ? 'return' : 'walk'; p.timer = 20; break; }
        const dx = target.position.x - p.x, dz = target.position.z - p.z, d = Math.hypot(dx, dz) || 1;
        if (d > (p.weaponId ? 40 : 25)) { p.mode = p.carId != null ? 'return' : 'walk'; p.timer = 20; break; }
        if (p.weaponId && shootAt(p, target, dt)) break;
        // An angry driver strides up and shoves; a crew member or a brawler runs in swinging.
        const approach = p.angry ? 2.3 : RUN_SPEED;
        if (d > 1.1) { p.input.moveX = (dx / d) * approach; p.input.moveZ = (dz / d) * approach; }
        else {
          p.input.facing = Math.atan2(-dx, -dz);
          if (thinking && random() < (p.angry ? 0.12 : 0.3)) context.events.queue(GAME_EVENTS.DAMAGE_DEALT, { targetId: target.id, attackerId: p.id, amount: 4, kind: 'melee', weaponId: 'fists', position: { x: target.position.x, y: target.position.y, z: target.position.z }, fatal: false });
        }
        break;
      }
      case 'dragged': {
        // Hauled out of the driver's seat (the run-time's transit places the body), thrown down
        // by the door; then up, and away from the thief at a run.
        const walker = p.body.walker;
        // (A rider thrown off a bike: the ragdoll comes to rest first.) Only someone who ended up
        // on the ground gets up: a driver who climbed out on his feet (exitVehicle dragged: false,
        // the lead cancelled the carjack) runs at once.
        const kind = walker.transit && walker.transit.kind;
        if (kind === 'dragged' || walker.ragdolling) p.floored = true;
        if (kind || walker.ragdolling) break;
        if (!p.rising && !p.floored) { p.mode = 'flee'; p.timer = FLEE_SECONDS; break; }
        if (!p.rising) { p.rising = true; p.timer = 1.8; if (typeof walker.play === 'function') walker.play('getup'); }
        else if (p.timer <= 0) { p.mode = 'flee'; p.timer = FLEE_SECONDS; }
        break;
      }
      case 'down':
        p.fall = Math.min(1, p.fall + dt * 3);
        if (p.timer <= 0 && p.entity.data.health > 0) { p.fall = 0; p.mode = 'flee'; p.timer = FLEE_SECONDS; }
        break;
      case 'dead': p.fall = Math.min(1, p.fall + dt * 3); break;
      default: break;
    }
  }

  /** Writes one person's move input for this frame (mode, company, cars, the lead, obstacles, hands). */
  function steer(p, dt) {
    p.input = p.body.input;
    p.input.facing = NaN;
    p.input.moveX = 0;
    p.input.moveZ = 0;
    p.timer -= dt;
    p.think -= dt;
    const thinking = p.think <= 0;
    if (thinking) { p.think = 0.25; watchCars(p); }
    moveByMode(p, dt, thinking);
    if (p.dodgeTimer > 0) { p.dodgeTimer -= dt; p.input.moveX = p.dodgeX; p.input.moveZ = p.dodgeZ; }
    if (p.mode === 'walk' || p.mode === 'flee' || p.mode === 'wait' || p.mode === 'to_bench') avoid(p);
    // Round the trunks in their pits, poles, benches, shelters and clutter on the pavement.
    if (thinking && p.mode !== 'down' && p.mode !== 'dead' && p.mode !== 'dragged') obstacles.gather(p.x, p.z, p.entity.position.y, p.obstacles);
    // Room for the lead (walkers steer round his ring, the standing step back) and out of the
    // line of his gun; missions' people hold their places.
    const base = p.obstacles.count;
    const staged = p.entity.data.missionGiver || p.entity.data.missionEnemy;
    let leadNear = false;
    if (crowd.lead && !staged && !HOLDS_GROUND.has(p.mode)) {
      if (p.mode !== 'cower') leadNear = keepFromLead(p.x, p.z, crowd.lead.position.x, crowd.lead.position.z, p.input, p.obstacles);
      if (crowd.aiming && thinking) faceTheGun(p);
    }
    if (stepsRound(p) || (leadNear && p.obstacles.count > base)) steerAroundObstacles(p.x, p.z, p.input, p.obstacles, p.side);
    p.obstacles.count = base;
    // Hands follow the mode: phone calls, talk, pointing, the panic run; the gun goes away
    // once the fight is over.
    p.gestureTimer -= dt;
    const gestureMode = p.mode === 'wait' ? 'walk' : p.mode;
    if (gestureMode !== p.gestureMode) {
      p.gestureMode = gestureMode;
      p.gestureTimer = 2 + random() * 3;
      // An idler's pose is crewIdle's; anyone who stops idling drops its stance.
      if (gestureMode !== 'chat') idle.clear(p);
      if (!(gestureMode === 'chat' && p.idleRole)) crowd.setGesture(p, gestureFor(gestureMode, random, Boolean(p.leader)));
    }
    if (p.gun && p.mode !== 'fight' && !(p.mode === 'chat' && p.entity.tags.has(ENTITY_TAGS.HOSTILE))) shooting.holster(p);
    p.entity.data.mode = p.mode;
  }

  return { steer };
}
