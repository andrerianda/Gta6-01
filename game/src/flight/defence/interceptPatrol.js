// The Halcón pair as a state machine: idle on the alert pads, scramble, intercept, formate on the
// lead's wing, order him by radio, escort him if he complies, warning shots and then fire if he
// does not, search when the track is lost, return to base, and break off at the border once the
// sea is open. It moves the two interceptors with interceptorSteering.js and reports what happened
// as events (stage changes, radio lines, cannon bursts) for the runtime to publish and draw.
// Pure: runs in Node; the only randomness is the `random` function it is given.
import { angleDifference, createInterceptorState, formationSlot, keepStation, maxSpeedAt, steerTowards, takeOffStep } from './interceptorSteering.js';
import { trackSourceOf } from './interceptTracking.js';
import { createLeadBehaviour } from './leadBehaviour.js';
import { burstHitChance } from './interceptorGunnery.js';

const ENGAGED = new Set(['intercept', 'formate', 'order', 'warningShots', 'fire', 'escort']);

/**
 * Creates the patrol.
 * @param {{tuning: object, callsigns: string[], random?: () => number, centre: {x: number, z: number}, clearRadius: number,
 *   borderRadius: number, base: {x: number, z: number, pads: Array<{x: number, z: number, heading: number}>,
 *   runway: {x0: number, z0: number, x1: number, z1: number, y: number, heading: number}}}} setup
 *   Headings in radians; `random` returns 0..1.
 */
