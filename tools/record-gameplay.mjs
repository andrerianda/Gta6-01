// Records a gameplay video of about one minute: the real game at 1280x720 in its own cameras with
// the HUD on, played by scripted keyboard and mouse input (walk a busy street, enter a car with F,
// drive, gain a wanted level and drive away from the police, step out and shoot), recorded with
// Playwright's video recording and converted with ffmpeg to an H.264 MP4 (yuv420p, faststart).
// The game's own sound (WebAudio) is tapped inside the page: every connection to the audio
// context's destination is also sent to a MediaStream destination that a MediaRecorder records
// from the moment the context exists; the recording comes back with the video and is muxed in as
// AAC, aligned to the picture by the wall-clock times both started at.
//
//   node tools/record-gameplay.mjs                        record on the GPU machine, convert here
//   node tools/record-gameplay.mjs --here [--gpu-flags]   record in this process (software here)
//   node tools/record-gameplay.mjs --convert-only         convert the last raw video again
//
// Output goes only under /tmp/marazul/ (default /tmp/marazul/release/video/): gameplay-raw.webm,
// gameplay-run.json (the timeline and what the game said at each step) and gameplay.mp4.
// The debug object (window.MARAZUL) only sets the scene up before the action starts: the street,
// the time of day, the car parked at the kerb ahead (so nothing appears in view), the pistol, and
// the wanted level; everything the player does is real input.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { acquireBrowserLock } from './browser-lock.mjs';
import { CHROMIUM_FLAGS } from './browser-page.mjs';
import { startStaticServer } from './static-server.mjs';

/** Chromium flags for hardware WebGL on the GPU machine (the same ones gpu-capture swaps in). */
export const GPU_CHROMIUM_FLAGS = Object.freeze(['--use-gl=angle', '--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist']);

/** The run, in order: each phase's length in seconds. About 62 s of play in all. */
export const GAMEPLAY_PHASES = Object.freeze({ walk: 10, board: 6, cruise: 10, chase: 22, stop: 4, shoot: 10 });

/** Target speeds of the autopilot in m/s: calm cruising, a brisk (not reckless) getaway. */
export const DRIVE_SPEEDS = Object.freeze({ cruise: 12, chase: 19 });

/**
 * The ffmpeg audio filter that lines the page's sound up with the cut picture: the sound started
 * `audioOffset` s after the raw video, and the MP4 starts `cutStart` s into the raw video.
 */
export function audioAlignFilter(audioOffset, cutStart) {
  const lag = audioOffset - cutStart;
  const shift = lag >= 0 ? `adelay=${Math.round(lag * 1000)}:all=1` : `atrim=start=${(-lag).toFixed(3)},asetpts=PTS-STARTPTS`;
  return `[1:a]aresample=48000:async=1,${shift},apad[a]`;
}

/* eslint-disable no-undef */
/** Init script for the page: taps every WebAudio output into a MediaRecorder (see the header). */
function tapGameAudioInPage() {
  const connect = AudioNode.prototype.connect;
  const taps = new WeakMap();
  AudioNode.prototype.connect = function connectAndTap(target, ...rest) {
    const result = connect.call(this, target, ...rest);
    if (typeof AudioDestinationNode !== 'undefined' && target instanceof AudioDestinationNode) {
      let tap = taps.get(target.context);
      if (!tap) {
        const destination = target.context.createMediaStreamDestination();
        const recorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 });
        tap = { destination, recorder, chunks: [], startedAt: 0, context: target.context };
        recorder.ondataavailable = (event) => { if (event.data.size) tap.chunks.push(event.data); };
        recorder.onstart = () => { tap.startedAt = Date.now(); };
        recorder.start(1000);
        taps.set(target.context, tap);
        window.__audioTap = tap;
      }
      connect.call(this, tap.destination);
    }
    return result;
  };
}

