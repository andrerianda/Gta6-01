// Test kit for the gait: loads a character's skeleton from its GLB in Node (only the JSON chunk:
// node names and rest transforms, as plain objects the character rig accepts), drives a
// locomotion controller frame by frame, and measures the motion in world space: sole points of
// both feet (heel, ball, toe tip), joint angles and frame-to-frame changes. No three.js needed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLocomotionController } from '../../../game/src/characters/controller/locomotionController.js';
import { BONE, BONE_COUNT } from '../../../game/src/characters/skeleton/humanSkeleton.js';
import { quatRotate } from '../../../game/src/characters/skeleton/quaternionMath.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** A plain scene node with what the rig and the controller read. */
function makeNode(name) {
  const node = {
    name: name ?? '',
    parent: null,
    children: [],
    visible: true,
    userData: {},
    position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    quaternion: { x: 0, y: 0, z: 0, w: 1, set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; } },
    rotation: { x: 0, y: 0, z: 0, order: 'YXZ', set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    scale: { x: 1, y: 1, z: 1, setScalar(s) { this.x = s; this.y = s; this.z = s; } },
    traverse(fn) { fn(node); for (const child of node.children) child.traverse(fn); },
  };
  return node;
}

/** Reads a GLB's JSON chunk. */
export function readGlbJson(path) {
  const bytes = readFileSync(path);
  const length = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'));
}

/**
 * Builds a plain-object instance of a character from its GLB (skeleton and empties only).
 * @param {string} assetId e.g. 'dez_tolliver'
 * @returns {{ instance: object, height: number }}
 */
export function loadCharacter(assetId) {
  const json = readGlbJson(`${ROOT}game/assets/characters/${assetId}.glb`);
  const nodes = json.nodes.map((n) => {
    const node = makeNode(n.name);
    if (n.translation) node.position.set(...n.translation);
    if (n.rotation) node.quaternion.set(...n.rotation);
    if (n.scale) node.scale.x = n.scale[0], node.scale.y = n.scale[1], node.scale.z = n.scale[2];
    return node;
  });
  json.nodes.forEach((n, i) => {
    for (const c of n.children ?? []) { nodes[c].parent = nodes[i]; nodes[i].children.push(nodes[c]); }
  });
  const instance = makeNode(assetId);
  for (const index of json.scenes[json.scene ?? 0].nodes) {
    nodes[index].parent = instance; instance.children.push(nodes[index]);
  }
  const height = json.scenes[json.scene ?? 0].extras?.height ?? json.extras?.height ?? 1.78;
  instance.userData.height = height;
  return { instance, height };
}

/** Every character asset with a GLB. */
export const CHARACTER_IDS = Object.freeze([
  'dez_tolliver', 'sol_arrieta', 'pedestrian_casual_m', 'pedestrian_office_f', 'pedestrian_older_f',
  'pedestrian_beach_m', 'police_officer_m', 'police_officer_f', 'swat_officer', 'paramedic',
  'gang_member_street', 'circle_enforcer', 'corriente_stevedore', 'jackal_rider', 'remache_stripper',
]);

/** A controller on a loaded character. */
export function makeWalker(assetId, options = {}) {
  const { instance, height } = loadCharacter(assetId);
  const walker = createLocomotionController(instance, { stature: height, seed: options.seed ?? 3, ...options });
  return { instance, walker, rig: walker.rig, body: walker.rig.body };
}

const v = new Float32Array(3);

/**
 * World positions of the measured points of the current pose.
 * @returns {Float64Array} joints (3 per bone), then sole points: heelL, ballL, tipL, heelR, ballR, tipR
 */
export function measurePoints(rig, instance, out = new Float64Array(BONE_COUNT * 3 + 18)) {
  const { fk, body } = rig;
  const rest = body.restPosition, p = fk.position;
  const yaw = instance.rotation.y, s = Math.sin(yaw), c = Math.cos(yaw), sc = instance.scale.x;
  const at = instance.position;
  const put = (o, x, y, z) => {
    x *= sc; y *= sc; z *= sc;
    out[o] = at.x + x * c + z * s; out[o + 1] = at.y + y; out[o + 2] = at.z - x * s + z * c;
  };
  for (let b = 0; b < BONE_COUNT; b += 1) put(b * 3, p[b * 3], p[b * 3 + 1], p[b * 3 + 2]);
  let o = BONE_COUNT * 3;
  for (const [foot, toe] of [[BONE.FOOT_L, BONE.TOE_L], [BONE.FOOT_R, BONE.TOE_R]]) {
    const f3 = foot * 3, t3 = toe * 3;
    // heel contact: under the ankle, heelBack behind; ball: under the toe joint; tip: toeLength beyond the ball
    const pts = [
      [foot, rest[f3], 0, rest[f3 + 2] + body.heelBack, f3],
      [foot, rest[t3], 0, rest[t3 + 2], f3],
      [toe, rest[t3], 0, rest[t3 + 2] - body.toeLength, t3],
    ];
    for (const [bone, x, y, z, base] of pts) {
      quatRotate(v, 0, fk.rotation, bone * 4, x - rest[base], y - rest[base + 1], z - rest[base + 2]);
      put(o, p[base] + v[0], p[base + 1] + v[1], p[base + 2] + v[2]);
      o += 3;
    }
  }
  return out;
}

/** Angle (radians) between two joint-to-joint segments a->b and b->c (0 straight). */
export function bendAt(points, a, b, c) {
  const ux = points[b * 3] - points[a * 3], uy = points[b * 3 + 1] - points[a * 3 + 1], uz = points[b * 3 + 2] - points[a * 3 + 2];
  const wx = points[c * 3] - points[b * 3], wy = points[c * 3 + 1] - points[b * 3 + 1], wz = points[c * 3 + 2] - points[b * 3 + 2];
  const d = (ux * wx + uy * wy + uz * wz) / (Math.hypot(ux, uy, uz) * Math.hypot(wx, wy, wz));
  return Math.acos(Math.max(-1, Math.min(1, d)));
}

