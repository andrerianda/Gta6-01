// The phone's screens: a handset with a sunset wallpaper and a status bar (game time), a home
// screen of apps (Contacts, Messages, Map, Settings, Save), the contact list from the
// storyCharacters catalog with a call screen, the message inbox and quick setting toggles. The
// arrow keys move the highlight, Enter opens, Backspace goes back; the mouse works too.
import { createHudElement, setHudText } from './hudElements.js';
import { PHONE_APP_ICONS } from './hudIcons.js';

const APPS = Object.freeze([
  { id: 'contacts', label: 'Contacts' },
  { id: 'messages', label: 'Messages' },
  { id: 'map', label: 'Map' },
  { id: 'settings', label: 'Settings' },
  { id: 'save', label: 'Save' },
  { id: 'taxi', label: 'Taxi' },
]);

/** The quick settings the phone toggles: key, label, the two values. */
const QUICK_SETTINGS = Object.freeze([
  { key: 'gameplay.subtitles', label: 'Subtitles', values: [true, false], names: ['On', 'Off'] },
  { key: 'gameplay.speedUnit', label: 'Speed unit', values: ['kmh', 'mph'], names: ['km/h', 'mph'] },
  { key: 'gameplay.minimapRotates', label: 'Minimap turns', values: [true, false], names: ['On', 'Off'] },
  { key: 'gameplay.hints', label: 'Hints', values: [true, false], names: ['On', 'Off'] },
]);

/**
 * Builds the phone in its container.
 * @param {Document} document
 * @param {HTMLElement} container `phone`.
 * @param {{characters: object[], settings: object, onApp: (appId: string) => boolean|void, clockLabel: () => string}} options
 *   `characters` are the story characters to list; `onApp` handles map, save and taxi and
 *   returns true when it closed the phone.
 */
