// Sector near levels: when each dressed sector shows its modelled buildings or its far cards,
// and the scene hook that makes that choice with the very camera being rendered.
//
// The modelled level of a sector exists only while the camera is near: requested (built in the
// background, one sector at a time) inside nearBuildDistance, built at once if the sector must
// show it before that finished (a teleport), dropped beyond nearDropDistance. It is kept out of
// the scene in a holder at the sector's origin and copied into the city-wide near batches while
// the view shows it. The batches and the street item pools change what they hold by the camera;
// done while the renderer projects the scene, a change after a teleport or a camera cut would
// show one frame late (a held picture showed no buildings, no palms). So before each render of
// the scene a hook runs every sector LOD's choice and then `afterLods(camera)` (the pools' level
// pass); the projection that follows sees the finished batches.
//
//   const levels = createSectorNearLevels({ nearBatches, farDistance, afterLods });
//   const detail = levels.createNearDetail(lod, near, far, origin, buildLater, buildNow, onView, onLevel);
//   levels.installViewHook(anyObjectInTheScene);   // once the sectors hang in the scene
import * as THREE from 'three';

/**
 * Creates the near-level controller shared by every sector of a dressing.
 * @param {{nearBatches: {add: Function, remove: Function}, farDistance: number,
 *   afterLods?: (camera: THREE.Camera) => void, viewCamera?: THREE.Camera}} options
 */
export function createSectorNearLevels(options) {
  const { nearBatches, farDistance, afterLods = null } = options;
  /** The game's view camera when known (options.viewCamera or setViewCamera); else any perspective camera. */
  const viewCamera = { camera: options.viewCamera ?? null };
  const nearBuildDistance = farDistance + 50;
  const nearDropDistance = farDistance + 190;
  /** The last view camera's ground position (the pools and wear follow it). */
  const lastCamera = { x: 0, z: 0, known: false };
  /** Every live sector's LOD. */
  const sectorLods = new Set();
  const viewHook = { scene: null, previous: null, hook: null };
  const cameraPosition = new THREE.Vector3();
  let nearQueue = Promise.resolve();

  function installViewHook(object) {
    let root = object;
    while (root.parent) root = root.parent;
    if (!root.isScene || viewHook.scene === root) return;
    removeViewHook();
    const previous = root.onBeforeRender;
    viewHook.scene = root;
    viewHook.previous = previous;
    viewHook.hook = function dressingBeforeRender(renderer, scene, camera, target) {
      previous.call(this, renderer, scene, camera, target);
      // Only the game's view camera moves the levels, pools and wear (city-world 10:50): the wet
      // street mirror, the water depth capture and helper cameras render the scene as it is.
      if (viewCamera.camera ? camera !== viewCamera.camera : !camera?.isPerspectiveCamera) return;
      for (const lod of sectorLods) lod.update(camera);
      afterLods?.(camera);
    };
    root.onBeforeRender = viewHook.hook;
  }

  function removeViewHook() {
    if (viewHook.scene && viewHook.scene.onBeforeRender === viewHook.hook) viewHook.scene.onBeforeRender = viewHook.previous;
    viewHook.scene = null;
  }

  function createNearDetail(lod, near, far, origin, buildLater, buildNow, onView, onLevel) {
    let state = 'none';
    let group = null;
    let generation = 0;
    let showing = false;
    const holder = new THREE.Group();
    holder.position.set(origin.x, 0, origin.z);
    holder.updateMatrixWorld(true);
    let handle = null;
    const setShown = (show) => {
      if (show && group && !handle) handle = nearBatches.add([holder]);
      else if (!show && handle) {
        nearBatches.remove(handle);
        handle = null;
      }
    };
    const attach = (built) => {
      group = built.near;
      holder.add(group);
      holder.updateMatrixWorld(true);
      state = 'built';
      lod.userData.nearBuilt = true;
    };
    const drop = () => {
      generation += 1;
      setShown(false);
      if (group) {
        group.removeFromParent();
        disposeMeshes(group);
        group = null;
      }
      state = 'none';
      lod.userData.nearBuilt = false;
    };
    const detail = {
      holder,
      buildNow() {
        if (state === 'built' || state === 'failed') return;
        generation += 1;
        try {
          attach(buildNow());
        } catch (error) {
          state = 'failed';
          lod.userData.nearError = error;
        }
      },
      request() {
        if (state !== 'none') return undefined;
        state = 'queued';
        const token = ++generation;
        nearQueue = nearQueue.then(async () => {
          if (token !== generation) return;
          state = 'building';
          const built = await buildLater();
          if (token !== generation) disposeMeshes(built.near);
          else attach(built);
        }).catch((error) => {
          state = 'failed';
          lod.userData.nearError = error;
        });
        return nearQueue;
      },
      dispose: drop,
    };
    lod.update = (camera) => {
      cameraPosition.setFromMatrixPosition(camera.matrixWorld);
      const distance = Math.hypot(cameraPosition.x - origin.x, cameraPosition.y, cameraPosition.z - origin.z) / (camera.zoom || 1);
      if (camera.isPerspectiveCamera) {
        lastCamera.x = cameraPosition.x;
        lastCamera.z = cameraPosition.z;
        lastCamera.known = true;
        onView?.(Math.hypot(cameraPosition.x - origin.x, cameraPosition.z - origin.z));
        if (state === 'built' && distance > nearDropDistance) drop();
        else if (distance < farDistance) detail.buildNow();
        else if (distance < nearBuildDistance) detail.request();
      }
      showing = state === 'built' && distance < farDistance * (showing ? 1.05 : 1);
      near.visible = showing;
      far.visible = !showing;
      lod._currentLevel = showing ? 0 : 1;
      // The batches follow the view camera only (not the shadow or capture cameras).
      if (camera.isPerspectiveCamera) {
        setShown(showing);
        onLevel?.(showing);
      }
    };
    return detail;
  }

  return {
    lastCamera,
    sectorLods,
    nearBuildDistance,
    installViewHook,
    removeViewHook,
    /** Whether the hook is on a scene. */
    hooked: () => viewHook.scene !== null,
    /** Names the game's view camera: from then on no other camera runs the hook. */
    setViewCamera(camera) { viewCamera.camera = camera?.isCamera ? camera : null; },
    createNearDetail,
  };
}

/** Disposes the geometries of a group's plain meshes (instanced ones share theirs). */
export function disposeMeshes(group) {
  group.traverse((node) => { if (node.isMesh && !node.isInstancedMesh) node.geometry.dispose(); });
}
