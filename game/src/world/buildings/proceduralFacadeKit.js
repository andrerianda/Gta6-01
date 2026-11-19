// The procedural facade kit: the stand-in for a Blender kit that is not built yet. It makes the
// same modules on the same grid (ground shop, entrance and wall bays, upper windows and
// balconies, parapets, corner posts) with real depth: recessed windows with reveals, sills,
// eyebrows, canopies, mullion fins and copings. The geometry is plain arrays per role (wall,
// trim, glass, frame) in module space: wall plane z = 0, street towards -Z, x across the bay,
// y up, uv in metres. buildingMeshAssembly.js places and merges it exactly like a baked kit.

/** Look parameters of each family of the fallback. */
const FAMILY_LOOKS = {
  deco: { window: [1.7, 0.95, 2.55], reveal: 0.22, eyebrow: 0.55, sill: true, mullions: 2, shopAwning: 1.1, balcony: 1.1, parapetCoping: 0.1, speedLines: true },
  lowrise: { window: [1.1, 0.8, 2.55], reveal: 0.18, eyebrow: 0, sill: true, mullions: 1, shopAwning: 1.3, balcony: 0.7, parapetCoping: 0.06, shutters: true },
  residential: { window: [1.9, 0.9, 2.5], reveal: 0.16, eyebrow: 0.25, sill: true, mullions: 1, shopAwning: 0, balcony: 1.3, parapetCoping: 0.08 },
  villa: { window: [2.2, 0.75, 2.6], reveal: 0.2, eyebrow: 0.35, sill: true, mullions: 2, shopAwning: 0, balcony: 1.2, parapetCoping: 0.12 },
  office: { ribbon: [0.95, 2.75], reveal: 0.14, mullions: 3, shopAwning: 0, parapetCoping: 0.08, fins: 0.18 },
  tower: { curtain: true, spandrel: 0.75, reveal: 0.06, mullions: 3, fins: 0.32, parapetCoping: 0.1 },
  civic: { window: [1.4, 0.9, 3.6], reveal: 0.35, eyebrow: 0, sill: true, mullions: 1, shopAwning: 0, parapetCoping: 0.25, pilasters: true },
  industrial: { window: [3.2, 2.2, 3.0], reveal: 0.08, mullions: 4, shopAwning: 0, parapetCoping: 0.05, rollerDoor: true },
};

/**
 * Makes the fallback kit of one look family.
 * @param {string} family deco, lowrise, residential, villa, office, tower, civic or industrial.
 * @param {{upper?: number}} [grid] Storey height of the upper modules (3.2 or 4.0).
 * @returns {ProceduralKit} The kit: modules by name with their slot, width, height and parts.
 */
export function createProceduralFacadeKit(family, grid = {}) {
  const look = FAMILY_LOOKS[family] ?? FAMILY_LOOKS.office;
  const upper = grid.upper ?? (family === 'tower' ? 4.0 : 3.2);
  const modules = {};
  const add = (name, slot, width, height, build) => {
    const parts = createPartWriter();
    build(parts, width, height);
    modules[name] = { slot, width, height, parts: parts.finish() };
  };
  for (const width of [4, 2]) {
    add(`upper_window_${width}`, 'upper_window', width, upper, (p, w, h) => upperWindow(p, look, w, h));
    add(`ground_wall_${width}`, 'ground_wall', width, 4.2, (p, w, h) => groundWall(p, look, w, h));
    add(`ground_shop_${width}`, 'ground_shop', width, 4.2, (p, w, h) => groundShop(p, look, w, h));
    add(`top_parapet_${width}`, 'top_parapet', width, 1.2, (p, w, h) => parapet(p, look, w, h));
  }
  add('upper_balcony_4', 'upper_balcony', 4, upper, (p, w, h) => (look.balcony ? balcony(p, look, w, h) : upperWindow(p, look, w, h)));
  add('ground_entrance_4', 'ground_entrance', 4, 4.2, (p, w, h) => entrance(p, look, w, h));
  add('corner_ground', 'corner_ground', 0.5, 4.2, (p, w, h) => cornerPost(p, look, h, true));
  add('corner_upper', 'corner_upper', 0.5, upper, (p, w, h) => cornerPost(p, look, h, false));
  add('corner_top', 'corner_top', 0.5, 1.2, (p, w, h) => cornerPost(p, look, h, false, true));
  return { id: `procedural_${family}`, family, procedural: true, upper, modules };
}

// ---- module recipes -------------------------------------------------------------------------

