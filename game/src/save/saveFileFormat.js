// The save file format (docs/ARCHITECTURE.md section 11): one record per slot, holding the
// clock, the seed, the play time, the lead (where he stands, his heading, health and armour) and
// each saving system's own section under its name, with a version number and the migrations
// that bring an older file forward. Also the summary shown by the menus' Continue and Load game.
// Pure, tested in Node (tools/tests/economy-save/).
//
// Versions:
//   1 (18 Nov, 06:30): the lead was written as the `player` system's section by the save system
//     itself ({characterId, position, heading, health, armour}), since the player had none.
//   2 (18 Nov, 07:30): the lead is a header field `lead` of the save system, so that the player
//     system's own section, once it writes one, keeps the name `player` without a clash.

/** The current format version. */
export const SAVE_VERSION = 2;

/** Slots (SAVE_RULES.slots); slot 1 is the one the game uses by default. */
export const SAVE_SLOTS = 3;

/** Keys of a save that are not a system's section. */
const HEADER_KEYS = Object.freeze(['version', 'savedAt', 'seed', 'playSeconds', 'slot', 'reason', 'clock', 'lead']);

/** Systems whose state is never saved: a loaded game starts clean (section 11). */
export const UNSAVED_SYSTEMS = Object.freeze(['wantedLevel', 'policeDispatch', 'traffic', 'pedestrians', 'saveGame', 'showcase']);

/** For each old version N, the function that turns N data into N + 1. */
export const SAVE_MIGRATIONS = Object.freeze({
  1: migrateVersion1,
});

/** Version 1 to 2: the save system's own `player` section (the lead's place) becomes `lead`. */
function migrateVersion1(save) {
  const next = { ...save, version: 2, lead: null };
  const player = save?.player;
  if (player && typeof player === 'object' && player.position && 'characterId' in player) {
    next.lead = { ...player };
    delete next.player;
  }
  return next;
}

/** The lead's fields kept in a save. */
export function leadRecord(lead) {
  if (!lead?.position) return null;
  const p = lead.position;
  return {
    characterId: lead.characterId ?? 'dez_tolliver',
    position: { x: round(p.x), y: round(p.y), z: round(p.z) },
    heading: round(lead.heading ?? 0),
    health: Number.isFinite(lead.health) ? lead.health : 100,
    armour: Number.isFinite(lead.armour) ? lead.armour : 0,
  };
}

/** The storage key of a slot ('save.slot1'). */
export function slotKey(slot = 1) {
  const number = Math.min(SAVE_SLOTS, Math.max(1, Math.floor(Number(slot) || 1)));
  return `save.slot${number}`;
}

/**
 * Builds a save from the header and the sections of the systems.
 * @param {{seed: number, playSeconds: number, clock: object | null, lead?: object | null, slot?: number, reason?: string, savedAt?: string}} header
 * @param {Array<[string, any]>} sections [systemName, serialised data] in manifest order.
 */
export function composeSave(header, sections) {
  const save = {
    version: SAVE_VERSION,
    savedAt: header.savedAt ?? new Date().toISOString(),
    seed: header.seed,
    playSeconds: Math.max(0, Math.round(header.playSeconds ?? 0)),
    slot: header.slot ?? 1,
    reason: header.reason ?? 'manual',
    clock: header.clock ?? null,
    lead: header.lead ?? null,
  };
  for (const [name, data] of sections) {
    if (HEADER_KEYS.includes(name) || UNSAVED_SYSTEMS.includes(name) || data === undefined) continue;
    save[name] = data;
  }
  return save;
}

/**
 * The systems' sections of a save, in the order given (manifest order), then any others.
 * @param {object} save
 * @param {string[]} [order] System names.
 * @returns {Array<[string, any]>}
 */
export function sectionsOf(save, order = []) {
  const names = Object.keys(save).filter((key) => !HEADER_KEYS.includes(key) && !UNSAVED_SYSTEMS.includes(key));
  names.sort((a, b) => rankIn(order, a) - rankIn(order, b));
  return names.map((name) => [name, save[name]]);
}

/**
 * Checks that data looks like a save of the current version.
 * @returns {{ok: boolean, reason: string}}
 */
export function validateSave(save) {
  if (!save || typeof save !== 'object' || Array.isArray(save)) return { ok: false, reason: 'not an object' };
  if (save.version !== SAVE_VERSION) return { ok: false, reason: `version ${save.version}` };
  if (!Number.isFinite(save.playSeconds)) return { ok: false, reason: 'no play time' };
  if (save.clock !== null && (typeof save.clock !== 'object' || Array.isArray(save.clock))) return { ok: false, reason: 'bad clock' };
  if (save.lead !== null && save.lead !== undefined && (typeof save.lead !== 'object' || !save.lead.position)) return { ok: false, reason: 'bad lead' };
  return { ok: true, reason: '' };
}

/**
 * A short description of a save for the Continue button and the slot list.
 * @returns {{cash: number | null, missions: number, playTime: string, savedAt: string, day: number | null}}
 */
export function summariseSave(save) {
  const minutes = Math.floor((save?.playSeconds ?? 0) / 60);
  return {
    cash: Number.isFinite(save?.economy?.cash) ? save.economy.cash : null,
    missions: Array.isArray(save?.missions?.completed) ? save.missions.completed.length : 0,
    playTime: minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`,
    savedAt: typeof save?.savedAt === 'string' ? save.savedAt : '',
    day: Number.isFinite(save?.clock?.day) ? save.clock.day : null,
  };
}

function rankIn(order, name) {
  const index = order.indexOf(name);
  return index < 0 ? order.length : index;
}

function round(value) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}
