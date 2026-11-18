// Drawing of the distant traffic and the far parked cars. Every car out to FAR_PROXY_DISTANCE from
// the camera is one instance of its model's merged far level, through the vehicle system's own
// instanced batches (vehicles/vehicleInstancedLevels.js over vehicleMergedLevels.js): ONE draw
// call per model, with the paint colour and the night lamps per instance, the cars outside the
// camera's view left out on the CPU, and the very geometry the fleet shows for its own far cars
// (shared GPU buffers, and a car changing between the two keeps its look). It used to be four or
// five draws per model (paint, atlas, glass, lamps): 35 draws with the motorcycle in the mix.
// Beyond FAR_PROXY_DISTANCE every model is the one 84-triangle shape of farCarProxy.js scaled to
// the model's size: one draw for all of them (two at night, with the lamps). No shadows.
import * as THREE from 'three';
import { INSTANCE_LAMP_FLAGS, createVehicleInstanceBatches } from '../vehicles/vehicleInstancedLevels.js';
import { mergedVehicleLevel } from '../vehicles/vehicleMergedLevels.js';
import {
  FAR_CAR_TRIANGLES, FAR_LAMP_TRIANGLES, createFarCarGeometry, createFarCarLampGeometry, createFarCarMaterial, createFarLampMaterial,
} from './farCarProxy.js';

/** The level of detail drawn for distant cars (clamped to the model's last level). */
export const DISTANT_LEVEL = 2;
/**
 * Metres from the camera beyond which a distant (or parked) car is drawn as the shared low-poly
 * shape: there a car is about 25 pixels long at 960x540.
 */
export const FAR_PROXY_DISTANCE = 120;

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const size = new THREE.Vector3();
const upAxis = new THREE.Vector3(0, 1, 0);

/**
 * Creates the instanced drawing of distant traffic; a model's batch is made on first use.
 * @param {object} assets The asset library (context.assets).
 * @param {THREE.Object3D} layer Where the meshes go (context.view.layers.dynamic).
 * @param {number} capacity The most cars drawn as the far shape is three times this.
 */
