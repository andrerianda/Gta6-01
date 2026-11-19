// The live face of a cockpit's instrument panel: one canvas, painted by the panel painter of the
// aircraft's cockpit kind (the catalog's flight.cockpit), shown as an unlit texture on the model's
// `instrument_panel` mesh so the gauges glow at night as they do by day. The aircraft's own
// material comes back when the lead leaves.
import * as THREE from 'three';
import { paintAnalogJetPanel } from './analogJetPanel.js';
import { paintGlassCockpitPanel } from './glassCockpitPanel.js';
import { paintTrainerSixPackPanel } from './trainerSixPackPanel.js';

/** The painter and the default panel size (metres: width, height) of each cockpit kind. */
export const COCKPIT_PANELS = Object.freeze({
  analog_six: Object.freeze({ paint: paintTrainerSixPackPanel, size: Object.freeze([0.95, 0.42]) }),
  glass_four: Object.freeze({ paint: paintGlassCockpitPanel, size: Object.freeze([1.9, 0.5]) }),
  analog_gauges: Object.freeze({ paint: paintAnalogJetPanel, size: Object.freeze([0.9, 0.45]) }),
});

/** The name of the mesh the game paints on (the asset contract). */
export const PANEL_NODE_NAME = 'instrument_panel';
const CANVAS_HEIGHT = 512;

/**
 * Creates the panel surface for one aircraft model.
 * @param {Document} document
 * @param {THREE.Object3D} model The aircraft's drawn root (vehicles.modelOf).
 * @param {string} cockpitKind A key of COCKPIT_PANELS.
 * @param {number[] | undefined} panelSize The asset's `panel_size` extra, metres.
 * @param {{stallClean: number, stallFlaps: number, neverExceed: number} | null} speeds Airspeed arcs, knots.
 * @returns {{paint: (readout: object, extra: object) => void, dispose: () => void, readonly attached: boolean,
 *   canvas: HTMLCanvasElement} | null} Null when the kind is unknown or the model has no panel mesh.
 */
export function createCockpitPanelSurface(document, model, cockpitKind, panelSize, speeds) {
  const kind = COCKPIT_PANELS[cockpitKind];
  if (!kind || !model) return null;
  const meshes = [];
  model.traverse((node) => {
    if (node.isMesh && node.name === PANEL_NODE_NAME) meshes.push(node);
  });
  if (meshes.length === 0) return null;
  const size = Array.isArray(panelSize) && panelSize.length === 2 && panelSize[0] > 0 && panelSize[1] > 0 ? panelSize : kind.size;
  const canvas = document.createElement('canvas');
  canvas.height = CANVAS_HEIGHT;
  canvas.width = Math.max(256, Math.min(2048, Math.round((CANVAS_HEIGHT * size[0]) / size[1] / 16) * 16));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false; // glTF UVs
  texture.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({ name: 'screen_panel_live', map: texture, toneMapped: false });
  const originals = meshes.map((mesh) => mesh.material);
  for (const mesh of meshes) mesh.material = material;
  const layout = { width: canvas.width, height: canvas.height, speeds };
  let attached = true;
  return {
    canvas,
    get attached() { return attached; },
    /** Repaints the panel from a readout (and the map, radar and time data of the glass cockpit). */
    paint(readout, extra) {
      if (!attached) return;
      kind.paint(ctx, readout, layout, extra);
      texture.needsUpdate = true;
    },
    dispose() {
      if (!attached) return;
      attached = false;
      for (let i = 0; i < meshes.length; i += 1) meshes[i].material = originals[i];
      material.dispose();
      texture.dispose();
    },
  };
}
