# Preview pages

A preview page shows one part of MARAZUL on its own in the browser (an asset, a material, an
effect, a piece of the city), so that its owner can capture it, look at it and iterate without the
whole game. Preview pages are tools: the game never loads them and nothing here is handed in.

## The rules

- One page per subject, `tools/preview/<subject>.html`, owned by whoever owns the subject. Do not
  edit someone else's page; add your own.
- **Served from the repository root** (`--root .`), not from `game/`, so that a page can reach both
  itself and the game's modules.
- **The same import map as the game**, pointed at the vendored three.js by a relative path:

      <script type="importmap">
      { "imports": { "three": "../../game/vendor/three/three.module.min.js" } }
      </script>

- **Game modules are imported by relative path**, exactly as the game imports them:
  `import { createAtmosphere } from '../../game/src/render/lighting/atmosphere.js';`
  A page may read files under `game/` (models, for example) and nothing else: no other host, no
  file from outside the repository.
- **Say when the picture is complete.** Set both `window.__previewReady = true` and
  `window.__gameReady = true` once every asset is loaded and a frame that shows them has been
  drawn, never earlier. The capture tool waits for either flag.
- **Parameters come from the query string**, and the comment at the top of the page lists them
  with one example address. A capture is then one command line anyone can repeat.
- Put what a script may want to read on `window` (`window.__previewStats`, for example: frame
  time, triangle counts); `--eval` prints it.
- No console errors: the capture tool fails a run on any console error, page error, failed request
  or request to another host.
- Rendering is in software here. Draw as few frames as the picture needs, stop or slow the
  animation loop once it is ready if you can, and prefer one contact sheet to many captures.

## Capturing a page

    node tools/capture.mjs --root . --size 960x540 \
      --page "tools/preview/hello.html?shape=knot" \
      --out /tmp/marazul/<your area>/hello.jpg

    node tools/capture.mjs --root . --size 960x540 \
      --page "tools/preview/atmosphere.html?time=18.85&weather=clear&view=avenue" \
      --eval "window.__previewStats.millisecondsPerFrame" \
      --out /tmp/marazul/<your area>/golden-hour.jpg

    node tools/capture.mjs --root . --size 960x540 \
      --page "tools/preview/asset-viewer.html?asset=street_lamp_a&grid=1&marks=1" \
      --out /tmp/marazul/<your area>/street-lamp.jpg

Quote the `--page` value: `&` and `?` mean something to the shell. The tool prints one JSON line
and exits 1 if anything went wrong; `node tools/capture.mjs --help` lists every option. Then open
the saved picture with the Read tool and look at it. Review pictures are JPEG, 960x540, quality 70
(the default), and go under `/tmp/marazul/<your area>/`, never into the repository.

To look at a page in a browser by hand:

    node tools/static-server.mjs --root . --port 8080
    # http://127.0.0.1:8080/tools/preview/hello.html

Stop the server when you are done.

## The pages

| Page | Shows | Owner |
| --- | --- | --- |
| `hello.html` | the smallest working page: three.js through the import map, one lit shape | bootstrap |
| `atmosphere.html` | sky, light, weather, water and the image pipeline on a stand-in city | atmosphere |
| `asset-viewer.html` | one built asset, loaded by the game's asset library, in a studio | assets |

Start a new page from `hello.html`. Add a row here when you add a page.
