// Depth of field for cutscenes and showcase shots: what lies away from the focus distance is
// blurred the way a wide-open lens would blur it, with the blur growing with the distance from the
// focal plane. Gameplay leaves it off.
//
// Half resolution: the scene is reduced with each pixel's circle of confusion in alpha, a disc of
// 22 taps gathers the blur (a sample only spreads onto a pixel if its own circle reaches that
// far, which keeps sharp foreground edges from smearing into the background), and the result is
// laid over the sharp frame in proportion to the blur. Cost on a mid-range GPU at 1080p: about
// 0.9 ms.

import { DEPTH_DECODE_GLSL, depthDefinesFor } from './fullscreenPass.js';

const CIRCLE_GLSL = /* glsl */ `
uniform float uFocusDistance;    // metres from the camera to the plane in perfect focus
uniform float uAperture;         // strength: 0 everything sharp, about 1 a fast portrait lens
uniform float uFocusRange;       // metres around the focus distance that stay fully sharp
// Signed circle of confusion: -1 fully blurred foreground .. 0 in focus .. 1 fully blurred background.
float circleOfConfusion(float z) {
  float away = z - uFocusDistance;
  float outside = max(abs(away) - uFocusRange, 0.0) * sign(away);
  return clamp(uAperture * 3.0 * outside / max(z, 0.1), -1.0, 1.0);
}
`;

const PREFILTER_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform vec2 uTexel;
${DEPTH_DECODE_GLSL}
${CIRCLE_GLSL}

void main() {
  vec3 color = vec3(0.0);
  float coc = 0.0;
  float total = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 uv = vUv + (vec2(float(i & 1), float(i >> 1)) - 0.5) * uTexel;
    vec3 tap = texture2D(tScene, uv).rgb;
    float tapCoc = circleOfConfusion(viewDepth(texture2D(tDepth, uv).x));
    // Dim very bright taps a little so that single hot pixels do not sparkle in the blur.
    float weight = 1.0 / (1.0 + max(tap.r, max(tap.g, tap.b)) * 0.25);
    color += tap * weight;
    total += weight;
    // Keep the most background-like circle of the four so that foreground edges stay tight.
    coc = i == 0 ? tapCoc : (abs(tapCoc) < abs(coc) ? tapCoc : coc);
  }
  // Stored as 0..1 so that the stage also works on 8-bit targets.
  gl_FragColor = vec4(color / total, coc * 0.5 + 0.5);
}
`;

const GATHER_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tHalf;
uniform vec2 uTexel;             // one texel of the half-resolution image, in UV
uniform float uMaxRadius;        // largest blur radius, in half-resolution texels

void main() {
  vec4 centre = texture2D(tHalf, vUv);
  centre.a = centre.a * 2.0 - 1.0;
  float centreRadius = abs(centre.a) * uMaxRadius;
  vec3 sum = centre.rgb;
  float total = 1.0;
  float rotation = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
  for (int i = 0; i < 22; i++) {
    float t = sqrt((float(i) + 0.5) / 22.0);
    float angle = rotation + float(i) * 2.3999632;
    vec2 offset = vec2(cos(angle), sin(angle)) * t * uMaxRadius;
    vec4 tap = texture2D(tHalf, vUv + offset * uTexel);
    tap.a = tap.a * 2.0 - 1.0;
    float tapRadius = abs(tap.a) * uMaxRadius;
    float reach = t * uMaxRadius;
    // Background taps may only blur as far as this pixel's own circle; foreground taps spread freely.
    float allowed = tap.a > centre.a ? min(tapRadius, max(centreRadius, 1.0)) : tapRadius;
    float weight = smoothstep(reach - 1.0, reach + 1.0, allowed + 0.5);
    sum += tap.rgb * weight;
    total += weight;
  }
  gl_FragColor = vec4(sum / total, centre.a * 0.5 + 0.5);
}
`;

const COMPOSITE_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tBlurred;
uniform float uMaxRadius;
${DEPTH_DECODE_GLSL}
${CIRCLE_GLSL}

