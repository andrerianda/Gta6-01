// Lettering and graphics painted on a 2D canvas at run time, with system fonts only: shop signs
// and billboards drawn from the brand catalog's data (name, slogan, three colours, sign style),
// street-name plates and licence plates. Each painter returns a `PaintedSign`: the colour canvas,
// an optional emissive canvas (neon tubes and light boxes at night) and its proportions.
// signMaterials.js turns a PaintedSign into a cached three.js material. Browser only (canvas).
//
//   const sign = paintBrandSign(BRANDS_AND_SIGNAGE.dos_soles_diner, SIGN_STYLES.neon_script, { aspect: 4 });
//   const plate = paintLicencePlate(generateLicencePlateText(random));

import { createSeededRandom } from '../../../core/random/seededRandom.js';

/**
 * @typedef {Object} PaintedSign
 * @property {HTMLCanvasElement | OffscreenCanvas} canvas Base colour (sRGB).
 * @property {HTMLCanvasElement | OffscreenCanvas | null} emissive What glows at night, or null.
 * @property {number} aspect Width over height.
 * @property {number} glow Emissive strength at full night (0 for an unlit sign).
 * @property {number} roughness A plausible roughness for the sign face.
 * @property {number} [widthMetres] Real width when the sign has one (plates).
 */

/**
 * Paints a shop sign for a brand: backing, an emblem built from the brand's initials and
 * colours, the name set in the sign style, and the slogan when the sign is tall enough.
 * @param {{id: string, name: string, slogan: string, colors: {primary: string, secondary: string, accent: string}}} brand
 *   An entry of BRANDS_AND_SIGNAGE.
 * @param {Object} style An entry of SIGN_STYLES (font with a `1em` size, letterSpacing, uppercase,
 *   glow, lit, weathered, outline, border, backing).
 * @param {Object} [options]
 * @param {number} [options.aspect] Width over height of the sign face (default 4).
 * @param {number} [options.width] Canvas width in pixels (default 1024).
 * @param {boolean} [options.emblem] Draw the emblem at the left (default true).
 * @param {boolean} [options.slogan] Draw the slogan under the name (default: when aspect < 3.5).
 * @param {number} [options.wear] 0..1 grime and streaks (default 0.6 for weathered styles, else 0.15).
 * @param {number | string} [options.seed]
 * @returns {PaintedSign}
 */
export function paintBrandSign(brand, style, options = {}) {
  const aspect = options.aspect ?? 4;
  const width = options.width ?? 1024;
  const height = Math.max(64, Math.round(width / aspect / 2) * 2);
  const random = createSeededRandom(`${brand.id}|sign|${options.seed ?? 0}`);
  const canvas = createSignCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const { primary, secondary, accent } = brand.colors;
  paintBacking(ctx, width, height, primary, accent, style);
  const pad = height * 0.13;
  let left = pad * 1.2;
  if (options.emblem !== false) {
    const radius = (height - pad * 2) / 2;
    paintBrandEmblem(ctx, brand, left + radius, height / 2, radius);
    left += radius * 2 + pad;
  }
  const withSlogan = options.slogan ?? aspect < 3.5;
  const nameBox = { x: left, y: pad, width: width - left - pad * 1.2, height: (height - pad * 2) * (withSlogan ? 0.62 : 1) };
  const sloganBox = { x: left, y: nameBox.y + nameBox.height + pad * 0.3, width: nameBox.width, height: (height - pad * 2) * 0.26 };
  let emissive = null;
  if (style.glow) {
    // Unlit tubes by day: pale glass over a faint tint of their colour.
    drawLettering(ctx, brand.name, style, nameBox, { fill: mixHex(secondary, primary, 0.55), outline: mixHex(secondary, '#ffffff', 0.5), outlineWidth: 0.035, shadow: true });
    emissive = createSignCanvas(width, height);
    const glow = emissive.getContext('2d');
    glow.fillStyle = '#000';
    glow.fillRect(0, 0, width, height);
    drawLettering(glow, brand.name, style, nameBox, { neon: secondary });
    if (withSlogan) drawLettering(glow, brand.slogan, SLOGAN_STYLE, sloganBox, { neon: accent });
  } else {
    drawLettering(ctx, brand.name, style, nameBox, { fill: secondary, outline: style.outline ? accent : null, outlineWidth: 0.1, shadow: true });
    if (style.lit === 'lightbox') emissive = canvas;
  }
  if (withSlogan) drawLettering(ctx, brand.slogan, SLOGAN_STYLE, sloganBox, { fill: mixHex(secondary, accent, 0.35) });
  paintGrime(ctx, width, height, random, options.wear ?? (style.weathered ? 0.6 : 0.15));
  return { canvas, emissive, aspect: width / height, glow: style.glow ? 1.8 : style.lit === 'lightbox' ? 0.45 : 0, roughness: style.glow ? 0.35 : style.weathered ? 0.85 : 0.5 };
}

