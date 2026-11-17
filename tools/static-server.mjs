// A small static file server for the MARAZUL tools (Node 22, standard library only). It serves one
// root directory the way the bounty serves game/: plain files, correct MIME types, no caching, and
// nothing outside the root. Import startStaticServer(), or run this file to serve a directory:
//   node tools/static-server.mjs --root game --port 8080
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Starts a static file server on 127.0.0.1.
 * @param {string} rootDir The directory to serve; requests can never leave it.
 * @param {number} [port] The port to listen on; 0 (the default) picks a free one.
 * @returns {Promise<{ port: number, origin: string, root: string, close: () => Promise<void> }>}
 *   The chosen port, the origin to open (http://127.0.0.1:port), the resolved root, and a
 *   function that stops the server.
 */
export async function startStaticServer(rootDir, port = 0) {
  const root = await realpath(resolve(rootDir));
  if (!(await stat(root)).isDirectory()) throw new Error(`not a directory: ${root}`);

  const server = createServer((request, response) => {
    answerRequest(root, request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500, PLAIN_TEXT);
      response.end('server error');
    });
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, '127.0.0.1', resolveListen);
  });
  const chosenPort = server.address().port;

  return {
    port: chosenPort,
    origin: `http://127.0.0.1:${chosenPort}`,
    root,
    close: () =>
      new Promise((resolveClose) => {
        server.close(() => resolveClose());
        server.closeAllConnections();
      }),
  };
}

/** The Content-Type of each file extension a browser game or a preview page loads. */
export const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
});

const PLAIN_TEXT = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' };

/**
 * Answers one request: GET or HEAD of a regular file inside the root, a directory answered with
 * its index.html, and a refusal for everything else.
 */
async function answerRequest(root, request, response) {
  const refuse = (status, text) => {
    response.writeHead(status, PLAIN_TEXT);
    response.end(text);
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') return refuse(405, 'method not allowed');

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    return refuse(400, 'bad request');
  }
  if (pathname.includes('\0')) return refuse(400, 'bad request');
  if (pathname.endsWith('/')) pathname += 'index.html';

  // First the lexical check (no "..", no absolute escape), then the same check on the real path,
  // so a symbolic link inside the root cannot lead out of it either.
  const requested = resolve(join(root, normalize(pathname)));
  if (!isInside(root, requested)) return refuse(403, 'forbidden');

  let file;
  let size;
  try {
    file = await realpath(requested);
    const stats = await stat(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    return refuse(404, 'not found');
  }
  if (!isInside(root, file)) return refuse(403, 'forbidden');

  response.writeHead(200, {
    'content-type': MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file)
    .on('error', () => response.destroy())
    .pipe(response);
}

/** True when `path` is the directory `root` itself or lies under it. */
function isInside(root, path) {
  return path === root || path.startsWith(root + sep);
}

// Run directly: serve a directory until the process is stopped.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const valueOf = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const handle = await startStaticServer(valueOf('--root', 'game'), Number(valueOf('--port', '8080')));
  console.log(`${handle.root} is on ${handle.origin}/`);
}
