// The first-run GPU benchmark: shades a fixed, moderately heavy picture a few times off screen
// and times it, so the game can pick a quality tier for the machine before the city is built
// (qualityAutoSelection.js turns the time into a tier). It takes well under a tenth of a second
// on any real GPU and is skipped on a software renderer.
import * as THREE from 'three';

/**
 * Runs the benchmark.
 * @param {THREE.WebGLRenderer} renderer The game's renderer.
 * @param {Object} [options]
 * @param {number} [options.size] Edge of the test picture in pixels; default 512.
 * @param {number} [options.passes] Timed passes; default 6.
 * @param {() => number} [options.now] A millisecond clock; default performance.now.
 * @returns {{millisecondsPerPass: number, maxTextureSize: number}} The time of one pass (0 when
 *   the measurement failed) and the GPU's largest texture edge.
 */
export function measureGpuBenchmark(renderer, options = {}) {
  const size = options.size ?? 512;
  const passes = options.passes ?? 6;
  const now = options.now ?? (() => performance.now());
  const maxTextureSize = renderer.capabilities.maxTextureSize;

  const target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: false });
  const material = new THREE.ShaderMaterial({
    name: 'gpu-benchmark',
    uniforms: { uPass: { value: 0 } },
    vertexShader: BENCHMARK_VERTEX_SHADER,
    fragmentShader: BENCHMARK_FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
  });
  const triangle = new THREE.Mesh(new THREE.BufferGeometry(), material);
  triangle.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  triangle.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(triangle);
  const camera = new THREE.Camera();
  const pixel = new Uint8Array(4);
  const previousTarget = renderer.getRenderTarget();

  let millisecondsPerPass = 0;
  try {
    // Reading a pixel back makes the GPU finish what it was given: without it the timer would
    // only measure how fast commands are queued.
    const drawAndWait = (pass) => {
      material.uniforms.uPass.value = pass;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel);
    };
    drawAndWait(0);   // compiles the shader and warms the pipeline up
    const started = now();
    for (let pass = 1; pass <= passes; pass += 1) drawAndWait(pass);
    millisecondsPerPass = (now() - started) / passes;
  } catch {
    millisecondsPerPass = 0;
  } finally {
    renderer.setRenderTarget(previousTarget);
    target.dispose();
    material.dispose();
    triangle.geometry.dispose();
  }
  return { millisecondsPerPass, maxTextureSize };
}

const BENCHMARK_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** About a hundred trigonometric noise taps per pixel: a stand-in for the game's shading load. */
const BENCHMARK_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;
  uniform float uPass;
  void main() {
    vec2 p = vUv * 9.0 + uPass;
    float sum = 0.0;
    for (int i = 0; i < 96; i++) {
      p = vec2(p.x * 0.8 - p.y * 0.6, p.x * 0.6 + p.y * 0.8) * 1.03 + 0.37;
      sum += sin(p.x) * cos(p.y) + fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }
    gl_FragColor = vec4(fract(sum * 0.01), 0.5, 0.5, 1.0);
  }
`;
