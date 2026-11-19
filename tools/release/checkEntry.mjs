// Re-checks MARAZUL's hand-in offline against the make.fun scorer's rows (RULES.txt, "The gate")
// and shows what the judge's outline will list first. It never contacts make.fun.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//   node tools/release/checkEntry.mjs [--out out] [--twice /tmp/marazul/release] [--json]
//
// Rows (pass/fail, with detail): game_files, references, screenshots, dossier_matches, js_parses,
// plus output_caps (/output's own 1000 entries and 64 MiB), dossier_fresh (out/ matches the
// working tree), program_repeatable (--twice: main.ts run twice writes the same bytes, in time).
// Then the outline: the dossier's file headings in load order, how many of them fit the judge's
// text budget, and the first declarations of those files. Exit code 1 when a scorer row fails.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, htmlFacts, importMapOf, importMapMatch, isRelativeRef, isRelativeSpecifier, resolveGamePath, sourceImports } from '../../vendor/makefun-game.ts';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The scorer's numbers, from the kit's RULES.txt (The gate; The dossier). */
export const SCORER_LIMITS = Object.freeze({
  gameMaxEntries: 993,
  gameMaxBytes: 48 * 1024 * 1024,
  gamePathMaxBytes: 1000,
  indexHtmlMaxBytes: 1024 * 1024,
  outputMaxEntries: 1000,
  outputMaxBytes: 64 * 1024 * 1024,
  screenshotsMin: 3,
  screenshotsMax: 4,
  screenshotMaxBytes: 256 * 1024,
  screenshotLongSideMax: 1280,
  screenshotShortSideMin: 480,
  dossierMaxBytes: 1.5 * 1024 * 1024,
  dossierTextMaxBytes: 163840,
  programSeconds: 10,
});

/** The caps the gate rebuilds the dossier with (the same as main.ts passes). */
export const DOSSIER_CAPS = Object.freeze({
  text_max_bytes: SCORER_LIMITS.dossierTextMaxBytes,
  screenshots: { max: SCORER_LIMITS.screenshotsMax, max_bytes: SCORER_LIMITS.screenshotMaxBytes },
  game_max_files: SCORER_LIMITS.gameMaxEntries,
  game_max_bytes: SCORER_LIMITS.gameMaxBytes,
  game_path_max_bytes: SCORER_LIMITS.gamePathMaxBytes,
});

/**
 * Text bytes the judge view leaves for the outline with four 1280x800 screenshots: the contact
 * sheet (768x642) costs 1120 of the entry's 1536 tokens, at 3 bytes a token. Measured with the
 * kit's own dossier-view code on 18 Nov; pass --view-budget to try another figure.
 */
export const JUDGE_OUTLINE_BUDGET_BYTES = (1536 - 1120) * 3;

/** Every entry under a directory, depth first, in code-unit order, without following links. */
export function walkTree(root) {
  const entries = [];
  const visit = (relative) => {
    const names = readdirSync(join(root, relative)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const name of names) {
      const path = relative === '' ? name : `${relative}/${name}`;
      const stat = lstatSync(join(root, path));
      const kind = stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other';
      entries.push({ path, kind, bytes: kind === 'file' ? stat.size : 0 });
      if (kind === 'directory') visit(path);
    }
  };
  visit('');
  return entries;
}

const row = (name, pass, detail) => ({ name, pass, detail });
const mib = (bytes) => `${(bytes / 1048576).toFixed(2)} MiB`;