/** Stops the page's audio recording and returns it as base64 with the time it started. */
async function collectGameAudioInPage() {
  const tap = window.__audioTap;
  if (!tap) return null;
  await new Promise((done) => { tap.recorder.onstop = done; tap.recorder.stop(); });
  const bytes = new Uint8Array(await new Blob(tap.chunks, { type: 'audio/webm' }).arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { base64: btoa(text), startedAt: tap.startedAt, state: tap.context.state };
}
/* eslint-enable no-undef */

const USAGE = 'node tools/record-gameplay.mjs [--here] [--gpu-flags] [--convert-only] [--out-dir /tmp/marazul/release/video] [--hours 17.6]';
const SIZE = { width: 1280, height: 720 };
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/* eslint-disable no-undef */
/** Runs in the page: sets the scene up and publishes small helpers as window.__record. */
async function setUpRunInPage({ hours }) {
  const M = window.MARAZUL;
  await M.whenReady();
  const game = M.context;
  const C = (name) => game.systems.find(name);
  const plan = C('openWorldCity').plan;
  const fleet = C('vehicles');
  const player = C('player');
  const wanted = C('wantedLevel');
  const lead = () => game.entities.firstWithTag('player');
  const compassOf = (fx, fz) => Math.atan2(fx, -fz);
  const pointsOf = (line) => (typeof line[0] === 'number'
    ? Array.from({ length: Math.floor(line.length / 2) }, (_, i) => ({ x: line[2 * i], z: line[2 * i + 1] }))
    : line.map((p) => (Array.isArray(p) ? { x: p[0], z: p[1] } : { x: p.x, z: p.z })));
  const directionAlong = (line, x, z) => {
    const pts = pointsOf(line);
    let best = Infinity;
    let dir = { fx: 0, fz: -1 };
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const d = Math.hypot((pts[i].x + pts[i + 1].x) / 2 - x, (pts[i].z + pts[i + 1].z) / 2 - z);
      const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z) || 1;
      if (d < best) { best = d; dir = { fx: (pts[i + 1].x - pts[i].x) / len, fz: (pts[i + 1].z - pts[i].z) / len }; }
    }
    return dir;
  };
  if (game.state.current !== 'playing') M.enterState('playing');
  M.setWeather('clear');
  M.setTime(hours);
  const street = plan.stagingStreets.find((s) => s.key === 'gran_via_marazul') ?? plan.stagingStreets[0];
  const t = 0.58;
  const sx = street.eastEnd.x + (street.westEnd.x - street.eastEnd.x) * t;
  const sz = street.eastEnd.z + (street.westEnd.z - street.eastEnd.z) * t;
  const road = plan.nearestRoad(sx, sz, 200);
  const d = directionAlong(road.segment.points, road.x, road.z);
  const side = (road.segment.halfWidth ?? 6) + 1.6;
  const foot = { x: road.x - d.fz * side, z: road.z + d.fx * side };
  const compass = compassOf(d.fx, d.fz);
  M.teleport(foot, -compass);
  await M.whenIdle(90000);
  M.teleport(foot, -compass);
  await M.whenIdle(30000);

  // The car waits at the kerb ~24 m ahead, parked before the action starts, so it is never seen to
  // appear. The lead faces east along Gran Via after this teleport (every recorded run walked +x).
  const walk = d.fx >= 0 ? d : { fx: -d.fx, fz: -d.fz };
  const ahead = { x: foot.x + walk.fx * 24, z: foot.z + walk.fz * 24 };
  const kerbLane = plan.nearestLane(ahead.x, ahead.z, 300);
  const laneDir = directionAlong(kerbLane.lane.points, kerbLane.x, kerbLane.z);
  const carAt = { x: ahead.x + (kerbLane.x - ahead.x) * 0.6, z: ahead.z + (kerbLane.z - ahead.z) * 0.6 };
  const carId = fleet.spawn({ modelId: 'sports_coupe', position: { x: carAt.x, y: C('openWorldCity').groundHeightAt(carAt.x, carAt.z) + 0.6, z: carAt.z }, heading: compassOf(laneDir.fx, laneDir.fz), parked: true, ownerSystem: 'showcase' });
  await M.whenIdle(20000);


  let last = null;
  let lastDir = laneDir;
  let laneShift = 0;
  const traffic = C('traffic') ?? C('trafficFlow');
  window.__record = {
    say: () => {
      const p = lead().position;
      return { state: game.state.current, kind: lead().kind, inVehicle: !!player.vehicle, wanted: wanted?.level ?? null, x: Math.round(p.x), z: Math.round(p.z), hours: Math.round((game.clock.timeOfDay ?? 0) * 100) / 100, police: C('policeDispatch')?.units?.length ?? null, mouseCaptured: !!document.pointerLockElement };
    },
    /** Metres from the lead to the car parked at the kerb (the walk stops beside it). */
    carDistance: () => {
      const car = game.entities.get(carId);
      if (!car) return null;
      const p = lead().position;
      return Math.hypot(car.position.x - p.x, car.position.z - p.z);
    },
    boardFallback: () => { if (!player.vehicle && carId != null) M.command('player/enterVehicle', { vehicleId: carId }); },
    setWanted: (level) => M.command('wanted/setLevel', { level }),
    givePistol: () => M.command('player/giveWeapon', { weaponId: 'pistol', ammo: 120 }),
    /** How hard to steer to keep in lane: -1 (full left) .. 1 (full right), the speed in m/s, brake. */
    steer: (dt) => {
      const car = player.vehicle ? game.entities.get(player.vehicle.id ?? player.vehicle) ?? lead() : lead();
      const p = car.position;
      const now = { x: p.x, z: p.z };
      let vx = 0;
      let vz = 0;
      if (last) { vx = (now.x - last.x) / dt; vz = (now.z - last.z) / dt; }
      last = now;
      const speed = Math.hypot(vx, vz);
      // Follow a lane that runs along the route: the nearest lane may be the opposite carriageway
      // across a median, so probe to the right of the car (traffic keeps right); a lane more than
      // ~30 degrees off the route (a cross street at a junction) never counts, so the car keeps
      // straight through junctions instead of cutting into a corner.
      let fx = speed > 3 ? vx / speed : lastDir.fx;
      let fz = speed > 3 ? vz / speed : lastDir.fz;
      let hit = null;
      let dir = null;
      for (const offset of [0, 3.5, 7, 10.5]) {
        const probe = plan.nearestLane(now.x - lastDir.fz * offset, now.z + lastDir.fx * offset, 60);
        if (!probe) continue;
        const d = directionAlong(probe.lane.points, probe.x, probe.z);
        if (d.fx * lastDir.fx + d.fz * lastDir.fz > 0.87) { hit = probe; dir = d; break; }
      }
      if (!hit) {
        // No lane along the route here (inside a junction): hold the route's line.
        const right = (lastDir.fx * -fz + lastDir.fz * fx);
        return { steer: Math.max(-1, Math.min(1, right * 3)), speed, brake: false };
      }
      // The route turns only gently with the lane, so one odd probe cannot swing the car.
      const bx = lastDir.fx * 0.8 + dir.fx * 0.2;
      const bz = lastDir.fz * 0.8 + dir.fz * 0.2;
      const bl = Math.hypot(bx, bz) || 1;
      lastDir = { fx: bx / bl, fz: bz / bl };
      if (speed <= 3) { fx = dir.fx; fz = dir.fz; }
      // Cars ahead: overtake on the left (or the right) when that line is clear, else brake.
      const carsNear = traffic && traffic.nearCars ? traffic.nearCars([], 60) : [];
      const ownId = player.vehicle?.id;
      const reach = 12 + speed * 1.2;
      const blocked = (offset) => carsNear.some((id) => {
        if (id === ownId) return false;
        const other = game.entities.get(id);
        if (!other) return false;
        const rx = other.position.x - (hit.x - fz * offset);
        const rz = other.position.z - (hit.z + fx * offset);
        const ahead = rx * fx + rz * fz;
        return ahead > -2 && ahead < reach && Math.abs(rx * -fz + rz * fx) < 2.4;
      });
      let brake = false;
      if (blocked(laneShift)) {
        const free = [0, -3.5, 3.5].find((offset) => offset !== laneShift && !blocked(offset));
        if (free === undefined) brake = true; else laneShift = free;
      } else if (laneShift !== 0 && !blocked(0)) laneShift = 0;
      // Aim at a point on the lane further ahead the faster the car goes: smooth, no weaving.
      const look = 12 + speed * 1.1;
      const tx = hit.x + dir.fx * look - dir.fz * laneShift - now.x;
      const tz = hit.z + dir.fz * look + dir.fx * laneShift - now.z;
      const right = (tx * -fz + tz * fx) / (Math.hypot(tx, tz) || 1);
      return { steer: Math.max(-1, Math.min(1, right * 3)), speed, brake };
    },
  };
  return window.__record.say();
}
/* eslint-enable no-undef */

