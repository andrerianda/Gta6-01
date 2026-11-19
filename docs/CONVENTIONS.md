# MARAZUL conventions

MARAZUL is an original 3D open-world crime game for desktop browsers, built for the make.fun bounty
"gta6-01": three.js, static files under `game/`, no build step. This is the contract every agent
reads first. Your brief and `/tmp/marazul/briefs/UPDATE.md` say what you own; this file says how we
all work. Where a brief and this file disagree, tell the orchestrator in your report.

## The rules of the build

1. **Stay in the repository.** The working directory is `/home/user/Makefun-project`; run every
   command from it and never `cd` out (absolute paths to files elsewhere are fine). Never read
   `/home/user/Makefun-project-old`, `/root/.config`, `/root/.makefun` or another project's code.
2. **Every text file is typed.** Each source or text file in the repository is written with the
   Write and Edit tools. Never create or change a repository text file through the shell (no
   redirection, heredoc, sed, tee, code generator or formatter) and never download or copy code
   into the repository. The only generated files in the repository are binary: the `.glb` models
   the Blender pipeline writes under `game/assets/`, the screenshots, and the vendored three.js
   minified builds. Bash is for running tools and tests.
3. **Everything is ours.** Names, city, characters, vehicles, brands, story, models, textures,
   sounds and music are original. Nothing from any commercial game, and nothing downloaded.
4. **Models are made in Blender by our own scripts and baked.** Vehicles, people, building parts,
   props and plants are modelled by the Python scripts under `art/`, baked (ambient occlusion,
   normal maps, procedural materials baked to textures) and shipped as binary `.glb` files under
   `game/assets/`. The game loads them only through the asset library, `game/src/assets/`
   (`index.js` is its public API; the registry is `game/src/assets/registry/`). The look is truly
   3D and realistic: nothing blocky, nothing toy-like. `art/README.md` is the asset contract
   (naming, axes, material roles, budgets, commands); read it before you make or use an asset.
5. **The rest is generated at run time** by the game's own code: terrain, roads and ground
   surfaces, facade and sign textures that are not baked, the interface, and all audio (WebAudio
   synthesis). System fonts only.
6. **The game is static files under `game/`.** `game/index.html` opens in desktop Chrome from a
   static file server whose root is `game/`, and plays without one network request. ES modules
   only. An import is a relative path or the import-mapped bare specifier `"three"`; a file is
   fetched by a relative path inside `game/`. No `http:` or `https:` address, no path that climbs
   out of `game/`, nothing loaded from `tools/`, `art/` or `docs/`. The bounty's gate also limits
   `game/` to 993 files and directories and 48 MiB in all (`game/assets/` has about 30 MiB), and
   `game/index.html` to 1 MiB.
7. **Do not touch what is not yours.** Edit only the files your brief gives you. Never modify
   `vendor/makefun-game.ts`, `LICENSE` or `serve.ts`; `main.ts`, `shots.json` and `screenshots/`
   belong to the release step. If someone else's file needs a change, say so in your report.
8. **No git writes.** No add, commit, checkout, stash, reset or clean: the orchestrator commits.
   Do not run the make.fun CLI. Do not start subagents or workflows.
9. **Scratch stays out of the repository.** Screenshots, logs and temporary files go under
   `/tmp/marazul/<your area>/`.
10. **Share the machine.** Four cores serve about a dozen agents. Keep scripts and test runs
    short, and never leave a server, watcher or loop running when you finish.

