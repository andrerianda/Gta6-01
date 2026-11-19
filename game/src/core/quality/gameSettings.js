// The settings store: the player's graphics, audio, control and gameplay options, with defaults,
// validation, change notification and persistence to storage under a version.
//
//   settings.get('audio.master')                    // 0.8
//   settings.set('graphics.quality', 'high')        // validated, saved, announced
//   settings.reset('controls')
import { isQualityTierName } from './qualityTiers.js';

/**
 * Creates the settings store and loads what was saved.
 * @param {Object} [options]
 * @param {ReturnType<import('../storage/persistentStorage.js').createPersistentStorage>} [options.storage]
 *   Where the settings persist; without it they live for the session.
 * @param {(change: {key: string, value: any, previous: any}) => void} [options.onChanged] Called
 *   after every successful set() and for every key a reset() changes.
 * @returns {ReturnType<typeof buildGameSettings>}
 */
export function createGameSettings(options = {}) {
  return buildGameSettings(options);
}

/** The version of the stored settings record. Raise it and add a migration when the shape changes. */
export const SETTINGS_VERSION = 1;

/** Every setting with its default value. Keys are addressed as 'section.name'. */
export const DEFAULT_SETTINGS = Object.freeze({
  graphics: Object.freeze({
    quality: 'auto',            // 'auto' or a tier name of qualityTiers.js
    detectedQuality: '',        // the tier the first-run benchmark chose; '' before it ran
    dynamicResolution: true,
    fieldOfView: 58,            // degrees, vertical
    motionBlur: true,
    cameraShake: 1,             // 0 off to 1 full
  }),
  audio: Object.freeze({
    master: 0.8,
    effects: 0.9,
    music: 0.7,
    voices: 0.9,
    muted: false,
  }),
  controls: Object.freeze({
    mouseSensitivity: 1,
    invertLookY: false,
    bindings: Object.freeze({}), // { context: { action: [codes] } } overrides of the catalog's defaults
  }),
  gameplay: Object.freeze({
    subtitles: true,
    hints: true,
    minimapRotates: true,
    speedUnit: 'kmh',           // 'kmh' or 'mph'
    autosave: true,
    flightMode: 'casual',       // 'casual' (auto-trim, stall protection, self-levelling) or 'realistic'
    flightView: 'cockpit',      // kept for old saves only: the flight cameras no longer read it, every flight starts in the cockpit
  }),
});

/** Short names some settings are also read and written by: get('flightMode'). */
export const SETTING_ALIASES = Object.freeze({
  flightMode: 'gameplay.flightMode',
  flightView: 'gameplay.flightView',
});

/** Extra rules beyond "same type as the default". */
const SETTING_RULES = Object.freeze({
  'graphics.quality': (value) => value === 'auto' || isQualityTierName(value),
  'graphics.detectedQuality': (value) => value === '' || isQualityTierName(value),
  'graphics.fieldOfView': (value) => value >= 40 && value <= 90,
  'graphics.cameraShake': (value) => value >= 0 && value <= 1,
  'audio.master': isUnitInterval,
  'audio.effects': isUnitInterval,
  'audio.music': isUnitInterval,
  'audio.voices': isUnitInterval,
  'controls.mouseSensitivity': (value) => value >= 0.1 && value <= 5,
  'gameplay.speedUnit': (value) => value === 'kmh' || value === 'mph',
  'gameplay.flightMode': (value) => value === 'casual' || value === 'realistic',
  'gameplay.flightView': (value) => value === 'cockpit' || value === 'chase' || value === 'outside',
});

function buildGameSettings(options) {
  const storage = options.storage ?? null;
  const values = cloneSettings(DEFAULT_SETTINGS);
  /** @type {Set<(change: {key: string, value: any, previous: any}) => void>} */
  const listeners = new Set();

  const settings = {
    get,
    set,
    reset,
    all: () => cloneSettings(values),
    onChange,
    /** True when stored settings were found and applied at start-up. */
    loadedFromStorage: false,
  };

  if (storage) {
    const stored = storage.read('settings', { version: SETTINGS_VERSION, migrations: {} });
    if (stored.ok && stored.data && typeof stored.data === 'object') {
      settings.loadedFromStorage = true;
      for (const section of Object.keys(values)) {
        const saved = stored.data[section];
        if (!saved || typeof saved !== 'object') continue;
        for (const name of Object.keys(values[section])) {
          const key = `${section}.${name}`;
          if (name in saved && isValid(key, saved[name])) values[section][name] = cloneValue(saved[name]);
        }
      }
    }
  }

  /**
   * Reads a setting.
   * @param {string} key 'section.name'.
   * @returns {any} Its value; undefined for an unknown key.
   */
  function get(key) {
    const [section, name] = splitKey(key);
    return values[section]?.[name];
  }

  /**
   * Changes a setting, saves and announces it.
   * @param {string} key 'section.name'.
   * @param {any} value The new value; it must have the type of the default and pass its rule.
   * @returns {boolean} False when the key is unknown or the value is not acceptable.
   */
  function set(key, value) {
    if (!isValid(key, value)) return false;
    const [section, name] = splitKey(key);
    const previous = values[section][name];
    if (sameValue(previous, value)) return true;
    values[section][name] = cloneValue(value);
    persist();
    announce(key, value, previous);
    return true;
  }

  /**
   * Restores defaults.
   * @param {string} [section] One section ('graphics', 'audio', 'controls', 'gameplay'); default all.
   */
  function reset(section) {
    for (const sectionName of section ? [section] : Object.keys(values)) {
      const defaults = DEFAULT_SETTINGS[sectionName];
      if (!defaults) continue;
      for (const name of Object.keys(defaults)) {
        const previous = values[sectionName][name];
        if (sameValue(previous, defaults[name])) continue;
        values[sectionName][name] = cloneValue(defaults[name]);
        announce(`${sectionName}.${name}`, values[sectionName][name], previous);
      }
    }
    persist();
  }

  /**
   * Subscribes to changes directly (the event bus carries them too).
   * @param {(change: {key: string, value: any, previous: any}) => void} listener
   * @returns {() => void} Call it to unsubscribe.
   */
  function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function persist() {
    if (storage) storage.write('settings', values, { version: SETTINGS_VERSION });
  }

  function announce(key, value, previous) {
    const change = { key, value, previous };
    for (const listener of [...listeners]) listener(change);
    if (options.onChanged) options.onChanged(change);
  }

  return settings;
}

function splitKey(alias) {
  const key = SETTING_ALIASES[alias] ?? alias;
  const dot = key.indexOf('.');
  return dot === -1 ? [key, ''] : [key.slice(0, dot), key.slice(dot + 1)];
}

function isValid(key, value) {
  const [section, name] = splitKey(key);
  const defaults = DEFAULT_SETTINGS[section];
  if (!defaults || !(name in defaults)) return false;
  const model = defaults[name];
  if (typeof value !== typeof model) return false;
  if (typeof value === 'number' && !Number.isFinite(value)) return false;
  if (typeof model === 'object' && (value === null || Array.isArray(value))) return false;
  const rule = SETTING_RULES[SETTING_ALIASES[key] ?? key];
  return rule ? rule(value) : true;
}

function isUnitInterval(value) {
  return value >= 0 && value <= 1;
}

function cloneValue(value) {
  return value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function sameValue(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function cloneSettings(source) {
  const copy = {};
  for (const [section, entries] of Object.entries(source)) {
    copy[section] = {};
    for (const [name, value] of Object.entries(entries)) copy[section][name] = cloneValue(value);
  }
  return copy;
}