/** Largest rotation (radians) of any bone's accumulated rotation between two fk rotation arrays. */
export function largestTurn(a, b) {
  let worst = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.abs(a[i] * b[i] + a[i + 1] * b[i + 1] + a[i + 2] * b[i + 2] + a[i + 3] * b[i + 3]);
    const angle = 2 * Math.acos(Math.min(1, d));
    if (angle > worst) worst = angle;
  }
  return worst;
}

/**
 * Runs a walker through a speed program and gathers statistics.
 * @param {object} kit From makeWalker.
 * @param {(t: number) => {x: number, z: number}} program Wanted world velocity at time t.
 * @param {object} [options] seconds, dt, ground (x, z) => height, skip (seconds before measuring).
 */
export function runProgram(kit, program, options = {}) {
  const { instance, walker, rig } = kit;
  const dt = options.dt ?? 1 / 60, seconds = options.seconds ?? 6, skip = options.skip ?? 1.5;
  const ground = options.ground ?? (() => 0);
  if (options.ground) walker.setGround(options.ground);
  const input = { moveX: 0, moveZ: 0, facing: NaN, strafe: false };
  const SOLE = BONE_COUNT * 3;
  let prev = null, prevRot = null;
  const stats = {
    frames: 0, slideMax: 0, slideSum: 0, slideCount: 0, penetration: 0, flightFrames: 0, groundedFrames: 0,
    elbowMin: Infinity, elbowMax: 0, elbowMean: 0, headY: [], headPitchMax: 0, jump: 0, jumpAt: 0, nan: false,
    kneeMax: 0, hipHigh: -Infinity, hipLow: Infinity, speeds: [],
  };
  for (let t = 0; t < seconds; t += dt) {
    const want = program(t);
    input.moveX = want.x; input.moveZ = want.z;
    input.facing = want.facing ?? NaN;
    walker.update(dt, input);
    instance.position.x += walker.state.vx * dt;
    instance.position.z += walker.state.vz * dt;
    instance.position.y = ground(instance.position.x, instance.position.z);
    const pts = measurePoints(rig, instance);
    const rot = Float32Array.from(rig.fk.rotation);
    for (let i = 0; i < pts.length; i += 1) if (!Number.isFinite(pts[i])) stats.nan = true;
    if (t >= skip && prev) {
      stats.frames += 1;
      let airborne = true;
      for (let foot = 0; foot < 2; foot += 1) {
        // the lowest sole point of the foot; on the ground (within 1.2 cm) it must not slide
        let low = Infinity, lowI = 0;
        for (let k = 0; k < 3; k += 1) {
          const o = SOLE + foot * 9 + k * 3;
          const h = pts[o + 1] - ground(pts[o], pts[o + 2]);
          stats.penetration = Math.max(stats.penetration, -h);
          if (h < low) { low = h; lowI = o; }
        }
        if (low < 0.012) {
          airborne = false;
          const speed = Math.hypot(pts[lowI] - prev[lowI], pts[lowI + 2] - prev[lowI + 2]) / dt;
          stats.slideMax = Math.max(stats.slideMax, speed);
          stats.slideSum += speed; stats.slideCount += 1;
        }
      }
      if (airborne) stats.flightFrames += 1; else stats.groundedFrames += 1;
      for (const [u, f, h] of [[BONE.UPPER_ARM_L, BONE.FOREARM_L, BONE.HAND_L], [BONE.UPPER_ARM_R, BONE.FOREARM_R, BONE.HAND_R]]) {
        const e = bendAt(pts, u, f, h);
        stats.elbowMin = Math.min(stats.elbowMin, e); stats.elbowMax = Math.max(stats.elbowMax, e);
        stats.elbowMean += e / 2;
      }
      for (const [u, f, h] of [[BONE.THIGH_L, BONE.SHIN_L, BONE.FOOT_L], [BONE.THIGH_R, BONE.SHIN_R, BONE.FOOT_R]]) {
        stats.kneeMax = Math.max(stats.kneeMax, bendAt(pts, u, f, h));
      }
      stats.headY.push(pts[BONE.HEAD * 3 + 1] - instance.position.y);
      const hy = pts[BONE.HIPS * 3 + 1] - instance.position.y;
      stats.hipHigh = Math.max(stats.hipHigh, hy); stats.hipLow = Math.min(stats.hipLow, hy);
      const turn = largestTurn(prevRot, rot);
      if (turn > stats.jump) { stats.jump = turn; stats.jumpAt = t; }
      stats.speeds.push(walker.state.speed);
    }
    prev = pts; prevRot = rot;
  }
  stats.elbowMean /= Math.max(1, stats.frames);
  stats.slideMean = stats.slideSum / Math.max(1, stats.slideCount);
  stats.flight = stats.flightFrames / Math.max(1, stats.frames);
  const hy = stats.headY;
  stats.headRange = hy.length ? Math.max(...hy) - Math.min(...hy) : 0;
  let acc = 0;
  for (let i = 2; i < hy.length; i += 1) acc = Math.max(acc, Math.abs(hy[i] - 2 * hy[i - 1] + hy[i - 2]) / (dt * dt));
  stats.headAccel = acc;
  delete stats.headY; delete stats.speeds;
  return stats;
}

/** Steady straight-line program at a speed (world -Z). */
export const straight = (speed) => () => ({ x: 0, z: -speed });
