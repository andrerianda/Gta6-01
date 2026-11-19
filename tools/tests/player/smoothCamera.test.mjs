// Shift 12, the owner's first gameplay video (18 Nov ~13:00): the aim after stepping out of a car
// looked up at the towers (pointer-lock movement spikes climbing the pitch), the running camera
// must follow smoothly (damped, gentle lag, sprint pull-back eased in and out, the horizon
// steady through the body's bob), and the camera never sits inside a pedestrian.
import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { LOOK_SPIKE, ON_FOOT_FRAMING, createOnFootCamera, steadyLook } from '../../../game/src/player/onFootCamera.js';

register('./vendoredThreeHook.mjs', import.meta.url);
const { personClipNear, personReachOf, PERSON_KEEP } = await import('../../../game/src/player/cameraDirector.js');

test('the camera pulls in out of a person standing in its place, never past the lead clearance', () => {
  const pivot = { x: 0, y: 1.5, z: 0 }, camera = { x: 0, y: 1.7, z: 2.3 };
  const person = (x, z, tags = []) => ({ kind: 'character', position: { x, y: 0, z }, tags: new Set(tags) });
  const reach = personReachOf(pivot, camera, 0.95, [person(0.1, 2.2)]);
  const at = { x: camera.x * reach, z: camera.z * reach };
  assert.ok(Math.hypot(at.x - 0.1, at.z - 2.2) >= PERSON_KEEP - 1e-9, `clear of the person (reach ${reach.toFixed(2)})`);
  assert.equal(personReachOf(pivot, camera, 0.95, [person(2, 2)]), 1, 'someone a metre or more away: no change');
  assert.equal(personReachOf(pivot, camera, 0.95, [person(0, 2.3, ['player'])]), 1, 'the lead never pushes');
  assert.ok(personReachOf(pivot, camera, 0.95, [person(0, 1.2)]) >= 0.95 / Math.hypot(0.2, 2.3) - 1e-9, 'never closer than the clearance');
});

test('walking to the driver\'s door the view swings behind the lead toward the door', () => {
  const cam = createOnFootCamera();
  const target = { x: 0, y: 0, z: 0, heading: 0, speed: 1.5, sprinting: false, aiming: false, frameYaw: NaN };
  const shot = { pivot: {}, shoulder: {}, camera: {} };
  cam.cut(target);
  target.frameYaw = 1.6;
  for (let i = 0; i < 120; i += 1) cam.update(1 / 60, target, { lookX: 0, lookY: 0, sensitivity: 0.0022 }, 58, 16 / 9, shot);
  assert.ok(Math.abs(cam.rig.yaw - 1.6) < 0.1, `framed from behind at the door (${cam.rig.yaw.toFixed(2)})`);
});

const DEG = 180 / Math.PI;
const shotOf = () => ({ pivot: {}, shoulder: {}, camera: {} });
const lookOf = (lookX = 0, lookY = 0) => ({ lookX, lookY, sensitivity: 0.0022, invertY: false, swapShoulder: false });

test('pointer-lock spikes are dropped, a hand on the mouse is not', () => {
  // What headless Chrome sent in the recorder's aim (mouseprobe, 12:55): +-(cursor x, y) pairs,
  // left unpaired by the clicks between them.
  for (const [x, y] of [[-329, -180], [326, 180], [-640, -360], [0, -200]]) {
    const look = { lookX: x, lookY: y };
    assert.equal(steadyLook(look), true, `${x}, ${y} is a spike`);
    assert.equal(look.lookX, 0); assert.equal(look.lookY, 0);
  }
  for (const [x, y] of [[14, 0], [-120, 40], [LOOK_SPIKE.x, -LOOK_SPIKE.y]]) {
    const look = { lookX: x, lookY: y };
    assert.equal(steadyLook(look), false, `${x}, ${y} is a hand`);
    assert.equal(look.lookX, x); assert.equal(look.lookY, y);
  }
});

