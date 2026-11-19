// The launch options of the page: what its query string asks for. Normal play needs none of
// them; they exist for screenshots, automation and debugging.
//
//   ?shot=<name>      run a showcase scene to its picture and hold it (see core/automation/)
//   ?seed=<n>         the world seed (default 1): the same seed builds the same city and crowd
//   ?quality=<tier>   low, medium, high, ultra or cinematic, instead of the saved setting
//   ?time=<hours>     start at this clock time and hold it: 18.5 or 18:30
//   ?weather=<name>   clear, hazy, overcast, rain or storm
//   ?autostart=1      skip the start menu and go straight into play
//   ?debug=1          development checks, console logging and the performance overlay
//   ?aircraft=<id>    start seated in that aircraft (gaviota_t2, manta_sombra, garza_negra, halcon)
//                     on the Los Pantanos runway threshold, engine running (player/aircraftLaunch.js)
//   &air=<metres>     with ?aircraft: in flight instead, that high over the field at cruise speed
//   &flightview=<v>   with ?aircraft: cockpit, chase or outside
//   &flightmode=<m>   casual or realistic, instead of the saved setting

/**
 * @typedef {Object} LaunchOptions
 * @property {number | string} seed The world seed.
 * @property {string | null} shot The showcase scene to run, or null.
 * @property {string | null} quality The quality tier asked for, or null.
 * @property {number | null} timeOfDay Clock hours to start at and hold, or null.
 * @property {string | null} weather The weather asked for, or null.
 * @property {boolean} autostart Skip the start menu.
 * @property {boolean} debug Development mode.
 * @property {string | null} aircraft The aircraft to start seated in, or null.
 * @property {number | null} air Metres over the field to start in flight at, or null (on the runway).
 * @property {'cockpit' | 'chase' | 'outside' | null} flightView The aircraft camera asked for.
 * @property {'casual' | 'realistic' | null} flightMode The flight mode asked for.
 */

/**
 * Reads the launch options from a query string.
 * @param {string} [search] The page's location.search ('?shot=beach&seed=3'); default none.
 * @returns {LaunchOptions}
 */
export function parseLaunchOptions(search = '') {
  const parameters = new URLSearchParams(search);
  const text = (name) => {
    const value = parameters.get(name);
    return value === null || value.trim() === '' ? null : value.trim();
  };
  const flag = (name) => {
    const value = parameters.get(name);
    return value !== null && value !== '0' && value.toLowerCase() !== 'false';
  };
  return {
    seed: parseSeed(text('seed')),
    shot: text('shot'),
    quality: text('quality')?.toLowerCase() ?? null,
    timeOfDay: parseClockTime(text('time')),
    weather: text('weather')?.toLowerCase() ?? null,
    autostart: flag('autostart'),
    debug: flag('debug'),
    aircraft: text('aircraft')?.toLowerCase() ?? null,
    air: parseHeight(text('air')),
    flightView: oneOf(text('flightview'), ['cockpit', 'chase', 'outside']),
    flightMode: oneOf(text('flightmode'), ['casual', 'realistic']),
  };
}

/** The world seed when the page names none: screenshots and normal play show the same city. */
export const DEFAULT_WORLD_SEED = 1;

/**
 * Reads a clock time written as decimal hours ('18.5') or as hours and minutes ('18:30').
 * @param {string | null} value The text.
 * @returns {number | null} Clock hours in 0..24, or null when the text is not a time.
 */
export function parseClockTime(value) {
  if (value === null) return null;
  const clock = /^(\d{1,2}):(\d{2})$/.exec(value);
  const hours = clock ? Number(clock[1]) + Number(clock[2]) / 60 : Number(value);
  if (!Number.isFinite(hours) || hours < 0 || hours > 24) return null;
  return hours === 24 ? 0 : hours;
}

/** A height in metres (0 to 30000), or null when the text is not one. */
function parseHeight(value) {
  if (value === null) return null;
  const metres = Number(value);
  return Number.isFinite(metres) && metres >= 0 && metres <= 30000 ? metres : null;
}

/** The text in lower case when it is one of the choices, else null. */
function oneOf(value, choices) {
  const text = value === null ? null : value.toLowerCase();
  return text !== null && choices.includes(text) ? text : null;
}

/** A seed is a whole number when it looks like one, otherwise the text itself. */
function parseSeed(value) {
  if (value === null) return DEFAULT_WORLD_SEED;
  return /^\d{1,9}$/.test(value) ? Number(value) : value;
}