/** game_files: plain files and directories, within the entry, byte and path caps; index.html small. */
export function checkGameFiles(gameDir, limits = SCORER_LIMITS) {
  if (!existsSync(gameDir)) return row('game_files', false, `${gameDir} does not exist`);
  const entries = walkTree(gameDir);
  const problems = [];
  const odd = entries.filter((e) => e.kind === 'symlink' || e.kind === 'other');
  if (odd.length > 0) problems.push(`${odd.length} symlink or special entries (first: game/${odd[0].path})`);
  const bytes = entries.reduce((n, e) => n + e.bytes, 0);
  if (entries.length > limits.gameMaxEntries) problems.push(`${entries.length} entries > ${limits.gameMaxEntries}`);
  if (bytes > limits.gameMaxBytes) problems.push(`${mib(bytes)} > ${mib(limits.gameMaxBytes)}`);
  const longPath = entries.find((e) => Buffer.byteLength(`game/${e.path}`) > limits.gamePathMaxBytes);
  if (longPath) problems.push(`path over ${limits.gamePathMaxBytes} bytes: game/${longPath.path.slice(0, 60)}...`);
  const index = entries.find((e) => e.path === 'index.html');
  if (!index || index.kind !== 'file') problems.push('game/index.html is not a regular file');
  else if (index.bytes > limits.indexHtmlMaxBytes) problems.push(`index.html ${index.bytes} B > 1 MiB`);
  const facts = `${entries.length}/${limits.gameMaxEntries} entries, ${mib(bytes)}/${mib(limits.gameMaxBytes)}, index.html ${index ? index.bytes : '-'} B, 0 symlinks`;
  return row('game_files', problems.length === 0, problems.length === 0 ? facts : problems.join('; '));
}

/**
 * The dynamic import('literal') specifiers of a module, by a lexical scan that skips comments,
 * strings, template literals and regular expressions. Non-literal imports are not returned.
 */
