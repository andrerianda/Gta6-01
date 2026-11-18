// Buildings: facade modules and kits. Written by hand (see index.js).
//
// A KIT: ONE FILE, MANY FACADE MODULES
// A kit (kit_<style>) is one .glb with one atlas. A module is one bay of one storey of a facade,
// named <slot>_<width in metres>_<variant letter> (corner posts: corner_<storey>_<variant>).
// Every module is two mesh nodes, <module>_lod0 (the detailed bay) and <module>_lod1 (a card of
// at most 12 triangles on the wall plane, its texture baked from the detailed bay: use it beyond
// asset.extras.lod_distances[0] metres and for the skyline). Module nodes have no translation:
// their geometry is in module coordinates, so instantiate or batch a node and place it.
//
// Module coordinates in the game (+Y up): the outer wall surface is the plane z = 0, the street
// is towards -Z, the bay spans x from -width/2 to +width/2 and y from 0 to height. Parts project
// up to 1.6 m towards the street (`projects` in the table) and recess up to 0.7 m; the back is
// open. Stack storeys by height (ground 4.2 m, upper 3.2 m, top 1.2 m) and bays by width along
// x; a bay may be stretched up to 12 percent in width. Eyebrows, speed lines, ledges and copings
// run the full width of their bay, so neighbouring bays join into continuous bands.
// A corner module (slot corner_*) is a post 0.5 by 0.5 m in plan with street faces on z = 0
// (facing -Z) and x = +0.25 (facing +X); it occupies x from -0.25 to 0.25 and z from 0 to 0.5.
// Put it where a facade facing -Z, running towards -X, meets a facade facing +X: its bands wrap
// the corner and meet the bays on both sides.
// The 2 m modules of kit_deco_resort (ground_wall_2_a, upper_window_2_a, top_parapet_2_a) are a
// vertical centre feature: stack them in one column from the ground to the roof, so their fins
// run unbroken; top_parapet_2_a rises to `crown` metres (2.2) above its own base, a stepped
// crown over the roof line. Put one such column at the middle of a facade, or one either side
// of the entrance.
//
// Materials (roles by name): paint_wall is the main stucco and paint_trim the accent (eyebrows,
// bands, sills, canopies, fins, door surrounds); both are baked neutral, so set material.color
// (per building, with setPaint or a per-batch material clone) to the building's wall and trim
// tints. lamp_window_a, lamp_window_b and lamp_window_c are the window panes: reflective glass
// by day, and at night light a random share of the panes by group with setLamp; the group of
// each module is in the table (`lamp`). atlas is everything else (steel frames, base tiles).
// tile_wall (2 m, 512 px, walls: u along the wall, v up, in metres) is the same stucco as
// paint_wall baked white-neutral: multiply the building's wall tint into its color for the
// side and back walls. tile_roof_flat (2 m, 512 px, floors) is the flat roof. Both ride on the
// node tile_swatch, which exists only to carry those two materials.
//
// Anchors: anchor_sign_<module> is the centre of a blank sign area, pointing to the street,
// with width and height (metres) in its userData; anchor_light_<module>_<which> is a wall lamp
// (userData light, color, range). They are in module coordinates like the module itself.
//
// asset.extras.modules repeats the table (slot, width, height, triangles of lod0, lamp, anchors).

/**
 * Every module of every kit: slot, width and height in metres, how far it projects towards the
 * street (metres), the lamp group of its panes, its anchors, for a crown the height it rises
 * to, and for a free-standing roof_prop its plan (x by z, metres). The assembler's table.
 * @type {Record<string, Record<string, {slot: string, width: number, height: number,
 *   projects: number, lamp?: string, anchors?: string[], crown?: number, plan?: number[]}>>}
 */
