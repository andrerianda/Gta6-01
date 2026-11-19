// The GLSL of MARAZUL's water. One shader serves the open sea, the river, the marina and swimming
// pools; the bodies differ only in their uniforms (wave set, colours, depth source).
//
// Vertex stage: the surface is displaced by the six trochoidal waves of waveModel.js (the same
// numbers the boat physics samples); toward the shore the waves die down with the depth of the
// water, so the sea meets the sand as a flat sheet. Fragment stage: the normal is the analytic
// slope of those waves plus scrolling layers of fine ripples; the surface reflects the sky cube by
// Fresnel's law, glitters where it mirrors the sun or moon, shows a body colour that goes from
// turquoise over sand to deep blue with depth, turns transparent in the shallows and breaks into
// foam at the waterline and on storm crests.

import { WAVE_COUNT } from './waveModel.js';

/** Depth lookup shared by both stages: `float waterDepthAt(vec2 worldXZ)` in metres. */
const WATER_DEPTH_GLSL = /* glsl */ `
uniform sampler2D uDepthMap;            // water depth over uDepthMax in the red channel
uniform vec4 uDepthBounds;              // min x, max z, 1 / size x, -1 / size z of the depth map
uniform float uDepthMax;
uniform float uConstantDepth;           // metres, for bodies without a depth map; negative: use the map
float waterDepthAt(vec2 place) {
  if (uConstantDepth >= 0.0) return uConstantDepth;
  vec2 depthUv = (place - uDepthBounds.xy) * uDepthBounds.zw;
  float inside = step(0.0, depthUv.x) * step(depthUv.x, 1.0) * step(0.0, depthUv.y) * step(depthUv.y, 1.0);
  return mix(uDepthMax, texture2D(uDepthMap, depthUv).r * uDepthMax, inside);
}
`;

export const WATER_VERTEX_SHADER = /* glsl */ `
uniform vec4 uWaveA[${WAVE_COUNT}];     // direction x, direction z, wavenumber, amplitude
uniform vec4 uWaveB[${WAVE_COUNT}];     // frequency, steepness, phase, unused
uniform float uTime;
uniform float uWaveScale;
uniform float uGridSpacing;             // grid spacing per metre of distance from the camera (0 for a uniform mesh)
varying vec3 vWorldPosition;
varying vec2 vOrigin;                   // the undisplaced horizontal position
varying float vCrest;                   // height relative to the sum of amplitudes, -1..1
varying float vShoal;                   // 0 at the waterline .. 1 in open water
${WATER_DEPTH_GLSL}

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vOrigin = world.xz;
  float range = length(world.xz - cameraPosition.xz);
  float spacing = uGridSpacing * range;
  // Waves lose their height as the bottom comes up.
  vShoal = uConstantDepth < 0.0 ? smoothstep(0.0, 3.2, waterDepthAt(vOrigin)) : 1.0;
  vec3 offset = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < ${WAVE_COUNT}; i++) {
    vec4 a = uWaveA[i];
    vec4 b = uWaveB[i];
    // A wave shorter than a few grid cells cannot be drawn by the mesh: fade it out there. The
    // fragment stage still shades it.
    float wavelength = 6.2831853 / a.z;
    float fade = 1.0 - smoothstep(0.18, 0.4, spacing / wavelength);
    float theta = a.z * dot(a.xy, vOrigin) - b.x * uTime + b.z;
    float amplitude = a.w * uWaveScale * fade * vShoal;
    offset.y += amplitude * sin(theta);
    offset.xz += a.xy * (b.y * amplitude * cos(theta));
    total += a.w * uWaveScale;
  }
  world.xyz += offset;
  vCrest = offset.y / max(total, 1e-4);
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const WATER_FRAGMENT_SHADER = /* glsl */ `
uniform vec4 uWaveA[${WAVE_COUNT}];
uniform vec4 uWaveB[${WAVE_COUNT}];
uniform float uTime;
uniform float uWaveScale;
uniform samplerCube uSkyCube;
uniform sampler2D uRipples;             // two ripple slope fields (rg and ba)
uniform sampler2D uNoise;
uniform vec3 uKeyDirection;             // toward the sun or moon
uniform vec3 uKeyColor;                 // its colour times intensity
uniform vec3 uAmbientColor;             // sky fill on the water
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform float uClarity;                 // metres of water one can see through
uniform float uRippleStrength;
uniform float uFoam;                    // amount of crest foam, 0 calm .. 1 storm
uniform float uRain;                    // rain intensity, roughens the surface
uniform float uReflectionLevel;         // scale of the sky reflection (1 normal)
uniform float uHorizonSin;              // sine of the horizon's drop below the level (0 on the ground)
uniform float uFarCalm;                 // 0 on the ground .. 1 aloft: the far waves calm down
varying vec3 vWorldPosition;
varying vec2 vOrigin;
varying float vCrest;
varying float vShoal;
${WATER_DEPTH_GLSL}

