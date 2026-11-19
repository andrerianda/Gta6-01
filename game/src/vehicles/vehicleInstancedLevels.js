// The middle and far cars drawn as instanced batches: one draw call per vehicle model and level,
// whatever the number of cars. Each car's merged level (vehicleMergedLevels.js) stays in its rig
// as an invisible node that carries its pose (seated on the road by settleMergedVehicleLevels);
// every frame the roster adds the cars it shows at levels 1 and 2, and each batch writes their
// world matrices and a per-instance paint colour and lamp flags into an InstancedMesh. Cars outside
// the camera's view are left out on the CPU (bounding sphere against the frustum), so the GPU
// only draws what can be seen. The middle level casts sun shadows, the far level does not.
// Per-instance attribute farInstance: rgb the paint (linear), a the lamp flags (1 head and tail
// lamps, 2 siren a, 4 siren b, 8 brake). No allocation per frame once the batches have grown.
import * as THREE from 'three';
import { dayEnvironmentOf, trackVehicleMaterial } from './vehicleNightReflections.js';

/** Instances a batch holds before it grows (it doubles when full). */
const START_CAPACITY = 32;
/** Metres added to a car's bounding sphere for the view test (a frame of camera lag, shadows). */
const CULL_MARGIN = 2;
/** Lamp flag bits of farInstance.a. */
export const INSTANCE_LAMP_FLAGS = Object.freeze({ lamps: 1, sirenA: 2, sirenB: 4, brake: 8 });

function patchInstancedShader(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 farMix;\nattribute vec4 farInstance;\nvarying vec4 vFarMix;\nvarying vec4 vFarInstance;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFarMix = farMix;\nvFarInstance = farInstance;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec4 vFarMix;\nvarying vec4 vFarInstance;')
    .replace('#include <map_fragment>', [
      '#ifdef USE_MAP',
      '  diffuseColor *= mix( vec4( 1.0 ), texture2D( map, vMapUv ), vFarMix.x );',
      '#endif',
      'diffuseColor.rgb *= mix( vec3( 1.0 ), vFarInstance.rgb, vFarMix.y );',
    ].join('\n'))
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.14, vFarMix.w );')
    .replace('#include <emissivemap_fragment>', [
      '#include <emissivemap_fragment>',
      'vec4 farBits = mod( floor( vec4( floor( vFarInstance.a + 0.5 ) ) / vec4( 1.0, 2.0, 4.0, 8.0 ) ), 2.0 );',
      'float farGlow = vFarMix.z < 0.5 ? 0.0 : vFarMix.z < 1.5 ? farBits.x : vFarMix.z < 2.5 ? farBits.y : vFarMix.z < 3.5 ? farBits.z',
      '  : vFarMix.z < 4.5 ? farBits.w : 0.0;',
      'totalEmissiveRadiance += vColor.rgb * farGlow * 2.5;',
    ].join('\n'));
}

function programKey() {
  return 'vehicle_instanced_v1';
}

function instancedMaterial(asset, merged) {
  const paint = asset?.materials?.get?.('paint');
  const material = new THREE.MeshStandardMaterial({
    name: 'vehicle_instanced', map: merged.map ?? null, vertexColors: true, roughness: 0.55, metalness: 0.15,
    envMapIntensity: dayEnvironmentOf(paint),
  });
  material.onBeforeCompile = patchInstancedShader;
  material.customProgramCacheKey = programKey;
  trackVehicleMaterial(material); // less sky reflection at night
  return material;
}

/**
 * A geometry that shares the merged level's buffers (no copy) and carries the batch's own
 * per-instance attribute, so the shared merged geometry stays clean.
 */
function viewOf(geometry) {
  const view = new THREE.BufferGeometry();
  for (const name in geometry.attributes) view.setAttribute(name, geometry.attributes[name]);
  view.setIndex(geometry.index);
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  view.boundingSphere = geometry.boundingSphere;
  view.boundingBox = geometry.boundingBox;
  view.name = geometry.name;
  return view;
}