/** Plays the scripted run with real keyboard and mouse input; returns the timeline. */
async function playTheRun(page, startedAt) {
  const timeline = [];
  const mark = async (step) => {
    const said = await page.evaluate(() => window.__record.say()).catch((error) => ({ error: String(error).slice(0, 200) }));
    timeline.push({ at: Math.round((Date.now() - startedAt) / 100) / 10, step, ...said });
  };
  const key = page.keyboard;
  const tap = async (code, ms = 120) => { await key.down(code); await wait(ms); await key.up(code); };
  const drive = async (seconds, targetSpeed) => {
    const end = Date.now() + seconds * 1000;
    let tick = Date.now();
    await key.down('KeyW');
    let throttle = true;
    let braking = false;
    while (Date.now() < end) {
      const tickStart = Date.now();
      const dt = Math.max(0.05, (tickStart - tick) / 1000);
      tick = tickStart;
      const hint = await page.evaluate((s) => window.__record.steer(s), dt).catch(() => ({ steer: 0, speed: 0 }));
      if (hint.brake && !braking) { if (throttle) await key.up('KeyW'); throttle = false; await key.down('KeyS'); braking = true; }
      else if (!hint.brake && braking) { await key.up('KeyS'); braking = false; }
      else if (braking && hint.speed < 1.5) { await key.up('KeyS'); braking = false; }
      // Slower through a bend; the throttle has a small band so it does not flutter.
      const want = targetSpeed * (1 - 0.35 * Math.abs(hint.steer));
      if (!braking && throttle && hint.speed > want) { await key.up('KeyW'); throttle = false; }
      else if (!braking && !throttle && hint.speed < want - 2) { await key.down('KeyW'); throttle = true; }
      // Steering like a player tapping A/D: the key is held for a share of the tick as large as
      // the correction needed, so small corrections stay small.
      const share = Math.abs(hint.steer);
      if (share > 0.1) {
        const steerKey = hint.steer > 0 ? 'KeyD' : 'KeyA';
        await key.down(steerKey);
        await wait(Math.round(25 + share * 85));
        await key.up(steerKey);
      }
      await wait(Math.max(10, 120 - (Date.now() - tickStart)));
    }
    if (throttle) await key.up('KeyW');
    if (braking) await key.up('KeyS');
  };

  // A click on the game captures the mouse (pointer lock), as a player does; then the mouse turns the camera.
  await page.mouse.move(SIZE.width / 2, SIZE.height / 2);
  await page.mouse.click(SIZE.width / 2, SIZE.height / 2);
  await mark('start: on the kerb of Gran Via Marazul');
  // 1. Walk the busy street, jog a little, up to the car parked at the kerb ahead.
  const carDistance = () => page.evaluate(() => window.__record.carDistance()).catch(() => null);
  await key.down('KeyW');
  await wait(2500);
  await key.down('ShiftLeft');
  await wait(2500);
  await key.up('ShiftLeft');
  const walkBy = Date.now() + (GAMEPLAY_PHASES.walk - 5) * 1000;
  while (Date.now() < walkBy) {
    const metres = await carDistance();
    if (metres !== null && metres < 4.5) break;
    await wait(150);
  }
  await key.up('KeyW');
  await mark('walked up to the parked car');
  // 2. F to get in.
  await wait(300);
  await tap('KeyF');
  const boardBy = Date.now() + GAMEPLAY_PHASES.board * 1000;
  while (Date.now() < boardBy) {
    await wait(250);
    if ((await page.evaluate(() => window.__record.say().inVehicle))) break;
  }
  if (!(await page.evaluate(() => window.__record.say().inVehicle))) {
    await page.evaluate(() => window.__record.boardFallback());
    await wait(1500);
  }
  await mark('boarded');
  // 3. Drive down the street.
  await drive(GAMEPLAY_PHASES.cruise, DRIVE_SPEEDS.cruise);
  await mark('cruised');
  // 4. The police: two stars (at three they shoot the car until it burns), a honk, away at speed.
  await page.evaluate(() => window.__record.setWanted(2));
  await tap('KeyH', 400);
  await mark('wanted level 2');
  await drive(GAMEPLAY_PHASES.chase / 2, DRIVE_SPEEDS.chase);
  await mark('chase, half way');
  await drive(GAMEPLAY_PHASES.chase / 2, DRIVE_SPEEDS.chase);
  await mark('chase, end');
  // 5. Brake to a stop (the handbrake to finish) and step out with F once the car stands.
  await key.down('KeyS');
  await wait(1800);
  await key.down('Space');
  await wait(900);
  await key.up('Space');
  await key.up('KeyS');
  await tap('KeyF');
  const outBy = Date.now() + GAMEPLAY_PHASES.stop * 1000;
  while (Date.now() < outBy) {
    await wait(300);
    if (!(await page.evaluate(() => window.__record.say().inVehicle))) break;
    if (Date.now() > outBy - 2500) await tap('KeyF');
  }
  await wait(600);
  await mark('stepped out');
  // 6. Draw the pistol, aim with the right mouse button, fire with the left, sweep the aim a little.
  await page.evaluate(() => window.__record.givePistol());
  await wait(500);
  await page.mouse.down({ button: 'right' });
  await wait(700);
  const shots = Math.round(GAMEPLAY_PHASES.shoot * 1.3);
  for (let i = 0; i < shots; i += 1) {
    await page.mouse.move(SIZE.width / 2 + Math.sin(i / 3) * 14, SIZE.height / 2, { steps: 3 });
    await page.mouse.down({ button: 'left' });
    await wait(90);
    await page.mouse.up({ button: 'left' });
    await wait(560);
    if (i === Math.floor(shots / 2)) await mark('shooting');
  }
  await page.mouse.up({ button: 'right' });
  await wait(800);
  await mark('end');
  return timeline;
}

