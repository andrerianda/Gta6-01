// Opens one page in headless Chromium for the MARAZUL tools, the way every agent should: under the
// machine-wide browser lock, from a local static server, with the flags that give a working
// WebGL2 context in this container, with every request to another host blocked, and with every
// console error, page error and failed request collected. tools/capture.mjs and
// tools/smoke-game.mjs are built on it; use it directly for a scratch script that needs more than
// one picture of a page (several captures, keyboard and mouse input):
//
//   import { openBrowserPage } from '/home/user/Makefun-project/tools/browser-page.mjs';
//
//   const session = await openBrowserPage({ root: '.', page: 'tools/preview/hello.html', width: 960, height: 540 });
//   try {
//     await session.page.keyboard.press('KeyW');
//     await session.settle({ frames: 2 });
//     await session.screenshot('/tmp/marazul/my-area/after-w.jpg');
//     console.log(session.ready, session.errors, session.timings);
//   } finally {
//     await session.close();          // closes the browser and the server, releases the lock
//   }
//
// Rendering is in software (SwiftShader): a frame of the full image pipeline takes seconds, and the
// GPU process may still be drawing when the page already says it is ready, so every wait here is
// long and configurable.
import { mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, resolve } from 'node:path';
import { acquireBrowserLock, DEFAULT_LOCK_TIMEOUT_MS } from './browser-lock.mjs';
import { startStaticServer } from './static-server.mjs';

/**
 * Opens a page and waits until it is ready.
 * @param {object} [options]
 * @param {string} [options.root] Directory to serve (default 'game', as the bounty serves it; use
 *   '.' for pages under tools/preview/).
 * @param {string} [options.page] Path and query under the root (default 'index.html').
 * @param {number} [options.width] Viewport width in CSS pixels (default 1280).
 * @param {number} [options.height] Viewport height in CSS pixels (default 720).
 * @param {number} [options.scale] Device scale factor: a screenshot has width x scale by
 *   height x scale pixels (default 1).
 * @param {string} [options.ready] A JavaScript expression that becomes truthy when the picture is
 *   complete (default: window.__gameReady === true || window.__previewReady === true).
 * @param {number} [options.timeoutMs] How long the page may take to become ready (default 300000).
 * @param {number} [options.lockTimeoutMs] How long to wait for the browser lock (default 30 min).
 * @param {boolean} [options.keepGoing] Keep waiting for readiness after a page error or a script
 *   that failed to load (default false: such a page is given up at once, to free the browser).
 * @param {string[]} [options.chromiumFlags] Launch flags (default CHROMIUM_FLAGS; for experiments).
 * @returns {Promise<BrowserPageSession>} The open session. It never rejects because the page is
 *   broken (look at `ready` and `errors`); it rejects when the lock, the server or the browser
 *   cannot be had.
 */
