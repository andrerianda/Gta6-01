// Draws the particle pool in one instanced draw call: camera-facing quads (or streaks stretched
// along their motion, for sparks and embers), sorted far to near and blended premultiplied, so
// that smoke hides what is behind it while flames, sparks and glows add light. Smoke is lit as a
// soft ball by the atmosphere's key light (sun or moon) and sky fill, glows forward toward the sun
// when backlit, takes the colour of the fire under it through its emission, fades where it meets
// the ground (a cheap stand-in for soft particles: the scene's depth is the target being drawn)
// and near the camera, and is hazed like the world around it. Flame cards (a style's `pull`) are
// drawn nearer the camera along the eye ray, so the body they rise from does not cut them, and
// their glow flickers with the effect clock (uTime, held while the effects are frozen).

import * as THREE from 'three';
import { PARTICLE_ATTRIBUTE_FLOATS, sortParticlesFarToNear, writeParticleLook } from './particlePool.js';

const VERTEX = /* glsl */ `
attribute vec4 iPos;
attribute vec4 iVel;
attribute vec4 iAlbedo;
attribute vec4 iEmit;
attribute vec4 iMisc;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform float uTime;
varying vec2 vUv;
varying vec2 vLocal;
varying vec4 vAlbedo;
varying vec3 vEmit;
varying vec3 vWorld;
varying float vFloor;
varying float vSize;
varying vec2 vLitOcclusion;
varying float vFlicker;
varying float vAge;
varying float vWisp;
varying float vSeed;
void main() {
  vec3 centre = iPos.xyz;
  float size = iPos.w;
  vec2 corner = position.xy;
  vec3 offset;
  if (iVel.w > 0.0) {
    vec2 v = vec2(dot(iVel.xyz, uCamRight), dot(iVel.xyz, uCamUp));
    float speed = length(v);
    vec2 dir = speed > 1e-4 ? v / speed : vec2(0.0, 1.0);
    vec2 side = vec2(-dir.y, dir.x);
    float len = size + speed * iVel.w;
    vec2 o = side * corner.x * size + dir * (corner.y - 0.5) * len;
    offset = uCamRight * o.x + uCamUp * o.y;
  } else {
    float c = cos(iMisc.x);
    float s = sin(iMisc.x);
    vec2 o = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y) * size;
    offset = uCamRight * o.x + uCamUp * o.y;
  }
  vec3 world = centre + offset;
  vFlicker = 1.0;
  if (iVel.w < 0.0) {
    // a flame card: drawn nearer the camera so the body it rises from does not cut it, its glow
    // flickering on two beats with a phase of its own
    world += normalize(cameraPosition - centre) * size * -iVel.w;
    float seed = iMisc.x * 23.0 + iMisc.y * 1.7 + centre.x * 0.9 + centre.z * 1.3;
    vFlicker = 0.72 + 0.17 * sin(uTime * 21.0 + seed) + 0.11 * sin(uTime * 8.7 + seed * 2.3);
  }
  vWorld = world;
  vLocal = corner * 2.0;
  float frame = floor(iMisc.y);
  vAge = fract(iMisc.y) * 1.0204;
  vWisp = floor(iMisc.w) * 0.1;
  vSeed = frame * 3.7;
  float col = mod(frame, 4.0);
  float row = floor(frame / 4.0);
  vUv = vec2((col + corner.x + 0.5) * 0.25, (3.0 - row + corner.y + 0.5) * 0.25);
  vAlbedo = iAlbedo;
  vEmit = iEmit.rgb;
  vFloor = iEmit.w;
  vSize = size;
  vLitOcclusion = vec2(iMisc.z, fract(iMisc.w) * 2.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  if (size <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamBack;
uniform vec3 uEye;
uniform vec3 uKeyDirection;
uniform vec3 uKeyLight;
uniform vec3 uSkyLight;
uniform vec3 uGroundLight;
uniform vec3 uFogColor;
uniform float uFogDensity;
varying vec2 vUv;
varying vec2 vLocal;
varying vec4 vAlbedo;
varying vec3 vEmit;
varying vec3 vWorld;
varying float vFloor;
varying float vSize;
varying vec2 vLitOcclusion;
varying float vFlicker;
varying float vAge;
varying float vWisp;
varying float vSeed;
uniform float uTime;
float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  vec4 tex = texture2D(uAtlas, vUv);
  float density = tex.a;
  float thin = 0.0;
  if (vWisp > 0.0) {
    // Smoke, not cotton (shift 13): the cell's round edge melts into a soft falloff and is eaten
    // by drifting noise that grows with age, so a puff tears into wisps as it thins. One octave
    // is taken in the camera's plane in world metres, so neighbouring puffs (a rocket's rope, a
    // column) share their holes and tendrils and read as one body rather than separate balls.
    vec2 plane = vec2(dot(vWorld, uCamRight), dot(vWorld, uCamUp));
    vec2 local = vLocal * 1.6 + vec2(vSeed, vSeed * 0.61);
    float drift = uTime * 0.3 + vAge * 1.4;
    float n = valueNoise(local + vec2(0.0, -drift)) * 0.45
      + valueNoise(local * 2.6 + vec2(drift * 1.3, 0.0)) * 0.25
      + valueNoise(plane * 0.9 + vec2(uTime * 0.12, -uTime * 0.35)) * 0.3;
    float r = length(vLocal);
    density *= mix(1.0, 1.0 - smoothstep(0.2, 1.0, r), vWisp);
    float erode = vWisp * (0.32 + 0.55 * vAge);
    density = clamp((density - erode * (1.15 - n)) / max(0.2, 1.0 - erode * 0.75), 0.0, 1.0);
    density *= mix(1.0, 0.55 + 0.9 * n, vWisp);
    thin = vWisp;
  }
  float floorFade = clamp((vWorld.y - vFloor) / max(0.05, vSize * 0.35), 0.0, 1.0);
  float eyeDistance = distance(vWorld, uEye);
  float nearFade = clamp((eyeDistance - 0.4) / 1.2, 0.0, 1.0);
  // wisp 1 (a back-blast's burst) clears within ~4.5 m of the eye: blown back toward the camera
  // behind the shooter it must never veil the lead (owner, shift 13)
  if (vWisp > 0.95) nearFade *= clamp((eyeDistance - 1.2) / 3.3, 0.0, 1.0);
  // a puff that would fill much of the view (as wide as it is far away: a back-blast rolling past
  // the aim camera) thins out instead of veiling the picture (shift 12)
  nearFade *= clamp((1.4 - vSize / max(eyeDistance, 0.1)) / 0.7, 0.0, 1.0);
  float coverage = min(1.0, density) * vAlbedo.a * floorFade * nearFade;
  if (coverage < 0.002) discard;
  // a ball of smoke: a normal bulging toward the camera, lit with a wrapped diffuse term,
  // darker inside where it is dense, brighter at the rim toward the light
  vec2 p = clamp(vLocal, -1.0, 1.0);
  float bulge = sqrt(max(0.0, 1.0 - dot(p, p) * 0.7));
  // the atlas' red channel is the height of the puff's lobes: its screen-space slope bends the
  // normal so that every lobe catches the light on its own side
  float unitsPerPixel = max(1e-4, length(fwidth(vLocal)) * 0.7071);
  vec2 slope = vec2(dFdx(tex.r), dFdy(tex.r)) / unitsPerPixel;
  // wispy smoke keeps only a hint of the lobes' bumps (each lobe lit on its own read as cotton)
  slope = clamp(slope, -4.0, 4.0) * vLitOcclusion.x * (1.0 - 0.7 * thin);
  vec3 normal = normalize(uCamRight * (p.x * 0.7 - slope.x * 0.35) + uCamUp * (p.y * 0.7 - slope.y * 0.35) + uCamBack * bulge);
  float facing = dot(normal, uKeyDirection);
  float wrapped = clamp((facing + 0.45) / 1.45, 0.0, 1.0);
  vec3 viewDir = normalize(vWorld - uEye);
  float forward = pow(max(0.0, dot(viewDir, uKeyDirection)), 6.0) * (1.0 - min(1.0, density) * 0.6);
  // thick smoke shades itself: darker where dense, the sunward side lit (wispy styles)
  float thick = smoothstep(0.25, 0.95, density * vAlbedo.a * 1.4) * thin;
  float selfShadow = (0.45 + 0.55 * clamp(tex.r * 1.2, 0.0, 1.0)) * (1.0 - 0.35 * thick);
  vec3 fill = mix(uGroundLight, uSkyLight, normal.y * 0.5 + 0.5);
  vec3 light = uKeyLight * (wrapped * selfShadow + forward * 1.6) + fill * (0.55 + 0.45 * selfShadow) * (1.0 - 0.25 * thick);
  vec3 albedo = vAlbedo.rgb;
  vec3 shaded = mix(albedo, albedo * light, vLitOcclusion.x);
  float heat = tex.g;
  // weighted by the cube of the lobe height: a billow glows in its middle and is dark soot at
  // its torn edge (flames and sparks paint red near 1, so they keep their full emission)
  vec3 emission = vEmit * (0.05 + 1.3 * tex.r * tex.r * tex.r) * (1.0 + heat * 1.5);
  emission += vec3(1.0, 0.85, 0.6) * heat * heat * dot(vEmit, vec3(0.2));
  emission *= vFlicker;
  float occlusion = coverage * vLitOcclusion.y;
  vec3 colour = shaded * occlusion + emission * coverage;
  float fog = 1.0 - exp(-eyeDistance * uFogDensity);
  colour = colour * (1.0 - fog) + uFogColor * occlusion * fog;
  gl_FragColor = vec4(colour, occlusion);
}`;