/** Records the run in this process; writes gameplay-raw.webm and gameplay-run.json to outDir. */
async function recordHere(outDir, { gpuFlags, hours }) {
  const rawDir = join(outDir, 'raw');
  mkdirSync(rawDir, { recursive: true });
  const lock = await acquireBrowserLock({});
  const server = await startStaticServer('game');
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch({ args: [...(gpuFlags ? GPU_CHROMIUM_FLAGS : CHROMIUM_FLAGS)], timeout: 120000 });
  const errors = [];
  let report = null;
  try {
    const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: rawDir, size: SIZE } });
    await context.route('**/*', (route) => (route.request().url().startsWith(server.origin) ? route.continue() : route.abort('blockedbyclient')));
    await context.addInitScript(tapGameAudioInPage);
    const page = await context.newPage();
    const videoStartedAt = Date.now();
    page.on('pageerror', (error) => { if (errors.length < 20) errors.push(`page error: ${String(error.message || error).slice(0, 300)}`); });
    page.on('console', (message) => { if (message.type() === 'error' && errors.length < 20) errors.push(`console error: ${message.text().slice(0, 300)}`); });
    await page.goto(`${server.origin}/index.html?seed=1&quality=high`, { waitUntil: 'commit', timeout: 300000 });
    await page.waitForFunction('window.__gameReady === true', null, { timeout: 300000, polling: 250 });
    const setUp = await page.evaluate(setUpRunInPage, { hours });
    await wait(1500);
    const actionStartsAt = (Date.now() - videoStartedAt) / 1000;
    const timeline = await playTheRun(page, Date.now());
    const audio = await page.evaluate(collectGameAudioInPage).catch((error) => ({ error: String(error).slice(0, 300) }));
    const video = page.video();
    await context.close();
    const raw = join(outDir, 'gameplay-raw.webm');
    renameSync(await video.path(), raw);
    let sound = { recorded: false, why: audio?.error ?? 'the game made no audio context (no click?)' };
    if (audio?.base64) {
      writeFileSync(join(outDir, 'gameplay-audio.webm'), Buffer.from(audio.base64, 'base64'));
      sound = { recorded: true, contextState: audio.state, offset: Math.round((audio.startedAt - videoStartedAt) / 10) / 100, bytes: Math.round(audio.base64.length * 0.75) };
    }
    report = { recordedAt: new Date().toISOString(), gpuFlags, hours, setUp, actionStartsAt: Math.round(actionStartsAt * 10) / 10, sound, timeline, errors };
    writeFileSync(join(outDir, 'gameplay-run.json'), `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
    await lock.release();
  }
  return report;
}

/** Converts the raw video to an MP4 from where the action starts. */
function convertToMp4(outDir) {
  const report = JSON.parse(readFileSync(join(outDir, 'gameplay-run.json'), 'utf8'));
  const raw = join(outDir, 'gameplay-raw.webm');
  const mp4 = join(outDir, 'gameplay.mp4');
  const start = Math.max(0, (report.actionStartsAt ?? 0) - 0.5);
  const expected = Math.min(72, (report.timeline?.at(-1)?.at ?? 60) + 0.5);
  const audioFile = join(outDir, 'gameplay-audio.webm');
  const audio = report.sound?.recorded && existsSync(audioFile) ? { file: audioFile, offset: report.sound.offset } : null;
  if (!audio) console.error('no game audio recorded: the MP4 has no sound');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const made = encodeMp4(raw, mp4, start, audio);
    // An encode once came out a third as long as the raw video: check the length, and try again.
    if (made.seconds >= expected - 3) return made;
    console.error(`the MP4 is ${made.seconds} s, expected about ${expected} s: encoding again`);
  }
  throw new Error('the MP4 came out too short twice');
}

/** One ffmpeg encode: H.264, yuv420p, faststart; with the game's sound as AAC when there is some. */
function encodeMp4(raw, mp4, start, audio) {
  const input = ['-ss', String(start), '-i', raw];
  const sound = audio
    ? ['-i', audio.file, '-filter_complex', audioAlignFilter(audio.offset, start), '-map', '0:v:0', '-map', '[a]', '-c:a', 'aac', '-b:a', '160k', '-ac', '2']
    : ['-an'];
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...input, ...sound, '-t', '72',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-maxrate', '2800k', '-bufsize', '5600k',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-shortest', mp4], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr}`);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], { encoding: 'utf8' });
  return { mp4, seconds: Math.round(Number(probe.stdout.trim()) * 10) / 10, megabytes: Math.round(statSync(mp4).size / 104857.6) / 10, sound: audio ? loudnessOf(mp4) : null };
}

