// Captures a screenshot of the game or of a preview page in headless Chromium. It serves a
// directory on a free local port, opens a page, waits until the page says its picture is complete,
// optionally runs a snippet in it, and saves a PNG or JPEG. One browser runs at a time on this
// machine: the tool waits for the shared lock by itself.
//
//   node tools/capture.mjs --size 960x540 --out /tmp/marazul/my-area/game.jpg
//   node tools/capture.mjs --root . --page "tools/preview/hello.html" --size 960x540 --out /tmp/marazul/my-area/hello.jpg
//   node tools/capture.mjs --help
//
// It prints one JSON line and exits 0 when the page became ready without a single console error,
// page error, failed request or request to another host; otherwise it exits 1 (2 for a mistake on
// the command line). Import capturePage() to do the same from a script.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DEFAULT_PAGE_OPTIONS, DEFAULT_SCREENSHOT_TIMEOUT_MS, imageTypeOf, openBrowserPage, withDeadline,
} from './browser-page.mjs';
import { failUsage, readCommandLine } from './command-line.mjs';
import { measurePngPicture } from './png-picture.mjs';

/**
 * Opens a page, waits for it, and captures it.
 * @param {object} options Everything openBrowserPage() takes (root, page, width, height, scale,
 *   ready, timeoutMs, lockTimeoutMs, keepGoing), and:
 * @param {string} [options.out] The .png, .jpg or .jpeg file to write. Without it nothing is
 *   saved (useful with checkPicture).
 * @param {string} [options.evaluate] JavaScript run in the page after it is ready and before the
 *   capture; the value of its last expression (awaited if it is a promise) is returned as `eval`.
 * @param {number} [options.evalTimeoutMs] How long the snippet may take (default 120000).
 * @param {number} [options.frames] Animation frames to wait before the capture (default 2 after a
 *   snippet, so that what it changed is drawn; otherwise 0).
 * @param {number} [options.waitMs] Extra settle time before the capture (default 500).
 * @param {number} [options.jpegQuality] JPEG quality, 1..100 (default 70, the review quality).
 * @param {number} [options.maxBytes] Largest file allowed. A JPEG is taken again at lower
 *   qualities until it fits; a PNG that is larger is an error.
 * @param {boolean} [options.checkPicture] Measure the picture and report a blank one as an error.
 * @param {number} [options.captureTimeoutMs] How long one screenshot may take (default 240000).
 * @returns {Promise<CaptureSummary>} What happened. It rejects only for a programming mistake;
 *   every failure of the page or the browser is in `errors`.
 */
