// The save slots at run time: SAVE_WRITE gathers the clock and every system's serialise() (in
// manifest order) into the format of saveFileFormat.js and writes it through context.storage;
// SAVE_LOAD reads, migrates and checks a slot and hands each section back to its system's
// restore(). The lead's place, heading, health and armour go in the save's `lead` header and
// are put back last with PLAYER_TELEPORT and PLAYER_HEAL. A section that fails is logged and
// skipped so that one system cannot lose the whole save. The menus (ui/menuScreens.js) offer
// Continue and Load game through hasSave(), summary() and load().
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import {
  SAVE_VERSION, SAVE_MIGRATIONS, slotKey, composeSave, sectionsOf, validateSave, summariseSave, leadRecord,
} from './saveFileFormat.js';

/**
 * Creates the save slots.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function createSaveSlots(context) {
  const { commands, events, storage } = context;
  const log = context.log?.child ? context.log.child('saveGame') : null;

  const warn = (text) => (log?.warn ? log.warn(text) : undefined);
  const run = (name, payload) => (commands.has(name) ? commands.run(name, payload) : undefined);

  /** Reads a slot and brings it to the current version. */
  function readSlot(slot) {
    const read = storage.read(slotKey(slot), { version: SAVE_VERSION, migrations: SAVE_MIGRATIONS });
    if (!read.ok) return null;
    return validateSave(read.data).ok ? read.data : null;
  }

  /** The lead's place, heading, health and armour (the save's `lead` header). */
  function leadNow() {
    const player = context.systems.find('player');
    const lead = player?.entity ?? context.entities.firstWithTag('player');
    if (!lead) return null;
    return leadRecord({
      characterId: lead.data?.characterId, position: lead.position, heading: player?.motion?.heading ?? lead.heading,
      health: lead.data?.health, armour: lead.data?.armour,
    });
  }

  function restoreLead(data) {
    if (!data?.position) return;
    run(GAME_COMMANDS.PLAYER_TELEPORT, { position: data.position, heading: data.heading });
    run(GAME_COMMANDS.PLAYER_HEAL, { health: data.health, armour: data.armour });
  }

  const slots = {
    playSeconds: 0,

    hasSave: (slot = 1) => readSlot(slot) !== null,
    summary: (slot = 1) => {
      const save = readSlot(slot);
      return save ? summariseSave(save) : null;
    },

    /** Writes a save. @returns {{ok: boolean, bytes: number}} */
    save(slot = 1, reason = 'manual') {
      events.emit(GAME_EVENTS.SAVE_REQUESTED, { slot, reason });
      const sections = [];
      for (const name of context.systems.names()) {
        const system = context.systems.find(name);
        if (!system || name === 'saveGame') continue;
        try {
          if (typeof system.serialise === 'function') sections.push([name, system.serialise()]);
        } catch (error) {
          warn(`the ${name} section was left out of the save: ${error?.message ?? error}`);
        }
      }
      const header = { seed: context.seed, playSeconds: slots.playSeconds, clock: context.clock?.serialise?.() ?? null, lead: leadNow(), flags: context.flags?.serialise?.() ?? null, slot, reason };
      const save = composeSave(header, sections);
      const written = storage.write(slotKey(slot), save, { version: SAVE_VERSION });
      events.emit(GAME_EVENTS.SAVE_COMPLETED, { slot, ok: written.ok, bytes: written.bytes, reason });
      if (!written.ok) warn(`saving failed: ${written.reason}`);
      return { ok: written.ok, bytes: written.bytes };
    },

    /** Loads a save into the running game. @returns {boolean} */
    load(slot = 1) {
      const save = readSlot(slot);
      if (!save) return false;
      if (save.clock) context.clock?.restore?.(save.clock);
      // The world flags before the systems: a mission that resumes (the final mission at its
      // checkpoint) sets its own on top. A save without them (format 2) loads every flag false.
      context.flags?.restore?.(save.flags ?? null);
      for (const [name, data] of sectionsOf(save, context.systems.names())) {
        const system = context.systems.find(name);
        if (!system) continue;
        try {
          if (typeof system.restore === 'function') system.restore(data);
        } catch (error) {
          warn(`the ${name} section could not be restored: ${error?.message ?? error}`);
        }
      }
      // Last, so that nothing restored before (a mission's start, say) moves the lead elsewhere.
      restoreLead(save.lead);
      slots.playSeconds = save.playSeconds;
      events.emit(GAME_EVENTS.SAVE_LOADED, { slot, version: save.version });
      return true;
    },

    start() {
      commands.handle(GAME_COMMANDS.SAVE_WRITE, ({ slot, reason } = {}) => slots.save(slot ?? 1, reason ?? 'manual'));
      commands.handle(GAME_COMMANDS.SAVE_LOAD, ({ slot } = {}) => slots.load(slot ?? 1));
    },

    update(deltaSeconds) {
      if (context.state.simulates && !context.state.is('startMenu')) slots.playSeconds += deltaSeconds;
    },

    dispose() {},
  };
  return slots;
}
