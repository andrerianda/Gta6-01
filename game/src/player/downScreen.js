// The down screen, MARAZUL's own: when the lead dies the picture goes to a warm, faded sepia and a
// heading rises in the lower left like the district banner, in heavy sun-bleached italics:
// FLATLINED in coral over a heart trace that runs flat, or CUFFED in gold over a plain rule when
// the police take the lead. A small spaced kicker above it, one dry line from the catalog under
// it, then the fade to black and back. The internal states stay 'wasted' and 'busted'. A DOM
// overlay above the game, below the menus; it never takes input.

/** The words on screen for each way of going down (original to MARAZUL). */
export const DOWN_TITLES = Object.freeze({
  wasted: Object.freeze({ title: 'FLATLINED', kicker: 'MARAZUL GENERAL · ADMITTED' }),
  busted: Object.freeze({ title: 'CUFFED', kicker: 'MARAZUL P.D. · IN CUSTODY' }),
});

const STYLE = `
#lead-down{position:fixed;inset:0;pointer-events:none;z-index:7;display:none;--down-accent:#ff6f59;--down-cream:#fff6e6}
#lead-down.busted{--down-accent:#ffd36b}
#lead-down .tint{position:absolute;inset:0;backdrop-filter:grayscale(.55) sepia(.45) saturate(.85) brightness(.78) contrast(1.06);-webkit-backdrop-filter:grayscale(.55) sepia(.45) saturate(.85) brightness(.78) contrast(1.06);background:linear-gradient(180deg,rgba(40,18,10,.10) 0%,rgba(40,18,10,0) 35%,rgba(16,8,6,.62) 100%)}
#lead-down .card{position:absolute;left:7vw;bottom:17vh;max-width:78vw;font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif;color:var(--down-cream);text-shadow:0 2px 0 rgba(0,0,0,.45),0 0 18px rgba(0,0,0,.4)}
#lead-down .kicker{font:700 clamp(11px,1.9vh,17px)/1 "Segoe UI","Helvetica Neue",Arial,sans-serif;letter-spacing:.32em;opacity:.88;margin-left:.3vw}
#lead-down .title{margin-top:.9vh;font:italic 900 clamp(54px,13vh,140px)/.92 "Segoe UI","Helvetica Neue",Arial,sans-serif;letter-spacing:-.01em;color:var(--down-accent);text-shadow:0 .5vh 0 rgba(0,0,0,.35),0 0 3vh rgba(0,0,0,.35);padding-right:.15em}
#lead-down svg{display:block;width:min(46vw,620px);height:3.4vh;margin-top:1vh;overflow:visible}
#lead-down svg polyline{fill:none;stroke:var(--down-accent);stroke-width:3;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}
#lead-down .flat{opacity:.85}
#lead-down.busted .trace,#lead-down.wasted .flat{display:none}
#lead-down .line{margin-top:1.3vh;margin-left:.2vw;font:600 clamp(14px,2.5vh,23px)/1.3 "Segoe UI","Helvetica Neue",Arial,sans-serif;letter-spacing:.01em;opacity:.94}
#lead-down .black{position:absolute;inset:0;background:#000;opacity:0}
`;

const RULES = '<svg viewBox="0 0 400 24" preserveAspectRatio="none" aria-hidden="true">'
  + '<polyline class="trace" points="0,12 70,12 78,9 86,12 104,12 112,2 120,22 128,12 150,12 158,8 166,12 400,12"/>'
  + '<polyline class="flat" points="0,12 400,12"/></svg>';

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
  root.innerHTML = `<div class="tint"></div><div class="card"><div class="kicker"></div><div class="title"></div>${RULES}<div class="line"></div></div><div class="black"></div>`;
  document.body.appendChild(root);
  const tint = root.querySelector('.tint');
  const card = root.querySelector('.card');
  const kicker = root.querySelector('.kicker');
  const title = root.querySelector('.title');
  const line = root.querySelector('.line');
  const black = root.querySelector('.black');
  let shownTitle = -1, shownBlack = -1;

  return {
    /** Shows the screen for 'wasted' or 'busted' with its words and the catalog line. */
    show(kind, remark) {
      const words = DOWN_TITLES[kind] || DOWN_TITLES.wasted;
      root.className = kind;
      kicker.textContent = words.kicker;
      title.textContent = words.title;
      line.textContent = remark || '';
      root.style.display = 'block';
      shownTitle = shownBlack = -1;
      this.set(0, 0);
    },
    /** Title (with the tint; the card rises a little as it appears) and black, 0..1 each. */
    set(titleAmount, blackAmount) {
      const t = Math.round(titleAmount * 100) / 100, b = Math.round(blackAmount * 100) / 100;
      if (t !== shownTitle) {
        card.style.opacity = String(t);
        card.style.transform = `translateY(${((1 - t) * 2.5).toFixed(2)}vh)`;
        tint.style.opacity = String(Math.min(1, t * 1.5));
        shownTitle = t;
      }
      if (b !== shownBlack) { black.style.opacity = String(b); shownBlack = b; }
    },
    hide() { root.style.display = 'none'; },
    dispose() { root.remove(); style.remove(); },
  };
}
