// The reticle at the screen centre: a dot with four ticks that open with the weapon's spread
// while aiming, a brief cross on a hit (coral on a kill), and nothing at all with empty hands or
// outside play. It owns one element of its own, laid over the game view; it touches nothing else.

const STYLE = `
#combat-reticle{position:fixed;left:50%;top:50%;width:0;height:0;pointer-events:none;z-index:6;opacity:0;transition:opacity .12s}
#combat-reticle.on{opacity:1}
#combat-reticle i{position:absolute;background:#fff;box-shadow:0 0 2px rgba(0,0,0,.85);border-radius:1px}
#combat-reticle .dot{width:4px;height:4px;left:-2px;top:-2px;border-radius:50%}
#combat-reticle .t{width:2px;height:8px;left:-1px;top:-4px}
#combat-reticle .l{width:8px;height:2px;left:-4px;top:-1px}
#combat-reticle .hit{width:14px;height:2px;left:-7px;top:-1px;opacity:0}
#combat-reticle.hit .hit{opacity:1}
#combat-reticle.kill .hit{background:#ff6f59;opacity:1}
`;

/**
 * Creates the reticle.
 * @param {Document} document
 */
export function createAimReticle(document) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'combat-reticle';
  root.setAttribute('aria-hidden', 'true');
  const make = (cls) => { const el = document.createElement('i'); el.className = cls; root.appendChild(el); return el; };
  make('dot');
  const ticks = [make('t'), make('t'), make('l'), make('l')];
  const hits = [make('hit'), make('hit')];
  hits[0].style.transform = 'rotate(45deg)';
  hits[1].style.transform = 'rotate(-45deg)';
  document.body.appendChild(root);
  let shown = false, gap = -1, flash = 0, flashClass = '';

  return {
    /**
     * Updates the reticle.
     * @param {number} dt Frame seconds.
     * @param {boolean} visible
     * @param {number} gapPixels Distance of the ticks from the centre.
     */
    update(dt, visible, gapPixels) {
      if (visible !== shown) { shown = visible; root.classList.toggle('on', visible); }
      const g = Math.round(Math.min(60, Math.max(4, gapPixels)));
      if (g !== gap) {
        gap = g;
        ticks[0].style.transform = `translateY(${-g - 4}px)`;
        ticks[1].style.transform = `translateY(${g + 4}px)`;
        ticks[2].style.transform = `translateX(${-g - 4}px)`;
        ticks[3].style.transform = `translateX(${g + 4}px)`;
      }
      if (flash > 0) {
        flash -= dt;
        if (flash <= 0) root.classList.remove(flashClass);
      }
    },
    /** Flashes the hit cross. */
    hit(kill) {
      if (flashClass) root.classList.remove(flashClass);
      flashClass = kill ? 'kill' : 'hit';
      root.classList.add(flashClass);
      flash = kill ? 0.35 : 0.14;
    },
    dispose() { root.remove(); style.remove(); },
  };
}