function upperWindow(p, look, w, h) {
  if (look.curtain) return curtainBay(p, look, w, h);
  if (look.ribbon) return ribbonBay(p, look, w, h);
  const [ww, y0, y1] = look.window;
  const width = Math.min(ww, w - 0.6);
  punchedWindow(p, look, -width / 2, width / 2, y0, Math.min(y1, h - 0.45), w, h);
  if (look.eyebrow) p.box('trim', -w / 2, w / 2, Math.min(y1, h - 0.45) + 0.12, Math.min(y1, h - 0.45) + 0.22, -look.eyebrow, 0);
  if (look.speedLines) for (const y of [0.3, 0.45]) p.box('trim', -w / 2, w / 2, y, y + 0.06, -0.06, 0);
  if (look.pilasters) for (const x of [-w / 2, w / 2 - 0.4]) p.box('trim', x, x + 0.4, 0, h, -0.18, 0);
}

function punchedWindow(p, look, x0, x1, y0, y1, w, h) {
  const d = look.reveal;
  p.wallWithHole('wall', -w / 2, w / 2, 0, h, x0, x1, y0, y1);
  p.reveal('wall', x0, x1, y0, y1, d);
  p.pane(x0, x1, y0, y1, d - 0.03);
  mullionGrid(p, x0, x1, y0, y1, d - 0.05, look.mullions ?? 1);
  if (look.sill) p.box('trim', x0 - 0.1, x1 + 0.1, y0 - 0.08, y0, -0.07, 0.02);
  if (look.shutters) {
    const sw = (x1 - x0) / 2;
    p.box('trim', x0 - sw - 0.04, x0 - 0.04, y0, y1, -0.07, -0.02);
    p.box('trim', x1 + 0.04, x1 + sw + 0.04, y0, y1, -0.07, -0.02);
  }
}

function mullionGrid(p, x0, x1, y0, y1, z, count) {
  const t = 0.05;
  p.box('frame', x0, x1, y0, y0 + t, z - 0.04, z);
  p.box('frame', x0, x1, y1 - t, y1, z - 0.04, z);
  p.box('frame', x0, x0 + t, y0, y1, z - 0.04, z);
  p.box('frame', x1 - t, x1, y0, y1, z - 0.04, z);
  for (let i = 1; i < count; i += 1) {
    const x = x0 + ((x1 - x0) * i) / count;
    p.box('frame', x - t / 2, x + t / 2, y0, y1, z - 0.04, z);
  }
  if (y1 - y0 > 1.4) {
    const y = y0 + (y1 - y0) * 0.72;
    p.box('frame', x0, x1, y - t / 2, y + t / 2, z - 0.04, z);
  }
}

function curtainBay(p, look, w, h) {
  const s = look.spandrel;
  p.box('wall', -w / 2, w / 2, 0, s, -0.04, 0, { back: false, top: true, bottom: true });
  p.pane(-w / 2, w / 2, s, h, look.reveal);
  const fins = Math.max(1, Math.round(w / 1.333));
  for (let i = 0; i <= fins; i += 1) {
    const x = -w / 2 + (w * i) / fins;
    p.box('frame', x - 0.04, x + 0.04, 0, h, -look.fins, 0.02);
  }
  p.box('frame', -w / 2, w / 2, s - 0.04, s + 0.02, -0.08, 0.02);
}

function ribbonBay(p, look, w, h) {
  const [y0, y1] = look.ribbon;
  const top = Math.min(y1, h - 0.3);
  p.wallWithHole('wall', -w / 2, w / 2, 0, h, -w / 2, w / 2, y0, top);
  p.reveal('wall', -w / 2, w / 2, y0, top, look.reveal, { sides: false });
  p.pane(-w / 2, w / 2, y0, top, look.reveal - 0.02);
  mullionGrid(p, -w / 2, w / 2, y0, top, look.reveal - 0.04, look.mullions);
  p.box('trim', -w / 2, w / 2, top, top + 0.1, -0.12, 0);
  if (look.fins) p.box('frame', w / 2 - 0.1, w / 2, 0, h, -look.fins, 0);
}

function balcony(p, look, w, h) {
  const door = Math.min(2.4, w - 0.8);
  punchedWindow(p, { ...look, sill: false, shutters: false }, -door / 2, door / 2, 0.02, Math.min(2.55, h - 0.4), w, h);
  const depth = look.balcony;
  p.box('trim', -w / 2 + 0.25, w / 2 - 0.25, -0.02, 0.16, -depth, 0, { back: false });
  // Railing: a solid upstand on deco and villas, steel bars elsewhere.
  if (look.speedLines || look.eyebrow >= 0.35) {
    p.box('trim', -w / 2 + 0.25, w / 2 - 0.25, 0.16, 1.0, -depth, -depth + 0.08);
    p.box('trim', -w / 2 + 0.25, -w / 2 + 0.33, 0.16, 1.0, -depth, 0);
    p.box('trim', w / 2 - 0.33, w / 2 - 0.25, 0.16, 1.0, -depth, 0);
  } else {
    p.box('frame', -w / 2 + 0.25, w / 2 - 0.25, 0.95, 1.0, -depth, -depth + 0.05);
    p.box('frame', -w / 2 + 0.25, -w / 2 + 0.3, 0.16, 1.0, -depth, 0);
    p.box('frame', w / 2 - 0.3, w / 2 - 0.25, 0.16, 1.0, -depth, 0);
    for (let x = -w / 2 + 0.45; x < w / 2 - 0.3; x += 0.18) p.box('frame', x, x + 0.025, 0.16, 0.95, -depth + 0.01, -depth + 0.035);
  }
}

