# MARAZUL art pipeline

Every model in the game is built by a Python script that drives Blender: it models the mesh with
Blender's own tools, gives it procedural materials made of Blender's shader nodes, bakes those
materials (with ambient occlusion, worn edges, dirt and a normal map) into a few compact textures
with Cycles, and exports one binary `.glb` that the game loads. Nothing is downloaded, traced or
copied: if it is in the game, a script in this directory made it.

    art/build_assets.py                 the build runner (build, preview, list, swatches, repack)
    art/blender/lib/                    the shared library (modelling, materials, UVs, baking, export)
    art/blender/assets/<domain>/<id>.py one script per asset
    game/assets/<domain>/<id>.glb       the built asset (the only thing a build writes in the repository)
    game/src/assets/                    the game-side loader and the asset registry
    tools/preview/asset-viewer.html     shows an asset in the engine, in the same studio as the Cycles preview
    tools/tests/assets/                 checks every registered asset against its built file

**Only binary outputs are generated.** A build writes `.glb` files (textures embedded as WebP) under
`game/assets/` and nothing else in the repository. Never write generated text formats (`.gltf`,
`.json`, `.obj`, `.mtl`, `.svg`, `.csv`) into the repository: every text line in it must have been
typed by hand. Working files (hashes, baked PNGs, results, previews) live under
`/tmp/marazul/assets/`.

## Commands

Run everything from the repository root with Blender's Python, `/opt/marazul-blender/bin/python`.
**Use the GPU form by default** for builds, bakes and Cycles previews: it sends `art/` to the rented
GPU machine, runs the command there (128 to 256 samples, a bake takes seconds) and brings back
`game/assets/` and `/tmp/marazul/`. If `gpu-run` exits with code 75 no GPU could be had: run the
local form, which bakes on three CPU threads under a machine-wide lock with lower sample counts.

Build an asset and render a Cycles preview of it:

    # GPU (default)
    /opt/marazul-tools/gpu-run -- /opt/marazul-blender/bin/python art/build_assets.py build street_lamp_a --preview
    # this machine (only when gpu-run exits 75)
    /opt/marazul-blender/bin/python art/build_assets.py build street_lamp_a --preview

Build several assets, a whole domain, or everything (unchanged assets are skipped; `--force` rebuilds):

    /opt/marazul-tools/gpu-run -- /opt/marazul-blender/bin/python art/build_assets.py build props vegetation
    /opt/marazul-blender/bin/python art/build_assets.py build all --gpu

The second line is the quick way to rebuild everything: `--gpu` checks on this machine which assets
are stale (the hash of each script, its domain's `_helper.py` files and the library) and sends only
those through `gpu-run`, falling back to this machine if there is no GPU. A plain `gpu-run` job
starts from a fresh mirror, so it always builds what it is asked to. Changing anything under
`art/blender/lib/` (except `lib/preview.py`) or this runner makes every asset stale. `--gpu` splits
the stale assets into `--jobs N` concurrent `gpu-run` jobs (default 2) balanced by each asset's last
build time, each with a timeout that fits its share. Keep it at 2: the GPU machine runs four jobs
at a time for everyone, captures included.

    /opt/marazul-blender/bin/python art/build_assets.py build all --gpu --force

Measured on 18 November (one RTX 3090, shared): `build compact_hatch kit_glass_tower --gpu --preview`
with four-view sheets took 399 s from this machine (vehicle 65 s to build + 10 s preview, its
job 78 s; kit 257 s + 11 s, its job 270 s; the rest is gpu-run's sync, which brought back 62 files
for the kit, mostly working textures). The recorded build times of all 42 assets add up to about 70 minutes, so
`build all` takes about 37 to 40 minutes with two jobs (24 minutes with four, on an idle machine).
The longest single asset (`kit_downtown_commercial`, about 330 s) sets the floor of any split.

Preview without baking, to iterate on the modelling and the materials (seconds):

    /opt/marazul-tools/gpu-run -- /opt/marazul-blender/bin/python art/build_assets.py preview street_lamp_a --source
    /opt/marazul-blender/bin/python art/build_assets.py preview street_lamp_a --source

Preview the built file (the game asset itself, read back from the `.glb`), with close-ups:

    /opt/marazul-tools/gpu-run --sync art,game/assets -- /opt/marazul-blender/bin/python art/build_assets.py preview street_lamp_a --view=three_quarter --view=35,12@7@0,0,0.4
    /opt/marazul-blender/bin/python art/build_assets.py preview street_lamp_a --gpu --turntable 4

A shot is `view`, `view@zoom` or `view@zoom@x,y,z`: `view` is `three_quarter`, `front`, `side`,
`back`, `top`, `low` or `azimuth,elevation` in degrees (azimuth from the asset's front towards its
right); `zoom` moves closer; `x,y,z` is the point to look at in Blender axes. Several `--view`
options make one contact sheet. Write `--view=...` with the equals sign: a shot may begin with a
minus. `--lod N` shows another level of detail. Previews are 960x540 JPEGs under
`/tmp/marazul/assets/preview/`, and the runner prints the asset-viewer address that shows the same
shots in the engine. `build ... --preview --view=...` renders the same shots right after a build.

A preview of a built file shows exactly the shipped geometry. Blender's glTF importer here has no
Draco library (`libbf_intern_draco_bridge.so` is missing from the bpy build), so `lib/preview.py`
(`plain_copy()`) first decodes the `.glb` with DracoPy (`glb.Document.decompress()`) into a plain
copy under `/tmp/marazul/assets/preview/plain/` and imports that: the same points, triangles and
attribute values the game's decoder produces, bit for bit (`tools/tests/assets/preview.test.mjs`
proves it on a person, a vehicle and a kit), with the shipped WebP atlas. Nothing in the
repository changes. Before 18 November 09:40 this import crashed (`preview.py:282`).

