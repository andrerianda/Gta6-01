// The people of the base in the crowd: mans the plan's posts while the lead is within a few
// hundred metres (guards and the duty officer as sentries, ground crew as workers; all crowd
// people, so they are drawn, hurt and shot like anyone) and empties them when he is far. Each
// frame it tells them what the rules ask: guards watch their post, raise a hand at the gate,
// step aside and salute the expected officer, or turn their rifles on a trespasser (the crowd's
// own 'fight' with a gun); ground crew walk their round between post and aircraft, crouch to
// inspect, salute, or take cover when the shooting starts. Poses are the character run-time's
// gestures ('salute', 'halt') and stances ('crouch').
import { ENTITY_TAGS } from '../../core/entities/entityKinds.js';
import { CREW_ROUND, gateGuardSpot, garrisonManned, nextCrewPhase } from './basePosts.js';
import { createSaluteRecord, maySalute, saluteEnds, startSalute } from './saluteRules.js';

/** Metres: a guard this near a trespasser fights; further off (to RUN) he runs in; crew this near take cover. */
const FIGHT_RANGE = 36, RUN_RANGE = 150, COVER_RANGE = 70;
/** Metres from the gate within which its guards step aside for the officer. */
const ASIDE_RANGE = 42;

/**
 * Creates the garrison.
 * @param {import('../../core/systems/gameContext.js').GameContext} context
 * @param {ReturnType<import('./restrictedZone.js').createRestrictedZone>} zone
 * @param {ReturnType<import('./basePosts.js').worldPostsOf>} posts
 * @param {{onSalute: (member: object) => void, random: () => number}} hooks
 */
