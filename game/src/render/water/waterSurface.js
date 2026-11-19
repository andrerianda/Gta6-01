// A body of water in the world: the open sea (a large disc of mesh that follows the camera, fine
// near it and coarse toward the horizon), or a river, a marina basin or a swimming pool (a mesh
// the caller places). All bodies share the shader of waterShader.js and the frame uniforms made
// by createWaterShared(); each has its own wave set, colours and depth source.
//
//   const shared = createWaterShared(noiseTexture, skyCubeTexture);
//   const sea = createWaterSurface(shared, { kind: 'sea' });
//   scene.add(sea.mesh);
//   sea.update(camera, waveScale);                 // every frame
//   sea.heightAt(x, z);                            // metres, world Y of the surface there

import * as THREE from 'three';
import { seaDiscScale } from '../sea/seaHorizonMaths.js';
import { createRippleNormalTexture } from '../sky/noiseTextures.js';
import { WATER_FRAGMENT_SHADER, WATER_VERTEX_SHADER } from './waterShader.js';
import { createWaveSet, packWaveUniforms, sampleWaveHeight, WAVE_COUNT } from './waveModel.js';

/** Looks per kind of water: colours (linear), visibility through the water, ripple and foam amounts. */
const WATER_KINDS = Object.freeze({
  // The sea starts with a constant depth; the facade switches it to the captured depth map
  // (uConstantDepth = -1) once captureWaterDepth() has run.
  sea: { shallow: [0.09, 0.56, 0.5], deep: [0.012, 0.1, 0.17], clarity: 2.6, ripples: 0.5, constantDepth: 30, foam: 1 },
  marina: { shallow: [0.1, 0.36, 0.36], deep: [0.02, 0.09, 0.12], clarity: 1.8, ripples: 0.3, constantDepth: 4, foam: 0 },
  river: { shallow: [0.14, 0.3, 0.24], deep: [0.035, 0.1, 0.09], clarity: 1.2, ripples: 0.3, constantDepth: 3, foam: 0 },
  pool: { shallow: [0.2, 0.74, 0.8], deep: [0.07, 0.42, 0.6], clarity: 3.5, ripples: 0.16, constantDepth: 1.5, foam: 0 },
});

/** The sea mesh: rings from RING_START metres growing by RING_GROWTH per ring. */
const RING_START = 0.8;
const RING_GROWTH = 1.055;
const RING_COUNT = 172;
const RING_SEGMENTS = 160;
/** Radius of the sea disc at scale 1, metres (about 7.5 km). */
export const SEA_DISC_RADIUS = RING_START * RING_GROWTH ** (RING_COUNT - 1);

/**
 * Creates the uniforms every body of water shares: the clock, the light and the sky to reflect.
 * @param {THREE.Texture} noiseTexture The shared tiling noise texture.
 * @param {THREE.CubeTexture} skyCubeTexture The sky cube from skyEnvironment.js.
 * @returns {Record<string, {value: any}> & {dispose: () => void}}
 */
export function createWaterShared(noiseTexture, skyCubeTexture) {
  const ripples = createRippleNormalTexture(256);
  return {
    uTime: { value: 0 },
    uSkyCube: { value: skyCubeTexture },
    uRipples: { value: ripples },
    uNoise: { value: noiseTexture },
    uKeyDirection: { value: new THREE.Vector3(0, 1, 0) },
    uKeyColor: { value: new THREE.Color(4, 3.8, 3.5) },
    uAmbientColor: { value: new THREE.Color(0.3, 0.4, 0.5) },
    uRain: { value: 0 },
    uReflectionLevel: { value: 1 },
    // The view from altitude (the facade writes both; 0 on the ground changes nothing).
    uHorizonSin: { value: 0 },
    uFarCalm: { value: 0 },
    uDepthMap: { value: null },
    uDepthBounds: { value: new THREE.Vector4(0, 0, 0, 0) },
    uDepthMax: { value: 12 },
    dispose: () => ripples.dispose(),
  };
}

/**
 * Creates a body of water.
 * @param {ReturnType<typeof createWaterShared>} shared The shared water uniforms.
 * @param {Object} [options]
 * @param {'sea' | 'marina' | 'river' | 'pool'} [options.kind] Default 'sea'.
 * @param {number} [options.level] World Y of the resting surface; default 0.
 * @param {THREE.BufferGeometry} [options.geometry] A flat mesh in the XZ plane (y = 0, local
 *   coordinates) for rivers, basins and pools of any outline. Without it the sea gets its
 *   camera-following disc and the other kinds a rectangle of `width` by `length`.
 * @param {number} [options.width] Rectangle size along X, metres.
 * @param {number} [options.length] Rectangle size along Z, metres.
 * @param {number} [options.x] Rectangle or geometry origin, world X.
 * @param {number} [options.z] Rectangle or geometry origin, world Z.
 * @param {number} [options.depth] Constant water depth in metres for bodies without a depth map.
 * @param {number} [options.windAzimuth] Compass direction the waves travel toward, radians.
 * @returns {{
 *   mesh: THREE.Mesh,
 *   kind: string,
 *   level: number,
 *   waves: import('./waveModel.js').WaveSet,
 *   uniforms: Record<string, {value: any}>,
 *   update: (camera: THREE.Camera, waveScale: number, foam: number) => void,
 *   heightAt: (x: number, z: number) => number,
 *   dispose: () => void,
 * }}
 */
