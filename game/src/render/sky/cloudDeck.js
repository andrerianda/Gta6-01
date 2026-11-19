// The procedural cloud deck: a low layer of cumulus with sunlit edges and soft grey undersides,
// thin high cirrus above it, both drifting with the wind. It is a shader chunk for the sky dome
// (so the environment map captures the clouds too) plus the small state that moves the deck.
//
// The clouds are flat layers seen from below, shaped by the shared tiling noise texture: four
// texture reads for the cumulus (two for its shape, two toward the sun for its shading) and two
// for the cirrus. Cover, darkness and the overcast ceiling come from the weather.

/**
 * Uniforms and `vec4 cloudDeck(vec3 viewDirection, vec3 skyBehind)`, which returns the cloud
 * colour (rgb, linear radiance) and how much of the sky behind it is hidden (a). Requires
 * HAZE_COLOR_GLSL and the uniform uKeyDirection from skyShaderChunks.js.
 */
export const CLOUD_DECK_GLSL = /* glsl */ `
uniform sampler2D uNoise;
uniform vec4 uCloudOffset;        // xy drift of the cumulus, zw drift of the cirrus (noise UV units)
uniform float uCloudCover;
uniform float uCloudDarkness;
uniform float uOvercast;
uniform vec3 uCloudLight;         // radiance of a cloud face lit by the key light
uniform vec3 uCloudAmbient;       // radiance of a cloud lit only by the sky
uniform float uFlash;             // lightning, 0..1
uniform vec3 uFlashDirection;
uniform float uCloudBelow;        // 1 while the camera is under the cumulus deck, 0 once it is through it
uniform float uCirrusBelow;       // the same for the cirrus

float cloudShape(vec2 uv) {
  vec4 broad = texture2D(uNoise, uv);
  vec4 detail = texture2D(uNoise, uv * 3.3 + vec2(0.37, 0.11));
  // Broad masses, billows on them, and a fine crumble that keeps the edges from looking airbrushed.
  return broad.r * 0.6 + broad.g * 0.3 + (detail.r - 0.5) * 0.3 + (detail.b - 0.5) * 0.14 + (detail.a - 0.5) * 0.1 + 0.06;
}

vec4 cloudDeck(vec3 v, vec3 behind) {
  if (v.y < 0.004) return vec4(0.0);
  vec3 key = uKeyDirection;
  float mu = max(dot(v, key), 0.0);
  vec3 haze = hazeColor(v);
  float horizonFade = smoothstep(0.0, 0.07, v.y);
  float distanceHaze = exp(-v.y * 7.5);

  // ---- high cirrus: long wind-combed streaks, thin enough for the blue to show through ----
  vec2 highPlane = v.xz / (v.y + 0.3);
  vec2 streak = vec2(highPlane.x * 0.8 + highPlane.y * 0.6, highPlane.y * 0.8 - highPlane.x * 0.6);
  vec2 cirrusUv = streak * vec2(0.05, 0.016) + uCloudOffset.zw;
  float wisps = texture2D(uNoise, cirrusUv).b * 0.65 + texture2D(uNoise, cirrusUv * 0.41 + 0.5).r * 0.5;
  float cirrus = smoothstep(0.52, 0.86, wisps) * 0.42 * (1.0 - uOvercast) * horizonFade * uCirrusBelow;
  vec3 cirrusColor = uCloudLight * (0.5 + 1.3 * pow(mu, 6.0)) + uCloudAmbient * 0.55;
  cirrusColor = mix(cirrusColor, haze, distanceHaze * 0.9);

  // ---- low cumulus deck ----
  vec2 plane = v.xz / (v.y + 0.12);
  vec2 uv = plane * 0.085 + uCloudOffset.xy;
  float edge = mix(0.8, 0.16, uCloudCover);
  float softness = mix(0.15, 0.34, uOvercast);
  float shape = cloudShape(uv);
  float density = smoothstep(edge, edge + softness, shape);

  // A second look at the shape a step toward the sun: where more cloud lies in that direction the
  // light has been used up, so this side is in shade; where there is less, this is a lit edge.
  vec2 towardKey = normalize(key.xz + vec2(1e-4, 0.0)) * 0.03 * (1.0 - 0.6 * key.y);
  float sunward = smoothstep(edge, edge + softness, cloudShape(uv + towardKey));
  float shade = exp(-2.4 * sunward);

  float core = density * density;
  // Thin cloud between the viewer and the sun scatters its light forward: the silver lining.
  float thin = 1.0 - core;
  float silver = (pow(mu, 7.0) * 1.4 + pow(mu, 48.0) * 4.0) * thin;
  // Looking toward the light one sees the unlit side of a thick cloud: dark bodies, bright rims.
  float backlit = smoothstep(0.15, 0.95, mu) * core;
  vec3 lit = uCloudLight * (0.3 + 0.7 * shade) * mix(1.0, 0.5, core) * (1.0 - 0.5 * backlit) + (uCloudLight + behind * 0.35) * silver;
  // Some of the bright sky behind a backlit cloud always leaks through its body.
  lit += behind * 0.22 * backlit;
  vec3 base = uCloudAmbient * mix(1.0, 0.6, core);
  vec3 cumulus = lit + base;
  // A closed ceiling is never even: heavier and lighter patches follow the shape of the deck.
  cumulus *= mix(1.0, 0.66 + 0.6 * smoothstep(0.25, 0.85, shape), uOvercast);
  // Rain clouds: the thick middles go slate grey, the thin places stay as lighter seams.
  cumulus *= mix(1.0, mix(0.72, 0.2, core), uCloudDarkness);
  cumulus += uFlash * vec3(0.7, 0.8, 1.0) * (0.25 + 2.5 * pow(max(dot(v, uFlashDirection), 0.0), 5.0)) * (0.3 + 0.7 * density);
  cumulus = mix(cumulus, haze, distanceHaze * mix(0.92, 0.75, uOvercast));
  // Climbing into the deck thins it away: it is never a ceiling the camera pops through.
  float cumulusAlpha = density * horizonFade * uCloudBelow;

  vec3 color = mix(cirrusColor, cumulus, cumulusAlpha);
  float alpha = cumulusAlpha + cirrus * (1.0 - cumulusAlpha);
  return vec4(color, alpha);
}
`;

