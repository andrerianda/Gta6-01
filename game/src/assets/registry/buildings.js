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
 * street (metres), the lamp group of its panes, its anchors, and for a crown the height it
 * rises to. The assembler's table.
 * @type {Record<string, Record<string, {slot: string, width: number, height: number,
 *   projects: number, lamp?: string, anchors?: string[], crown?: number}>>}
 */
export const BUILDING_KIT_MODULES = {
  kit_deco_resort: {
    ground_shop_4_a: { slot: 'ground_shop', width: 4, height: 4.2, projects: 1.15,
      lamp: 'lamp_window_c', anchors: ['anchor_sign_ground_shop_4_a'] },
    ground_entrance_4_a: { slot: 'ground_entrance', width: 4, height: 4.2, projects: 1.35,
      lamp: 'lamp_window_c', anchors: ['anchor_sign_ground_entrance_4_a',
        'anchor_light_ground_entrance_4_a_l', 'anchor_light_ground_entrance_4_a_r'] },
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
    corner_upper_a: { slot: 'corner_upper', width: 0.5, height: 3.2, projects: 0.55 },
    top_parapet_4_a: { slot: 'top_parapet', width: 4, height: 1.2, projects: 0.1 },
    top_parapet_2_a: { slot: 'top_parapet', width: 2, height: 1.2, projects: 0.65, crown: 2.2 },
    corner_top_a: { slot: 'corner_top', width: 0.5, height: 1.2, projects: 0.1 },
  },
};

/** @type {Record<string, import('./index.js').AssetEntry>} */
export const BUILDING_ASSETS = {
  // The streamlined pastel hotels and apartment blocks of the beach district: continuous
  // eyebrows, speed lines, steel casements deep in their reveals, curved balconies, a tiled
  // base course, a parapet with a coping, a finned centre feature with a stepped crown.
  // Thirteen modules so far (BUILDING_KIT_MODULES above).
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
      'anchor_sign_ground_shop_4_a', 'anchor_sign_ground_entrance_4_a',
      'anchor_light_ground_entrance_4_a_l', 'anchor_light_ground_entrance_4_a_r',
    ],
    materials: ['atlas', 'paint_wall', 'paint_trim', 'lamp_window_a', 'lamp_window_b',
      'lamp_window_c', 'tile_wall', 'tile_roof_flat'],
    maxTriangles: 16000,
    maxDraws: 200,
    maxBytes: 1250000,
  },
};
