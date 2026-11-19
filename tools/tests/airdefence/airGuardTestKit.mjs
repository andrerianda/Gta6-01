// Shared by the air guard tests: a lead aircraft flown by a small script (straight, turning,
// rocking its wings), a patrol built from the real catalogs with a seeded random, and a runner that
// steps both and keeps a log of the stages, radio lines and bursts with their times.
import { createInterceptPatrol } from '../../../game/src/flight/defence/interceptPatrol.js';
import { createAirGuardSetup } from '../../../game/src/flight/defence/airGuardSetup.js';

export const STEP = 1 / 30;

/** A small deterministic generator (mulberry32). */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A lead aircraft at a place, flying a compass heading (degrees) at a speed. */
export function makeLead(options = {}) {
  const heading = ((options.headingDegrees ?? 276) * Math.PI) / 180;
  const speed = options.speed ?? 240;
  return {
    id: 'lead', modelId: options.modelId ?? 'manta_sombra', x: options.x ?? -3000, y: options.y ?? 600, z: options.z ?? -1500,
    vx: Math.sin(heading) * speed, vy: 0, vz: -Math.cos(heading) * speed, speed, heading, roll: 0, onGround: false,
    autopilot: Boolean(options.autopilot), signature: options.signature ?? 0.32, heightAboveSurface: options.y ?? 600,
  };
}

/** Moves the lead one step: `fly(lead, time)` may set lead.turnRate (rad/s), lead.roll, lead.speed, lead.climb first. */
export function stepLead(lead, dt) {
  lead.heading += (lead.turnRate ?? 0) * dt;
  lead.vx = Math.sin(lead.heading) * lead.speed;
  lead.vz = -Math.cos(lead.heading) * lead.speed;
  lead.vy = lead.climb ?? 0;
  lead.x += lead.vx * dt;
  lead.y += lead.vy * dt;
  lead.z += lead.vz * dt;
  lead.heightAboveSurface = lead.y;
}

/** A patrol on the real base with a seeded random. */
export function makePatrol(seed = 7) {
  return createInterceptPatrol(createAirGuardSetup(seededRandom(seed)));
}

/**
 * Runs lead and patrol for `seconds`; returns the log: {stages: [[time, stage]], lines: [[time, lineId]], bursts: [{time, kind, hit}], hits}.
 * `fly(lead, time)` scripts the lead; `env` may be an object or a function of (lead, time); `until(log)` stops early.
 */
export function runPatrol(patrol, lead, seconds, options = {}) {
  const log = options.log ?? { stages: [], lines: [], bursts: [], hits: 0, standDowns: [], time: 0 };
  const start = log.time;
  while (log.time - start < seconds) {
    log.time += STEP;
    if (options.fly) options.fly(lead, log.time);
    stepLead(lead, STEP);
    const env = typeof options.env === 'function' ? options.env(lead, log.time) : options.env ?? {};
    patrol.update(lead, env, STEP);
    for (const event of patrol.events) {
      if (event.type === 'stage') log.stages.push([Math.round(log.time * 10) / 10, event.stage]);
      else if (event.type === 'radio') log.lines.push([Math.round(log.time * 10) / 10, event.lineId]);
      else if (event.type === 'standDown') log.standDowns.push(event.reason);
      else if (event.type === 'burst') {
        log.bursts.push({ time: log.time, kind: event.kind, hit: event.hit });
        if (event.hit) log.hits += 1;
      }
    }
    patrol.events.length = 0;
    if (options.until && options.until(log)) break;
  }
  return log;
}

/** The stage names of a log in order. */
export const stagesOf = (log) => log.stages.map((entry) => entry[1]);
/** The line ids of a log in order. */
export const linesOf = (log) => log.lines.map((entry) => entry[1]);
