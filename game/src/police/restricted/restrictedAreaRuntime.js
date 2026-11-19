// The restricted area at run time: reads the lead (on foot, in a car, a boat or an aircraft) and
// the flag base.officerAccess every frame, steps the pure rules (gateChallenge, trespassEscalation,
// saluteRules) and wires what they say to the rest of the game: the guard's lines as radio text
// and subtitles, the gate barrier of the air base, the crime report and the stars, the armed
// response of the police dispatch, the flag base.alarm, the garrison in the crowd
// (baseGarrison.js) and the events RESTRICTED_AREA_CHANGED and BASE_CREW_SALUTED.
import { GAME_COMMANDS } from '../../core/events/gameCommands.js';
import { GAME_EVENTS } from '../../core/events/gameEvents.js';
import { ENTITY_KINDS, ENTITY_TAGS } from '../../core/entities/entityKinds.js';
import { WORLD_FLAGS } from '../../core/state/worldFlags.js';
import { PUNTA_GARZA_AIR_BASE, puntaGarzaToWorld } from '../../catalog/puntaGarzaAirBase.js';
import { createBaseGarrison } from './baseGarrison.js';
import { standsOf, worldPostsOf } from './basePosts.js';
import { GATE_LINES, createGateChallenge, hasOfficerAccess, resetGateChallenge, stepGateChallenge } from './gateChallenge.js';
import { createRestrictedZone } from './restrictedZone.js';
import { runRestrictedAreaStage } from './restrictedAreaStages.js';
import { createSuspicion, standBeside, stepSuspicion } from './saluteRules.js';
import { TRESPASS_STARS, baseAlarmOn, createTrespassRecord, resetTrespassRecord, responseUnitsFor, trespassStars } from './trespassEscalation.js';

/** Metres from the ring within which the rules run at all (the garrison's own range is shorter). */
const PRESENT_RANGE = 420;
/** Metres from a parked aircraft's middle that count as touching it, on top of its radius. */
const TOUCH_MARGIN = 1.2;

/**
 * Creates the run-time of the restricted area of Punta Garza.
 * @param {import('../../core/systems/gameContext.js').GameContext} context
 */