export const BUILDING_KIT_MODULES = {
  kit_deco_resort: {
    ground_shop_4_a: { slot: 'ground_shop', width: 4, height: 4.2, projects: 1.15,
      lamp: 'lamp_window_c', anchors: ['anchor_sign_ground_shop_4_a'] },
    ground_entrance_4_a: { slot: 'ground_entrance', width: 4, height: 4.2, projects: 1.35,
      lamp: 'lamp_window_c', anchors: ['anchor_sign_ground_entrance_4_a',
        'anchor_light_ground_entrance_4_a_l', 'anchor_light_ground_entrance_4_a_r'] },
    ground_shop_wide_8_a: { slot: 'ground_shop_wide', width: 8, height: 4.2, projects: 1.15,
      lamp: 'lamp_window_c', anchors: ['anchor_sign_ground_shop_wide_8_a'] },
    ground_garage_4_a: { slot: 'ground_garage', width: 4, height: 4.2, projects: 0.14 },
    ground_wall_4_a: { slot: 'ground_wall', width: 4, height: 4.2, projects: 0.55,
      lamp: 'lamp_window_a' },
    ground_wall_2_a: { slot: 'ground_wall', width: 2, height: 4.2, projects: 0.55,
      lamp: 'lamp_window_b' },
    corner_ground_a: { slot: 'corner_ground', width: 0.5, height: 4.2, projects: 0.14 },
    upper_window_4_a: { slot: 'upper_window', width: 4, height: 3.2, projects: 0.55,
      lamp: 'lamp_window_a' },
    upper_window_4_b: { slot: 'upper_window', width: 4, height: 3.2, projects: 0.55,
      lamp: 'lamp_window_b' },
    upper_window_2_a: { slot: 'upper_window', width: 2, height: 3.2, projects: 0.65,
      lamp: 'lamp_window_b' },
    upper_balcony_4_a: { slot: 'upper_balcony', width: 4, height: 3.2, projects: 1.25,
      lamp: 'lamp_window_c' },
    upper_blank_4_a: { slot: 'upper_blank', width: 4, height: 3.2, projects: 0.55 },
    upper_blank_2_a: { slot: 'upper_blank', width: 2, height: 3.2, projects: 0.55 },
    corner_upper_a: { slot: 'corner_upper', width: 0.5, height: 3.2, projects: 0.55 },
    top_parapet_4_a: { slot: 'top_parapet', width: 4, height: 1.2, projects: 0.1 },
    top_parapet_2_a: { slot: 'top_parapet', width: 2, height: 1.2, projects: 0.65, crown: 2.2 },
    corner_top_a: { slot: 'corner_top', width: 0.5, height: 1.2, projects: 0.1 },
  },
  // Stone half-pilasters at both edges of every bay join into full pilasters between bays; the
  // ground fascia, bed moulding and cornice, the upper string courses and the top cornice run
  // the full width of each bay. Upper variants by building: a and c are stucco (c carries a
  // fire escape whose stair rises to the landing of the storey above: stack it in one column),
  // b and d are brick with stone dressings; the 2 m list (a stucco, b brick) follows the same
  // order, so upperVariant % count picks matching 4 m and 2 m bays. ground_shop_4_b is the
  // same shop closed behind its roller shutter.
  kit_downtown_commercial: {
    ground_shop_4_a: { slot: 'ground_shop', width: 4, height: 4.2, projects: 1.3,
      lamp: 'lamp_window_c', anchors: ['anchor_sign_ground_shop_4_a'] },
    ground_shop_4_b: { slot: 'ground_shop', width: 4, height: 4.2, projects: 0.24,
      anchors: ['anchor_sign_ground_shop_4_b'] },
    ground_shop_2_a: { slot: 'ground_shop', width: 2, height: 4.2, projects: 0.24,
      lamp: 'lamp_window_c', anchors: ['anchor_sign_ground_shop_2_a'] },
    ground_shop_wide_8_a: { slot: 'ground_shop_wide', width: 8, height: 4.2, projects: 1.45,
      lamp: 'lamp_window_c', anchors: ['anchor_sign_ground_shop_wide_8_a'] },
    ground_entrance_4_a: { slot: 'ground_entrance', width: 4, height: 4.2, projects: 1.35,
      lamp: 'lamp_window_c', anchors: ['anchor_sign_ground_entrance_4_a',
        'anchor_light_ground_entrance_4_a_l', 'anchor_light_ground_entrance_4_a_r'] },
    ground_wall_4_a: { slot: 'ground_wall', width: 4, height: 4.2, projects: 0.24,
      lamp: 'lamp_window_b' },
    ground_wall_2_a: { slot: 'ground_wall', width: 2, height: 4.2, projects: 0.31,
      anchors: ['anchor_light_ground_wall_2_a'] },
    ground_garage_4_a: { slot: 'ground_garage', width: 4, height: 4.2, projects: 0.24 },
    corner_ground_a: { slot: 'corner_ground', width: 0.5, height: 4.2, projects: 0.24 },
    upper_window_4_a: { slot: 'upper_window', width: 4, height: 3.2, projects: 0.15,
      lamp: 'lamp_window_a' },
    upper_window_4_b: { slot: 'upper_window', width: 4, height: 3.2, projects: 0.15,
      lamp: 'lamp_window_b' },
    upper_window_4_c: { slot: 'upper_window', width: 4, height: 3.2, projects: 1.2,
      lamp: 'lamp_window_c' },
    upper_window_4_d: { slot: 'upper_window', width: 4, height: 3.2, projects: 0.15,
      lamp: 'lamp_window_a' },
    upper_window_2_a: { slot: 'upper_window', width: 2, height: 3.2, projects: 0.15,
      lamp: 'lamp_window_a' },
    upper_window_2_b: { slot: 'upper_window', width: 2, height: 3.2, projects: 0.15,
      lamp: 'lamp_window_b' },
    upper_blank_4_a: { slot: 'upper_blank', width: 4, height: 3.2, projects: 0.4 },
    upper_blank_2_a: { slot: 'upper_blank', width: 2, height: 3.2, projects: 0.09 },
    corner_upper_a: { slot: 'corner_upper', width: 0.5, height: 3.2, projects: 0.07 },
    top_parapet_4_a: { slot: 'top_parapet', width: 4, height: 1.2, projects: 0.5 },
    top_parapet_2_a: { slot: 'top_parapet', width: 2, height: 1.2, projects: 0.5 },
    corner_top_a: { slot: 'corner_top', width: 0.5, height: 1.2, projects: 0.5 },
  },
  // A painted dado band at the foot and a band at every floor line run the full width of each
  // bay. Upper variants by building: a louvred windows behind bar grilles, b casements with
  // open timber shutters, c a wrought-iron balcony (the same bay is upper_balcony_4_a, so the
  // low-rise family gets balconies through the upper_window variant too); the 2 m list has
  // only a. ground_entrance_4_a carries an external concrete stair rising along the bay from
  // the street (x = -2) to a landing at the first-floor line (y = 4.2, x from 0.45 to 2), so
  // put a door-height opening of the first upper storey above that end if the assembler can.
  // roof_prop_1_a is a water tank on a steel stand: origin at the centre of the stand's base,
  // set it on the roof (plan 1.24 by 1.24 m); its lod1 is a single card facing -Z.
  kit_barrio_lowrise: {
    ground_shop_4_a: { slot: 'ground_shop', width: 4, height: 4.2, projects: 1.25,
      lamp: 'lamp_window_c', anchors: ['anchor_sign_ground_shop_4_a'] },
    ground_shop_2_a: { slot: 'ground_shop', width: 2, height: 4.2, projects: 0.9,
      lamp: 'lamp_window_c', anchors: ['anchor_sign_ground_shop_2_a'] },
    ground_entrance_4_a: { slot: 'ground_entrance', width: 4, height: 4.2, projects: 0.95,
      anchors: ['anchor_light_ground_entrance_4_a'] },
    ground_wall_4_a: { slot: 'ground_wall', width: 4, height: 4.2, projects: 0.45,
      lamp: 'lamp_window_a' },
    ground_wall_2_a: { slot: 'ground_wall', width: 2, height: 4.2, projects: 0.06,
      lamp: 'lamp_window_b' },
    ground_garage_4_a: { slot: 'ground_garage', width: 4, height: 4.2, projects: 0.24 },
    corner_ground_a: { slot: 'corner_ground', width: 0.5, height: 4.2, projects: 0.04 },
    upper_window_4_a: { slot: 'upper_window', width: 4, height: 3.2, projects: 0.45,
      lamp: 'lamp_window_a' },
    upper_window_4_b: { slot: 'upper_window', width: 4, height: 3.2, projects: 0.08,
      lamp: 'lamp_window_b' },
    upper_window_4_c: { slot: 'upper_window', width: 4, height: 3.2, projects: 0.75,
      lamp: 'lamp_window_c' },
    upper_window_2_a: { slot: 'upper_window', width: 2, height: 3.2, projects: 0.45,
      lamp: 'lamp_window_a' },
    upper_balcony_4_a: { slot: 'upper_balcony', width: 4, height: 3.2, projects: 0.75,
      lamp: 'lamp_window_c' },
    upper_blank_4_a: { slot: 'upper_blank', width: 4, height: 3.2, projects: 0.07 },
    upper_blank_2_a: { slot: 'upper_blank', width: 2, height: 3.2, projects: 0.05 },
    corner_upper_a: { slot: 'corner_upper', width: 0.5, height: 3.2, projects: 0.04 },
    top_parapet_4_a: { slot: 'top_parapet', width: 4, height: 1.2, projects: 0.3 },
    top_parapet_2_a: { slot: 'top_parapet', width: 2, height: 1.2, projects: 0.3 },
    corner_top_a: { slot: 'corner_top', width: 0.5, height: 1.2, projects: 0.05 },
    roof_prop_1_a: { slot: 'roof_prop', width: 1.2, height: 2.3, projects: 0, plan: [1.24, 1.24] },
  },
  // kit_residential: the stucco apartment blocks and houses of 2 to 3 storeys on the residential
  // hills and the Barrio edges. Ground storeys are 4.2 m like every kit (the assembler's
  // storey line). Upper variants in the same order for both widths: 4 m [a sash pair with an
  // air-conditioner, b sliding doors onto a timber-slat balcony on dark posts, c wide window
  // and a slat screen], 2 m [a sash window]. top_crown_4_a is the parapet with a roof-terrace
  // pergola behind it, reaching 2.77 m above the roof line and 2.75 m back: use it on street
  // fronts. roof_prop_1_a is an air-conditioning condenser (plan 1.0 by 0.45 m) and
  // roof_prop_4_a a free-standing pergola (3.8 by 3.1 m); origin at the centre of the base,
  // set on the roof; their lod1 is a single card facing -Z. ground_garage_4_b has its roll-up
  // door half open on a dark garage. ground_shop_4_a / _2_a are corner stores behind a
  // roll-down shutter (4 m lowered to 1.75 m over lit glazing, 2 m closed) with a blank fascia
  // (anchor_sign_*) and a wall lamp. Pitched clay-tile roofs: eave_4_a / eave_2_a (slot
  // 'eave') go on top of the last storey of the long sides instead of top_parapet: frieze,
  // soffit, fascia, gutter, a 24-degree barrel-tile slope rising 1.2 m and reaching roofBack
  // metres behind the wall (close the roof above that); gable_end_4_a (slot 'gable_end') is the
  // 4 m wide end of such a roof, ridge at 1.47 m with tiles, slopes 1.8 m back.
  kit_residential: {
    ground_entrance_4_a: { slot: 'ground_entrance', width: 4, height: 4.2, projects: 0.95,
      lamp: 'lamp_window_c', anchors: ['anchor_sign_ground_entrance_4_a',
        'anchor_light_ground_entrance_4_a'] },
    ground_garage_4_a: { slot: 'ground_garage', width: 4, height: 4.2, projects: 0.26,
      anchors: ['anchor_light_ground_garage_4_a'] },
    ground_garage_4_b: { slot: 'ground_garage', width: 4, height: 4.2, projects: 0.26,
      anchors: ['anchor_light_ground_garage_4_b'] },
    ground_wall_4_a: { slot: 'ground_wall', width: 4, height: 4.2, projects: 0.33,
      lamp: 'lamp_window_a' },
    ground_wall_2_a: { slot: 'ground_wall', width: 2, height: 4.2, projects: 0.2,
      lamp: 'lamp_window_b' },
    ground_shop_4_a: { slot: 'ground_shop', width: 4, height: 4.2, projects: 0.26,
      lamp: 'lamp_window_c', anchors: ['anchor_sign_ground_shop_4_a',
        'anchor_light_ground_shop_4_a'] },
    ground_shop_2_a: { slot: 'ground_shop', width: 2, height: 4.2, projects: 0.26,
      anchors: ['anchor_sign_ground_shop_2_a', 'anchor_light_ground_shop_2_a'] },
    corner_ground_a: { slot: 'corner_ground', width: 0.5, height: 4.2, projects: 0.13 },
    upper_window_4_a: { slot: 'upper_window', width: 4, height: 3.2, projects: 0.33,
      lamp: 'lamp_window_a' },
    upper_window_4_b: { slot: 'upper_window', width: 4, height: 3.2, projects: 1.15,
      lamp: 'lamp_window_b' },
    upper_window_4_c: { slot: 'upper_window', width: 4, height: 3.2, projects: 0.15,
      lamp: 'lamp_window_c' },
    upper_window_2_a: { slot: 'upper_window', width: 2, height: 3.2, projects: 0.08,
      lamp: 'lamp_window_a' },
    upper_balcony_4_a: { slot: 'upper_balcony', width: 4, height: 3.2, projects: 1.15,
      lamp: 'lamp_window_b' },
    upper_blank_4_a: { slot: 'upper_blank', width: 4, height: 3.2, projects: 0.33 },
    upper_blank_2_a: { slot: 'upper_blank', width: 2, height: 3.2, projects: 0.12 },
    corner_upper_a: { slot: 'corner_upper', width: 0.5, height: 3.2, projects: 0.13 },
    top_parapet_4_a: { slot: 'top_parapet', width: 4, height: 1.2, projects: 0.28 },
    top_parapet_2_a: { slot: 'top_parapet', width: 2, height: 1.2, projects: 0.05 },
    top_crown_4_a: { slot: 'top_crown', width: 4, height: 1.2, projects: 0.05, crown: 2.77 },
    eave_4_a: { slot: 'eave', width: 4, height: 1.2, projects: 0.75, roofBack: 1.22,
      pitchDeg: 24 },
    eave_2_a: { slot: 'eave', width: 2, height: 1.2, projects: 0.75, roofBack: 1.22,
      pitchDeg: 24 },
    gable_end_4_a: { slot: 'gable_end', width: 4, height: 1.2, projects: 0.36, ridge: 1.47,
      pitchDeg: 24 },
    corner_top_a: { slot: 'corner_top', width: 0.5, height: 1.2, projects: 0.2 },
    roof_prop_1_a: { slot: 'roof_prop', width: 0.9, height: 0.73, projects: 0, plan: [1.0, 0.45] },
    roof_prop_4_a: { slot: 'roof_prop', width: 3.8, height: 2.77, projects: 0, plan: [3.8, 3.1] },
  },
};

