// Derives everything the vehicle dynamics needs from a vehicle catalog entry: mass and inertia,
// the hull box, wheel positions and suspension, engine power (found so that the 0 to 100 km/h time
// matches), drag (found so that the stated top speed is where the engine runs out), brakes, tyre
// grip, steering and the gear ladder the audio hears. Every vehicle so drives distinctly.

const G = 9.81;
const HUNDRED = 100 / 3.6;
const SUSPENSION_KINDS = {
  soft: { frequency: 1.3, damping: 0.5, travel: 0.17 },
  medium: { frequency: 1.55, damping: 0.55, travel: 0.14 },
  firm: { frequency: 1.95, damping: 0.62, travel: 0.1 },
  offroad: { frequency: 1.25, damping: 0.5, travel: 0.24 },
  heavy: { frequency: 1.5, damping: 0.6, travel: 0.15 },
};

/**
 * A wheel as the caller may give it (from the model's wheel_fl, wheel_fr, wheel_rl, wheel_rr hubs).
 * @typedef {object} WheelPlacement
 * @property {number} x Hub position in model space (origin on the ground at the centre, facing -Z).
 * @property {number} y
 * @property {number} z
 * @property {number} radius Tyre radius.
 */

/**
 * Derives a vehicle's tuning from its catalog entry.
 * @param {{mass: number, dimensions: {length: number, width: number, height: number, wheelbase: number|null,
 *   wheelRadius: number|null, groundClearance: number|null}, handling: {topSpeed: number, zeroToHundred: number|null,
 *   timeToTopSpeed?: number, braking: number, grip: number, driftTendency: number, driveWheels: string,
 *   suspension: string}, engine?: {gears?: number}}} spec The catalog entry (see catalog/vehicleCatalog.js).
 * @param {WheelPlacement[] | null} [wheels] Hub positions in the order front left, front right,
 *   rear left, rear right; derived from the dimensions when missing.
 * @returns {VehicleTuning}
 */
export function deriveVehicleTuning(spec, wheels = null) {
  const size = spec.dimensions;
  const handling = spec.handling;
  const mass = spec.mass;
  const radius = size.wheelRadius ?? 0.32;
  const wheelbase = size.wheelbase ?? size.length * 0.6;
  const clearance = size.groundClearance ?? 0.16;
  const halfTrack = size.width * 0.5 - 0.13;
  const drive = handling.driveWheels;
  // Two-wheelers (catalog class 'motorcycle' or flag 'two_wheeled', or two hubs given: wheel_f,
  // wheel_r) run on the same core with a lean model (see Motorcycle.js).
  const twoWheeled = wheels ? wheels.length === 2 : spec.class === 'motorcycle' || (spec.flags ?? []).includes('two_wheeled');
  const frontShare = twoWheeled ? 0.47 : drive === 'front' ? 0.57 : drive === 'rear' ? 0.5 : 0.53;
  const kind = SUSPENSION_KINDS[handling.suspension] ?? SUSPENSION_KINDS.medium;
  const placements = wheels ?? (twoWheeled ? [
    { x: 0, y: radius, z: -wheelbase * 0.5, radius },
    { x: 0, y: radius, z: wheelbase * 0.5, radius },
  ] : [
    { x: -halfTrack, y: radius, z: -wheelbase * 0.5, radius },
    { x: halfTrack, y: radius, z: -wheelbase * 0.5, radius },
    { x: -halfTrack, y: radius, z: wheelbase * 0.5, radius },
    { x: halfTrack, y: radius, z: wheelbase * 0.5, radius },
  ]);
  const frontZ = twoWheeled ? placements[0].z : (placements[0].z + placements[1].z) * 0.5;
  const rearZ = twoWheeled ? placements[1].z : (placements[2].z + placements[3].z) * 0.5;
  // A motorcycle's centre of mass includes its rider, so it sits higher.
  const centreOfMass = { x: 0, y: radius + size.height * (twoWheeled ? 0.25 : 0.1), z: rearZ + (frontZ - rearZ) * frontShare };
  const tunedWheels = placements.map((placement, index) => {
    const front = twoWheeled ? index === 0 : index < 2;
    const load = mass * G * (front ? frontShare : 1 - frontShare) * (twoWheeled ? 1 : 0.5);
    const spring = (2 * Math.PI * kind.frequency) ** 2 * (load / G);
    return {
      x: placement.x, y: placement.y, z: placement.z, radius: placement.radius,
      steered: front,
      driven: drive === 'all' || (drive === 'front') === front,
      handbrake: !front,
      staticLoad: load,
      spring,
      damper: 2 * kind.damping * Math.sqrt(spring * (load / G)),
      travelUp: kind.travel * 0.55,
      travelDown: kind.travel * 0.45 + load / spring,
    };
  });

  const grip = handling.grip;
  // A motorcycle accelerating puts nearly all its weight on the rear wheel (up to the wheelie).
  const tractionShare = twoWheeled ? 0.92 : drive === 'all' ? 1 : drive === 'rear' ? 0.6 : 0.56;
  const maxDriveForce = mass * G * grip * 1.1 * tractionShare;
  const rollingForce = 0.013 * mass * G;
  const topSpeed = handling.topSpeed;
  const targetSpeed = topSpeed > HUNDRED * 1.08 && handling.zeroToHundred ? HUNDRED : topSpeed * 0.9;
  const targetTime = targetSpeed === HUNDRED ? handling.zeroToHundred : handling.timeToTopSpeed ?? 20;
  // Find the power that gives the stated acceleration time; drag follows from power and top speed.
  // More power also means more drag (the top speed is fixed), so the time first falls and then
  // rises with power: walk up from little power until the time is met, then close in.
  const dragFor = (watts) => Math.max((watts / topSpeed - rollingForce) / (topSpeed * topSpeed), 0.02);
  const timeFor = (watts) => {
    const resistance = dragFor(watts);
    let speed = 0;
    let time = 0;
    while (speed < targetSpeed && time < 120) {
      const force = Math.min(maxDriveForce, watts / Math.max(speed, 3)) - resistance * speed * speed - rollingForce;
      speed += (force / mass) * 0.02;
      time += 0.02;
    }
    return time;
  };
  let low = mass * 4;
  let high = low;
  let previousTime = Infinity;
  for (let i = 0; i < 60; i += 1) {
    high = low * 1.2;
    const time = timeFor(high);
    if (time <= targetTime || time > previousTime) break;
    previousTime = time;
    low = high;
  }
  for (let i = 0; i < 20; i += 1) {
    const middle = (low + high) * 0.5;
    if (timeFor(middle) > targetTime) low = middle;
    else high = middle;
  }
  const power = high;
  const drag = dragFor(power);

  const gears = Math.max(spec.engine?.gears ?? 5, 1);
  const gearTopSpeeds = [];
  for (let g = 1; g <= gears; g += 1) gearTopSpeeds.push(topSpeed * 1.04 * (0.24 + 0.76 * (g / gears) ** 1.25));
  // A motorcycle's hull is a slim box from the axles up, so that it clears the road at full lean.
  const hullBottom = twoWheeled ? radius : clearance;
  const hullHalfY = Math.max((size.height - hullBottom) * 0.5, 0.2);
  const length = size.length;
  const width = size.width;
  const height = size.height;
  return {
    mass,
    inertia: {
      x: (mass / 12) * (length * length + height * height) * 1.1,
      y: (mass / 12) * (length * length + width * width),
      z: (mass / 12) * (width * width + height * height) * 1.6,
    },
    hull: { halfX: twoWheeled ? Math.min(width * 0.5, 0.2) : width * 0.5, halfY: hullHalfY, halfZ: length * 0.5, y: hullBottom + hullHalfY, z: 0 },
    twoWheeled,
    maxLean: Math.atan(grip * 0.95),
    tyreCrown: radius * 0.3,
    seat: { x: 0, y: height * 0.72, z: wheelbase * 0.1 },
    centreOfMass,
    wheels: tunedWheels,
    wheelbase,
    antiRoll: tunedWheels[0].spring * 0.45,
    power,
    maxDriveForce,
    dragCoefficient: drag,
    rollingResistance: 0.013,
    downforce: drag * 0.35,
    brakeForce: mass * handling.braking * 1.12,
    brakeBias: 0.64,
    grip,
    rearGripScale: 1.06 - handling.driftTendency * 0.16,
    handbrakeGrip: 0.5,
    peakSlipAngle: 0.13 + handling.driftTendency * 0.05,
    slideGrip: 0.8 + handling.driftTendency * 0.08,
    maxSteer: twoWheeled ? 0.5 : 0.6,
    steerSpeed: 3.2,
    topSpeed,
    reverseSpeed: Math.min(topSpeed * 0.3, 14),
    gearTopSpeeds,
    idleRpm: 900,
    redlineRpm: 6800,
    rollInfluence: 0.5,
    driveWheels: drive,
  };
}

