// The world flags of MARAZUL: the few named switches that open or close parts of the world for a
// mission. Systems read them every frame (`context.flags.get(WORLD_FLAGS.SEA_OPEN)`) or listen to
// WORLD_FLAG_CHANGED; a mission (or `?flags=sea.open,base.officerAccess` on the page) sets them.
// Every flag is false in free roam; the save system keeps them through serialise() / restore().

/** Every flag by constant name, with what it switches when true. */
export const WORLD_FLAGS = Object.freeze({
  /** The lead is expected at Base Aérea Punta Garza as an officer: the gate opens, guards let him pass, the crew salute. */
  BASE_OFFICER_ACCESS: 'base.officerAccess',
  /** The base is on alarm: sirens and beacons, trucks on the runway (staging for the final mission). */
  BASE_ALARM: 'base.alarm',
  /** The sea beyond Marazul is open: no airspace warning, no patrol turn-back, the Norvast island zone streams in. */
  SEA_OPEN: 'sea.open',
  /** The air guard is hunting the lead whatever he does (a mission forces the interception). */
  AIR_DEFENCE_ALERT: 'air.defenceAlert',
  /** The air guard stands down entirely: no scramble, no boundary patrol (cinematics, time skips). */
  AIR_DEFENCE_OFF: 'air.defenceOff',
  /** The coastal radar tower of Cabo Lejano is destroyed: the interceptors have lost their ground guidance. */
  RADAR_TOWER_DESTROYED: 'radar.towerDestroyed',
  /** The navy radar picket is on station at sea (the "stealth test"). */
  NAVY_PICKET_ACTIVE: 'radar.navyPicket',
  /** The Manta Sombra carries its one guided bomb. */
  GUIDED_BOMB_LOADED: 'bomb.loaded',
});

/** The names of every flag. */
export const WORLD_FLAG_NAMES = Object.freeze(Object.values(WORLD_FLAGS));

/**
 * Creates the flag store.
 * @param {{emit?: (topic: string, payload: object) => void, topic?: string, initial?: string[]}} [options]
 *   `emit` and `topic` publish every change as { flag, value, previous }; `initial` names flags that start true.
 * @returns {{get: (flag: string) => boolean, set: (flag: string, value?: boolean) => boolean, names: () => string[],
 *   onChange: (listener: (flag: string, value: boolean) => void) => () => void, serialise: () => Record<string, boolean>,
 *   restore: (data: Record<string, boolean> | null) => void, reset: () => void}}
 */
export function createWorldFlags(options = {}) {
  const values = new Map(WORLD_FLAG_NAMES.map((name) => [name, false]));
  const listeners = new Set();

  function set(flag, value = true) {
    if (!values.has(flag)) throw new Error(`unknown world flag "${flag}"`);
    const next = Boolean(value);
    const previous = values.get(flag);
    if (previous === next) return false;
    values.set(flag, next);
    for (const listener of listeners) listener(flag, next);
    if (options.emit && options.topic) options.emit(options.topic, { flag, value: next, previous });
    return true;
  }

  for (const name of options.initial ?? []) if (values.has(name)) values.set(name, true);

  return {
    /** Whether a flag is set; an unknown name is false. */
    get: (flag) => values.get(flag) === true,
    set,
    names: () => [...values.keys()],
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    serialise: () => Object.fromEntries(values),
    restore(data) {
      for (const name of WORLD_FLAG_NAMES) set(name, Boolean(data && data[name]));
    },
    reset() {
      for (const name of WORLD_FLAG_NAMES) set(name, false);
    },
  };
}
