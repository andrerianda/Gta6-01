// Ambient occlusion from the depth buffer: the soft darkening where a car meets the road, a wall
// meets the pavement, or two buildings crowd a lane, which grounds objects when the sun's own
// shadows are far away or absent.
//
// Half resolution. For each pixel the view-space position and normal are rebuilt from depth, a
// spiral of samples around it measures how much nearby geometry rises above the surface's tangent
// plane, and a depth-aware separable blur removes the sampling noise without bleeding across
// silhouettes. Cost on a mid-range GPU at 1080p: about 0.7 ms with 8 samples, 0.9 ms with 12.

import { DEPTH_DECODE_GLSL, depthDefinesFor } from './fullscreenPass.js';

const OCCLUSION_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDepth;
uniform vec2 uDepthTexel;       // one texel of the depth buffer, in UV
uniform vec2 uTanHalfFov;       // tangent of half the horizontal and vertical field of view
uniform float uRadius;          // world-space sampling radius, metres
uniform float uIntensity;
${DEPTH_DECODE_GLSL}

vec3 viewPositionAt(vec2 uv) {
  float z = viewDepth(texture2D(tDepth, uv).x);
  return vec3((uv * 2.0 - 1.0) * uTanHalfFov * z, -z);
}

float gradientNoise(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
  float depth = texture2D(tDepth, vUv).x;
  if (isSkyDepth(depth)) {
    gl_FragColor = vec4(1.0);
    return;
  }
  float z = viewDepth(depth);
  vec3 P = vec3((vUv * 2.0 - 1.0) * uTanHalfFov * z, -z);

  // The surface normal from depth: on each axis use the neighbour that lies on the same surface.
  vec3 left = viewPositionAt(vUv - vec2(uDepthTexel.x, 0.0));
  vec3 right = viewPositionAt(vUv + vec2(uDepthTexel.x, 0.0));
  vec3 down = viewPositionAt(vUv - vec2(0.0, uDepthTexel.y));
  vec3 up = viewPositionAt(vUv + vec2(0.0, uDepthTexel.y));
  vec3 dx = abs(right.z - P.z) < abs(P.z - left.z) ? right - P : P - left;
  vec3 dy = abs(up.z - P.z) < abs(P.z - down.z) ? up - P : P - down;
  vec3 N = cross(dx, dy);
  float normalLength = length(N);
  N = normalLength > 1e-12 ? N / normalLength : vec3(0.0, 0.0, 1.0);

  // The sampling disc: uRadius metres projected to the screen, kept within sensible pixel bounds.
  vec2 radiusUv = uRadius / (z * uTanHalfFov) * 0.5;
  float pixels = radiusUv.y / uDepthTexel.y;
  if (pixels < 1.5) {
    gl_FragColor = vec4(1.0, sqrt(clamp(z / uCameraFar, 0.0, 1.0)), 0.0, 1.0);
    return;
  }
  radiusUv *= min(1.0, 90.0 / pixels);

  float rotation = gradientNoise(gl_FragCoord.xy) * 6.2831853;
  float occlusion = 0.0;
  float radius2 = uRadius * uRadius;
  for (int i = 0; i < AO_SAMPLES; i++) {
    float t = (float(i) + 0.5) / float(AO_SAMPLES);
    float angle = rotation + float(i) * 2.3999632;
    vec2 offset = vec2(cos(angle), sin(angle)) * (0.12 + 0.88 * t);
    vec3 S = viewPositionAt(vUv + offset * radiusUv);
    vec3 v = S - P;
    float distance2 = dot(v, v);
    float above = dot(v, N) - 0.004 * z - 0.015;
    float reach = max(1.0 - distance2 / radius2, 0.0);
    occlusion += max(above, 0.0) * inversesqrt(distance2 + 1e-4) * reach * reach;
  }
  float ao = clamp(1.0 - uIntensity * occlusion * (2.2 / float(AO_SAMPLES)), 0.0, 1.0);
  // The blur needs the depth beside the occlusion to stop at silhouettes.
  gl_FragColor = vec4(ao, sqrt(clamp(z / uCameraFar, 0.0, 1.0)), 0.0, 1.0);
}
`;

const BLUR_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tOcclusion;
uniform vec2 uStep;             // one texel along the blur axis, in UV
uniform float uCameraFar;

void main() {
  vec2 centre = texture2D(tOcclusion, vUv).rg;
  float centreZ = centre.g * centre.g * uCameraFar;
  float tolerance = 1.0 / (0.035 * centreZ + 0.08);
  float sum = centre.r * 0.2270;
  float weightSum = 0.2270;
  for (int i = 1; i <= 3; i++) {
    float gauss = i == 1 ? 0.1946 : (i == 2 ? 0.1216 : 0.0541);
    for (int side = -1; side <= 1; side += 2) {
      vec2 tap = texture2D(tOcclusion, vUv + uStep * float(i * side) * 1.4).rg;
      float tapZ = tap.g * tap.g * uCameraFar;
      float weight = gauss * clamp(1.0 - abs(tapZ - centreZ) * tolerance, 0.0, 1.0);
      sum += tap.r * weight;
      weightSum += weight;
    }
  }
  gl_FragColor = vec4(sum / weightSum, centre.g, 0.0, 1.0);
}
`;

