// The phone: the player's handset while the world carries on (T). Contacts from the
// storyCharacters catalog with a call screen, text messages (PHONE_MESSAGE_RECEIVED, saved with
// the game), the city map, quick settings, quick save and a taxi shortcut. It enters and leaves
// phoneOpen; its screens are ui/phoneScreen.js, styled by game/styles/hud.css.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { GAME_STATE } from '../core/state/gameStates.js';

/**
 * Creates the phone system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createPhoneSystem(context) {
  const { clock, commands, content, events, input, page, settings, state } = context;
  let phone = null;
  let pendingMessages = null;
  const unsubscribe = [];

  function notify(text, kind = 'info') {
    if (commands.has(GAME_COMMANDS.UI_NOTIFY)) commands.run(GAME_COMMANDS.UI_NOTIFY, { text, kind, seconds: 4 });
  }

  /** The apps that act outside the phone. Returns true when the phone was put away. */
  function runApp(appId) {
    if (appId === 'map') {
      state.back();
      state.enter(GAME_STATE.MAP_OPEN);
      return true;
    }
    if (appId === 'save') {
      const result = commands.has(GAME_COMMANDS.SAVE_WRITE) ? commands.run(GAME_COMMANDS.SAVE_WRITE, { reason: 'phone' }) : null;
      notify(result?.ok ? 'Game saved.' : 'Saving is not available here.', result?.ok ? 'info' : 'warning');
      return false;
    }
    if (appId === 'taxi') notify('Marazul Cabs: no cars free right now.', 'info');
    return false;
  }

  return {
    name: 'phone',
    runsWhen: 'always',

    async init() {
      const { createPhoneScreen } = await import('./phoneScreen.js');
      const catalog = content.find('storyCharacters')?.STORY_CHARACTERS ?? {};
      const characters = Object.values(catalog).filter((c) => c.roleKind !== 'lead' || c.id === 'sol_arrieta')
        .sort((a, b) => a.name.localeCompare(b.name));
      phone = createPhoneScreen(page.document, page.element('phone'), {
        characters, settings, onApp: runApp, clockLabel: () => clock.label(),
      });
      if (pendingMessages) phone.restore(pendingMessages);
    },

    start() {
      unsubscribe.push(events.on(GAME_EVENTS.PHONE_MESSAGE_RECEIVED, ({ contactId, text, missionId }) => {
        phone.receive(contactId, text);
        if (missionId) return;                       // a giver's call: the HUD shows the call card
        const name = content.find('storyCharacters')?.STORY_CHARACTERS?.[contactId]?.name ?? 'Unknown';
        notify(`New message from ${name}. Press T to read.`, 'mission');
      }));
      unsubscribe.push(events.on(GAME_EVENTS.GAME_STATE_CHANGED, ({ to }) => {
        if (to === GAME_STATE.PHONE_OPEN) phone.open();
      }));
    },

    update(deltaSeconds) {
      if (state.is(GAME_STATE.PLAYING) && input.pressed('openPhone')) state.enter(GAME_STATE.PHONE_OPEN);
      else if (state.is(GAME_STATE.PHONE_OPEN)) {
        if (input.pressed('closePhone') || !phone.update(deltaSeconds, input)) state.back();
      }
    },

    /** @returns {{messages: {contactId: string, text: string, read: boolean}[]}} */
    serialise() {
      return { messages: phone ? phone.messages.map((m) => ({ ...m })) : pendingMessages ?? [] };
    },
    /** @param {{messages?: object[]}} data */
    restore(data) {
      pendingMessages = data?.messages ?? [];
      phone?.restore(pendingMessages);
    },

    dispose() {
      for (const off of unsubscribe.splice(0)) off();
    },
  };
}