/**
 * The numbers a Vehicle is built from (see deriveVehicleTuning for how each is found).
 * @typedef {object} VehicleTuning
 * @property {number} mass Kilograms.
 * @property {{x: number, y: number, z: number}} inertia Moments about pitch, yaw and roll axes.
 * @property {{halfX: number, halfY: number, halfZ: number, y: number, z: number}} hull The hull box in model space.
 * @property {{x: number, y: number, z: number}} centreOfMass In model space.
 * @property {{x: number, y: number, z: number, radius: number, steered: boolean, driven: boolean, handbrake: boolean,
 *   staticLoad: number, spring: number, damper: number, travelUp: number, travelDown: number}[]} wheels
 * @property {number} wheelbase
 * @property {number} antiRoll Anti-roll bar stiffness, newtons per metre of left-right difference.
 * @property {number} power Watts at the wheels.
 * @property {number} maxDriveForce Newtons at launch.
 * @property {number} dragCoefficient Newtons per (m/s) squared.
 * @property {number} rollingResistance Share of the wheel load.
 * @property {number} downforce Newtons per (m/s) squared.
 * @property {number} brakeForce Newtons with the pedal down.
 * @property {number} brakeBias Share of braking at the front.
 * @property {number} grip Peak tyre friction on dry asphalt.
 * @property {number} rearGripScale Rear grip relative to front.
 * @property {number} handbrakeGrip Rear side grip left with the handbrake on.
 * @property {number} peakSlipAngle Slip angle of peak side force, radians.
 * @property {number} slideGrip Share of peak grip left when sliding far past the peak.
 * @property {number} maxSteer Full lock, radians.
 * @property {number} steerSpeed How fast the wheels turn towards the input, radians per second.
 * @property {number} topSpeed Metres per second.
 * @property {number} reverseSpeed Metres per second.
 * @property {number[]} gearTopSpeeds The speed at the red line in each gear.
 * @property {number} idleRpm
 * @property {number} redlineRpm
 * @property {number} rollInfluence How much of the tyre forces' leverage rolls and pitches the body, 0 to 1.
 * @property {string} driveWheels 'front', 'rear' or 'all'.
 * @property {boolean} twoWheeled Two wheels in line (front, rear): drive it with Motorcycle.
 * @property {number} maxLean Two-wheelers: the deepest lean, radians.
 * @property {number} tyreCrown Two-wheelers: radius of the tyre's round profile, metres.
 * @property {{x: number, y: number, z: number}} seat Two-wheelers: the rider's seat in model space.
 */
