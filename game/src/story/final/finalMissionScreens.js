// What mission 17 draws itself (styles/final-mission.css): in the HUD layer the persistent label
// "MISSION 17/17 · POINT OF NO RETURN", the COVER bar of the walk across the base, a key prompt,
// a help box and the sergeant's dialogue choice; and two full screens in the menus' style: the
// choice of aircraft and mode, and MISSION FAILED with its two retries. DOM only; the runtime and
// the stages decide what shows. Keys are read here from the window while a screen or a panel is
// up (arrows, A/D, W/S, Enter, 1/2/3), so they work in every game state.
import { FINAL_MISSION, SERGEANT_CHOICES } from '../../catalog/finalArcScript.js';

/** The two aircraft cards. */
export const AIRCRAFT_CARDS = Object.freeze([
  { id: 'manta_sombra', name: 'MANTA SOMBRA', line: 'Flying wing. Low and unseen.', facts: ['Radar signature meter, one guided bomb', 'Ceiling 15 km, subsonic'] },
  { id: 'garza_negra', name: 'GARZA NEGRA', line: 'Mach 3 at the edge of the sky.', facts: ['Ceiling 24 km, outruns anything', 'Pressure suit, hot skin, wide turns'] },
]);
/** The two modes; the first is the default. */
export const MODE_CARDS = Object.freeze([
  { id: 'casual', name: 'ASSISTED', line: 'The aircraft helps you fly' },
  { id: 'realistic', name: 'SIMULATION', line: 'Full control, real physics' },
]);

const HUD_LABEL = FINAL_MISSION.hudLabel;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Creates the mission's own interface.
 * @param {Document} [doc]
 */
