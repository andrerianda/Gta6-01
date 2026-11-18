// The Continue button of the start menu: shown above Play when a save exists, with the day,
// the cash and the missions passed of that save; one click starts play and loads it. It joins
// the menus system's own start menu (#start-menu) in its button style and removes itself.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';

/**
 * Adds the button.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {{cash: number | null, missions: number, playTime: string, day: number | null}} summary
 * @param {() => boolean} load Loads the save into the running game.
 * @returns {() => void} Removes the button.
 */
export function addContinueButton(context, summary, load) {
  const document = context.page?.document;
  const menu = context.page?.element?.('start-menu');
  if (!document || !menu) return () => {};
  const wrapper = document.createElement('div');
  wrapper.id = 'save-continue';
  wrapper.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'menu-button';
  button.textContent = 'Continue';
  const detail = document.createElement('span');
  detail.style.cssText = 'font-size:14px;letter-spacing:0.06em;opacity:0.85;text-shadow:0 1px 6px rgba(0,0,0,0.6);';
  const parts = [];
  if (summary.day !== null) parts.push(`Day ${summary.day}`);
  if (summary.cash !== null) parts.push(`$${summary.cash.toLocaleString('en-US')}`);
  parts.push(`${summary.missions} ${summary.missions === 1 ? 'mission' : 'missions'} passed`, summary.playTime);
  detail.textContent = parts.join('  ·  ');
  wrapper.append(button, detail);
  button.addEventListener('click', () => {
    if (!context.state.is('startMenu')) return;
    if (context.commands.has(GAME_COMMANDS.GAME_START)) context.commands.run(GAME_COMMANDS.GAME_START, { slot: 1 });
    load();
    context.controls?.device?.setPointerCapture?.(true, true);
  });
  const play = menu.querySelector('.menu-button');
  if (play) {
    play.textContent = 'New game';
    menu.insertBefore(wrapper, play);
  } else {
    menu.append(wrapper);
  }
  return () => {
    wrapper.remove();
    if (play && play.textContent === 'New game') play.textContent = 'Play';
  };
}