function groundWall(p, look, w, h) {
  if (look.rollerDoor && w >= 4) {
    p.wallWithHole('wall', -w / 2, w / 2, 0, h, -1.6, 1.6, 0, 3.4);
    p.reveal('wall', -1.6, 1.6, 0, 3.4, 0.25, { bottom: false });
    p.quad('frame', [-1.6, 0, 0.25], [1.6, 0, 0.25], [1.6, 3.4, 0.25], [-1.6, 3.4, 0.25], [0, 0, -1]);
    for (let y = 0.2; y < 3.4; y += 0.25) p.box('frame', -1.6, 1.6, y, y + 0.03, 0.2, 0.25, { back: false });
    return;
  }
  const width = Math.min(look.window?.[0] ?? 1.6, w - 0.8);
  punchedWindow(p, { ...look, shutters: false }, -width / 2, width / 2, 1.0, 3.0, w, h);
  p.box('trim', -w / 2, w / 2, 0, 0.55, -0.06, 0, { back: false });
  p.box('trim', -w / 2, w / 2, 3.6, 3.72, -0.12, 0);
}

function groundShop(p, look, w, h) {
  const x0 = -w / 2 + 0.3;
  const x1 = w / 2 - 0.3;
  p.wallWithHole('wall', -w / 2, w / 2, 0, h, x0, x1, 0.45, 3.2);
  p.reveal('wall', x0, x1, 0.45, 3.2, 0.3);
  p.pane(x0, x1, 0.45, 3.2, 0.27);
  mullionGrid(p, x0, x1, 0.45, 3.2, 0.25, Math.max(1, Math.round((x1 - x0) / 1.2)));
  p.box('trim', -w / 2, w / 2, 0, 0.45, -0.05, 0, { back: false });
  p.box('trim', -w / 2, w / 2, 3.3, 4.1, -0.14, 0); // fascia for the shop sign
  if (look.shopAwning) {
    const d = look.shopAwning;
    p.slope('trim', x0, x1, 3.25, -0.05, 2.75, -d);
    p.box('trim', x0, x1, 2.55, 2.75, -d - 0.02, -d + 0.02);
  }
}

function entrance(p, look, w, h) {
  const x0 = -1.1;
  const x1 = 1.1;
  p.wallWithHole('wall', -w / 2, w / 2, 0, h, x0, x1, 0, 3.0);
  p.reveal('wall', x0, x1, 0, 3.0, 0.6, { bottom: false });
  p.quad('trim', [x0, 0.01, 0], [x0, 0.01, 0.6], [x1, 0.01, 0.6], [x1, 0.01, 0], [0, 1, 0]);
  p.pane(x0, x1, 0, 3.0, 0.58);
  mullionGrid(p, x0, x1, 0, 3.0, 0.56, 2);
  p.box('trim', -w / 2 + 0.2, w / 2 - 0.2, 3.15, 3.35, -1.5, 0); // canopy
  p.box('trim', -w / 2, w / 2, 3.6, 4.1, -0.1, 0);
}

function parapet(p, look, w, h) {
  p.box('wall', -w / 2, w / 2, 0, h - 0.1, -0.02, 0.25, { front: true, back: true, top: false });
  const c = look.parapetCoping ?? 0.08;
  p.box('trim', -w / 2, w / 2, h - 0.12, h + 0.04, -c, 0.3);
  if (look.speedLines) p.box('trim', -w / 2, w / 2, 0.25, 0.33, -0.08, 0);
}

function cornerPost(p, look, h, ground, top = false) {
  // Footprint x -0.25..0.25, z 0..0.5; street faces z = 0 (-Z) and x = +0.25 (+X).
  p.quad('wall', [-0.25, 0, 0], [0.25, 0, 0], [0.25, h, 0], [-0.25, h, 0], [0, 0, -1]);
  p.quad('wall', [0.25, 0, 0], [0.25, 0, 0.5], [0.25, h, 0.5], [0.25, h, 0], [1, 0, 0]);
  if (top) {
    const c = look.parapetCoping ?? 0.08;
    p.box('trim', -0.25 - 0.01, 0.25 + c, h - 0.12, h + 0.04, -c, 0.5 + 0.01);
    p.quad('wall', [-0.25, h - 0.12, 0.5], [-0.25, h - 0.12, 0], [-0.25, 0, 0], [-0.25, 0, 0.5], [-1, 0, 0]);
  } else if (ground) {
    p.box('trim', -0.27, 0.27, 0, 0.55, -0.06, 0.5);
  }
}