export function createFinalMissionScreens(doc = document) {
  const layer = el('div', 'fm-layer');
  const label = el('div', 'fm-label', HUD_LABEL);
  const cover = el('div', 'fm-cover');
  const coverHead = el('div', 'fm-cover-head');
  const coverLevel = el('span', 'fm-cover-level', 'CALM');
  coverHead.append(el('span', '', 'COVER'), coverLevel);
  const coverTrack = el('div', 'fm-cover-track');
  const coverFill = el('div', 'fm-cover-fill');
  coverTrack.append(coverFill);
  cover.append(coverHead, coverTrack);
  const prompt = el('div', 'fm-prompt');
  const hint = el('div', 'fm-hint');
  const talk = el('div', 'fm-talk');
  for (const node of [label, cover, prompt, hint, talk]) { node.hidden = true; layer.append(node); }
  const screen = el('div', 'fm-screen');
  screen.hidden = true;
  doc.body.append(layer, screen);

  /** The handler of the open screen or panel: (code) -> handled. */
  let keys = null;
  let talkKeys = null;
  const onKey = (event) => {
    if (event.repeat) return;
    const handler = keys ?? talkKeys;
    if (handler && handler(event.code)) { event.preventDefault(); event.stopPropagation(); }
  };
  window.addEventListener('keydown', onKey, true);

  const move = (code) => (code === 'ArrowLeft' || code === 'KeyA' ? [-1, 0] : code === 'ArrowRight' || code === 'KeyD' ? [1, 0]
    : code === 'ArrowUp' || code === 'KeyW' ? [0, -1] : code === 'ArrowDown' || code === 'KeyS' ? [0, 1] : null);
  const accept = (code) => code === 'Enter' || code === 'NumpadEnter' || code === 'Space';

  function closeScreen() {
    keys = null;
    screen.hidden = true;
    screen.replaceChildren();
  }

  function cardRow(cards, className) {
    const row = el('div', className);
    const nodes = cards.map((card) => {
      const node = el('button', 'fm-card');
      node.type = 'button';
      node.append(el('p', 'fm-card-name', card.name), el('p', 'fm-card-line', card.line));
      for (const fact of card.facts ?? []) node.append(el('p', 'fm-card-fact', fact));
      row.append(node);
      return node;
    });
    return { row, nodes };
  }

  const api = {
    /** The label text, for tests and captures. */
    labelText: HUD_LABEL,
    get screenOpen() { return !screen.hidden; },
    get talkOpen() { return !talk.hidden; },

    /** Shows the HUD part or hides all of it (cinematics, menus, the fail screen). */
    setHudVisible(visible) { layer.hidden = !visible; },
    setLabel(shown) { label.hidden = !shown; },

    /** The COVER bar: suspicion 0..100 (the bar shows what is left of the cover), or null to hide. */
    setCover(suspicion, level) {
      cover.hidden = suspicion === null || suspicion === undefined;
      if (cover.hidden) return;
      coverFill.style.width = `${Math.max(0, 100 - suspicion).toFixed(0)}%`;
      cover.className = `fm-cover is-${level}`;
      coverLevel.textContent = level === 'calm' ? 'CALM' : level === 'watched' ? 'WATCHED' : level === 'suspect' ? 'SUSPECT' : 'BLOWN';
    },

    /** A key prompt ("E  Show pass"), or null. */
    setPrompt(key, text) {
      prompt.hidden = !text;
      if (!text) return;
      prompt.replaceChildren(el('span', 'fm-key', key), doc.createTextNode(text));
    },

    /** The help box, or null. */
    setHint(text) {
      hint.hidden = !text;
      hint.textContent = text ?? '';
    },

    /**
     * The sergeant's dialogue choice: three answers on keys 1 / 2 / 3.
     * @param {(choiceId: string) => void} onChoose
     */
    openTalk(onChoose) {
      talk.replaceChildren();
      SERGEANT_CHOICES.forEach((choice, index) => {
        const row = el('div', 'fm-talk-row');
        row.append(el('span', 'fm-key', String(index + 1)), el('span', '', choice.label), el('span', 'fm-talk-hint', choice.hint));
        talk.append(row);
      });
      const time = el('div', 'fm-talk-time');
      const bar = el('i');
      time.append(bar);
      talk.append(time);
      talk.hidden = false;
      talkKeys = (code) => {
        const match = /^(?:Digit|Numpad)([123])$/.exec(code);
        if (!match) return false;
        const choice = SERGEANT_CHOICES[Number(match[1]) - 1];
        api.closeTalk();
        onChoose(choice.id);
        return true;
      };
      return { setTimeLeft(fraction) { bar.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`; } };
    },
    closeTalk() { talk.hidden = true; talkKeys = null; },

    /**
     * The choice of aircraft and mode.
     * @param {{aircraftId: string, flightMode: string, onConfirm: (choice: {aircraftId: string, flightMode: string}) => void}} options
     */
    openAircraftChoice({ aircraftId, flightMode, onConfirm }) {
      const pick = { aircraft: Math.max(0, AIRCRAFT_CARDS.findIndex((card) => card.id === aircraftId)), mode: Math.max(0, MODE_CARDS.findIndex((card) => card.id === flightMode)), row: 0 };
      const aircraft = cardRow(AIRCRAFT_CARDS, 'fm-cards');
      const modes = cardRow(MODE_CARDS, 'fm-cards fm-modes');
      const paint = () => {
        aircraft.nodes.forEach((node, index) => node.classList.toggle('is-selected', index === pick.aircraft));
        modes.nodes.forEach((node, index) => node.classList.toggle('is-selected', index === pick.mode));
        aircraft.row.style.opacity = pick.row === 0 ? '1' : '0.75';
        modes.row.style.opacity = pick.row === 1 ? '1' : '0.75';
      };
      const confirm = () => {
        closeScreen();
        onConfirm({ aircraftId: AIRCRAFT_CARDS[pick.aircraft].id, flightMode: MODE_CARDS[pick.mode].id });
      };
      aircraft.nodes.forEach((node, index) => node.addEventListener('click', () => { pick.aircraft = index; pick.row = 0; paint(); }));
      modes.nodes.forEach((node, index) => node.addEventListener('click', () => { pick.mode = index; pick.row = 1; paint(); }));
      const go = el('button', 'fm-option is-selected', 'Board the aircraft');
      go.type = 'button';
      go.addEventListener('click', confirm);
      screen.replaceChildren(
        el('p', 'fm-screen-kicker', 'Punta Garza, 05:49'), el('h1', 'fm-screen-title', 'Choose your aircraft'), el('div', 'fm-screen-rule'),
        aircraft.row, modes.row, go, el('p', 'fm-screen-keys', 'A / D aircraft or mode · W / S row · Enter board'),
      );
      screen.hidden = false;
      paint();
      keys = (code) => {
        if (accept(code)) { confirm(); return true; }
        const step = move(code);
        if (!step) return false;
        if (step[1]) pick.row = Math.max(0, Math.min(1, pick.row + step[1]));
        else if (pick.row === 0) pick.aircraft = (pick.aircraft + step[0] + AIRCRAFT_CARDS.length) % AIRCRAFT_CARDS.length;
        else pick.mode = (pick.mode + step[0] + MODE_CARDS.length) % MODE_CARDS.length;
        paint();
        return true;
      };
      return { get choice() { return { aircraftId: AIRCRAFT_CARDS[pick.aircraft].id, flightMode: MODE_CARDS[pick.mode].id }; } };
    },

    /**
     * MISSION FAILED. Left / right changes what the selected retry allows (choicesFor(from) ->
     * {aircraft, mode}): the aircraft first where allowed, the mode with Q / E or when only the mode may change.
     * @param {{reason: string, aircraftId: string, flightMode: string, choicesFor: (from: string) => {aircraft: boolean, mode: boolean},
     *   onRetry: (from: 'checkpoint' | 'start', changes: {aircraftId: string, flightMode: string}) => void}} options
     */
    openFailScreen({ reason, aircraftId, flightMode, choicesFor, onRetry }) {
      const options = [{ from: 'checkpoint', text: 'Retry from checkpoint' }, { from: 'start', text: 'Restart mission' }];
      const pick = { option: 0, aircraft: Math.max(0, AIRCRAFT_CARDS.findIndex((card) => card.id === aircraftId)), mode: Math.max(0, MODE_CARDS.findIndex((card) => card.id === flightMode)) };
      const start = { aircraft: pick.aircraft, mode: pick.mode };
      const list = el('div', 'fm-options');
      const nodes = options.map((option, index) => {
        const node = el('button', 'fm-option');
        node.type = 'button';
        node.append(doc.createTextNode(option.text), el('span', 'fm-option-detail'));
        node.addEventListener('click', () => { if (pick.option === index) confirm(); else { pick.option = index; paint(); } });
        list.append(node);
        return node;
      });
      const chosen = (from) => {
        const allowed = choicesFor(from);
        return { aircraft: allowed.aircraft ? pick.aircraft : start.aircraft, mode: allowed.mode ? pick.mode : start.mode, allowed };
      };
      const paint = () => {
        nodes.forEach((node, index) => {
          node.classList.toggle('is-selected', index === pick.option);
          const now = chosen(options[index].from);
          const parts = [];
          if (now.allowed.aircraft) parts.push(`‹ ${AIRCRAFT_CARDS[now.aircraft].name} ›`);
          if (now.allowed.mode) parts.push(`${now.allowed.aircraft ? 'Q / E' : '‹'} ${MODE_CARDS[now.mode].name}${now.allowed.aircraft ? '' : ' ›'}`);
          node.lastChild.textContent = parts.join('   ·   ');
        });
      };
      const confirm = () => {
        const from = options[pick.option].from;
        const now = chosen(from);
        closeScreen();
        onRetry(from, { aircraftId: AIRCRAFT_CARDS[now.aircraft].id, flightMode: MODE_CARDS[now.mode].id });
      };
      screen.replaceChildren(
        el('p', 'fm-screen-kicker', HUD_LABEL), el('h1', 'fm-screen-title', 'Mission failed'), el('div', 'fm-screen-rule'),
        el('p', 'fm-screen-reason', reason), list, el('p', 'fm-screen-keys', 'W / S choose · A / D change · Enter confirm'),
      );
      screen.hidden = false;
      paint();
      keys = (code) => {
        if (accept(code)) { confirm(); return true; }
        const allowed = choicesFor(options[pick.option].from);
        if ((code === 'KeyQ' || code === 'KeyE') && allowed.mode) { pick.mode = (pick.mode + 1) % MODE_CARDS.length; paint(); return true; }
        const step = move(code);
        if (!step) return false;
        if (step[1]) pick.option = Math.max(0, Math.min(options.length - 1, pick.option + step[1]));
        else if (allowed.aircraft) pick.aircraft = (pick.aircraft + step[0] + AIRCRAFT_CARDS.length) % AIRCRAFT_CARDS.length;
        else if (allowed.mode) pick.mode = (pick.mode + step[0] + MODE_CARDS.length) % MODE_CARDS.length;
        paint();
        return true;
      };
    },

    closeScreen,

    dispose() {
      window.removeEventListener('keydown', onKey, true);
      layer.remove();
      screen.remove();
    },
  };
  return api;
}
