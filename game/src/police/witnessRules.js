// Who has to see a crime before it counts, and how long their report takes, as pure rules over
// WANTED_RULES.witness and the crime's seenRadius / heardRadius. An officer reports at once, a
// guard after 2 s, a civilian after 6 s and only sometimes; crimes marked officersOnly or
// guardsOnly need that kind of witness. Night shortens sight, rain shortens hearing. A report in
// progress is lost when its witness is gone. No engine: wantedLevelRuntime.js feeds it.

/** The kinds of witness. */
export const WITNESS_KIND = Object.freeze({ OFFICER: 'officer', GUARD: 'guard', CIVILIAN: 'civilian' });

/**
 * How long a witness of this kind takes to report this crime.
 * @param {object} crime A CRIME_CATALOG entry.
 * @param {string} kind A WITNESS_KIND.
 * @param {object} rules WANTED_RULES.
 * @returns {number} Seconds, or -1 when this kind cannot report it.
 */
export function reportDelayFor(crime, kind, rules) {
  if (crime.officersOnly && kind !== WITNESS_KIND.OFFICER) return -1;
  if (crime.guardsOnly && kind !== WITNESS_KIND.GUARD) return -1;
  if (kind === WITNESS_KIND.OFFICER) return rules.witness.officerReportSeconds;
  if (kind === WITNESS_KIND.GUARD) return rules.witness.guardReportSeconds;
  return rules.witness.civilianReportSeconds;
}

/**
 * Whether a witness at this distance notices the crime.
 * @param {object} crime
 * @param {number} distance Metres.
 * @param {object} rules WANTED_RULES.
 * @param {{night?: number, rain?: boolean}} [conditions] night 0..1 (nightFactor), rain true in rain.
 * @returns {boolean}
 */
export function noticesCrime(crime, distance, rules, conditions = {}) {
  const night = conditions.night ?? 0;
  const sight = crime.seenRadius * (1 - (1 - rules.witness.nightSightMultiplier) * night);
  const hearing = crime.heardRadius * (conditions.rain ? rules.witness.rainHearingMultiplier : 1);
  return distance <= sight || distance <= hearing;
}

/**
 * Picks the witness who will report a crime first.
 * @param {object} crime
 * @param {number} x Where it happened.
 * @param {number} z
 * @param {ReadonlyArray<{id: number, kind: string, x: number, z: number}>} candidates People near.
 * @param {object} rules WANTED_RULES.
 * @param {() => number} random 0..1 (the civilian report chance).
 * @param {object} [conditions] See noticesCrime.
 * @returns {{witnessId: number, kind: string, delay: number} | null} Null when nobody reports it.
 */
export function chooseWitness(crime, x, z, candidates, rules, random, conditions) {
  let best = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const person = candidates[i];
    const delay = reportDelayFor(crime, person.kind, rules);
    if (delay < 0) continue;
    if (!noticesCrime(crime, Math.hypot(person.x - x, person.z - z), rules, conditions)) continue;
    if (person.kind === WITNESS_KIND.CIVILIAN && random() > rules.witness.civilianReportChance) continue;
    if (!best || delay < best.delay) best = { witnessId: person.id, kind: person.kind, delay };
  }
  return best;
}

/**
 * Spaces one kind of report (a gang fight's): the delay to queue it with so that no two land
 * closer than `spacing` seconds, never sooner than its witness would report it.
 * @param {{nextAt: number}} gate Kept per kind; start it at -Infinity.
 * @param {number} now The wanted clock.
 * @param {number} delay The witness's own delay.
 * @param {number} spacing Seconds between two reports.
 * @returns {number} The delay to use.
 */
export function spacedDelay(gate, now, delay, spacing) {
  const at = Math.max(now + Math.max(0, delay), gate.nextAt);
  gate.nextAt = at + spacing;
  return at - now;
}

/**
 * A queue of reports being made.
 * @returns {{pending: Array<object>}}
 */
export function createReportQueue() {
  return { pending: [] };
}

/**
 * Starts a report.
 * @param {{pending: Array<object>}} queue
 * @param {object} report {crimeId, offenderId, witnessId, position, delay}.
 */
export function queueReport(queue, report) {
  queue.pending.push({ ...report, remaining: report.delay });
}

/**
 * Advances the reports; calls deliver(report) for each that finishes and drops those whose
 * witness is gone.
 * @param {{pending: Array<object>}} queue
 * @param {number} dt
 * @param {(witnessId: number) => boolean} witnessAble False when the witness fled, fell or died.
 * @param {(report: object) => void} deliver
 * @returns {number} Reports delivered this step.
 */
export function stepReports(queue, dt, witnessAble, deliver) {
  let delivered = 0;
  for (let i = queue.pending.length - 1; i >= 0; i -= 1) {
    const report = queue.pending[i];
    if (report.witnessId != null && !witnessAble(report.witnessId)) {
      queue.pending.splice(i, 1);
      continue;
    }
    report.remaining -= dt;
    if (report.remaining > 0) continue;
    queue.pending.splice(i, 1);
    deliver(report);
    delivered += 1;
  }
  return delivered;
}
