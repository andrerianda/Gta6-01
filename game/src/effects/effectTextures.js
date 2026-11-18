// The textures of the world effects, painted by code once at start on canvases: a 4 x 4 particle
// atlas (smoke puffs, flame tongues, a fireball billow, glow, spark, dust, spray, debris chip,
// muzzle star, mist, shock ring, ember) and a 2 x 2 decal atlas (scorch, skid streak, bullet
// hole, blood). Particle cells: alpha is the density, red a brightness detail, green the heat
// (hot core of a flame). Decal cells: rgb is the colour the surface is multiplied by, alpha the
// coverage. Cells are listed in effectCatalogue.js (PARTICLE_CELLS, DECAL_CELLS).

import * as THREE from 'three';

/**
 * Paints both atlases.
 * @param {Document} document The page's document (for the canvases).
 * @param {number} [cellSize] Pixels per particle cell; 256 by default, 128 on low quality.
 * @returns {{particles: THREE.Texture, decals: THREE.Texture}}
 */
export function createEffectTextures(document, cellSize = 256) {
  const noise = createValueNoise(9173);
  const particles = paintAtlas(document, 4, cellSize, (cell, u, v, out) => paintParticleCell(cell, u, v, out, noise));
  const decals = paintAtlas(document, 2, cellSize, (cell, u, v, out) => paintDecalCell(cell, u, v, out, noise));
  for (const texture of [particles, decals]) {
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
  }
  return { particles, decals };
}