// ---- geometry writer --------------------------------------------------------------------------

/**
 * Collects triangles per role as flat arrays: position (3), normal (3), uv (2) per vertex.
 * UVs are metres on the face (u along it, v up or across), so tiled surfaces keep their scale.
 */
function createPartWriter() {
  const roles = {};
  const arrays = (role) => (roles[role] ??= { position: [], normal: [], uv: [] });
  const writer = {
    quad(role, a, b, c, d, n) {
      const out = arrays(role);
      // Wind the quad so its front face looks along n, whatever order the corners came in.
      const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
      const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
      const facing = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
      const order = facing >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
      for (const v of order) {
        out.position.push(v[0], v[1], v[2]);
        out.normal.push(n[0], n[1], n[2]);
        if (Math.abs(n[1]) > 0.5) out.uv.push(v[0], v[2]);
        else if (Math.abs(n[0]) > 0.5) out.uv.push(v[2], v[1]);
        else out.uv.push(v[0], v[1]);
      }
    },
    /** A box; faces default to all but the back (+Z, inside the building) and bottom. */
    box(role, x0, x1, y0, y1, z0, z1, faces = {}) {
      const f = { front: true, back: false, top: true, bottom: true, left: true, right: true, ...faces };
      if (f.front) writer.quad(role, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]);
      if (f.back) writer.quad(role, [x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1]);
      if (f.top) writer.quad(role, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]);
      if (f.bottom) writer.quad(role, [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, -1, 0]);
      if (f.left) writer.quad(role, [x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0]);
      if (f.right) writer.quad(role, [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0]);
    },
    /** The wall plane z = 0 around a rectangular opening. */
    wallWithHole(role, x0, x1, y0, y1, hx0, hx1, hy0, hy1) {
      const n = [0, 0, -1];
      const rect = (a, b, c, d) => { if (b > a + 1e-3 && d > c + 1e-3) writer.quad(role, [a, c, 0], [b, c, 0], [b, d, 0], [a, d, 0], n); };
      rect(x0, x1, hy1, y1);
      rect(x0, x1, y0, hy0);
      rect(x0, hx0, hy0, hy1);
      rect(hx1, x1, hy0, hy1);
    },
    /** The reveal of an opening: its four sides from the wall plane to depth d. */
    reveal(role, x0, x1, y0, y1, d, options = {}) {
      const { sides = true, bottom = true } = options;
      writer.quad(role, [x0, y1, 0], [x1, y1, 0], [x1, y1, d], [x0, y1, d], [0, -1, 0]);
      if (bottom) writer.quad(role, [x0, y0, d], [x1, y0, d], [x1, y0, 0], [x0, y0, 0], [0, 1, 0]);
      if (sides) {
        writer.quad(role, [x0, y0, d], [x0, y0, 0], [x0, y1, 0], [x0, y1, d], [1, 0, 0]);
        writer.quad(role, [x1, y0, 0], [x1, y0, d], [x1, y1, d], [x1, y1, 0], [-1, 0, 0]);
      }
    },
    /** A pane of glass at depth d, facing the street. */
    pane(x0, x1, y0, y1, d) {
      writer.quad('glass', [x0, y0, d], [x1, y0, d], [x1, y1, d], [x0, y1, d], [0, 0, -1]);
    },
    /** A sloped awning from (y0, z0) at the wall down to (y1, z1) at the street, with its underside. */
    slope(role, x0, x1, y0, z0, y1, z1) {
      const ny = z0 - z1;
      const nz = y0 - y1;
      const len = Math.hypot(ny, nz);
      writer.quad(role, [x0, y1, z1], [x1, y1, z1], [x1, y0, z0], [x0, y0, z0], [0, ny / len, -nz / len]);
      writer.quad(role, [x0, y0 - 0.03, z0], [x1, y0 - 0.03, z0], [x1, y1 - 0.03, z1], [x0, y1 - 0.03, z1], [0, -ny / len, nz / len]);
    },
    finish() {
      const parts = [];
      for (const [role, data] of Object.entries(roles)) {
        parts.push({ role, position: new Float32Array(data.position), normal: new Float32Array(data.normal), uv: new Float32Array(data.uv) });
      }
      return parts;
    },
  };
  return writer;
}

/**
 * @typedef {object} ProceduralKit
 * @property {string} id
 * @property {string} family
 * @property {boolean} procedural
 * @property {number} upper Upper storey height.
 * @property {Record<string, {slot: string, width: number, height: number,
 *   parts: {role: string, position: Float32Array, normal: Float32Array, uv: Float32Array}[]}>} modules
 */
