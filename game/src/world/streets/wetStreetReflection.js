// Wet streets mirror the city. While the ground is wet (in the rain and while it dries after),
// the scene is drawn once more each frame, small, through a camera mirrored under the street's
// plane, and the asphalt and paving read that picture where they would reflect the sky: lit
// windows, street lamps, neon and car lamps appear in the road, smeared toward the viewer in
// streaks by the surface's roughness (sharp in the puddles) and bent by its relief. The image
// only replaces the material's sky reflection, so three.js's own Fresnel term decides how much
// shows: little at the feet, most at grazing angles down the street.
//
//   const mirror = createWetStreetReflection({ renderer, scene, camera, hidden: () => objects });
//   applyWetStreetReflection(materials.asphalt, 1);       // once per street material
//   layer.add(mirror.object3d);                           // the pass runs from its onBeforeRender
//   mirror.update(wetness, planeY);                       // every frame
//   mirror.setQuality(tierRow);                           // WET_REFLECTION_SCALES; others: off
//
// Cost: one extra scene render at a fraction of the picture's size (no shadows, the streets and
// ground hidden), skipped entirely when the ground is dry or the tier has no reflections.

import * as THREE from 'three';

/** Size of the mirror picture as a fraction of the frame, by quality tier; tiers not named: off. */
export const WET_REFLECTION_SCALES = Object.freeze({ high: 0.3, ultra: 0.4, cinematic: 0.5 });
/** Below this wetness the streets mirror nothing and the extra pass is skipped. */
const MIN_WETNESS = 0.04;
/** Pulls the mirror's near plane this far above the street, against seams at the kerbs. */
const CLIP_BIAS = 0.003;

/** The shared uniforms of every street material that mirrors (set by the reflection). */
export const WET_REFLECTION_UNIFORMS = {
  uWetMirror: { value: null },
  uWetMirrorStrength: { value: 0 },
  uWetMirrorPlane: { value: 0 },
  uWetMirrorSize: { value: new THREE.Vector2(1, 1) },
};

const VERTEX_DECLARATION = 'varying float vWetMirrorY;';
const VERTEX_BODY = /* glsl */ `
{
  vec4 wetMirrorLocal = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    wetMirrorLocal = batchingMatrix * wetMirrorLocal;
  #endif
  vWetMirrorY = (modelMatrix * wetMirrorLocal).y;
}`;
const FRAGMENT_DECLARATION = /* glsl */ `
varying float vWetMirrorY;
uniform sampler2D uWetMirror;
uniform float uWetMirrorStrength;
uniform float uWetMirrorPlane;
uniform vec2 uWetMirrorSize;
`;
// Runs after the sky's reflection (radiance) is known, before it is weighted by the BRDF.
const FRAGMENT_BODY = /* glsl */ `
if (uWetMirrorStrength > 0.001) {
  vec3 mirrorFlat = inverseTransformDirection(nonPerturbedNormal, viewMatrix);
  float mirrorWeight = uWetMirrorStrength * WET_MIRROR_AMOUNT * smoothstep(0.86, 0.97, mirrorFlat.y)
    * (1.0 - smoothstep(0.8, 2.6, abs(vWetMirrorY - uWetMirrorPlane)));
  if (mirrorWeight > 0.001) {
    // The mirror camera sees the plane flipped left to right.
    vec2 mirrorUv = gl_FragCoord.xy / uWetMirrorSize;
    mirrorUv.x = 1.0 - mirrorUv.x;
    mirrorUv += (normal.xy - nonPerturbedNormal.xy) * vec2(-0.05, 0.03);
    // Roughness smears the image toward the viewer: a vertical streak on the screen.
    float mirrorSpan = clamp(material.roughness * material.roughness * 0.55, 0.0015, 0.09);
    vec3 mirrorColour = texture2D(uWetMirror, mirrorUv).rgb * 0.28;
    mirrorColour += (texture2D(uWetMirror, mirrorUv + vec2(0.0, mirrorSpan * 0.33)).rgb + texture2D(uWetMirror, mirrorUv - vec2(0.0, mirrorSpan * 0.33)).rgb) * 0.22;
    mirrorColour += (texture2D(uWetMirror, mirrorUv + vec2(0.0, mirrorSpan * 0.75)).rgb + texture2D(uWetMirror, mirrorUv - vec2(0.0, mirrorSpan * 0.75)).rgb) * 0.14;
    radiance = mix(radiance, mirrorColour, mirrorWeight);
  }
}
`;

/**
 * Teaches a street material to show the mirror picture where it is wet (once per material; it
 * chains onto the hooks the material already has).
 * @param {THREE.MeshStandardMaterial} material
 * @param {number} amount 1 for asphalt, less for paving that holds less water.
 * @returns {THREE.MeshStandardMaterial} The same material.
 */
export function applyWetStreetReflection(material, amount) {
  if (material.userData.marazulWetMirror) return material;
  material.userData.marazulWetMirror = amount;
  const previousHook = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    if (previousHook) previousHook.call(this, shader, renderer);
    if (!shader.fragmentShader.includes('#include <lights_fragment_end>')) return;
    Object.assign(shader.uniforms, WET_REFLECTION_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_DECLARATION}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n#define WET_MIRROR_AMOUNT ${amount.toFixed(3)}\n${FRAGMENT_DECLARATION}`)
      .replace('#include <lights_fragment_end>', `${FRAGMENT_BODY}\n#include <lights_fragment_end>`);
  };
  material.customProgramCacheKey = function customProgramCacheKey() {
    const base = previousKey ? previousKey.call(this) : '';
    return `${base}|wetMirror:${amount.toFixed(3)}`;
  };
  material.needsUpdate = true;
  return material;
}

