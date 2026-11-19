# People: the shared human pipeline

Every person in MARAZUL is one module `art/blender/characters/<id>.py` built by
`art/build_characters.py` on the shared library `art/blender/characters/human/`. A module only
declares the person; the library models, bakes, rigs and exports. Own only your module (do not
edit `human/`; ask the pipeline owner for changes).

```sh
# fast look at the shapes (no bake, no export, about a minute): sheet in /tmp/marazul/characters/preview/<id>_source.jpg
/opt/marazul-blender/bin/python art/build_characters.py --only <id> --preview
# the real build: writes game/assets/characters/<id>.glb and prints a JSON report (2-4 minutes, CPU only)
/opt/marazul-blender/bin/python art/build_characters.py --only <id> --sheet
```

Set `MARAZUL_CHARACTER_SCRATCH=/tmp/marazul/<you>` to keep your sheets and textures apart.
`--quality 1.5` meshes coarser (faster) for trials, `--out DIR` writes the .glb elsewhere. The
textures are baked by the library's own numpy baker: no Cycles, **no GPU needed**. Downscale
sheets to 640 px before reading them. Check the report: `triangles.lod0`, `bytes`, `heads_tall`.

## A module

```python
from human import garments as g

ID = 'paramedic'
BODY = {'sex': 'female', 'height': 1.66, 'age': 34, 'build': 0.45, 'weight': 0.4, 'skin': '#c68b63',
        'face': {'jaw_width': 0.95, 'nose_width': 0.95, 'lip_upper': 1.05}}
HAIR = {'style': 'ponytail', 'color': '#2e2019'}          # bald buzz crop short slicked afro_fade afro curly_top bob long ponytail bun
BEARD = {'style': 'none'}                                  # none stubble short full goatee moustache (+ 'color', 'length')
BROWS = {'thickness': 0.9, 'arch': 0.6}
EYES = {'color': '#4a3020'}
WARDROBE = [
    g.polo(color='#f0ede6', tucked=True),
    g.trousers('cargo', color='#1b2a41'),
    g.work_boots(color='#1a1a1c', height=0.13),
    g.belt(color='#151515', buckle='#9a9a9a'),
    g.badge('patch', color='#e8e2d4', accent='#a2262a', at='arm_l', size=0.07),
]
BUDGET = {'triangles': 14000, 'atlas': 1024, 'base_size': 1024, 'normal_size': 1024, 'orm_size': 512,
          'quality': {'base': 80, 'normal': 84, 'orm': 78}}
```

**Body** (`human/body.py`, `human/head.py`): `sex`, `height` (m), `age`, `build` 0..1 (muscle),
`weight` 0..1 (fat), `skin` (paint_skin colour), multipliers `shoulder_width`, `hip_width`,
`leg_length`, `arm_length`, `neck`, `hand_size`; women `bust` 0..1; `belly` 0..1; `lip_tint`
(r, g, b multiplier). **Face** (`head.FACE_DEFAULTS`, 1.0 = average): `head_width`,
`head_length`, `face_length`, `jaw_width`, `jaw_angle` (0 soft..1 square), `chin` (cm forward),
`chin_width`, `cheekbones`, `cheeks`, `brow`, `eye_spacing`, `eye_size`, `eye_tilt` (deg),
`eye_depth`, `lid`, `nose_length`, `nose_width`, `nose_bridge`, `nose_tip`, `nose_up` (cm),
`lip_upper`, `lip_lower`, `mouth_width`, `ear_size`, `ear_out` (deg). Stay within about 0.8-1.25:
real faces, no caricature. Age above 30 adds forehead lines; `HAIR['recede']` (cm) a receding line.

**Wardrobe** (`human/garments.py`): `tshirt`, `button_shirt`, `polo`, `jacket('bomber'|'leather'|
'windbreaker')`, `hoodie`, `vest('tactical'|'cloth')`, `trousers('chinos'|'jeans'|'cargo'|'suit'|
'work')`, `shorts`, `skirt`, `dress`, `work_boots`, `sneakers`, `dress_shoes`, `sandals`, `cap`,
`helmet`, `belt`, `gloves`, `badge`. Each takes `color` (its paint colour), `role` (material:
tops `paint_top`, jackets/vests `paint_jacket`, trousers `paint_bottom`, shoes `paint_shoes`,
fixed colours `atlas`), `fabric` (`shaders.FABRICS`), `wear` 0..1, plus its own options (sleeves,
fit, tucked, neck, length, rib colours...). Layers are automatic: each garment is grown over the
body and every lower layer; covered skin and covered inner layers are deleted (no poke-through,
fewer triangles).

**New garment**: add a function to `human/garments.py` returning `Garment(name, [Part(...)])`.
A `Part` has `make(ctx) -> Field` (see `_top`/`_bottom`: an outer surface grown from
`ctx.under(layer)` by an ease, a drape hull, fold warps, and a region of hems/cuffs/neck, joined
by `_shell`, which also lets the baker shade the inside of hems), a role, colour, fabric, layer,
grid (cell size), seams `fn(ctx) -> [(signed distance to the seam line, zone)]` and details.
**New hair style**: an entry in `hair.STYLES` (top/side/back thickness, fade height, texture),
extra volumes in `hair_parts`. **Badges**: `g.badge(shape='shield'|'star'|'circle'|'bar'|'patch',
color, accent, at='chest_l'|'chest_r'|'arm_l'|'arm_r'|'back'|'cap', size)`: original emblem
(star in a ring), metal shapes shiny, patches embroidered; no real force's insignia, no text.

## What the file holds (the run-time's contract; do not change)

Skinned on the 22 bones of `game/src/characters/skeleton/humanSkeleton.js` (rest A-pose, arms
40 degrees down, palms down, bone rolls as the run-time expects), nodes `lod0 lod1 lod2`,
`hands_lod0..2`, `hand_r_grip`, `hand_l_grip`, anchors `anchor_hand_r/l` (on the grip axis),
`anchor_head`, `anchor_back`, `anchor_hip_r`; materials `paint_skin paint_hair paint_jacket
paint_top paint_bottom paint_shoes atlas` sharing one atlas (base colour baked as a multiplier of
the paint colour, so `setPaint` recolours a person and keeps every shade), scene extras `height`,
`lod_distances` [12, 30]; Draco geometry with the skin (`art/blender/lib/skinpack.py`), WebP.

## Budgets

All 15 people together at most 7 MiB. Dez about 900 kB (2048 base colour, 1024 normal map,
18 k triangles at lod0); every other person about 400 kB: `atlas` 1024, `normal_size` 1024
(or 512 for crowd bases), `orm_size` 512, `triangles` 12-15 k (crowd bases 10-12 k: lod0 is
only drawn within 14 m), grip hands 900 each. If a file is too big, lower `quality['base']` or
the normal map size first, then triangles.
