// The story's subtitles: one line at the bottom centre of the screen in a layer of its own, seen
// in every game state (play, the cutscene letterbox, the fade veil, the cockpit visor) and under
// the menus: the SPEAKER NAME in upper case in the colour of its faction (ui/subtitle/
// subtitleTones.js), then the words in near-white with a soft shadow. The dark violet of El
// Comprador carries a thin light edge so it reads on black; the flashback is italic. A new line
// replaces the old and leaves after its seconds. Follows the gameplay.subtitles setting.
import { SUBTITLE_TEXT_COLOUR, SUBTITLE_TONES } from './subtitle/subtitleTones.js';

const LAYER_STYLE = 'position:fixed;left:50%;bottom:13.5vh;transform:translateX(-50%);z-index:18;'
  + 'max-width:min(72vw,980px);width:max-content;padding:0.35em 0.9em;text-align:center;pointer-events:none;'
  + 'font:600 clamp(15px,2.05vh,26px)/1.38 "Segoe UI","Helvetica Neue",Arial,sans-serif;letter-spacing:0.01em;'
  + 'border-radius:4px;background:rgba(5,7,10,0.34);opacity:0;transition:opacity 0.18s ease;';
const TEXT_SHADOW = '0 1px 2px rgba(0,0,0,0.95),0 0 9px rgba(0,0,0,0.75)';
const LIGHT_EDGE = '-1px 0 0 rgba(232,222,255,0.62),1px 0 0 rgba(232,222,255,0.62),0 -1px 0 rgba(232,222,255,0.62),'
  + '0 1px 0 rgba(232,222,255,0.62),0 0 7px rgba(0,0,0,0.9)';

/**
 * Builds the story subtitle layer on the page.
 * @param {Document} document
 * @param {{enabled?: boolean}} [options]
 */
export function createStorySubtitles(document, options = {}) {
  const layer = document.createElement('div');
  layer.id = 'story-subtitles';
  layer.setAttribute('aria-live', 'polite');
  layer.style.cssText = LAYER_STYLE;
  const name = document.createElement('span');
  name.style.cssText = 'font-weight:800;letter-spacing:0.07em;margin-right:0.55em;';
  const words = document.createElement('span');
  words.style.cssText = `color:${SUBTITLE_TEXT_COLOUR};text-shadow:${TEXT_SHADOW};`;
  layer.append(name, words);
  document.body.appendChild(layer);

  let enabled = options.enabled !== false;
  let secondsLeft = 0;
  let shown = false;

  // A wall-clock backstop takes the line down where the game loop is not ticking.
  const view = document.defaultView;
  let timer = 0;

  const hide = () => {
    view?.clearTimeout(timer);
    shown = false;
    secondsLeft = 0;
    layer.style.opacity = '0';
    layer.dataset.lineId = '';
  };

  return {
    element: layer,
    get shown() { return shown; },

    /**
     * Shows a line; it replaces the one on screen.
     * @param {{speakerName?: string, text: string, tone?: string, seconds?: number, lineId?: string, hold?: boolean}} line
     *   `hold` keeps it up until the next line or clear().
     */
    show(line) {
      const tone = SUBTITLE_TONES[line.tone] ? line.tone : 'steel';
      const speakerName = String(line.speakerName ?? '').toUpperCase();
      name.textContent = speakerName;
      name.style.display = speakerName ? '' : 'none';
      name.style.color = SUBTITLE_TONES[tone];
      name.style.textShadow = tone === 'violet' ? LIGHT_EDGE : TEXT_SHADOW;
      words.textContent = line.text ?? '';
      layer.style.fontStyle = tone === 'memory' ? 'italic' : 'normal';
      layer.dataset.tone = tone;
      layer.dataset.lineId = line.lineId ?? '';
      shown = Boolean(line.text);
      secondsLeft = line.hold ? Infinity : Math.max(0.6, line.seconds ?? 3);
      layer.style.opacity = shown && enabled ? '1' : '0';
      view?.clearTimeout(timer);
      if (view && secondsLeft !== Infinity) timer = view.setTimeout(hide, secondsLeft * 1000 + 500);
    },

    /** Takes the line down. */
    clear: hide,

    /** @param {boolean} on The gameplay.subtitles setting. */
    setEnabled(on) {
      enabled = on !== false;
      layer.style.opacity = shown && enabled ? '1' : '0';
    },

    /** @param {number} deltaSeconds Real seconds: a line keeps its time in every game state. */
    update(deltaSeconds) {
      if (!shown || secondsLeft === Infinity) return;
      secondsLeft -= deltaSeconds;
      if (secondsLeft <= 0) hide();
    },

    dispose() {
      view?.clearTimeout(timer);
      layer.remove();
    },
  };
}