void main() {
  vec3 toEye = cameraPosition - vWorldPosition;
  float range = length(toEye);
  vec3 V = toEye / range;
  // Seen from altitude the flat sea ends on the cone of the round planet's horizon; the sky
  // starts on the same cone (skyDome.js), so the two meet in one curved line.
  if (uHorizonSin > 0.0 && V.y < uHorizonSin) discard;

  // ---- the normal: analytic wave slopes plus fine ripples ----
  vec2 slope = vec2(0.0);
  for (int i = 0; i < ${WAVE_COUNT}; i++) {
    vec4 a = uWaveA[i];
    vec4 b = uWaveB[i];
    float theta = a.z * dot(a.xy, vOrigin) - b.x * uTime + b.z;
    slope += a.xy * (a.w * uWaveScale * a.z * cos(theta));
  }
  // From the air the far swell is smaller than a pixel and would only shimmer: it calms down.
  slope *= vShoal * (1.0 - uFarCalm * smoothstep(500.0, 3500.0, range));
  vec2 p = vWorldPosition.xz;
  vec4 rippleA = texture2D(uRipples, p * 0.085 + uTime * vec2(0.021, 0.013));
  vec4 rippleB = texture2D(uRipples, p * 0.27 + uTime * vec2(-0.034, 0.027));
  vec4 rippleC = texture2D(uRipples, p * 0.021 + uTime * vec2(0.006, -0.004));
  vec2 fine = (rippleA.rg - 0.5) * 0.9 + (rippleB.ba - 0.5) * 0.55 + (rippleC.ba - 0.5) * 0.7;
  // Rain stipples the surface with short, steep ripples.
  fine += (texture2D(uRipples, p * 1.3 + uTime * vec2(0.11, -0.17)).rg - 0.5) * uRain * 0.9;
  // Far away the ripples are smaller than a pixel: keep a little of them, as roughness would.
  float distant = smoothstep(40.0, 700.0, range);
  // Seen from the air, kilometre-wide patches of rougher and smoother water (wind lanes, long
  // swell) replace the ripples, whose repeat would otherwise show as a pattern.
  float patches = 0.5;
  float aloft = uFarCalm * smoothstep(300.0, 2500.0, range);
  if (aloft > 0.0) {
    vec4 wide = texture2D(uNoise, p * 0.00037 + uTime * vec2(0.0004, 0.0002));
    vec4 wider = texture2D(uNoise, p.yx * 0.000061 + vec2(0.27, 0.61));
    patches = wide.r * 0.55 + wider.g * 0.45;
    fine = fine * mix(1.0, 0.35 + 1.1 * patches, aloft) + (wide.gb - 0.5) * 0.05 * aloft;
  }
  slope += fine * uRippleStrength * mix(1.0, 0.45, distant);
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));

  // ---- reflection ----
  float facing = max(dot(N, V), 0.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  // Seen from afar a rough sea shows mostly the facets tilted toward the viewer: it never becomes
  // a perfect mirror, and what it mirrors comes from higher in the sky than the horizon.
  float roughSea = mix(0.35, 1.0, distant) * (0.4 + 0.6 * min(uRippleStrength * 2.5, 1.0));
  fresnel = min(fresnel, mix(0.72, 0.44, roughSea));
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) + 0.03 + 0.16 * roughSea;
  float blur = 1.0 + 3.0 * distant + 2.0 * uRain;
  vec3 skyReflection = textureLod(uSkyCube, normalize(R), blur).rgb * uReflectionLevel;

  // Sun or moon glitter: a tight mirror lobe and a wide sparkle field around it.
  vec3 H = normalize(V + uKeyDirection);
  float nh = max(dot(N, H), 0.0);
  float glitter = pow(nh, 900.0) * 6.0 + pow(nh, 140.0) * 0.55;
  glitter *= smoothstep(-0.02, 0.06, uKeyDirection.y) * (1.0 - 0.7 * uRain);
  vec3 specular = uKeyColor * glitter * (0.25 + 0.75 * fresnel);

  // ---- the body of the water ----
  float depth = waterDepthAt(vOrigin);
  float murk = 1.0 - exp(-depth / max(uClarity, 0.05));
  vec3 bodyColor = mix(uShallowColor, uDeepColor, 1.0 - exp(-depth / (uClarity * 2.0)));
  float sunLight = max(uKeyDirection.y, 0.0) * 0.6 + 0.1;
  vec3 body = bodyColor * (uAmbientColor * 1.5 + uKeyColor * sunLight * 0.5);
  // Light shining through the thin crests of waves that stand between the viewer and a low sun.
  float through = pow(max(dot(V, -uKeyDirection) * 0.5 + 0.5, 0.0), 3.0) * smoothstep(0.1, 0.9, vCrest * 0.5 + 0.5);
  body += uShallowColor * uKeyColor * through * 0.12;
  body *= 1.0 + (patches - 0.5) * 0.3 * aloft;

  // ---- foam: a lace of it at the waterline, and on the crests when the sea is up ----
  float foamNoise = texture2D(uNoise, p * 0.045 + uTime * vec2(0.012, 0.007)).g * 0.6 + texture2D(uNoise, p * 0.17 - uTime * vec2(0.02, 0.011)).r * 0.55;
  float wash = 0.5 + 0.5 * sin(uTime * 0.9 + foamNoise * 5.0 + dot(p, vec2(0.05, 0.03)));
  float shore = 0.0;
  if (uConstantDepth < 0.0) {
    float lace = smoothstep(0.52, 0.86, foamNoise + 0.25 * wash);
    shore = (1.0 - smoothstep(0.015, 0.05 + 0.16 * wash, depth)) * mix(0.55, 1.0, lace);
    // Thinning lace of old foam drifting behind the line, and a fainter line a little farther
    // out where the last wave is breaking.
    shore += (1.0 - smoothstep(0.05, 0.4, depth)) * lace * 0.32;
    shore += (1.0 - smoothstep(0.0, 0.1, abs(depth - 0.6 - 0.2 * wash))) * lace * 0.7;
  }
  float crest = smoothstep(0.62 - 0.3 * uFoam, 0.95, vCrest * 0.5 + 0.5 + (foamNoise - 0.5) * 0.5) * uFoam;
  float foam = clamp(shore + crest * smoothstep(0.35, 0.8, foamNoise), 0.0, 1.0);
  vec3 foamColor = vec3(0.8) * (uAmbientColor * 1.2 + uKeyColor * (0.1 + 0.16 * max(uKeyDirection.y, 0.0)));

  // ---- assembly: premultiplied alpha, so reflections stay full strength over clear shallows ----
  // What is not reflected and not absorbed on the way down comes from the bottom: the background.
  float waterline = uConstantDepth < 0.0 ? smoothstep(0.0, 0.04, depth) : 1.0;
  float alpha = 1.0 - (1.0 - fresnel) * (1.0 - murk);
  vec3 color = body * murk * (1.0 - fresnel) + skyReflection * fresnel + specular;
  color = color * (1.0 - foam) + foamColor * foam;
  alpha = alpha * (1.0 - foam) + foam;

  gl_FragColor = vec4(color * waterline, alpha * waterline);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
