// Towers and industry: the facade kits of the downtown skyline and of the working city.
// Written by hand (see index.js).
//
// KITS: ONE FILE, MANY FACADE MODULES
// A kit (kit_<style>) is one .glb whose nodes are facade modules sharing one atlas. A module is
// one bay of one storey on the module grid: it faces -Z in the game (the street side), its
// outer wall surface is the plane z = 0, it spans x from -width/2 to +width/2 and y from 0 to
// its height, and its back is open (the assembler closes the building). Parts may project up
// to 1.6 m towards the street and recess up to 0.7 m.
//
//   <module>_lod0   the modelled bay (a few dozen to a few hundred triangles)
//   <module>_lod1   a flat card on the wall plane, at most 8 triangles, baked from the bay
//                   (colour, normal, occlusion, roughness, metalness, window glow): the skyline
//   anchor_sign_<module>    centre of the sign area, pointing at the street; userData.width and
//                           userData.height are the usable size in metres. No lettering is baked.
//   anchor_light_<module>   a canopy or wall lamp, pointing along its beam (userData.light ...)
//   tile_swatches   no levels: a few quads that only carry the kit's tile_* materials
//
// THE NODE TRANSLATION IS NOT PART OF THE GRID. In the file the modules stand in a catalogue
// row along x (the built kit is its own contact sheet). The geometry of every module is in
// module space, so the assembler instances the geometry and ignores the node's translation;
// an anchor's module-space position is its position minus the translation of its module's
// _lod0 node (asset.extras.modules[<module>].origin gives the same place, with slot, width,
// height and triangle counts; asset.extras.module_grid gives the grid numbers).
//
// Module names are <slot>_<width in metres>_<variant>; corner posts are 0.5 m square in plan
// (street faces on x = +0.25 and z = 0) and are named <slot>_<variant> without a width.
// Material roles: paint_wall (panel bands, fascias, parapets) and paint_trim (mullions, fins,
// copings, canopies) are tinted per building with setPaint; lamp_window_a, _b and _c are the
// glazing, spread over the panes of every bay: unlit they are mirror glass for the sky
// (metalness 1, roughness 0.05), lit they show the room (setLamp by group); lamp_crown is the
// light band of the tower crown; the rest is 'atlas' (stone, louvres, dark spandrel glass,
// soffits). Glass tint: multiply material.color of the lamp_window_* materials (the baked glass
// is a neutral cool mid-tone). On the lod1 cards the trim is baked with its default dark colour;
// wall areas stay tintable.
// Tile materials (their own repeating texture sets, UVs in metres): tile_wall is paint_wall's
// finish baked near white like a paint, so give its material.color the same colour as the
// building's paint_wall; tile_roof_flat is a pale gravel membrane roof (2 m, level faces);
// tile_curtain_wall is a 4 m infill of upper_window_4_a (same pane pitch, sill and 4.0 m storey)
// for the sides of a tower nobody walks past; start its UVs at a storey line.

/** @type {Record<string, import('./index.js').AssetEntry>} */
export const TOWER_INDUSTRY_ASSETS = {
  // Glass office and hotel towers: bays 4 m and 2 m, upper storeys 4.0 m, ground storey 4.2 m,
  // top pieces 1.2 m, glazing on a 1.333 m pitch in every 4 m module (1.0 m in the 2 m bays).
  // Over the building defaults in draw calls by design: a whole kit in one file, each module
  // with its own few materials (modules are drawn instanced, never all at once). Built with a
  // 1024 atlas for now.
  kit_glass_tower: {
    file: 'towers_industry/kit_glass_tower.glb',
    kind: 'building',
    lods: 2,
    nodes: [
      'upper_window_4_a_lod0', 'upper_window_4_a_lod1',
      'upper_window_4_b_lod0', 'upper_window_4_b_lod1',
      'upper_window_4_c_lod0', 'upper_window_4_c_lod1',
      'upper_window_2_a_lod0', 'upper_window_2_a_lod1',
      'upper_window_2_b_lod0', 'upper_window_2_b_lod1',
      'upper_window_2_c_lod0', 'upper_window_2_c_lod1',
      'upper_mechanical_4_a_lod0', 'upper_mechanical_4_a_lod1',
      'corner_upper_a_lod0', 'corner_upper_a_lod1',
      'top_parapet_4_a_lod0', 'top_parapet_4_a_lod1',
      'top_parapet_2_a_lod0', 'top_parapet_2_a_lod1',
      'corner_top_a_lod0', 'corner_top_a_lod1',
      'top_crown_4_a_lod0', 'top_crown_4_a_lod1',
      'top_crown_2_a_lod0', 'top_crown_2_a_lod1',
      'ground_entrance_8_a_lod0', 'ground_entrance_8_a_lod1',
      'ground_shop_4_a_lod0', 'ground_shop_4_a_lod1',
      'corner_ground_a_lod0', 'corner_ground_a_lod1',
      'tile_swatches',
    ],
    anchors: [
      'anchor_sign_top_crown_4_a',
      'anchor_sign_ground_entrance_8_a', 'anchor_light_ground_entrance_8_a',
      'anchor_sign_ground_shop_4_a', 'anchor_light_ground_shop_4_a',
    ],
    materials: ['atlas', 'paint_wall', 'paint_trim', 'lamp_window_a', 'lamp_window_b',
      'lamp_window_c', 'lamp_crown', 'tile_wall', 'tile_roof_flat', 'tile_curtain_wall'],
    maxDraws: 160,
    maxBytes: 940000,
  },
};