/**
 * Paints a billboard poster: the emblem large in the left third, the name in the sign style,
 * the slogan below at 40 percent of the name's height (BILLBOARD_RULES.layout).
 * @param {Object} brand An entry of BRANDS_AND_SIGNAGE.
 * @param {Object} style An entry of SIGN_STYLES.
 * @param {Object} [options] `aspect` (default 2.9), `width` (default 1024), `wear`, `seed`.
 * @returns {PaintedSign}
 */
export function paintBillboard(brand, style, options = {}) {
  const aspect = options.aspect ?? 2.9;
  const width = options.width ?? 1024;
  const height = Math.round(width / aspect / 2) * 2;
  const random = createSeededRandom(`${brand.id}|billboard|${options.seed ?? 0}`);
  const canvas = createSignCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const { primary, secondary, accent } = brand.colors;
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, width, height);
  // A big disc of the accent colour rising behind the emblem, and a sweep across the bottom.
  ctx.fillStyle = mixHex(accent, primary, 0.25);
  ctx.beginPath();
  ctx.arc(width * 0.17, height * 0.62, height * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = mixHex(primary, '#000000', 0.18);
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(width, height);
  ctx.lineTo(width, height * 0.86);
  ctx.quadraticCurveTo(width * 0.5, height * 0.98, 0, height * 0.8);
  ctx.fill();
  paintBrandEmblem(ctx, brand, width * 0.17, height * 0.5, height * 0.33);
  const nameBox = { x: width * 0.36, y: height * 0.16, width: width * 0.6, height: height * 0.4 };
  const name = drawLettering(ctx, brand.name, style, nameBox, { fill: secondary, outline: style.outline ? accent : null, outlineWidth: 0.1, shadow: true });
  const sloganHeight = Math.min(height * 0.16, name.inkHeight * 0.4 + height * 0.04);
  drawLettering(ctx, brand.slogan, SLOGAN_STYLE, { x: nameBox.x, y: height * 0.64, width: nameBox.width, height: sloganHeight }, { fill: mixHex(secondary, primary, 0.15) });
  // Paper seams of the poster sheets and a thin trim.
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 1;
  for (let sheet = 1; sheet < 6; sheet += 1) ctx.strokeRect(Math.round((width * sheet) / 6) + 0.5, -2, 0, height + 4);
  ctx.strokeStyle = '#2a2c2e';
  ctx.lineWidth = height * 0.03;
  ctx.strokeRect(0, 0, width, height);
  paintGrime(ctx, width, height, random, options.wear ?? 0.25);
  return { canvas, emissive: null, aspect: width / height, glow: 0, roughness: 0.6 };
}

/**
 * Paints a street-name plate: enamel in a deep colour, a white rule and the name in capitals.
 * @param {string} name The street's name ("Bulevar Dorado").
 * @param {Object} [options]
 * @param {string} [options.color] Enamel colour (default a deep green).
 * @param {string} [options.district] A small second line (the district's name).
 * @returns {PaintedSign} 0.9 m wide.
 */