export function createWaterSurface(shared, options = {}) {
  const kind = options.kind ?? 'sea';
  const look = WATER_KINDS[kind];
  if (!look) throw new Error(`unknown water kind: ${kind}`);
  const level = options.level ?? 0;
  const waves = createWaveSet(kind, options.windAzimuth);
  const followsCamera = kind === 'sea' && !options.geometry;

  let geometry = options.geometry;
  let ownsGeometry = false;
  if (!geometry) {
    ownsGeometry = true;
    if (followsCamera) {
      geometry = createSeaDiscGeometry();
    } else {
      const width = options.width ?? 10;
      const length = options.length ?? 5;
      const cells = Math.max(1, Math.min(96, Math.round(Math.max(width, length) / 0.75)));
      geometry = new THREE.PlaneGeometry(width, length, cells, cells);
      geometry.rotateX(-Math.PI / 2);
    }
  }

  const waveA = new Float32Array(WAVE_COUNT * 4);
  const waveB = new Float32Array(WAVE_COUNT * 4);
  packWaveUniforms(waves, waveA, waveB);
  const uniforms = {
    ...shared,
    uWaveA: { value: toVector4Array(waveA) },
    uWaveB: { value: toVector4Array(waveB) },
    uWaveScale: { value: 1 },
    uGridSpacing: { value: followsCamera ? RING_GROWTH - 1 : 0 },
    uConstantDepth: { value: options.depth ?? look.constantDepth },
    uShallowColor: { value: new THREE.Color(...look.shallow) },
    uDeepColor: { value: new THREE.Color(...look.deep) },
    uClarity: { value: look.clarity },
    uRippleStrength: { value: look.ripples },
    uFoam: { value: 0 },
  };
  delete uniforms.dispose;

  const material = new THREE.ShaderMaterial({
    name: `marazul-water-${kind}`,
    uniforms,
    vertexShader: WATER_VERTEX_SHADER,
    fragmentShader: WATER_FRAGMENT_SHADER,
    transparent: true,
    premultipliedAlpha: true,
    // Written to depth so that the haze and the depth of field treat the surface as solid.
    depthWrite: true,
    depthTest: true,
    fog: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `marazul-water-${kind}`;
  mesh.position.set(options.x ?? 0, level, options.z ?? 0);
  mesh.frustumCulled = !followsCamera;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // Before other transparent things (glass, particles), which then blend over the water.
  mesh.renderOrder = -10;

  let waveScale = 1;

  /**
   * Per-frame update: follows the camera (sea only) and sets the sea state.
   * @param {THREE.Camera} camera The game camera.
   * @param {number} scale Multiplier on the wave heights (WeatherValues.waveScale).
   * @param {number} foam Crest foam, 0 to 1.
   */
  function update(camera, scale, foam) {
    waveScale = scale;
    uniforms.uWaveScale.value = scale;
    uniforms.uFoam.value = foam * look.foam;
    if (followsCamera) {
      mesh.position.x = camera.matrixWorld.elements[12];
      mesh.position.z = camera.matrixWorld.elements[14];
      // The rings grow geometrically, so a larger disc is the same mesh density at every
      // distance: aloft it is simply stretched until it reaches the horizon.
      const reach = seaDiscScale(camera.matrixWorld.elements[13] - level, SEA_DISC_RADIUS);
      if (reach !== mesh.scale.x) mesh.scale.set(reach, 1, reach);
    }
  }

  /**
   * The world height of the surface at a horizontal position, at the current water time.
   * @param {number} x World X.
   * @param {number} z World Z.
   * @returns {number} World Y in metres.
   */
  function heightAt(x, z) {
    return level + sampleWaveHeight(waves, x, z, shared.uTime.value, waveScale);
  }

  function dispose() {
    material.dispose();
    if (ownsGeometry) geometry.dispose();
  }

  return { mesh, kind, level, waves, uniforms, update, heightAt, dispose };
}

/** A disc in the XZ plane whose rings grow geometrically: dense at the centre, sparse far out. */
function createSeaDiscGeometry() {
  const vertexCount = 1 + RING_COUNT * RING_SEGMENTS;
  const positions = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(RING_SEGMENTS * 3 + (RING_COUNT - 1) * RING_SEGMENTS * 6);
  let radius = RING_START;
  for (let ring = 0; ring < RING_COUNT; ring += 1) {
    // Alternate rings are turned half a segment so that the triangles stay well shaped.
    const twist = ring % 2 === 0 ? 0 : Math.PI / RING_SEGMENTS;
    for (let segment = 0; segment < RING_SEGMENTS; segment += 1) {
      const angle = (segment / RING_SEGMENTS) * Math.PI * 2 + twist;
      const vertex = 1 + ring * RING_SEGMENTS + segment;
      positions[vertex * 3] = Math.cos(angle) * radius;
      positions[vertex * 3 + 2] = Math.sin(angle) * radius;
    }
    radius *= RING_GROWTH;
  }
  let cursor = 0;
  for (let segment = 0; segment < RING_SEGMENTS; segment += 1) {
    indices[cursor++] = 0;
    indices[cursor++] = 1 + ((segment + 1) % RING_SEGMENTS);
    indices[cursor++] = 1 + segment;
  }
  for (let ring = 0; ring < RING_COUNT - 1; ring += 1) {
    const inner = 1 + ring * RING_SEGMENTS;
    const outer = inner + RING_SEGMENTS;
    for (let segment = 0; segment < RING_SEGMENTS; segment += 1) {
      const next = (segment + 1) % RING_SEGMENTS;
      indices[cursor++] = inner + segment;
      indices[cursor++] = inner + next;
      indices[cursor++] = outer + segment;
      indices[cursor++] = inner + next;
      indices[cursor++] = outer + next;
      indices[cursor++] = outer + segment;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

function toVector4Array(packed) {
  const vectors = [];
  for (let i = 0; i < packed.length; i += 4) {
    vectors.push(new THREE.Vector4(packed[i], packed[i + 1], packed[i + 2], packed[i + 3]));
  }
  return vectors;
}