## Where things live

    game/index.html                 the page: the import map, the canvas, one module script
    game/src/main.js                the entry module
    game/src/<area>/...             the game's own source, one directory per area
    game/src/assets/                the asset library (loader, instancing, registry)
    game/src/render/                sky, lighting, post-processing, water, weather
    game/assets/<domain>/<id>.glb   built models (binary, written by art/build_assets.py)
    game/vendor/three/              three.js (vendored, never edited)
    art/                            the Blender pipeline and one script per asset
    tools/                          shared tools (Node 22 and the preinstalled Playwright; not part of the game)
    tools/capture.mjs               screenshot of the game or of a preview page
    tools/smoke-game.mjs            the smoke test of the real game
    tools/browser-page.mjs          the browser session both are built on (lock, server, flags, error collection)
    tools/static-server.mjs         the static file server
    tools/tests/<area>/*.test.mjs   tests
    tools/preview/*.html            preview pages for looking at one module in the browser
    docs/CONVENTIONS.md             this file

## three.js

The game uses three.js **r185** (npm `three@0.185.1`), vendored under `game/vendor/three/`:
`three.module.min.js` (which imports its sibling `three.core.min.js`), `three-gltf-addons.min.js`
(GLTFLoader, SkeletonUtils and BufferGeometryUtils in one file) and the package's `LICENSE`.
Nothing else of three.js is in the repository: the game writes its own effects.

`game/index.html` carries the only import map, `{ "imports": { "three": "./vendor/three/three.module.min.js" } }`.
Game modules write `import * as THREE from 'three';` (or named imports). The addons are imported by
relative path, for example `import { GLTFLoader } from '../../vendor/three/three-gltf-addons.min.js';`
and normally only the asset library needs them. Every page that loads a game module needs the same
import map (see the preview pages).

## Units, axes and time

- 1 unit = 1 metre. Model and place everything at real size.
- +Y is up and the ground is near y = 0. On the map **-Z is north and +X is east**.
- An asset faces -Z, with its right side towards +X (`art/README.md` has the Blender side).
- Angles are radians. An object with no rotation faces -Z (north); a positive rotation about +Y
  turns it to its left (counter-clockwise seen from above), as in three.js.
- Time is seconds; the time of day is clock hours, 0 to 24. Speeds are metres per second (show
  km/h only in the interface).

## Colour and the look

- Colour management stays on: sRGB output, tone mapping done once, by the image pipeline.
- Colour textures (base colour, emissive) are sRGB; data textures (normal, roughness, metalness,
  occlusion, masks, heights) are linear. A canvas you paint for colour gets `SRGBColorSpace`.
- Materials are physically based (`MeshStandardMaterial`, `MeshPhysicalMaterial`) and lit by the
  scene. No unlit flat-colour look, no baked sun, no tone mapping of your own.
- Sky, sun, shadows, weather, water and post-processing belong to the atmosphere facade,
  `createAtmosphere(renderer, scene, camera, options)` in `game/src/render/lighting/atmosphere.js`.
  Its header comment is the reference: read it before you add a light, a wet surface, water or
  anything that draws to the screen, and call `atmosphere.render()` instead of `renderer.render()`.

## Names and code style

- **One file, one clear job, named for it.** The bounty's judge reads an outline of the source:
  each file's path and its first declarations. So the path says what the file does
  (`game/src/traffic/laneFollowing.js`, not `utils2.js`), and the first declaration in the file is
  its main export, with a descriptive name (`export function createLaneFollower(...)`).
- Modern ES modules, no frameworks, no build step. JSDoc on every export. A short comment at the
  top of a file says what it is for.
- A few hundred lines per file rather than giants; split by job, not by size alone.
- No allocation per frame in hot paths: reuse vectors, matrices and arrays kept at module or object
  level.
- Logic that can run without a browser (rules, plans, maths, data) lives in modules that do not
  import `three`, so that Node can test it.
- Deterministic by default: a seeded generator, not `Math.random()`, wherever the world is built.
- The game logs nothing to the console in normal play, and `console.error` only for a real fault:
  the tools below fail a run on any console error.

## Tests

Tests live under `tools/tests/<area>/` as `*.test.mjs` (Node's built-in runner, `node:test` and
`node:assert/strict`) and import game modules by relative path. Run them with the glob in quotes; a
bare directory does not work on Node 22:

    node --test "tools/tests/render/*.test.mjs"
    node --test "tools/tests/assets/*.test.mjs"
    node --test "tools/tests/tools/*.test.mjs"

Keep a test run to seconds, and run the tests of your area before you report.

## Looking at the game: the browser tools

Headless Chromium has no GPU here and renders WebGL in software (ANGLE on SwiftShader; the flags
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` are built into the tools). A
simple scene draws a frame in a fraction of a second, but with the full image pipeline a frame
takes 2 to 6 seconds at 960x540: use few frames, small pictures and generous timeouts. The page's
script also runs ahead of the renderer, so a page that keeps animating owes the renderer several
frames when it says it is ready, and the screenshot waits for them: a capture can take a minute.
**Only one headless browser may run at a time on this machine.** The tools below wait for an
exclusive lock on `/tmp/marazul/browser.lock` and release it when they finish, so just run them
(do not wrap them in `flock`; it is harmless but not needed), and never start Chromium any other
way.

`tools/capture.mjs` serves a directory on a free port, opens a page, waits until
`window.__gameReady === true` or `window.__previewReady === true`, and saves a screenshot. It prints
one JSON line (`ok`, `ready`, `errors`, `warnings`, `timings`, the `--eval` result, the output path
and size) and exits 1 on any console error, page error, failed request, request to another host, or
if the page never became ready.

    # the game, as the bounty serves it (root game/, page index.html), as a review picture
    node tools/capture.mjs --size 960x540 --out /tmp/marazul/<area>/game.jpg

    # the game with a query string, and a value read from the page before the capture
    node tools/capture.mjs --page "index.html?quality=low" --size 960x540 \
      --eval "document.title" --out /tmp/marazul/<area>/game-low.jpg

    # a preview page: serve the repository root with --root .
    node tools/capture.mjs --root . --size 960x540 \
      --page "tools/preview/atmosphere.html?time=18.85&weather=clear&view=avenue" \
      --out /tmp/marazul/<area>/golden-hour.jpg
    node tools/capture.mjs --root . --size 960x540 \
      --page "tools/preview/asset-viewer.html?asset=street_lamp_a&grid=1" \
      --out /tmp/marazul/<area>/street-lamp.jpg

    # a final screenshot: 1280x720 pixels, interface drawn 1.5 times larger, kept under 256 KiB
    node tools/capture.mjs --width 853 --height 480 --scale 1.5 --jpeg-quality 92 \
      --max-bytes 262144 --timeout-ms 600000 --out /tmp/marazul/<area>/cover.jpg

    # every option
    node tools/capture.mjs --help

`tools/smoke-game.mjs` runs the real game the same way (root `game/`, page `index.html`) and fails
on any error, on a page that never becomes ready, on a blank picture, and on a `game/` directory
that breaks the gate's limits. It prints how long the page took to become ready and how full
`game/` is. Run it after any change that the game loads.

    node tools/smoke-game.mjs
    node tools/smoke-game.mjs --query "?quality=low" --out /tmp/marazul/<area>/smoke.jpg

Both tools exit 0 when all is well and 1 when it is not; read the `errors` in the JSON line. A
page error or a script that fails to load ends the wait at once, so a broken page costs seconds,
not the whole timeout. If a page is only slow, raise `--timeout-ms`; do not retry in a loop.

For anything longer than one picture (driving the game with the keyboard, several captures of one
page load) write a scratch script under `/tmp/marazul/<your area>/` that imports
`openBrowserPage` from `tools/browser-page.mjs`: it takes the lock, serves the directory, launches
Chromium with the right flags, blocks other hosts, collects errors and hands you the Playwright
page. Its header comment has an example.

Review pictures are JPEG, 960x540, quality 70 (the tool's default quality). Final screenshots for
`screenshots/` must be PNG or JPEG of at most 256 KiB, long side at most 1280, short side at least
480, and real, unedited renders of the game.

A browser page is ready when its picture is complete, not when its first frame exists: set
`window.__gameReady = true` (the game) or both `window.__previewReady` and `window.__gameReady`
(a preview page) only after the assets are loaded and a frame with them has been drawn.

To open the game or a preview page in a browser by hand, serve the game or the repository root and
stop the server when you are done:

    node tools/static-server.mjs --root game --port 8080
    node tools/static-server.mjs --root . --port 8080

## Preview pages

A preview page shows one module (an asset, a material, an effect) on its own, in the browser, so
its owner can look at it without the whole game. Preview pages live in `tools/preview/*.html` and
are served from the repository root; `tools/preview/README.md` has the rules and
`tools/preview/hello.html` is the smallest working example.

## Look at your own work

Anything that reaches the screen is checked by looking at it. Capture it, open the saved image with
the Read tool, compare it with what it should be (real proportions, light from the right side, no
black or flat frame, no blocky stand-in, readable at 960x540) and iterate until it looks right. A
passing test is not a picture. Keep to the image-read cap in your brief: choose the captures that
answer a question, and use contact sheets where a page offers them.
