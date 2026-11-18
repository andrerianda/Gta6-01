// The stealth objective (catalog kind 'stealth'): sneak along a building's frontage to a door
// while guards of the mission's crew stand watch beside the way. Each guard looks out to the
// street and turns back to check the wall on its own rhythm; inside its cone (visionRange,
// visionDegrees, walls block it) or within earshot of a run or a sprint its suspicion builds
// (full in detectSeconds when plain, slower far off), it turns to look where the lead was, and at
// full it raises the alarm: a beat with the guard staring at the lead, then onDetected:
// 'restart_checkpoint' puts the lead back where the sneak began, anything else fails the mission
// ('detected'). A guard taken down alarms the others near it. Without a crowd it is only "reach
// the door". Pure: the guards, their cones and the walls are the mission world's
// (missionGuards.js); the numbers are guardVision.js. Same contract as objectiveKinds.js.
import { DONE, PENDING, placeOf, planeDistance } from './objectiveBasics.js';
import { guardPosts, hearingOf, hugBase, nextSuspicion, sightOf, sneakLength, stealthRoute, watchYaw, yawToward } from './guardVision.js';

const ALERT_SECONDS = 0.9;     // the alarm beat before the consequence
const GRACE_SECONDS = 2;       // at the start and after a restart nobody notices anything
const INVESTIGATE = 0.3;       // suspicion at which a guard turns to look
const ALARM_REACH = 25;        // metres within which a guard going down alarms the others

/** The stealth kind: begin, update, restore and end over an objective context. */
export function stealthKind() {
  return {
    begin(o) {
      const player = o.world.player();
      const zone = placeOf(o, o.params.zone);
      o.state.time = 0;
      o.state.grace = GRACE_SECONDS;
      o.state.alert = -1;
      o.state.spotted = 0;
      o.state.from = { x: player.x, y: player.y, z: player.z, heading: player.heading };
      o.state.guards = [];
      if (!zone) { o.target = null; return; }
      o.memory.place = zone;
      const spec = o.params.guards || {};
      const count = Math.max(1, Math.min(8, Math.round(spec.count ?? 3)));
      const length = sneakLength(count);
      // Along the frontage, just off the facade, the way that is open (no wall between the door
      // and the goal); else along the marker's line as before. Guards then stand between the
      // sneak and the street, never on it (guardVision.fairPostSpot).
      const hug = hugBase(zone);
      const candidates = [stealthRoute(hug, length, 1), stealthRoute(hug, length, -1)];
      if (hug !== zone) candidates.push(stealthRoute(zone, length, 1), stealthRoute(zone, length, -1));
      const route = (o.world.clearPath && candidates.find((r) => o.world.clearPath(r.from, r.to))) || candidates[0];
      o.state.route = route;
      o.target = o.world.footing ? o.world.footing(route.to) : { x: route.to.x, y: zone.y ?? 0, z: route.to.z };
      const sight = { range: o.params.visionRange ?? 14, degrees: o.params.visionDegrees ?? 70 };
      if (spec.member && o.world.postGuards) o.state.guards = o.world.postGuards(spec.member, guardPosts(route, count), sight) || [];
      o.world.help(o.state.guards.length ? "Keep out of the guards' sight; walk (Alt), don't run" : null);
    },
    update(o, dt) {
      const player = o.world.player();
      if (!o.target) return DONE;
      o.state.time += dt;
      if (o.state.guards.length) {
        const outcome = watch(o, player, dt);
        if (outcome) return outcome;
        if (o.state.alert >= 0) return PENDING;
      }
      return !player.vehicleId && planeDistance(player, o.target) <= 3 ? DONE : PENDING;
    },
    restore(o) {
      o.memory.place = placeOf(o, o.params.zone) || o.memory.place;
    },
    end(o) {
      if (o.state.guards?.length) o.world.releaseGuards?.(o.state.guards);
      o.state.guards = [];
      o.world.help(null);
    },
  };
}

/** One step of the guards' watch; a fail kind when the mission is lost, else null. */
function watch(o, player, dt) {
  const p = o.params;
  const guards = o.state.guards;
  o.world.refreshGuards?.(guards);
  if (o.state.alert >= 0) {
    // The alarm: the guard who saw the lead stares at them for a beat, then the consequence.
    o.state.alert += dt;
    for (const guard of guards) if (guard.alerted && guard.standing) guard.wantYaw = yawToward(guard.x, guard.z, player.x, player.z);
    o.world.driveGuards?.(guards);
    if (o.state.alert < ALERT_SECONDS) return null;
    if (p.onDetected !== 'restart_checkpoint') return 'detected';
    restart(o);
    return null;
  }
  const range = p.visionRange ?? 14, degrees = p.visionDegrees ?? 70, detect = p.detectSeconds ?? 1.8;
  o.state.grace = Math.max(0, o.state.grace - dt);
  const speed = Math.abs(player.speed ?? 0);
  const drawn = Boolean(p.weaponsHolstered) && o.world.holding('aim');
  let spotted = null;
  for (const guard of guards) {
    if (!guard.standing) {
      if (!guard.counted) { guard.counted = true; alarmNear(guards, guard.x, guard.z); }
      continue;
    }
    const distance = Math.hypot(player.x - guard.x, player.z - guard.z);
    let seen = sightOf(guard.x, guard.z, guard.yaw, player.x, player.z, range, degrees);
    if (seen > 0 && o.world.canSee && !o.world.canSee(guard, player)) seen = 0;
    if (seen > 0 && drawn) seen = Math.min(1, seen * 2);
    const sensed = o.state.grace > 0 ? 0 : Math.max(seen, hearingOf(distance, speed));
    guard.seeing = sensed > 0;
    guard.suspicion = nextSuspicion(guard.suspicion, sensed, dt, detect);
    if (sensed > 0) { guard.lastX = player.x; guard.lastZ = player.z; }
    // Suspicious, the guard turns to look where the lead was; calm, back to the rounds.
    guard.wantYaw = guard.suspicion > INVESTIGATE && Number.isFinite(guard.lastX)
      ? yawToward(guard.x, guard.z, guard.lastX, guard.lastZ)
      : watchYaw(guard.post, o.state.time);
    if (guard.suspicion >= 1 && !spotted) spotted = guard;
  }
  o.world.driveGuards?.(guards);
  if (spotted) {
    spotted.alerted = true;
    o.state.alert = 0;
    o.state.spotted += 1;
    o.world.notify(p.onDetected === 'restart_checkpoint' ? 'Spotted! Back to the start' : 'Spotted!');
  }
  return null;
}

/** A guard went down: the others within reach turn to look, nearly alarmed. */
function alarmNear(guards, x, z) {
  for (const guard of guards) {
    if (!guard.standing || Math.hypot(guard.x - x, guard.z - z) > ALARM_REACH) continue;
    guard.suspicion = Math.max(guard.suspicion, 0.9);
    guard.lastX = x;
    guard.lastZ = z;
  }
}

/** Back to where the sneak began, every guard calm again. */
function restart(o) {
  o.state.alert = -1;
  o.state.grace = GRACE_SECONDS;
  for (const guard of o.state.guards) { guard.suspicion = 0; guard.alerted = false; guard.lastX = NaN; guard.lastZ = NaN; }
  o.world.teleport?.(o.state.from);
}
