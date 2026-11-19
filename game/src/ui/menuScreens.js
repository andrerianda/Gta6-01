// The menu screens: the start menu (Continue, New game, Load game, Settings, Controls) and the
// pause menu (Resume, Statistics, Settings, Controls, Save game, Load game), built as panels in
// #start-menu and #pause-menu that the player walks with the mouse or the menu keys (up and down
// to choose, left and right to change a setting, Enter to select, Backspace or Escape to go back).
// menus.js, the system, owns the game states and commands; this file only builds and drives the
// screens. Settings go through context.settings (the engine, the audio and the camera listen to
// SETTINGS_CHANGED); saves through the saveGame system; statistics come from progression.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { DEFAULT_CONTROL_BINDINGS } from '../core/input/controlBindings.js';

/**
 * Creates the two menu screens.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @param {{newGame: () => void, continueGame: (slot: number) => void, resume: () => void}} actions
 *   What the menus system does for the buttons that change the game state.
 * @returns {{open: (which: 'start' | 'pause') => void, refreshStartIfForeign: () => void,
 *   handleInput: (which: 'start' | 'pause', input: object) => (null | 'resume')}}
 */
export function createMenuScreens(context, actions) {
  const { commands, controls, page, settings, systems } = context;
  const document = page.document;
  const saves = () => systems.find('saveGame');
  const screens = {
    start: makeScreen(page.element('start-menu'), startRoot),
    pause: makeScreen(page.element('pause-menu'), pauseRoot),
  };

  function makeScreen(element, root) {
    // Enter and Space are the menus' own select keys: keep the browser from also clicking the
    // focused button. A button keeps no focus after a click for the same reason.
    element.addEventListener('keydown', (event) => {
      if (event.code === 'Enter' || event.code === 'NumpadEnter' || event.code === 'Space') event.preventDefault();
    });
    return { element, root, stack: [], items: [], selected: 0, status: '' };
  }

  const sound = (soundId) => {
    if (commands.has(GAME_COMMANDS.AUDIO_PLAY)) commands.run(GAME_COMMANDS.AUDIO_PLAY, { soundId });
  };

  // --- Panels: each returns the nodes of the screen and registers its items. ---

  function startRoot(screen) {
    const kicker = make('p', 'menu-kicker', 'Golfo de Marazul');
    const title = make('h1', '', 'MARAZUL');
    const tagline = make('p', 'menu-tagline', 'An open city on a warm sea. Take what the tide leaves.');
    const list = make('div', 'menu-list');
    const latest = latestSave();
    if (latest) {
      list.append(button(screen, 'Continue', () => actions.continueGame(latest.slot), describeSave(latest.summary)));
    }
    list.append(button(screen, latest ? 'New game' : 'Play', actions.newGame));
    if (latest) list.append(button(screen, 'Load game', () => push(screen, savePanel('load'))));
    list.append(button(screen, 'Settings', () => push(screen, settingsPanel)));
    list.append(button(screen, 'Controls', () => push(screen, controlsPanel)));
    return [kicker, title, tagline, list, shortControls()];
  }

  function pauseRoot(screen) {
    const list = make('div', 'menu-list');
    list.append(
      button(screen, 'Resume', actions.resume),
      button(screen, 'Statistics', () => push(screen, statisticsPanel)),
      button(screen, 'Settings', () => push(screen, settingsPanel)),
      button(screen, 'Controls', () => push(screen, controlsPanel)),
    );
    if (saves()) {
      list.append(
        button(screen, 'Save game', () => push(screen, savePanel('save'))),
        button(screen, 'Load game', () => push(screen, savePanel('load'))),
      );
    }
    return [make('p', 'menu-kicker', 'Marazul'), make('h2', '', 'Paused'), list];
  }

  function settingsPanel(screen) {
    const rows = make('div', 'menu-rows');
    for (const row of SETTING_ROWS) rows.append(row.range ? rangeRow(screen, row) : choiceRow(screen, row));
    return [make('h2', '', 'Settings'), rows, backButton(screen)];
  }

  function statisticsPanel(screen) {
    const progression = systems.find('progression');
    const rank = progression?.rankEntry;
    const nodes = [make('h2', '', 'Statistics')];
    if (rank) nodes.push(make('p', 'menu-tagline', `${rank.name ?? `Rank ${progression.rank}`}  ·  ${Math.round(progression.reputation ?? 0)} reputation`));
    const rows = progression?.statisticRows ? progression.statisticRows() : [];
    nodes.push(rows.length ? columns(groupBy(rows, (row) => row.category), (row) => [row.name, row.text]) : make('p', 'menu-status', 'No statistics yet.'));
    nodes.push(backButton(screen));
    return nodes;
  }

  function controlsPanel(screen) {
    const groups = new Map();
    for (const [contextName, heading] of CONTROL_GROUPS) {
      const actionsOf = Object.keys(DEFAULT_CONTROL_BINDINGS[contextName] ?? {}).filter((action) => !HIDDEN_ACTIONS.has(action));
      groups.set(heading, actionsOf.map((action) => [contextName, action]));
    }
    const list = columns(groups, ([contextName, action]) => (action === 'weaponSlot1'
      ? ['Weapon slots', '1 - 8']
      : [controls.labels[action] ?? action, controls.promptFor(action, contextName) || '-']), true);
    return [make('h2', '', 'Controls'), list, backButton(screen)];
  }

  function savePanel(mode) {
    return function saveOrLoadPanel(screen) {
      const list = make('div', 'menu-list');
      for (let slot = 1; slot <= SAVE_SLOT_COUNT; slot += 1) {
        const summary = saves()?.hasSave(slot) ? saves().summary(slot) : null;
        const label = `Slot ${slot}`;
        const detail = summary ? describeSave(summary) : 'Empty';
        if (mode === 'save') {
          list.append(button(screen, label, () => {
            const result = saves()?.save(slot, 'manual');
            screen.status = result && result.ok ? `Saved in slot ${slot}.` : 'The game could not be saved.';
            render(screen, screen.selected);
          }, detail));
        } else if (summary) {
          list.append(button(screen, label, () => {
            if (screen === screens.start) {
              actions.continueGame(slot);
            } else if (saves()?.load(slot)) {
              actions.resume();
            }
          }, detail));
        } else {
          const empty = make('div', 'menu-slot-empty', `${label}  ·  Empty`);
          list.append(empty);
        }
      }
      return [make('h2', '', mode === 'save' ? 'Save game' : 'Load game'), list, make('p', 'menu-status', screen.status), backButton(screen)];
    };
  }

  // --- Items ---

  function button(screen, text, onActivate, detail = '') {
    const element = make('button', 'menu-button', text);
    element.type = 'button';
    if (detail) element.append(make('span', 'menu-button-detail', detail));
    const activate = () => {
      sound('ui_click');
      onActivate();
    };
    element.addEventListener('click', () => {
      element.blur();
      activate();
    });
    register(screen, element, { activate });
    return element;
  }

  function backButton(screen) {
    const element = make('button', 'menu-button menu-back', 'Back');
    element.type = 'button';
    element.addEventListener('click', () => back(screen));
    register(screen, element, { activate: () => back(screen) });
    return element;
  }

  function choiceRow(screen, row) {
    const element = make('div', 'menu-row');
    const value = make('span', 'menu-choice-value', '');
    const show = () => {
      const index = row.values.indexOf(settings.get(row.key));
      value.textContent = row.names[Math.max(0, index)];
    };
    const adjust = (direction) => {
      const index = row.values.indexOf(settings.get(row.key));
      const next = row.values[(Math.max(0, index) + direction + row.values.length) % row.values.length];
      settings.set(row.key, next);
      sound('ui_click');
      show();
    };
    const left = arrow('‹', () => adjust(-1));
    const right = arrow('›', () => adjust(1));
    const control = make('span', 'menu-choice');
    control.append(left, value, right);
    element.append(make('span', 'menu-row-label', row.label), control);
    show();
    register(screen, element, { activate: () => adjust(1), adjust });
    return element;
  }

  function rangeRow(screen, row) {
    const element = make('div', 'menu-row');
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'menu-range';
    slider.min = String(row.min);
    slider.max = String(row.max);
    slider.step = String(row.step);
    const value = make('span', 'menu-range-value', '');
    const show = () => {
      const current = Number(settings.get(row.key));
      slider.value = String(current);
      value.textContent = row.format(current);
    };
    const apply = (next) => {
      const clamped = Math.min(row.max, Math.max(row.min, Math.round(next / row.step) * row.step));
      settings.set(row.key, Number(clamped.toFixed(3)));
      show();
    };
    slider.addEventListener('input', () => apply(Number(slider.value)));
    // A focused slider would count as typing for the game's keys: give the focus back.
    slider.addEventListener('change', () => slider.blur());
    const adjust = (direction) => {
      apply(Number(settings.get(row.key)) + direction * row.step);
      sound('ui_click');
    };
    const control = make('span', 'menu-range-control');
    control.append(slider, value);
    element.append(make('span', 'menu-row-label', row.label), control);
    show();
    register(screen, element, { activate: () => {}, adjust });
    return element;
  }

  function arrow(text, onClick) {
    const element = make('button', 'menu-arrow', text);
    element.type = 'button';
    element.tabIndex = -1;
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      element.blur();
      onClick();
    });
    return element;
  }

  function register(screen, element, behaviour) {
    const index = screen.items.length;
    screen.items.push({ element, ...behaviour });
    element.addEventListener('mouseenter', () => select(screen, index));
  }

  // --- Navigation ---

  function render(screen, selected = 0) {
    const panel = screen.stack[screen.stack.length - 1];
    screen.items = [];
    screen.element.replaceChildren(...panel(screen), menuHints(screen));
    screen.element.dataset.panel = screen.stack.length > 1 ? 'sub' : 'root';
    screen.selected = -1;
    select(screen, Math.min(selected, screen.items.length - 1));
  }

  function select(screen, index) {
    if (index === screen.selected || index < 0) return;
    screen.items[screen.selected]?.element.classList.remove('is-selected');
    screen.selected = index;
    const element = screen.items[index]?.element;
    if (!element) return;
    element.classList.add('is-selected');
    if (typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'nearest' });
  }

  function push(screen, panel) {
    screen.status = '';
    screen.stack.push(panel);
    render(screen);
  }

  function back(screen) {
    if (screen.stack.length <= 1) return false;
    screen.stack.pop();
    screen.status = '';
    sound('ui_back');
    render(screen);
    return true;
  }

  function open(which) {
    const screen = screens[which];
    screen.stack = [screen.root];
    screen.status = '';
    render(screen);
  }

  /**
   * Walks the live screen with the menu keys.
   * @returns {null | 'resume'} 'resume' when Escape or P leaves the pause menu from its root.
   */
  function handleInput(which, input) {
    const screen = screens[which];
    const count = screen.items.length;
    if (count > 0 && input.pressed('menuDown')) select(screen, (screen.selected + 1) % count);
    if (count > 0 && input.pressed('menuUp')) select(screen, (screen.selected - 1 + count) % count);
    const item = screen.items[screen.selected];
    if (item?.adjust && input.pressed('menuLeft')) item.adjust(-1);
    if (item?.adjust && input.pressed('menuRight')) item.adjust(1);
    if (item && input.pressed('menuAccept')) {
      item.activate();
      return null;
    }
    if (input.pressed('menuBack') || input.pressed('pause')) {
      if (back(screen)) return null;
      if (which === 'pause') {
        sound('ui_back');
        return 'resume';
      }
    }
    return null;
  }

  // --- Saves ---

  function latestSave() {
    const system = saves();
    if (!system) return null;
    let latest = null;
    for (let slot = 1; slot <= SAVE_SLOT_COUNT; slot += 1) {
      if (!system.hasSave(slot)) continue;
      const summary = system.summary(slot);
      if (summary && (!latest || String(summary.savedAt) > String(latest.summary.savedAt))) latest = { slot, summary };
    }
    return latest;
  }

  // --- Building blocks ---

  function make(tag, className, text = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  /** Groups of [term, description] pairs in newspaper columns, one heading per group. */
  function columns(groups, pair, controlsFirst = false) {
    const wrapper = make('div', 'menu-columns');
    for (const [heading, entries] of groups) {
      if (entries.length === 0) continue;
      const block = make('section', 'menu-column-block');
      const list = make('dl', controlsFirst ? 'menu-pairs menu-pairs-keys' : 'menu-pairs');
      for (const entry of entries) {
        const [term, description] = pair(entry);
        list.append(make('dt', '', term), make('dd', '', String(description)));
      }
      block.append(make('h3', '', heading), list);
      wrapper.append(block);
    }
    return wrapper;
  }

  /** The quick controls card on the start menu: key caps and what they do. */
  function shortControls() {
    const card = make('aside', 'menu-quick-controls');
    const list = make('dl', 'menu-controls');
    for (const [contextName, action] of SHOWN_CONTROLS) {
      const key = make('dt', '');
      key.append(make('kbd', '', controls.promptFor(action, contextName)));
      list.append(key, make('dd', '', controls.labels[action] ?? action));
    }
    card.append(make('h3', '', 'Quick controls'), list);
    return card;
  }

  /** The line of menu keys along the bottom of every menu panel. */
  function menuHints(screen) {
    const inPanel = screen.stack.length > 1;
    const line = make('p', 'menu-hints');
    const pairs = [['↑ ↓', 'Choose'], ['Enter', 'Select']];
    if (inPanel) pairs.splice(1, 0, ['← →', 'Change']);
    if (inPanel || screen === screens.pause) pairs.push(['Esc', inPanel ? 'Back' : 'Resume']);
    for (const [key, text] of pairs) {
      const hint = make('span', 'menu-hint');
      hint.append(make('kbd', '', key), document.createTextNode(` ${text}`));
      line.append(hint);
    }
    return line;
  }

  return {
    open,
    handleInput,
    /** The save system adds its own Continue button to the start menu: rebuild over it. */
    refreshStartIfForeign() {
      if (screens.start.element.querySelector('#save-continue')) open('start');
    },
  };
}