See the asset in the engine, and capture it:

    node tools/static-server.mjs --root . --port 8080
    # open http://127.0.0.1:8080/tools/preview/asset-viewer.html?asset=street_lamp_a&grid=1&marks=1

Capture that page with the shared capture tool (`tools/capture.mjs`, described in
`tools/preview/README.md`); the page sets `window.__gameReady` and `window.__previewReady` when the
picture is final.

Other commands:

    /opt/marazul-blender/bin/python art/build_assets.py list                     # ids, kinds, scripts, sizes
    /opt/marazul-tools/gpu-run -- /opt/marazul-blender/bin/python art/build_assets.py swatches stucco brick concrete
    node --test "tools/tests/assets/*.test.mjs"                                  # after every build
    /opt/marazul-blender/bin/python art/build_assets.py repack all               # see "Geometry compression"

A build prints a size report per asset (triangles and draw calls per level, textures, bytes against
the budget, stage times) and a summary table, and fails loudly on an asset that is over budget or
whose script raised. A preview that fails after a good build does not fail the build: the asset is
reported `built` (its file has landed and is recorded current), and a separate `previews` list
under the table names each sheet or says `PREVIEW FAILED: <reason>` (the traceback is printed
above it); retry with `preview <id>`. The exit code then stays 0.

## Conventions

- **Units**: 1 Blender unit = 1 metre = 1 game unit. Model at real size.
- **Axes**: Blender is Z up, the game is Y up. **Author every asset standing on Z = 0, facing +Y,
  with its right side towards +X.** The exporter turns Blender (x, y, z) into game (x, z, -y), so
  the asset faces -Z in the game, its up is +Y and its right is +X. A vehicle's nose points to +Y
  in Blender. `dev/orientation_probe` proves it; look at it in the viewer with `grid=1`.
- **Origin**: on the ground at the asset's centre. A moving part's object origin is its pivot.
- **Transforms**: builders return meshes at identity. Move mesh data with `modify.transform` and
  set a pivot with `scene.set_origin`; the pipeline bakes any object rotation and scale into the
  mesh before export, so nodes carry translation only (linked copies keep their rotation).
- **Colours** are linear RGB everywhere. Use `M.hex_color('#1c6a6e')` or `M.srgb(r, g, b)` for
  picker values.

### Naming contract

