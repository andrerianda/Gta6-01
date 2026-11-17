// A gentle lens flare: when the sun is in frame and not hidden, a soft veil of glare around it and
// a few faint ghosts strung along the line through the centre of the picture, as a real lens
// would throw. The elements are a handful of small quads added onto the HDR image; their vertex
// shader looks at the depth buffer around the sun to learn how much of it is visible, so the flare
// fades smoothly as the sun slides behind a tower. Cost: far below 0.1 ms.

import * as THREE from 'three';
import { DEPTH_DECODE_GLSL, depthDefinesFor } from './fullscreenPass.js';

/**
 * The flare elements: position along the axis (0 at the sun, 1 at the picture's centre, 2 the
 * mirror point), radius as a fraction of the picture height, shape (0 soft disc, 1 ring, 2 glow),
 * strength, and tint.
 */
const FLARE_ELEMENTS = [
  [0.0, 0.42, 2, 0.16, [1.0, 0.9, 0.78]],
  [0.0, 0.12, 2, 0.22, [1.0, 0.95, 0.9]],
  [0.42, 0.035, 0, 0.05, [0.55, 0.8, 1.0]],
  [0.74, 0.022, 0, 0.07, [1.0, 0.72, 0.42]],
  [1.22, 0.075, 1, 0.035, [0.5, 1.0, 0.72]],
  [1.5, 0.03, 0, 0.05, [0.82, 0.62, 1.0]],
  [1.86, 0.1, 0, 0.022, [1.0, 0.84, 0.6]],
  [2.25, 0.17, 1, 0.016, [0.6, 0.72, 1.0]],
];

const FLARE_VERTEX_SHADER = /* glsl */ `
attribute vec2 corner;
attribute vec4 element;          // axis position, radius, shape, strength
attribute vec3 tint;
uniform sampler2D tDepth;
uniform vec2 uSunUv;
uniform float uAspect;
uniform vec3 uFlareColor;
varying vec2 vCorner;
varying vec3 vColor;
varying float vShape;
${DEPTH_DECODE_GLSL}

void main() {
  // How much of the sun's disc is unobstructed: nine depth probes around its centre.
  float visible = 0.0;
  for (int i = 0; i < 9; i++) {
    vec2 probe = (vec2(float(i % 3), float(i / 3)) - 1.0) * vec2(0.005, 0.005 * uAspect);
    visible += isSkyDepth(texture2D(tDepth, clamp(uSunUv + probe, 0.001, 0.999)).x) ? 1.0 : 0.0;
  }
  visible /= 9.0;

  vec2 sun = uSunUv * 2.0 - 1.0;
  vec2 centre = sun * (1.0 - element.x);
  vec2 position2d = centre + corner * element.y * 2.0 * vec2(1.0 / uAspect, 1.0);
  vCorner = corner;
  vShape = element.z;
  vColor = tint * uFlareColor * element.w * visible * visible;
  gl_Position = vec4(position2d, 0.0, 1.0);
}
`;

const FLARE_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vCorner;
varying vec3 vColor;
varying float vShape;

void main() {
  float r = length(vCorner);
  float shape;
  if (vShape < 0.5) {
    shape = smoothstep(1.0, 0.6, r) * (0.55 + 0.45 * r);
  } else if (vShape < 1.5) {
    shape = smoothstep(1.0, 0.9, r) * smoothstep(0.62, 0.86, r);
  } else {
    float falloff = max(1.0 - r, 0.0);
    shape = falloff * falloff * falloff;
  }
  gl_FragColor = vec4(vColor * shape, 1.0);
}
`;

/**
 * Creates the lens flare.
 * @param {THREE.WebGLRenderer} renderer The game's renderer.
 * @returns {{
 *   render: (target: THREE.WebGLRenderTarget, depth: THREE.Texture, camera: THREE.PerspectiveCamera,
 *     sunUv: THREE.Vector2, color: THREE.Color, strength: number) => void,
 *   dispose: () => void,
 * }}
 */
export function createLensFlare(renderer) {
  const count = FLARE_ELEMENTS.length;
  const corners = new Float32Array(count * 4 * 2);
  const elements = new Float32Array(count * 4 * 4);
  const tints = new Float32Array(count * 4 * 3);
  const indices = new Uint16Array(count * 6);
  const quad = [-1, -1, 1, -1, 1, 1, -1, 1];
  for (let i = 0; i < count; i += 1) {
    const [axis, radius, shape, strength, tint] = FLARE_ELEMENTS[i];
    for (let v = 0; v < 4; v += 1) {
      const vertex = i * 4 + v;
      corners[vertex * 2] = quad[v * 2];
      corners[vertex * 2 + 1] = quad[v * 2 + 1];
      elements.set([axis, radius, shape, strength], vertex * 4);
      tints.set(tint, vertex * 3);
    }
    indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const geometry = new THREE.BufferGeometry();
  // three.js wants a position attribute for bounds; the shader ignores it.
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 4 * 3), 3));
  geometry.setAttribute('corner', new THREE.BufferAttribute(corners, 2));
  geometry.setAttribute('element', new THREE.BufferAttribute(elements, 4));
  geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  const uniforms = {
    tDepth: { value: null },
    uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
    uAspect: { value: 16 / 9 },
    uFlareColor: { value: new THREE.Color(1, 1, 1) },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 1000 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'marazul-lens-flare',
    uniforms,
    defines: depthDefinesFor(renderer),
    vertexShader: FLARE_VERTEX_SHADER,
    fragmentShader: FLARE_FRAGMENT_SHADER,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const camera2d = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  /**
   * Adds the flare onto an HDR target (which must not own the depth texture being read).
   * @param {THREE.WebGLRenderTarget} target The HDR image to add to.
   * @param {THREE.Texture} depth The scene's depth texture.
   * @param {THREE.PerspectiveCamera} camera The game camera.
   * @param {THREE.Vector2} sunUv The sun's position on screen (0..1).
   * @param {THREE.Color} color The flare's colour in scene radiance (sun colour over exposure).
   * @param {number} strength Overall strength; 0 skips the draw.
   */
  function render(target, depth, camera, sunUv, color, strength) {
    if (strength <= 0.001) return;
    const projection = camera.projectionMatrix.elements;
    uniforms.tDepth.value = depth;
    uniforms.uSunUv.value.copy(sunUv);
    uniforms.uAspect.value = projection[5] / projection[0];
    uniforms.uFlareColor.value.copy(color).multiplyScalar(strength);
    uniforms.uCameraNear.value = camera.near;
    uniforms.uCameraFar.value = camera.far;
    renderer.setRenderTarget(target);
    renderer.render(mesh, camera2d);
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { render, dispose };
}
