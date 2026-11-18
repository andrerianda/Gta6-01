// The full-screen city map (M): the whole plan of Marazul painted once into a large picture by
// cityPlanPainter, shown with pan (drag, WASD or arrows) and zoom (wheel, + and -), the district
// names, the GPS routes to the waypoint and the objective, point-of-interest icons (shops,
// hospitals, police, safehouses, mission givers) and sights with their names when zoomed in, the
// player's arrow and the waypoint, which a click sets and a right click clears; a legend beside.
import { CITY_FRAME } from '../world/plan/cityFrame.js';
import { paintCityPlan } from '../world/plan/cityPlanPainter.js';
import { createCityMapLegend, drawLegendSymbol } from './cityMapLegend.js';
import { createHudElement } from './hudElements.js';
import { displayNameFromId } from './hudFormatting.js';
import { drawMapIcon } from './mapIconPainter.js';

const BASE_PIXELS_PER_METRE = 0.5;
/** Landmark kinds shown as sights (a star, named when zoomed in). */
const SIGHT_KINDS = new Set(['stadium', 'lighthouse', 'pier', 'city_hall', 'lookout', 'casino_resort', 'radio_tower',
  'marina', 'shopping_mall', 'airstrip', 'grand_hotel', 'nightclub', 'church', 'bank']);
const LABEL_FONT = '600 12px "Segoe UI", Arial, sans-serif';
const ICON_FONT = '800 10px "Segoe UI", Arial, sans-serif';
/** Pixels kept between a district name and the screen's edge. */
const DISTRICT_LABEL_MARGIN = 14;

/**
 * Builds the city map screen.
 * @param {Document} document
 * @param {HTMLElement} container `city-map-screen`.
 * @param {object} plan The city plan.
 * @param {{content: object, onWaypoint: (position: object|null) => void,
 *   gps?: {waypointRoute: object, objectiveRoute: object}, places?: object[]}} options
 */
