// The full-screen city map (M): the whole plan of Marazul painted once into a large picture by
// cityPlanPainter, shown with pan (drag, WASD or arrows) and zoom (wheel, + and -), the district
// names, landmark icons with their names when zoomed in, the player's arrow and the waypoint,
// which a click sets and a right click clears.
import { CITY_FRAME } from '../world/plan/cityFrame.js';
import { paintCityPlan } from '../world/plan/cityPlanPainter.js';
import { createHudElement } from './hudElements.js';
import { displayNameFromId } from './hudFormatting.js';

const BASE_PIXELS_PER_METRE = 0.5;
/** Landmark kinds shown with an icon: letter, colour. */
const LANDMARK_ICONS = Object.freeze({
  safehouse_apartment: ['H', '#ffd36b'], mansion: ['H', '#ffd36b'], hospital: ['+', '#ff6b6b'], police_station: ['P', '#5b8dff'],
  fire_station: ['F', '#ff8a5c'], gun_shop: ['G', '#ff8a5c'], clothing_store: ['C', '#f39ac0'], paint_and_body_shop: ['S', '#b79cff'],
  mod_garage: ['W', '#6fd6c8'], diner: ['F', '#ffd36b'], bar_cantina: ['B', '#ffd36b'], nightclub: ['N', '#e061c8'],
  bank: ['$', '#9fe39a'], casino_resort: ['$', '#9fe39a'], stadium: ['*', '#ffe2a8'], lighthouse: ['*', '#ffe2a8'],
  pier: ['*', '#ffe2a8'], city_hall: ['*', '#ffe2a8'], lookout: ['*', '#ffe2a8'], shopping_mall: ['M', '#ecd3a2'],
  fuel_station: ['P', '#c9e36b'], helipad: ['H', '#8fc8ff'], marina: ['A', '#6fb8ff'], yacht_club: ['A', '#6fb8ff'],
});

/**
 * Builds the city map screen.
 * @param {Document} document
 * @param {HTMLElement} container `city-map-screen`.
 * @param {object} plan The city plan.
 * @param {{content: object, onWaypoint: (position: object|null) => void, onClose: () => void}} options
 */
