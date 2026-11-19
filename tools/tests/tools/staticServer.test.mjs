// The static file server serves a root directory with the right MIME types and never anything
// outside it. Run with: node --test "tools/tests/tools/*.test.mjs"
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { MIME_TYPES, startStaticServer } from '../../static-server.mjs';

let base;
let server;

/** One raw request: unlike fetch(), it sends the path exactly as written (".." included). */
function ask(path, method = 'GET') {
  return new Promise((resolveAnswer, rejectAnswer) => {
    const call = request({ host: '127.0.0.1', port: server.port, path, method }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolveAnswer({
        status: response.statusCode,
        type: response.headers['content-type'],
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    call.on('error', rejectAnswer);
    call.end();
  });
}

before(async () => {
  base = await mkdtemp(join(tmpdir(), 'marazul-static-server-'));
  await mkdir(join(base, 'root', 'sub'), { recursive: true });
  await writeFile(join(base, 'secret.txt'), 'outside the root');
  await writeFile(join(base, 'root', 'index.html'), '<!doctype html><title>home</title>');
  await writeFile(join(base, 'root', 'sub', 'index.html'), '<!doctype html><title>sub</title>');
  for (const extension of ['.js', '.mjs', '.css', '.json', '.png', '.jpg', '.svg', '.wasm', '.wav', '.glb', '.bin']) {
    await writeFile(join(base, 'root', `file${extension}`), 'x');
  }
  await symlink(join(base, 'secret.txt'), join(base, 'root', 'link.txt'));
  server = await startStaticServer(join(base, 'root'));
});

after(async () => {
  await server.close();
  await rm(base, { recursive: true, force: true });
});

test('it listens on a free local port and serves index.html for a directory', async () => {
  assert.ok(server.port > 0);
  assert.equal(server.origin, `http://127.0.0.1:${server.port}`);
  const home = await ask('/');
  assert.equal(home.status, 200);
  assert.match(home.body, /<title>home<\/title>/);
  assert.match((await ask('/sub/')).body, /<title>sub<\/title>/);
  assert.equal((await ask('/index.html?time=18.85&view=avenue')).status, 200);
});

test('every file type the game loads gets its MIME type', async () => {
  const expected = {
    '/index.html': 'text/html; charset=utf-8',
    '/file.js': 'text/javascript; charset=utf-8',
    '/file.mjs': 'text/javascript; charset=utf-8',
    '/file.css': 'text/css; charset=utf-8',
    '/file.json': 'application/json; charset=utf-8',
    '/file.png': 'image/png',
    '/file.jpg': 'image/jpeg',
    '/file.svg': 'image/svg+xml',
    '/file.wasm': 'application/wasm',
    '/file.wav': 'audio/wav',
    '/file.glb': 'model/gltf-binary',
    '/file.bin': 'application/octet-stream',
  };
  for (const [path, type] of Object.entries(expected)) {
    const answer = await ask(path);
    assert.equal(answer.status, 200, path);
    assert.equal(answer.type, type, path);
  }
  assert.equal(MIME_TYPES['.html'], 'text/html; charset=utf-8');
});

test('nothing outside the root is served', async () => {
  for (const path of ['/../secret.txt', '/sub/../../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '//../secret.txt']) {
    const answer = await ask(path);
    assert.ok(answer.status === 403 || answer.status === 404, `${path} answered ${answer.status}`);
    assert.doesNotMatch(answer.body, /outside the root/, path);
  }
  const linked = await ask('/link.txt');
  assert.equal(linked.status, 403, 'a symbolic link that leaves the root is refused');
  assert.doesNotMatch(linked.body, /outside the root/);
});

test('missing files, bad paths and other methods are refused', async () => {
  assert.equal((await ask('/nothing-here.js')).status, 404);
  assert.equal((await ask('/sub')).status, 404, 'a directory without the trailing slash is not a file');
  assert.equal((await ask('/%zz')).status, 400);
  assert.equal((await ask('/index.html', 'POST')).status, 405);
  assert.equal((await ask('/index.html', 'HEAD')).body, '');
});
