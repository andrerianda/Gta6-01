// The content registry: the game's catalogs (districts, missions, characters, vehicles, weapons,
// wanted levels, crimes, pedestrians, gangs, activities, shops, radio, brands, controls, ranks)
// gathered under their names, so that systems read content from `context.content` instead of
// importing catalog files themselves. A catalog that has not been written yet is listed in
// `missing` and the game still boots.
//
//   const vehicles = context.content.get('vehicleCatalog').VEHICLE_CATALOG;
//   const controls = context.content.find('playerControls');     // null while it is missing

/**
 * Gathers the catalog modules into one registry.
 * @param {Record<string, object | undefined | null>} catalogs Catalog name -> its module
 *   namespace (`import * as vehicleCatalog from './catalog/vehicleCatalog.js'`).
 * @returns {Readonly<{catalogs: Readonly<Record<string, object>>, names: readonly string[],
 *   missing: readonly string[], has: (name: string) => boolean, get: (name: string) => any,
 *   find: (name: string) => any}>}
 */
export function createContentRegistry(catalogs) {
  /** @type {Record<string, object>} */
  const present = {};
  const missing = [];
  for (const name of CONTENT_CATALOG_NAMES) {
    const catalog = catalogs[name];
    if (catalog !== null && typeof catalog === 'object') present[name] = catalog;
    else missing.push(name);
  }
  for (const name of Object.keys(catalogs)) {
    const catalog = catalogs[name];
    if (!(name in present) && catalog !== null && typeof catalog === 'object') present[name] = catalog;
  }
  const has = (name) => Object.prototype.hasOwnProperty.call(present, name);
  return Object.freeze({
    /** Every catalog that exists, by name. */
    catalogs: Object.freeze(present),
    /** The names of the catalogs that exist. */
    names: Object.freeze(Object.keys(present)),
    /** The expected catalogs that were not handed in. */
    missing: Object.freeze(missing),
    has,
    /** A catalog by name; throws with the list of what exists when it is missing. */
    get(name) {
      if (!has(name)) {
        throw new Error(`the content catalog "${name}" is not loaded; loaded: ${Object.keys(present).join(', ') || 'none'}`);
      }
      return present[name];
    },
    /** A catalog by name, or null when it is missing. */
    find: (name) => (has(name) ? present[name] : null),
  });
}

/** The fifteen catalogs of game/src/catalog/, in the order main.js imports them. */
export const CONTENT_CATALOG_NAMES = Object.freeze([
  'cityDistricts', 'storyMissions', 'storyCharacters', 'vehicleCatalog', 'weaponCatalog',
  'wantedLevels', 'crimeCatalog', 'pedestrianArchetypes', 'gangsAndFactions', 'sideActivities',
  'shopsAndProperties', 'radioStations', 'brandsAndSignage', 'playerControls', 'progressionRanks',
]);