Names are the only interface between Blender and the game. `art/blender/lib/naming.py` and
`game/src/assets/contract.js` hold the same rules, and the tests check they agree. Node names are
lower-case letters, digits and underscores (Blender's `.001` duplicates are rejected).

| What | Name | Notes |
| --- | --- | --- |
| Level-of-detail mesh | `lod0`, `lod1`, `lod2` or `<part>_lod0` ... | one level shows at a time |
| Every-level part | `<part>` | wheels, doors, rotors: shown at all levels |
| Wheels | `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr` | origin at the hub; spin about local X |
| Steering pivots | `steer_fl`, `steer_fr` | empties holding the front wheels; turn about local Y (game) |
| Doors | `door_fl`, `door_fr`, `door_rl`, `door_rr`, `hood`, `trunk` | origin on the hinge line |
| Anchor | `anchor_<what>` | an empty: a point, and a direction along its +Y in Blender (-Z in the game) |
| Collision box | `col_box_<name>` | an empty; its scale is the full size in metres |
| Collision cylinder | `col_cyl_<name>` | upright; scale = diameter, diameter, height |
| Collision sphere | `col_sphere_<name>` | scale = diameter |
| Collision mesh | `col_hull_<name>`, `col_mesh_<name>` | a few dozen triangles, never drawn |

Anchors the game looks for: vehicles `anchor_seat_driver`, `anchor_seat_passenger_1..3`,
`anchor_door_driver`, `anchor_light_head_l/r`, `anchor_light_tail_l/r`, `anchor_exhaust_1/2`,
`anchor_camera`; characters `anchor_hand_r`, `anchor_hand_l`, `anchor_head`, `anchor_back`; props
`anchor_light` (a lamp's light, pointing along the beam) and `anchor_use` (where a person stands to
use it, facing it). Extra keyword arguments of `a.add_anchor` become glTF extras the game can read
(`light='spot'`, `color=[...]`, `range=18.0`). Characters share one skeleton; its bone names are
`naming.SKELETON_BONES` and clips are named `idle`, `walk`, `run` and so on by the character and
animation owners.

**Material roles** come from the material's name, by prefix. Mind the prefixes when naming your own
materials: `lamp_post_paint` would become a lamp.

| Name | Role | In the game |
| --- | --- | --- |
| `paint`, `paint_*` | tintable paint | baked neutral; `material.color` is the paint colour, set per instance with `setPaint` |
| `glass`, `glass_*` | glass | not baked; alpha-blended, opacity and reflections set by the game |
| `lamp_<group>` | switchable lamp | emissive; `setLamp(instance, group, on)` swaps a lit and an unlit material |
| `cutout`, `cutout_*` | alpha-tested cards | foliage, mesh fences, hair; double sided |
| `tile_<name>` | repeating texture | baked on a flat square into its own texture set; UVs in metres |
| anything else | merged into `atlas` | one opaque material per asset |

Each distinct game material on a mesh is one draw call. A static prop is one mesh, `atlas` plus at
most a lamp or glass material: two draw calls.

The `.glb` scene carries extras the game reads from `asset.extras`: `asset` (id), `kind`, `lods`,
`lod_distances`, `texel_density`, `bounds` (game axes) and anything set with `a.set_extra`.

## Writing an asset

Read `art/blender/assets/props/street_lamp_a.py` first: it is the simplest complete example and the
one to copy. A script is `art/blender/assets/<domain>/<id>.py` (domains: `props`, `vehicles`,
`characters`, `buildings`, `vegetation`, `dev`; a file starting with `_` is a helper module shared by
the domain's scripts, not an asset). It has three things:

1. A docstring that says what the object is, how it is built and which way it faces.
2. `ASSET`, a literal dictionary: `'id'` (the file name), `'kind'` (`vehicle`, `character`,
   `building`, `prop`, `vegetation` or `dev`; it sets the budget), and optionally `'atlas'` (atlas
   edge in pixels) and `'budget'` (overrides, with a reason in the docstring).
3. `make(a)`, which models the asset and registers it on the builder `a`. Do not name anything
   `build`: that is the mesh-builder module.

Inside `make(a)` the usual order is:

- **Model** parts with `build` (boxes, cylinders, lathes, lofts, sweeps, tubes, ribbons, extruded
  outlines), shape them with `modify` (bevel, boolean, mirror, arrays, subdivision with creases,
  solidify, deform, `map_vertices`), from outlines and paths in `profiles`.
- **Give each part a material** from the library: `scene.set_material(part, M.painted_metal(...))`.
  The material's name decides its role.
- **Join** what does not move into one mesh named `lod0` (`scene.join(parts, 'lod0')`), smooth it
  (`shading.smooth(obj, angle)` keeps edges sharper than the angle sharp) and register it with
  `a.add(obj)`. Moving parts stay separate objects with their own names and origins.
- **Register** anchors (`a.add_anchor`), collision proxies (`a.collider_box`, `a.collider_cylinder`,
  `a.collider_sphere`, `a.collider_mesh`), levels of detail (`a.auto_lods`) and bake options
  (`a.bake`).

The runner then unwraps and packs UVs, bakes, makes the game materials, builds the levels of detail,
exports and measures. Add the asset to the game's registry by hand (see "Game side"), build it, look
at the Cycles preview and at the engine capture, and run the tests.

Four more patterns, each with a worked example:

- **Pieces and assemble** (`vegetation/royal_palm_a.py`). When texture space must be shared (twenty
  fronds, a long trunk, repeated modules), bake flat or straight *pieces* with `a.add_piece(obj)`
  and build the real geometry afterwards in an `assemble(a)` function: `a.piece_rect(name)` is a
  piece's rectangle in the atlas, every grid builder takes it as `uv_rect`, `a.material('atlas')` /
  `a.material('cutout')` are the finished game materials, and `a.add_baked(obj)` registers the
  result. Hand-built levels of detail are made the same way.
- **High-detail sources** (the palm's fronds). `a.add(obj, sources=[...])` or `a.add_piece(obj,
  sources=[...])` bakes the shape, materials, occlusion and coverage of high-detail meshes onto a
  simple one: model every leaflet, bolt or louvre once, ship a card or a box. Give the simple mesh
  the material whose *name* its faces should have in the game (`cutout` for alpha-tested cards).
  Tangents are exported automatically for sourced parts.
- **Tiling surfaces** (`dev/tile_probe.py`). Walls, roofs and ground are too big for an atlas. Name
  the material `tile_<name>` and wrap it in `M.tile(material, size=2.0, pixels=512, facing='wall')`:
  it is baked once on a flat square of that size, made seamless, and mapped over its faces in metres
  (walls by distance along the wall and height, floors by X and Y). Tile and atlas materials mix
  freely in one mesh. For coursed patterns choose sizes so that half the tile is a whole number of
  courses (a 2 m tile: 0.25 m bricks in 0.0625 m rows, 0.5 m pavers).

- **Skeletons and animation** (`dev/skin_probe.py`). `lib/rig.py` builds an armature from a list of
  bones (`rig.armature`), skins a mesh with a weight function (`rig.bind`), makes clips from
  keyframes (`rig.action`) and hangs anchors on bones (`rig.attach`). Register the skeleton with
  `a.add_rig(skeleton)` and the skinned meshes with `a.add(mesh)`: they are baked in the rest pose
  and exported with the skin and one animation per action. In the viewer, `clip=wave&time=0.5`
  shows a pose.

Other things `a` offers: `a.add(obj, mirror='X')` models one half and mirrors it after the bake (both
halves share texels); `a.add_copy(name, source, location, rotation_z, mirror_x)` adds nodes that
reuse a part's mesh (four wheels, one mesh, one bake; a turned or mirrored copy hangs under an
unrotated pivot of that name, so every wheel spins about the same local axis);
`a.add(obj, texel_scale=2.0)` and `a.bake(material_texels={'label': 2.5})` spend more texels on what
the player reads up close. A source preview (`--source`) of a piece-based asset shows its pieces,
not the assembled result.

## The library (`art/blender/lib/`)

| Module | What it does |
| --- | --- |
| `scene` | clean metric scene, Cycles on GPU or CPU, `join`, `duplicate`, `set_origin`, `set_material`, `add_empty`, bounds |
| `naming` | the naming contract: prefixes, roles, level names, checks |
| `profiles` | outlines and paths as point lists: circle, rounded rectangle, superellipse, arc, `smooth_path`, `bezier`, `resample` |
| `build` | mesh builders with UVs: `box`, `cylinder`, `sphere`, `grid`, `card`, `lathe`, `loft`, `sweep`, `tube`, `ribbon`, `extrude_outline`, `from_data` |
| `modify` | applied modifiers: `mirror`, `array`, `radial_array`, `bevel`, `crease`, `subdivide`, `boolean`, `solidify`, `shrinkwrap`, `decimate`, `weld`, `wireframe`, `deform`, `displace_noise`, `map_vertices`, `inset_faces` |
| `shading` | `smooth` with sharp edges, `weighted_normals`, `cleanup`, `triangulate`, `vertex_colors` |
| `materials` | the procedural material library (below) |
| `uv` | `unwrap`, `pack` at one texel density, long-island splitting, tile projection |
| `bake` | Cycles bakes into numpy maps; `BakeSettings` |
| `textures` | numpy image work: colour space, margins, ORM packing, tiling, WebP encoding |
| `gamemat` | groups source materials by role and builds the final game materials |
| `lod` | decimated levels and their checks |
| `rig` | armatures, skinning by weight function, keyframed actions, bone-parented anchors |
| `glb` | binary glTF reading, rewriting, quantisation and statistics (no Blender needed) |
| `export` | `.glb` export, WebP textures, role fields, extras |
| `report` | budgets and the size report |
| `preview` | the studio (sky, sun, ground, camera) for Cycles stills |
| `asset` | `AssetBuilder`, the object `make(a)` talks to |

Every function has a docstring; read the module you are about to use.

Three modelling rules the pipeline depends on:

- **Outlines are counter-clockwise** and lathe profiles run bottom to top; then normals point out.
- **Keep the builders' UVs.** Unwrapping defaults to `'auto'`: it keeps the clean strips and flat
  faces the builders write and only projects faces that have no usable UVs. That packs about twice
  as densely as projecting everything. Use `a.add(obj, unwrap='smart')` for a mesh you reshaped
  beyond recognition.
- **Long thin parts need edge loops.** A face is the smallest thing the packer can cut: a 5 m pole
  made of 5 m faces becomes one 5 m island and starves the rest of the atlas. Put a ring every
  metre or so (the lamp's shaft does) and the packer cuts the strip into pieces by itself; it
  prints a warning when it cannot.

## The material library (`from lib import materials as M`)

Every factory takes its parameters, a `seed` (same seed, same pattern) and a `name` (which sets the
role), and returns a Blender material driven by object coordinates: a pattern scale is in metres,
the same on every mesh, and seamless across UV seams. Wear amounts run from 0 (new) to 1 (wrecked).

| Family | Factories |
| --- | --- |
| Paint | `car_paint` (named `paint`: tintable, clear-coated), `painted_metal` (chips, rust, grime, dust, fade, splash), `enamel_sign` |
| Metal | `chrome`, `brushed_metal`, `cast_metal`, `galvanized`, `rusty_metal`, `corrugated_metal` |
| Synthetic | `plastic`, `rubber`, `glass` (named `glass`), `lamp` (name it `lamp_<group>`), `emissive` |
| Mineral | `concrete`, `painted_concrete`, `stucco` (any pastel), `brick`, `stone`, `terracotta`, `tiles`, `asphalt`, `sand` |
| Organic | `wood`, `bark`, `palm_trunk`, `foliage`, `skin` |
| Textile | `fabric` (plain or twill), `leather` |

`M.CATALOGUE` lists them; `build_assets.py swatches <names>` renders them on test shapes. To write
your own, use `M.Graph` (node helpers: `noise`, `voronoi`, `wave`, `brick`, `ramp`, `mix`, `remap`,
`mask`, `bump`, `edges`, `cavities`, `facing_up`, `wall_coords`, ...) and `M.Coat` with the layers in
`materials/wear.py` (`chipped_edges`, `rust_spots`, `grime`, `dust`, `ground_splash`, `scratches`,
`sun_fade`). `newsprint()` in `props/newspaper_box_a.py` and `crownshaft_material()` in the palm are
short examples. Rules for materials:

- End in the Principled BSDF and put everything the game needs in Base Color, Roughness, Metallic,
  Normal (through a Bump node), Emission and Alpha: those are the channels that are baked.
- **Size detail for the texture.** An atlas has 2 to 5 mm per texel; anything finer than about three
  texels (1 cm) averages to grey in the bake. Wear must be centimetres to decimetres to be seen.
- The `edges` and `cavities` masks exist only in Cycles; that is why wear is baked and why a source
  preview (`--source`) already shows it.
- `ground_splash` and other height effects use object Z: they assume the object's origin is on the
  ground.
- A tintable colour goes through `graph.paint_color(color)` in a material named `paint...`; the
  bake then stores a neutral coat and the exported material carries the colour.

## Baking

`a.bake(...)` sets options; the defaults suit a prop.

| Option | Default | Meaning |
| --- | --- | --- |
| `size` | the kind's atlas size (`ASSET['atlas']`) | atlas edge in pixels |
| `orm_size`, `normal_size`, `emissive_size` | same as `size` | store a map smaller than the base colour (`orm_size=512` is usual) |
| `bevel_radius` | 0 (off) | metres; rounds every hard edge in the normal map (0.003 to 0.006 for street furniture) |
| `occlusion_distance` | 0.6 | metres an occluder may be away |
| `occlusion_ground` | True | a ground plane at Z = 0 shades the foot of the asset; switch off for pieces |
| `occlusion_in_color` | 0.3 | share of the occlusion multiplied into the base colour (creases stay dark in sunlight) |
| `cage_extrusion`, `max_ray_distance` | 0.03, 0 | for parts with `sources`: where rays start, how far they go |
| `color_samples`, `normal_samples`, `occlusion_samples` | 8, 8, 32 on CPU; 64, 64, 256 on GPU | Cycles samples per pass |
| `material_texels` | none | `{source material name: factor}`: texel density for one material's faces |
| `tight_pack` | False | pack islands by outline: denser, much slower |
| `tangents` | automatic | export vertex tangents (on for parts with `sources`) |
| `quantize` | True | normals and tangents as bytes, atlas UVs as shorts |
| `compress` | True | store the geometry with Draco (see "Geometry compression"); `False` only to debug, the tests refuse such a file |

What is baked, into one atlas per asset (plus one set per tile material): **base colour** (through an
emission shader, so metals bake true; with alpha when the asset has a `cutout` material), **ORM**
(occlusion in red, roughness in green, metalness in blue, the glTF layout), a **tangent-space normal
map** (the materials' bump, the optional bevel, and the surface of high-detail sources) and, when a
material glows with a pattern, an **emissive** map. Bakes are not denoised by Cycles: occlusion gets
enough samples and a light masked blur, and every map is extended past its islands so mipmaps stay
clean. Textures are stored as lossy WebP (quality 82 base, 80 ORM, 90 normal) inside the `.glb`;
working PNGs are kept under `/tmp/marazul/assets/work/<id>/` for inspection.

Glass is not baked and does not shade what is behind it. Lamp materials keep their emission colour
and strength (Blender emission strength = the game's `emissiveIntensity`).

## Geometry compression

Every built file stores its geometry with Draco (`KHR_draco_mesh_compression`, a required
extension). The exporter quantises first and then hands each triangle primitive to Google's Draco
encoder through the DracoPy package (`lib/glb.py`, `Document.compress()`, compression level 7):

| Attribute | Stored as | Largest error measured over all 41 assets |
| --- | --- | --- |
| `POSITION` | 14 bits, on one grid per mesh, so the seams between a mesh's primitives stay closed | 0.51 mm |
| `NORMAL` | 10 bits (octahedral) | 0.23 degrees |
| `TEXCOORD_0` | 12 bits per unit of UV, plus one bit per doubling for tiling UVs beyond 0..1 | 0.25 texel of a 2048 atlas |
| `JOINTS_0`, `WEIGHTS_0`, `COLOR_0`, `TANGENT`, `TEXCOORD_1` | exactly, as generic attributes | none: skins are bit-identical |

Each primitive is decoded again at once and checked (attribute ids, counts, joints unchanged)
before the file changes; one that fails keeps its plain data and the build says so, as do
primitives that cannot be compressed (morph targets, lines, points, unindexed or sparse data). Index
lists that Blender shares between meshes are copied per primitive first. Accessors keep exact
counts and the position bounds, so the size report and the tests measure a compressed file without
decoding it.

What it saves: on the 41 assets of 18 November the geometry and scene data went from 16.5 MB to
6.5 MB (about 36 to 14 bytes per vertex, indices included) and `game/assets/` from 20.2 MB to
10.2 MB. Textures are untouched (WebP, 3.7 MB in all), so they are now the larger part of most files:
spend the bytes saved on texel density where it shows. Count about 14 bytes per vertex when you plan
a budget.

The encoder: DracoPy 2.2.0 is installed in `/opt/marazul-blender` on this machine. A GPU machine
that lacks it installs it into its Blender Python on first use (bootstrapping pip with `ensurepip`
when needed, under a lock so concurrent jobs install it once). If it cannot be had the build fails
with a message rather than ship plain geometry; `a.bake(compress=False)` builds without it, for
debugging only, since the asset tests require compressed geometry. Blender's own glTF exporter may
print `ERROR Draco is not available because library could not be found`: that is its built-in
Draco option, which the pipeline does not use; ignore it.

    # apply the current compression to built files in seconds, without Blender or a bake
    /opt/marazul-blender/bin/python art/build_assets.py repack all

`repack` is for a change of the file format only (it leaves textures and everything else as they
are, skips primitives that are compressed already, and leaves a file alone if a build lands while it
works). The build cache still calls repacked assets stale, so the next `build` remakes them from
their scripts.

In the game, `AssetLibrary` decodes with the official three.js r185 `DRACOLoader` and its
WebAssembly decoder (the glTF-only build, 192 KB), vendored unchanged from the npm package
three@0.185.1 under `game/vendor/three/` (`DRACOLoader.js`, `draco/draco_wasm_wrapper.js`,
`draco/draco_decoder.wasm`): nothing is fetched from outside `game/`, and the decoder is loaded once,
when the first compressed file arrives, and runs in up to three workers. Decoded positions, normals
and UVs are `Float32Array`s (not the quantised integer types of an uncompressed file): read vertex
data with `getX()` or `fromBufferAttribute()`, which work for both, rather than from `.array`. The
asset tests decode every compressed primitive with the same vendored decoder in Node
(`tools/tests/assets/glbFile.mjs`, `checkDracoPrimitives()`).

The way back, for tools that cannot read Draco: `glb.Document.decompress()` decodes every
compressed primitive into plain accessors (Float32 positions, normals and first UVs, the other
attributes in their stored types, indices as before) and drops the extension. The Cycles preview
uses it (see "Commands"); so can any scratch script that reads geometry:

    /opt/marazul-blender/bin/python -B -c "import sys; sys.path.insert(0, 'art/blender'); from lib import glb; d = glb.Document.read('game/assets/props/street_lamp_a.glb'); d.decompress(); d.write('/tmp/marazul/<area>/street_lamp_a.plain.glb')"

## Levels of detail

Level 0 is the full mesh. `a.auto_lods(ratios=(0.4, 0.15), distances=(25, 60))` decimates every
`*_lod0` part after the bake (the copies keep its UVs and textures) and records the camera distances
at which the game switches. Decimation is right for solid shapes; for cards and anything whose
silhouette matters build the levels by hand in `assemble(a)` from the same pieces, as the palm does,
and call `a.set_lod_distances(...)`. Each level must have fewer triangles than the one above; aim for
about 40 % and 15 % (vegetation 20 % and 5 %). Parts without a level suffix show at every level.

## Budgets

The game ships in 48 MiB and at most 993 files; all of `game/assets/` has about 30 MiB. An asset over
its budget fails the build and the tests. The same numbers live in `lib/report.py` and
`game/src/assets/contract.js`.

| Kind | Triangles (level 0) | Draw calls | File bytes | Default atlas | Texel density to aim for |
| --- | --- | --- | --- | --- | --- |
| vehicle | 18,000 | 14 | 1,000,000 | 2048 | 256 px/m |
| character | 9,000 | 5 | 600,000 | 1024 | 512 px/m |
| building (module or kit) | 8,000 | 8 | 1,500,000 | 2048 | 128 px/m in the atlas; walls on 512 px tiles |
| prop | 2,500 | 4 | 220,000 | 512 | 256 px/m |
| vegetation | 3,000 | 3 | 400,000 | 1024 | 256 px/m |
| dev (test objects) | 2,000 | 6 | 100,000 | 256 | - |

These are ceilings, not targets: the proof props use 800 to 2,400 triangles and 150 to 180 kB with a
1024 atlas. A build's report prints the texel density reached. Put many small related things in one
file with one atlas (a kit) rather than one file each: textures dominate the bytes.

The table holds the defaults. An asset that is over one by design (a vehicle whose wheels, doors,
panels and lamp groups are separate nodes and materials, a bus, a kit of forty modules in one file)
overrides it in both places, each with its reason: `ASSET['budget']` in the script (`'triangles'`,
`'draws'`, `'bytes'`; reason in the docstring) and `maxTriangles`, `maxDraws`, `maxBytes` in its
registry entry (reason in the entry's comment). The build checks the first, the tests the second.

## Game side

`game/src/assets/` loads what this pipeline builds. Register a new asset by hand in
`game/src/assets/registry/<domain>.js`: its file, kind, number of levels, and every node, anchor,
collision proxy, material and animation name the game may rely on. The tests fail if the file lacks
a promised name, or carries an anchor or material the registry does not list, or is over its budget
(the kind's default, or the entry's `maxTriangles`, `maxDraws` and `maxBytes`, see "Budgets").

    import { AssetLibrary, findNode, setLamp, setPaint } from './assets/index.js';
    const assets = new AssetLibrary({ renderer });
    await assets.load(['street_lamp_a'], { onProgress: ({ fraction }) => bar.set(fraction) });
    const lamp = assets.instantiate('street_lamp_a');   // shares geometry and materials
    setLamp(lamp, 'main', isNight);
    const light = findNode(lamp, 'anchor_light');
    const batch = assets.get('royal_palm_a').createBatch(300, { lod: 1 });   // instanced

The viewer page `tools/preview/asset-viewer.html?asset=<id>` uses this loader in a studio that
repeats `lib/preview.py` number for number (sky, sun, ground, camera, field of view), so an engine
capture can be laid beside a Cycles preview. Useful parameters: `shots=` (the runner prints it),
`grid=1` (1 m grid, axes, 0.5 m ruler), `marks=1` (anchors and collision proxies), `lod=1`,
`lod=auto`, `lamps=0`, `paint=b01818`, `batch=64`, `clip=wave&time=0.5`,
`tone=aces|agx|neutral|none`.

## Quality checklist

An asset is done when all of this is true:

- [ ] It reads as the real object in the Cycles preview and in the engine capture, from the
      three-quarter view and in a close-up, and the two pictures match.
- [ ] Real size in metres (check against the 0.5 m ruler with `grid=1`), on the ground, facing -Z.
- [ ] Silhouette first: curves have enough segments not to look faceted at the distance it is seen
      from; nothing blocky, no toy proportions.
- [ ] Hard edges are bevelled in the mesh or rounded in the normal map (`bevel_radius`).
- [ ] The surface has a history: wear on edges, dirt in creases and near the ground, variation in
      colour and roughness. No flat single-colour surface larger than a hand.
- [ ] Within budget, with the texel density of its kind; long parts have edge loops; no warning
      from the packer.
- [ ] Levels of detail exist (props that are placed often, all vegetation, vehicles, buildings) and
      do not change the silhouette abruptly.
- [ ] Names follow the contract: moving parts, anchors, collision proxies, material roles; the
      registry entry lists them; `node --test "tools/tests/assets/*.test.mjs"` passes.
- [ ] The script has a docstring, builds from a clean scene, uses a fixed seed everywhere (two
      builds give the same asset) and writes nothing but its `.glb`.

## Limits and things to know

- One atlas per asset (plus tile sets). A very large asset should be split into parts by file or
  use tile materials for its big surfaces.
- Geometry is Draco-compressed (see "Geometry compression"): about 14 bytes per vertex, indices
  included. Morph targets are not compressed; Meshopt and KTX2 are not used, and the game has no
  decoder for them.
- No text: Blender's fonts are not ours to use. Suggest lettering with shapes (the newspaper's
  greeked text), or model stencil letters from boxes and bake them from a high-detail source.
- Skinned assets are proven with a three-bone probe (`dev/skin_probe`: skin, two clips, a bone
  anchor, cloned and posed by the loader). A full humanoid will need more of `lib/rig.py` (inverse
  kinematics while keying, mirrored weights, retargeting clips across characters); extend it there.
  Decimated levels of a skinned mesh keep their weights but have not been tried.
- Vertex colours (`shading.vertex_colors`) multiply into the base colour in the game; the palm uses
  them to darken the heart of its crown.
- Thin sheets, open cards and double-sided geometry are fine for the wear masks; meshes with
  inverted normals are not (`shading.recalc_normals`).
- The first GPU job after a pause waits about four minutes for the machine; a material-heavy render
  compiles shaders for a while. Both are normal.