export function createCityMapScreen(document, container, plan, options) {
  container.classList.add('city-map');
  const canvas = createHudElement(document, 'canvas', 'city-map-canvas', container);
  const header = createHudElement(document, 'div', 'city-map-header', container);
  createHudElement(document, 'strong', 'city-map-title', header).textContent = 'Marazul';
  createHudElement(document, 'span', 'city-map-hint', header).textContent =
    'Drag or WASD to pan  ·  Wheel to zoom  ·  Click to set a waypoint  ·  Right click to clear  ·  M to close';
  createCityMapLegend(document, container);
  const context = canvas.getContext('2d');
  const districts = options.content.find('cityDistricts')?.CITY_DISTRICTS ?? {};
  const places = options.places ?? [];
  const gps = options.gps ?? null;
  const sights = plan.landmarks.filter((landmark) => SIGHT_KINDS.has(landmark.kind));
  const givers = new Map();                       // missionId -> {x, z, letter}
  const extent = CITY_FRAME.extent;
  let base = null;
  let centerX = 0; let centerZ = 0; let zoom = 0.2;
  let player = { x: 0, z: 0, faceX: 0, faceZ: -1 };
  let waypoint = null;
  let objective = null;
  let dirty = true;
  let drag = null;
  let routeStamp = -1;

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
  // A route changes when its point count or its first leg moves (the GPS recomputes from the player).
  const routeStampOf = (route) => route.count * 7919 + (route.count > 1 ? route.points[0] * 3.1 + route.points[1] * 1.7 + route.points[2] + route.points[3] : 0);
  const stampOf = () => (gps ? routeStampOf(gps.waypointRoute) * 100003 + routeStampOf(gps.objectiveRoute) : 0);

  function drawRoute(route, colour) {
    if (!route || route.count < 2) return;
    const p = route.points;
    context.beginPath();
    context.moveTo(toScreenX(p[0]), toScreenY(p[1]));
    for (let k = 1; k < route.count; k += 1) context.lineTo(toScreenX(p[k * 2]), toScreenY(p[k * 2 + 1]));
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.lineWidth = 8;
    context.strokeStyle = 'rgba(16, 10, 24, 0.7)';
    context.stroke();
    context.lineWidth = 4.5;
    context.strokeStyle = colour;
    context.stroke();
  }

  function label(text, x, y) {
    context.font = LABEL_FONT;
    context.lineWidth = 3;
    context.strokeStyle = 'rgba(20, 16, 12, 0.8)';
    context.strokeText(text, x, y);
    context.fillStyle = '#fff6e6';
    context.fillText(text, x, y);
  }

  function draw() {
    dirty = false;
    routeStamp = stampOf();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#5fa8c4';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    const scale = zoom / BASE_PIXELS_PER_METRE;
    context.drawImage(base, toScreenX(extent.minX), toScreenY(extent.minZ), base.width * scale, base.height * scale);
    if (gps) {
      drawRoute(gps.waypointRoute, '#e0408a');
      drawRoute(gps.objectiveRoute, '#ffcf4a');
    }
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const named = zoom > 0.42;
    for (const sight of sights) {
      const x = toScreenX(sight.x); const y = toScreenY(sight.z);
      drawLegendSymbol(context, 'sight', x, y, 8);
      if (named) label(sight.name ?? displayNameFromId(sight.id), x, y + 16);
    }
    for (const place of places) {
      const x = toScreenX(place.x); const y = toScreenY(place.z);
      context.font = ICON_FONT;
      drawMapIcon(context, place.kind, x, y, place.kind === 'shop' ? 7 : 8.5, place.letter, place.fill);
      if (named && place.name) label(place.name, x, y + 18);
    }
    context.font = '800 12px "Segoe UI", Arial, sans-serif';
    givers.forEach((giver) => drawMapIcon(context, 'giver', toScreenX(giver.x), toScreenY(giver.z), 10, giver.letter));
    const districtFont = Math.round(Math.max(13, Math.min(26, zoom * 70)));
    context.font = `800 ${districtFont}px "Segoe UI", Arial, sans-serif`;
    context.lineWidth = 4;
    for (const district of plan.districts) {
      const name = (districts[district.id]?.name ?? displayNameFromId(district.id)).toUpperCase();
      // A name that would run off the screen's edge (Puerto Tamarindo at the far west) slides in
      // to fit; one whose district lies wholly off screen is not drawn.
      const half = context.measureText(name).width / 2 + DISTRICT_LABEL_MARGIN;
      let x = toScreenX(district.x);
      let y = toScreenY(district.z);
      if (x < -half || x > canvas.width + half || y < -districtFont || y > canvas.height + districtFont) continue;
      x = Math.min(Math.max(x, half), canvas.width - half);
      y = Math.min(Math.max(y, districtFont), canvas.height - districtFont);
      context.strokeStyle = 'rgba(20, 16, 12, 0.7)';
      context.strokeText(name, x, y);
      context.fillStyle = '#ffe2a8';
      context.fillText(name, x, y);
    }
    if (objective) {
      context.beginPath();
      context.arc(toScreenX(objective.x), toScreenY(objective.z), 9, 0, Math.PI * 2);
      context.fillStyle = '#ffcf4a';
      context.fill();
      context.lineWidth = 2.5;
      context.strokeStyle = '#2a1d10';
      context.stroke();
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
    drawLegendSymbol(context, 'arrow', 0, 0, 15);
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
    /** @param {{x: number, z: number}|null} position */
    setObjective(position) { objective = position ? { x: position.x, z: position.z } : null; dirty = true; },
    /** @param {string} missionId @param {{x: number, z: number}|null} position @param {string} [letter] */
    setMissionGiver(missionId, position, letter = '!') {
      if (position) givers.set(missionId, { x: position.x, z: position.z, letter });
      else givers.delete(missionId);
      dirty = true;
    },
    /**
     * Keyboard pan and zoom while the map is open; redraws when the view or a route changed.
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
      if ((dirty || stampOf() !== routeStamp) && base) draw();
    },
  };
}
