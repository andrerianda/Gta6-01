// Progression's wiring to the running game: PROGRESSION_ADD_REPUTATION and PROGRESSION_RECORD,
// rank-ups (RANK_REACHED, CONTENT_UNLOCKED for each weapon, the cash bonus per rank, a banner),
// the reputation REPUTATION_SOURCES gives for losing the police, buying property and seeing a
// district for the first time, and the statistics read from the game's events and from the
// lead's movement each fixed step (no allocation there).
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { createReputationBook } from './reputationRanks.js';
import { createStatisticsBook } from './statisticsBook.js';

/** A jump longer than this in one step is a teleport, not travel (metres). */
const TELEPORT_METRES = 25;

/**
 * Creates progression's run-time.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function createProgressionRuntime(context) {
  const { commands, events } = context;
  const catalog = context.content.get('progressionRanks');
  const weapons = context.content.find('weaponCatalog')?.WEAPON_CATALOG ?? {};
  const sources = catalog.REPUTATION_SOURCES;
  const reputation = createReputationBook(catalog.PROGRESSION_RANKS);
  const statistics = createStatisticsBook(catalog.TRACKED_STATISTICS);
  const districtsVisited = new Set();
  const stops = [];
  const last = { x: 0, z: 0, known: false };
  const pursuit = { seconds: 0, peak: 0 };

  const playerSystem = () => context.systems.find('player');
  const leadId = () => playerSystem()?.entity?.id ?? context.entities.firstWithTag('player')?.id ?? null;
  const run = (name, payload) => (commands.has(name) ? commands.run(name, payload) : undefined);

  /** Records a statistic and announces discrete changes. */
  function record(statistic, amount = 1) {
    const delta = statistics.record(statistic, amount);
    if (delta !== 0) events.queue(GAME_EVENTS.STATISTIC_CHANGED, { statistic, value: statistics.values[statistic], delta });
    return delta;
  }

  /** Adds reputation and handles the ranks it reaches. @returns {number} The reputation. */
  function addReputation(amount, reason) {
    const { delta, reached } = reputation.add(amount);
    if (delta === 0) return reputation.reputation;
    statistics.set('reputation', reputation.reputation);
    events.emit(GAME_EVENTS.REPUTATION_CHANGED, { reputation: reputation.reputation, delta, reason: reason ?? '' });
    for (const entry of reached) {
      const unlocks = [...(entry.weapons ?? [])];
      events.emit(GAME_EVENTS.RANK_REACHED, { rankId: entry.id, name: entry.name, unlocks });
      for (const id of unlocks) events.emit(GAME_EVENTS.CONTENT_UNLOCKED, { kind: 'weapon', id, name: weapons[id]?.name ?? id });
      run(GAME_COMMANDS.ECONOMY_ADD_MONEY, { amount: sources.rankUpCashBonusPerRank ?? 0, reason: `rank:${entry.id}` });
      const perks = entry.perks?.length ? ` ${entry.perks.join('. ')}.` : '';
      run(GAME_COMMANDS.UI_NOTIFY, { text: `Rank ${entry.rank}: ${entry.name}. ${entry.blurb}${perks}`, kind: 'success', seconds: sources.rankUpBanner?.seconds ?? 5 });
    }
    if (reached.length) run(GAME_COMMANDS.SAVE_WRITE, { reason: 'rank up' });
    return reputation.reputation;
  }

  const isLead = (id) => id !== null && id !== undefined && id === leadId();

  const runtime = {
    reputation,
    statistics,

    start() {
      commands.handle(GAME_COMMANDS.PROGRESSION_ADD_REPUTATION, ({ amount, reason } = {}) => addReputation(amount, reason));
      commands.handle(GAME_COMMANDS.PROGRESSION_RECORD, ({ statistic, amount } = {}) => { record(statistic, amount ?? 1); });
      const listen = (topic, handler) => stops.push(events.on(topic, handler));
      listen(GAME_EVENTS.MONEY_CHANGED, ({ delta, reason } = {}) => {
        if (reason === 'load' || !Number.isFinite(delta)) return;
        if (delta > 0) record('cash_earned', delta);
        else if (delta < 0) record('cash_spent', -delta);
      });
      listen(GAME_EVENTS.MISSION_PASSED, () => record('missions_passed'));
      listen(GAME_EVENTS.MISSION_FAILED, () => record('missions_failed'));
      listen(GAME_EVENTS.PLAYER_BUSTED, () => record('times_busted'));
      listen(GAME_EVENTS.PLAYER_WASTED, () => record('times_wasted'));
      listen(GAME_EVENTS.VEHICLE_STOLEN, ({ thiefId } = {}) => { if (isLead(thiefId)) record('vehicles_stolen'); });
      listen(GAME_EVENTS.VEHICLE_DESTROYED, ({ attackerId } = {}) => { if (isLead(attackerId)) record('vehicles_destroyed'); });
      listen(GAME_EVENTS.VEHICLE_RESPRAYED, () => record('resprays'));
      listen(GAME_EVENTS.WEAPON_FIRED, ({ shooterId } = {}) => { if (isLead(shooterId)) statistics.record('shots_fired', 1); });
      listen(GAME_EVENTS.CHARACTER_KILLED, ({ killerId, factionId } = {}) => { if (factionId && isLead(killerId)) record('gang_members_defeated'); });
      listen(GAME_EVENTS.PROPERTY_PURCHASED, ({ price } = {}) => {
        record('properties_owned');
        if (price > 0) addReputation(sources.propertyBought ?? 0, 'property bought');
      });
      listen(GAME_EVENTS.PROPERTY_INCOME_PAID, ({ amount } = {}) => record('property_income', amount ?? 0));
      listen(GAME_EVENTS.DISTRICT_ENTERED, ({ districtId } = {}) => {
        if (!districtId || districtsVisited.has(districtId)) return;
        const first = districtsVisited.size > 0;
        districtsVisited.add(districtId);
        if (first) addReputation(sources.firstTimeInDistrict ?? 0, `district:${districtId}`);
      });
      listen(GAME_EVENTS.WANTED_LEVEL_CHANGED, ({ level, previous } = {}) => {
        if (level > previous) record('stars_earned', level - previous);
        record('highest_wanted_level', level);
        pursuit.peak = Math.max(pursuit.peak, level);
      });
      listen(GAME_EVENTS.WANTED_CLEARED, ({ reason } = {}) => {
        if (reason === 'escaped' || reason === 'respray' || reason === 'bribe' || reason === 'safehouse') {
          record('wanted_levels_lost');
          record('longest_pursuit', Math.round(pursuit.seconds));
          addReputation(sources.loseWantedLevel?.[pursuit.peak] ?? 0, `lost ${pursuit.peak} stars`);
        }
        pursuit.seconds = 0;
        pursuit.peak = 0;
      });
    },

    fixedUpdate(stepSeconds) {
      if (!context.state.is('playing')) return;
      statistics.values.time_played += stepSeconds;
      if (pursuit.peak > 0) pursuit.seconds += stepSeconds;
      const player = playerSystem();
      const lead = player?.entity;
      if (!lead) return;
      if (lead.data?.characterId === 'sol_arrieta') statistics.values.time_as_sol += stepSeconds;
      else statistics.values.time_as_dez += stepSeconds;
      const { x, z } = lead.position;
      if (last.known) {
        const moved = Math.hypot(x - last.x, z - last.z);
        if (moved > 0 && moved < TELEPORT_METRES) {
          if (player.mode === 'inVehicle') {
            statistics.values.distance_driven += moved;
            const speed = Math.abs(player.vehicle?.entity?.data?.speed ?? player.vehicle?.data?.speed ?? moved / stepSeconds);
            if (speed > statistics.values.top_speed && speed < 120) statistics.values.top_speed = speed;
          } else {
            statistics.values.distance_on_foot += moved;
          }
        }
      }
      last.x = x;
      last.z = z;
      last.known = true;
    },

    serialise() {
      return { ...reputation.serialise(), statistics: statistics.serialise(), districtsVisited: [...districtsVisited] };
    },

    restore(data) {
      if (!data) return;
      reputation.restore(data);
      statistics.restore(data.statistics);
      statistics.set('reputation', reputation.reputation);
      districtsVisited.clear();
      for (const id of data.districtsVisited ?? []) districtsVisited.add(id);
      last.known = false;
    },

    dispose() {
      for (const stop of stops.splice(0)) if (typeof stop === 'function') stop();
    },
  };
  return runtime;
}