/** How many save slots the menus offer. */
const SAVE_SLOT_COUNT = 3;

const percent = (value) => `${Math.round(value * 100)}%`;
const ON_OFF = { values: [true, false], names: ['On', 'Off'] };

/** The settings rows: a key of the settings store, with its choices or its range. */
const SETTING_ROWS = Object.freeze([
  { key: 'graphics.quality', label: 'Graphics quality', values: ['auto', 'low', 'medium', 'high', 'ultra'], names: ['Automatic', 'Low', 'Medium', 'High', 'Ultra'] },
  { key: 'graphics.dynamicResolution', label: 'Dynamic resolution', ...ON_OFF },
  { key: 'graphics.fieldOfView', label: 'Field of view', range: true, min: 50, max: 70, step: 1, format: (value) => `${Math.round(value)}°` },
  { key: 'graphics.cameraShake', label: 'Camera shake', range: true, min: 0, max: 1, step: 0.1, format: percent },
  { key: 'audio.master', label: 'Master volume', range: true, min: 0, max: 1, step: 0.05, format: percent },
  { key: 'audio.music', label: 'Music and radio', range: true, min: 0, max: 1, step: 0.05, format: percent },
  { key: 'audio.effects', label: 'Sound effects', range: true, min: 0, max: 1, step: 0.05, format: percent },
  { key: 'audio.voices', label: 'Voices', range: true, min: 0, max: 1, step: 0.05, format: percent },
  { key: 'audio.muted', label: 'Mute all', ...ON_OFF },
  { key: 'controls.mouseSensitivity', label: 'Mouse sensitivity', range: true, min: 0.2, max: 3, step: 0.1, format: (value) => `${value.toFixed(1)}×` },
  { key: 'controls.invertLookY', label: 'Invert vertical look', ...ON_OFF },
  { key: 'gameplay.subtitles', label: 'Subtitles', ...ON_OFF },
  { key: 'gameplay.speedUnit', label: 'Speed unit', values: ['kmh', 'mph'], names: ['km/h', 'mph'] },
  // Casual: auto-trim, stall protection, self-levelling. Realistic: the full flight model.
  { key: 'gameplay.flightMode', label: 'Flight mode', values: ['casual', 'realistic'], names: ['Casual', 'Realistic'] },
]);