function createMesh(view, material, capacity, castShadow, name) {
  const mesh = new THREE.InstancedMesh(view, material, capacity);
  mesh.name = name;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const looks = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  looks.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.looks = looks;
  view.setAttribute('farInstance', looks);
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false; // culled per car on the CPU
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Creates the instanced batches of the middle and far levels.
 * @param {THREE.Object3D} parent Where the batch meshes are added (the dynamic layer).
 * @returns {{begin: (camera: THREE.Camera) => void, add: (node: THREE.Object3D, level: number,
 *   asset: object, colour: THREE.ColorRepresentation, flags: number) => boolean, end: () => void,
 *   drawCount: () => number, instanceCount: () => number, dispose: () => void}}
 */
export function createVehicleInstanceBatches(parent) {
  /** @type {Map<THREE.BufferGeometry, object>} */
  const batches = new Map();
  const list = [];
  const paints = new Map();
  const frustum = new THREE.Frustum();
  const viewProjection = new THREE.Matrix4();
  const sphere = new THREE.Sphere();

  function paintOf(colour) {
    let paint = paints.get(colour);
    if (!paint) paints.set(colour, (paint = new THREE.Color(colour)));
    return paint;
  }

  function batchOf(node, level, asset) {
    const merged = node.userData.merged;
    let batch = batches.get(merged.geometry);
    if (batch) return batch;
    const material = instancedMaterial(asset, merged);
    const name = `${merged.geometry.name || 'vehicle'}_instances`;
    const view = viewOf(merged.geometry);
    batch = { merged, view, material, castShadow: level === 1, name, capacity: START_CAPACITY, count: 0, mesh: null };
    batch.mesh = createMesh(view, material, batch.capacity, batch.castShadow, name);
    parent.add(batch.mesh);
    batches.set(merged.geometry, batch);
    list.push(batch);
    return batch;
  }

  function grow(batch) {
    const old = batch.mesh;
    batch.capacity *= 2;
    const mesh = createMesh(batch.view, batch.material, batch.capacity, batch.castShadow, batch.name);
    mesh.instanceMatrix.array.set(old.instanceMatrix.array);
    mesh.userData.looks.array.set(old.userData.looks.array);
    old.removeFromParent();
    old.dispose(); // its instance matrices; the view geometry and the material are kept
    parent.add(mesh);
    batch.mesh = mesh;
  }

  return {
    /** Starts a frame: empties every batch and takes the camera's view for the culling. */
    begin(camera) {
      for (let i = 0; i < list.length; i += 1) list[i].count = 0;
      if (camera) {
        camera.updateMatrixWorld();
        viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(viewProjection);
      }
      this.culling = Boolean(camera);
    },
    culling: false,
    /**
     * Adds one car at a merged level, if the camera can see it.
     * @param {THREE.Object3D} node The rig's merged level node (rig.mid or rig.far), matrixWorld current.
     * @param {number} level 1 middle (casts shadows) or 2 far.
     * @param {object} asset The vehicle asset (its paint's environment strength).
     * @param {THREE.ColorRepresentation} colour The paint shown.
     * @param {number} flags INSTANCE_LAMP_FLAGS bits.
     * @returns {boolean} False when it was culled.
     */
    add(node, level, asset, colour, flags) {
      const merged = node.userData.merged;
      if (!merged?.geometry) return false;
      if (this.culling) {
        if (!merged.geometry.boundingSphere) merged.geometry.computeBoundingSphere();
        sphere.copy(merged.geometry.boundingSphere).applyMatrix4(node.matrixWorld);
        sphere.radius += CULL_MARGIN;
        if (!frustum.intersectsSphere(sphere)) return false;
      }
      const batch = batchOf(node, level, asset);
      if (batch.count >= batch.capacity) grow(batch);
      const at = batch.count;
      node.matrixWorld.toArray(batch.mesh.instanceMatrix.array, at * 16);
      const paint = paintOf(colour);
      const looks = batch.mesh.userData.looks.array;
      looks[at * 4] = paint.r;
      looks[at * 4 + 1] = paint.g;
      looks[at * 4 + 2] = paint.b;
      looks[at * 4 + 3] = flags;
      batch.count += 1;
      return true;
    },
    /** Ends a frame: uploads what changed and hides the empty batches. */
    end() {
      for (let i = 0; i < list.length; i += 1) {
        const batch = list[i];
        const mesh = batch.mesh;
        mesh.count = batch.count;
        mesh.visible = batch.count > 0;
        if (batch.count === 0) continue;
        const matrices = mesh.instanceMatrix;
        matrices.clearUpdateRanges();
        matrices.addUpdateRange(0, batch.count * 16);
        matrices.needsUpdate = true;
        const looks = mesh.userData.looks;
        looks.clearUpdateRanges();
        looks.addUpdateRange(0, batch.count * 4);
        looks.needsUpdate = true;
      }
    },
    /** Draw calls the batches make this frame (not counting shadow passes). */
    drawCount() {
      let draws = 0;
      for (let i = 0; i < list.length; i += 1) if (list[i].count > 0) draws += 1;
      return draws;
    },
    /** Cars drawn through the batches this frame. */
    instanceCount() {
      let cars = 0;
      for (let i = 0; i < list.length; i += 1) cars += list[i].count;
      return cars;
    },
    dispose() {
      // The view geometries are not disposed: that would drop the GPU buffers they share with
      // the merged levels, which other cars of the model still draw.
      for (const batch of list) {
        batch.mesh.removeFromParent();
        batch.mesh.dispose();
        batch.material.dispose();
      }
      list.length = 0;
      batches.clear();
      paints.clear();
    },
  };
}
