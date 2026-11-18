// TEMPORARY: a simple stand-in body for a vehicle model that is not in the asset library yet
// (the Blender cars are being built: game/src/assets/registry/{sportsCars,vehicles}.js). It
// keeps the same node contract as the real models (lod0 body, wheel_fl/fr/rl/rr at the hubs
// spinning about X, steering_wheel, bumper_f/r, window_* panes, lamp_* materials), so the fleet
// drives, lights and damages it exactly like a finished car. Delete it once every catalog
// model is registered. Geometry is shared per model; materials per colour and lamp state.
import * as THREE from 'three';

const geometryCache = new Map();
const paintCache = new Map();
const lampCache = new Map();
let shared = null;

const LAMP_COLOURS = {
  lamp_head: 0xfff1d6, lamp_tail: 0xc0141a, lamp_brake: 0xff1a20, lamp_reverse: 0xf4f4f4,
  lamp_indicator_l: 0xff9a1a, lamp_indicator_r: 0xff9a1a,
};

function sharedMaterials() {
  if (shared) return shared;
  shared = {
    tyre: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.92, metalness: 0 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.35, metalness: 0.85 }),
    glass: new THREE.MeshStandardMaterial({ name: 'glass', color: 0x1d2830, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.82 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x202225, roughness: 0.7, metalness: 0.1 }),
  };
  return shared;
}

/**
 * A shared lamp material, lit or not.
 * @param {string} name The lamp material ("lamp_head").
 * @param {boolean} lit True for glowing.
 * @returns {THREE.MeshStandardMaterial}
 */
export function placeholderLampMaterial(name, lit) {
  const key = `${name}/${lit}`;
  if (!lampCache.has(key)) {
    const colour = LAMP_COLOURS[name] ?? 0xffffff;
    const material = new THREE.MeshStandardMaterial({
      name, color: colour, emissive: colour, emissiveIntensity: lit ? 6 : 0, roughness: 0.3, metalness: 0,
    });
    material.userData.role = 'lamp';
    lampCache.set(key, material);
  }
  return lampCache.get(key);
}

/**
 * The stand-in's paint in one colour (shared by every stand-in of that colour).
 * @param {THREE.ColorRepresentation} colour The paint.
 * @returns {THREE.MeshPhysicalMaterial}
 */
export function placeholderPaintOf(colour) {
  const hex = new THREE.Color(colour).getHex();
  if (!paintCache.has(hex)) {
    const material = new THREE.MeshPhysicalMaterial({ name: 'paint', color: hex, roughness: 0.32, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 });
    material.userData.role = 'paint';
    paintCache.set(hex, material);
  }
  return paintCache.get(hex);
}

function geometriesOf(entry) {
  if (geometryCache.has(entry.id)) return geometryCache.get(entry.id);
  const { length, width, height } = entry.dimensions;
  const clearance = entry.dimensions.groundClearance ?? 0.16;
  const radius = entry.dimensions.wheelRadius ?? 0.32;
  const lower = Math.max(0.3, height * 0.42);
  // An evenly tessellated lower body so dents look like dents.
  const body = new THREE.BoxGeometry(width - 0.04, lower, length - 0.2, 8, 3, 16);
  body.translate(0, clearance + 0.05 + lower / 2, 0);
  const cabinHeight = height - lower - clearance - 0.05;
  const cabin = new THREE.BoxGeometry(width * 0.84, Math.max(0.25, cabinHeight), length * 0.46, 4, 2, 6);
  const top = cabin.attributes.position;
  for (let i = 0; i < top.count; i += 1) if (top.getY(i) > 0) top.setX(i, top.getX(i) * 0.86);
  cabin.computeVertexNormals();
  cabin.translate(0, clearance + 0.05 + lower + Math.max(0.25, cabinHeight) / 2, length * 0.04);
  const tyre = new THREE.CylinderGeometry(radius, radius, 0.24, 18, 1);
  tyre.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, 0.25, 10, 1);
  rim.rotateZ(Math.PI / 2);
  const bumper = new THREE.BoxGeometry(width - 0.02, 0.2, 0.16);
  const lamp = new THREE.BoxGeometry(0.34, 0.1, 0.04);
  const pane = new THREE.PlaneGeometry(width * 0.7, Math.max(0.2, cabinHeight * 0.8));
  const geometries = { body, cabin, tyre, rim, bumper, lamp, pane, length, width, lower, clearance, radius, cabinHeight };
  geometryCache.set(entry.id, geometries);
  return geometries;
}