/**
 * Creates the particle renderer for a pool.
 * @param {ReturnType<import('./particlePool.js').createParticlePool>} pool
 * @param {THREE.Texture} atlas The particle atlas (effectTextures.js).
 * @returns {{mesh: THREE.Mesh, uniforms: object, draw: (styles: object[], camera: THREE.Camera) => void, dispose: () => void}}
 */
export function createParticleRenderer(pool, atlas) {
  const capacity = pool.capacity;
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const look = new Float32Array(PARTICLE_ATTRIBUTE_FLOATS);
  const names = ['iPos', 'iVel', 'iAlbedo', 'iEmit', 'iMisc'];
  const attributes = names.map((name) => {
    const attribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, attribute);
    return attribute;
  });
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);

  const uniforms = {
    uAtlas: { value: atlas },
    uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    uCamUp: { value: new THREE.Vector3(0, 1, 0) },
    uCamBack: { value: new THREE.Vector3(0, 0, 1) },
    // effect time (it stops while the effects are frozen for a picture): the flames' flicker
    uTime: { value: 0 },
    uEye: { value: new THREE.Vector3() },
    uKeyDirection: { value: new THREE.Vector3(0, 1, 0) },
    uKeyLight: { value: new THREE.Color(1, 1, 1) },
    uSkyLight: { value: new THREE.Color(0.4, 0.45, 0.5) },
    uGroundLight: { value: new THREE.Color(0.2, 0.18, 0.15) },
    uFogColor: { value: new THREE.Color(0.7, 0.75, 0.8) },
    uFogDensity: { value: 0.0005 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'effects-particles',
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'effects-particles';
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  mesh.matrixAutoUpdate = false;

  const order = new Uint16Array(capacity);
  const keys = new Uint16Array(capacity);
  const buckets = new Uint32Array(64);
  const eye = uniforms.uEye.value;

  return {
    mesh,
    uniforms,
    /** Fills the instance attributes from the pool, sorted for the camera. */
    draw(styles, camera) {
      const e = camera.matrixWorld.elements;
      uniforms.uCamRight.value.set(e[0], e[1], e[2]).normalize();
      uniforms.uCamUp.value.set(e[4], e[5], e[6]).normalize();
      uniforms.uCamBack.value.set(e[8], e[9], e[10]).normalize();
      eye.set(e[12], e[13], e[14]);
      const count = pool.count;
      geometry.instanceCount = count;
      mesh.visible = count > 0;
      if (count === 0) return;
      sortParticlesFarToNear(pool, eye.x, eye.y, eye.z, order, keys, buckets);
      for (let k = 0; k < count; k += 1) {
        writeParticleLook(pool, styles, order[k], look, 0);
        const o = k * 4;
        for (let a = 0; a < 5; a += 1) {
          const target = attributes[a].array;
          const s = a * 4;
          target[o] = look[s]; target[o + 1] = look[s + 1]; target[o + 2] = look[s + 2]; target[o + 3] = look[s + 3];
        }
      }
      for (let a = 0; a < 5; a += 1) {
        const attribute = attributes[a];
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, count * 4);
        attribute.needsUpdate = true;
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
