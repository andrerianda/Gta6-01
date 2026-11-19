// Point-of-interest icons drawn by code on a 2D canvas, shared by the radar, the city map and its
// legend: a soft drop shadow, a coloured disc with a cream rim, and a glyph (a cross for the
// hospital, a shield for the police, a house for the safehouse, or a letter for shops and mission
// givers). Drawing allocates nothing; the caller sets context.font for letters.

/** Icon styles by kind: disc colour, glyph ('cross', 'shield', 'house', 'letter'), glyph ink. */
export const MAP_ICON_STYLES = Object.freeze({
  hospital: Object.freeze({ fill: '#e5484d', glyph: 'cross', ink: '#ffffff', label: 'Hospital' }),
  police: Object.freeze({ fill: '#3d6fe0', glyph: 'shield', ink: '#ffffff', label: 'Police station' }),
  safehouse: Object.freeze({ fill: '#2f9e64', glyph: 'house', ink: '#ffffff', label: 'Safehouse' }),
  giver: Object.freeze({ fill: '#ffcf5a', glyph: 'letter', ink: '#2a1d10', label: 'Mission' }),
  shop: Object.freeze({ fill: '#ff8a5c', glyph: 'letter', ink: '#1d1b19', label: 'Shop' }),
  airbase: Object.freeze({ fill: '#56633f', glyph: 'letter', ink: '#ffffff', label: 'Air base' }),
  radar: Object.freeze({ fill: '#5b6472', glyph: 'letter', ink: '#ffffff', label: 'Radar station' }),
});

/**
 * Draws one icon centred on (x, y).
 * @param {CanvasRenderingContext2D} context
 * @param {string} kind A MAP_ICON_STYLES key.
 * @param {number} x
 * @param {number} y
 * @param {number} radius Disc radius in canvas pixels.
 * @param {string} [letter] The letter of a 'letter' glyph.
 * @param {string} [fill] Overrides the disc colour (shop kinds).
 */
export function drawMapIcon(context, kind, x, y, radius, letter = '', fill = '') {
  const style = MAP_ICON_STYLES[kind] ?? MAP_ICON_STYLES.shop;
  const u = radius;
  context.beginPath();
  context.arc(x + u * 0.12, y + u * 0.2, u * 1.08, 0, Math.PI * 2);
  context.fillStyle = 'rgba(8, 10, 14, 0.4)';
  context.fill();
  context.beginPath();
  context.arc(x, y, u, 0, Math.PI * 2);
  context.fillStyle = fill || style.fill;
  context.fill();
  context.lineWidth = Math.max(1, u * 0.2);
  context.strokeStyle = '#fff6e6';
  context.stroke();
  context.fillStyle = style.ink;
  context.beginPath();
  switch (style.glyph) {
    case 'cross':
      context.rect(x - u * 0.2, y - u * 0.58, u * 0.4, u * 1.16);
      context.rect(x - u * 0.58, y - u * 0.2, u * 1.16, u * 0.4);
      context.fill();
      break;
    case 'shield':
      context.moveTo(x, y - u * 0.62);
      context.lineTo(x + u * 0.5, y - u * 0.42);
      context.lineTo(x + u * 0.45, y + u * 0.12);
      context.quadraticCurveTo(x + u * 0.3, y + u * 0.48, x, y + u * 0.64);
      context.quadraticCurveTo(x - u * 0.3, y + u * 0.48, x - u * 0.45, y + u * 0.12);
      context.lineTo(x - u * 0.5, y - u * 0.42);
      context.closePath();
      context.fill();
      context.beginPath();
      context.arc(x, y - u * 0.02, u * 0.17, 0, Math.PI * 2);
      context.fillStyle = fill || style.fill;
      context.fill();
      break;
    case 'house':
      context.moveTo(x, y - u * 0.62);
      context.lineTo(x + u * 0.62, y - u * 0.04);
      context.lineTo(x + u * 0.42, y - u * 0.04);
      context.lineTo(x + u * 0.42, y + u * 0.55);
      context.lineTo(x - u * 0.42, y + u * 0.55);
      context.lineTo(x - u * 0.42, y - u * 0.04);
      context.lineTo(x - u * 0.62, y - u * 0.04);
      context.closePath();
      context.fill();
      context.fillStyle = fill || style.fill;
      context.fillRect(x - u * 0.12, y + u * 0.14, u * 0.24, u * 0.41);
      break;
    default:
      if (letter) context.fillText(letter, x, y + u * 0.06);
  }
}