export function createRestrictedAreaRuntime(context) {
  const plan = PUNTA_GARZA_AIR_BASE;
  const zone = createRestrictedZone(plan, puntaGarzaToWorld);
  const posts = worldPostsOf(plan, puntaGarzaToWorld);
  const stands = standsOf(plan, puntaGarzaToWorld);
  const jeepStarts = [...plan.accessRoad.line, ...plan.patrolRoute].map(([e, n]) => puntaGarzaToWorld(e, n));
  const generator = context.random('restrictedArea');
  const random = typeof generator === 'function' ? generator : () => generator.next();
  const challenge = createGateChallenge();
  const record = createTrespassRecord();
  const suspicion = createSuspicion();
  const lead = { id: -1, x: 0, y: 0, z: 0, onFoot: true, speed: 0 };
  const view = { lead: null, distance: Infinity, state: 'outside', access: false, hostile: false, now: 0 };
  const near = [];
  const sent = new Set();
  const stops = [];
  let state = 'outside', time = 0, slow = 0, hurtPending = false, boardPending = false, gateOpen = null, gateTimer = 0;
  let stoodDown = false;
  let alarm = false, expectedStandId = null, staged = false, lastX = NaN, lastZ = NaN, reported = false;

  const find = (name) => context.systems.find(name);
  const garrison = createBaseGarrison(context, zone, posts, {
    random,
    onSalute(member) {
      const p = member.person;
      context.events.emit(GAME_EVENTS.BASE_CREW_SALUTED, { crewId: member.post.id, role: member.role, position: { x: p.x, y: p.entity.position.y, z: p.z } });
    },
  });

  function say(line, urgent) {
    const seconds = 3.5;
    context.events.emit(GAME_EVENTS.RADIO_MESSAGE, {
      channel: 'guard', speakerId: 'gate_guard_1', speakerName: 'Gate guard', lineId: line.lineId, text: line.text, seconds, urgent: Boolean(urgent),
    });
    if (context.commands.has(GAME_COMMANDS.UI_SHOW_SUBTITLE)) context.commands.send(GAME_COMMANDS.UI_SHOW_SUBTITLE, { speakerName: 'Gate guard', text: line.text, seconds });
  }

  /** Reads the lead; false while there is none. */
  function readLead(dt) {
    const entity = context.entities.firstWithTag(ENTITY_TAGS.PLAYER);
    if (!entity) return false;
    lead.id = entity.id;
    lead.x = entity.position.x; lead.y = entity.position.y; lead.z = entity.position.z;
    lead.onFoot = entity.kind === ENTITY_KINDS.CHARACTER;
    if (Number.isFinite(lastX) && dt > 0) {
      const step = Math.hypot(lead.x - lastX, lead.z - lastZ) / dt;
      // A cut (a teleport) is not a sprint.
      lead.speed = step > 60 ? 0 : lead.speed + (step - lead.speed) * Math.min(1, dt * 4);
    }
    lastX = lead.x; lastZ = lead.z;
    return true;
  }

  /** Metres of the lead above the ground (or the sea) under him. */
  function heightOfLead() {
    const city = find('openWorldCity');
    const ground = city && typeof city.groundHeightAt === 'function' ? city.groundHeightAt(lead.x, lead.z) : 0;
    return lead.y - Math.max(0, Number.isFinite(ground) ? ground : 0);
  }

  function weaponDrawn() {
    if (!lead.onFoot) return false;
    const combat = find('combat');
    const weapon = combat && combat.inventory ? combat.inventory.weapon : null;
    return Boolean(weapon && weapon.id && weapon.id !== 'fists') || Boolean(combat && combat.aiming);
  }

  /** A parked military aircraft under the lead's hand (on foot, inside the ring). */
  function touchesAircraft() {
    if (!lead.onFoot || !zone.contains(lead.x, lead.z)) return false;
    context.entities.within(lead.x, lead.z, 14, null, near);
    let touched = false;
    for (let i = 0; i < near.length && !touched; i += 1) {
      const e = near[i];
      if (e.kind !== ENTITY_KINDS.VEHICLE || !e.tags.has(ENTITY_TAGS.AIRCRAFT)) continue;
      touched = Math.hypot(e.position.x - lead.x, e.position.z - lead.z) < Math.min(12, (e.radius || 3)) + TOUCH_MARGIN;
    }
    near.length = 0;
    return touched;
  }

  /** Where the response jeep starts: the point of the access road or the patrol loop nearest the lead, but not on top of him. */
  function jeepStartFor(x, z) {
    let best = null, bestD = Infinity;
    for (let i = 0; i < jeepStarts.length; i += 1) {
      const d = Math.hypot(jeepStarts[i].x - x, jeepStarts[i].z - z);
      if (d > 60 && d < 260 && d < bestD) { best = jeepStarts[i]; bestD = d; }
    }
    return best;
  }

  function setGate(open) {
    gateTimer = 1;
    const base = find('airBase');
    if (base && typeof base.setGateOpen === 'function') { if (gateOpen !== open || base.gate?.open !== open) base.setGateOpen(open); }
    gateOpen = open;
  }

  /** The stars and the armed response of a trespass (twice a second). */
  function enforce() {
    const wanted = find('wantedLevel');
    const stars = trespassStars(record);
    if (wanted) {
      if (!reported && typeof wanted.report === 'function') {
        wanted.report({ crimeId: TRESPASS_STARS.crimeId, offenderId: lead.id, position: { x: lead.x, y: lead.y, z: lead.z } });
        reported = true;
      }
      if (wanted.level < stars && typeof wanted.setLevel === 'function') wanted.setLevel(stars);
    }
    const dispatch = find('policeDispatch');
    if (!dispatch || typeof dispatch.spawnUnit !== 'function') return;
    for (const kind of responseUnitsFor(stars)) {
      if (sent.has(kind)) continue;
      sent.add(kind);
      let unitId = null;
      if (kind === 'air_guard_team') {
        // From the base side: the jeep comes up the access road, from the junction or from the apron end.
        const from = jeepStartFor(lead.x, lead.z);
        if (from) unitId = dispatch.spawnUnit(kind, { x: from.x, z: from.z }, Math.atan2(-(lead.x - from.x), -(lead.z - from.z)));
      }
      if (unitId === null || unitId === undefined) dispatch.spawnUnit('tactical_team');
    }
  }

  function changeState(next) {
    if (next === state) return;
    const previous = state;
    state = next;
    if (next === 'trespassing') {
      resetTrespassRecord(record);
      sent.clear();
      reported = false;
      slow = 0;
      say(GATE_LINES.alarm, true);
    } else if (next === 'cleared' && previous !== 'trespassing') say(GATE_LINES.welcome, false);
    context.events.emit(GAME_EVENTS.RESTRICTED_AREA_CHANGED, { areaId: plan.id, state: next, previous });
  }

  const runtime = {
    zone,
    posts,
    get state() { return state; },
    get suspicion() { return suspicion.value; },
    get suspicionCause() { return suspicion.cause; },
    get people() { return garrison.people; },
    /** Seconds left of the gate challenge (8 when not challenged). */
    get countdown() { return challenge.countdown; },
    /** The stars the running trespass asks for (0 when none). */
    get trespassStars() { return state === 'trespassing' ? trespassStars(record) : 0; },
    /** Whether the lead passes as the expected officer now (the flag, not revoked this visit). */
    get officerAccess() { return hasOfficerAccess(context.flags.get(WORLD_FLAGS.BASE_OFFICER_ACCESS), challenge); },
    /** The stand the officer was sent to (lingering by another raises suspicion); null: none. */
    setExpectedStand(standId) { expectedStandId = standId || null; },
    isInside: (x, z) => zone.contains(x, z),
    garrison,

    start() {
      const on = (topic, handler) => { context.events.on(topic, handler); stops.push(() => context.events.off(topic, handler)); };
      on(GAME_EVENTS.DAMAGE_DEALT, ({ attackerId, targetId, position }) => {
        if (attackerId === null || attackerId === undefined || attackerId === targetId) return;
        const attacker = context.entities.get(attackerId);
        const player = find('player');
        if (!(attacker && attacker.tags.has(ENTITY_TAGS.PLAYER)) && !(player && player.entity && player.entity.id === attackerId)) return;
        const at = position || lead;
        if (zone.distanceOutside(at.x, at.z) < 60) hurtPending = true;
      });
      // Shot down or arrested: the visit is over; the guards stand down until he has gone (or is taken) away.
      const over = () => { stoodDown = true; };
      on(GAME_EVENTS.PLAYER_WASTED, over);
      on(GAME_EVENTS.PLAYER_BUSTED, over);
      on(GAME_EVENTS.VEHICLE_ENTERED,({ vehicleId, isPlayer }) => {
        const vehicle = isPlayer ? context.entities.get(vehicleId) : null;
        if (vehicle && vehicle.tags.has(ENTITY_TAGS.AIRCRAFT) && zone.contains(vehicle.position.x, vehicle.position.z)) boardPending = true;
      });
    },

    update(dt) {
      time += dt;
      if (!readLead(dt)) return;
      if (!staged) { staged = true; if (runRestrictedAreaStage(context, runtime, plan)) { lastX = NaN; return; } }
      const ringDistance = zone.distanceOutside(lead.x, lead.z);
      const present = ringDistance < PRESENT_RANGE;
      const wantedSystem = find('wantedLevel');
      const wanted = wantedSystem ? wantedSystem.level : 0;
      if (!present && (stoodDown || (state === 'outside' && !challenge.revoked && !challenge.trespassed))) {
        if (stoodDown) { resetGateChallenge(challenge); changeState('outside'); }
        // Far from the base: nothing to rule on; the posts stand empty.
        view.lead = null;
        stoodDown = false;
        garrison.update(dt, view);
        if (alarm) { alarm = false; context.flags.set(WORLD_FLAGS.BASE_ALARM, false); }
        hurtPending = false; boardPending = false;
        return;
      }
      if (stoodDown) {
        // He lies there or sits in cuffs: no more stars, no more fire.
        resetGateChallenge(challenge);
        changeState('outside');
        if (alarm) { alarm = false; context.flags.set(WORLD_FLAGS.BASE_ALARM, false); }
        view.lead = lead; view.distance = ringDistance; view.state = state; view.access = false; view.hostile = false; view.now = time;
        garrison.update(dt, view);
        hurtPending = false; boardPending = false;
        return;
      }
      const flag = context.flags.get(WORLD_FLAGS.BASE_OFFICER_ACCESS);
      const inside = zone.containsAt(lead.x, lead.z, heightOfLead());
      const gateDistance = zone.distanceToGate(lead.x, lead.z);
      const drawn = weaponDrawn();
      const offence = drawn || hurtPending;
      const next = stepGateChallenge(challenge, {
        inside, ringDistance: inside ? 0 : ringDistance, gateDistance, challengeRadius: zone.gate.radius, access: flag, offence, present, wanted,
      }, dt);
      if (challenge.line) say(GATE_LINES[challenge.line], challenge.line === 'last');
      changeState(next);
      const access = hasOfficerAccess(flag, challenge);

      // The barrier: up for the officer at the gate, down behind him and for everyone else.
      gateTimer -= dt;
      const open = access && gateDistance < zone.gate.radius + 6;
      if (open !== gateOpen || gateTimer <= 0) setGate(open);

      if (state === 'trespassing') {
        if (inside) record.seconds += dt;
        if (drawn) record.weaponDrawn = true;
        if (hurtPending) record.hurtSomeone = true;
        if (boardPending) record.boardedAircraft = true;
        slow -= dt;
        if (slow <= 0) {
          slow = 0.5;
          if (touchesAircraft()) record.touchedAircraft = true;
          enforce();
        }
      }
      hurtPending = false;
      boardPending = false;

      const alarmNow = baseAlarmOn(state, wanted);
      if (alarmNow !== alarm) { alarm = alarmNow; context.flags.set(WORLD_FLAGS.BASE_ALARM, alarm); }

      view.lead = lead;
      view.distance = ringDistance;
      view.state = state;
      view.access = access;
      view.hostile = state === 'trespassing' || (challenge.trespassed && wanted > 0);
      view.now = time;
      garrison.update(dt, view);

      stepSuspicion(suspicion, {
        cleared: state === 'cleared', speed: lead.onFoot ? lead.speed : 0, bumps: garrison.takeBumps(),
        standId: state === 'cleared' && lead.onFoot ? standBeside(stands, lead.x, lead.z) : null, expectedStandId,
      }, dt);
    },

    dispose() {
      for (const stop of stops.splice(0)) stop();
      garrison.dispose();
      if (alarm) context.flags.set(WORLD_FLAGS.BASE_ALARM, false);
    },
  };
  return runtime;
}