export async function capturePage(options = {}) {
  const started = Date.now();
  const captureTimeoutMs = options.captureTimeoutMs ?? DEFAULT_SCREENSHOT_TIMEOUT_MS;
  const type = options.out ? imageTypeOf(options.out) : null;
  /** @type {CaptureSummary} */
  const summary = {
    ok: false,
    ready: false,
    page: String(options.page ?? DEFAULT_PAGE_OPTIONS.page),
    out: options.out ? resolve(options.out) : null,
    bytes: 0,
    width: 0,
    height: 0,
    errors: [],
    warnings: [],
    timings: { lockMs: 0, launchMs: 0, readyMs: 0, evalMs: 0, settleMs: 0, captureMs: 0, closeMs: 0, totalMs: 0 },
    eval: null,
  };

  let session;
  try {
    session = await openBrowserPage(options);
  } catch (error) {
    summary.errors.push(`could not open the page: ${firstLine(error)}`);
    summary.timings.totalMs = Date.now() - started;
    return summary;
  }

  const { errors } = session;
  try {
    summary.ready = session.ready;
    summary.width = session.width;
    summary.height = session.height;
    Object.assign(summary.timings, session.timings);

    if (session.ready && options.evaluate) {
      const evalStarted = Date.now();
      try {
        const value = await withDeadline(
          session.page.evaluate(options.evaluate), options.evalTimeoutMs ?? 120000, 'the snippet',
        );
        summary.eval = value === undefined ? null : value;
      } catch (error) {
        errors.push(`the snippet failed: ${firstLine(error)}`);
      }
      summary.timings.evalMs = Date.now() - evalStarted;
    }

    if (session.ready) {
      const settleStarted = Date.now();
      try {
        await session.settle({ frames: options.frames ?? (options.evaluate ? 2 : 0), waitMs: options.waitMs ?? 500 });
      } catch (error) {
        errors.push(firstLine(error));
      }
      summary.timings.settleMs = Date.now() - settleStarted;
    }

    // A page that never became ready is still captured, to show where it got stuck, but it does
    // not get the full wait: the browser is needed by others.
    const shotTimeoutMs = session.ready ? captureTimeoutMs : Math.min(captureTimeoutMs, 60000);
    const captureStarted = Date.now();
    try {
      if (options.out) {
        let quality = options.jpegQuality ?? 70;
        let saved = await session.screenshot(options.out, { jpegQuality: quality, timeoutMs: shotTimeoutMs });
        while (type === 'jpeg' && options.maxBytes && saved.bytes > options.maxBytes && quality > LOWEST_JPEG_QUALITY) {
          quality = Math.max(LOWEST_JPEG_QUALITY, quality - 6);
          saved = await session.screenshot(options.out, { jpegQuality: quality, timeoutMs: shotTimeoutMs });
        }
        summary.bytes = saved.bytes;
        if (type === 'jpeg') summary.jpegQuality = quality;
        if (options.maxBytes && saved.bytes > options.maxBytes) {
          errors.push(`the picture has ${saved.bytes} bytes, more than the ${options.maxBytes} allowed`);
        }
      }
      if (options.checkPicture) {
        const png = type === 'png'
          ? await readFile(summary.out)
          : await session.page.screenshot({ type: 'png', timeout: shotTimeoutMs });
        summary.picture = measurePngPicture(png);
        if (summary.picture.blank) {
          errors.push(`the picture is blank: ${Math.round(summary.picture.dominantShare * 100)} % of it is one colour`);
        }
      }
    } catch (error) {
      errors.push(`the capture failed: ${firstLine(error)}`);
    }
    summary.timings.captureMs = Date.now() - captureStarted;
  } finally {
    const closeStarted = Date.now();
    await session.close();
    summary.timings.closeMs = Date.now() - closeStarted;
  }

  summary.errors = [...errors];
  summary.warnings = [...session.warnings];
  summary.ok = summary.ready && summary.errors.length === 0;
  summary.timings.totalMs = Date.now() - started;
  return summary;
}

/**
 * @typedef {object} CaptureSummary
 * @property {boolean} ok True when the page became ready and nothing went wrong.
 * @property {boolean} ready Whether the ready expression became truthy in time.
 * @property {string} page The page path and query that was opened.
 * @property {string | null} out The absolute path of the saved picture.
 * @property {number} bytes Its size.
 * @property {number} width Its width in pixels (viewport width x scale).
 * @property {number} height Its height in pixels.
 * @property {number} [jpegQuality] The JPEG quality that was used in the end.
 * @property {ReturnType<typeof measurePngPicture>} [picture] The measurements, with checkPicture.
 * @property {string[]} errors Console errors, page errors, failed and refused requests, a page
 *   that was not ready, a failed snippet or capture.
 * @property {string[]} warnings Console warnings (they do not fail the run).
 * @property {{ lockMs: number, launchMs: number, readyMs: number, evalMs: number, settleMs: number,
 *   captureMs: number, closeMs: number, totalMs: number }} timings Milliseconds: waiting for the
 *   browser lock, launching Chromium, from navigation to ready, in the snippet, settling,
 *   capturing, closing the browser, and in all.
 * @property {any} eval The snippet's result, or null.
 */

const LOWEST_JPEG_QUALITY = 30;

