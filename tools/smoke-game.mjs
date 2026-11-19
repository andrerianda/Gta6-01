// The smoke test of the real game: serves game/ at a server's root, as the bounty does, opens
// index.html in headless Chromium and fails on any console error, page error, failed request or
// request to another host, on a page that never becomes ready, on a blank picture, and on a game/
// directory that breaks the gate's size limits. It prints how long the page took to become ready.
//
//   node tools/smoke-game.mjs
//   node tools/smoke-game.mjs --query "?quality=low" --out /tmp/marazul/my-area/smoke.jpg
//
// Exit code 0 when the game is healthy, 1 when it is not, 2 for a mistake on the command line.
// The last line printed is the JSON summary of tools/capture.mjs with a `game` entry added.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { capturePage } from './capture.mjs';
import { failUsage, readCommandLine } from './command-line.mjs';
import { GAME_LIMITS, measureGameDirectory } from './game-size.mjs';

/**
 * Runs the game once and checks it.
 * @param {object} [options]
 * @param {string} [options.query] A query string for index.html, with or without its "?".
 * @param {string} [options.out] Where to save a picture of the ready game (.png or .jpg).
 * @param {number} [options.width] Viewport width (default 960).
 * @param {number} [options.height] Viewport height (default 540).
 * @param {number} [options.timeoutMs] How long the game may take to become ready (default 300000).
 * @param {number} [options.waitMs] Settle time before the picture (default 500).
 * @param {number} [options.lockTimeoutMs] How long to wait for the browser lock.
 * @returns {Promise<import('./capture.mjs').CaptureSummary & { game: { entries: number,
 *   bytes: number, indexBytes: number } }>} The capture summary; `ok` is false when anything failed.
 */
export async function smokeGame(options = {}) {
  const query = options.query ? `?${String(options.query).replace(/^\?/, '')}` : '';
  const size = await measureGameDirectory('game');
  const summary = await capturePage({
    root: 'game',
    page: `index.html${query}`,
    out: options.out,
    width: options.width ?? 960,
    height: options.height ?? 540,
    timeoutMs: options.timeoutMs,
    waitMs: options.waitMs,
    lockTimeoutMs: options.lockTimeoutMs,
    checkPicture: true,
  });
  summary.game = { entries: size.entries, bytes: size.bytes, indexBytes: size.indexBytes };
  summary.errors.push(...size.problems);
  summary.ok = summary.ok && size.problems.length === 0;
  return summary;
}

const USAGE = `
node tools/smoke-game.mjs [options]

Runs the real game the way the bounty serves it (root game/, page index.html) and fails on any
error. Prints how long the page took to become ready, then one JSON summary line.

  --query <string>        query string for index.html, for example "?quality=low"
  --out <file>            also save a picture of the ready game, .png or .jpg
  --size <WxH>            viewport, default 960x540
  --timeout-ms <n>        how long the game may take to become ready (default 300000)
  --wait-ms <n>           settle time before the picture (default 500)
  --lock-timeout-ms <n>   how long to wait for the machine's browser lock (default 1800000)
  --help                  this text
`;

/** Runs the command line: smoke the game, print the verdict and the summary, exit 0 or 1. */
async function runSmokeCommand() {
  const given = readCommandLine({
    usage: USAGE,
    options: {
      query: { type: 'string' },
      out: { type: 'string' },
      size: { type: 'string', default: '960x540' },
      'timeout-ms': { type: 'integer', min: 1 },
      'wait-ms': { type: 'integer', min: 0 },
      'lock-timeout-ms': { type: 'integer', min: 1 },
    },
  });
  const match = /^(\d+)[xX](\d+)$/.exec(given.size);
  if (!match) failUsage(`--size needs WIDTHxHEIGHT, for example 960x540, not "${given.size}"`);
  if (given.out && !/\.(png|jpe?g)$/i.test(given.out)) failUsage(`--out must end in .png, .jpg or .jpeg: ${given.out}`);

  const summary = await smokeGame({
    query: given.query,
    out: given.out,
    width: Number(match[1]),
    height: Number(match[2]),
    timeoutMs: given['timeout-ms'],
    waitMs: given['wait-ms'],
    lockTimeoutMs: given['lock-timeout-ms'],
  });

  const seconds = (milliseconds) => `${(milliseconds / 1000).toFixed(1)} s`;
  const mebibytes = (bytes) => `${(bytes / 1048576).toFixed(1)} MiB`;
  const { timings, game } = summary;
  console.log(summary.ready
    ? `smoke-game: the page was ready after ${seconds(timings.readyMs)} (${seconds(timings.totalMs)} in all, ${seconds(timings.lockMs)} of it waiting for the browser).`
    : `smoke-game: the page was NOT ready after ${seconds(timings.readyMs)}.`);
  console.log(`smoke-game: game/ holds ${game.entries} of ${GAME_LIMITS.entries} files and directories, ${mebibytes(game.bytes)} of ${mebibytes(GAME_LIMITS.bytes)}.`);
  if (summary.warnings.length) console.log(`smoke-game: ${summary.warnings.length} console warning(s); see "warnings" below.`);
  for (const error of summary.errors) console.log(`smoke-game: ERROR ${error}`);
  console.log(summary.ok ? 'smoke-game: OK' : 'smoke-game: FAILED');
  console.log(JSON.stringify(summary));
  process.exit(summary.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runSmokeCommand();
}
