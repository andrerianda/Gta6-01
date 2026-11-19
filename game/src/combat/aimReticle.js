// The reticle at the screen centre: a small white dot with a fine dark outline (it reads on sky,
// asphalt and glass alike) that swells a touch and grows a faint thin ring while the lead moves
// or just after a shot (the spread opening), and flashes a small four-stroke hit marker on a hit
// (coral on a kill, popping outward as it fades). Nothing at all with empty hands or outside
// play. It owns one element of its own over the game view, writes the page only when a value
// changes, and touches nothing else.

const STYLE = `
#combat-reticle{position:fixed;left:50%;top:50%;width:0;height:0;pointer-events:none;z-index:6;opacity:0;transition:opacity .12s}
#combat-reticle.on{opacity:1}
#combat-reticle i{position:absolute;display:block}
#combat-reticle .dot{width:4px;height:4px;left:-2px;top:-2px;border-radius:50%;background:#fbfaf6;box-shadow:0 0 0 1px rgba(12,14,18,.62),0 0 3px rgba(0,0,0,.35)}
#combat-reticle .ring{width:20px;height:20px;left:-10px;top:-10px;border-radius:50%;border:1px solid rgba(251,250,246,.7);box-shadow:0 0 0 1px rgba(12,14,18,.28),inset 0 0 0 1px rgba(12,14,18,.28);opacity:0}
#combat-reticle .hm{width:2px;height:6px;left:-1px;top:-3px;background:#fbfaf6;border-radius:1px;box-shadow:0 0 0 1px rgba(12,14,18,.55);opacity:0;transition:opacity .2s ease-out,transform .2s ease-out}
#combat-reticle .hm.a{transform:rotate(45deg) translateY(-11px)}
#combat-reticle .hm.b{transform:rotate(135deg) translateY(-11px)}
#combat-reticle .hm.c{transform:rotate(225deg) translateY(-11px)}
#combat-reticle .hm.d{transform:rotate(315deg) translateY(-11px)}
#combat-reticle.hit .hm,#combat-reticle.kill .hm{opacity:1;transition:none}
#combat-reticle.hit .hm.a,#combat-reticle.kill .hm.a{transform:rotate(45deg) translateY(-8px)}
#combat-reticle.hit .hm.b,#combat-reticle.kill .hm.b{transform:rotate(135deg) translateY(-8px)}
#combat-reticle.hit .hm.c,#combat-reticle.kill .hm.c{transform:rotate(225deg) translateY(-8px)}
#combat-reticle.hit .hm.d,#combat-reticle.kill .hm.d{transform:rotate(315deg) translateY(-8px)}
#combat-reticle.kill .hm{background:#ff6f59}
`;

/** How fast the shown openness follows the wanted one (per second). */
const OPEN_RATE = 14;

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
  const ring = make('ring');
  const dot = make('dot');
  for (const corner of ['a', 'b', 'c', 'd']) make(`hm ${corner}`);
  document.body.appendChild(root);
  let shown = false, open = 0, drawn = -1, flash = 0, flashClass = '';

  return {
    /**
     * Updates the reticle.
     * @param {number} dt Frame seconds.
     * @param {boolean} visible
     * @param {number} openness 0 (steady, aimed) to 1 (moving fast or just fired): reticleOpenness().
     */
    update(dt, visible, openness) {
      if (visible !== shown) { shown = visible; root.classList.toggle('on', visible); }
      const wanted = Math.min(1, Math.max(0, openness || 0));
      open += (wanted - open) * Math.min(1, dt * OPEN_RATE);
      const step = Math.round(open * 20);
      if (step !== drawn) {
        drawn = step;
        const k = step / 20;
        dot.style.transform = `scale(${(1 + 0.4 * k).toFixed(2)})`;
        ring.style.transform = `scale(${(0.45 + 0.6 * k).toFixed(2)})`;
        ring.style.opacity = Math.min(1, k * 2.2).toFixed(2);
      }
      if (flash > 0) {
        flash -= dt;
        if (flash <= 0) { root.classList.remove(flashClass); flashClass = ''; }
      }
    },
    /** Flashes the hit marker (coral and longer on a kill). */
    hit(kill) {
      if (flashClass) root.classList.remove(flashClass);
      flashClass = kill ? 'kill' : 'hit';
      root.classList.add(flashClass);
      flash = kill ? 0.3 : 0.1;
    },
    /** The openness drawn now (0..1), for tests and probes. */
    get openness() { return open; },
    dispose() { root.remove(); style.remove(); },
  };
}

/**
 * How far open the reticle is for a spread: 0 at the weapon's steady aimed spread, 1 at three
 * times it (moving at a run, or the bloom right after a shot).
 * @param {number} spread The current spread (radians, spreadOf()).
 * @param {number} steady The weapon's aimed spread standing still (weapon.spread).
 */
export function reticleOpenness(spread, steady) {
  if (!(steady > 0)) return spread > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, (spread / steady - 1) / 2));
}