export function dynamicImportLiterals(source) {
  const found = [];
  let i = 0;
  let previous = '';
  const n = source.length;
  const skipString = (quote) => {
    for (i++; i < n && source[i] !== quote; i++) if (source[i] === '\\') i++;
    i++;
  };
  const skipTemplate = () => {
    let depth = 0;
    for (i++; i < n; i++) {
      const c = source[i];
      if (c === '\\') { i++; continue; }
      if (depth === 0 && c === '`') { i++; return; }
      if (c === '$' && source[i + 1] === '{') { depth++; i++; continue; }
      if (depth > 0 && c === '}') depth--;
    }
  };
  while (i < n) {
    const c = source[i];
    if (c === '/' && source[i + 1] === '/') { while (i < n && source[i] !== '\n') i++; continue; }
    if (c === '/' && source[i + 1] === '*') { const end = source.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; continue; }
    if (c === '"' || c === "'") { skipString(c); previous = 'value'; continue; }
    if (c === '`') { skipTemplate(); previous = 'value'; continue; }
    if (c === '/') {
      if (previous === 'value') { i++; previous = 'op'; continue; }
      let inClass = false;
      for (i++; i < n; i++) {
        const r = source[i];
        if (r === '\\') { i++; continue; }
        if (r === '[') inClass = true; else if (r === ']') inClass = false;
        else if (r === '/' && !inClass) break;
        else if (r === '\n') break;
      }
      i++;
      while (i < n && /[a-z]/i.test(source[i])) i++;
      previous = 'value';
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(source[j])) j++;
      const word = source.slice(i, j);
      if (word === 'import' && source[i - 1] !== '.') {
        const call = /^\s*\(\s*(['"`])([^'"`\\$]*)\1\s*[,)]/.exec(source.slice(j, j + 400));
        if (call) found.push(call[2]);
      }
      const keywordBeforeExpression = ['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await'].includes(word);
      previous = keywordBeforeExpression ? 'op' : 'value';
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) { while (i < n && /[\w.]/.test(source[i])) i++; previous = 'value'; continue; }
    if (/\s/.test(c)) { i++; continue; }
    previous = c === ')' || c === ']' || c === '}' ? 'value' : 'op';
    i++;
  }
  return found;
}

/** references: everything index.html and its reachable modules name is a data: URI or a file in game/. */
export function checkReferences(gameDir) {
  const indexPath = join(gameDir, 'index.html');
  if (!existsSync(indexPath)) return row('references', false, 'no game/index.html');
  const facts = htmlFacts(readFileSync(indexPath, 'utf8'));
  const problems = [];
  if (facts.importMaps.length > 1) problems.push('more than one import map');
  const { map, error } = importMapOf(facts);
  if (error) problems.push(`import map: ${error}`);
  const isFileInGame = (path) => path !== null && existsSync(join(gameDir, path)) && lstatSync(join(gameDir, path)).isFile();
  const describe = (ref, from) => `${JSON.stringify(ref)} in ${from}`;
  let referenceCount = 0;
  let passedOver = 0;
  const reachable = [];
  const queued = new Set();
  const enqueue = (path) => {
    if (!queued.has(path) && /\.(?:m?js)$/i.test(path)) { queued.add(path); reachable.push(path); }
  };
  // A URL reference in the page (attribute or import-map value).
  const checkUrl = (ref, what) => {
    referenceCount++;
    if (ref.startsWith('data:')) return null;
    if (ref.startsWith('//') || (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(ref))) { problems.push(`network or scheme URL ${describe(ref, what)}`); return null; }
    const path = ref.startsWith('/') ? resolveGamePath(`.${ref}`, 'index.html') : resolveGamePath(ref, 'index.html');
    if (!isFileInGame(path)) { problems.push(`names no file in game/: ${describe(ref, what)}`); return null; }
    return path;
  };
  // A module specifier in a script or module.
  const checkSpecifier = (specifier, from, dynamic) => {
    referenceCount++;
    if (specifier.startsWith('data:')) return;
    if (dynamic && specifier.startsWith('node:')) { passedOver++; return; }
    let path = null;
    if (isRelativeSpecifier(specifier)) path = resolveGamePath(specifier, from);
    else if (specifier.startsWith('/') && !specifier.startsWith('//')) path = resolveGamePath(`.${specifier}`, 'index.html');
    else if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(specifier) || specifier.startsWith('//')) { problems.push(`network or scheme specifier ${describe(specifier, from)}`); return; }
    else {
      const match = importMapMatch(map, specifier, from);
      if (!match.found) { if (dynamic) { passedOver++; return; } problems.push(`unmapped bare specifier ${describe(specifier, from)}`); return; }
      if (match.value === null) { problems.push(`blocked specifier ${describe(specifier, from)}`); return; }
      if (match.value.startsWith('data:')) return;
      path = isRelativeRef(match.value) ? resolveGamePath(match.value, 'index.html') : match.value.startsWith('/') && !match.value.startsWith('//') ? resolveGamePath(`.${match.value}`, 'index.html') : null;
    }
    if (!isFileInGame(path)) { problems.push(`names no file in game/: ${describe(specifier, from)}`); return; }
    enqueue(path);
  };
  const scanModule = (text, from) => {
    for (const specifier of sourceImports(text)) checkSpecifier(specifier, from, false);
    for (const specifier of dynamicImportLiterals(text)) checkSpecifier(specifier, from, true);
  };
  if (map) for (const value of Object.values(map.imports)) if (value !== null) checkUrl(value, 'the import map');
  if (map) for (const scope of Object.values(map.scopes)) for (const value of Object.values(scope)) if (value !== null) checkUrl(value, 'an import-map scope');
  for (const script of facts.scripts) {
    if (script.type === 'importmap') continue;
    if (script.src !== null) { const path = checkUrl(script.src, '<script src>'); if (path) enqueue(path); }
    else if (script.text.trim() !== '') scanModule(script.text, 'index.html');
  }
  for (const link of facts.links) {
    const path = checkUrl(link.href, `<link rel="${link.rel}">`);
    if (path && link.rel === 'modulepreload') enqueue(path);
  }
  for (const resource of facts.resources) checkUrl(resource.src, `<${resource.tag} src>`);
  for (let k = 0; k < reachable.length; k++) scanModule(readFileSync(join(gameDir, reachable[k]), 'utf8'), reachable[k]);
  const detail = `${reachable.length} reachable modules, ${referenceCount} references, ${passedOver} passed over`;
  return { ...row('references', problems.length === 0, problems.length === 0 ? detail : `${problems.length} problems: ${problems.slice(0, 3).join('; ')}`), reachable };
}

/** The pixel size of a whole PNG or JPEG, or why it is not one. */
export function pictureSize(bytes) {
  if (bytes.length > 24 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    const whole = bytes.subarray(bytes.length - 8, bytes.length - 4).toString('latin1') === 'IEND';
    return whole ? { format: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : { error: 'PNG without its IEND end' };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return { error: 'JPEG without its end marker' };
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) return { error: 'JPEG marker stream broken' };
      const marker = bytes[at + 1];
      if (marker === 0xff) { at++; continue; }
      const length = bytes.readUInt16BE(at + 2);
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) return { format: 'jpeg', width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) };
      at += 2 + length;
    }
    return { error: 'JPEG without a frame header' };
  }
  return { error: 'neither PNG nor JPEG' };
}