export function createPhoneScreen(document, container, options) {
  container.classList.add('phone');
  const body = createHudElement(document, 'div', 'phone-body', container);
  const status = createHudElement(document, 'div', 'phone-status', body);
  const time = createHudElement(document, 'span', 'phone-time', status);
  createHudElement(document, 'span', 'phone-carrier', status).textContent = 'Marazul Movil';
  const title = createHudElement(document, 'div', 'phone-title', body);
  const screen = createHudElement(document, 'div', 'phone-screen', body);
  /** @type {{contactId: string, text: string, read: boolean}[]} */
  const messages = [];
  let page = 'home';
  let items = [];
  let selected = 0;
  let calling = 0;

  const nameOf = (contactId) => options.characters.find((c) => c.id === contactId)?.name ?? contactId;

  function select(index) {
    if (!items.length) return;
    selected = (index + items.length) % items.length;
    items.forEach((item, i) => item.element.classList.toggle('is-selected', i === selected));
    items[selected].element.scrollIntoView?.({ block: 'nearest' });
  }

  function show(next) {
    page = next;
    screen.replaceChildren();
    screen.dataset.page = page;
    items = [];
    const add = (className, build, activate) => {
      const element = createHudElement(document, 'button', className, screen);
      element.type = 'button';
      build(element);
      const item = { element, activate };
      element.addEventListener('click', () => { select(items.indexOf(item)); activate(); });
      items.push(item);
    };
    if (page === 'home') {
      setHudText(title, '');
      for (const app of APPS) {
        const unread = app.id === 'messages' ? messages.filter((m) => !m.read).length : 0;
        add('phone-app', (element) => {
          createHudElement(document, 'span', `phone-app-icon phone-app-${app.id}`, element, PHONE_APP_ICONS[app.id]);
          createHudElement(document, 'span', 'phone-app-label', element).textContent = app.label;
          if (unread) createHudElement(document, 'span', 'phone-badge', element).textContent = String(unread);
        }, () => {
          if (app.id === 'contacts' || app.id === 'messages' || app.id === 'settings') show(app.id);
          else options.onApp(app.id);
        });
      }
    } else if (page === 'contacts') {
      setHudText(title, 'Contacts');
      for (const character of options.characters) {
        add('phone-row', (element) => {
          createHudElement(document, 'span', 'phone-avatar', element).textContent = character.name[0];
          const text = createHudElement(document, 'span', 'phone-row-text', element);
          createHudElement(document, 'strong', '', text).textContent = character.name;
          createHudElement(document, 'small', '', text).textContent = character.alias && character.alias !== character.name
            ? `"${character.alias}"  ${character.fullName}` : character.fullName;
        }, () => call(character));
      }
    } else if (page === 'messages') {
      setHudText(title, 'Messages');
      if (!messages.length) createHudElement(document, 'p', 'phone-empty', screen).textContent = 'No messages yet.';
      for (const message of [...messages].reverse()) {
        add(`phone-row phone-message${message.read ? '' : ' is-unread'}`, (element) => {
          createHudElement(document, 'span', 'phone-avatar', element).textContent = nameOf(message.contactId)[0];
          const text = createHudElement(document, 'span', 'phone-row-text', element);
          createHudElement(document, 'strong', '', text).textContent = nameOf(message.contactId);
          createHudElement(document, 'small', '', text).textContent = message.text;
        }, () => { message.read = true; show('messages'); });
      }
    } else if (page === 'settings') {
      setHudText(title, 'Settings');
      for (const entry of QUICK_SETTINGS) {
        const index = Math.max(0, entry.values.indexOf(options.settings.get(entry.key)));
        add('phone-row phone-setting', (element) => {
          createHudElement(document, 'strong', '', element).textContent = entry.label;
          createHudElement(document, 'span', 'phone-toggle', element).textContent = entry.names[index];
        }, () => {
          options.settings.set(entry.key, entry.values[(index + 1) % entry.values.length]);
          const keep = selected;
          show('settings');
          select(keep);
        });
      }
    } else if (page === 'call') {
      add('phone-hang-up', (element) => { element.textContent = 'End call'; }, () => show('contacts'));
    }
    select(0);
  }

  function call(character) {
    show('call');
    setHudText(title, '');
    const card = createHudElement(document, 'div', 'phone-call', screen);
    screen.prepend(card);
    createHudElement(document, 'span', 'phone-avatar phone-avatar-large', card).textContent = character.name[0];
    createHudElement(document, 'strong', '', card).textContent = character.name;
    createHudElement(document, 'small', '', card).textContent = character.role;
    createHudElement(document, 'span', 'phone-calling', card).textContent = 'Calling...';
    calling = 4;
  }

  show('home');

  return {
    get messages() { return messages; },
    /** @param {string} contactId @param {string} text */
    receive(contactId, text) {
      messages.push({ contactId, text, read: false });
      if (messages.length > 60) messages.shift();
      if (page === 'home' || page === 'messages') show(page);
    },
    /** @param {{contactId: string, text: string, read: boolean}[]} saved */
    restore(saved) {
      messages.length = 0;
      for (const m of saved ?? []) messages.push({ contactId: m.contactId, text: m.text, read: Boolean(m.read) });
      show('home');
    },
    open() { show('home'); setHudText(time, options.clockLabel()); },
    /**
     * Steps the phone with the phone input context.
     * @param {number} deltaSeconds
     * @param {object} input context.input.
     * @returns {boolean} false when Backspace on the home screen asks to put the phone away.
     */
    update(deltaSeconds, input) {
      setHudText(time, options.clockLabel());
      if (calling > 0) {
        calling -= deltaSeconds;
        if (calling <= 0 && page === 'call') screen.querySelector('.phone-calling')?.replaceChildren('No answer. Try later.');
      }
      if (input.pressed('phoneUp')) select(selected - (page === 'home' ? 3 : 1));
      if (input.pressed('phoneDown')) select(selected + (page === 'home' ? 3 : 1));
      if (input.pressed('phoneAccept')) items[selected]?.activate();
      if (input.pressed('phoneBack')) {
        if (page === 'home') return false;
        show('home');
      }
      return true;
    },
  };
}