/**
 * Creates the mirror pass.
 * @param {Object} options
 * @param {THREE.WebGLRenderer} options.renderer
 * @param {THREE.Camera} options.camera The game's view camera (other cameras never trigger it).
 * @param {() => THREE.Object3D[]} options.hidden What to hide while the mirror picture is drawn
 *   (everything that reads it, and the ground under the streets).
 */
export function createWetStreetReflection({ renderer, camera, hidden }) {
  const target = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, depthBuffer: true });
  target.texture.name = 'wet-street-mirror';
  target.texture.generateMipmaps = false;
  WET_REFLECTION_UNIFORMS.uWetMirror.value = target.texture;
  const mirror = new THREE.PerspectiveCamera();
  mirror.matrixAutoUpdate = true;
  const normal = new THREE.Vector3(0, 1, 0);
  const planePoint = new THREE.Vector3();
  const plane = new THREE.Plane();
  const clipPlane = new THREE.Vector4();
  const q = new THREE.Vector4();
  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  const rotation = new THREE.Matrix4();
  const size = new THREE.Vector2();
  const hiddenState = [];

  // The pass is started by this empty object, drawn first among the opaque ones.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  const hook = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  hook.name = 'wet-street-mirror';
  hook.frustumCulled = false;
  hook.renderOrder = -1e9;

  let scale = 0;
  let strength = 0;
  let planeY = 0;
  let pending = false;
  let drawing = false;

  hook.onBeforeRender = (renderer_, scene, viewCamera) => {
    if (!pending || drawing || viewCamera !== camera || scene.overrideMaterial) return;
    pending = false;
    const outer = renderer.getRenderTarget();
    if (outer) size.set(outer.width, outer.height);
    else renderer.getDrawingBufferSize(size);
    WET_REFLECTION_UNIFORMS.uWetMirrorSize.value.copy(size);
    const width = Math.max(16, Math.round(size.x * scale));
    const height = Math.max(16, Math.round(size.y * scale));
    if (target.width !== width || target.height !== height) target.setSize(width, height);

    // The mirror image of the camera under the plane (as three.js's Reflector places it).
    eye.setFromMatrixPosition(camera.matrixWorld);
    if (eye.y <= planeY + 0.05) return;
    planePoint.set(eye.x, planeY, eye.z);
    rotation.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rotation).add(eye);
    mirror.position.set(eye.x, 2 * planeY - eye.y, eye.z);
    mirror.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
    look.y = 2 * planeY - look.y;
    mirror.lookAt(look);
    mirror.near = camera.near;
    mirror.far = camera.far;
    mirror.updateMatrixWorld();
    mirror.projectionMatrix.copy(camera.projectionMatrix);
    mirror.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    // An oblique near plane on the street: nothing under it is drawn.
    plane.setFromNormalAndCoplanarPoint(normal, planePoint).applyMatrix4(mirror.matrixWorldInverse);
    clipPlane.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = mirror.projectionMatrix.elements;
    q.set((Math.sign(clipPlane.x) + e[8]) / e[0], (Math.sign(clipPlane.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clipPlane.multiplyScalar(2 / clipPlane.dot(q));
    e[2] = clipPlane.x;
    e[6] = clipPlane.y;
    e[10] = clipPlane.z + 1 - CLIP_BIAS;
    e[14] = clipPlane.w;
    mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert();

    const objects = hidden();
    for (let i = 0; i < objects.length; i += 1) {
      hiddenState[i] = objects[i].visible;
      objects[i].visible = false;
    }
    const activeFace = renderer.getActiveCubeFace();
    const activeLevel = renderer.getActiveMipmapLevel();
    const shadowUpdate = renderer.shadowMap.autoUpdate;
    const infoReset = renderer.info.autoReset;
    drawing = true;
    hook.visible = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.info.autoReset = false;
    try {
      renderer.setRenderTarget(target);
      renderer.state.buffers.depth.setMask(true);
      if (renderer.autoClear === false) renderer.clear();
      renderer.render(scene, mirror);
    } finally {
      renderer.setRenderTarget(outer, activeFace, activeLevel);
      renderer.shadowMap.autoUpdate = shadowUpdate;
      renderer.info.autoReset = infoReset;
      hook.visible = true;
      drawing = false;
      for (let i = 0; i < objects.length; i += 1) objects[i].visible = hiddenState[i];
    }
  };

  return {
    object3d: hook,
    /** The mirror picture (HDR, linear), for inspection. */
    texture: target.texture,
    /**
     * Prepares the next frame's mirror.
     * @param {number} wetness The atmosphere's wetness, 0 dry .. 1 soaked.
     * @param {number} streetY Height of the street under the camera's subject.
     */
    update(wetness, streetY) {
      strength = scale > 0 && wetness > MIN_WETNESS ? Math.min(1, (wetness - MIN_WETNESS) / 0.3) : 0;
      if (Number.isFinite(streetY)) planeY = streetY;
      WET_REFLECTION_UNIFORMS.uWetMirrorStrength.value = strength;
      WET_REFLECTION_UNIFORMS.uWetMirrorPlane.value = planeY;
      pending = strength > 0;
    },
    /** Follows the quality tier: WET_REFLECTION_SCALES[tierRow.name], no pass for other tiers. */
    setQuality(tierRow) {
      scale = WET_REFLECTION_SCALES[tierRow?.name] ?? 0;
    },
    get scale() {
      return scale;
    },
    dispose() {
      hook.removeFromParent();
      geometry.dispose();
      hook.material.dispose();
      target.dispose();
      if (WET_REFLECTION_UNIFORMS.uWetMirror.value === target.texture) WET_REFLECTION_UNIFORMS.uWetMirror.value = null;
      WET_REFLECTION_UNIFORMS.uWetMirrorStrength.value = 0;
    },
  };
}