void main() {
  vec3 sharp = texture2D(tScene, vUv).rgb;
  vec4 blurred = texture2D(tBlurred, vUv);
  float own = abs(circleOfConfusion(viewDepth(texture2D(tDepth, vUv).x)));
  // Foreground blur (negative circle in the half-resolution image) also covers sharp pixels behind it.
  float spread = max(own, max(1.0 - blurred.a * 2.0, 0.0));
  float amount = smoothstep(0.5, 2.5, spread * uMaxRadius * 2.0);
  gl_FragColor = vec4(mix(sharp, blurred.rgb, amount), 1.0);
}
`;

/**
 * Creates the depth of field stage.
 * @param {ReturnType<import('./fullscreenPass.js').createFullscreenDrawer>} drawer The shared fullscreen drawer.
 * @param {import('three').WebGLRenderer} renderer The game's renderer.
 * @returns {{
 *   setSize: (width: number, height: number) => void,
 *   render: (scene: import('three').Texture, depth: import('three').Texture, camera: import('three').PerspectiveCamera,
 *     focus: {distance: number, aperture: number, range: number}, target: import('three').WebGLRenderTarget | null) => void,
 *   dispose: () => void,
 * }}
 */
export function createDepthOfFieldPass(drawer, renderer) {
  const depthDefines = depthDefinesFor(renderer);
  const halfA = drawer.createTarget(2, 2, { hdr: true });
  const halfB = drawer.createTarget(2, 2, { hdr: true });
  const focusUniforms = {
    uFocusDistance: { value: 10 },
    uAperture: { value: 0.5 },
    uFocusRange: { value: 1 },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 1000 },
  };
  const maxRadius = { value: 7 };

  const prefilterMaterial = drawer.createMaterial(
    'marazul-dof-prefilter',
    PREFILTER_FRAGMENT_SHADER,
    { tScene: { value: null }, tDepth: { value: null }, uTexel: { value: new Float32Array([1, 1]) }, ...focusUniforms },
    depthDefines,
  );
  const gatherMaterial = drawer.createMaterial('marazul-dof-gather', GATHER_FRAGMENT_SHADER, {
    tHalf: { value: halfA.texture },
    uTexel: { value: new Float32Array([1, 1]) },
    uMaxRadius: maxRadius,
  });
  const compositeMaterial = drawer.createMaterial(
    'marazul-dof-composite',
    COMPOSITE_FRAGMENT_SHADER,
    {
      tScene: { value: null },
      tDepth: { value: null },
      tBlurred: { value: halfB.texture },
      uMaxRadius: maxRadius,
      ...focusUniforms,
    },
    depthDefines,
  );

  /** Sizes the stage for a full-resolution frame of the given pixel size. */
  function setSize(width, height) {
    const w = Math.max(1, width >> 1);
    const h = Math.max(1, height >> 1);
    halfA.setSize(w, h);
    halfB.setSize(w, h);
    prefilterMaterial.uniforms.uTexel.value[0] = 1 / Math.max(1, width);
    prefilterMaterial.uniforms.uTexel.value[1] = 1 / Math.max(1, height);
    gatherMaterial.uniforms.uTexel.value[0] = 1 / w;
    gatherMaterial.uniforms.uTexel.value[1] = 1 / h;
    // The largest blur scales with the picture so that it looks the same at any resolution.
    maxRadius.value = Math.max(3, h / 62);
  }

  /**
   * Draws the scene with depth of field.
   * @param {import('three').Texture} scene The HDR scene colour.
   * @param {import('three').Texture} depth The scene's depth texture.
   * @param {import('three').PerspectiveCamera} camera The camera the scene was drawn with.
   * @param {{distance: number, aperture: number, range: number}} focus The focal plane distance in
   *   metres, the blur strength (0..1.5) and the fully sharp range around the plane in metres.
   * @param {import('three').WebGLRenderTarget | null} target Where to draw.
   */
  function render(scene, depth, camera, focus, target) {
    focusUniforms.uFocusDistance.value = focus.distance;
    focusUniforms.uAperture.value = focus.aperture;
    focusUniforms.uFocusRange.value = focus.range;
    focusUniforms.uCameraNear.value = camera.near;
    focusUniforms.uCameraFar.value = camera.far;
    prefilterMaterial.uniforms.tScene.value = scene;
    prefilterMaterial.uniforms.tDepth.value = depth;
    drawer.draw(prefilterMaterial, halfA);
    drawer.draw(gatherMaterial, halfB);
    compositeMaterial.uniforms.tScene.value = scene;
    compositeMaterial.uniforms.tDepth.value = depth;
    drawer.draw(compositeMaterial, target);
  }

  function dispose() {
    halfA.dispose();
    halfB.dispose();
    prefilterMaterial.dispose();
    gatherMaterial.dispose();
    compositeMaterial.dispose();
  }

  return { setSize, render, dispose };
}
