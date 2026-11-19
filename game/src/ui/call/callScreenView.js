// The handset on the page: the rendered ONDA Marea 7 (assets/ui/onda_phone_body.webp, modelled
// and rendered in Blender), the live call screen laid onto its screen with a matrix3d transform,
// and the rendered glass reflections and camera hole over that (onda_phone_glass.webp). It rises
// from below the lower right corner with an eased slide and a slight turn, shakes while it buzzes
// and sinks away. The call screen is our own: the time, "Incoming call", the caller's initial in a
// round avatar (a dim silhouette for an unknown number), the name and a second line, a green accept
// and a red decline button with their key caps; connected: the name, the running timer, a level
// meter that moves while the caller speaks and a red end button; then "Call ended".
import { CALL_STATE, formatCallTime } from './callStateMachine.js';
import { PHONE_PICTURE, SCREEN_SIZE, screenQuadTransform } from './screenQuadMatrix.js';

const SHARE_OF_HEIGHT = 0.7;          // the handset's height on the page
const LEVEL_BARS = 11;
const HANDSET = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 2.8l2.6-.6 1.9 4.6-2 1.6a12.5 12.5 0 006.5 6.5l1.6-2 4.6 1.9-.6 2.6'
  + 'a2.4 2.4 0 01-2.4 1.8C10.5 19 5 13.5 4.8 5.2a2.4 2.4 0 011.8-2.4z" fill="currentColor"/></svg>';
const SILHOUETTE = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="18" r="9" fill="currentColor"/>'
  + '<path d="M6 46c1-12 8-18 18-18s17 6 18 18z" fill="currentColor"/></svg>';

const STYLE = `
.incoming-call { position: fixed; right: 3.2vw; bottom: -1.2vh; z-index: 18; pointer-events: none; transform-origin: 100% 100%;
  transform: translate3d(6%, 118%, 0) rotate(11deg); transition: transform 0.5s cubic-bezier(0.5, 0, 0.9, 0.4); visibility: hidden; }
.incoming-call.is-shown { visibility: visible; }
.incoming-call.is-up { transform: none; transition: transform 0.62s cubic-bezier(0.16, 0.9, 0.24, 1.06); }
.incoming-call.is-instant { transition: none; }
.incoming-call-phone { position: relative; width: ${PHONE_PICTURE.width}px; height: ${PHONE_PICTURE.height}px; transform-origin: 100% 100%;
  filter: drop-shadow(-10px 14px 16px rgba(0, 0, 0, 0.55)); }
.incoming-call-shake { position: absolute; inset: 0; }
.incoming-call.is-buzzing .incoming-call-shake { animation: incoming-call-buzz 0.085s linear infinite; }
@keyframes incoming-call-buzz { 0% { transform: translate(0, 0) rotate(0deg); } 25% { transform: translate(-1.6px, 0.6px) rotate(-0.5deg); }
  75% { transform: translate(1.6px, -0.6px) rotate(0.5deg); } 100% { transform: translate(0, 0) rotate(0deg); } }
.incoming-call img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; user-select: none; -webkit-user-drag: none; }
.incoming-call-glass { pointer-events: none; }
.incoming-call-screen { position: absolute; left: 0; top: 0; width: ${SCREEN_SIZE.width}px; height: ${SCREEN_SIZE.height}px; transform-origin: 0 0;
  border-radius: 33px; overflow: hidden; color: #f3f7fb; font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  background: radial-gradient(120% 70% at 50% 28%, #1f6f78 0%, #123b55 42%, #0a1626 100%); display: flex; flex-direction: column; align-items: center; }
.incoming-call[data-state="connected"] .incoming-call-screen { background: radial-gradient(120% 70% at 50% 24%, #24506e 0%, #142a47 46%, #090f1c 100%); }
.incoming-call[data-state="ending"] .incoming-call-screen { background: linear-gradient(#1a1f2b, #090c13); }
.incoming-call-status { align-self: stretch; display: flex; justify-content: space-between; align-items: center; padding: 15px 26px 0 28px;
  font-size: 15px; font-weight: 700; letter-spacing: 0.02em; }
.incoming-call-status span:last-child { font-size: 11px; letter-spacing: 0.22em; opacity: 0.8; }
.incoming-call-kicker { margin-top: 44px; font-size: 15px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #9fe8d2; }
.incoming-call-avatar { position: relative; margin-top: 26px; width: 118px; height: 118px; border-radius: 50%; display: grid; place-items: center;
  font-size: 58px; font-weight: 800; color: #0c2431; background: linear-gradient(145deg, #ffe0a3, #f29a5b); box-shadow: 0 0 0 5px rgba(255, 255, 255, 0.14); }
.incoming-call-avatar.is-unknown { color: #7f8b9c; background: linear-gradient(145deg, #2c3442, #171c26); }
.incoming-call-avatar svg { width: 70%; height: 70%; }
.incoming-call-avatar::after { content: ""; position: absolute; inset: -5px; border-radius: 50%; border: 3px solid rgba(159, 232, 210, 0.75); opacity: 0; }
.incoming-call[data-state="ringing"] .incoming-call-avatar::after { animation: incoming-call-pulse 1.5s ease-out infinite; }
@keyframes incoming-call-pulse { 0% { transform: scale(1); opacity: 0.9; } 100% { transform: scale(1.45); opacity: 0; } }
.incoming-call-name { margin-top: 24px; padding: 0 14px; font-size: 31px; font-weight: 800; line-height: 1.1; text-align: center; }
.incoming-call-line { margin-top: 8px; font-size: 16px; font-weight: 600; opacity: 0.78; letter-spacing: 0.04em; }
.incoming-call-timer { margin-top: 12px; font-size: 34px; font-weight: 300; font-variant-numeric: tabular-nums; letter-spacing: 0.06em; display: none; }
.incoming-call-level { margin-top: 18px; height: 34px; display: none; align-items: center; gap: 4px; }
.incoming-call-level i { width: 5px; height: 100%; border-radius: 3px; background: #9fe8d2; transform: scaleY(0.12); transition: transform 0.09s linear; }
.incoming-call[data-state="connected"] .incoming-call-timer, .incoming-call[data-state="ending"] .incoming-call-timer { display: block; }
.incoming-call[data-state="connected"] .incoming-call-level { display: flex; }
.incoming-call[data-state="connected"] .incoming-call-avatar, .incoming-call[data-state="ending"] .incoming-call-avatar { width: 92px; height: 92px; font-size: 44px; }
.incoming-call[data-state="ending"] .incoming-call-avatar { opacity: 0.5; }
.incoming-call-buttons { margin-top: auto; margin-bottom: 44px; align-self: stretch; display: flex; justify-content: space-evenly; }
.incoming-call-button { display: flex; flex-direction: column; align-items: center; gap: 9px; border: 0; padding: 0; background: none; color: inherit;
  font: inherit; cursor: pointer; pointer-events: auto; }
.incoming-call-button b { width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center; box-shadow: 0 6px 14px rgba(0, 0, 0, 0.4); }
.incoming-call-button svg { width: 34px; height: 34px; color: #fff; }
.incoming-call-button.is-accept b { background: linear-gradient(#3ddc84, #1fa85c); }
.incoming-call[data-state="ringing"] .incoming-call-button.is-accept b { animation: incoming-call-nudge 1s ease-in-out infinite; }
@keyframes incoming-call-nudge { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
.incoming-call-button.is-decline b { background: linear-gradient(#ff5d5d, #d42b3a); }
.incoming-call-button.is-decline svg { transform: rotate(135deg); }
.incoming-call-button kbd { min-width: 30px; padding: 2px 8px; border-radius: 6px; background: rgba(243, 247, 251, 0.92); color: #101824;
  font: 800 13px/1.35 "Segoe UI", Arial, sans-serif; letter-spacing: 0.03em; text-align: center; }
.incoming-call-button[hidden] { display: none; }
.incoming-call:not([data-state="ringing"]) .incoming-call-button.is-accept { display: none; }
.incoming-call[data-state="ending"] .incoming-call-buttons { visibility: hidden; }
`;

