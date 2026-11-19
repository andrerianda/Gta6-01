// The cloud deck seen from above: once the camera has climbed through the cumulus, the clouds are
// no longer a painting on the sky dome but a broken white layer lying at CLOUD_DECK_HEIGHT with
// the sea below it. One flat disc of 48 triangles follows the camera; its shader shapes the
// clouds with the same noise, cover and drift as the dome's deck (sky/cloudDeck.js), anchored to
// the world so that the aircraft travels over them, and lets them thin out toward the horizon.
// The dome's deck fades out below the layer and this one fades in above it (seaHorizonMaths.js),
// so the camera never pops through a ceiling.

import * as THREE from 'three';
import { HAZE_COLOR_GLSL } from '../sky/skyShaderChunks.js';
import { CLOUD_DECK_HEIGHT } from './seaHorizonMaths.js';

/**
 * Creates the cloud layer seen from above.
 * @param {Record<string, {value: any}>} skyUniforms The sky's uniforms (atmosphere.skyUniforms):
 *   the cloud cover, light and drift and the haze colours are shared by reference.
 * @returns {{
 *   mesh: THREE.Mesh,
 *   update: (camera: THREE.Camera, opacity: number, reach: number, horizonSine: number) => void,
 *   dispose: () => void,
 * }}
 */
export function createCloudDeckFromAbove(skyUniforms) {
  const uniforms = {
    uNoise: skyUniforms.uNoise,
    uCloudOffset: skyUniforms.uCloudOffset,
    uCloudCover: skyUniforms.uCloudCover,
    uOvercast: skyUniforms.uOvercast,
    uCloudLight: skyUniforms.uCloudLight,
    uCloudAmbient: skyUniforms.uCloudAmbient,
    uKeyDirection: skyUniforms.uKeyDirection,
    uSunDirection: skyUniforms.uSunDirection,
    uHorizonColor: skyUniforms.uHorizonColor,
    uHorizonSunColor: skyUniforms.uHorizonSunColor,
    uOpacity: { value: 0 },
    uReach: { value: 30000 },
    uHorizonSin: { value: 0 },
  };
  const geometry = new THREE.CircleGeometry(1, 48);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    name: 'marazul-cloud-deck-from-above',
    uniforms,
    vertexShader: DECK_VERTEX_SHADER,
    fragmentShader: DECK_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'marazul-cloud-deck-from-above';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.visible = false;
  // Over the water (-10), under glass and particles.
  mesh.renderOrder = -5;
  mesh.position.y = CLOUD_DECK_HEIGHT;

  /**
   * Places the layer for a frame.
   * @param {THREE.Camera} camera The game camera.
   * @param {number} opacity 0 below the deck .. 1 well above it (AltitudeLook.cloudsFromAbove).
   * @param {number} reach Radius of the layer, metres.
   * @param {number} horizonSine Sine of the horizon's drop (AltitudeLook.horizonSine).
   */
  function update(camera, opacity, reach, horizonSine) {
    mesh.visible = opacity > 0.003;
    if (!mesh.visible) return;
    mesh.position.x = camera.matrixWorld.elements[12];
    mesh.position.z = camera.matrixWorld.elements[14];
    mesh.scale.set(reach, 1, reach);
    uniforms.uOpacity.value = opacity;
    uniforms.uReach.value = reach;
    uniforms.uHorizonSin.value = horizonSine;
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { mesh, update, dispose };
}

const DECK_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldPosition;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/** Noise-UV units per metre: the dome's 0.085 per unit of (xz / height) at the deck's height. */
const DECK_UV_PER_METRE = 0.085 / CLOUD_DECK_HEIGHT;

const DECK_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uNoise;
uniform vec4 uCloudOffset;
uniform float uCloudCover;
uniform float uOvercast;
uniform vec3 uCloudLight;
uniform vec3 uCloudAmbient;
uniform vec3 uKeyDirection;
uniform vec3 uSunDirection;
uniform vec3 uHorizonColor;
uniform vec3 uHorizonSunColor;
uniform float uOpacity;
uniform float uReach;
uniform float uHorizonSin;
varying vec3 vWorldPosition;
${HAZE_COLOR_GLSL}

float deckShape(vec2 uv) {
  vec4 broad = texture2D(uNoise, uv);
  vec4 detail = texture2D(uNoise, uv * 3.3 + vec2(0.37, 0.11));
  float crumble = texture2D(uNoise, uv * 13.0 + vec2(0.71, 0.23)).g;
  return broad.r * 0.6 + broad.g * 0.3 + (detail.r - 0.5) * 0.3 + (detail.b - 0.5) * 0.14 + (detail.a - 0.5) * 0.1 + (crumble - 0.5) * 0.1 + 0.06;
}

void main() {
  vec3 toEye = cameraPosition - vWorldPosition;
  float range = length(toEye);
  vec3 V = toEye / range;
  if (V.y < max(uHorizonSin, 0.004)) discard;

  vec2 uv = vWorldPosition.xz * ${DECK_UV_PER_METRE.toExponential(4)} + uCloudOffset.xy;
  // Weather systems far wider than the noise tile: fields of cloud and open lanes between them,
  // so that no repeat shows from 20 km up.
  float fields = texture2D(uNoise, uv.yx * 0.083 + vec2(0.19, 0.47)).r + texture2D(uNoise, uv * 0.29 + vec2(0.63, 0.05)).g - 1.0;
  float edge = mix(0.8, 0.16, uCloudCover) - fields * 0.3 * (1.0 - uOvercast);
  float softness = mix(0.15, 0.34, uOvercast);
  float shape = deckShape(uv);
  float density = smoothstep(edge, edge + softness, shape);

  // The tops stand in full light; a step toward the sun tells which side of a tower is lit.
  vec2 towardKey = normalize(uKeyDirection.xz + vec2(1e-4, 0.0)) * 0.012;
  float sunward = smoothstep(edge, edge + softness, deckShape(uv + towardKey));
  float relief = clamp(0.62 + (density - sunward) * 0.9 + (shape - edge) * 0.5, 0.25, 1.15);
  float day = max(uKeyDirection.y, 0.0);
  vec3 color = uCloudLight * relief * (0.55 + 0.75 * day) + uCloudAmbient * (0.75 + 0.35 * density);

  // Toward the horizon the layer is seen edge on through ever more air: it melts into the haze.
  float away = length(vWorldPosition.xz - cameraPosition.xz);
  float within = 1.0 - smoothstep(0.3 * uReach, 0.92 * uReach, away);
  float air = 1.0 - exp(-range * 0.000018);
  color = mix(color, hazeColor(-V), air);
  float alpha = density * uOpacity * within * smoothstep(0.004, 0.06, V.y);

  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