/** The MP4's sound level (ffmpeg volumedetect): mean and peak in dB; about -91 dB is silence. */
function loudnessOf(mp4) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-i', mp4, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const level = (name) => Number((result.stderr.match(new RegExp(`${name}: (-?[\\d.]+) dB`)) ?? [])[1]);
  return { meanDb: level('mean_volume'), peakDb: level('max_volume') };
}

/** Runs this tool with --here on the GPU machine; the files come back under /tmp/marazul/. */
function recordOnGpu(outDir, hours) {
  const setup = readFileSync('/opt/marazul-tools/pod-browser-setup.sh').toString('base64');
  const remote = [
    'export PATH=/opt/node/bin:$PATH PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers NODE_PATH=/opt/node/lib/node_modules',
    `flock /tmp/pw-setup.lock bash -c "$(echo ${setup} | base64 -d)" >/dev/null 2>&1`,
    'ls /opt/pw-browsers | grep -q ffmpeg || npx -y playwright@1.63.0 install ffmpeg >/dev/null 2>&1',
    'mkdir -p node_modules && ln -sfn /opt/node/lib/node_modules/playwright node_modules/playwright && ln -sfn /opt/node/lib/node_modules/playwright-core node_modules/playwright-core',
    `node tools/record-gameplay.mjs --here --gpu-flags --out-dir ${outDir} --hours ${hours}`,
  ].join('; ');
  const result = spawnSync('/opt/marazul-tools/gpu-run', ['--sync', 'game,tools', '--pull', 'nothing_to_pull', '--timeout', '900', '--', 'bash', '-c', remote], { stdio: 'inherit' });
  return result.status;
}

