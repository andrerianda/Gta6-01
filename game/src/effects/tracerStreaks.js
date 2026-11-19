// Tracers drawn in screen space: each shot leaves a short bright segment on the line from the
// muzzle to where the round lands, laid out along that line AS SEEN ON SCREEN. From the
// over-the-shoulder camera a round flies almost straight away from the eye, so a streak sized in
// world metres shrinks to a dot; here the visible piece covers a fixed share of the on-screen line
// (its head running from the muzzle toward the aim point as it ages), keeps a width of a few
// pixels whatever the distance, and fades out over TRACER_LIFE (60 ms). Each end is still a real
// point in the world (projected exactly, with depth), so walls and bodies in front hide it.
// One pooled instanced draw while any tracer is alive; nothing is allocated per frame.

import * as THREE from 'three';

/** Seconds a tracer shows. */
export const TRACER_LIFE = 0.06;
/** Share of the muzzle-to-target line the visible piece covers, and where its head starts. */
export const TRACER_SPAN = 0.55;
export const TRACER_HEAD_START = 0.22;
const FLOATS = 8; // ax ay az, bx by bz, age, life

const VERTEX = /* glsl */ `
attribute vec4 iStart;
attribute vec4 iEnd;
uniform float uWidth;
uniform float uSpan;
uniform float uHeadStart;
varying vec2 vCoord;
varying float vFade;
void main() {
  vec4 a = projectionMatrix * viewMatrix * vec4(iStart.xyz, 1.0);
  vec4 b = projectionMatrix * viewMatrix * vec4(iEnd.xyz, 1.0);
  const float NEAR = 0.05;
  vCoord = position.xy;
  vFade = iEnd.w;
  if (a.w < NEAR && b.w < NEAR) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  // keep both ends in front of the eye
  if (b.w < NEAR) b = mix(a, b, (a.w - NEAR) / (a.w - b.w));
  if (a.w < NEAR) a = mix(b, a, (b.w - NEAR) / (b.w - a.w));
  float progress = iStart.w;
  float head = min(1.0, uHeadStart + (1.0 + uSpan - uHeadStart) * progress);
  float tail = max(0.0, head - uSpan);
  // a share s of the on-screen line is the point u of the world segment (perspective-exact)
  float s = mix(tail, head, position.x);
  float u = s * a.w / max(1e-6, s * a.w + (1.0 - s) * b.w);
  vec4 c = mix(a, b, u);
  float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
  vec2 d = (b.xy / b.w - a.xy / a.w) * vec2(aspect, 1.0);
  float len = length(d);
  d = len > 1e-5 ? d / len : vec2(1.0, 0.0);
  vec2 side = vec2(-d.y, d.x) / vec2(aspect, 1.0);
  // thinner toward the tail
  c.xy += side * position.y * uWidth * mix(0.45, 1.0, position.x) * c.w;
  gl_Position = c;
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uGlow;
varying vec2 vCoord;
varying float vFade;
void main() {
  float across = abs(vCoord.y);
  float core = 1.0 - smoothstep(0.0, 0.42, across);
  float glow = (1.0 - across) * (1.0 - across);
  // brightest at the head, rounded off at its very end
  float along = vCoord.x * vCoord.x * smoothstep(1.0, 0.9, vCoord.x);
  gl_FragColor = vec4((uCore * core + uGlow * glow) * along * vFade, 0.0);
}`;

/**
 * Creates the tracer pool and its mesh (add `mesh` to the effects layer).
 * @param {number} [capacity] Tracers alive at once (the oldest is reused when full).
 */
export function createTracerStreaks(capacity = 32) {
  const state = new Float32Array(capacity * FLOATS);
  let cursor = 0;
  let alive = 0;

  const geometry = new THREE.InstancedBufferGeometry();
  // x: 0 at the tail .. 1 at the head; y: -1 .. 1 across
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const start = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  const end = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  start.setUsage(THREE.DynamicDrawUsage);
  end.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('iStart', start);
  geometry.setAttribute('iEnd', end);
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  const material = new THREE.ShaderMaterial({
    name: 'effects-tracers',
    uniforms: {
      // half width in screen heights (about 3.5 px across at 480 px high)
      uWidth: { value: 0.0072 },
      uSpan: { value: TRACER_SPAN },
      uHeadStart: { value: TRACER_HEAD_START },
      uCore: { value: new THREE.Color(20, 14, 6) },
      uGlow: { value: new THREE.Color(3.2, 1.5, 0.4) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'effects-tracers';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 21;
  mesh.visible = false;

  return {
    mesh,
    capacity,
    /** Tracers showing now. */
    get count() { return alive; },

    /** Starts a tracer from (ax, ay, az) to (bx, by, bz). @returns {number} Its slot. */
    add(ax, ay, az, bx, by, bz, life = TRACER_LIFE) {
      const slot = cursor;
      cursor = (cursor + 1) % capacity;
      const o = slot * FLOATS;
      if (!(state[o + 7] > 0)) alive += 1;
      state[o] = ax; state[o + 1] = ay; state[o + 2] = az;
      state[o + 3] = bx; state[o + 4] = by; state[o + 5] = bz;
      state[o + 6] = 0; state[o + 7] = life;
      return slot;
    },

    /** Ages the tracers by `dt` seconds. */
    update(dt) {
      if (alive === 0 || !(dt > 0)) return;
      for (let i = 0; i < capacity; i += 1) {
        const o = i * FLOATS;
        if (!(state[o + 7] > 0)) continue;
        state[o + 6] += dt;
        if (state[o + 6] >= state[o + 7]) { state[o + 7] = 0; alive -= 1; }
      }
    },

    /** How far tracer `slot` is through its life (0..1), or -1 when it is not showing. */
    progressOf(slot) {
      const o = slot * FLOATS;
      return state[o + 7] > 0 ? state[o + 6] / state[o + 7] : -1;
    },

    /** Writes the living tracers into the instance buffers. */
    prepare() {
      mesh.visible = alive > 0;
      geometry.instanceCount = alive;
      if (alive === 0) return;
      const s = start.array; const e = end.array;
      let k = 0;
      for (let i = 0; i < capacity && k < alive; i += 1) {
        const o = i * FLOATS;
        if (!(state[o + 7] > 0)) continue;
        const progress = state[o + 6] / state[o + 7];
        const fade = 1 - progress;
        const w = k * 4;
        s[w] = state[o]; s[w + 1] = state[o + 1]; s[w + 2] = state[o + 2]; s[w + 3] = progress;
        e[w] = state[o + 3]; e[w + 1] = state[o + 4]; e[w + 2] = state[o + 5]; e[w + 3] = fade * (0.6 + 0.4 * fade);
        k += 1;
      }
      start.clearUpdateRanges(); start.addUpdateRange(0, k * 4); start.needsUpdate = true;
      end.clearUpdateRanges(); end.addUpdateRange(0, k * 4); end.needsUpdate = true;
    },

    /** Removes every tracer. */
    clear() {
      for (let i = 0; i < capacity; i += 1) state[i * FLOATS + 7] = 0;
      alive = 0;
      mesh.visible = false;
      geometry.instanceCount = 0;
    },

    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
