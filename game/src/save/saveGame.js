// Saving and loading: gathers each system's part of the save (every system that offers
// serialise(), in manifest order, under its name, with the clock, the seed, the play time and
// the lead's place, heading, health and armour), writes it to a versioned storage slot through
// context.storage, and restores a game on load, migrating an older format first. The missions
// autosave after a pass, the economy after a purchase, progression after a rank-up; the phone
// and the pause menu save by hand; the menus (ui/) offer Continue and Load game from here.
// Contract: docs/ARCHITECTURE.md, "saveGame" and section 11. Format: saveFileFormat.js
// (tested in tools/tests/economy-save/); wiring: saveSlots.js.
//
// Members: hasSave(slot?); summary(slot?) -> {cash, missions, playTime, savedAt, day} | null;
//   playSeconds; save(slot?, reason?) -> {ok, bytes}; load(slot?) -> boolean.
// Commands: SAVE_WRITE {slot?, reason?} -> {ok, bytes}; SAVE_LOAD {slot?} -> boolean.
// Publishes: SAVE_REQUESTED, SAVE_COMPLETED, SAVE_LOADED.

/**
 * Creates the save game system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createSaveGameSystem(context) {
  let slots = null;

  const system = {
    name: 'saveGame',
    runsWhen: 'always',
    loadWeight: 0.2,

    /** Seconds played in this game (simulating states only). */
    get playSeconds() { return slots ? slots.playSeconds : 0; },
    hasSave: (slot = 1) => Boolean(slots && slots.hasSave(slot)),
    summary: (slot = 1) => (slots ? slots.summary(slot) : null),
    save: (slot = 1, reason = 'manual') => (slots ? slots.save(slot, reason) : { ok: false, bytes: 0 }),
    load: (slot = 1) => Boolean(slots && slots.load(slot)),

    async init(progress) {
      const { createSaveSlots } = await import('./saveSlots.js');
      slots = createSaveSlots(context);
      progress(1, 'saves');
    },

    start() {
      slots.start();
    },

    update(deltaSeconds) {
      slots.update(deltaSeconds);
    },

    dispose() {
      if (slots) slots.dispose();
      slots = null;
    },
  };
  return system;
}
