// The WASTED and BUSTED screen: the picture drained of colour, a wide band across the middle with
// the big title (red for wasted, cold blue for busted) and one dry line from the catalog, then
// the fade to black and back. A DOM overlay above the game, below the menus; it never takes input.

const STYLE = `
#lead-down{position:fixed;inset:0;pointer-events:none;z-index:7;display:none}
#lead-down .tint{position:absolute;inset:0;backdrop-filter:grayscale(.85) contrast(1.1) brightness(.8);-webkit-backdrop-filter:grayscale(.85) contrast(1.1) brightness(.8);background:radial-gradient(ellipse at center,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)}
#lead-down .band{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);padding:2.2vh 0 2.6vh;background:linear-gradient(90deg,rgba(0,0,0,0),rgba(0,0,0,.62) 18%,rgba(0,0,0,.62) 82%,rgba(0,0,0,0));text-align:center}
#lead-down .title{font:900 clamp(48px,11vh,120px)/1 "Arial Black",Impact,"Helvetica Neue",Arial,sans-serif;letter-spacing:.06em;color:#d7263d;text-shadow:0 4px 0 rgba(0,0,0,.6),0 0 28px rgba(0,0,0,.5);transform:scale(1.04)}
#lead-down.busted .title{color:#5fa8ff}
#lead-down .line{margin-top:1.4vh;font:600 clamp(14px,2.4vh,22px)/1.3 "Helvetica Neue",Arial,sans-serif;color:#f2ede4;letter-spacing:.02em;opacity:.92}
#lead-down .black{position:absolute;inset:0;background:#000;opacity:0}
`;

/**
 * Creates the down screen.
 * @param {Document} document
 */
export function createDownScreen(document) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'lead-down';
  root.innerHTML = '<div class="tint"></div><div class="band"><div class="title"></div><div class="line"></div></div><div class="black"></div>';
  document.body.appendChild(root);
  const tint = root.querySelector('.tint');
  const band = root.querySelector('.band');
  const title = root.querySelector('.title');
  const line = root.querySelector('.line');
  const black = root.querySelector('.black');
  let shownTitle = -1, shownBlack = -1;

  return {
    /** Shows the screen for 'wasted' or 'busted' with its title and line. */
    show(kind, text, remark) {
      root.className = kind;
      title.textContent = text;
      line.textContent = remark || '';
      root.style.display = 'block';
      shownTitle = shownBlack = -1;
      this.set(0, 0);
    },
    /** Title (with the grey tint) and black, 0..1 each. */
    set(titleAmount, blackAmount) {
      const t = Math.round(titleAmount * 100) / 100, b = Math.round(blackAmount * 100) / 100;
      if (t !== shownTitle) { band.style.opacity = String(t); tint.style.opacity = String(Math.min(1, t * 1.5)); shownTitle = t; }
      if (b !== shownBlack) { black.style.opacity = String(b); shownBlack = b; }
    },
    hide() { root.style.display = 'none'; },
    dispose() { root.remove(); style.remove(); },
  };
}