/** The groups of the controls panel: [input context, heading]. */
const CONTROL_GROUPS = Object.freeze([
  ['onFoot', 'On foot'],
  ['inVehicle', 'In a vehicle'],
  ['inAircraft', 'Aircraft'],
  ['always', 'Anywhere'],
]);

/** Actions folded into one row (weapon slots) or not worth a row. */
const HIDDEN_ACTIONS = new Set(['weaponSlot2', 'weaponSlot3', 'weaponSlot4', 'weaponSlot5', 'weaponSlot6', 'weaponSlot7', 'weaponSlot8', 'moveBackward', 'moveRight', 'brake', 'steerRight']);

/** The short list under the start menu: [input context, action]. */
const SHOWN_CONTROLS = Object.freeze([
  ['onFoot', 'moveForward'], ['onFoot', 'moveLeft'], ['onFoot', 'moveBackward'], ['onFoot', 'moveRight'],
  ['onFoot', 'sprint'], ['onFoot', 'jump'], ['onFoot', 'enterVehicle'], ['onFoot', 'attack'],
  ['onFoot', 'aim'], ['onFoot', 'weaponWheel'], ['inVehicle', 'handbrake'], ['inVehicle', 'horn'],
  ['onFoot', 'openMap'], ['onFoot', 'openPhone'], ['always', 'pause'], ['always', 'togglePerformanceOverlay'],
]);

/** One line about a save: day, cash, missions passed, time played. */
function describeSave(summary) {
  const parts = [];
  if (summary.day !== null && summary.day !== undefined) parts.push(`Day ${summary.day}`);
  if (Number.isFinite(summary.cash)) parts.push(`$${summary.cash.toLocaleString('en-US')}`);
  parts.push(`${summary.missions} ${summary.missions === 1 ? 'mission' : 'missions'}`);
  if (summary.playTime) parts.push(summary.playTime);
  return parts.join('  ·  ');
}

function groupBy(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row) ?? 'general';
    const heading = key.charAt(0).toUpperCase() + key.slice(1);
    if (!groups.has(heading)) groups.set(heading, []);
    groups.get(heading).push(row);
  }
  return groups;
}
