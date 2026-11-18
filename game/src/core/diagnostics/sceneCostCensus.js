// The scene cost census: walks the scene graph and tells, for each top-level group of objects (the
// children of the scene's layers, which the systems add: city sectors, dressing, traffic, crowd,
// effects), how many draw calls and triangles it puts in the camera's view and how many shadow
// casters it has near the camera. It does what the renderer would do (visibility, frustum test,
// one draw per material group, instances multiply triangles, a batched mesh counts the geometry
// ranges of its instances in view rather than its reserved buffers) without drawing, so the performance
// overlay and the debug object can say which system owns the cost.
//
//   const census = createSceneCostCensus(view);
//   const rows = census.take({ shadowDistance: 230 });  // [{ group, drawCalls, triangles, ... }]
import * as THREE from 'three';

/**
 * @typedef {Object} SceneCostRow The cost of one top-level group.
 * @property {string} group 'layer/child' (the child's name, or its type when it has none).
 * @property {number} objects Visible drawable objects in the group.
 * @property {number} drawCalls Draw calls in the camera's view (main pass only).
 * @property {number} triangles Triangles in the camera's view, instances included.
 * @property {number} instances Instances drawn by instanced meshes in view.
 * @property {number} shadowCasters Draw calls of shadow casters within the shadow distance (one
 *   cascade; the renderer draws a caster once per cascade it falls in).
 * @property {number} shadowTriangles Their triangles.
 */

/**
 * Creates the census for a view.
 * @param {{scene: THREE.Scene, camera: THREE.Camera, layers: Record<string, THREE.Object3D>}} view
 *   The renderer bootstrap's view.
 * @returns {{take: (options?: {shadowDistance?: number}) => SceneCostRow[]}}
 */
export function createSceneCostCensus(view) {
  const frustum = new THREE.Frustum();
  const viewProjection = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const instanceMatrix = new THREE.Matrix4();
  const cameraPosition = new THREE.Vector3();
  let shadowDistance = 230;

  /**
   * Counts the cost of every top-level group, dearest first.
   * @param {{shadowDistance?: number}} [options] Metres from the camera within which shadow
   *   casters count (default 230, the reach of the 'high' sun shadows).
   * @returns {SceneCostRow[]}
   */
  function take(options = {}) {
    shadowDistance = options.shadowDistance ?? 230;
    const { scene, camera, layers } = view;
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjection);
    camera.getWorldPosition(cameraPosition);
    const layerByObject = new Map(Object.entries(layers).map(([name, group]) => [group, name]));
    const rows = [];
    for (const child of scene.children) {
      const layerName = layerByObject.get(child);
      if (layerName === undefined) {
        if (child !== camera) rows.push(countGroup(`scene/${labelOf(child)}`, child));
        continue;
      }
      if (!child.visible) continue;
      for (const member of child.children) rows.push(countGroup(`${layerName}/${labelOf(member)}`, member));
    }
    return rows.filter((row) => row.objects > 0).sort((a, b) => b.drawCalls - a.drawCalls || b.triangles - a.triangles);
  }

  function countGroup(group, root) {
    const row = { group, objects: 0, drawCalls: 0, triangles: 0, instances: 0, shadowCasters: 0, shadowTriangles: 0 };
    walk(root, row);
    return row;
  }

  function walk(object, row) {
    if (!object.visible) return;
    if (object.isMesh || object.isPoints || object.isLine || object.isSprite) countDrawable(object, row);
    const children = object.children;
    for (let i = 0; i < children.length; i += 1) walk(children[i], row);
  }

  function countDrawable(object, row) {
    if (object.isBatchedMesh) {
      countBatched(object, row);
      return;
    }
    const draws = drawsOf(object);
    if (draws === 0) return;
    const instances = object.isInstancedMesh ? object.count : 1;
    if (instances === 0) return;
    row.objects += 1;
    const triangles = object.isMesh ? trianglesOf(object.geometry) * instances : 0;
    const inView = !object.frustumCulled ||
      (object.isSprite ? frustum.intersectsSprite(object) : frustum.intersectsObject(object));
    if (inView) {
      row.drawCalls += draws;
      row.triangles += triangles;
      if (object.isInstancedMesh) row.instances += instances;
    }
    if (object.castShadow && object.isMesh && withinShadowDistance(object)) {
      row.shadowCasters += draws;
      row.shadowTriangles += triangles;
    }
  }

  /**
   * A BatchedMesh is one multi-draw call over its active, visible instances; its index buffer is
   * reserved space, so it counts what the instances' geometry ranges draw. With per-object culling
   * (three's default) only the instances whose bounds meet the view count, as the renderer does.
   */
  function countBatched(object, row) {
    const instanceInfo = object._instanceInfo;
    const geometryInfo = object._geometryInfo;
    if (drawsOf(object) === 0 || !instanceInfo || !geometryInfo) return;
    const objectInView = !object.frustumCulled || frustum.intersectsObject(object);
    const cullEach = object.frustumCulled && object.perObjectFrustumCulled;
    let active = 0;
    let drawn = 0;
    let drawnTriangles = 0;
    let casters = 0;
    let casterTriangles = 0;
    for (let i = 0; i < instanceInfo.length; i += 1) {
      const instance = instanceInfo[i];
      if (!instance.active || !instance.visible) continue;
      const range = geometryInfo[instance.geometryIndex];
      if (!range || range.active === false) continue;
      active += 1;
      const triangles = Math.floor(range.count / 3);
      object.getMatrixAt(i, instanceMatrix);
      object.getBoundingSphereAt(instance.geometryIndex, sphere);
      sphere.applyMatrix4(instanceMatrix).applyMatrix4(object.matrixWorld);
      if (objectInView && (!cullEach || frustum.intersectsSphere(sphere))) {
        drawn += 1;
        drawnTriangles += triangles;
      }
      if (object.castShadow && sphere.center.distanceTo(cameraPosition) - sphere.radius <= shadowDistance) {
        casters += 1;
        casterTriangles += triangles;
      }
    }
    if (active === 0) return;
    row.objects += 1;
    if (drawn > 0) {
      row.drawCalls += 1;
      row.triangles += drawnTriangles;
      row.instances += drawn;
    }
    if (casters > 0) {
      row.shadowCasters += 1;
      row.shadowTriangles += casterTriangles;
    }
  }

  function withinShadowDistance(object) {
    if (object.boundingSphere !== undefined) {
      if (object.boundingSphere === null) object.computeBoundingSphere();
      sphere.copy(object.boundingSphere);
    } else {
      if (object.geometry.boundingSphere === null) object.geometry.computeBoundingSphere();
      sphere.copy(object.geometry.boundingSphere);
    }
    sphere.applyMatrix4(object.matrixWorld);
    return sphere.center.distanceTo(cameraPosition) - sphere.radius <= shadowDistance;
  }

  return { take };
}

/** Draw calls the renderer issues for an object: one per visible material group. */
function drawsOf(object) {
  const material = object.material;
  if (!Array.isArray(material)) return material && material.visible ? 1 : 0;
  const groups = object.geometry.groups;
  if (groups.length === 0) return material[0] && material[0].visible ? 1 : 0;
  let draws = 0;
  for (const group of groups) {
    const groupMaterial = material[group.materialIndex];
    if (groupMaterial && groupMaterial.visible) draws += 1;
  }
  return draws;
}

function trianglesOf(geometry) {
  const count = geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0;
  return Math.floor(Math.min(count, geometry.drawRange.count) / 3);
}

function labelOf(object) {
  return object.name || object.type;
}
