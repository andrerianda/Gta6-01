// The cinematic camera: turns the shot that is on (a track from one framing to another, or a
// first-person path seen through a helmet visor) into the held camera of this frame, in world
// space. First-person shots walk a path of points with yaw and pitch, with a gentle head bob at
// walking pace and the sway of breathing; the visor's model (helmet_visor_rim /
// pressure_helmet_rim) and the pilot's own arm (pilot_arm_fp) hang on the game camera while
// their assets exist, and nothing happens while they do not.
import * as THREE from 'three';
import { ease } from './cinematicTimeline.js';

/** Seconds of one breath in the helmet. */
export const BREATH_SECONDS = 4.2;
const STEP_HERTZ = 1.85;
const VISOR_ASSETS = Object.freeze({ helmet: 'helmet_visor_rim', pressure: 'pressure_helmet_rim' });
const ARM_ASSET = 'pilot_arm_fp';
/** The arm in camera space: where the elbow and the hand are at rest (out of frame) and in each gesture. */
const ARM_POSES = Object.freeze({
  rest: { elbow: [0.36, -0.82, -0.22], hand: [0.3, -0.6, -0.6] },
  salute: { elbow: [0.4, -0.2, -0.3], hand: [0.15, 0.07, -0.2] },
  throttle: { elbow: [-0.02, -0.5, -0.16], hand: [-0.2, -0.4, -0.56] },
  reach: { elbow: [0.3, -0.42, -0.14], hand: [0.1, -0.1, -0.58] },
});

const mix = (a, b, k) => a + (b - a) * k;

/**
 * A first-person path at a time: position, yaw, pitch and walking speed (pure).
 * @param {{t: number, position: {x: number, y: number, z: number}, yaw: number, pitch: number}[]} path Sorted by t.
 * @param {number} t Seconds into the shot.
 */
export function samplePath(path, t, out = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: 0 }) {
  if (!path.length) return out;
  let i = 0;
  while (i + 1 < path.length && path[i + 1].t <= t) i += 1;
  const a = path[i], b = path[Math.min(path.length - 1, i + 1)];
  const span = b.t - a.t;
  const raw = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
  const k = raw * raw * (3 - 2 * raw);
  out.x = mix(a.position.x, b.position.x, k); out.y = mix(a.position.y, b.position.y, k); out.z = mix(a.position.z, b.position.z, k);
  out.yaw = mix(a.yaw, b.yaw, k); out.pitch = mix(a.pitch, b.pitch, k);
  const moving = span > 0 && raw > 0 && raw < 1;
  out.speed = moving ? Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z) / span * (6 * raw * (1 - raw)) : 0;
  return out;
}

/**
 * Creates the camera of one scene.
 * @param {object} options
 * @param {import('../core/systems/gameContext.js').GameContext} options.context
 * @param {{toWorld: Function, group: THREE.Object3D}} options.stage
 * @param {number} options.heading The stage heading.
 */