export function createInterceptPatrol(setup) {
  const { tuning, base, centre } = setup;
  const random = setup.random ?? Math.random;
  const interceptors = [createInterceptorState('air_guard_1', setup.callsigns[0]), createInterceptorState('air_guard_2', setup.callsigns[1])];
  const behaviour = createLeadBehaviour();
  const events = [];
  const slot = { x: 0, y: 0, z: 0 };
  const lastKnown = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, valid: false };
  const station = { vx: 0, vy: 0, vz: 0, heading: 0, roll: 0 };
  const timers = { stage: 0, patience: 0, burst: 0, lines: 0, lost: 0, check: 0, joined: 0, defiance: 0, inbound: 0, search: 0 };

  const patrol = {
    /** One of INTERCEPT_STAGES. */
    stage: 'idle',
    /** Why the pair is up: 'boundary', 'stolenAircraft', 'alert', 'command', ... */
    reason: null,
    interceptors,
    /** What happened since the caller last emptied it: {type: 'stage'|'radio'|'burst'|'standDown', ...}. */
    events,
    behaviour,
    /** 'guidance' | 'own' | null: how the pair holds the lead now. */
    trackSource: null,
    /** Metres from Uno to his slot (formation or gun position); Infinity when not flying one. */
    slotDistance: Infinity,
    /** True after the pair broke off at the border, until the lead comes back inside it. */
    brokeOffAtBorder: false,
    lastKnown,

    reset() {
      events.length = 0;
      park();
      patrol.stage = 'idle';
      patrol.reason = null;
      patrol.trackSource = null;
      patrol.brokeOffAtBorder = false;
      patrol.slotDistance = Infinity;
      lastKnown.valid = false;
      behaviour.reset();
      for (const key in timers) timers[key] = 0;
      for (const craft of interceptors) craft.stage = 'idle';
    },

    /**
     * Sends the pair after the lead. From the pads they take off for real when he is within sight
     * of the base, otherwise they appear climbing out over it after the scramble delay.
     * @returns {boolean} False when they are already up (or have just broken off at the border).
     */
    scramble(reason, lead) {
      if (ENGAGED.has(patrol.stage) || patrol.stage === 'scramble' || patrol.stage === 'searching') return false;
      if (patrol.brokeOffAtBorder) return false;
      patrol.reason = reason ?? 'command';
      if (lead) remember(lead);
      behaviour.acknowledge();
      if (patrol.stage === 'returning') {
        setStage('intercept');
        return true;
      }
      const near = lead ? Math.hypot(lead.x - base.x, lead.z - base.z) < tuning.scramble.sightDistance : false;
      park();
      for (let i = 0; i < interceptors.length; i += 1) {
        interceptors[i].phase = near ? 'hold' : 'wait';
        interceptors[i].timer = tuning.scramble.delaySeconds + i * tuning.scramble.wingmanDelaySeconds;
      }
      setStage('scramble');
      return true;
    },

    /** Ends the interception: the pair flies home (or simply stays parked). */
    standDown(reason) {
      if (patrol.stage === 'idle' || patrol.stage === 'returning') return;
      events.push({ type: 'standDown', reason: reason ?? 'command' });
      if (patrol.stage === 'scramble' && interceptors[0].phase !== 'air') {
        patrol.reset();
        events.push({ type: 'stage', stage: 'idle', previous: 'scramble' });
        return;
      }
      setStage('returning');
    },

    /** The lead's aircraft is down: a last call, and home. */
    targetDown() {
      if (patrol.stage === 'idle') return;
      radio('airGuard.splash');
      patrol.standDown('shotDown');
    },

    /**
     * Puts the pair in the air around the lead for a capture or a test: 'intercept' (2 km behind,
     * inbound), 'wing' (in formation), 'shots' (in formation, warning shots).
     */
    place(staging, lead, reason = 'stage') {
      patrol.reason = reason;
      patrol.brokeOffAtBorder = false;
      remember(lead);
      behaviour.reset();
      for (let i = 0; i < interceptors.length; i += 1) {
        const craft = interceptors[i];
        formationSlot(lead, tuning.formation.slots[i], slot);
        const back = staging === 'intercept' ? 2000 + i * 150 : 0;
        craft.x = slot.x - Math.sin(lead.heading) * back;
        craft.z = slot.z + Math.cos(lead.heading) * back;
        craft.y = slot.y;
        craft.heading = lead.heading;
        craft.speed = Math.min(maxSpeedAt(craft.y, tuning.envelope), Math.max(lead.speed, tuning.envelope.minSpeed));
        craft.bank = craft.pitch = craft.verticalSpeed = 0;
        craft.phase = 'air';
        craft.gear = 0;
      }
      setStage(staging === 'intercept' ? 'intercept' : staging === 'shots' ? 'warningShots' : 'formate');
      if (staging === 'shots') radio('airGuard.warningShots');
    },

    /**
     * Advances the patrol.
     * @param {object | null} lead The lead's aircraft this step ({x, y, z, vx, vy, vz, speed, heading, roll, onGround,
     *   autopilot, signature, heightAboveSurface}), or null when he flies nothing.
     * @param {{guidance?: boolean, heightAt?: Function | null, seaOpen?: boolean, weaponsFree?: boolean, relentless?: boolean}} env
     * @param {number} dt Seconds.
     */
    update(lead, env, dt) {
      if (patrol.stage === 'idle') return;
      timers.stage += dt;
      if (lead) behaviour.update(lead, dt, centre.x, centre.z);

      // Whoever is still on the ground keeps taking off, whatever the leader of the pair does.
      for (let i = 0; i < interceptors.length; i += 1) {
        const craft = interceptors[i];
        if (craft.phase === 'wait') {
          craft.timer -= dt;
          if (craft.timer <= 0) appearAirborne(craft, i);
        } else if (craft.phase !== 'air' && craft.phase !== 'parked') {
          const wasHolding = craft.phase === 'hold';
          takeOffStep(craft, base.runway, dt, tuning.scramble);
          if (i === 0 && wasHolding && craft.phase !== 'hold') radio('airGuard.scramble');
        }
      }

      if (patrol.stage === 'scramble') {
        if (interceptors[0].phase === 'air') setStage('intercept');
        return;
      }
      if (patrol.stage === 'returning') {
        flyHome(dt);
        return;
      }

      // The border: with the sea open the pair gives up there.
      if (env.seaOpen && Math.hypot(interceptors[0].x - centre.x, interceptors[0].z - centre.z) > setup.borderRadius) {
        radio('airGuard.border');
        patrol.brokeOffAtBorder = true;
        events.push({ type: 'standDown', reason: 'border' });
        setStage('returning');
        return;
      }
      if (!lead) {
        patrol.standDown('leadGone');
        return;
      }

      // The track: ground guidance, or their own radar and eyes.
      timers.check -= dt;
      if (timers.check <= 0) {
        timers.check = tuning.tracking.checkEvery;
        patrol.trackSource = trackSourceOf(interceptors, lead, env, tuning.tracking);
      }
      if (patrol.trackSource) {
        remember(lead);
        timers.lost = 0;
      } else {
        timers.lost += dt;
        lastKnown.age += dt;
      }

      if (patrol.stage === 'searching') {
        if (patrol.trackSource) {
          radio('airGuard.reacquired');
          setStage('intercept');
        } else {
          search(dt);
          return;
        }
      } else if (timers.lost > tuning.tracking.coastSeconds) {
        radio('airGuard.lost');
        timers.search = 0;
        setStage('searching');
        return;
      }

      const outside = Math.hypot(lead.x - centre.x, lead.z - centre.z) > setup.clearRadius;
      const complying = !env.relentless && (behaviour.rocking || (outside ? behaviour.inbound : behaviour.landed));
      // Beyond the weapons-free radius they shoot without further orders, unless he is flying back in.
      const free = Boolean(env.weaponsFree) && !behaviour.inbound;
      const gun = patrol.stage === 'fire';
      fly(lead, gun ? tuning.formation.gunSlots : tuning.formation.slots, dt);

      switch (patrol.stage) {
        case 'intercept':
          if (free && rangeTo(interceptors[0], lead) < tuning.gunnery.maxRange) openFire();
          else if (patrol.slotDistance < tuning.formation.joinedDistance) {
            radio('airGuard.contact');
            setStage('formate');
          }
          break;
        case 'formate':
          if (free) openFire();
          else if (timers.stage >= tuning.formation.settleSeconds) {
            timers.patience = 0;
            timers.lines = 0;
            setStage('order');
          }
          break;
        case 'order': {
          if (free) { openFire(); break; }
          if (complying) { comply('airGuard.complied'); break; }
          const due = tuning.order.lineSeconds;
          timers.patience += dt * (behaviour.evading ? tuning.order.evasionFactor : 1);
          while (timers.lines < due.length && timers.patience >= due[timers.lines]) {
            timers.lines += 1;
            radio(`airGuard.order${timers.lines}`);
          }
          if (timers.patience >= tuning.order.patienceSeconds) {
            radio('airGuard.warningShots');
            timers.burst = 0.6;
            setStage('warningShots');
          }
          break;
        }
        case 'warningShots':
          if (free) { openFire(); break; }
          if (complying) { comply('airGuard.complied'); break; }
          timers.burst -= dt;
          if (timers.burst <= 0) {
            timers.burst = tuning.order.warningBurstEvery;
            events.push({ type: 'burst', shooter: 0, kind: 'warning', hit: false });
          }
          if (timers.stage >= tuning.order.warningShotsSeconds) openFire();
          break;
        case 'fire': {
          timers.inbound = complying ? timers.inbound + dt : 0;
          if (timers.inbound > 2.5) { comply('airGuard.ceaseFire'); break; }
          timers.burst -= dt;
          if (timers.burst <= 0) {
            const shooter = interceptors[0];
            const chance = burstHitChance(shooter, lead, behaviour.manoeuvre, tuning.gunnery);
            if (chance > 0) {
              timers.burst = tuning.gunnery.burstEvery;
              events.push({ type: 'burst', shooter: 0, kind: 'fire', hit: random() < chance, chance });
            }
          }
          break;
        }
        case 'escort': {
          const defying = outside && behaviour.outbound && !behaviour.rocking;
          timers.defiance = defying || env.relentless ? timers.defiance + dt : 0;
          if (timers.defiance > tuning.order.escortDefianceSeconds || free) {
            // Back to the last order, with little patience left.
            behaviour.acknowledge();
            timers.lines = tuning.order.lineSeconds.length - 1;
            timers.patience = tuning.order.lineSeconds[timers.lines];
            setStage('order');
          } else if (behaviour.landed || (timers.stage >= tuning.order.escortSeconds && !outside)) {
            radio('airGuard.standDown');
            patrol.standDown(behaviour.landed ? 'landed' : 'complied');
          }
          break;
        }
        default:
      }
    },
  };

  function setStage(stage) {
    if (stage === patrol.stage) return;
    const previous = patrol.stage;
    patrol.stage = stage;
    timers.stage = 0;
    timers.defiance = timers.inbound = 0;
    if (!ENGAGED.has(stage)) patrol.slotDistance = Infinity;
    if (stage === 'idle' || stage === 'returning') patrol.trackSource = null;
    for (const craft of interceptors) craft.stage = stage;
    events.push({ type: 'stage', stage, previous });
  }

  function radio(lineId) {
    events.push({ type: 'radio', lineId });
  }

  function openFire() {
    radio('airGuard.fire');
    timers.burst = 1.2;
    setStage('fire');
  }

  function comply(lineId) {
    radio(lineId);
    behaviour.acknowledge();
    setStage('escort');
  }

  function remember(lead) {
    lastKnown.x = lead.x;
    lastKnown.y = lead.y;
    lastKnown.z = lead.z;
    lastKnown.vx = lead.vx;
    lastKnown.vy = lead.vy;
    lastKnown.vz = lead.vz;
    lastKnown.age = 0;
    lastKnown.valid = true;
  }

  function rangeTo(craft, lead) {
    return Math.hypot(lead.x - craft.x, lead.y - craft.y, lead.z - craft.z);
  }

  function park() {
    for (let i = 0; i < interceptors.length; i += 1) {
      const craft = interceptors[i];
      const pad = base.pads[i];
      craft.x = pad.x;
      craft.z = pad.z;
      craft.y = base.runway.y;
      craft.heading = pad.heading;
      craft.speed = craft.bank = craft.pitch = craft.verticalSpeed = 0;
      craft.phase = 'parked';
      craft.side = 0;
      craft.gear = 1;
      craft.afterburner = false;
    }
  }

  function appearAirborne(craft, index) {
    const tx = lastKnown.valid ? lastKnown.x : centre.x;
    const tz = lastKnown.valid ? lastKnown.z : centre.z;
    craft.heading = Math.atan2(tx - base.x, -(tz - base.z));
    craft.x = base.x - Math.sin(craft.heading) * index * 140 + Math.cos(craft.heading) * index * 60;
    craft.z = base.z + Math.cos(craft.heading) * index * 140 + Math.sin(craft.heading) * index * 60;
    craft.y = tuning.scramble.airborneHeight + index * 40;
    craft.speed = tuning.scramble.airborneSpeed;
    craft.verticalSpeed = 30;
    craft.bank = 0;
    craft.gear = 0;
    craft.phase = 'air';
    if (index === 0) radio('airGuard.scramble');
  }

  /** Pursuit and station keeping for every airborne interceptor, on the live lead or on dead reckoning. */
  function fly(lead, slots, dt) {
    const tracked = patrol.trackSource !== null;
    for (let i = 0; i < interceptors.length; i += 1) {
      const craft = interceptors[i];
      if (craft.phase !== 'air') continue;
      if (!tracked) {
        const age = lastKnown.age;
        steerTowards(craft, lastKnown.x + lastKnown.vx * age, Math.max(lastKnown.y, 120), lastKnown.z + lastKnown.vz * age, maxSpeedAt(craft.y, tuning.envelope), dt, tuning.envelope);
        if (i === 0) patrol.slotDistance = Infinity;
        continue;
      }
      formationSlot(lead, slots[i], slot);
      const dx = slot.x - craft.x;
      const dy = slot.y - craft.y;
      const dz = slot.z - craft.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const aligned = Math.abs(angleDifference(lead.heading, craft.heading)) < 1.05;
      let after = distance;
      if (distance < tuning.formation.captureDistance && (aligned || distance < 120)) {
        station.vx = lead.vx;
        station.vy = lead.vy;
        station.vz = lead.vz;
        station.heading = lead.heading;
        station.roll = lead.roll || 0;
        after = keepStation(craft, slot, station, dt, tuning.envelope, tuning.formation);
      } else {
        // Lead pursuit: aim where the slot will be when they get there.
        const closing = Math.max(60, craft.speed - lead.speed * 0.6);
        const ahead = Math.min(14, distance / closing);
        const wish = distance > 3000 ? Infinity : lead.speed + Math.min(260, distance / 9);
        steerTowards(craft, slot.x + lead.vx * ahead, Math.max(slot.y + lead.vy * ahead, 60), slot.z + lead.vz * ahead, wish, dt, tuning.envelope);
      }
      if (i === 0) patrol.slotDistance = after;
    }
  }

  /** Circles the last known position (carried forward a little along his course). */
  function search(dt) {
    timers.search += dt;
    const drift = Math.min(lastKnown.age, 12);
    const cx = lastKnown.x + lastKnown.vx * drift;
    const cz = lastKnown.z + lastKnown.vz * drift;
    for (let i = 0; i < interceptors.length; i += 1) {
      const craft = interceptors[i];
      if (craft.phase !== 'air') continue;
      const radius = tuning.tracking.searchRadius * (1 + i * 0.8);
      const angle = Math.atan2(craft.x - cx, -(craft.z - cz)) + (i === 0 ? 0.5 : -0.5);
      const far = Math.hypot(craft.x - cx, craft.z - cz) > radius * 2.5;
      const tx = far ? cx : cx + Math.sin(angle) * radius;
      const tz = far ? cz : cz - Math.cos(angle) * radius;
      steerTowards(craft, tx, Math.max(lastKnown.y, 250) + i * 150, tz, far ? maxSpeedAt(craft.y, tuning.envelope) : tuning.tracking.searchSpeed, dt, tuning.envelope);
    }
    if (timers.search >= tuning.tracking.searchSeconds) {
      radio('airGuard.searchEnd');
      events.push({ type: 'standDown', reason: 'lost' });
      setStage('returning');
    }
  }

  /** Back to the base; over it the pair is put on its pads again. */
  function flyHome(dt) {
    let home = true;
    for (let i = 0; i < interceptors.length; i += 1) {
      const craft = interceptors[i];
      if (craft.phase !== 'air') continue;
      const distance = Math.hypot(craft.x - base.x, craft.z - base.z);
      steerTowards(craft, base.x, 350 + i * 120 + Math.min(600, distance * 0.08), base.z, distance > 4000 ? 300 : 170, dt, tuning.envelope);
      if (distance > 450) home = false;
    }
    if (home) {
      park();
      patrol.reason = null;
      setStage('idle');
    }
  }

  park();
  return patrol;
}