function mesh(geometry, material, name, castShadow = true) {
  const node = new THREE.Mesh(geometry, material);
  node.name = name;
  node.castShadow = castShadow;
  node.receiveShadow = true;
  return node;
}

/**
 * Builds the stand-in model of a catalog vehicle.
 * @param {object} entry The vehicleCatalog entry.
 * @param {string} colour The paint.
 * @param {{x: number, y: number, z: number}[]} wheels Hub positions in model space (fl, fr, rl, rr).
 * @returns {{root: THREE.Group, anchors: Record<string, THREE.Vector3>}} The model (origin on the
 *   ground at the centre, facing -Z) and its light anchors in model space.
 */
export function buildPlaceholderVehicle(entry, colour, wheels) {
  const g = geometriesOf(entry);
  const m = sharedMaterials();
  const root = new THREE.Group();
  root.name = `${entry.id}_placeholder`;
  const lod0 = mesh(g.body, placeholderPaintOf(colour), 'lod0');
  root.add(lod0);
  lod0.add(mesh(g.cabin, m.glass, 'cabin_glass', false));
  const bodyTop = g.clearance + 0.05 + g.lower;
  const halfLength = g.length / 2;
  const bumpers = [['bumper_f', -halfLength + 0.05], ['bumper_r', halfLength - 0.05]];
  for (const [name, z] of bumpers) {
    const node = mesh(g.bumper, m.trim, name, false);
    node.position.set(0, g.clearance + 0.16, z);
    lod0.add(node);
  }
  const names = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'];
  wheels.forEach((hub, index) => {
    const wheel = new THREE.Group();
    wheel.name = names[index];
    wheel.position.set(hub.x, hub.y, hub.z);
    wheel.add(mesh(g.tyre, m.tyre, `${names[index]}_tyre`), mesh(g.rim, m.rim, `${names[index]}_rim`, false));
    lod0.add(wheel);
  });
  const steering = new THREE.Object3D();
  steering.name = 'steering_wheel';
  steering.position.set(-g.width * 0.22, bodyTop + 0.15, -g.length * 0.08);
  lod0.add(steering);
  const lampY = g.clearance + 0.05 + g.lower * 0.72;
  const front = -halfLength + 0.09;
  const rear = halfLength - 0.09;
  const lamps = [
    ['lamp_head', -1, front], ['lamp_head', 1, front], ['lamp_tail', -1, rear], ['lamp_tail', 1, rear],
    ['lamp_brake', -1, rear - 0.001], ['lamp_brake', 1, rear - 0.001],
  ];
  for (const [name, side, z] of lamps) {
    const node = mesh(g.lamp, placeholderLampMaterial(name, false), `${name}_${side < 0 ? 'l' : 'r'}`, false);
    node.position.set(side * (g.width / 2 - 0.3), name === 'lamp_brake' ? lampY - 0.11 : lampY, z + (z < 0 ? -0.04 : 0.04));
    lod0.add(node);
  }
  const anchors = {
    anchor_light_head_l: new THREE.Vector3(-(g.width / 2 - 0.3), lampY, front - 0.1),
    anchor_light_head_r: new THREE.Vector3(g.width / 2 - 0.3, lampY, front - 0.1),
    anchor_light_tail_l: new THREE.Vector3(-(g.width / 2 - 0.3), lampY, rear + 0.1),
    anchor_light_tail_r: new THREE.Vector3(g.width / 2 - 0.3, lampY, rear + 0.1),
  };
  return { root, anchors };
}