/** screenshots: 3 to 4 well-named, whole PNG or JPEG files within the size and pixel caps. */
export function checkScreenshots(shotsDir, limits = SCORER_LIMITS) {
  if (!existsSync(shotsDir)) return row('screenshots', false, `${shotsDir} does not exist`);
  const names = readdirSync(shotsDir).filter((name) => !name.startsWith('.')).sort();
  const problems = [];
  const sizes = [];
  if (names.length < limits.screenshotsMin || names.length > limits.screenshotsMax) problems.push(`${names.length} images, want ${limits.screenshotsMin}-${limits.screenshotsMax}`);
  for (const name of names) {
    const path = join(shotsDir, name);
    if (!/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(name)) problems.push(`${name}: bad name`);
    if (!lstatSync(path).isFile()) { problems.push(`${name}: not a regular file`); continue; }
    const bytes = readFileSync(path);
    if (bytes.length > limits.screenshotMaxBytes) problems.push(`${name}: ${bytes.length} B > ${limits.screenshotMaxBytes}`);
    const size = pictureSize(bytes);
    if (size.error) { problems.push(`${name}: ${size.error}`); continue; }
    const long = Math.max(size.width, size.height);
    const short = Math.min(size.width, size.height);
    if (long > limits.screenshotLongSideMax) problems.push(`${name}: long side ${long} > ${limits.screenshotLongSideMax}`);
    if (short < limits.screenshotShortSideMin) problems.push(`${name}: short side ${short} < ${limits.screenshotShortSideMin}`);
    sizes.push(`${name} ${size.width}x${size.height} ${(bytes.length / 1024).toFixed(0)}K`);
  }
  return row('screenshots', problems.length === 0, problems.length === 0 ? `${names.length} images: ${sizes.join(', ')} (cap 256K)` : problems.join('; '));
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** dossier_matches: out/dossier.json is byte for byte what buildDossier writes from out/, within 1.5 MiB. */
export function checkDossier(outDir, limits = SCORER_LIMITS) {
  const path = join(outDir, 'dossier.json');
  if (!existsSync(path)) return row('dossier_matches', false, 'no dossier.json');
  const written = readFileSync(path);
  let rebuilt;
  try { rebuilt = Buffer.from(buildDossier(outDir, DOSSIER_CAPS)); } catch (error) { return row('dossier_matches', false, `buildDossier refuses: ${error.message}`); }
  const problems = [];
  if (!written.equals(rebuilt)) problems.push('differs from buildDossier');
  if (written.length > limits.dossierMaxBytes) problems.push(`${written.length} B > ${limits.dossierMaxBytes}`);
  return row('dossier_matches', problems.length === 0, problems.length === 0 ? `identical, ${written.length} B of ${limits.dossierMaxBytes} (${Math.round((100 * written.length) / limits.dossierMaxBytes)}%)` : problems.join('; '));
}

/** dossier_fresh: out/ was written from the working tree as it is now. */
export function checkDossierFresh(outDir, repositoryRoot = REPOSITORY_ROOT) {
  try {
    const fromTree = Buffer.from(buildDossier(repositoryRoot, DOSSIER_CAPS));
    const written = readFileSync(join(outDir, 'dossier.json'));
    const fresh = fromTree.equals(written);
    return { ...row('dossier_fresh', fresh, fresh ? 'out/ matches the working tree' : 'out/ is older than the working tree: run main.ts again before trusting the rows above'), warnOnly: true };
  } catch (error) {
    return { ...row('dossier_fresh', false, error.message), warnOnly: true };
  }
}

/** output_caps: /output as a whole within the platform's 1000 entries and 64 MiB. */
export function checkOutputCaps(outDir, limits = SCORER_LIMITS) {
  const entries = walkTree(outDir);
  const bytes = entries.reduce((n, e) => n + e.bytes, 0);
  const pass = entries.length <= limits.outputMaxEntries && bytes <= limits.outputMaxBytes;
  return row('output_caps', pass, `${entries.length}/${limits.outputMaxEntries} entries, ${mib(bytes)}/${mib(limits.outputMaxBytes)}`);
}

/** js_parses: every source .js/.mjs under game/ (not vendor, not *.min.js) parses as an ES module. */
export function checkScriptsParse(gameDir) {
  const files = walkTree(gameDir)
    .filter((e) => e.kind === 'file' && /\.m?js$/i.test(e.path) && !/\.min\.m?js$/i.test(e.path) && !e.path.split('/').includes('vendor'))
    .map((e) => join(gameDir, e.path));
  const probe = "const vm=require('node:vm');const fs=require('node:fs');const bad=[];for(const p of JSON.parse(fs.readFileSync(0,'utf8'))){try{new vm.SourceTextModule(fs.readFileSync(p,'utf8'),{identifier:p})}catch(e){bad.push(p+': '+e.message)}}process.stdout.write(JSON.stringify(bad))";
  const run = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', '-e', probe], { input: JSON.stringify(files), encoding: 'utf8', maxBuffer: 1 << 24 });
  if (run.status !== 0) return row('js_parses', false, `parser did not run: ${run.stderr.slice(0, 200)}`);
  const bad = JSON.parse(run.stdout);
  return row('js_parses', bad.length === 0, bad.length === 0 ? `${files.length} source modules parse` : `${bad.length} do not parse, first ${bad[0]}`);
}

/** program_repeatable: main.ts run twice into fresh folders writes the same bytes, in time. */
export function checkProgramRepeatable(scratchRoot, repositoryRoot = REPOSITORY_ROOT, limits = SCORER_LIMITS) {
  const digests = [];
  const seconds = [];
  for (let run = 0; run < 2; run++) {
    const dir = mkdtempSync(join(scratchRoot, 'entry-run-'));
    const started = process.hrtime.bigint();
    const result = spawnSync(process.execPath, [join(repositoryRoot, 'main.ts')], { env: { ...process.env, MAKEFUN_OUTPUT_DIR: dir }, encoding: 'utf8' });
    seconds.push(Number(process.hrtime.bigint() - started) / 1e9);
    if (result.status !== 0) { rmSync(dir, { recursive: true, force: true }); return row('program_repeatable', false, `main.ts exited ${result.status}: ${result.stderr.slice(0, 200)}`); }
    const hash = createHash('sha256');
    for (const e of walkTree(dir)) hash.update(`${e.kind} ${e.path}\n`).update(e.kind === 'file' ? readFileSync(join(dir, e.path)) : '');
    digests.push(hash.digest('hex'));
    rmSync(dir, { recursive: true, force: true });
  }
  const pass = digests[0] === digests[1] && Math.max(...seconds) < limits.programSeconds;
  return row('program_repeatable', pass, `${digests[0] === digests[1] ? 'same bytes' : 'DIFFERENT bytes'} twice, ${seconds.map((s) => s.toFixed(2)).join(' s, ')} s (limit ${limits.programSeconds} s)`);
}

/** The file headings of a dossier's text, in its order: index.html, then load order, then the rest. */
export function dossierHeadings(dossierText) {
  return dossierText.split('\n').filter((line) => line.startsWith('### ')).map((line) => {
    const match = /^### (\S+) \((\d+) lines?, (\d+) bytes?\)/.exec(line);
    return { line, path: match ? match[1] : line.slice(4), lines: match ? Number(match[2]) : 0, bytes: match ? Number(match[3]) : 0 };
  });
}

const jsonBytes = (s) => Buffer.byteLength(JSON.stringify(s)) - 2;

/**
 * An estimate of the judge's outline: the kept Game-block lines, then as many file headings as fit
 * the text budget after the first line and the closing "cut" line. When every heading of the
 * dossier does not fit, the judge sees headings only and no declarations.
 */
export function judgeOutline(dossierText, imageCount, budget = JUDGE_OUTLINE_BUDGET_BYTES) {
  const firstLine = `[An outline of the entry's source: each file's heading and its declarations, bodies and comments left out. The image: its ${imageCount} screenshots on one sheet, the cover on top, the rest below in order.]`;
  const lines = dossierText.split('\n');
  const firstHeading = lines.findIndex((line) => line.startsWith('### '));
  const head = [];
  for (const line of lines.slice(0, firstHeading < 0 ? lines.length : firstHeading)) {
    if (line.trim() === '') { if (head.length > 0 && head.at(-1) !== '') head.push(''); }
    else if (/^(#{1,6}\s|(Source files|Totals):\s)/.test(line)) head.push(line.trimEnd());
  }
  const headings = dossierHeadings(dossierText);
  const reserve = jsonBytes(`[Cut at ${budget} bytes: ${headings.length} file headings, 9999 declaration lines and 9999999 bytes of source left out.]`);
  let used = jsonBytes(`${firstLine}\n`) + head.reduce((n, line) => n + jsonBytes(`${line}\n`), 0);
  let shown = 0;
  for (const heading of headings) {
    const cost = jsonBytes(`${heading.line}\n`);
    if (used + cost > budget - reserve) break;
    used += cost;
    shown++;
  }
  return { head, headings, shown, declarationsShown: shown === headings.length };
}

/** The first top-level declarations of a source file (functions, classes, exported or top-level bindings). */
export function firstDeclarations(text, count = 3) {
  const names = [];
  for (const line of text.split('\n')) {
    const match = /^(?:export\s+(?:default\s+)?)?(?:async\s+)?(function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (match) names.push(`${match[1] === 'function*' ? 'function' : match[1]} ${match[2]}`);
    if (names.length === count) break;
  }
  return names;
}

function printTable(rows) {
  const width = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) console.log(`${r.name.padEnd(width)}  ${r.pass ? 'PASS' : r.warnOnly ? 'WARN' : 'FAIL'}  ${r.detail}`);
}

function main(argv) {
  const option = (name, fallback) => { const k = argv.indexOf(name); return k < 0 ? fallback : argv[k + 1]; };
  const outDir = resolve(option('--out', join(REPOSITORY_ROOT, 'out')));
  const twice = option('--twice', null);
  const budget = Number(option('--view-budget', JUDGE_OUTLINE_BUDGET_BYTES));
  const gameDir = join(outDir, 'game');
  const scorerRows = [
    checkGameFiles(gameDir),
    checkReferences(gameDir),
    checkScreenshots(join(outDir, 'screenshots')),
    checkDossier(outDir),
  ];
  const otherRows = [checkScriptsParse(gameDir), checkOutputCaps(outDir), checkDossierFresh(outDir), checkGameFiles(join(REPOSITORY_ROOT, 'game'))];
  otherRows.at(-1).name = 'repo_game_files';
  if (twice) otherRows.push(checkProgramRepeatable(resolve(twice)));
  const rows = [...scorerRows, ...otherRows];
  const dossierPath = join(outDir, 'dossier.json');
  const outline = existsSync(dossierPath) ? (() => {
    const dossier = JSON.parse(readFileSync(dossierPath, 'utf8'));
    const view = judgeOutline(dossier.text, dossier.images.length, budget);
    const files = view.headings.slice(0, Math.max(view.shown, 1)).map((h) => {
      const source = join(outDir, h.path);
      return { ...h, declarations: existsSync(source) ? firstDeclarations(readFileSync(source, 'utf8')) : [] };
    });
    return { budget, headingsInDossier: view.headings.length, headingsShown: view.shown, declarationsShown: view.declarationsShown, head: view.head, files };
  })() : null;
  if (argv.includes('--json')) console.log(JSON.stringify({ rows, outline }, null, 2));
  else {
    console.log(`MARAZUL entry check of ${outDir}\n`);
    printTable(rows);
    if (outline) {
      console.log(`\nJudge outline (est., ${outline.budget} text bytes): ${outline.headingsShown} of the dossier's ${outline.headingsInDossier} file headings fit; declarations ${outline.declarationsShown ? 'shown' : 'NOT shown (headings only)'}.`);
      for (const f of outline.files) console.log(`  ${f.line.slice(4)}  [${f.declarations.join(', ')}]`);
    }
  }
  return rows.every((r) => r.pass || r.warnOnly) ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
