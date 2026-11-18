// The statistics of TRACKED_STATISTICS (catalog/progressionRanks.js): counters that add, records
// that keep the highest value, and the rows the phone and the pause menu show, formatted by
// unit (metres as km, seconds as hours and minutes). Pure, tested in Node.

/** Statistics that keep their highest value instead of adding. */
export const RECORD_STATISTICS = Object.freeze(['top_speed', 'longest_jump', 'longest_drift', 'highest_wanted_level', 'longest_pursuit']);

/**
 * Creates the book.
 * @param {Readonly<Record<string, {id: string, name: string, unit: string, category: string}>>} tracked TRACKED_STATISTICS.
 */
export function createStatisticsBook(tracked) {
  /** statistic id -> value */
  const values = Object.create(null);
  for (const id of Object.keys(tracked)) values[id] = 0;

  const book = {
    values,

    /**
     * Adds to a counter, or raises a record to the amount when it is higher.
     * @returns {number} The change (0 when nothing changed or the id is unknown).
     */
    record(statistic, amount = 1) {
      if (!(statistic in values) || !Number.isFinite(amount)) return 0;
      const before = values[statistic];
      values[statistic] = RECORD_STATISTICS.includes(statistic) ? Math.max(before, amount) : before + amount;
      return values[statistic] - before;
    },

    /** Sets a statistic outright (completion percent, reputation, favourites). */
    set(statistic, value) {
      if (!(statistic in values)) return 0;
      const before = typeof values[statistic] === 'number' ? values[statistic] : 0;
      values[statistic] = value;
      return typeof value === 'number' ? value - before : 0;
    },

    /**
     * Rows for display, in catalog order, optionally of one category.
     * @returns {{id: string, name: string, category: string, value: any, text: string}[]}
     */
    rows(category = null) {
      const out = [];
      for (const entry of Object.values(tracked)) {
        if (category && entry.category !== category) continue;
        out.push({ id: entry.id, name: entry.name, category: entry.category, value: values[entry.id], text: formatStatistic(values[entry.id], entry.unit) });
      }
      return out;
    },

    serialise() {
      const out = {};
      for (const [id, value] of Object.entries(values)) if (value) out[id] = typeof value === 'number' ? Math.round(value * 100) / 100 : value;
      return out;
    },

    restore(data) {
      for (const id of Object.keys(values)) values[id] = 0;
      for (const [id, value] of Object.entries(data ?? {})) if (id in values && (Number.isFinite(value) || typeof value === 'string')) values[id] = value;
    },
  };
  return book;
}

/** A statistic as text for its unit. */
export function formatStatistic(value, unit) {
  if (typeof value === 'string') return value || '-';
  const number = Number.isFinite(value) ? value : 0;
  switch (unit) {
    case 'metres': return number >= 1000 ? `${(number / 1000).toFixed(1)} km` : `${Math.round(number)} m`;
    case 'seconds': {
      const minutes = Math.floor(number / 60);
      return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min ${Math.floor(number % 60)} s`;
    }
    case 'dollars': return `$${Math.round(number).toLocaleString('en-US')}`;
    case 'percent': return `${Math.round(number)}%`;
    case 'metres_per_second': return `${Math.round(number * 3.6)} km/h`;
    case 'stars': return `${Math.round(number)} ${Math.round(number) === 1 ? 'star' : 'stars'}`;
    default: return String(Math.round(number));
  }
}
