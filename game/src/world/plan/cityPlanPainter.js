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
 * @param {{lots?: boolean, labels?: boolean, landmarks?: boolean, landmarkLabels?: boolean, zones?: boolean,
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
  road: Object.freeze({ highway: '#f2b653', avenue: '#fbe9a6', ramp: '#f2c97a', street: '#ffffff', alley: '#f1f1ee', service: '#e7e4dc', dirt: '#c9b48c' }),
  zone: Object.freeze({
    hotel: '#f3b7c2', tower: '#a9bfd6', retail: '#ecd3a2', mixed_use: '#c9c3d9', residential_low: '#e4d7bf', residential_high: '#d3bfa8',
    villa: '#f1e6d0', industrial: '#b9b3aa', port_yard: '#a7adb5', leisure: '#f0c59a', rural: '#d9cfae', park: '#8fc27d', plaza: '#e9e2d0',
  }),
  zoning: Object.freeze({
    commercial_high: '#7f9fd0', commercial_low: '#f0c070', residential_high: '#c98d6b', residential_low: '#f1e2b8', industrial: '#a3a3a3',
    civic: '#d07fb5', leisure: '#7fc8a0', waterfront: '#f29fb0',
  }),
});