export function createCityMapScreen(document, container, plan, options) {
  container.classList.add('city-map');
  const canvas = createHudElement(document, 'canvas', 'city-map-canvas', container);
  const header = createHudElement(document, 'div', 'city-map-header', container);
  createHudElement(document, 'strong', 'city-map-title', header).textContent = 'Marazul';
  createHudElement(document, 'span', 'city-map-hint', header).textContent =
    'Drag or WASD to pan  ·  Wheel to zoom  ·  Click to set a waypoint  ·  Right click to clear  ·  M to close';
  const context = canvas.getContext('2d');
  const districts = options.content.find('cityDistricts')?.CITY_DISTRICTS ?? {};
  const extent = CITY_FRAME.extent;
  let base = null;
  let centerX = 0; let centerZ = 0; let zoom = 0.2;
  let player = { x: 0, z: 0, faceX: 0, faceZ: -1 };
  let waypoint = null;
  let dirty = true;
  let drag = null;

  function paintBase() {
    base = document.createElement('canvas');
    base.width = Math.round((extent.maxX - extent.minX) * BASE_PIXELS_PER_METRE);
    base.height = Math.round((extent.maxZ - extent.minZ) * BASE_PIXELS_PER_METRE);
    paintCityPlan(base.getContext('2d'), plan, {
      centerX: (extent.minX + extent.maxX) / 2, centerZ: (extent.minZ + extent.maxZ) / 2,
      scale: BASE_PIXELS_PER_METRE, width: base.width, height: base.height,
    }, { labels: false, landmarks: false });
  }
  const toScreenX = (x) => canvas.width / 2 + (x - centerX) * zoom;
  const toScreenY = (z) => canvas.height / 2 + (z - centerZ) * zoom;
  const toWorld = (event) => {
    const box = canvas.getBoundingClientRect();
    return { x: centerX + (event.clientX - box.left - box.width / 2) / zoom, y: 0, z: centerZ + (event.clientY - box.top - box.height / 2) / zoom };
  };
  const zoomBy = (factor) => {
    const fit = Math.min(canvas.width / (extent.maxX - extent.minX), canvas.height / (extent.maxZ - extent.minZ));
    zoom = Math.max(fit * 0.8, Math.min(2.5, zoom * factor));
    dirty = true;
  };

  function badge(x, y, letter, colour, radius) {
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = '#1d1b19';
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = colour;
    context.stroke();
    context.fillStyle = colour;
    context.fillText(letter, x, y + 0.5);
  }

  function draw() {
    dirty = false;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#5fa8c4';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    const scale = zoom / BASE_PIXELS_PER_METRE;
    context.drawImage(base, toScreenX(extent.minX), toScreenY(extent.minZ), base.width * scale, base.height * scale);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '800 11px "Segoe UI", Arial, sans-serif';
    for (const landmark of plan.landmarks) {
      const icon = LANDMARK_ICONS[landmark.kind];
      if (!icon) continue;
      const x = toScreenX(landmark.x); const y = toScreenY(landmark.z);
      badge(x, y, icon[0], icon[1], 8);
      if (zoom > 0.42) {
        context.font = '600 12px "Segoe UI", Arial, sans-serif';
        context.lineWidth = 3;
        context.strokeStyle = 'rgba(20, 16, 12, 0.8)';
        context.strokeText(landmark.name ?? displayNameFromId(landmark.id), x, y + 17);
        context.fillStyle = '#fff6e6';
        context.fillText(landmark.name ?? displayNameFromId(landmark.id), x, y + 17);
        context.font = '800 11px "Segoe UI", Arial, sans-serif';
      }
    }
    context.font = `800 ${Math.round(Math.max(13, Math.min(26, zoom * 70)))}px "Segoe UI", Arial, sans-serif`;
    context.lineWidth = 4;
    for (const district of plan.districts) {
      const name = (districts[district.id]?.name ?? displayNameFromId(district.id)).toUpperCase();
      context.strokeStyle = 'rgba(20, 16, 12, 0.7)';
      context.strokeText(name, toScreenX(district.x), toScreenY(district.z));
      context.fillStyle = '#ffe2a8';
      context.fillText(name, toScreenX(district.x), toScreenY(district.z));
    }
    if (waypoint) {
      const x = toScreenX(waypoint.x); const y = toScreenY(waypoint.z);
      context.beginPath();
      context.moveTo(x, y);
      context.arc(x, y - 18, 9, Math.PI * 0.8, Math.PI * 2.2);
      context.closePath();
      context.fillStyle = '#e0408a';
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = '#ffffff';
      context.stroke();
    }
    const px = toScreenX(player.x); const py = toScreenY(player.z);
    context.translate(px, py);
    context.rotate(Math.atan2(player.faceZ, player.faceX) + Math.PI / 2);
    context.beginPath();
    context.moveTo(0, -13); context.lineTo(9, 10); context.lineTo(0, 5); context.lineTo(-9, 10);
    context.closePath();
    context.fillStyle = '#fff6e6';
    context.fill();
    context.lineWidth = 2.5;
    context.strokeStyle = '#e8573f';
    context.stroke();
  }

  canvas.addEventListener('pointerdown', (event) => {
    drag = { x: event.clientX, y: event.clientY, centerX, centerZ, moved: false };
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x; const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    centerX = drag.centerX - dx / zoom; centerZ = drag.centerZ - dy / zoom;
    dirty = true;
  });
  canvas.addEventListener('pointerup', (event) => {
    if (drag && !drag.moved && event.button === 0) {
      waypoint = toWorld(event);
      options.onWaypoint(waypoint);
      dirty = true;
    }
    drag = null;
  });
  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    waypoint = null;
    options.onWaypoint(null);
    dirty = true;
  });

  return {
    /**
     * Opens the map centred on the player.
     * @param {{x: number, z: number, faceX: number, faceZ: number}} view
     */
    open(view) {
      player = { x: view.x, z: view.z, faceX: view.faceX, faceZ: view.faceZ };
      if (!base) paintBase();
      const window = document.defaultView;              // the container may not be laid out yet
      canvas.width = Math.max(320, Math.round(window?.innerWidth || 960));
      canvas.height = Math.max(240, Math.round(window?.innerHeight || 540));
      centerX = view.x; centerZ = view.z;
      zoom = Math.max(0.12, canvas.height / 1800);
      draw();
    },
    close() { drag = null; },
    /** @param {{x: number, z: number}|null} position */
    setWaypoint(position) { waypoint = position; dirty = true; },
    /**
     * Keyboard pan and zoom while the map is open.
     * @param {number} deltaSeconds
     * @param {object} input context.input.
     */
    update(deltaSeconds, input) {
      const panX = input.axis('mapPanX'); const panY = input.axis('mapPanY');
      if (panX || panY) {
        centerX += (panX * 700 * deltaSeconds) / zoom * 0.25;
        centerZ -= (panY * 700 * deltaSeconds) / zoom * 0.25;
        dirty = true;
      }
      if (input.pressed('mapZoomIn')) zoomBy(1.25);
      if (input.pressed('mapZoomOut')) zoomBy(1 / 1.25);
      if (dirty && base) draw();
    },
  };
}