/**
 * Creates the ambient occlusion stage.
 * @param {ReturnType<import('./fullscreenPass.js').createFullscreenDrawer>} drawer The shared fullscreen drawer.
 * @param {import('three').WebGLRenderer} renderer The game's renderer.
 * @returns {{
 *   texture: import('three').Texture,
 *   setSize: (width: number, height: number) => void,
 *   setSamples: (count: number) => void,
 *   render: (depthTexture: import('three').Texture, camera: import('three').PerspectiveCamera, radius: number, intensity: number) => void,
 *   dispose: () => void,
 * }} `texture` holds the blurred occlusion in its red channel (1 is unoccluded) at half resolution.
 */
export function createAmbientOcclusionPass(drawer, renderer) {
  const depthDefines = depthDefinesFor(renderer);
  let occlusionTarget = drawer.createTarget(2, 2);
  let blurTarget = drawer.createTarget(2, 2);

  const occlusionMaterial = drawer.createMaterial(
    'marazul-ambient-occlusion',
    OCCLUSION_FRAGMENT_SHADER,
    {
      tDepth: { value: null },
      uDepthTexel: { value: new Float32Array([1, 1]) },
      uTanHalfFov: { value: new Float32Array([1, 1]) },
      uRadius: { value: 1.1 },
      uIntensity: { value: 1 },
      uCameraNear: { value: 0.1 },
      uCameraFar: { value: 1000 },
    },
    { ...depthDefines, AO_SAMPLES: 12 },
  );
  const blurMaterial = drawer.createMaterial('marazul-ambient-occlusion-blur', BLUR_FRAGMENT_SHADER, {
    tOcclusion: { value: null },
    uStep: { value: new Float32Array([0, 0]) },
    uCameraFar: { value: 1000 },
  });

  const pass = { texture: occlusionTarget.texture, setSize, setSamples, render, dispose };

  /** Sizes the stage for a full-resolution frame of the given pixel size. */
  function setSize(width, height) {
    occlusionTarget.setSize(Math.max(1, width >> 1), Math.max(1, height >> 1));
    blurTarget.setSize(Math.max(1, width >> 1), Math.max(1, height >> 1));
    occlusionMaterial.uniforms.uDepthTexel.value[0] = 1 / Math.max(1, width);
    occlusionMaterial.uniforms.uDepthTexel.value[1] = 1 / Math.max(1, height);
  }

  /** Sets the number of samples per pixel (8 is the budget setting, 12 the high one). */
  function setSamples(count) {
    if (occlusionMaterial.defines.AO_SAMPLES !== count) {
      occlusionMaterial.defines.AO_SAMPLES = count;
      occlusionMaterial.needsUpdate = true;
    }
  }

  /**
   * Computes the occlusion of the current frame.
   * @param {import('three').Texture} depthTexture The scene's depth texture.
   * @param {import('three').PerspectiveCamera} camera The camera the scene was drawn with.
   * @param {number} radius World-space reach of the occlusion in metres.
   * @param {number} intensity Strength; 1 is the tuned default.
   */
  function render(depthTexture, camera, radius, intensity) {
    const uniforms = occlusionMaterial.uniforms;
    const projection = camera.projectionMatrix.elements;
    uniforms.tDepth.value = depthTexture;
    uniforms.uTanHalfFov.value[0] = 1 / projection[0];
    uniforms.uTanHalfFov.value[1] = 1 / projection[5];
    uniforms.uRadius.value = radius;
    uniforms.uIntensity.value = intensity;
    uniforms.uCameraNear.value = camera.near;
    uniforms.uCameraFar.value = camera.far;
    drawer.draw(occlusionMaterial, occlusionTarget);

    blurMaterial.uniforms.uCameraFar.value = camera.far;
    blurMaterial.uniforms.tOcclusion.value = occlusionTarget.texture;
    blurMaterial.uniforms.uStep.value[0] = 1 / occlusionTarget.width;
    blurMaterial.uniforms.uStep.value[1] = 0;
    drawer.draw(blurMaterial, blurTarget);

    blurMaterial.uniforms.tOcclusion.value = blurTarget.texture;
    blurMaterial.uniforms.uStep.value[0] = 0;
    blurMaterial.uniforms.uStep.value[1] = 1 / occlusionTarget.height;
    drawer.draw(blurMaterial, occlusionTarget);
  }

  function dispose() {
    occlusionTarget.dispose();
    blurTarget.dispose();
    occlusionMaterial.dispose();
    blurMaterial.dispose();
  }

  return pass;
}
