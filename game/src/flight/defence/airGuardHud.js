// The air guard's own corner of the HUD while the lead flies: three chevrons (the air wanted
// level, 1..3 lit) with the stage word beside them (INTERCEPT, WARNING SHOTS, WEAPONS FREE, LOST),
// and under it the line of the sea boundary with the distance to fly back. One small element
// under the page's head-up-display container, in the right column of the flight screen under the
// wanted stars (the money is out of the picture in flight); it only touches the DOM when something changes.

const AMBER = '#ffc24a';
const RED = '#ff5a48';
const DIM = 'rgba(255, 255, 255, 0.22)';
const CHEVRON = 'M2 13 L12 3 L22 13 L18.5 13 L12 6.6 L5.5 13 Z';

/**
 * Creates the element.
 * @param {{document: Document | null, element: (id: string) => HTMLElement}} page context.page.
 * @returns {{show: (level: number, word: string, boundaryLine: string, flash: boolean) => void, hide: () => void, dispose: () => void}}
 */
export function createAirGuardHud(page) {
  const document = page?.document ?? null;
  let host = null;
  try { host = document ? page.element('head-up-display') : null; } catch { host = null; }
  if (!document || !host) return { show() {}, hide() {}, dispose() {} };

  const root = document.createElement('div');
  root.className = 'air-guard-hud';
  root.hidden = true;
  // Its slot of the flight screen (flightHudLayout.flightScreenSlots `airGuard`; styles/hud.css caps its height).
  root.style.cssText = 'position:absolute;top:calc(60 * var(--u, 1px));right:var(--map-edge, 3.5vh);max-width:23vw;text-align:right;'
    + 'display:flex;flex-direction:column;align-items:flex-end;gap:0.3em;'
    + 'font:600 clamp(11px,2vh,17px)/1.1 "Barlow Condensed","Roboto Condensed","Arial Narrow",sans-serif;letter-spacing:0.1em;'
    + 'color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.85);pointer-events:none;z-index:1;';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:0.55em;';
  const word = document.createElement('span');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 34');
  svg.style.cssText = 'width:1.7em;height:2.4em;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.8));';
  const chevrons = [];
  for (let i = 0; i < 3; i += 1) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', CHEVRON);
    path.setAttribute('transform', `translate(0 ${20 - i * 10})`);
    path.setAttribute('fill', DIM);
    svg.append(path);
    chevrons.push(path);
  }
  const line = document.createElement('div');
  line.style.cssText = 'font-size:0.82em;letter-spacing:0.08em;opacity:0.95;';
  row.append(word, svg);
  root.append(row, line);
  host.append(root);

  const shown = { level: -1, word: null, line: null, flash: null, visible: false };

  return {
    /** Shows the level (0..3), the stage word and the boundary line ('' for none); `flash` blinks the lit chevrons. */
    show(level, text, boundaryLine, flash) {
      if (!shown.visible) {
        shown.visible = true;
        root.hidden = false;
      }
      const colour = level >= 3 ? RED : AMBER;
      if (level !== shown.level || flash !== shown.flash) {
        shown.level = level;
        shown.flash = flash;
        for (let i = 0; i < 3; i += 1) chevrons[i].setAttribute('fill', i < level && flash ? colour : DIM);
        word.style.color = colour;
        row.style.display = level > 0 ? 'flex' : 'none';
      }
      if (text !== shown.word) {
        shown.word = text;
        word.textContent = text;
      }
      if (boundaryLine !== shown.line) {
        shown.line = boundaryLine;
        line.textContent = boundaryLine;
        line.style.display = boundaryLine ? 'block' : 'none';
      }
    },
    hide() {
      if (!shown.visible) return;
      shown.visible = false;
      root.hidden = true;
    },
    dispose() {
      root.remove();
    },
  };
}