const USAGE = `
node tools/capture.mjs --out <file.png|.jpg> [options]

Serves a directory on a free local port, opens a page in headless Chromium, waits until the page is
ready, and saves a screenshot. Prints one JSON line; exits 1 on any console error, page error,
failed request, request to another host, or when the page never became ready.

  --root <dir>            directory to serve (default: game). Use --root . for tools/preview pages
  --page <path?query>     page under the root, with its query string (default: index.html)
  --out <file>            the picture to write, .png or .jpg (required); its directory is created
  --size <WxH>            viewport in CSS pixels, for example 960x540 (default: 1280x720)
  --width <n> --height <n>  the same, one at a time
  --scale <n>             device scale factor (default 1): the picture has width x scale by
                          height x scale pixels, and the page's interface is drawn that much larger
  --ready <expression>    JavaScript that becomes truthy when the picture is complete (default:
                          window.__gameReady === true || window.__previewReady === true)
  --timeout-ms <n>        how long the page may take to become ready (default 300000)
  --wait-ms <n>           extra settle time before the capture (default 500)
  --frames <n>            animation frames to wait before the capture (default 2 after --eval, else 0)
  --eval <javascript>     run in the page after it is ready and before the capture; the value of the
                          last expression (a promise is awaited) is printed as "eval" in the summary
  --eval-file <file>      the same, read from a file
  --eval-timeout-ms <n>   how long the snippet may take (default 120000)
  --jpeg-quality <1-100>  JPEG quality (default 70, the review quality; 90 or more for final shots)
  --max-bytes <n>         keep the file within n bytes: a JPEG is retaken at lower qualities until
                          it fits (the bounty allows 262144 per screenshot)
  --check-picture         also fail when the picture is blank (one flat colour)
  --capture-timeout-ms <n>  how long one screenshot may take (default 240000)
  --lock-timeout-ms <n>   how long to wait for the machine's browser lock (default 1800000)
  --keep-going            keep waiting for readiness after a page error (default: give up at once)
  --help                  this text

The renderer is software: a frame of the full image pipeline takes seconds. Keep review pictures at
960x540 and be patient; raise --timeout-ms rather than retrying.
`;

/** Runs the command line: capture, print the summary line, exit 0 or 1. */
async function runCaptureCommand() {
  const given = readCommandLine({
    usage: USAGE,
    options: {
      root: { type: 'string' },
      page: { type: 'string' },
      out: { type: 'string' },
      size: { type: 'string' },
      width: { type: 'integer', min: 16, max: 8192 },
      height: { type: 'integer', min: 16, max: 8192 },
      scale: { type: 'number', min: 0.25, max: 4 },
      'device-scale-factor': { type: 'number', min: 0.25, max: 4 },
      ready: { type: 'string' },
      'timeout-ms': { type: 'integer', min: 1 },
      'wait-ms': { type: 'integer', min: 0 },
      frames: { type: 'integer', min: 0, max: 600 },
      eval: { type: 'string' },
      'eval-file': { type: 'string' },
      'eval-timeout-ms': { type: 'integer', min: 1 },
      'jpeg-quality': { type: 'integer', min: 1, max: 100 },
      'max-bytes': { type: 'integer', min: 1 },
      'check-picture': { type: 'boolean' },
      'capture-timeout-ms': { type: 'integer', min: 1 },
      'lock-timeout-ms': { type: 'integer', min: 1 },
      'keep-going': { type: 'boolean' },
    },
  });

  if (!given.out) failUsage('--out <file.png|.jpg> is required');
  try {
    imageTypeOf(given.out);
  } catch (error) {
    failUsage(firstLine(error));
  }
  let { width, height } = given;
  if (given.size) {
    const match = /^(\d+)[xX](\d+)$/.exec(given.size);
    if (!match) failUsage(`--size needs WIDTHxHEIGHT, for example 960x540, not "${given.size}"`);
    width = Number(match[1]);
    height = Number(match[2]);
  }
  if (given.eval && given['eval-file']) failUsage('give --eval or --eval-file, not both');
  let evaluate = given.eval;
  if (given['eval-file']) {
    try {
      evaluate = await readFile(given['eval-file'], 'utf8');
    } catch (error) {
      failUsage(`cannot read --eval-file: ${firstLine(error)}`);
    }
  }

  const summary = await capturePage({
    root: given.root,
    page: given.page,
    out: given.out,
    width,
    height,
    scale: given.scale ?? given['device-scale-factor'],
    ready: given.ready,
    timeoutMs: given['timeout-ms'],
    waitMs: given['wait-ms'],
    frames: given.frames,
    evaluate,
    evalTimeoutMs: given['eval-timeout-ms'],
    jpegQuality: given['jpeg-quality'],
    maxBytes: given['max-bytes'],
    checkPicture: Boolean(given['check-picture']),
    captureTimeoutMs: given['capture-timeout-ms'],
    lockTimeoutMs: given['lock-timeout-ms'],
    keepGoing: Boolean(given['keep-going']),
  });
  console.log(JSON.stringify(summary));
  process.exit(summary.ok ? 0 : 1);
}

/** The first line of an error's message. */
function firstLine(error) {
  return String((error && error.message) || error).split('\n')[0];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runCaptureCommand();
}