test('aiming after stepping out of a car starts level along the street, through the recorder\'s spikes', () => {
  const cam = createOnFootCamera();
  const target = { x: 0, y: 0, z: 0, heading: 0.4, speed: 0, sprinting: false, aiming: false };
  const shot = shotOf();
  cam.cut(target); // the mode change on stepping out
  // The recorder: right button held, a click every 0.65 s, spikes from each click.
  const frames = [];
  for (let i = 0; i < 300; i += 1) {
    target.aiming = i > 30;
    const spike = i > 30 && i % 39 === 0 ? [-329, -180] : i > 30 && i % 39 === 1 ? [326, 180] : i % 39 === 2 ? [-326, -180] : [0, 0];
    const look = lookOf(spike[0], spike[1]);
    steadyLook(look);
    cam.update(1 / 60, target, look, 58, 16 / 9, shot);
    frames.push(shot.pitch);
  }
  const worst = Math.max(...frames.slice(60).map((p) => Math.abs(p * DEG)));
  assert.ok(worst < 2.5, `aim pitch stays within 2.5 deg of level (worst ${worst.toFixed(2)})`);
  assert.ok(Math.abs(shot.pitch - ON_FOOT_FRAMING.aim.pitch) < 1e-3, 'settles on the aim framing pitch');
});

test('an aim started a while after looking up eases level; a hand moving the view keeps it', () => {
  const cam = createOnFootCamera();
  const target = { x: 0, y: 0, z: 0, heading: 0, speed: 0, sprinting: false, aiming: false };
  const shot = shotOf();
  cam.cut(target);
  for (let i = 0; i < 10; i += 1) cam.update(1 / 60, target, lookOf(0, -40), 58, 16 / 9, shot); // look up
  const up = cam.rig.look;
  assert.ok(up > 0.5, 'looked up');
  for (let i = 0; i < 90; i += 1) cam.update(1 / 60, target, lookOf(), 58, 16 / 9, shot); // 1.5 s still
  target.aiming = true;
  for (let i = 0; i < 40; i += 1) cam.update(1 / 60, target, lookOf(), 58, 16 / 9, shot);
  assert.ok(Math.abs(cam.rig.look) < 0.02, `level after 0.67 s of aim (${cam.rig.look})`);
  // Looked up just before aiming: kept (the player is aiming at a roof on purpose).
  target.aiming = false;
  for (let i = 0; i < 10; i += 1) cam.update(1 / 60, target, lookOf(0, -40), 58, 16 / 9, shot);
  target.aiming = true;
  for (let i = 0; i < 40; i += 1) cam.update(1 / 60, target, lookOf(), 58, 16 / 9, shot);
  assert.ok(cam.rig.look > 0.5, 'kept the deliberate look up');
});

/**
 * Runs the lead with fixed 60 Hz steps, drawn at uneven frame times and interpolated like the
 * director: 1 s jog north, a 90 degree turn right over 0.6 s, a 2 s sprint, a stop; the body's
 * vertical bob (0.04 m at 2.6 Hz) is in the capsule height. Returns per-frame measures.
 */
