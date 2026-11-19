// The radar scope's contacts by who reports them: the air guard sends its interceptors, the radar
// network its emitters, a mission whatever it stages, each under its own key, and the display
// shows them all. A call without a key writes the list 'default' (the one-argument call of
// session 1). Pure: no DOM, no three.js.

/** The key of a list set without a source. */
export const DEFAULT_CONTACT_SOURCE = 'default';

/**
 * Creates the merged contact lists.
 * @returns {{set: (list: Array<object> | null | undefined, source?: string) => Array<object>, merged: Array<object>,
 *   sources: () => string[], clear: () => void}} `merged` is one array, kept and refilled in place
 *   (sources in the order they first reported).
 */
export function createRadarContactLists() {
  /** @type {Map<string, Array<object>>} */
  const lists = new Map();
  const merged = [];

  function rebuild() {
    merged.length = 0;
    for (const list of lists.values()) for (let i = 0; i < list.length; i += 1) merged.push(list[i]);
    return merged;
  }

  return {
    merged,
    /** Replaces the list of one source (an empty or missing list removes its contacts). */
    set(list, source = DEFAULT_CONTACT_SOURCE) {
      const key = typeof source === 'string' && source ? source : DEFAULT_CONTACT_SOURCE;
      lists.set(key, Array.isArray(list) ? list : []);
      return rebuild();
    },
    sources: () => [...lists.keys()],
    clear() {
      lists.clear();
      merged.length = 0;
    },
  };
}
