// Wet streets mirror the city. While the ground is wet (in the rain and while it dries after),
// what the street mirrors is drawn again, small, through a camera mirrored under the street's
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
// Cost: one extra render every third frame (the picture is kept between; drawn at once after a
// camera cut), at a quarter of the frame's size, out to MIRROR_FAR metres, without shadows or a
// second matrix update, of a chosen list only (wetReflectionSubjects.js: lamp heads and other
// glows, buildings, car bodies, sky and sea; the streets, ground, people, plants and street items
// stay out); skipped entirely when the ground is dry or the tier has no reflections. `stats`
// tells the last pass's draw calls, triangles and CPU time.

import * as THREE from 'three';
import { createWetReflectionSubjects } from './wetReflectionSubjects.js';

/** Size of the mirror picture as a fraction of the frame, by quality tier; tiers not named: off. */
export const WET_REFLECTION_SCALES = Object.freeze({ high: 0.25, ultra: 0.33, cinematic: 0.5 });
/** How far the mirror sees, metres (beyond, the road near the horizon mirrors the sky). */
export const MIRROR_FAR = 450;
/** The mirror picture is redrawn every this many frames, sooner after a camera cut. */
export const MIRROR_FRAME_INTERVAL = 3;
/** A camera move larger than this (metres, or this cosine of the turn) redraws at once. */
const CUT_DISTANCE = 1.5;
const CUT_COSINE = 0.996;
/** The chosen list is rebuilt every this many passes (new cars and people, streamed sectors). */
const SUBJECTS_REFRESH_PASSES = 20;
/** Below this wetness the streets mirror nothing and the extra pass is skipped. */
const MIN_WETNESS = 0.04;
/** Pulls the mirror's near plane this far above the street, against seams at the kerbs. */
const CLIP_BIAS = 0.003;
/** Stands in for the scene's before-render hook during the mirror's render. */
function skipSceneHook() {}

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
    // A little sideways spread too, so the small picture never shows its pixels.
    float mirrorSpan = clamp(material.roughness * material.roughness * 1.3, 0.006, 0.12);
    vec2 mirrorSide = vec2(1.6 / (uWetMirrorSize.x * WET_MIRROR_SCALE), 0.0);
    vec3 mirrorColour = (texture2D(uWetMirror, mirrorUv + mirrorSide).rgb + texture2D(uWetMirror, mirrorUv - mirrorSide).rgb) * 0.14;
    mirrorColour += (texture2D(uWetMirror, mirrorUv + vec2(0.0, mirrorSpan * 0.3)).rgb + texture2D(uWetMirror, mirrorUv - vec2(0.0, mirrorSpan * 0.3)).rgb) * 0.2;
    mirrorColour += (texture2D(uWetMirror, mirrorUv + vec2(0.0, mirrorSpan * 0.7)).rgb + texture2D(uWetMirror, mirrorUv - vec2(0.0, mirrorSpan * 0.7)).rgb) * 0.16;
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
      .replace('#include <common>', `#include <common>\n#define WET_MIRROR_AMOUNT ${amount.toFixed(3)}\n#define WET_MIRROR_SCALE ${WET_REFLECTION_SCALES.high.toFixed(2)}\n${FRAGMENT_DECLARATION}`)
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
  const subjects = createWetReflectionSubjects();
  const lastEye = new THREE.Vector3(Infinity, 0, 0);
  const lastLook = new THREE.Vector3();
  const stats = { draws: 0, triangles: 0, cpuMs: 0, subjects: 0, pruned: 0, passes: 0 };
  let frame = 0;
  let pictureValid = false;
  let passesSinceRefresh = Infinity;
  mirror.name = 'wet-street-mirror-camera';

  // The pass is started by this empty object, drawn first among the opaque ones.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  const hook = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  hook.name = 'wet-street-mirror';
  hook.frustumCulled = false;
  hook.renderOrder = -1e9;
  hook.userData.stats = stats;

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
    if (target.width !== width || target.height !== height) {
      target.setSize(width, height);
      pictureValid = false;
    }

    // The mirror image of the camera under the plane (as three.js's Reflector places it).
    eye.setFromMatrixPosition(camera.matrixWorld);
    if (eye.y <= planeY + 0.05) return;
    rotation.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rotation);
    // Between redraws the last picture stays, unless the camera has cut away from it.
    const cut = eye.distanceToSquared(lastEye) > CUT_DISTANCE * CUT_DISTANCE || look.dot(lastLook) < CUT_COSINE;
    if (pictureValid && !cut && frame % MIRROR_FRAME_INTERVAL !== 0) return;
    lastEye.copy(eye);
    lastLook.copy(look);
    look.add(eye);
    planePoint.set(eye.x, planeY, eye.z);
    mirror.position.set(eye.x, 2 * planeY - eye.y, eye.z);
    mirror.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
    look.y = 2 * planeY - look.y;
    mirror.lookAt(look);
    mirror.updateMatrixWorld();
    if (camera.isPerspectiveCamera) {
      mirror.fov = camera.fov;
      mirror.aspect = camera.aspect;
      mirror.zoom = camera.zoom;
      mirror.near = camera.near;
      mirror.far = Math.min(camera.far, MIRROR_FAR);
      mirror.updateProjectionMatrix();
    } else {
      mirror.projectionMatrix.copy(camera.projectionMatrix);
    }
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
    const startedAt = performance.now();
    if (passesSinceRefresh >= SUBJECTS_REFRESH_PASSES || subjects.changed()) {
      subjects.refresh(scene);
      passesSinceRefresh = 0;
    }
    passesSinceRefresh += 1;
    const activeFace = renderer.getActiveCubeFace();
    const activeLevel = renderer.getActiveMipmapLevel();
    const shadowUpdate = renderer.shadowMap.autoUpdate;
    const infoReset = renderer.info.autoReset;
    // The frame's own render has just brought every matrix up to date, and has run the scene's
    // before-render hook (the dressing's sector levels, pools and wear for the view camera, from
    // the same ground position): neither runs again for the mirror (the hook would also show the
    // wear decals the pass hides).
    const matrixUpdate = scene.matrixWorldAutoUpdate;
    const sceneHook = scene.onBeforeRender;
    const callsBefore = renderer.info.render.calls;
    const trianglesBefore = renderer.info.render.triangles;
    drawing = true;
    hook.visible = false;
    subjects.hide();
    renderer.shadowMap.autoUpdate = false;
    renderer.info.autoReset = false;
    scene.matrixWorldAutoUpdate = false;
    scene.onBeforeRender = skipSceneHook;
    try {
      renderer.setRenderTarget(target);
      renderer.state.buffers.depth.setMask(true);
      if (renderer.autoClear === false) renderer.clear();
      renderer.render(scene, mirror);
      pictureValid = true;
    } finally {
      scene.onBeforeRender = sceneHook;
      scene.matrixWorldAutoUpdate = matrixUpdate;
      renderer.setRenderTarget(outer, activeFace, activeLevel);
      renderer.shadowMap.autoUpdate = shadowUpdate;
      renderer.info.autoReset = infoReset;
      subjects.restore();
      hook.visible = true;
      drawing = false;
      for (let i = 0; i < objects.length; i += 1) objects[i].visible = hiddenState[i];
      stats.draws = renderer.info.render.calls - callsBefore;
      stats.triangles = renderer.info.render.triangles - trianglesBefore;
      stats.cpuMs = performance.now() - startedAt;
      stats.subjects = subjects.subjects;
      stats.pruned = subjects.pruned;
      stats.passes += 1;
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
      if (Number.isFinite(streetY)) {
        if (Math.abs(streetY - planeY) > 0.05) pictureValid = false;
        planeY = streetY;
      }
      WET_REFLECTION_UNIFORMS.uWetMirrorStrength.value = strength;
      WET_REFLECTION_UNIFORMS.uWetMirrorPlane.value = planeY;
      pending = strength > 0;
      if (!pending) pictureValid = false;
      frame += 1;
    },
    /** Follows the quality tier: WET_REFLECTION_SCALES[tierRow.name], no pass for other tiers. */
    setQuality(tierRow) {
      scale = WET_REFLECTION_SCALES[tierRow?.name] ?? 0;
    },
    get scale() {
      return scale;
    },
    /** The last pass: {draws, triangles, cpuMs, subjects, pruned, passes} (updated in place). */
    stats,
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
