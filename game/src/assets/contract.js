// The naming contract between the Blender asset pipeline and the game. Names are the only
// interface: nodes and materials are found by the rules below, which mirror
// art/blender/lib/naming.py (art/README.md explains them in full). This module has no
// dependencies, so tools and tests can import it without three.js.
//
// Nodes
//   <part>_lod0, <part>_lod1, ...  a mesh that belongs to one level of detail ("lod0" alone too)
//   <part>                         a mesh shown at every level (wheels, doors, rotors)
//   anchor_<what>                  an empty: a point, and a direction along its local -Z
//   col_box_*, col_cyl_*, col_sphere_*   empties whose scale is the proxy's full size in metres
//   col_hull_*, col_mesh_*         meshes used for collision only, never drawn
//
// Materials (by name prefix)
//   paint, paint_*    tintable: baked neutral, material.color is the paint colour
//   glass, glass_*    alpha-blended glass
//   lamp_<group>      an emissive lamp the game switches by its group name
//   cutout, cutout_*  alpha-tested, double sided (foliage, fences)
//   tile_<name>       a repeating texture set with UVs in metres
//   atlas             everything else: one opaque material per asset

/** Prefix of anchor nodes. */
export const ANCHOR_PREFIX = 'anchor_';

/** Prefix of collision proxy nodes. */
export const COLLIDER_PREFIX = 'col_';

/** The shapes a collision proxy name may carry: col_<shape>_<name>. */
export const COLLIDER_SHAPES = Object.freeze(['box', 'cyl', 'sphere', 'hull', 'mesh']);

/** The material roles. */
export const ROLE = Object.freeze({
  ATLAS: 'atlas',
  PAINT: 'paint',
  GLASS: 'glass',
  LAMP: 'lamp',
  CUTOUT: 'cutout',
  TILE: 'tile',
});

/** The asset kinds, as in ASSET['kind'] of the Blender scripts. */
export const ASSET_KINDS = Object.freeze(['vehicle', 'character', 'building', 'prop', 'vegetation', 'dev']);

/**
 * Budgets by asset kind, the same numbers as art/blender/lib/report.py: triangles and draw calls
 * at the highest level of detail, and bytes of the .glb file.
 */
export const ASSET_BUDGETS = Object.freeze({
  vehicle: Object.freeze({ triangles: 18000, draws: 14, bytes: 1000000 }),
  character: Object.freeze({ triangles: 9000, draws: 5, bytes: 600000 }),
  building: Object.freeze({ triangles: 8000, draws: 8, bytes: 1500000 }),
  prop: Object.freeze({ triangles: 2500, draws: 4, bytes: 220000 }),
  vegetation: Object.freeze({ triangles: 3000, draws: 3, bytes: 400000 }),
  dev: Object.freeze({ triangles: 2000, draws: 6, bytes: 100000 }),
});

const LOD_PATTERN = /^(?:(.+)_)?lod([0-9])$/;

/**
 * The level of detail a node name belongs to.
 * @param {string} name A node name such as "body_lod1" or "lod0".
 * @returns {number | null} The level, or null for a node shown at every level.
 */
export function lodLevelOf(name) {
  const match = LOD_PATTERN.exec(name);
  return match ? Number(match[2]) : null;
}

/**
 * The part a level-of-detail node name refers to.
 * @param {string} name A node name such as "body_lod1".
 * @returns {string} "body" for "body_lod1", "" for "lod1", and the name itself otherwise.
 */
export function lodPartOf(name) {
  const match = LOD_PATTERN.exec(name);
  return match ? (match[1] ?? '') : name;
}

/**
 * @param {string} name A node name.
 * @returns {boolean} True for an anchor node.
 */
export function isAnchorName(name) {
  return name.startsWith(ANCHOR_PREFIX);
}

/**
 * @param {string} name A node name.
 * @returns {boolean} True for a collision proxy node.
 */
export function isColliderName(name) {
  return name.startsWith(COLLIDER_PREFIX);
}

/**
 * The shape of a collision proxy.
 * @param {string} name A node name such as "col_box_body".
 * @returns {string | null} "box", "cyl", "sphere", "hull" or "mesh"; null if it is not a proxy.
 */
export function colliderShapeOf(name) {
  if (!isColliderName(name)) return null;
  const shape = name.split('_')[1];
  return COLLIDER_SHAPES.includes(shape) ? shape : null;
}

/**
 * The role of a material, by its name.
 * @param {string} name A material name such as "paint", "lamp_head" or "atlas".
 * @returns {string} One of the ROLE values.
 */
export function materialRoleOf(name) {
  for (const role of [ROLE.PAINT, ROLE.GLASS, ROLE.CUTOUT]) {
    if (name === role || name.startsWith(`${role}_`)) return role;
  }
  for (const role of [ROLE.LAMP, ROLE.TILE]) {
    if (name.startsWith(`${role}_`) && name.length > role.length + 1) return role;
  }
  return ROLE.ATLAS;
}
