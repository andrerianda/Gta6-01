// Paints the city plan to a 2D canvas: sea, land, sand, water, lots by zone, roads by class,
// bridges, landmarks and district labels. North is up. The same painter serves the preview page,
// the HUD minimap and the full-screen map: the caller gives the view (the world point at the
// centre of the canvas and the scale) and a style.
//
//   paintCityPlan(context, plan, { centerX: 0, centerZ: 0, scale: 0.3, width: 1100, height: 1000 });
//   paintCityPlan(minimapContext, plan, view, { lots: false, labels: false, landmarkLabels: false });

import { ROAD_CLASSES } from './roadSpecifications.js';
import { SHORE_KINDS } from './coastlineShapes.js';

/**
 * Paints the plan.
 * @param {CanvasRenderingContext2D} context
 * @param {import('./cityPlanGenerator.js').CityPlan} plan
 * @param {{centerX: number, centerZ: number, scale: number, width: number, height: number}} view
 *   `scale` is pixels per metre; (centerX, centerZ) is the world point at the middle of the canvas.
 * @param {{lots?: boolean, labels?: boolean, landmarks?: boolean, landmarkLabels?: boolean, zones?: boolean, specialAreas?: boolean,
 *   boatLanes?: boolean, pavement?: boolean, lanes?: boolean, parking?: boolean,
 *   palette?: Partial<typeof CITY_MAP_PALETTE>}} [style] `zones` colours the lots by zoning.
 */
