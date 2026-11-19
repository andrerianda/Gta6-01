// The cinematics' page layer: the veil (a fade to and from any colour), the helmet visor (a soft
// dark rim, fogging that pulses with the breath, a faint reflection: it reads as a visor even
// before the visor model exists), the title cards in the game's own style and the skip hint.
// Subtitles are not drawn here: the voiceOver system owns them. Everything sits in one fixed
// container without pointer events and is taken out of the page on dispose.

const CARD_FONT = '"Avenir Next", "Segoe UI", system-ui, sans-serif';
const SERIF_FONT = 'Georgia, "Times New Roman", serif';

/**
 * Builds the layer.
 * @param {{document: Document | null}} page context.page.
 */
export function createCinematicOverlay(page) {
  const document = page?.document ?? null;
  if (!document?.createElement || !document.body) return emptyOverlay();
  const make = (css, parent) => {
    const node = document.createElement('div');
    node.style.cssText = css;
    (parent ?? root).append(node);
    return node;
  };
  const root = document.createElement('div');
  root.id = 'cinematic-layer';
  // Not positioned: its children take their own place among the page's layers (letterbox 12, subtitles 18).
  root.style.cssText = 'pointer-events:none;display:none;';
  document.body.append(root);

  // The visor: under the letterbox (z 12) so the bars cut it like the picture.
  const visor = make('position:fixed;inset:0;z-index:11;display:none;overflow:hidden;');
  const rim = make('position:absolute;inset:-6%;border-radius:46% 46% 40% 40% / 58% 58% 42% 42%;'
    + 'box-shadow:0 0 0 30vmax #030405, inset 0 0 9vmax 5vmax rgba(3,4,5,0.92), inset 0 0 22vmax 4vmax rgba(8,12,16,0.5);', visor);
  const fog = make('position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse 70% 46% at 50% 108%, rgba(214,226,236,0.55), rgba(214,226,236,0.12) 55%, rgba(214,226,236,0) 78%);', visor);
  const glare = make('position:absolute;inset:0;opacity:0.5;background:linear-gradient(112deg, rgba(255,255,255,0) 30%, rgba(190,215,235,0.07) 38%, rgba(255,255,255,0) 44%,'
    + ' rgba(255,255,255,0) 58%, rgba(255,214,170,0.05) 63%, rgba(255,255,255,0) 68%);', visor);
  const tint = make('position:absolute;inset:0;background:rgba(40,52,60,0.10);mix-blend-mode:multiply;', visor);
  void tint;

  const veil = make('position:fixed;inset:0;z-index:13;background:#000;opacity:0;display:none;');
  const cards = make('position:fixed;inset:0;z-index:14;display:none;color:#f1ede4;text-align:center;');
  const hint = make(`position:fixed;right:2.4vw;top:3.4vh;z-index:14;display:none;font:600 clamp(10px,1.4vh,15px)/1 ${CARD_FONT};color:#f1ede4a8;letter-spacing:0.14em;`);
  hint.textContent = 'ENTER  SKIP';

  let veilValue = 0, veilColour = '#000000', card = null;

  function paintVeil() {
    veil.style.opacity = veilValue.toFixed(3);
    veil.style.display = veilValue > 0.002 ? 'block' : 'none';
  }

  function text(parent, css, value) {
    const node = make(css, parent);
    node.textContent = value;
    return node;
  }

  function buildCard(spec) {
    cards.textContent = '';
    const box = make('position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(84vw,1100px);opacity:0;', cards);
    let scroll = null;
    if (spec.style === 'title') {
      if (spec.sub) text(box, `font:500 clamp(10px,1.6vh,17px)/1 ${CARD_FONT};letter-spacing:0.52em;margin-right:-0.52em;color:#cfc8ba;`, spec.sub);
      make('width:min(34vw,360px);height:1px;margin:2.2vh auto 2.6vh;background:linear-gradient(90deg,rgba(241,237,228,0),#f1ede4 22%,#f1ede4 78%,rgba(241,237,228,0));', box);
      text(box, `font:300 clamp(24px,6.4vh,68px)/1.1 ${CARD_FONT};letter-spacing:0.36em;margin-right:-0.36em;text-shadow:0 2px 18px rgba(0,0,0,0.7);`, spec.text);
    } else if (spec.style === 'time') {
      text(box, `font:italic 400 clamp(15px,3vh,32px)/1.3 ${SERIF_FONT};letter-spacing:0.04em;color:#e6e0d2;text-shadow:0 1px 10px #000;`, spec.text);
    } else if (spec.style === 'chapter') {
      box.style.top = '74%';
      if (spec.sub) text(box, `font:600 clamp(9px,1.4vh,15px)/1 ${CARD_FONT};letter-spacing:0.4em;color:#d9a441;margin-bottom:1.2vh;`, spec.sub);
      text(box, `font:400 clamp(16px,3.4vh,36px)/1.2 ${CARD_FONT};letter-spacing:0.2em;text-shadow:0 1px 12px #000;`, spec.text);
    } else if (spec.style === 'credits') {
      box.style.cssText = 'position:absolute;left:50%;top:100%;transform:translateX(-50%);width:min(80vw,900px);opacity:1;';
      if (spec.text) text(box, `font:300 clamp(20px,5vh,54px)/1.2 ${CARD_FONT};letter-spacing:0.34em;margin:0 0 9vh;`, spec.text);
      for (const group of spec.lines ?? []) {
        const [heading, names] = Array.isArray(group) ? group : [group, []];
        text(box, `font:600 clamp(9px,1.5vh,16px)/1 ${CARD_FONT};letter-spacing:0.4em;color:#d9a441;margin:5vh 0 1.6vh;`, String(heading ?? ''));
        for (const name of names ?? []) text(box, `font:400 clamp(13px,2.5vh,27px)/1.5 ${CARD_FONT};letter-spacing:0.06em;`, String(name));
      }
      scroll = box;
    } else { // closing: serif on black
      text(box, `font:400 clamp(16px,3.5vh,38px)/1.5 ${SERIF_FONT};letter-spacing:0.02em;color:#ece6d8;white-space:pre-line;`, spec.text);
      if (spec.sub) text(box, `font:italic 400 clamp(11px,2vh,21px)/1.4 ${SERIF_FONT};color:#a9a294;margin-top:3vh;`, spec.sub);
    }
    cards.style.display = 'block';
    return { box, scroll, style: spec.style };
  }

  return {
    /** Shows or hides the whole layer (a scene is playing). */
    show(on) { root.style.display = 'block'; if (!on) { // the veil may outlive the scene (keepBlack, the fade back) visor.style.display = 'none'; cards.style.display = 'none'; hint.style.display = 'none'; card = null; } },
    /** The veil: 0 clear .. 1 full, of a colour. */
    veil(value, colour = null) {
      if (colour && colour !== veilColour) { veilColour = colour; veil.style.background = colour; }
      veilValue = value < 0 ? 0 : value > 1 ? 1 : value;
      paintVeil();
    },
    get veilValue() { return veilValue; },
    hint(on) { hint.style.display = on ? 'block' : 'none'; },
    /** The visor: kind 'helmet' | 'pressure' | null; breath 0..1 is where the breath cycle is. */
    visor(kind, breath = 0, modelShown = false) {
      if (!kind) { visor.style.display = 'none'; return; }
      visor.style.display = 'block';
      const pressure = kind === 'pressure';
      rim.style.inset = pressure ? '-2%' : '-6%';
      rim.style.borderRadius = pressure ? '50%' : '46% 46% 40% 40% / 58% 58% 42% 42%';
      rim.style.opacity = modelShown ? '0.55' : '1';
      fog.style.opacity = (0.1 + 0.34 * breath).toFixed(3);
      glare.style.transform = `translateX(${(breath * 0.6).toFixed(2)}%)`;
    },
    /** Puts a card up (k 0..1 through its time), or takes it down (null). */
    card(spec, k = 0, seconds = 4) {
      if (!spec) { cards.style.display = 'none'; cards.textContent = ''; card = null; return; }
      if (!card || card.spec !== spec) card = { spec, ...buildCard(spec) };
      if (card.scroll) {
        const travel = card.scroll.offsetHeight + (cards.offsetHeight || 0);
        card.scroll.style.transform = `translate(-50%, ${(-travel * k).toFixed(1)}px)`;
        return;
      }
      const edge = Math.min(0.35, 0.9 / Math.max(0.5, seconds));
      const alpha = k < edge ? k / edge : k > 1 - edge ? (1 - k) / edge : 1;
      card.box.style.opacity = Math.max(0, Math.min(1, alpha)).toFixed(3);
      if (card.style === 'title') card.box.style.letterSpacing = `${(0.02 * k).toFixed(4)}em`;
    },
    dispose() { root.remove(); },
  };
}

function emptyOverlay() {
  let veilValue = 0;
  return {
    show() {}, hint() {}, visor() {}, card() {}, dispose() {},
    veil(value) { veilValue = value; },
    get veilValue() { return veilValue; },
  };
}
