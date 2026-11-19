// The numbers and the plain arithmetic of the cockpit interior (no three.js, no DOM, so the Node
// tests run them): the node names of the cockpit model contract, where each live instrument face
// sits on the shared canvas, how bright the interior fill, the instrument glow, the displays and the
// combiner are at each time of day, how far the stick and the throttles move, the small sway of
// the hands, and how large the combiner glass looks from the eye.
// Used by cockpitModel.js (the model in the scene) and cockpitDisplays.js (the canvases).

/** The node names of a cockpit model (the asset contract). */
export const COCKPIT_NODES = Object.freeze({
  shell: 'cockpit_shell', glass: 'canopy_glass', combiner: 'hud_combiner', stick: 'stick', throttles: 'throttles',
  handStick: 'hand_stick', handThrottle: 'hand_throttle', eye: 'eye', glowPanel: 'glow_panel', glowConsole: 'glow_console',
});

/** The live instrument faces of each cockpit kind (the catalog's flight.cockpit), by mesh name. */
export const COCKPIT_FACES = Object.freeze({
  glass_four: Object.freeze(['display_map', 'display_radar', 'display_engines', 'display_cautions']),
  analog_gauges: Object.freeze(['gauge_airspeed', 'gauge_mach', 'gauge_attitude', 'gauge_altitude', 'gauge_heading', 'gauge_vsi',
    'gauge_skin_temp', 'gauge_egt_l', 'gauge_egt_r', 'gauge_rpm_l', 'gauge_rpm_r', 'gauge_fuel']),
  analog_six: Object.freeze(['gauge_airspeed', 'gauge_attitude', 'gauge_altitude', 'gauge_turn', 'gauge_heading', 'gauge_vsi',
    'gauge_rpm', 'gauge_fuel']),
});

/**
 * What of the aircraft's own model is not drawn in the cockpit view: its low-detail interior, its
 * panel quad, an opening canopy (the cockpit model brings its own frames), and every pane of its
 * dark glass. The wings and the nose stay, to be seen through the windows.
 */
export const EXTERIOR_HIDDEN = Object.freeze({ nodes: Object.freeze(['cockpit_lod0', 'instrument_panel', 'canopy']), glassMaterial: /^glass(_rear|_roof)?$/ });

/**
 * The interior's light. Units: `fill*` are irradiance added to the cockpit's own materials
 * (the same scale as the scene's hemisphere light); `glow*` candela of the two small lights at
 * the glow anchors (range in metres); `display*` and `hud*` the brightness of the unlit canvases
 * as shown on screen (the exposure is divided out); `glass*` the canopy's sky reflection.
 */
export const COCKPIT_LIGHTING = Object.freeze({
  /**
   * The interior's own fill as a multiple of the scene's sky fill (the light that comes in through
   * the glass and bounces round the cabin): the picture's tone curve crushes a dark-grey interior
   * without it.
   */
  fillSkyShare: 8,
  /** How much of the model's baked occlusion map dims its indirect light (1 = all: a closed cabin goes near black). */
  occlusionStrength: 0.4,
  /** A floor that keeps the interior readable at night (cool), irradiance. */
  fillNight: Object.freeze([0.14, 0.17, 0.24]),
  /** How much of the instruments' own colour joins the fill at night. */
  fillGlowShare: 0.06,
  glowPanelDay: 0.08, glowPanelNight: 0.2, glowConsoleDay: 0.03, glowConsoleNight: 0.09, glowRange: 1.7, glowImportance: 14,
  /** The instruments' light: cool green-white of the glass cockpit, warm amber-white of the analog ones. */
  glowColours: Object.freeze({ glass_four: Object.freeze([0.62, 1.0, 0.84]), analog_gauges: Object.freeze([1.0, 0.76, 0.46]), analog_six: Object.freeze([1.0, 0.8, 0.52]) }),
  displayDay: 1.25, displayNight: 0.6, hudDay: 1.7, hudNight: 0.95,
  glassOpacity: 0.07, glassReflectionDay: 2.2, glassReflectionNight: 0.5,
  /** The combiner glass: its own faint tint, at most this opaque. */
  combinerOpacity: 0.1,
  /** The cockpit's frames throw the sun's shadows on the dash when the shadow maps are at least this fine. */
  frameShadowQualities: Object.freeze(['medium', 'high', 'ultra', 'cinematic']),
});

