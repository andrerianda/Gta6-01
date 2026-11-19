// The legend panel of the full-screen city map: one row per symbol (you, the GPS routes to the
// waypoint and the objective, mission givers, safehouses, hospitals, police stations, shops,
// sights), each with its symbol drawn by the same code as the map, so the two always agree.
import { drawMapIcon, MAP_ICON_STYLES } from './mapIconPainter.js';
import { createHudElement } from './hudElements.js';

const SWATCH = 22;            // swatch size in CSS pixels

/** The legend rows: label and how to draw the swatch. */
const LEGEND_ROWS = Object.freeze([
  ['You', 'arrow'], ['Route to waypoint', 'route:#e0408a'], ['Route to objective', 'route:#ffcf4a'],
  [MAP_ICON_STYLES.giver.label, 'icon:giver'], [MAP_ICON_STYLES.safehouse.label, 'icon:safehouse'],
  [MAP_ICON_STYLES.hospital.label, 'icon:hospital'], [MAP_ICON_STYLES.police.label, 'icon:police'],
  ['Shops and services', 'icon:shop'], ['Sights', 'sight'],
]);

/**
 * Draws a legend swatch (also used by the map for the sights' star).
 * @param {CanvasRenderingContext2D} context
 * @param {string} what 'arrow', 'route:<colour>', 'icon:<kind>' or 'sight'.
 * @param {number} x Centre.
 * @param {number} y
 * @param {number} size Half the swatch.
 */
export function drawLegendSymbol(context, what, x, y, size) {
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  if (what === 'arrow') {
    context.beginPath();
    context.moveTo(x, y - size * 0.8); context.lineTo(x + size * 0.55, y + size * 0.7);
    context.lineTo(x, y + size * 0.35); context.lineTo(x - size * 0.55, y + size * 0.7);
    context.closePath();
    context.fillStyle = '#fff6e6';
    context.fill();
    context.lineWidth = 1.6;
    context.strokeStyle = '#e8573f';
    context.stroke();
  } else if (what.startsWith('route:')) {
    context.beginPath();
    context.moveTo(x - size * 0.8, y + size * 0.3);
    context.lineTo(x - size * 0.1, y - size * 0.2);
    context.lineTo(x + size * 0.8, y - size * 0.1);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 6;
    context.strokeStyle = 'rgba(16, 10, 24, 0.7)';
    context.stroke();
    context.lineWidth = 3.5;
    context.strokeStyle = what.slice(6);
    context.stroke();
  } else if (what.startsWith('icon:')) {
    const kind = what.slice(5);
    context.font = `800 ${Math.round(size * 0.95)}px "Segoe UI", Arial, sans-serif`;
    drawMapIcon(context, kind, x, y, size * 0.72, kind === 'giver' ? '!' : kind === 'shop' ? '$' : '', kind === 'shop' ? '#9fe39a' : '');
  } else {
    context.beginPath();
    for (let k = 0; k < 10; k += 1) {
      const r = (k % 2 ? 0.32 : 0.75) * size;
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      context.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    context.closePath();
    context.fillStyle = '#ffe2a8';
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = 'rgba(20, 16, 12, 0.85)';
    context.stroke();
  }
}

/**
 * Builds the legend panel into the city map container.
 * @param {Document} document
 * @param {HTMLElement} container `city-map-screen`.
 * @returns {HTMLElement} The panel.
 */
export function createCityMapLegend(document, container) {
  const panel = createHudElement(document, 'div', 'city-map-legend', container);
  createHudElement(document, 'strong', 'city-map-legend-title', panel).textContent = 'Legend';
  const ratio = Math.min(2, document.defaultView?.devicePixelRatio || 1);
  for (const [label, what] of LEGEND_ROWS) {
    const row = createHudElement(document, 'div', 'city-map-legend-row', panel);
    const swatch = createHudElement(document, 'canvas', 'city-map-legend-swatch', row);
    swatch.width = SWATCH * ratio;
    swatch.height = SWATCH * ratio;
    const context = swatch.getContext('2d');
    context.scale(ratio, ratio);
    drawLegendSymbol(context, what, SWATCH / 2, SWATCH / 2, SWATCH / 2 - 1);
    createHudElement(document, 'span', 'city-map-legend-label', row).textContent = label;
  }
  return panel;
}
