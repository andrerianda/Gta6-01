// The numbers behind the open sea and the sky seen from altitude: where the horizon lies for a
// camera height, how far the drawn sea must reach, how thick the haze is over a distance, how the
// sky darkens and the clouds fade as the camera climbs, and how far the camera has to see. Pure
// maths with no three.js and no DOM, so it runs in Node (tools/tests/sea/).
//
// The world of MARAZUL is flat: the sea is the plane y = 0 and the city, the ships and the island
// stand on it. The curve of the earth is a matter of ANGLES only: the sea is not drawn above the
// cone of directions `horizonDropRadians(height)` below the level, and the sky starts its horizon
// on that same cone, so the two always meet in one line that sinks and bends as the camera climbs.

/**
 * Fills `out` with everything the renderer needs to know about a camera height, in one call.
 * @param {number} height Camera height above the sea, metres.
 * @param {AltitudeLook} [out] The record to fill; a new one when omitted.
 * @returns {AltitudeLook}
 */
export function describeAltitude(height, out = createAltitudeLook()) {
  const h = Math.max(0, Number.isFinite(height) ? height : 0);
  out.height = h;
  out.horizonSine = Math.sin(horizonDropRadians(h));
  out.airAbove = airAboveShare(h);
  out.highAir = smoothstep(HIGH_AIR_BLEND_FROM, HIGH_AIR_BLEND_TO, h);
  out.farCalm = smoothstep(FAR_CALM_FROM, FAR_CALM_TO, h);
  out.cloudsFromBelow = 1 - smoothstep(CLOUD_DECK_HEIGHT * 0.55, CLOUD_DECK_HEIGHT * 0.95, h);
  out.cloudsFromAbove = smoothstep(CLOUD_DECK_HEIGHT * 1.05, CLOUD_DECK_HEIGHT * 1.5, h);
  out.cirrusFromBelow = 1 - smoothstep(CIRRUS_HEIGHT * 0.65, CIRRUS_HEIGHT, h);
  out.seaReach = seaReachMetres(h);
  return out;
}

/**
 * @typedef {Object} AltitudeLook
 * @property {number} height Camera height above the sea, metres.
 * @property {number} horizonSine Sine of the angle the horizon lies below the level.
 * @property {number} airAbove Share of the air still above the camera (1 on the ground).
 * @property {number} highAir 0 on the ground .. 1 aloft: how much the haze uses its thinning upper layer.
 * @property {number} farCalm 0 on the ground .. 1 aloft: how much the far waves are calmed.
 * @property {number} cloudsFromBelow Opacity of the cloud deck painted on the sky dome.
 * @property {number} cloudsFromAbove Opacity of the cloud layer drawn below the camera.
 * @property {number} cirrusFromBelow Opacity of the high cirrus on the sky dome.
 * @property {number} seaReach Horizontal metres to where the drawn sea meets the horizon.
 */

/** @returns {AltitudeLook} The record of a camera on the ground. */
export function createAltitudeLook() {
  return {
    height: 0, horizonSine: 0, airAbove: 1, highAir: 0, farCalm: 0,
    cloudsFromBelow: 1, cloudsFromAbove: 0, cirrusFromBelow: 1, seaReach: 0,
  };
}

/**
 * The radius of MARAZUL's planet, metres. Smaller than the earth's (6371 km) on purpose: the
 * horizon then sinks 4.4 degrees at 12 km and 6 degrees at 22 km, enough for its curve to read in
 * a 58 degree view, and the sea ends 210 km away instead of 530.
 */
export const PLANET_RADIUS_METRES = 4.0e6;
/** Below this height the horizon drop is eased to nothing (see horizonDropRadians). */
export const HORIZON_EASE_HEIGHT = 150;
/** Height of the cumulus deck and of the cirrus, metres. */
export const CLOUD_DECK_HEIGHT = 1600;
export const CIRRUS_HEIGHT = 9000;
/** Scale height of the thinning upper haze layer, and the share of the sea-level density it has. */
export const HIGH_AIR_HEIGHT = 4500;
export const HIGH_AIR_SHARE = 0.22;
const HIGH_AIR_BLEND_FROM = 60;
const HIGH_AIR_BLEND_TO = 400;
const FAR_CALM_FROM = 40;
const FAR_CALM_TO = 400;
/** The sky keeps its ground look up to this height, then thins with this scale height. */
const SKY_FULL_AIR_HEIGHT = 200;
const SKY_SCALE_HEIGHT = 7500;
/** The far plane: never below this once the camera is aloft or out at sea, never above the cap. */
export const FAR_PLANE_ALOFT = 30000;
export const FAR_PLANE_CAP = 320000;
/** The camera is "aloft" above this height. */
export const ALOFT_HEIGHT = 60;

/**
 * Distance along the surface to the horizon of a round planet, metres (the tangent point).
 * @param {number} height Camera height, metres.
 */
export function horizonDistanceMetres(height) {
  return Math.sqrt(2 * PLANET_RADIUS_METRES * Math.max(0, height));
}

/**
 * The angle the horizon lies below the level, radians: atan(sqrt(2h / R)), the dip of a round
 * planet. Below HORIZON_EASE_HEIGHT it is eased toward zero, so that near the ground the flat
 * world's far coast, the ships and the island keep standing on the horizon and the ground-level
 * picture is the one it always was.
 * @param {number} height Camera height above the sea, metres.
 */