function runAndTurn(framing = ON_FOOT_FRAMING) {
  const cam = createOnFootCamera(framing);
  const step = 1 / 60;
  const lead = { x: 0, y: 0, z: 0, heading: 0, speed: 0, sprinting: false };
  let prev = { ...lead }, time = 0, sim = 0;
  const target = { x: 0, y: 0, z: 0, heading: 0, speed: 0, sprinting: false, aiming: false };
  const shot = shotOf();
  cam.cut(target);
  const frames = [];
  const dts = [1 / 144, 1 / 50, 1 / 90, 1 / 60, 1 / 40, 1 / 120];
  for (let f = 0; time < 5.5; f += 1) {
    const dt = dts[f % dts.length];
    time += dt;
    while (sim + step <= time) {
      prev = { ...lead };
      sim += step;
      const t = sim;
      const wanted = t < 1.6 ? 4.3 : t < 3.6 ? 7 : 0;
      lead.speed += Math.max(-12 * step, Math.min(10 * step, wanted - lead.speed));
      lead.sprinting = t >= 1.6 && t < 3.6;
      if (t > 1 && t < 1.6) lead.heading -= (Math.PI / 2) * (step / 0.6);
      lead.x += -Math.sin(lead.heading) * lead.speed * step;
      lead.z += -Math.cos(lead.heading) * lead.speed * step;
      lead.y = lead.speed > 0.5 ? 0.04 * Math.sin(t * 2.6 * Math.PI * 2) : 0;
    }
    const a = (time - sim) / step;
    target.x = prev.x + (lead.x - prev.x) * a; target.y = prev.y + (lead.y - prev.y) * a; target.z = prev.z + (lead.z - prev.z) * a;
    target.heading = prev.heading + (lead.heading - prev.heading) * a;
    target.speed = lead.speed; target.sprinting = lead.sprinting;
    cam.update(dt, target, lookOf(), 58, 16 / 9, shot);
    frames.push({ time, dt, x: shot.camera.x, y: shot.camera.y, z: shot.camera.z, yaw: shot.yaw, pitch: shot.pitch, fov: shot.fovOffset, lead: { ...target } });
  }
  return frames;
}

/** The largest camera acceleration (m/s^2) and yaw acceleration (rad/s^2) between frames. */
function roughness(frames) {
  let accel = 0, yawAccel = 0, fovRate = 0;
  for (let i = 2; i < frames.length; i += 1) {
    const [a, b, c] = [frames[i - 2], frames[i - 1], frames[i]];
    const v1 = [(b.x - a.x) / b.dt, (b.y - a.y) / b.dt, (b.z - a.z) / b.dt];
    const v2 = [(c.x - b.x) / c.dt, (c.y - b.y) / c.dt, (c.z - b.z) / c.dt];
    const span = (b.dt + c.dt) / 2;
    accel = Math.max(accel, Math.hypot(v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]) / span);
    yawAccel = Math.max(yawAccel, Math.abs((c.yaw - b.yaw) / c.dt - (b.yaw - a.yaw) / b.dt) / span);
    fovRate = Math.max(fovRate, Math.abs(c.fov - b.fov) / c.dt);
  }
  return { accel, yawAccel, fovRate };
}

test('the running camera follows smoothly at any frame rate: no snap, gentle lag, steady horizon', () => {
  const frames = runAndTurn();
  const { accel, fovRate } = roughness(frames);
  // A snap or a jitter between uneven frames shows as a spike of acceleration: the lead itself
  // accelerates at 10-12 m/s^2 and turns at 7 m/s around 0.6 s.
  assert.ok(accel < 40, `camera acceleration stays smooth (${accel.toFixed(1)} m/s^2)`);
  assert.ok(fovRate < 12, `the sprint's wider view eases (${fovRate.toFixed(1)} deg/s at most)`);
  // Gentle lag: at a steady jog the camera trails the lead's place by some decimetres.
  const jog = frames.find((f) => f.time > 0.9);
  const lag = Math.hypot(jog.x - jog.lead.x, jog.z - jog.lead.z);
  assert.ok(lag > 2.2 && lag < 3.2, `jog distance ${lag.toFixed(2)} m`);
  // The sprint pulls back and widens, and both ease in: the first 0.15 s of sprint barely move.
  const sprintStart = frames.find((f) => f.time > 1.6).fov;
  const early = frames.find((f) => f.time > 1.75).fov;
  const late = frames.find((f) => f.time > 3.5).fov;
  assert.ok(late - sprintStart > 2, `sprint widens the view (${sprintStart.toFixed(2)} -> ${late.toFixed(2)})`);
  assert.ok(early - sprintStart < 0.25 * (late - sprintStart), 'eases in');
  // The horizon: the pitch never moves without the mouse, and the bob barely reaches the camera.
  for (const f of frames) assert.ok(Math.abs(f.pitch - ON_FOOT_FRAMING.close.pitch) < 1e-9, 'pitch steady');
  const run = frames.filter((f) => f.time > 0.4 && f.time < 1);
  const ys = run.map((f) => f.y);
  const bob = (Math.max(...ys) - Math.min(...ys)) / 2;
  assert.ok(bob < 0.016, `camera bob ${bob.toFixed(3)} m from the body's 0.04 m`);
});