/** @type {Record<string, import('./index.js').AssetEntry>} */
export const BUILDING_ASSETS = {
  // The streamlined pastel hotels and apartment blocks of the beach district: continuous
  // eyebrows, speed lines, steel casements deep in their reveals, curved balconies, a tiled
  // base course, a parapet with a coping, a finned centre feature with a stepped crown.
  // Seventeen modules so far (BUILDING_KIT_MODULES above).
  // Budget: a whole kit in one file; each module is its own node with up to four materials
  // and the game batches modules separately, so the per-building ceilings do not apply.
  kit_deco_resort: {
    file: 'buildings/kit_deco_resort.glb',
    kind: 'building',
    lods: 2,
    nodes: [
      ...Object.keys(BUILDING_KIT_MODULES.kit_deco_resort)
        .flatMap((module) => [`${module}_lod0`, `${module}_lod1`]),
      'tile_swatch',
    ],
    anchors: [
      'anchor_sign_ground_shop_4_a', 'anchor_sign_ground_shop_wide_8_a',
      'anchor_sign_ground_entrance_4_a',
      'anchor_light_ground_entrance_4_a_l', 'anchor_light_ground_entrance_4_a_r',
    ],
    materials: ['atlas', 'paint_wall', 'paint_trim', 'lamp_window_a', 'lamp_window_b',
      'lamp_window_c', 'tile_wall', 'tile_roof_flat'],
    maxTriangles: 16000,
    maxDraws: 200,
    maxBytes: 1250000,
  },
  // The stucco, brick and stone-trimmed shop and office blocks of Centro, 2 to 6 storeys:
  // shopfronts with awnings and roller shutters, an office entrance under a steel canopy, sash
  // windows with stone sills and keyed lintels, a fire escape, a bracketed cornice.
  // Twenty-one modules (BUILDING_KIT_MODULES above). Budget: a whole kit in one file, as above.
  kit_downtown_commercial: {
    file: 'buildings/kit_downtown_commercial.glb',
    kind: 'building',
    lods: 2,
    nodes: [
      ...Object.keys(BUILDING_KIT_MODULES.kit_downtown_commercial)
        .flatMap((module) => [`${module}_lod0`, `${module}_lod1`]),
      'tile_swatch',
    ],
    anchors: [
      'anchor_sign_ground_shop_4_a', 'anchor_sign_ground_shop_4_b', 'anchor_sign_ground_shop_2_a',
      'anchor_sign_ground_shop_wide_8_a', 'anchor_sign_ground_entrance_4_a',
      'anchor_light_ground_entrance_4_a_l', 'anchor_light_ground_entrance_4_a_r',
      'anchor_light_ground_wall_2_a',
    ],
    materials: ['atlas', 'paint_wall', 'paint_trim', 'lamp_window_a', 'lamp_window_b',
      'lamp_window_c', 'tile_wall', 'tile_roof_flat'],
    maxTriangles: 16000,
    maxDraws: 200,
    maxBytes: 1250000,
  },
  // The painted-block and stucco low-rise of Barrio Hierro and the old town, 1 to 3 storeys in
  // strong colours: shops behind bar grilles under tin canopies, louvred windows with bars,
  // timber shutters, a wrought-iron balcony, an external stair, exposed conduit, a parapet with
  // rebar stubs, a water tank for the roof. Nineteen modules (BUILDING_KIT_MODULES above).
  // Budget: a whole kit in one file, as above.
  kit_barrio_lowrise: {
    file: 'buildings/kit_barrio_lowrise.glb',
    kind: 'building',
    lods: 2,
    nodes: [
      ...Object.keys(BUILDING_KIT_MODULES.kit_barrio_lowrise)
        .flatMap((module) => [`${module}_lod0`, `${module}_lod1`]),
      'tile_swatch',
    ],
    anchors: [
      'anchor_sign_ground_shop_4_a', 'anchor_sign_ground_shop_2_a',
      'anchor_light_ground_entrance_4_a',
    ],
    materials: ['atlas', 'paint_wall', 'paint_trim', 'lamp_window_a', 'lamp_window_b',
      'lamp_window_c', 'tile_wall', 'tile_roof_flat'],
    maxTriangles: 16000,
    maxDraws: 200,
    maxBytes: 1250000,
  },
  // The stucco apartment blocks and houses of the residential hills and the Barrio edges, 2 to
  // 3 storeys: roll-up garage doors, a recessed front door under a slatted canopy, sash
  // windows, sliding doors onto timber-slat balconies on dark posts, air-conditioners,
  // downpipes and conduit, a parapet and a roof-terrace pergola; rain streaks under the sills,
  // damp bases, patched and faded render baked in; corner stores with roll-down shutters,
  // clay-tile eaves and a gable end. 25 modules (BUILDING_KIT_MODULES above).
  // Budget: a whole kit in one file; each module is its own node with up to eight materials.
  kit_residential: {
    file: 'buildings/kit_residential.glb',
    kind: 'building',
    lods: 2,
    nodes: [
      ...Object.keys(BUILDING_KIT_MODULES.kit_residential)
        .flatMap((module) => [`${module}_lod0`, `${module}_lod1`]),
      'tile_swatch',
    ],
    anchors: [
      'anchor_sign_ground_entrance_4_a', 'anchor_light_ground_entrance_4_a',
      'anchor_light_ground_garage_4_a', 'anchor_light_ground_garage_4_b',
      'anchor_sign_ground_shop_4_a', 'anchor_light_ground_shop_4_a',
      'anchor_sign_ground_shop_2_a', 'anchor_light_ground_shop_2_a',
    ],
    materials: ['atlas', 'paint_wall', 'paint_trim', 'lamp_window_a', 'lamp_window_b',
      'lamp_window_c', 'tile_wall', 'tile_roof_flat'],
    maxTriangles: 16000,
    maxDraws: 220,
    maxBytes: 1250000,
  },
};