export function paintCityPlan(context, plan, view, style = {}) {
  const palette = { ...CITY_MAP_PALETTE, ...style.palette };
  const { scale } = view;
  const px = (x) => view.width / 2 + (x - view.centerX) * scale;
  const pz = (z) => view.height / 2 + (z - view.centerZ) * scale;
  const trace = (points, close) => {
    context.moveTo(px(points[0]), pz(points[1]));
    for (let i = 2; i < points.length; i += 2) context.lineTo(px(points[i]), pz(points[i + 1]));
    if (close) context.closePath();
  };
  context.save();
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.fillStyle = palette.sea;
  context.fillRect(0, 0, view.width, view.height);

  // Land, with the shallows as a pale halo and the beaches as a band of sand inside the shore.
  context.beginPath();
  for (const land of plan.coast.landRings) trace(land.ring, true);
  context.strokeStyle = palette.shallows;
  context.lineWidth = 90 * scale;
  context.stroke();
  context.fillStyle = palette.land;
  context.fill();
  context.save();
  context.clip();
  const beach = SHORE_KINDS.findIndex((kind) => kind.name === 'beach');
  context.strokeStyle = palette.sand;
  context.lineWidth = 190 * scale;
  context.lineCap = 'butt';
  for (const land of plan.coast.landRings) {
    const count = land.kinds.length;
    context.beginPath();
    for (let i = 0; i < count; i += 1) {
      const next = (i + 1) % count;
      if (land.kinds[i] !== beach) continue;
      context.moveTo(px(land.ring[i * 2]), pz(land.ring[i * 2 + 1]));
      context.lineTo(px(land.ring[next * 2]), pz(land.ring[next * 2 + 1]));
    }
    context.stroke();
  }
  // The wetlands are a duller green.
  const wetland = plan.districtById?.los_pantanos;
  if (wetland) {
    context.beginPath();
    trace(wetland.ring, true);
    context.fillStyle = palette.wetland;
    context.fill();
  }
  context.restore();
  context.beginPath();
  for (const carve of plan.coast.carves) trace(carve.ring, true);
  context.fillStyle = palette.sea;
  context.fill();

  if (style.lots !== false) {
    for (const lot of plan.lots) {
      context.beginPath();
      trace(lot.ring, true);
      context.fillStyle = lot.landmarkId && lot.zone === 'landmark' ? palette.landmark
        : style.zones ? palette.zoning[lot.zoning] ?? palette.building
          : palette.zone[lot.zone] ?? palette.building;
      context.fill();
    }
  }

  // Roads, least important first: a darker casing, then the roadway.
  for (const pass of ['casing', 'fill']) {
    for (const roadClass of ROAD_CLASSES) {
      for (const segment of plan.roads.segments) {
        if (segment.roadClass !== roadClass) continue;
        const width = Math.max(pass === 'casing' ? 1.6 : 0.8, segment.width * scale + (pass === 'casing' ? 1.6 : 0));
        context.beginPath();
        trace(segment.points, false);
        context.lineWidth = width;
        context.lineCap = segment.bridge ? 'butt' : 'round';
        context.strokeStyle = pass === 'casing' ? (segment.bridge ? palette.bridgeCasing : palette.roadCasing) : palette.road[roadClass] ?? palette.road.street;
        context.stroke();
      }
    }
  }

  // Special areas over the roads: the promenade, the pier, quays with crane rails, slips, the runway.
  if (style.specialAreas !== false && plan.specialAreas) {
    const fills = { promenade: palette.promenade, pier: palette.pier, quay: palette.quay, marina: palette.marina, runway: palette.runway };
    context.lineCap = 'butt';
    for (const area of plan.specialAreas) {
      if (!fills[area.kind]) continue;
      context.beginPath();
      trace(area.ring, true);
      if (area.head) trace(area.head, true);
      context.fillStyle = fills[area.kind];
      context.fill();
      context.lineWidth = Math.max(0.6, 1.2 * scale);
      context.strokeStyle = '#4a4036';
      for (const rail of area.craneRails ?? []) {
        context.beginPath();
        trace(rail, false);
        context.stroke();
      }
      context.lineWidth = Math.max(0.8, 1.8 * scale);
      context.strokeStyle = '#8a6a4c';
      for (const finger of area.fingers ?? []) {
        context.beginPath();
        trace([finger.ax, finger.az, finger.bx, finger.bz], false);
        context.stroke();
      }
      if (area.kind === 'runway') {
        context.setLineDash([24 * scale, 18 * scale]);
        context.strokeStyle = '#f2f2ee';
        context.beginPath();
        trace(area.line, false);
        context.stroke();
        context.setLineDash([]);
      }
    }
  }
  if (style.boatLanes !== false && plan.boatLanes) {
    context.setLineDash([6, 7]);
    context.lineWidth = 1.2;
    context.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    for (const lane of plan.boatLanes) {
      context.beginPath();
      trace(lane.points, false);
      context.stroke();
    }
    context.setLineDash([]);
  }
  // Overlays for checking the graphs: pavements and crossings, lane connectors, parking.
  if (style.pavement && plan.pedestrianGraph) {
    context.lineWidth = Math.max(0.7, 1.4 * scale);
    for (const edge of plan.pedestrianGraph.edges) {
      context.beginPath();
      trace(edge.points, false);
      context.strokeStyle = edge.kind === 'crosswalk' ? '#f5f0d8' : edge.kind === 'path' ? '#d2691e' : '#2f6f4f';
      context.stroke();
    }
  }
  if (style.lanes && plan.lanes) {
    context.lineWidth = Math.max(0.5, 0.8 * scale);
    for (const lane of plan.lanes) {
      context.beginPath();
      trace(lane.points, false);
      context.strokeStyle = lane.direction === 1 ? '#1f4fa8' : '#a8321f';
      context.stroke();
      context.beginPath();
      for (const successor of lane.successors) trace(successor.points, false);
      context.strokeStyle = '#d9a400';
      context.stroke();
    }
  }
  if (style.parking && plan.parkingSpots) {
    const size = Math.max(1, 2.2 * scale);
    for (const spot of plan.parkingSpots) {
      context.fillStyle = spot.kind === 'bay' ? '#7b4fc9' : '#3d3d3d';
      context.fillRect(px(spot.x) - size / 2, pz(spot.z) - size / 2, size, size);
    }
  }

  if (style.landmarks !== false) {
    context.font = `${Math.max(9, Math.min(13, 34 * scale))}px sans-serif`;
    context.textBaseline = 'middle';
    for (const landmark of plan.landmarks) {
      context.beginPath();
      context.arc(px(landmark.x), pz(landmark.z), Math.max(2, 9 * scale), 0, Math.PI * 2);
      context.fillStyle = palette.landmarkDot;
      context.fill();
      if (style.landmarkLabels) {
        context.fillStyle = palette.label;
        context.fillText(landmark.kind, px(landmark.x) + 5, pz(landmark.z));
      }
    }
  }
  if (style.labels !== false) {
    context.font = `600 ${Math.max(10, Math.min(22, 60 * scale))}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 3;
    for (const district of plan.districts) {
      const text = district.id.replace(/_/g, ' ').toUpperCase();
      context.strokeStyle = palette.labelHalo;
      context.strokeText(text, px(district.x), pz(district.z));
      context.fillStyle = palette.label;
      context.fillText(text, px(district.x), pz(district.z));
    }
  }
  context.restore();
}

/**
 * The colours of the map.
 */
export const CITY_MAP_PALETTE = Object.freeze({
  sea: '#5fa8c4', shallows: '#8cc9d6', land: '#cfe0b0', wetland: '#a9c08f', sand: '#f0e2b2',
  building: '#d8cdbd', landmark: '#e58f6a', landmarkDot: '#b3261e', label: '#22303a', labelHalo: 'rgba(255,255,255,0.75)',
  roadCasing: '#8a8f96', bridgeCasing: '#4b525a',
  promenade: '#e9dcc0', pier: '#9a7350', quay: '#b9b9b4', marina: '#c9c2b2', runway: '#55585c',
  road: Object.freeze({ highway: '#f2b653', avenue: '#fbe9a6', ramp: '#f2c97a', street: '#ffffff', alley: '#f1f1ee', service: '#e7e4dc', dirt: '#c9b48c' }),
  zone: Object.freeze({
    hotel: '#f3b7c2', tower: '#a9bfd6', retail: '#ecd3a2', mixed_use: '#c9c3d9', residential_low: '#e4d7bf', residential_high: '#d3bfa8',
    villa: '#f1e6d0', industrial: '#b9b3aa', port_yard: '#a7adb5', leisure: '#f0c59a', rural: '#d9cfae', park: '#8fc27d', plaza: '#e9e2d0',
    parking: '#b4b0a8',
  }),
  zoning: Object.freeze({
    commercial_high: '#7f9fd0', commercial_low: '#f0c070', residential_high: '#c98d6b', residential_low: '#f1e2b8', industrial: '#a3a3a3',
    civic: '#d07fb5', leisure: '#7fc8a0', waterfront: '#f29fb0',
  }),
});