function paintAtlas(document, grid, cellSize, paint) {
  const size = grid * cellSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const image = g.createImageData(size, size);
  const data = image.data;
  const out = [0, 0, 0, 0];
  const margin = 2 / cellSize; // keep a clear border so mipmaps do not bleed between cells
  for (let cell = 0; cell < grid * grid; cell += 1) {
    const cx = cell % grid;
    const cy = Math.floor(cell / grid);
    for (let py = 0; py < cellSize; py += 1) {
      // canvas rows run downward; the texture is flipped so that v = 1 is the top of the cell
      const v = 1 - (py + 0.5) / cellSize;
      for (let px = 0; px < cellSize; px += 1) {
        const u = (px + 0.5) / cellSize;
        out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0;
        if (u > margin && u < 1 - margin && v > margin && v < 1 - margin) paint(cell, u, v, out);
        const o = ((cy * cellSize + py) * size + cx * cellSize + px) * 4;
        data[o] = clamp255(out[0]); data[o + 1] = clamp255(out[1]);
        data[o + 2] = clamp255(out[2]); data[o + 3] = clamp255(out[3]);
      }
    }
  }
  g.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

/** Cells: rows from the top of the canvas, so cell 0 is at the top left (u 0..0.25, v 0.75..1). */
function paintParticleCell(cell, u, v, out, noise) {
  const x = u * 2 - 1;
  const y = v * 2 - 1;
  const r = Math.sqrt(x * x + y * y);
  if (cell <= 3) return smokePuff(cell + 1, x, y, r, out, noise, 9, 1);
  if (cell === 4 || cell === 5) return flameTongue(cell, x, y, out, noise);
  if (cell === 6) return smokePuff(11, x, y, r, out, noise, 16, 0.6);
  if (cell === 7) { const a = Math.exp(-r * r * 5.5) * (1 - smooth(0.85, 1, r)); set(out, 1, 1, 1, a); return; }
  if (cell === 8) { const a = Math.exp(-r * r * 18) + 0.4 * Math.exp(-r * r * 4); set(out, 1, 1, 1, Math.min(1, a) * (1 - smooth(0.8, 1, r))); return; }
  if (cell === 9) {
    const n = fbm(noise, x * 2.2 + 31, y * 3.4 + 7, 4);
    const a = Math.max(0, (1 - smooth(0.25, 0.95, r)) * (n * 1.6 - 0.35));
    set(out, 0.75 + 0.25 * n, 0, 1, a * 0.9);
    return;
  }
  if (cell === 10) return sprayDroplets(x, y, r, out, noise);
  if (cell === 11) {
    const angle = Math.atan2(y, x);
    const edge = 0.55 + 0.25 * noise(Math.cos(angle) * 2.3 + 5, Math.sin(angle) * 2.3 + 9) + 0.12 * Math.cos(angle * 3);
    const a = 1 - smooth(edge - 0.05, edge, r);
    set(out, 0.6 + 0.4 * fbm(noise, x * 6, y * 6, 2), 0, 1, a);
    return;
  }
  if (cell === 12) {
    const ax = Math.abs(x); const ay = Math.abs(y);
    const ray = Math.max(Math.exp(-ay * 16 - ax * ax * 3), Math.exp(-ax * 16 - ay * ay * 3));
    const diag = 0.5 * Math.max(Math.exp(-Math.abs(x - y) * 14 - r * r * 6), Math.exp(-Math.abs(x + y) * 14 - r * r * 6));
    const core = Math.exp(-r * r * 14);
    const a = Math.min(1, ray + diag + core) * (1 - smooth(0.85, 1, r));
    set(out, 1, core, 1, a);
    return;
  }
  if (cell === 13) {
    const speck = noise(x * 18 + 3, y * 18 + 1);
    const a = (1 - smooth(0.2, 0.95, r)) * (0.35 + 0.65 * smooth(0.55, 0.8, speck));
    set(out, 0.8, 0, 1, a);
    return;
  }
  if (cell === 14) { const d = (r - 0.8) / 0.07; set(out, 1, 0, 1, Math.exp(-d * d) * (0.7 + 0.3 * noise(x * 8, y * 8))); return; }
  const a = Math.exp(-r * r * 9) * (1 - smooth(0.7, 1, r));
  set(out, 1, 1, 1, a);
}

/**
 * A billowing puff: a union of round lobes (a cauliflower), its edge torn by noise. Red is the
 * height of the lobes, from which the particle shader derives a bumpy normal so that each lobe
 * is lit on its own; alpha is the density, thinner at the torn edge.
 */
function smokePuff(seed, x, y, r, out, noise, lobes, erosion) {
  const wx = x + (noise(x * 3.1 + seed * 5, y * 3.1) - 0.5) * 0.22;
  const wy = y + (noise(x * 3.1 - 7, y * 3.1 + seed * 3) - 0.5) * 0.22;
  let height = 0;
  for (let k = 0; k < lobes; k += 1) {
    const a = seed * 1.7 + k * 2.39996;
    const along = k === 0 ? 0 : 0.12 + 0.48 * Math.sqrt(frac(Math.sin(seed * 12.9 + k * 78.2) * 43758.5));
    const cx = Math.cos(a) * along;
    const cy = Math.sin(a) * along * 0.85;
    const rad = (0.17 + 0.2 * frac(Math.sin(seed * 4.1 + k * 19.3) * 24634.6)) * (1.15 - along * 0.6);
    const q = ((wx - cx) * (wx - cx) + (wy - cy) * (wy - cy)) / (rad * rad);
    if (q < 1) height = Math.max(height, Math.sqrt(1 - q) * rad * 2.4 + (0.4 - along) * 0.5);
  }
  const n = fbm(noise, x * 5 + seed * 7.3, y * 5 - seed * 3.1, 4);
  const torn = height - (1 - n) * 0.28 * erosion;
  const density = smooth(0, 0.42, torn) * (0.7 + 0.3 * n) * (1 - smooth(0.8, 0.99, r));
  set(out, Math.min(1, Math.max(0, height * 0.85 + (n - 0.5) * 0.25)), 0, 1, density);
}

/** A licking flame: a teardrop with its tip up, torn by turbulence that grows with height. */
function flameTongue(cell, x, y, out, noise) {
  const h = (y + 1) * 0.5; // 0 at the bottom, 1 at the top
  const seed = cell === 4 ? 0 : 17;
  const sway = (fbm(noise, h * 2.5 + seed, seed * 0.3, 3) - 0.5) * 0.55 * h;
  const width = 0.62 * Math.pow(Math.max(0, 1 - h), 0.75) * smooth(0, 0.22, h) + 0.04;
  const dx = (x - sway) / width;
  const n = fbm(noise, x * 4 + seed, y * 3.2 - seed, 4);
  const body = 1 - smooth(0.55, 1.05, Math.abs(dx) + (n - 0.5) * 0.9 * (0.3 + h));
  const tipCut = 1 - smooth(0.7, 0.98, h + (n - 0.5) * 0.35);
  const a = Math.max(0, body * tipCut);
  const heat = Math.max(0, 1 - Math.abs(dx) * 0.9) * (1 - h * 0.85);
  set(out, 0.75 + 0.25 * n, heat, 1, a);
}

function sprayDroplets(x, y, r, out, noise) {
  let a = 0;
  for (let k = 0; k < 18; k += 1) {
    const ang = k * 2.39996;
    const d = 0.75 * Math.sqrt(frac(Math.sin(k * 91.7) * 4375.85));
    const cx = Math.cos(ang) * d; const cy = Math.sin(ang) * d;
    const rad = 0.035 + 0.05 * frac(Math.sin(k * 13.1) * 9631.2);
    const q = Math.hypot(x - cx, y - cy) / rad;
    a = Math.max(a, 1 - smooth(0.6, 1, q));
  }
  const mist = (1 - smooth(0.1, 0.9, r)) * 0.35 * fbm(noise, x * 3 + 50, y * 3, 3);
  set(out, 0.9, 0, 1, Math.min(1, a * 0.85 + mist));
}

function paintDecalCell(cell, u, v, out, noise) {
  const x = u * 2 - 1;
  const y = v * 2 - 1;
  const r = Math.sqrt(x * x + y * y);
  if (cell === 0) {
    const angle = Math.atan2(y, x);
    const streaks = 0.5 + 0.5 * noise(Math.cos(angle) * 6 + 3, Math.sin(angle) * 6 + 3);
    const n = fbm(noise, x * 4, y * 4, 4);
    const edge = 0.62 + 0.28 * streaks + (n - 0.5) * 0.3;
    const a = 1 - smooth(edge * 0.55, edge, r);
    const dark = 0.05 + 0.5 * smooth(0, edge, r) + 0.15 * n;
    set(out, dark * 1.05, dark * 0.95, dark * 0.85, a);
    return;
  }
  if (cell === 1) {
    // across the streak (x): two soft shoulders and tread grooves; along it (y): uneven rubber
    const across = 1 - smooth(0.6, 0.95, Math.abs(x));
    const tread = 0.75 + 0.25 * Math.cos(x * 22);
    const along = 0.65 + 0.35 * fbm(noise, x * 3, y * 10, 3);
    const a = across * tread * along;
    set(out, 0.16, 0.16, 0.17, a * 0.85);
    return;
  }
  if (cell === 2) {
    const angle = Math.atan2(y, x);
    const cracks = smooth(0.7, 0.95, noise(Math.cos(angle) * 9 + 1, Math.sin(angle) * 9 + 1)) * (1 - smooth(0.3, 0.75, r));
    const hole = 1 - smooth(0.12, 0.2, r);
    const ring = (1 - smooth(0.2, 0.5, r)) * 0.55;
    const a = Math.min(1, hole + ring + cracks * 0.7);
    const dark = hole > 0.5 ? 0.04 : 0.42;
    set(out, dark, dark, dark, a);
    return;
  }
  let a = 0;
  const n = fbm(noise, x * 3 + 20, y * 3, 4);
  a = 1 - smooth(0.35, 0.55, r + (n - 0.5) * 0.5);
  for (let k = 0; k < 9; k += 1) {
    const ang = k * 2.1 + 0.4;
    const d = 0.5 + 0.35 * frac(Math.sin(k * 47.3) * 4375.85);
    const q = Math.hypot(x - Math.cos(ang) * d, y - Math.sin(ang) * d) / (0.04 + 0.05 * frac(k * 0.37));
    a = Math.max(a, 1 - smooth(0.7, 1, q));
  }
  set(out, 0.42, 0.03, 0.03, a * 0.95);
}

function set(out, r, g, b, a) {
  out[0] = r * 255; out[1] = g * 255; out[2] = b * 255; out[3] = a * 255;
}

function clamp255(value) {
  return value <= 0 ? 0 : value >= 255 ? 255 : value;
}

function smooth(e0, e1, value) {
  const t = Math.min(1, Math.max(0, (value - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function frac(value) {
  return value - Math.floor(value);
}

function fbm(noise, x, y, octaves) {
  let sum = 0; let amp = 0.5; let f = 1; let norm = 0;
  for (let o = 0; o < octaves; o += 1) {
    sum += noise(x * f, y * f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/** Smooth 2D value noise in 0..1 from a seeded lattice. */
function createValueNoise(seed) {
  const size = 256;
  const values = new Float32Array(size * size);
  let s = seed >>> 0;
  for (let i = 0; i < values.length; i += 1) {
    s = (s * 1664525 + 1013904223) >>> 0;
    values[i] = s / 4294967296;
  }
  return (x, y) => {
    const xf = Math.floor(x); const yf = Math.floor(y);
    const tx = x - xf; const ty = y - yf;
    const x0 = xf & 255; const y0 = yf & 255;
    const x1 = (x0 + 1) & 255; const y1 = (y0 + 1) & 255;
    const sx = tx * tx * (3 - 2 * tx); const sy = ty * ty * (3 - 2 * ty);
    const a = values[y0 * size + x0]; const b = values[y0 * size + x1];
    const c = values[y1 * size + x0]; const d = values[y1 * size + x1];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}