export function createDistantTrafficBatches(assets, layer, capacity) {
  const root = new THREE.Group();
  root.name = 'distant_traffic';
  layer?.add(root);
  const batches = createVehicleInstanceBatches(root);
  /** @type {Map<string, {asset: object, node: THREE.Object3D, extent: THREE.Vector3, triangles: number, count: number} | null>} */
  const models = new Map();
  const stats = { cars: 0, drawCalls: 0, triangles: 0, models: 0, farCars: 0, culled: 0 };
  // The far level: one body batch and one lamp batch sharing the instance matrices.
  const proxyCapacity = capacity * 3;
  const far = new THREE.InstancedMesh(createFarCarGeometry(), createFarCarMaterial(), proxyCapacity);
  const farLamps = new THREE.InstancedMesh(createFarCarLampGeometry(), createFarLampMaterial(), proxyCapacity);
  far.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  farLamps.instanceMatrix = far.instanceMatrix;
  far.setColorAt(0, new THREE.Color(1, 1, 1));
  far.instanceColor.setUsage(THREE.DynamicDrawUsage);
  for (const mesh of [far, farLamps]) {
    mesh.name = mesh === far ? 'distant_far_bodies' : 'distant_far_lamps';
    mesh.castShadow = mesh.receiveShadow = mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    root.add(mesh);
  }
  let farCount = 0;
  let eyeX = NaN;
  let eyeZ = NaN;
  let lampFlags = 0;
  const farSquared = FAR_PROXY_DISTANCE * FAR_PROXY_DISTANCE;

  function modelOf(modelId) {
    if (models.has(modelId)) return models.get(modelId);
    let built = null;
    try {
      if (assets?.has?.(modelId)) built = buildModel(assets.get(modelId));
    } catch {
      built = null;
    }
    if (built) stats.models += 1;
    models.set(modelId, built);
    return built;
  }

  // A pose carrier holding the model's merged far level, as the fleet's rigs do (rig.far).
  function buildModel(asset) {
    const merged = mergedVehicleLevel(asset, DISTANT_LEVEL);
    if (!merged?.geometry) return null;
    const geometry = merged.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const node = new THREE.Object3D();
    node.name = `distant_${asset.id}`;
    node.matrixAutoUpdate = false;
    node.userData.merged = merged;
    // Width, height and length of the far shape (the model faces -Z).
    const extent = geometry.boundingBox.isEmpty() ? new THREE.Vector3(1.8, 1.45, 4.5) : geometry.boundingBox.getSize(new THREE.Vector3());
    const triangles = (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
    return { asset, node, extent, triangles, count: 0 };
  }

  return {
    stats,

    /**
     * Starts a frame's list of cars.
     * @param {THREE.Camera | null} camera The view: cars outside it are left out, far ones get the far shape.
     * @param {boolean} [lampsLit] Whether the head and tail lamps glow (night).
     */
    begin(camera, lampsLit = false) {
      for (const model of models.values()) if (model) model.count = 0;
      farCount = 0;
      stats.culled = 0;
      eyeX = camera ? camera.position.x : NaN;
      eyeZ = camera ? camera.position.z : NaN;
      lampFlags = lampsLit ? INSTANCE_LAMP_FLAGS.lamps : 0;
      farLamps.visible = Boolean(lampsLit);
      batches.begin(camera ?? null);
    },

    /**
     * Adds one car to this frame's picture.
     * @param {string} modelId The vehicle model.
     * @param {number} x
     * @param {number} y Ground height under the car.
     * @param {number} z
     * @param {number} heading Physics heading (0 north, clockwise).
     * @param {THREE.Color} colour The paint.
     * @returns {boolean} False when the model cannot be drawn.
     */
    add(modelId, x, y, z, heading, colour) {
      const model = modelOf(modelId);
      if (!model) return false;
      position.set(x, y, z);
      quaternion.setFromAxisAngle(upAxis, -heading);
      const dx = x - eyeX;
      const dz = z - eyeZ;
      if (dx * dx + dz * dz > farSquared && farCount < proxyCapacity) {
        matrix.compose(position, quaternion, size.copy(model.extent));
        far.setMatrixAt(farCount, matrix);
        far.setColorAt(farCount, colour);
        farCount += 1;
        return true;
      }
      model.node.matrixWorld.compose(position, quaternion, size.set(1, 1, 1));
      // A hex key: the batches cache one colour per key, and the cars' Color objects come and go.
      if (batches.add(model.node, DISTANT_LEVEL, model.asset, colour.getHex(), lampFlags)) model.count += 1;
      else stats.culled += 1;
      return true;
    },

    /** Uploads this frame's cars. */
    end() {
      batches.end();
      stats.cars = 0;
      stats.triangles = 0;
      for (const model of models.values()) {
        if (!model || model.count === 0) continue;
        stats.cars += model.count;
        stats.triangles += model.triangles * model.count;
      }
      stats.drawCalls = batches.drawCount();
      far.count = farLamps.count = farCount;
      far.visible = farCount > 0;
      farLamps.visible = farLamps.visible && farCount > 0;
      stats.farCars = farCount;
      stats.cars += farCount;
      if (farCount > 0) {
        far.instanceMatrix.needsUpdate = true;
        far.instanceColor.needsUpdate = true;
        stats.drawCalls += farLamps.visible ? 2 : 1;
        stats.triangles += farCount * (FAR_CAR_TRIANGLES + (farLamps.visible ? FAR_LAMP_TRIANGLES : 0));
      }
    },

    dispose() {
      for (const mesh of [far, farLamps]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
        mesh.dispose();
      }
      // The merged levels belong to the vehicle system's cache (the fleet's far cars draw them too).
      batches.dispose();
      models.clear();
      root.removeFromParent();
    },
  };
}