/**
 * The modules of each kit: the assembler's table. slot is the vocabulary of the module grid,
 * width and height are metres, storey says which storey height the kit's upper modules use.
 * tiles lists the kit's repeating materials with the square they repeat over (metres) and
 * whether they go on walls or level faces.
 * @type {Record<string, {storey: number, ground: number, top: number, modules:
 *   Record<string, {slot: string, width: number, height: number, signAnchor?: string,
 *   lightAnchor?: string, note: string}>, tiles: Record<string, {size: number,
 *   facing: 'wall' | 'floor', note: string}>}>}
 */
export const TOWER_KIT_MODULES = {
  kit_glass_tower: {
    storey: 4.0,
    ground: 4.2,
    top: 1.2,
    modules: {
      upper_window_4_a: { slot: 'upper_window', width: 4, height: 4.0, note: 'curtain wall, deep mullion fins, dark spandrel glass' },
      upper_window_4_b: { slot: 'upper_window', width: 4, height: 4.0, note: 'ribbon glazing set back between paint_wall bands, sun blade' },
      upper_window_4_c: { slot: 'upper_window', width: 4, height: 4.0, note: 'flush structural glazing, fine joints' },
      upper_window_2_a: { slot: 'upper_window', width: 2, height: 4.0, note: 'narrow bay of design a (two 1.0 m panes)' },
      upper_window_2_b: { slot: 'upper_window', width: 2, height: 4.0, note: 'narrow bay of design b' },
      upper_window_2_c: { slot: 'upper_window', width: 2, height: 4.0, note: 'narrow bay of design c' },
      upper_mechanical_4_a: { slot: 'upper_mechanical', width: 4, height: 4.0, note: 'louvred plant floor' },
      corner_upper_a: { slot: 'corner_upper', width: 0.5, height: 4.0, note: 'glazed corner post' },
      top_parapet_4_a: { slot: 'top_parapet', width: 4, height: 1.2, note: 'panel upstand with coping, closed towards the roof' },
      top_parapet_2_a: { slot: 'top_parapet', width: 2, height: 1.2, note: 'narrow parapet' },
      corner_top_a: { slot: 'corner_top', width: 0.5, height: 1.2, note: 'parapet corner' },
      top_crown_4_a: { slot: 'top_crown', width: 4, height: 1.2, signAnchor: 'anchor_sign_top_crown_4_a', note: 'crown screen with a lamp_crown band; stack rows for a taller crown, set back on the roof' },
      top_crown_2_a: { slot: 'top_crown', width: 2, height: 1.2, note: 'narrow crown screen, stacks like top_crown_4_a' },
      ground_entrance_8_a: { slot: 'ground_entrance', width: 8, height: 4.2, signAnchor: 'anchor_sign_ground_entrance_8_a', lightAnchor: 'anchor_light_ground_entrance_8_a', note: 'lobby with portal, doors and hung canopy (projects 1.5 m)' },
      ground_shop_4_a: { slot: 'ground_shop', width: 4, height: 4.2, signAnchor: 'anchor_sign_ground_shop_4_a', lightAnchor: 'anchor_light_ground_shop_4_a', note: 'shopfront with door on the right and awning blade (projects 0.9 m)' },
      corner_ground_a: { slot: 'corner_ground', width: 0.5, height: 4.2, note: 'stone corner pier' },
    },
    tiles: {
      tile_wall: { size: 2, facing: 'wall', note: 'paint_wall finish baked near white; set its color to the wall paint' },
      tile_roof_flat: { size: 2, facing: 'floor', note: 'gravel membrane roof' },
      tile_curtain_wall: { size: 4, facing: 'wall', note: 'curtain wall infill of design a, one storey per tile' },
    },
  },
};
