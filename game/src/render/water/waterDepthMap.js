// How deep the sea is at every point of the coast, as a texture: the scene is drawn once from
// straight above with a material that writes "metres below the water level", and the water shader
// reads the result to turn clear and turquoise over the sandbar and to lay foam on the waterline.
// Capturing from above (instead of reading the frame's depth buffer) costs nothing per frame and
// works on every GPU, software ones included.
//
//   const map = captureWaterDepthMap(renderer, scene, { minX: -900, maxX: 300, minZ: -1200, maxZ: 1200 });
//   shared.uDepthMap.value = map.texture;  shared.uDepthBounds.value.copy(map.bounds);

import * as THREE from 'three';

// The batching chunks declare and fetch batchingMatrix for a BatchedMesh (the city batches its
// terrain and street sectors); without them the override material fails to compile on one.
const DEPTH_VERTEX_SHADER = /* glsl */ `
#include <batching_pars_vertex>
varying float vHeight;
void main() {
  #include <batching_vertex>
  vec4 local = vec4(position, 1.0);
  #ifdef USE_BATCHING
    local = batchingMatrix * local;
  #endif
  #ifdef USE_INSTANCING
    local = instanceMatrix * local;
  #endif
  vec4 world = modelMatrix * local;
  vHeight = world.y;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const DEPTH_FRAGMENT_SHADER = /* glsl */ `
uniform float uLevel;
uniform float uDepthMax;
varying float vHeight;
void main() {
  float depth = clamp((uLevel - vHeight) / uDepthMax, 0.0, 1.0);
  gl_FragColor = vec4(depth, depth, depth, 1.0);
}
`;

/**
 * Renders the water depth map of a region.
 * @param {THREE.WebGLRenderer} renderer The game's renderer.
 * @param {THREE.Scene} scene The scene holding the terrain and everything that stands in the water.
 * @param {{minX: number, maxX: number, minZ: number, maxZ: number}} region World rectangle to cover.
 * @param {Object} [options]
 * @param {number} [options.level] World Y of the water surface; default 0.
 * @param {number} [options.maxDepth] Depth in metres at which the map saturates; default 12.
 * @param {number} [options.resolution] Edge length of the map in texels; default 2048.
 * @param {THREE.Object3D[]} [options.hide] Objects to leave out (the water itself, boats, bridges).
 * @param {THREE.WebGLRenderTarget} [options.target] A target from an earlier capture to reuse.
 * @returns {{texture: THREE.Texture, bounds: THREE.Vector4, maxDepth: number, target: THREE.WebGLRenderTarget}}
 *   `bounds` is what the water shader's uDepthBounds expects.
 */
export function captureWaterDepthMap(renderer, scene, region, options = {}) {
  const level = options.level ?? 0;
  const maxDepth = options.maxDepth ?? 12;
  const resolution = Math.min(options.resolution ?? 2048, renderer.capabilities.maxTextureSize);
  const sizeX = region.maxX - region.minX;
  const sizeZ = region.maxZ - region.minZ;

  const target =
    options.target ??
    new THREE.WebGLRenderTarget(resolution, resolution, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      generateMipmaps: false,
    });
  target.texture.name = 'marazul-water-depth';
  target.texture.colorSpace = THREE.NoColorSpace;

  // Looking straight down with north (-Z) at the top of the picture.
  const camera = new THREE.OrthographicCamera(-sizeX / 2, sizeX / 2, sizeZ / 2, -sizeZ / 2, 1, 2000 + maxDepth * 2);
  camera.up.set(0, 0, -1);
  camera.position.set((region.minX + region.maxX) / 2, level + 1000, (region.minZ + region.maxZ) / 2);
  camera.lookAt(camera.position.x, level, camera.position.z);
  camera.updateMatrixWorld();

  const material = new THREE.ShaderMaterial({
    name: 'marazul-water-depth-capture',
    uniforms: { uLevel: { value: level }, uDepthMax: { value: maxDepth } },
    vertexShader: DEPTH_VERTEX_SHADER,
    fragmentShader: DEPTH_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });

  const hidden = [];
  for (const object of options.hide ?? []) {
    if (object.visible) {
      object.visible = false;
      hidden.push(object);
    }
  }

  const previousTarget = renderer.getRenderTarget();
  const previousOverride = scene.overrideMaterial;
  const previousBackground = scene.background;
  const previousShadowAutoUpdate = renderer.shadowMap.autoUpdate;
  const previousAutoClear = renderer.autoClear;
  const previousClearColor = renderer.getClearColor(new THREE.Color());
  const previousClearAlpha = renderer.getClearAlpha();

  scene.overrideMaterial = material;
  scene.background = null;
  renderer.shadowMap.autoUpdate = false;
  renderer.autoClear = true;
  // Where nothing is drawn the sea is deep.
  renderer.setClearColor(0xffffff, 1);
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);

  renderer.setRenderTarget(previousTarget);
  renderer.setClearColor(previousClearColor, previousClearAlpha);
  renderer.autoClear = previousAutoClear;
  renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
  scene.background = previousBackground;
  scene.overrideMaterial = previousOverride;
  for (const object of hidden) object.visible = true;
  material.dispose();

  return {
    texture: target.texture,
    bounds: new THREE.Vector4(region.minX, region.maxZ, 1 / sizeX, -1 / sizeZ),
    maxDepth,
    target,
  };
}