function element(document, tag, className, parent, markup) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (markup) node.innerHTML = markup;
  if (parent) parent.appendChild(node);
  return node;
}

/**
 * Builds the handset (hidden) at the end of the page's body.
 * @param {Document} document
 * @param {{assetBase?: string, onAccept: () => void, onDecline: () => void}} options
 */
export function createCallScreenView(document, options) {
  const base = options.assetBase ?? './assets/ui/';
  const style = element(document, 'style', '', document.head);
  style.textContent = STYLE;
  const root = element(document, 'div', 'incoming-call', document.body);
  root.id = 'incoming-call';
  root.dataset.state = CALL_STATE.IDLE;
  const phone = element(document, 'div', 'incoming-call-phone', root);
  const shake = element(document, 'div', 'incoming-call-shake', phone);
  const body = element(document, 'img', 'incoming-call-body', shake);
  body.alt = '';
  body.src = `${base}onda_phone_body.webp`;
  const screen = element(document, 'div', 'incoming-call-screen', shake);
  screen.style.transform = screenQuadTransform(SCREEN_SIZE.width, SCREEN_SIZE.height, PHONE_PICTURE.corners);
  const glass = element(document, 'img', 'incoming-call-glass', shake);
  glass.alt = '';
  glass.src = `${base}onda_phone_glass.webp`;

  const status = element(document, 'div', 'incoming-call-status', screen);
  const time = element(document, 'span', '', status);
  element(document, 'span', '', status).textContent = 'ONDA 5G';
  const kicker = element(document, 'div', 'incoming-call-kicker', screen);
  const avatar = element(document, 'div', 'incoming-call-avatar', screen);
  const name = element(document, 'div', 'incoming-call-name', screen);
  const line = element(document, 'div', 'incoming-call-line', screen);
  const timer = element(document, 'div', 'incoming-call-timer', screen);
  const level = element(document, 'div', 'incoming-call-level', screen);
  const bars = Array.from({ length: LEVEL_BARS }, () => element(document, 'i', '', level));
  const buttons = element(document, 'div', 'incoming-call-buttons', screen);
  const decline = element(document, 'button', 'incoming-call-button is-decline', buttons, `<b>${HANDSET}</b><kbd>Backspace</kbd>`);
  const accept = element(document, 'button', 'incoming-call-button is-accept', buttons, `<b>${HANDSET}</b><kbd>Enter</kbd>`);
  decline.type = 'button';
  accept.type = 'button';
  accept.addEventListener('click', (event) => { event.stopPropagation(); options.onAccept(); });
  decline.addEventListener('click', (event) => { event.stopPropagation(); options.onDecline(); });

  let scale = 0;
  let shownTimer = '';
  let meterClock = 0;
  let hideAfter = 0;

  function fit() {
    const view = document.defaultView;
    const next = Math.max(0.3, ((view?.innerHeight ?? 720) * SHARE_OF_HEIGHT) / PHONE_PICTURE.height);
    if (Math.abs(next - scale) < 0.002) return;
    scale = next;
    root.style.width = `${PHONE_PICTURE.width * scale}px`;
    root.style.height = `${PHONE_PICTURE.height * scale}px`;
    phone.style.transform = `scale(${scale.toFixed(4)})`;
    phone.style.position = 'absolute';
    phone.style.right = '0';
    phone.style.bottom = '0';
  }

  return {
    root,
    /**
     * Shows a call's state.
     * @param {string} state A CALL_STATE.
     * @param {{callerName: string, secondLine?: string, unknown?: boolean, canDecline?: boolean, canHangUp?: boolean,
     *   reason?: string, seconds?: number} | null} call
     */
    show(state, call) {
      root.dataset.state = state;
      if (state === CALL_STATE.IDLE || !call) {
        root.classList.remove('is-up', 'is-buzzing');
        hideAfter = 0.6;
        return;
      }
      fit();
      hideAfter = 0;
      root.classList.add('is-shown');
      // The slide starts on the next frame so the hidden pose is laid out first.
      void root.offsetWidth;
      root.classList.add('is-up');
      kicker.textContent = state === CALL_STATE.RINGING ? 'Incoming call' : state === CALL_STATE.CONNECTED ? 'On call' : 'Call ended';
      name.textContent = call.callerName;
      line.textContent = call.secondLine ?? '';
      avatar.classList.toggle('is-unknown', Boolean(call.unknown));
      if (call.unknown) avatar.innerHTML = SILHOUETTE;
      else avatar.textContent = call.callerName.replace(/^[^A-Za-zÀ-ÿ]*(Maj\.|Sgt\.|Lt\.|Capt\.|El|La)\s+/u, '').charAt(0).toUpperCase() || '?';
      decline.hidden = state === CALL_STATE.RINGING ? call.canDecline === false : call.canHangUp === false;
      if (state === CALL_STATE.ENDING) {
        root.classList.remove('is-buzzing');
        root.dataset.reason = call.reason ?? '';
      }
      this.setSeconds(call.seconds ?? 0, true);
    },
    /** @param {boolean} on The handset shakes with the buzz. */
    setBuzzing(on) { root.classList.toggle('is-buzzing', on); },
    /** @param {string} label The clock on the status bar. */
    setClock(label) { if (time.textContent !== label) time.textContent = label; },
    /** @param {number} seconds The call's length so far. */
    setSeconds(seconds, force = false) {
      const label = formatCallTime(seconds);
      if (!force && label === shownTimer) return;
      shownTimer = label;
      timer.textContent = label;
      root.dataset.seconds = String(Math.floor(seconds));
    },
    /**
     * Moves the level meter and finishes the sink.
     * @param {number} deltaSeconds
     * @param {boolean} speaking The caller is speaking.
     */
    update(deltaSeconds, speaking) {
      if (hideAfter > 0) {
        hideAfter -= deltaSeconds;
        if (hideAfter <= 0) root.classList.remove('is-shown');
        return;
      }
      if (root.dataset.state !== CALL_STATE.CONNECTED) return;
      fit();
      meterClock += deltaSeconds;
      for (let i = 0; i < bars.length; i += 1) {
        const wave = 0.5 + 0.5 * Math.sin(meterClock * (9 + i * 1.7) + i * 2.1) * Math.sin(meterClock * 3.1 + i);
        const centre = 1 - Math.abs(i - (bars.length - 1) / 2) / bars.length;
        bars[i].style.transform = `scaleY(${(speaking ? 0.18 + 0.82 * wave * centre : 0.1).toFixed(2)})`;
      }
    },
    dispose() {
      root.remove();
      style.remove();
    },
  };
}