export function createCinematicCamera({ context, stage, heading }) {
  const assets = context.assets;
  const gameCamera = context.view?.camera ?? null;
  const held = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fieldOfView: 46 };
  const sample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: 0 };
  const p = { x: 0, y: 0, z: 0 }, q = { x: 0, y: 0, z: 0 };
  const attached = new Map();
  const matrix = new THREE.Matrix4(), eye = new THREE.Vector3(), aim = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let stride = 0, visorKind = null, breath = 0, hasView = false;

  /** A local point in world space: on the stage, or on what the shot is attached to. */
  function place(point, anchor, out) {
    if (!anchor) return stage.toWorld(point, out);
    const sin = Math.sin(anchor.heading ?? 0), cos = Math.cos(anchor.heading ?? 0);
    out.x = anchor.x + point.x * cos + point.z * sin;
    out.y = (anchor.y ?? 0) + point.y;
    out.z = anchor.z - point.x * sin + point.z * cos;
    return out;
  }

  function model(assetId) {
    if (!gameCamera || !assets || !assets.has(assetId)) return null;
    if (!attached.has(assetId)) {
      const instance = assets.instantiate(assetId);
      instance.traverse((node) => { if (node.isMesh) { node.frustumCulled = false; node.castShadow = false; } });
      instance.visible = false;
      gameCamera.add(instance);
      attached.set(assetId, instance);
    }
    return attached.get(assetId);
  }

  return {
    /** The held view: { position, target, fieldOfView } in world space. */
    held,
    get hasView() { return hasView; },
    /** The visor on now ('helmet' | 'pressure' | null), where the breath is (0..1), whether its model is drawn. */
    get visor() { return visorKind; },
    get breath() { return breath; },
    get visorModelShown() { return Boolean(visorKind && attached.get(VISOR_ASSETS[visorKind])?.visible); },

    /** A shot cue at t seconds into it. */
    shot(cue, t, anchor = null) {
      const k = cue.to ? ease(cue.ease, cue.seconds > 0 ? t / cue.seconds : 1) : 0;
      const a = cue.from, b = cue.to ?? cue.from;
      p.x = mix(a.position.x, b.position.x, k); p.y = mix(a.position.y, b.position.y, k); p.z = mix(a.position.z, b.position.z, k);
      q.x = mix(a.target.x, b.target.x, k); q.y = mix(a.target.y, b.target.y, k); q.z = mix(a.target.z, b.target.z, k);
      place(p, anchor, held.position);
      place(q, anchor, held.target);
      held.fieldOfView = mix(a.fov, b.fov, k);
      visorKind = null;
      hasView = true;
    },

    /** A first-person cue at t seconds into it; dt moves the stride of the head bob. */
    firstPerson(cue, t, dt, anchor = null) {
      samplePath(cue.path, Math.min(t, cue.seconds || t), sample);
      const pace = Math.min(1, sample.speed / 1.3);
      stride += dt * STEP_HERTZ * (0.4 + 0.6 * pace) * Math.PI * 2;
      const phase = (t / BREATH_SECONDS) * Math.PI * 2;
      breath = 0.5 - 0.5 * Math.cos(phase);
      const bob = 0.03 * cue.bob * pace;
      p.x = sample.x + Math.sin(stride * 0.5) * bob * 0.55;
      p.y = sample.y + Math.abs(Math.sin(stride * 0.5)) * bob * -1 + breath * 0.006 * cue.breath;
      p.z = sample.z;
      const pitch = sample.pitch + Math.sin(phase) * 0.006 * cue.breath + Math.sin(stride) * 0.004 * cue.bob * pace;
      const yaw = sample.yaw + Math.sin(phase * 0.5 + 1) * 0.004 * cue.breath;
      q.x = p.x - Math.sin(yaw) * Math.cos(pitch) * 10; q.y = p.y + Math.sin(pitch) * 10; q.z = p.z - Math.cos(yaw) * Math.cos(pitch) * 10;
      place(p, anchor, held.position);
      place(q, anchor, held.target);
      held.fieldOfView = cue.fov ?? 60;
      visorKind = cue.visor ?? null;
      hasView = true;
    },

    /** Shows the visor's model for the view that is on (or hides both). */
    showVisor() {
      for (const kind of Object.keys(VISOR_ASSETS)) {
        const on = kind === visorKind;
        const instance = on ? model(VISOR_ASSETS[kind]) : attached.get(VISOR_ASSETS[kind]);
        if (instance) instance.visible = on;
      }
    },

    /** The pilot's own arm: k 0..1 through the gesture (rises, holds, falls); null hides it. */
    arm(gesture, k) {
      const pose = gesture ? ARM_POSES[gesture] : null;
      const instance = pose ? model(ARM_ASSET) : attached.get(ARM_ASSET);
      if (!instance) return false;
      if (!pose || k >= 1) { instance.visible = false; return true; }
      const up01 = ease('smooth', Math.min(1, k / 0.28)) * (1 - ease('smooth', Math.max(0, (k - 0.76) / 0.24)));
      const rest = ARM_POSES.rest;
      eye.set(mix(rest.elbow[0], pose.elbow[0], up01), mix(rest.elbow[1], pose.elbow[1], up01), mix(rest.elbow[2], pose.elbow[2], up01));
      aim.set(mix(rest.hand[0], pose.hand[0], up01), mix(rest.hand[1], pose.hand[1], up01), mix(rest.hand[2], pose.hand[2], up01));
      instance.position.copy(eye);
      instance.quaternion.setFromRotationMatrix(matrix.lookAt(eye, aim, up)); // the forearm runs along -Z from the elbow
      instance.visible = true;
      return true;
    },

    dispose() {
      for (const instance of attached.values()) instance.removeFromParent();
      attached.clear();
      void heading;
    },
  };
}