/** How the controls and the hands move. Angles in radians, lengths in metres. */
export const COCKPIT_MOTION = Object.freeze({
  stickTilt: 9 * Math.PI / 180, throttleTravel: 35 * Math.PI / 180, ease: 10,
  /** Breathing: the hands drift this far (peak), at about this many cycles a second. */
  breath: 0.0006, breathHz: 0.24,
  /** Engine and runway vibration: peak travel of the hands and of the whole interior on the takeoff roll. */
  handShake: 0.0014, cabinShake: 0.0011, shakeHz: 23, rollSpeedKnots: 90,
});

/** Pixels of one face cell and the grid's columns: the displays are 4:3, the gauges square. */
const CELLS = Object.freeze({ display: Object.freeze({ w: 512, h: 384, columns: 2 }), gauge: Object.freeze({ w: 256, h: 256, columns: 4 }) });
/** Pixels kept between a face's picture and its cell's edge, so neighbours never bleed in when minified. */
export const ATLAS_PAD = 6;

/**
 * Lays the faces of a cockpit out on one canvas.
 * @param {readonly string[]} names The face mesh names, in drawing order.
 * @returns {{width: number, height: number, pad: number, cells: Record<string, {x: number, y: number, w: number, h: number}>}}
 */
export function faceAtlasLayout(names) {
  const cell = names.length > 0 && names.every((name) => name.startsWith('display_')) ? CELLS.display : CELLS.gauge;
  const columns = Math.max(1, Math.min(cell.columns, names.length));
  const rows = Math.max(1, Math.ceil(names.length / columns));
  const cells = {};
  names.forEach((name, i) => {
    cells[name] = { x: (i % columns) * cell.w, y: Math.floor(i / columns) * cell.h, w: cell.w, h: cell.h };
  });
  return { width: columns * cell.w, height: rows * cell.h, pad: ATLAS_PAD, cells };
}

/**
 * Moves a face's own texture coordinate (0..1 across the face, v down as glTF stores it) into its
 * cell of the canvas.
 * @param {number} u
 * @param {number} v
 * @param {{x: number, y: number, w: number, h: number}} cell
 * @param {{width: number, height: number, pad: number}} layout
 * @param {{u: number, v: number}} out
 */
export function faceUvInAtlas(u, v, cell, layout, out) {
  const cu = u < 0 ? 0 : u > 1 ? 1 : u;
  const cv = v < 0 ? 0 : v > 1 ? 1 : v;
  out.u = (cell.x + layout.pad + cu * (cell.w - layout.pad * 2)) / layout.width;
  out.v = (cell.y + layout.pad + cv * (cell.h - layout.pad * 2)) / layout.height;
  return out;
}

/**
 * The pilot's eye and lens from a cockpit model's extras (`eye` [x, y, z] in Blender's frame: nose
 * +Y, up +Z; `fov` degrees; `gaze` degrees, negative down) and its `eye` node.
 * @param {Record<string, unknown> | null} extras The asset's extras.
 * @param {{x: number, y: number, z: number} | null} eyeNode The `eye` node's place in the model (game frame), or null.
 * @param {{x: number, y: number, z: number, fovDegrees: number, gazeRadians: number}} fallback Today's numbers.
 * @returns {{x: number, y: number, z: number, fovDegrees: number, gazeRadians: number}}
 */
export function cockpitFramingOf(extras, eyeNode, fallback) {
  const out = { ...fallback };
  const eye = extras && Array.isArray(extras.eye) && extras.eye.length === 3 && extras.eye.every(Number.isFinite) ? extras.eye : null;
  if (eyeNode && [eyeNode.x, eyeNode.y, eyeNode.z].every(Number.isFinite)) {
    out.x = eyeNode.x; out.y = eyeNode.y; out.z = eyeNode.z;
  } else if (eye) {
    out.x = eye[0]; out.y = eye[2]; out.z = -eye[1];
  }
  const fov = Number(extras?.fov);
  if (fov >= 40 && fov <= 90) out.fovDegrees = fov;
  const gaze = Number(extras?.gaze);
  if (Number.isFinite(gaze) && Math.abs(gaze) <= 30 && extras?.gaze !== null && extras?.gaze !== undefined) out.gazeRadians = gaze * Math.PI / 180;
  return out;
}

