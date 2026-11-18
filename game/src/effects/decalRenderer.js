// Draws the decal pool in one instanced draw call: flat quads laid on the ground or a wall, that
// multiply the colour of the surface under them (scorch and tyre rubber darken it, blood stains
// it red), so they need no lighting of their own and sit right in sun, shade and lamplight.
// Pulled toward the camera by a polygon offset so they never fight with the surface.

import * as THREE from 'three';

const VERTEX = /* glsl */ `
attribute vec4 iDecal;
varying vec2 vUv;
varying float vOpacity;
void main() {
  float frame = iDecal.x;
  float col = mod(frame, 2.0);
  float row = floor(frame / 2.0);
  vUv = vec2((col + uv.x) * 0.5, (1.0 - row + uv.y) * 0.5);
  vOpacity = iDecal.y;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  if (iDecal.y <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying float vOpacity;
void main() {
  vec4 tex = texture2D(uAtlas, vUv);
  float a = tex.a * vOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(vec3(1.0), tex.rgb, a), 1.0);
}`;

const LIFT = 0.03;

/**
 * Creates the decal renderer for a pool.
 * @param {ReturnType<import('./decalPool.js').createDecalPool>} pool
 * @param {THREE.Texture} atlas The decal atlas (effectTextures.js).
 */
export function createDecalRenderer(pool, atlas) {
  const capacity = pool.capacity;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const decalAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  decalAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('iDecal', decalAttribute);
  const material = new THREE.ShaderMaterial({
    name: 'effects-decals',
    uniforms: { uAtlas: { value: atlas } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.SrcColorFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = 'effects-decals';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.matrixAutoUpdate = false;
  mesh.count = capacity;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let s = 0; s < capacity; s += 1) mesh.setMatrixAt(s, zero);

  const matrix = new THREE.Matrix4();
  const e = matrix.elements;

  function writeSlot(s) {
    const opacity = pool.visibleOpacity(s);
    decalAttribute.array[s * 4] = pool.frame[s];
    decalAttribute.array[s * 4 + 1] = opacity;
    if (opacity <= 0) { mesh.setMatrixAt(s, zero); return; }
    const nx = pool.nx[s]; const ny = pool.ny[s]; const nz = pool.nz[s];
    // tangent: across the mark; on the ground at angle 0 it points east and the length north
    let tx; let ty; let tz;
    if (Math.abs(ny) > 0.9) { tx = ny; ty = 0; tz = 0; } else { tx = -nz; ty = 0; tz = nx; }
    let l = Math.hypot(tx, ty, tz) || 1;
    tx /= l; ty /= l; tz /= l;
    let bx = ny * tz - nz * ty; let by = nz * tx - nx * tz; let bz = nx * ty - ny * tx;
    const c = Math.cos(pool.angle[s]); const sn = Math.sin(pool.angle[s]);
    const rx = tx * c + bx * sn; const ry = ty * c + by * sn; const rz = tz * c + bz * sn;
    bx = bx * c - tx * sn; by = by * c - ty * sn; bz = bz * c - tz * sn;
    l = 1;
    const w = pool.width[s]; const len = pool.length[s];
    e[0] = rx * w; e[1] = ry * w; e[2] = rz * w; e[3] = 0;
    e[4] = bx * len; e[5] = by * len; e[6] = bz * len; e[7] = 0;
    e[8] = nx * l; e[9] = ny * l; e[10] = nz * l; e[11] = 0;
    e[12] = pool.x[s] + nx * LIFT; e[13] = pool.y[s] + ny * LIFT; e[14] = pool.z[s] + nz * LIFT; e[15] = 1;
    mesh.setMatrixAt(s, matrix);
  }

  return {
    mesh,
    /** Rebuilds the instances whose slots changed or are fading. */
    sync() {
      if (pool.dirtyFrom > pool.dirtyTo) return;
      const from = pool.dirtyFrom; const to = pool.dirtyTo;
      for (let s = from; s <= to; s += 1) writeSlot(s);
      decalAttribute.clearUpdateRanges();
      decalAttribute.addUpdateRange(from * 4, (to - from + 1) * 4);
      decalAttribute.needsUpdate = true;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(from * 16, (to - from + 1) * 16);
      mesh.instanceMatrix.needsUpdate = true;
      pool.clean();
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