export function paintStreetNamePlate(name, options = {}) {
  const width = 512;
  const height = 128;
  const canvas = createSignCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const enamel = options.color ?? '#12553d';
  ctx.fillStyle = enamel;
  ctx.fillRect(0, 0, width, height);
  const sheen = ctx.createLinearGradient(0, 0, 0, height);
  sheen.addColorStop(0, 'rgba(255,255,255,0.14)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#e9e6dc';
  ctx.lineWidth = 5;
  roundedRect(ctx, 9, 9, width - 18, height - 18, 12);
  ctx.stroke();
  const style = { font: '700 1em "Gill Sans", "Trebuchet MS", "DejaVu Sans", sans-serif', letterSpacing: 0.06, uppercase: true };
  const nameHeight = options.district ? 52 : 68;
  drawLettering(ctx, name, style, { x: 30, y: options.district ? 22 : 30, width: width - 60, height: nameHeight }, { fill: '#eeebe2' });
  if (options.district) drawLettering(ctx, options.district, { ...style, font: style.font.replace('700', '500'), letterSpacing: 0.2 }, { x: 60, y: 84, width: width - 120, height: 20 }, { fill: '#cfd8cf' });
  paintGrime(ctx, width, height, createSeededRandom(`${name}|plate`), 0.2);
  return { canvas, emissive: null, aspect: width / height, glow: 0, roughness: 0.3, widthMetres: 0.9 };
}

/**
 * Paints a vehicle licence plate of the city: embossed dark characters on a pale reflective
 * sheet under a sunset band with the region's name.
 * @param {string} text The registration ("MZL 4821"); see generateLicencePlateText.
 * @param {Object} [options]
 * @param {string} [options.region] The name across the top (default MARAZUL).
 * @param {string} [options.motto] The line at the bottom (default COSTA DORADA).
 * @param {'private' | 'taxi' | 'official'} [options.series] Changes the sheet and ink colours.
 * @returns {PaintedSign} 0.305 m wide (aspect 2).
 */
export function paintLicencePlate(text, options = {}) {
  const width = 512;
  const height = 256;
  const canvas = createSignCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const series = { private: ['#e9e5d8', '#15294b'], taxi: ['#e8c23a', '#1b1b1d'], official: ['#dfe6ea', '#7a1f25'] }[options.series ?? 'private'];
  const [sheet, ink] = series;
  roundedRect(ctx, 0, 0, width, height, 26);
  ctx.fillStyle = sheet;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const band = ctx.createLinearGradient(0, 0, width, 0);
  band.addColorStop(0, '#ef8f86');
  band.addColorStop(0.55, '#f4bd72');
  band.addColorStop(1, '#f1d9a0');
  ctx.fillStyle = band;
  ctx.globalAlpha = options.series === 'taxi' ? 0 : 0.9;
  ctx.fillRect(0, 0, width, 62);
  ctx.globalAlpha = 1;
  ctx.restore();
  const caps = { font: '800 1em "DIN Alternate", "Arial Narrow", "Liberation Sans Narrow", "DejaVu Sans Condensed", Arial, sans-serif', uppercase: true };
  drawLettering(ctx, options.region ?? 'Marazul', { ...caps, letterSpacing: 0.32 }, { x: 110, y: 17, width: width - 220, height: 30 }, { fill: ink });
  // Embossed characters: a shadow below and to the right, a highlight above and to the left.
  const box = { x: 34, y: 78, width: width - 68, height: 112 };
  ctx.save();
  ctx.translate(3, 3);
  drawLettering(ctx, text, { ...caps, letterSpacing: 0.07 }, box, { fill: 'rgba(0,0,0,0.3)' });
  ctx.translate(-5, -5);
  drawLettering(ctx, text, { ...caps, letterSpacing: 0.07 }, box, { fill: 'rgba(255,255,255,0.75)' });
  ctx.restore();
  drawLettering(ctx, text, { ...caps, letterSpacing: 0.07 }, box, { fill: ink });
  drawLettering(ctx, options.motto ?? 'Costa Dorada', { ...caps, font: caps.font.replace('800', '600'), letterSpacing: 0.25 }, { x: 130, y: 208, width: width - 260, height: 20 }, { fill: ink });
  ctx.strokeStyle = ink;
  ctx.lineWidth = 6;
  roundedRect(ctx, 9, 9, width - 18, height - 18, 19);
  ctx.stroke();
  for (const [x, y] of [[60, 34], [width - 60, 34], [60, height - 30], [width - 60, height - 30]]) {
    ctx.fillStyle = 'rgba(40,40,44,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(x - 2, y - 2, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  paintGrime(ctx, width, height, createSeededRandom(`${text}|plate`), options.wear ?? 0.3);
  return { canvas, emissive: null, aspect: 2, glow: 0, roughness: 0.35, widthMetres: 0.305 };
}

/**
 * Makes up a registration in the city's format, three letters and four digits ("MZL 4821").
 * @param {{int: (min: number, max: number) => number, pick: (items: any[]) => any}} random A seeded generator.
 * @returns {string}
 */
export function generateLicencePlateText(random) {
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  let text = '';
  for (let i = 0; i < 3; i += 1) text += letters[random.int(0, letters.length - 1)];
  return `${text} ${String(random.int(0, 9999)).padStart(4, '0')}`;
}

/** A canvas of the given size (a DOM canvas when there is a document, else an OffscreenCanvas). */
export function createSignCanvas(width, height) {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return new OffscreenCanvas(width, height);
}

const SLOGAN_STYLE = Object.freeze({ font: 'italic 500 1em Georgia, "Times New Roman", "DejaVu Serif", serif', letterSpacing: 0.04 });

/**
 * Sets one line of text into a box: the largest size at which the inked text fits, centred,
 * with tracking, and painted as a fill with optional outline and drop shadow, or as neon tubes.
 * @returns {{size: number, inkWidth: number, inkHeight: number}}
 */
function drawLettering(ctx, text, style, box, paint) {
  const label = style.uppercase ? text.toUpperCase() : text;
  const tracking = style.letterSpacing ?? 0;
  const fontAt = (size) => style.font.replace('1em', `${size}px`);
  const track = (size) => {
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(tracking * size).toFixed(2)}px`;
  };
  ctx.font = fontAt(100);
  track(100);
  const metrics = ctx.measureText(label);
  const inkWidth = Math.max(1, metrics.width - tracking * 100);
  const ascent = metrics.actualBoundingBoxAscent || 72;
  const descent = metrics.actualBoundingBoxDescent || 0;
  const size = Math.max(6, Math.floor(100 * Math.min(box.width / inkWidth, box.height / (ascent + descent))));
  const scale = size / 100;
  ctx.font = fontAt(size);
  track(size);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const x = box.x + (box.width - inkWidth * scale) / 2;
  const y = box.y + (box.height + (ascent - descent) * scale) / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  if (paint.neon) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = paint.neon;
    ctx.shadowColor = paint.neon;
    ctx.lineWidth = Math.max(2, size * 0.05);
    ctx.shadowBlur = size * 0.4;
    ctx.strokeText(label, x, y);
    ctx.shadowBlur = size * 0.14;
    ctx.strokeText(label, x, y);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(1, size * 0.016);
    ctx.strokeText(label, x, y);
  } else {
    if (paint.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = size * 0.06;
      ctx.shadowOffsetX = size * 0.03;
      ctx.shadowOffsetY = size * 0.045;
    }
    if (paint.outline) {
      ctx.strokeStyle = paint.outline;
      ctx.lineWidth = size * (paint.outlineWidth ?? 0.08);
      ctx.strokeText(label, x, y);
      ctx.shadowColor = 'rgba(0,0,0,0)';
    }
    ctx.fillStyle = paint.fill;
    ctx.fillText(label, x, y);
  }
  ctx.restore();
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  return { size, inkWidth: inkWidth * scale, inkHeight: (ascent + descent) * scale };
}

/** The sign's face: the brand's primary colour with a soft sheen, a rule or deco speed lines. */
function paintBacking(ctx, width, height, primary, accent, style) {
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, width, height);
  const sheen = ctx.createLinearGradient(0, 0, 0, height);
  sheen.addColorStop(0, 'rgba(255,255,255,0.1)');
  sheen.addColorStop(0.45, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);
  if (style.backing === 'facade' || style.backing === 'metal_or_shutter' || style.backing === 'none') return;
  ctx.strokeStyle = accent;
  if (style.backing === 'stepped_fin') {
    ctx.lineWidth = Math.max(2, height * 0.022);
    for (let line = 0; line < 3; line += 1) {
      const y = height * (0.08 + line * 0.045);
      ctx.strokeRect(-4, y, width + 8, 0);
      ctx.strokeRect(-4, height - y, width + 8, 0);
    }
    return;
  }
  ctx.lineWidth = Math.max(2, height * 0.03);
  const inset = height * 0.055;
  roundedRect(ctx, inset, inset, width - inset * 2, height - inset * 2, height * 0.06);
  ctx.stroke();
}

/**
 * The brand's emblem, built from data: a shape chosen by the brand's id in the accent colour,
 * a ring, and the initials of the name in the primary colour.
 */
function paintBrandEmblem(ctx, brand, cx, cy, radius) {
  const random = createSeededRandom(`${brand.id}|emblem`);
  const shape = random.pick(['roundel', 'shield', 'diamond', 'sunburst', 'tile']);
  const { primary, secondary, accent } = brand.colors;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = accent;
  ctx.strokeStyle = secondary;
  ctx.lineWidth = radius * 0.09;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (shape === 'shield') {
    ctx.moveTo(-radius * 0.8, -radius * 0.9);
    ctx.lineTo(radius * 0.8, -radius * 0.9);
    ctx.lineTo(radius * 0.8, radius * 0.1);
    ctx.quadraticCurveTo(radius * 0.7, radius * 0.8, 0, radius);
    ctx.quadraticCurveTo(-radius * 0.7, radius * 0.8, -radius * 0.8, radius * 0.1);
    ctx.closePath();
  } else if (shape === 'diamond') {
    ctx.moveTo(0, -radius);
    ctx.lineTo(radius, 0);
    ctx.lineTo(0, radius);
    ctx.lineTo(-radius, 0);
    ctx.closePath();
  } else if (shape === 'sunburst') {
    for (let ray = 0; ray < 32; ray += 1) {
      const reach = radius * (ray % 2 === 0 ? 1 : 0.8);
      const angle = (ray / 32) * Math.PI * 2;
      ctx.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
    }
    ctx.closePath();
  } else if (shape === 'tile') {
    ctx.roundRect(-radius * 0.9, -radius * 0.9, radius * 1.8, radius * 1.8, radius * 0.28);
  } else {
    ctx.arc(0, 0, radius * 0.96, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, radius * (shape === 'diamond' ? 0.46 : 0.62), 0, Math.PI * 2);
  ctx.lineWidth = radius * 0.04;
  ctx.stroke();
  ctx.restore();
  const small = new Set(['the', 'el', 'la', 'los', 'las', 'de', 'del', 'y', 'of', '&', 'and']);
  const words = brand.name.split(/\s+/).filter((word) => !small.has(word.toLowerCase()));
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? brand.name).slice(0, 1)).toUpperCase();
  const reach = radius * (shape === 'diamond' ? 0.36 : 0.46);
  drawLettering(ctx, initials, { font: '800 1em Georgia, "DejaVu Serif", serif' }, { x: cx - reach, y: cy - reach, width: reach * 2, height: reach * 2 }, { fill: primary, outline: secondary, outlineWidth: 0.06 });
}

/** Grime: rain streaks running down from the top edge, dust at the bottom and a few specks. */
function paintGrime(ctx, width, height, random, amount) {
  if (amount <= 0) return;
  ctx.save();
  const streaks = Math.round(width / 40 * amount * 2);
  for (let i = 0; i < streaks; i += 1) {
    const x = random.range(0, width);
    const length = height * random.range(0.25, 1);
    const streak = ctx.createLinearGradient(0, 0, 0, length);
    streak.addColorStop(0, `rgba(52,44,34,${(0.22 * amount).toFixed(3)})`);
    streak.addColorStop(1, 'rgba(52,44,34,0)');
    ctx.fillStyle = streak;
    ctx.fillRect(x, 0, random.range(1.5, 7), length);
  }
  const dust = ctx.createLinearGradient(0, height * 0.7, 0, height);
  dust.addColorStop(0, 'rgba(120,104,80,0)');
  dust.addColorStop(1, `rgba(120,104,80,${(0.3 * amount).toFixed(3)})`);
  ctx.fillStyle = dust;
  ctx.fillRect(0, height * 0.7, width, height * 0.3);
  const specks = Math.round(width * height / 900 * amount);
  for (let i = 0; i < specks; i += 1) {
    ctx.fillStyle = random.chance(0.6) ? `rgba(40,34,28,${random.range(0.08, 0.3).toFixed(3)})` : `rgba(255,255,255,${random.range(0.05, 0.16).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(random.range(0, width), random.range(0, height), random.range(0.6, 3.5), random.range(0.6, 2.4), random.range(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

/** Mixes two `#rrggbb` colours in sRGB (good enough for sign inks) and returns a CSS colour. */
function mixHex(from, to, t) {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const channel = (shift) => Math.round(((a >> shift) & 255) + ((((b >> shift) & 255) - ((a >> shift) & 255)) * t));
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}
