// GLSL shared by everything that needs to know the colour of the air: the sky dome, the distance
// haze of the post-processing chain and the water. Keeping one definition is what makes the far
// sea, the far city and the sky meet at the horizon without a seam.
//
// The scattering is an analytic single-scattering approximation, not a ray march: optical depths
// from relative air mass, a Rayleigh and a Mie phase function, and the sun's own extinction. The
// horizon band and the haze colour come from the hand-tuned look (atmosphereLooks.js).

/**
 * Uniform declarations used by HAZE_COLOR_GLSL and SKY_SCATTERING_GLSL. A material that includes
 * the chunks must provide these uniforms (see createSkyUniforms in skyDome.js).
 */
export const SKY_UNIFORMS_GLSL = /* glsl */ `
uniform vec3 uSunDirection;      // unit vector toward the sun (may point below the horizon)
uniform vec3 uKeyDirection;      // unit vector toward whatever lights the air: sun, or moon at night
uniform vec3 uHorizonColor;      // haze radiance away from the sun
uniform vec3 uHorizonSunColor;   // haze radiance below the sun
uniform float uHorizonHeight;    // how far the horizon band reaches up
uniform float uSkyIntensity;
uniform vec3 uZenithTint;
uniform float uMie;
`;

/**
 * `vec3 hazeColor(vec3 viewDirection)`: the radiance of infinitely deep haze in a direction. The
 * sky dome shows exactly this at the horizon and the fog blends geometry toward it.
 */
export const HAZE_COLOR_GLSL = /* glsl */ `
float hazeSunAmount(vec3 v) {
  vec2 vFlat = normalize(v.xz + vec2(1e-5, 0.0));
  vec2 sFlat = normalize(uSunDirection.xz + vec2(1e-5, 0.0));
  float azimuth = clamp(dot(vFlat, sFlat) * 0.5 + 0.5, 0.0, 1.0);
  // The hot spot of the haze sits on the horizon under the sun, whatever the sun's height.
  vec3 sunLow = normalize(vec3(uSunDirection.x, clamp(uSunDirection.y, -0.03, 0.12), uSunDirection.z));
  float lobe = max(dot(normalize(vec3(v.x, max(v.y, -0.05), v.z)), sunLow), 0.0);
  float low = 1.0 - smoothstep(0.25, 0.9, uSunDirection.y);
  return clamp(0.3 * pow(azimuth, 3.5) + 0.7 * pow(lobe, 16.0) * mix(0.4, 1.0, low), 0.0, 1.0);
}
vec3 hazeColor(vec3 v) {
  return mix(uHorizonColor, uHorizonSunColor, hazeSunAmount(v));
}
`;

/**
 * `vec3 skyRadiance(vec3 viewDirection)`: the clear-sky radiance above the horizon, already blended
 * into the haze band; below the horizon it returns the haze colour.
 */
export const SKY_SCATTERING_GLSL = /* glsl */ `
const vec3 SKY_RAYLEIGH_DEPTH = vec3(0.0464, 0.108, 0.265);   // zenith optical depth, red green blue
const float SKY_MIE_DEPTH = 0.03;                             // per unit of uMie
const float SKY_MIE_GLOW = 0.3;                               // strength of the aureole around the sun
const float SKY_SOURCE = 30.0;                                // radiance scale of the scattered sun
uniform float uAirAbove;         // share of the air still above the camera (1 on the ground)

// Relative optical air mass toward a direction of given height (1 at the zenith, about 40 flat).
float skyAirMass(float height) {
  float c = max(height, 0.0);
  return 1.0 / (c + 0.025 * exp(-11.0 * c));
}

vec3 skyRadiance(vec3 v) {
  vec3 haze = hazeColor(v);
  if (v.y <= 0.0) return haze;

  vec3 key = uKeyDirection;
  float mu = dot(v, key);
  float mieDepth = SKY_MIE_DEPTH * uMie;
  vec3 depth = SKY_RAYLEIGH_DEPTH + vec3(mieDepth) * vec3(1.0, 1.04, 1.1);

  // Light that scatters high in the sky has crossed less air than light scattering near the
  // ground, which is why the zenith stays blue while the horizon reddens at sunset.
  float lift = mix(0.22, 1.0, exp(-3.2 * v.y));
  // The path is capped: in twilight the upper air is lit by light that skims over the dense
  // layers instead of crossing them, and the dome stays blue long after the sun has gone.
  float keyMass = min(skyAirMass(max(key.y, 0.012)), 9.0);
  // From altitude only the air above the camera scatters: the dome thins toward blue-black.
  vec3 above = depth * uAirAbove;
  vec3 keyTransmittance = exp(-above * keyMass * lift);

  float viewMass = min(skyAirMass(v.y), 12.0);
  vec3 scattered = 1.0 - exp(-above * viewMass);

  float rayleighPhase = 0.0597 * (1.0 + mu * mu);
  float g = 0.78;
  float miePhase = SKY_MIE_GLOW * 0.0796 * (1.0 - g * g) / pow(max(1.0 + g * g - 2.0 * g * mu, 1e-4), 1.5);
  vec3 phased = (SKY_RAYLEIGH_DEPTH * rayleighPhase + vec3(mieDepth * miePhase)) / depth;

  // A little light scattered more than once keeps the shadow side of the dome from going dead.
  vec3 multiple = SKY_RAYLEIGH_DEPTH * 0.011 * (0.4 + 0.6 * max(key.y, 0.0));

  vec3 sky = (phased * scattered * keyTransmittance + multiple * scattered) * SKY_SOURCE;
  // The tint stands in for what the model leaves out (ozone keeps twilight skies from going
  // green); the looks set it per hour.
  sky *= uSkyIntensity * uZenithTint;

  // The haze band stands taller around the sun, where the low air glows by forward scattering.
  // Seen from above the dense air it is a thin bright line on the horizon.
  float bandHeight = max(uHorizonHeight, 0.01) * (1.0 + 0.9 * hazeSunAmount(v)) * mix(0.22, 1.0, uAirAbove);
  float band = exp(-v.y / bandHeight * 2.6);
  return mix(sky, haze, band);
}
`;

/**
 * A small hash and a 3D-cell star field: `float starField(vec3 direction, float time)`.
 */
export const STAR_FIELD_GLSL = /* glsl */ `
float skyHash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float starField(vec3 v, float time) {
  vec3 p = v * 190.0;
  vec3 cell = floor(p);
  vec3 local = fract(p) - 0.5;
  float seed = skyHash13(cell);
  if (seed < 0.86) return 0.0;
  vec3 offset = vec3(skyHash13(cell + 7.1), skyHash13(cell + 13.7), skyHash13(cell + 29.3)) - 0.5;
  float d = length(local - offset * 0.6);
  float magnitude = pow((seed - 0.86) / 0.14, 4.0);
  float twinkle = 0.75 + 0.25 * sin(time * (2.0 + seed * 5.0) + seed * 60.0);
  return smoothstep(0.16, 0.0, d) * (0.15 + magnitude * 2.2) * twinkle;
}
`;