export function horizonDropRadians(height) {
  const h = Math.max(0, height);
  return Math.atan(Math.sqrt((2 * h) / PLANET_RADIUS_METRES)) * smoothstep(0, HORIZON_EASE_HEIGHT, h);
}

/**
 * Horizontal metres from the camera to where the flat sea crosses the horizon cone of a round
 * planet: h / tan(dip) = sqrt(R h / 2), half the way to the tangent point. The sea is drawn at
 * least this far (the easing near the ground only moves the line outward, into the haze).
 * @param {number} height Camera height above the sea, metres.
 */
export function seaReachMetres(height) {
  return Math.sqrt((PLANET_RADIUS_METRES * Math.max(0, height)) / 2);
}

/**
 * How much the sea's camera-following disc is enlarged so that it reaches the horizon.
 * @param {number} height Camera height above the sea, metres.
 * @param {number} discRadius Radius of the disc at scale 1, metres.
 * @returns {number} 1 near the ground (the disc as it always was), larger aloft.
 */
export function seaDiscScale(height, discRadius) {
  return Math.max(1, (1.05 * seaReachMetres(height)) / discRadius);
}

/**
 * The far plane the camera needs.
 * @param {number} height Camera height above the sea, metres.
 * @param {boolean} outsideCity Whether the camera is outside the city's extent.
 * @param {number} baseFar The far plane of ordinary play, metres.
 * @returns {number} `baseFar` at street level in the city; at least 30 km aloft or out at sea,
 *   growing so that the sea's horizon and a margin stay inside.
 */
export function farPlaneMetres(height, outsideCity, baseFar) {
  const h = Math.max(0, height);
  if (h <= ALOFT_HEIGHT && !outsideCity) return baseFar;
  const toHorizon = 1.1 * Math.hypot(h, seaReachMetres(h));
  return Math.min(FAR_PLANE_CAP, Math.max(baseFar, FAR_PLANE_ALOFT, toHorizon));
}

/**
 * The near plane that goes with a long far plane. A near plane under 0.2 m belongs to a cockpit
 * view and is kept (the panel is centimetres away); other views get up to 1 m once nothing but
 * their own aircraft is near, which keeps ships and the island free of depth flicker at 6..14 km.
 * @param {number} wantedNear The near plane the camera asked for, metres.
 * @param {number} clearance Camera height above the ground or the sea under it, metres.
 */
export function nearPlaneMetres(wantedNear, clearance) {
  if (wantedNear < 0.2 || clearance <= ALOFT_HEIGHT) return wantedNear;
  return Math.max(wantedNear, Math.min(1, 0.25 + (clearance - ALOFT_HEIGHT) / 400));
}

/**
 * Share of the air that is still above the camera: 1 up to 200 m, about 0.21 at 12 km and 0.055
 * at 22 km. The sky's scattering is scaled by it, which is what turns the zenith blue-black.
 * @param {number} height Camera height, metres.
 */
export function airAboveShare(height) {
  return Math.exp(-Math.max(0, height - SKY_FULL_AIR_HEIGHT) / SKY_SCALE_HEIGHT);
}

/**
 * Optical depth of the haze between the camera and a point, the same closed form the haze pass
 * uses (render/postfx/atmosphereResolvePass.js): a dense layer of scale height `hazeHeight` plus
 * a thin part that is uniform for a camera on the ground and thins with height for one aloft.
 * @param {number} distance Metres between camera and point.
 * @param {number} cameraHeight Camera height, metres.
 * @param {number} pointHeight Height of the point, metres.
 * @param {number} density Extinction per metre at sea level (AtmosphereState.fogDensity).
 * @param {number} hazeHeight Scale height of the dense layer, metres (AtmosphereState.fogHeight).
 */
export function hazeOpticalDepth(distance, cameraHeight, pointHeight, density, hazeHeight) {
  const low = layerShare(cameraHeight / hazeHeight, pointHeight / hazeHeight);
  const high = HIGH_AIR_SHARE * layerShare(cameraHeight / HIGH_AIR_HEIGHT, pointHeight / HIGH_AIR_HEIGHT);
  const blend = smoothstep(HIGH_AIR_BLEND_FROM, HIGH_AIR_BLEND_TO, Math.max(0, cameraHeight));
  const thin = HIGH_AIR_SHARE + (high - HIGH_AIR_SHARE) * blend;
  return density * Math.max(0, distance) * (low + thin);
}

/**
 * How much of a point at sea level is lost in the haze, 0 (clear) .. 1 (gone).
 * @param {number} distance Metres to the point.
 * @param {number} cameraHeight Camera height, metres.
 * @param {number} density Extinction per metre at sea level.
 * @param {number} hazeHeight Scale height of the dense layer, metres.
 */
export function hazeAmount(distance, cameraHeight, density, hazeHeight) {
  return 1 - Math.exp(-hazeOpticalDepth(distance, cameraHeight, 0, density, hazeHeight));
}

/** Mean of exp(-y) between two heights (in scale heights): the closed form of the haze pass. */
function layerShare(y0, y1) {
  const a = Math.exp(-Math.max(y0, -4));
  const dy = y1 - y0;
  return Math.abs(dy) > 1e-3 ? (a - Math.exp(-Math.max(y1, -4))) / dy : a;
}

export function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