async function main() {
  const { values } = parseArgs({ options: {
    here: { type: 'boolean', default: false },
    'gpu-flags': { type: 'boolean', default: false },
    'convert-only': { type: 'boolean', default: false },
    'out-dir': { type: 'string', default: '/tmp/marazul/release/video' },
    hours: { type: 'string', default: '17.6' },
    help: { type: 'boolean', default: false },
  } });
  if (values.help) { console.log(USAGE); return 0; }
  const outDir = resolve(values['out-dir']);
  if (!outDir.startsWith('/tmp/marazul/')) { console.error('--out-dir must be under /tmp/marazul/'); return 2; }
  if (!existsSync('game/index.html')) { console.error('run from the repository root'); return 2; }
  const hours = Number(values.hours);
  if (values.here) {
    const report = await recordHere(outDir, { gpuFlags: values['gpu-flags'], hours });
    console.log(JSON.stringify({ timeline: report.timeline, errors: report.errors }, null, 1));
    return report.errors.some((e) => e.startsWith('page error')) ? 1 : 0;
  }
  if (!values['convert-only']) {
    mkdirSync(outDir, { recursive: true });
    const status = recordOnGpu(outDir, hours);
    if (status !== 0) { console.error(`the GPU run ended with ${status}${status === 75 ? ' (no GPU machine: try --here)' : ''}`); return status || 1; }
  }
  if (!readdirSync(outDir).includes('gameplay-raw.webm')) { console.error(`no gameplay-raw.webm in ${outDir}`); return 1; }
  console.log(JSON.stringify(convertToMp4(outDir)));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main();