/**
 * The interior's light for the atmosphere's state.
 * @param {{ambientSkyColor?: {r: number, g: number, b: number}, ambientIntensity?: number, nightFactor?: number,
 *   exposure?: number} | null} sky The atmosphere's state (null: plain daylight).
 * @param {string} cockpitKind A key of COCKPIT_FACES.
 * @param {object} out Receives fill [r, g, b], glow [r, g, b], glowPanel, glowConsole, display, hud, glassReflection.
 */
export function interiorLightOf(sky, cockpitKind, out) {
  const L = COCKPIT_LIGHTING;
  const night = clamp01(sky?.nightFactor ?? 0);
  const exposure = Math.max(0.2, Number.isFinite(sky?.exposure) ? sky.exposure : 1);
  const ambient = Math.max(0, Number.isFinite(sky?.ambientIntensity) ? sky.ambientIntensity : 0.4);
  const colour = sky?.ambientSkyColor ?? WHITE;
  const glow = L.glowColours[cockpitKind] ?? L.glowColours.analog_gauges;
  out.fill ??= [0, 0, 0];
  out.glow ??= [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    const channel = i === 0 ? colour.r : i === 1 ? colour.g : colour.b;
    out.fill[i] = channel * ambient * L.fillSkyShare + night * (L.fillNight[i] + glow[i] * L.fillGlowShare);
    out.glow[i] = glow[i];
  }
  out.glowPanel = L.glowPanelDay + (L.glowPanelNight - L.glowPanelDay) * night;
  out.glowConsole = L.glowConsoleDay + (L.glowConsoleNight - L.glowConsoleDay) * night;
  out.display = (L.displayDay + (L.displayNight - L.displayDay) * night) / exposure;
  out.hud = (L.hudDay + (L.hudNight - L.hudDay) * night) / exposure;
  out.glassReflection = L.glassReflectionDay + (L.glassReflectionNight - L.glassReflectionDay) * night;
  return out;
}

const WHITE = Object.freeze({ r: 1, g: 1, b: 1 });

/**
 * Eases the drawn controls toward the pilot's inputs.
 * @param {{pitch: number, roll: number, throttle: number}} pose The drawn state, changed in place:
 *   pitch and roll -1..1 (+ nose up, + right wing down), throttle 0..1.
 * @param {{pitch?: number, roll?: number, throttle?: number} | null} input The aircraft's input.
 * @param {number} dt Frame seconds.
 */
export function easeControlPose(pose, input, dt) {
  const ease = dt > 0 ? 1 - Math.exp(-COCKPIT_MOTION.ease * dt) : 1;
  pose.pitch += (clampUnit(input?.pitch) - pose.pitch) * ease;
  pose.roll += (clampUnit(input?.roll) - pose.roll) * ease;
  pose.throttle += (clamp01(input?.throttle) - pose.throttle) * ease;
  return pose;
}

/**
 * The stick's tilt in the aircraft's frame: back (about +X) to raise the nose, right (about -Z)
 * to roll right; and the throttles' turn about their own X (forward is negative).
 * @param {{pitch: number, roll: number, throttle: number}} pose
 * @param {{stickX: number, stickZ: number, throttleX: number}} out Radians.
 */
export function controlAngles(pose, out) {
  out.stickX = pose.pitch * COCKPIT_MOTION.stickTilt;
  out.stickZ = -pose.roll * COCKPIT_MOTION.stickTilt;
  out.throttleX = -pose.throttle * COCKPIT_MOTION.throttleTravel;
  return out;
}