export function createBaseGarrison(context, zone, posts, hooks) {
  const members = posts.map((post) => ({
    post, role: post.role, person: null, salute: createSaluteRecord(), phase: 'idle', phaseLeft: 4 + hooks.random() * 12,
    spot: { x: post.x, z: post.z, speed: CREW_ROUND.speed }, bumpAt: -10,
  }));
  /** What other systems read: one row a member, rewritten in place. */
  const people = [];
  const chase = { x: 0, z: 0, speed: 3.4 };
  const spot = { x: 0, z: 0 };
  let manned = false, bumps = 0;

  const crowdOf = () => {
    const pedestrians = context.systems.find('pedestrians');
    return pedestrians && pedestrians.simulation ? pedestrians.simulation : null;
  };
  const alive = (p) => p && !p.removed && p.mode !== 'dead';
  const yawTo = (p, x, z) => Math.atan2(-(x - p.x), -(z - p.z));

  function gesture(p, name) {
    if (p.gesture === name) return;
    try { p.body.walker.setGesture(name); } catch { /* an older run-time without the pose: stand */ }
    p.gesture = name;
  }

  function stance(p, name) {
    if (p.stance === name) return;
    try { p.body.walker.setStance(name); p.stance = name; } catch { /* keep standing */ }
  }

  function man() {
    const crowd = crowdOf();
    if (!crowd || typeof crowd.postSentry !== 'function') return false;
    for (const m of members) {
      if (m.person && !m.person.removed) continue;
      const data = { baseCrew: m.post.id, baseRole: m.role };
      const p = m.role === 'groundCrew'
        ? crowd.placeAt(m.post.archetypeId, m.post.x, m.post.z, { mode: 'chat', heading: m.post.yaw, data: { posted: true, ...data } })
        : crowd.postSentry(m.post.archetypeId, m.post.x, m.post.z, m.post.yaw, data);
      m.person = p || null;
      if (!p) continue;
      p.ownPose = m.role === 'guard' ? null : m.role;
      p.post = { x: m.post.x, z: m.post.z, speed: 1.5 };
      m.spot.x = m.post.x; m.spot.z = m.post.z;
      m.phase = 'idle';
      m.salute.saluting = false;
      m.salute.readyAt = 0;
    }
    manned = true;
    return true;
  }

  function empty() {
    const crowd = crowdOf();
    for (const m of members) {
      if (m.person && !m.person.removed && crowd) crowd.removePerson(m.person);
      m.person = null;
    }
    people.length = 0;
    manned = false;
  }

  /** Back on the post, standing: after a fight, a fright or a knock. */
  function recover(m, p) {
    if (p.mode === 'chat') return true;
    if (p.mode === 'down' || p.mode === 'dragged' || p.mode === 'fight' || p.mode === 'cower') return false;
    p.mode = 'chat';
    p.timer = Infinity;
    p.leader = null;
    stance(p, 'stand');
    return true;
  }

  /** A guard against a trespasser: fights within range (the crowd's gun handling), runs in from further off. */
  function engage(m, p, lead, d) {
    if (m.salute.saluting) { m.salute.saluting = false; gesture(p, null); }
    p.ownPose = null;
    if (p.mode === 'down' || p.mode === 'dragged') return;
    if (d < FIGHT_RANGE) {
      context.entities.addTag(p.entity, ENTITY_TAGS.HOSTILE);
      p.mode = 'fight';
      p.offenderId = lead.id;
      p.timer = 14;
      p.provoked = true;
      p.sentTo = null;
    } else if (d < RUN_RANGE && p.mode !== 'fight') {
      p.mode = 'chat';
      p.timer = Infinity;
      chase.x = lead.x; chase.z = lead.z;
      p.sentTo = chase;
    }
  }

  /** A crew member when the shooting starts: down behind whatever is there. */
  function takeCover(p, lead) {
    if (p.mode === 'cower' || p.mode === 'down' || p.mode === 'dragged') return;
    gesture(p, null);
    p.sentTo = null;
    p.mode = 'cower';
    p.timer = 9;
    p.sourceX = lead.x; p.sourceZ = lead.z;
    stance(p, 'crouch');
  }

  /** The salute of one member this frame; true while he salutes. */
  function salutes(m, p, lead, access, now) {
    const s = m.salute;
    const busy = p.mode !== 'chat' || (p.sentTo && Math.hypot(p.sentTo.x - p.x, p.sentTo.z - p.z) > 1.2 && m.role !== 'groundCrew');
    spot.x = p.x; spot.z = p.z; spot.yaw = p.body.walker.state ? p.body.walker.state.yaw : p.facing; spot.busy = busy;
    if (s.saluting) {
      if (saluteEnds(s, m.role, spot, lead, access, now)) { gesture(p, null); p.facing = m.post.yaw; return false; }
    } else if (lead && maySalute(s, spot, lead, access, now)) {
      startSalute(s, spot, lead, now);
      hooks.onSalute(m);
    }
    if (!s.saluting) return false;
    // Turned to him, standing still, the hand at the brow.
    p.sentTo = null;
    p.ownPose = 'salute';
    p.facing = yawTo(p, lead.x, lead.z);
    stance(p, 'stand');
    gesture(p, 'salute');
    return true;
  }

  /** The round of a ground crew member: idle at the post, over to the aircraft, crouch, back. */
  function crewRound(m, p, dt) {
    m.phaseLeft -= dt;
    const target = m.phase === 'toWork' || m.phase === 'inspect' ? m.post.workX : m.post.x;
    const targetZ = m.phase === 'toWork' || m.phase === 'inspect' ? m.post.workZ : m.post.z;
    const arrived = Math.hypot(target - p.x, targetZ - p.z) < 0.7;
    const next = nextCrewPhase(m.phase, arrived, m.phaseLeft, hooks.random);
    if (next) { m.phase = next.phase; m.phaseLeft = next.seconds; }
    const working = m.phase === 'toWork' || m.phase === 'inspect';
    m.spot.x = working ? m.post.workX : m.post.x;
    m.spot.z = working ? m.post.workZ : m.post.z;
    m.spot.speed = CREW_ROUND.speed;
    p.sentTo = m.spot;
    p.ownPose = 'groundCrew';
    gesture(p, null);
    if (m.phase === 'inspect' && arrived) {
      // Down by the gear, looking at the aircraft.
      stance(p, 'crouch');
      p.facing = Math.atan2(-(m.post.workX - m.post.x), -(m.post.workZ - m.post.z));
    } else {
      stance(p, 'stand');
      if (m.phase === 'idle') p.facing = m.post.yaw;
    }
  }

  return {
    /** Rows {id, role, postId, x, z, saluting} of the living people of the base. */
    people,
    get manned() { return manned; },
    /** People the cleared lead walked into since the last call. */
    takeBumps() { const n = bumps; bumps = 0; return n; },
    /** The member row of a post id (tests and stages), or null. */
    memberOf: (postId) => members.find((m) => m.post.id === postId) || null,
    empty,
    /**
     * Once a frame.
     * @param {number} dt
     * @param {{lead: {id: number, x: number, z: number, onFoot: boolean} | null, distance: number, state: string,
     *   access: boolean, hostile: boolean, now: number}} view distance: metres outside the ring (0 inside).
     */
    update(dt, view) {
      const wanted = Boolean(view.lead) && garrisonManned(manned, view.distance);
      if (!wanted) { if (manned) empty(); return; }
      // The fallen are not replaced during a visit: the posts are manned afresh when he comes back.
      if (!manned && !man()) return;
      const lead = view.lead;
      const nearGate = zone.distanceToGate(lead.x, lead.z) < ASIDE_RANGE;
      let rows = 0;
      for (const m of members) {
        const p = m.person;
        if (!p || p.removed) continue;
        if (!alive(p)) continue;
        const d = Math.hypot(lead.x - p.x, lead.z - p.z);
        const armed = m.role !== 'groundCrew';
        if (view.hostile) {
          if (armed) engage(m, p, lead, d);
          else if (d < COVER_RANGE || p.mode !== 'chat') { if (p.mode === 'walk' || p.mode === 'chat') takeCover(p, lead); }
        } else if (recover(m, p)) {
          if (p.entity.tags.has(ENTITY_TAGS.HOSTILE)) context.entities.removeTag(p.entity, ENTITY_TAGS.HOSTILE);
          if (p.sentTo === chase) p.sentTo = p.post;
          // The cleared lead walking into someone.
          if (view.access && lead.onFoot && d < 0.8 && view.now - m.bumpAt > 3) { m.bumpAt = view.now; bumps += 1; }
          if (!salutes(m, p, lead, view.access, view.now)) {
            if (m.role === 'groundCrew') crewRound(m, p, dt);
            else if (m.post.atGate && view.state === 'challenged') {
              // The hand up, eyes on him.
              p.ownPose = 'halt';
              p.sentTo = p.post;
              p.facing = yawTo(p, lead.x, lead.z);
              stance(p, 'stand');
              gesture(p, 'halt');
            } else {
              if (p.ownPose === 'halt' || p.ownPose === 'salute') { gesture(p, null); p.facing = m.post.yaw; }
              p.ownPose = m.role === 'guard' ? null : m.role;
              if (m.role === 'officer') gesture(p, null);
              // Gate guards clear the road for the officer, and take it again behind him.
              if (m.post.atGate) {
                gateGuardSpot(m.post, zone.gate, view.access && nearGate, m.spot);
                m.spot.speed = 1.4;
                p.sentTo = m.spot;
              } else p.sentTo = p.post;
            }
          }
        }
        const row = people[rows] || (people[rows] = { id: 0, role: '', postId: '', x: 0, z: 0, saluting: false });
        row.id = p.id; row.role = m.role; row.postId = m.post.id; row.x = p.x; row.z = p.z; row.saluting = m.salute.saluting;
        rows += 1;
      }
      people.length = rows;
    },
    dispose: empty,
  };
}
