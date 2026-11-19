// The story's progress: which missions are completed, which are open to start (every mission
// they require is completed), how often each was attempted, and the reward a pass pays (the
// full reward the first time, MISSION_RULES.replayRewardFraction of it on a replay). Saved by
// the mission director as { completed, available, attempts }. Pure, tested in Node.

/**
 * Creates the progress record over the catalog.
 * @param {Record<string, object>} missions STORY_MISSIONS.
 * @param {string[]} order STORY_MISSION_ORDER.
 * @param {{replayRewardFraction?: number}} [rules] MISSION_RULES.
 */
export function createMissionProgress(missions, order, rules = {}) {
  const completed = new Set();
  const attempts = {};

  const progress = {
    /** Missions that may start now, in story order. */
    available() {
      return order.filter((id) => missions[id] && !completed.has(id)
        && (missions[id].requires || []).every((need) => completed.has(need)));
    },
    isCompleted: (id) => completed.has(id),
    attemptsOf: (id) => attempts[id] ?? 0,
    /** Counts a start; returns the attempt number. */
    attempt(id) {
      attempts[id] = (attempts[id] ?? 0) + 1;
      return attempts[id];
    },
    /** Marks a pass; returns the reward it pays, {cash, reputation, replay}. */
    complete(id) {
      const reward = missions[id]?.reward ?? { cash: 0, reputation: 0 };
      const replay = completed.has(id);
      completed.add(id);
      const share = replay ? rules.replayRewardFraction ?? 0.25 : 1;
      return { cash: Math.round(reward.cash * share), reputation: Math.round(reward.reputation * share), replay };
    },
    serialise() {
      return { completed: order.filter((id) => completed.has(id)), available: progress.available(), attempts: { ...attempts } };
    },
    restore(data) {
      completed.clear();
      for (const key of Object.keys(attempts)) delete attempts[key];
      for (const id of data?.completed ?? []) if (missions[id]) completed.add(id);
      for (const [id, count] of Object.entries(data?.attempts ?? {})) if (missions[id] && Number.isFinite(count)) attempts[id] = count;
    },
  };
  return progress;
}

/**
 * True when a mission may start at this clock hour: `hours` is null (any time) or [from, to],
 * which may wrap past midnight ([19, 5]).
 */
export function isWithinHours(hours, hour) {
  if (!Array.isArray(hours)) return true;
  const [from, to] = hours;
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}
