// The system manifest and the entry modules it lists, checked as text (the manifest itself
// cannot be imported in Node: the temporary demonstration imports three.js). Guards the contract
// of docs/ARCHITECTURE.md: every entry module exists, exports the factory the manifest imports,
// declares the name the manifest promises, stays small, statically imports only from the engine
// core, and the declared dependencies resolve without a cycle.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolveSystemInitOrder } from '../../../game/src/core/systems/systemInitOrder.js';

const manifestUrl = new URL('../../../game/src/core/systems/gameSystemManifest.js', import.meta.url);
const manifestText = readFileSync(manifestUrl, 'utf8');
const TEMPORARY_ENTRY = '../dev/engineDemonstration.js';
/** An entry module is the readable top of its system: larger than this and it hides the others. */
const ENTRY_MODULE_MAX_BYTES = 6144;

const entries = [...manifestText.matchAll(/^import \{ (\w+) \} from '([^']+)';$/gm)].map((match) => {
  const url = new URL(match[2], manifestUrl);
  const text = readFileSync(url, 'utf8');
  return {
    factory: match[1],
    specifier: match[2],
    text,
    bytes: Buffer.byteLength(text),
    name: /\bname: '(\w+)'/.exec(text)?.[1] ?? null,
    dependsOn: [...(/dependsOn: \[([^\]]*)\]/.exec(text)?.[1] ?? '').matchAll(/'(\w+)'/g)].map((found) => found[1]),
    imports: [...text.matchAll(/^import [^;]*? from '([^']+)';$/gm)].map((found) => found[1]),
  };
});
const promisedNames = [
  .../GAME_SYSTEM_NAMES = Object\.freeze\(\[([\s\S]*?)\]\)/.exec(manifestText)[1].matchAll(/'(\w+)'/g),
].map((match) => match[1]);

test('manifest: 27 entries, each factory listed once and in the order of the promised names', () => {
  assert.equal(entries.length, 27);
  assert.equal(new Set(entries.map((entry) => entry.factory)).size, entries.length);
  const listed = [...manifestText.matchAll(/^ {2}(create\w+System),/gm)].map((match) => match[1]);
  assert.deepEqual(listed, entries.map((entry) => entry.factory));
  assert.deepEqual(entries.map((entry) => entry.name), promisedNames);
});

test('entry modules: the factory is the first export and its name is the promised one', () => {
  for (const entry of entries) {
    const firstExport = /^export (?:async )?(?:function|const|class) (\w+)/m.exec(entry.text)?.[1];
    assert.equal(firstExport, entry.factory, `${entry.specifier}: first export`);
    assert.match(entry.text, /^\/\/ /, `${entry.specifier}: starts with a comment that says what it is`);
  }
});

test('entry modules: small, and static imports only from the engine core', () => {
  for (const entry of entries) {
    if (entry.specifier === TEMPORARY_ENTRY) continue;
    assert.ok(entry.bytes <= ENTRY_MODULE_MAX_BYTES, `${entry.specifier} is ${entry.bytes} bytes; load implementation with import() in init()`);
    for (const specifier of entry.imports) {
      assert.match(specifier, /^\.\.\/core\//, `${entry.specifier} statically imports ${specifier}`);
    }
  }
});

test('declared dependencies: every one exists and there is no cycle', () => {
  const { order, problems } = resolveSystemInitOrder(entries.map((entry) => ({ name: entry.name, dependsOn: entry.dependsOn })));
  assert.deepEqual(problems, []);
  assert.equal(order.length, entries.length);
  const position = new Map(order.map((system, index) => [system.name, index]));
  for (const entry of entries) {
    for (const dependency of entry.dependsOn) {
      assert.ok(position.get(dependency) < position.get(entry.name), `${dependency} initialises before ${entry.name}`);
    }
  }
});
