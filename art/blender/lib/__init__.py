"""MARAZUL asset library: everything an asset script needs to model, texture, bake and export.

Asset scripts live in art/blender/assets/<domain>/<id>.py and are run by art/build_assets.py,
which puts art/blender on the import path, so a script starts with, for example:

    from lib import build, modify, shading, uv
    from lib import materials as M

Modules, one job each:

    scene       clean metric scene, Cycles settings, object plumbing (join, parent, empties)
    naming      the names shared by Blender and the game (parts, anchors, levels, proxies, roles)
    profiles    2D outlines and 3D paths as plain point lists (circle, rounded box, arcs, splines)
    build       mesh builders (box, cylinder, lathe, loft, sweep, extrusion, cards) with UVs
    modify      modifiers applied on the spot (mirror, array, bevel, subdivision, boolean, ...)
    shading     smooth shading with sharp edges, weighted normals, cleanup, triangulation
    materials   the procedural material library (a package: paint, metal, masonry, organic, ...)
    uv          unwrapping and atlas packing at a texel density
    bake        Cycles bakes into numpy maps (colour, roughness, metalness, normal, AO, emission)
    textures    numpy image work (colour space, dilation, packing ORM, tiling, encoding)
    gamemat     turns baked maps into the final game materials, one per material role
    lod         levels of detail (decimation, naming, checks)
    rig         skeletons, skinning, keyframed actions and anchors on bones
    glb         binary glTF reading and rewriting (texture re-encoding, quantisation, statistics)
    export      .glb export with extras, then compression of the textures inside it
    report      budgets by asset class and the size report
    preview     studio lighting and camera for Cycles preview stills
    asset       AssetBuilder, the object an asset script's make(a) function talks to

Blender is Z up and the game is Y up: author every asset standing on Z = 0, facing +Y, with its
right side towards +X. The exporter turns that into the game convention (+Y up, forward -Z).
"""

PIPELINE_VERSION = 1