export async function openBrowserPage(options = {}) {
  const settings = { ...DEFAULT_PAGE_OPTIONS };
  for (const [name, value] of Object.entries(options)) {
    if (value !== undefined && value !== null) settings[name] = value;
  }

  const started = Date.now();
  const errors = [];
  const warnings = [];
  const timings = { lockMs: 0, launchMs: 0, readyMs: 0 };
  const note = (list, text) => {
    if (list.length < MAX_NOTES) list.push(text.length > MAX_NOTE_LENGTH ? `${text.slice(0, MAX_NOTE_LENGTH)}...` : text);
    else if (list.length === MAX_NOTES) list.push('(more of these were dropped)');
  };

  const lock = await acquireBrowserLock({ timeoutMs: settings.lockTimeoutMs });
  timings.lockMs = Date.now() - started;
  if (lock.mode === 'unavailable') note(warnings, 'no flock program on this machine: running without the browser lock');

  let server = null;
  let browser = null;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    if (browser) await withDeadline(browser.close(), 20000, 'closing the browser').catch(() => {});
    if (server) await server.close().catch(() => {});
    await lock.release();
  };
  const interrupt = () => {
    close().finally(() => process.exit(130));
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);

  try {
    server = await startStaticServer(settings.root);
    const launchStarted = Date.now();
    const { chromium } = createRequire(import.meta.url)('playwright');
    browser = await chromium.launch({ args: [...settings.chromiumFlags], timeout: LAUNCH_TIMEOUT_MS });
    const context = await browser.newContext({
      viewport: { width: settings.width, height: settings.height },
      deviceScaleFactor: settings.scale,
    });

    // The game must load nothing from another host: such a request is refused and is an error.
    const refused = new Set();
    await context.route('**/*', (route) => {
      const request = route.request();
      if (isLocalAddress(request.url(), server.origin)) return route.continue();
      refused.add(request);
      note(errors, `request to another host blocked: ${request.method()} ${request.url()}`);
      return route.abort('blockedbyclient');
    });

    const page = await context.newPage();
    let giveUp;
    const givenUp = new Promise((resolveGivenUp) => {
      giveUp = resolveGivenUp;
    });
    const shortAddress = (address) => (address.startsWith(server.origin) ? address.slice(server.origin.length) : address);

    page.on('console', (message) => {
      const kind = message.type();
      if (kind !== 'error' && kind !== 'warning') return;
      const place = message.location();
      const where = place && place.url ? ` (${shortAddress(place.url)}:${place.lineNumber + 1})` : '';
      note(kind === 'error' ? errors : warnings, `console ${kind}: ${message.text()}${where}`);
    });
    page.on('pageerror', (error) => {
      note(errors, `page error: ${shortAddress(String(error.stack || error.message || error))}`);
      giveUp('a page error');
    });
    page.on('crash', () => {
      note(errors, 'the page crashed');
      giveUp('a crash');
    });
    page.on('requestfailed', (request) => {
      if (refused.has(request) || closed) return;
      const reason = request.failure() ? request.failure().errorText : 'failed';
      note(errors, `request failed: ${request.method()} ${shortAddress(request.url())} (${reason})`);
      if (LOAD_BREAKING_RESOURCES.has(request.resourceType())) giveUp('a script that failed to load');
    });
    page.on('response', (response) => {
      if (response.status() < 400) return;
      note(errors, `request failed: ${response.status()} ${shortAddress(response.url())}`);
      if (LOAD_BREAKING_RESOURCES.has(response.request().resourceType())) giveUp('a script that failed to load');
    });
    page.on('websocket', (socket) => {
      if (!isLocalAddress(socket.url(), server.origin)) note(errors, `websocket to another host: ${socket.url()}`);
    });
    timings.launchMs = Date.now() - launchStarted;

    const address = `${server.origin}/${String(settings.page).replace(/^\/+/, '')}`;
    const readyStarted = Date.now();
    let ready = false;
    try {
      await page.goto(address, { waitUntil: 'commit', timeout: settings.timeoutMs });
      const waiting = page
        .waitForFunction(settings.ready, null, { timeout: settings.timeoutMs, polling: 200 })
        .then(() => 'ready');
      waiting.catch(() => {});
      const outcome = await Promise.race([
        waiting,
        settings.keepGoing ? new Promise(() => {}) : givenUp.then((why) => delay(GIVE_UP_GRACE_MS).then(() => why)),
      ]);
      if (outcome === 'ready') ready = true;
      else note(errors, `not ready: gave up waiting after ${outcome}`);
    } catch (error) {
      const text = String(error.message || error).split('\n')[0];
      note(errors, /Timeout/i.test(text)
        ? `not ready after ${settings.timeoutMs} ms: ${settings.ready} stayed false`
        : `not ready: ${text}`);
    }
    timings.readyMs = Date.now() - readyStarted;

    /** @type {BrowserPageSession} */
    const session = {
      page,
      origin: server.origin,
      address,
      ready,
      errors,
      warnings,
      timings,
      width: Math.round(settings.width * settings.scale),
      height: Math.round(settings.height * settings.scale),
      settle: ({ frames = 0, waitMs = 0, timeoutMs = settings.timeoutMs } = {}) =>
        settlePage(page, frames, waitMs, timeoutMs),
      screenshot: (out, shot = {}) => savePageScreenshot(page, out, shot),
      close,
    };
    return session;
  } catch (error) {
    await close();
    throw error;
  }
}

/**
 * @typedef {object} BrowserPageSession
 * @property {import('playwright').Page} page The Playwright page (keyboard, mouse, evaluate...).
 * @property {string} origin The local server, http://127.0.0.1:port.
 * @property {string} address The address that was opened.
 * @property {boolean} ready Whether the ready expression became truthy in time.
 * @property {string[]} errors Console errors, page errors, failed and refused requests, so far
 *   (the list keeps growing while the page is open).
 * @property {string[]} warnings Console warnings so far.
 * @property {{ lockMs: number, launchMs: number, readyMs: number }} timings Milliseconds spent
 *   waiting for the lock, launching, and from navigation to ready.
 * @property {number} width Screenshot width in pixels (viewport width x scale).
 * @property {number} height Screenshot height in pixels.
 * @property {(options?: { frames?: number, waitMs?: number, timeoutMs?: number }) => Promise<void>} settle
 *   Waits for a number of animation frames, then a number of milliseconds.
 * @property {(out: string, options?: { jpegQuality?: number, timeoutMs?: number }) =>
 *   Promise<{ out: string, bytes: number, type: 'png' | 'jpeg' }>} screenshot
 *   Saves a screenshot; the extension of `out` (.png, .jpg, .jpeg) picks the format.
 * @property {() => Promise<void>} close Closes the browser and the server and releases the lock.
 */

