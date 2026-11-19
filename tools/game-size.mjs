// Measures game/ against the limits of the bounty's gate: plain files and directories only, at
// most 993 of them together, 48 MiB in all, and an index.html of at most 1 MiB. The smoke test
// reports it on every run, so that nobody finds out at hand-in that the game grew too large.
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Walks a game directory and compares it with the gate's limits.
 * @param {string} [gameDir] The directory to measure (default 'game').
 * @returns {Promise<{ entries: number, bytes: number, indexBytes: number, problems: string[] }>}
 *   `entries` counts files and directories below gameDir, `bytes` sums the files, and `problems`
 *   lists every limit that is broken (empty when the directory passes).
 */
export async function measureGameDirectory(gameDir = 'game') {
  let entries = 0;
  let bytes = 0;
  let indexBytes = 0;
  const problems = [];

  const walk = async (directory, shown) => {
    for (const name of await readdir(directory)) {
      const path = join(directory, name);
      const shownPath = `${shown}${name}`;
      const stats = await lstat(path);
      entries += 1;
      if (Buffer.byteLength(`game/${shownPath}`) > GAME_LIMITS.pathBytes) problems.push(`path longer than ${GAME_LIMITS.pathBytes} bytes: ${shownPath}`);
      if (stats.isDirectory()) {
        await walk(path, `${shownPath}/`);
      } else if (stats.isFile()) {
        bytes += stats.size;
        if (shownPath === 'index.html') indexBytes = stats.size;
      } else {
        problems.push(`not a plain file or directory: ${shownPath}`);
      }
    }
  };
  await walk(gameDir, '');

  if (!indexBytes) problems.push('game/index.html is missing or empty');
  if (indexBytes > GAME_LIMITS.indexBytes) problems.push(`game/index.html has ${indexBytes} bytes, more than ${GAME_LIMITS.indexBytes}`);
  if (entries > GAME_LIMITS.entries) problems.push(`game/ holds ${entries} files and directories, more than ${GAME_LIMITS.entries}`);
  if (bytes > GAME_LIMITS.bytes) problems.push(`game/ holds ${bytes} bytes, more than ${GAME_LIMITS.bytes}`);
  return { entries, bytes, indexBytes, problems };
}

/** The gate's limits on game/ (the bounty's RULES.txt, "game_files"). */
export const GAME_LIMITS = Object.freeze({
  entries: 993,
  bytes: 48 * 1024 * 1024,
  indexBytes: 1024 * 1024,
  pathBytes: 1000,
});