/**
 * How hard the airframe shakes, 0..1: the takeoff and landing roll (ground speed with the engines
 * up), a little from the afterburner in the air.
 * @param {{onGround?: boolean, groundSpeedKnots?: number, rpmPercent?: number, afterburner?: boolean} | null} readout
 */
export function cabinVibration(readout) {
  if (!readout) return 0;
  const rpm = clamp01((readout.rpmPercent ?? 0) / 100);
  const roll = readout.onGround ? clamp01((readout.groundSpeedKnots ?? 0) / COCKPIT_MOTION.rollSpeedKnots) : 0;
  return clamp01(roll * (0.45 + 0.55 * rpm) + (readout.afterburner ? 0.25 : 0) + rpm * 0.06);
}

/**
 * The sway of a hand: slow breathing plus the airframe's vibration. Deterministic in time.
 * @param {number} time Seconds.
 * @param {number} vibration 0..1 from cabinVibration.
 * @param {number} phase Tells the two hands (and the cabin) apart.
 * @param {number} shake Peak vibration travel, metres (COCKPIT_MOTION.handShake or cabinShake).
 * @param {number} breath Peak breathing travel, metres (0 for the cabin).
 * @param {{x: number, y: number, z: number}} out Metres.
 */
export function swayOffset(time, vibration, phase, shake, breath, out) {
  const b = time * COCKPIT_MOTION.breathHz * Math.PI * 2 + phase * 1.7;
  const v = time * COCKPIT_MOTION.shakeHz * Math.PI * 2 + phase * 2.3;
  const amp = shake * vibration;
  out.x = breath * 0.5 * Math.sin(b * 0.63 + 1.1) + amp * 0.6 * Math.sin(v * 1.31 + 0.4);
  out.y = breath * Math.sin(b) + amp * Math.sin(v) * Math.sin(v * 0.173 + phase);
  out.z = breath * 0.4 * Math.sin(b * 0.41 + 2.0) + amp * 0.35 * Math.sin(v * 0.77 + 1.9);
  return out;
}

/**
 * How large a flat glass looks from the eye, and where the aircraft's straight-ahead line (level
 * with the eye, along the nose: -Z) crosses it. Points and eye in the model's frame (game axes).
 * @param {ArrayLike<number>} points The glass's corners or vertices, x y z repeated.
 * @param {{x: number, y: number, z: number}} eye
 * @param {{degreesTall: number, degreesWide: number, boresightX: number, boresightY: number, distance: number}} out
 *   boresightX / boresightY: 0..1 across the glass from its left and from its top (0.5 the middle;
 *   outside 0..1 when the line misses the glass).
 * @returns {object | null} `out`, or null when the glass is not in front of the eye.
 */
export function glassAngularSize(points, eye, out) {
  let minEl = Infinity, maxEl = -Infinity, minAz = Infinity, maxAz = -Infinity, sum = 0, count = 0;
  for (let i = 0; i + 2 < points.length; i += 3) {
    const dx = points[i] - eye.x;
    const dy = points[i + 1] - eye.y;
    const forward = -(points[i + 2] - eye.z);
    if (!(forward > 0.02)) continue;
    const el = Math.atan2(dy, Math.hypot(dx, forward));
    const az = Math.atan2(dx, forward);
    if (el < minEl) minEl = el;
    if (el > maxEl) maxEl = el;
    if (az < minAz) minAz = az;
    if (az > maxAz) maxAz = az;
    sum += Math.hypot(dx, dy, forward);
    count += 1;
  }
  if (count < 3 || !(maxEl > minEl) || !(maxAz > minAz)) return null;
  const toDegrees = 180 / Math.PI;
  out.degreesTall = (maxEl - minEl) * toDegrees;
  out.degreesWide = (maxAz - minAz) * toDegrees;
  out.boresightX = (0 - minAz) / (maxAz - minAz);
  out.boresightY = (maxEl - 0) / (maxEl - minEl);
  out.distance = sum / count;
  return out;
}

function clamp01(value) {
  return value > 0 ? (value < 1 ? value : 1) : 0;
}

function clampUnit(value) {
  return value > -1 ? (value < 1 ? value : 1) : value <= -1 ? -1 : 0;
}