test('the view swings behind a running lead gently after the mouse rests', () => {
  const frames = runAndTurn();
  const { yawAccel } = roughness(frames);
  assert.ok(yawAccel < 6, `the swing eases in and out (${yawAccel.toFixed(2)} rad/s^2)`);
  const last = frames[frames.length - 1];
  const behind = Math.abs(((last.yaw - last.lead.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  assert.ok(behind < 0.6, `came round behind the lead (${(behind * DEG).toFixed(0)} deg off)`);
});

test('getting in between fixed steps never draws a frame from the chase rig\'s old place', async () => {
  const THREE = await import('three');
  const { createCameraDirector } = await import('../../../game/src/player/cameraDirector.js');
  const motion = { x: 0, y: 0, z: 0, heading: 0, groundSpeed: 0, sprinting: false, groundLevel: 0 };
  const player = { motion, vehicle: null, down: null, figure: null };
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 1000);
  const context = {
    systems: { find: (name) => (name === 'player' ? player : null) },
    events: { emit() {} },
    focus: { position: {} },
    view: { camera },
    settings: { get: () => undefined },
    input: { lookX: 0, lookY: 0, held: () => false, pressed: () => false, axis: () => 0 },
    entities: { within: (x, z, r, f, out) => { out.length = 0; return out; } },
  };
  const director = createCameraDirector(context);
  const car = { position: { x: 300, y: 0, z: 0 }, heading: 0, radius: 2.4, data: { speed: 0 }, tags: new Set() };
  // Drive far away, step out and walk back to the start, then get in a car parked there.
  player.vehicle = car;
  for (let i = 0; i < 30; i += 1) { director.sampleStep(); director.frame(1 / 60, 1); }
  player.vehicle = null; motion.x = 302;
  for (let i = 0; i < 30; i += 1) { director.sampleStep(); director.frame(1 / 60, 1); }
  motion.x = 0;
  director.cut('teleport');
  for (let i = 0; i < 30; i += 1) { director.sampleStep(); director.frame(1 / 60, 1); }
  car.position.x = 1.5;
  player.vehicle = car; // the transit's close: the lead is the driver now, no fixed step yet
  director.frame(1 / 60, 0.5);
  const away = Math.hypot(camera.position.x - car.position.x, camera.position.z - car.position.z);
  assert.ok(away < 12, `the first in-car frame is a chase shot of this car (${away.toFixed(1)} m away)`);
  assert.equal(director.mode, 'inVehicle');
});

test('a pedestrian at the camera is cut away by the near plane, never the lead', () => {
  const camera = { x: 0, y: 1.7, z: 0 };
  const person = (x, z, tags = []) => ({ kind: 'character', position: { x, y: 0, z }, tags: new Set(tags) });
  // Looking north (-z), the lead 2.3 m ahead; a passer-by's head right at the camera's corner.
  const near = personClipNear(camera, 0, -1, 2.3, [person(0.4, -0.2)]);
  assert.ok(near > 0.55 && near <= 1.7, `cuts them away (${near})`);
  assert.equal(personClipNear(camera, 0, -1, 2.3, [person(0, 1.0)]), 0, 'behind the camera: nothing');
  assert.equal(personClipNear(camera, 0, -1, 2.3, [person(0, -0.3, ['player'])]), 0, 'the lead is never cut');
  assert.equal(personClipNear(camera, 0, -1, 2.3, [person(3, -1)]), 0, 'far to the side: nothing');
  assert.ok(personClipNear(camera, 0, -1, 1.2, [person(0, -0.9)]) <= 0.6 + 1e-9, 'never closer to the lead than 0.6 m');
  assert.equal(personClipNear(camera, 0, -1, 2.3, [{ kind: 'vehicle', position: { x: 0, y: 0, z: -0.5 } }]), 0, 'only people');
});