/**
 * The Chromium flags of every MARAZUL browser run. There is no GPU here: ANGLE on SwiftShader
 * gives a WebGL2 context (and is several times faster than Chromium's default fallback, which
 * also floods the console with "GPU stall due to ReadPixels"). Recent Chromium refuses the
 * software path unless it is asked for with --enable-unsafe-swiftshader.
 */
export const CHROMIUM_FLAGS = Object.freeze([
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
]);

/** A page is ready when the game or a preview page says its picture is complete. */
export const DEFAULT_READY_EXPRESSION = 'window.__gameReady === true || window.__previewReady === true';

/** The defaults of openBrowserPage(). */
export const DEFAULT_PAGE_OPTIONS = Object.freeze({
  root: 'game',
  page: 'index.html',
  width: 1280,
  height: 720,
  scale: 1,
  ready: DEFAULT_READY_EXPRESSION,
  timeoutMs: 300000,
  lockTimeoutMs: DEFAULT_LOCK_TIMEOUT_MS,
  keepGoing: false,
  chromiumFlags: CHROMIUM_FLAGS,
});

/** A screenshot may have to wait for the software renderer to finish the frames it still owes. */
export const DEFAULT_SCREENSHOT_TIMEOUT_MS = 240000;

const LAUNCH_TIMEOUT_MS = 180000;
const GIVE_UP_GRACE_MS = 1500;
const MAX_NOTES = 40;
const MAX_NOTE_LENGTH = 2000;
const LOAD_BREAKING_RESOURCES = new Set(['document', 'script']);

/**
 * Saves a screenshot of the page's viewport as PNG or JPEG, by the extension of `out`.
 * @param {import('playwright').Page} page
 * @param {string} out The file to write; its directory is created.
 * @param {{ jpegQuality?: number, timeoutMs?: number }} [options] JPEG quality 1..100 (default 70).
 * @returns {Promise<{ out: string, bytes: number, type: 'png' | 'jpeg' }>}
 */
export async function savePageScreenshot(page, out, { jpegQuality = 70, timeoutMs = DEFAULT_SCREENSHOT_TIMEOUT_MS } = {}) {
  const type = imageTypeOf(out);
  const file = resolve(out);
  await mkdir(dirname(file), { recursive: true });
  await page.screenshot({
    path: file,
    type,
    quality: type === 'jpeg' ? jpegQuality : undefined,
    timeout: timeoutMs,
  });
  return { out: file, bytes: (await stat(file)).size, type };
}

/**
 * The screenshot format a file name asks for.
 * @param {string} out A path ending in .png, .jpg or .jpeg.
 * @returns {'png' | 'jpeg'}
 */
export function imageTypeOf(out) {
  const extension = extname(out).toLowerCase();
  if (extension === '.png') return 'png';
  if (extension === '.jpg' || extension === '.jpeg') return 'jpeg';
  throw new Error(`the output must end in .png, .jpg or .jpeg: ${out}`);
}

/** Waits for `frames` animation frames of the page, then for `waitMs` milliseconds. */
async function settlePage(page, frames, waitMs, timeoutMs) {
  if (frames > 0) {
    const counted = page.evaluate(
      (count) =>
        new Promise((resolveFrames) => {
          let left = count;
          const step = () => {
            if (left <= 0) resolveFrames();
            else {
              left -= 1;
              requestAnimationFrame(step);
            }
          };
          step();
        }),
      frames,
    );
    await withDeadline(counted, timeoutMs, `waiting for ${frames} animation frames`);
  }
  if (waitMs > 0) await delay(waitMs);
}

/** True for an address on our own server and for the schemes that load nothing from a network. */
function isLocalAddress(address, origin) {
  return address.startsWith(`${origin}/`) || address === origin || /^(data|blob|about):/i.test(address)
    || address.startsWith(`${origin.replace(/^http/, 'ws')}/`);
}

/** Resolves or rejects with `promise`, or rejects when it takes longer than `milliseconds`. */
export function withDeadline(promise, milliseconds, what) {
  let timer;
  const deadline = new Promise((_, rejectLate) => {
    timer = setTimeout(() => rejectLate(new Error(`${what} took longer than ${milliseconds} ms`)), milliseconds);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/** A promise that resolves after `milliseconds`. */
function delay(milliseconds) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });
}