/** Noise-UV units the cumulus deck travels per metre per second of wind. */
const CUMULUS_DRIFT = 0.00016;
const CIRRUS_DRIFT = 0.00005;

/**
 * Creates the state that drifts the cloud deck with the wind.
 * @returns {{
 *   offset: Float32Array,
 *   update: (deltaSeconds: number, windX: number, windZ: number) => void,
 * }} `offset` holds the four numbers of the uCloudOffset uniform.
 */
export function createCloudDrift() {
  const offset = new Float32Array([0.13, 0.57, 0.31, 0.83]);

  /**
   * Moves the deck.
   * @param {number} deltaSeconds Time step.
   * @param {number} windX Wind velocity toward +X (east), metres per second.
   * @param {number} windZ Wind velocity toward +Z (south), metres per second.
   */
  function update(deltaSeconds, windX, windZ) {
    // The deck slides opposite to the UV offset; a floor of slow drift keeps calm skies alive.
    const driftX = windX + 1.2;
    const driftZ = windZ + 0.5;
    offset[0] = wrapUnit(offset[0] - driftX * CUMULUS_DRIFT * deltaSeconds);
    offset[1] = wrapUnit(offset[1] - driftZ * CUMULUS_DRIFT * deltaSeconds);
    offset[2] = wrapUnit(offset[2] - (driftX * 0.8 + driftZ * 0.6) * CIRRUS_DRIFT * deltaSeconds);
    offset[3] = wrapUnit(offset[3] - (driftZ * 0.8 - driftX * 0.6) * CIRRUS_DRIFT * deltaSeconds);
  }

  return { offset, update };
}

function wrapUnit(value) {
  return value - Math.floor(value);
}
