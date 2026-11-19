// The plumbing every post-processing stage shares: one triangle that covers the screen, a helper
// that draws a shader with it into a render target, and render-target constructors that choose an
// HDR format when the GPU can render to one and fall back to 8 bits when it cannot (some software
// renderers).

import * as THREE from 'three';

/** The vertex shader of every fullscreen stage: passes the screen UV through. */
export const FULLSCREEN_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Creates the fullscreen drawer.
 * @param {THREE.WebGLRenderer} renderer The game's renderer.
 * @returns {{
 *   hdrType: number,
 *   hdrSupported: boolean,
 *   draw: (material: THREE.Material, target: THREE.WebGLRenderTarget | null) => void,
 *   createMaterial: (name: string, fragmentShader: string, uniforms: Record<string, {value: any}>, defines?: Record<string, any>) => THREE.ShaderMaterial,
 *   createTarget: (width: number, height: number, options?: {hdr?: boolean, depthTexture?: boolean, samples?: number, linear?: boolean}) => THREE.WebGLRenderTarget,
 *   dispose: () => void,
 * }}
 */
export function createFullscreenDrawer(renderer) {
  const hdrSupported =
    renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const hdrType = hdrSupported ? THREE.HalfFloatType : THREE.UnsignedByteType;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mesh = new THREE.Mesh(geometry, null);
  mesh.frustumCulled = false;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  /**
   * Draws a fullscreen shader into a target (null is the canvas). The target is not cleared: a
   * fullscreen stage overwrites every pixel (or blends on purpose).
   */
  function draw(material, target) {
    mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(mesh, camera);
  }

  /** Makes a fullscreen ShaderMaterial with depth testing and tone mapping switched off. */
  function createMaterial(name, fragmentShader, uniforms, defines = {}) {
    return new THREE.ShaderMaterial({
      name,
      uniforms,
      defines,
      vertexShader: FULLSCREEN_VERTEX_SHADER,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
  }

  /**
   * Makes a render target for post-processing.
   * `hdr` asks for half-float colour (8 bits when unsupported); `depthTexture` attaches a readable
   * depth texture; `samples` asks for multisampling; `linear` (default true) selects bilinear
   * filtering instead of nearest.
   */
  function createTarget(width, height, options = {}) {
    const filter = options.linear === false ? THREE.NearestFilter : THREE.LinearFilter;
    const target = new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
      type: options.hdr ? hdrType : THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: filter,
      magFilter: filter,
      depthBuffer: options.depthTexture === true,
      stencilBuffer: false,
      samples: options.samples ?? 0,
      generateMipmaps: false,
    });
    target.texture.colorSpace = THREE.NoColorSpace;
    if (options.depthTexture) {
      const depth = new THREE.DepthTexture(Math.max(1, width), Math.max(1, height));
      depth.type = THREE.UnsignedIntType;
      depth.minFilter = THREE.NearestFilter;
      depth.magFilter = THREE.NearestFilter;
      target.depthTexture = depth;
    }
    return target;
  }

  function dispose() {
    geometry.dispose();
  }

  return { hdrType, hdrSupported, draw, createMaterial, createTarget, dispose };
}

/**
 * GLSL that turns a depth-buffer sample into view-space distance along the camera axis, for all
 * three depth conventions three.js can run with. Requires the uniforms
 * `uCameraNear`, `uCameraFar` and the defines DEPTH_REVERSED or DEPTH_LOGARITHMIC when they apply.
 * `float viewDepth(float bufferDepth)` returns positive metres; `bool isSkyDepth(float)` tells
 * whether nothing was drawn at the pixel.
 */
export const DEPTH_DECODE_GLSL = /* glsl */ `
uniform float uCameraNear;
uniform float uCameraFar;
float viewDepth(float d) {
  #if defined(DEPTH_LOGARITHMIC)
    return pow(uCameraFar + 1.0, d) - 1.0;
  #elif defined(DEPTH_REVERSED)
    return uCameraNear * uCameraFar / (uCameraNear + d * (uCameraFar - uCameraNear));
  #else
    return uCameraNear * uCameraFar / (uCameraFar - d * (uCameraFar - uCameraNear));
  #endif
}
bool isSkyDepth(float d) {
  #if defined(DEPTH_REVERSED)
    return d <= 0.0000001;
  #else
    return d >= 0.9999999;
  #endif
}
`;

/**
 * The defines that DEPTH_DECODE_GLSL needs for a renderer.
 * @param {THREE.WebGLRenderer} renderer The game's renderer.
 * @returns {Record<string, number>}
 */
export function depthDefinesFor(renderer) {
  const defines = {};
  if (renderer.capabilities.reversedDepthBuffer === true) defines.DEPTH_REVERSED = 1;
  else if (renderer.capabilities.logarithmicDepthBuffer === true) defines.DEPTH_LOGARITHMIC = 1;
  return defines;
}
