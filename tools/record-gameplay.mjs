// Records a gameplay video of about one minute: the real game at 1280x720 in its own cameras with
// the HUD on, played by scripted keyboard and mouse input (walk a busy street, enter a car with F,
// drive, gain a wanted level and drive away from the police, step out and shoot), recorded with
// Playwright's video recording and converted with ffmpeg to an H.264 MP4 (yuv420p, faststart).
//
//   node tools/record-gameplay.mjs                        record on the GPU machine, convert here
//   node tools/record-gameplay.mjs --here [--gpu-flags]   record in this process (software here)
//   node tools/record-gameplay.mjs --convert-only         convert the last raw video again
//
// Output goes only under /tmp/marazul/ (default /tmp/marazul/release/video/): gameplay-raw.webm,
// gameplay-run.json (the timeline and what the game said at each step) and gameplay.mp4.
// The debug object (window.MARAZUL) only sets the scene up: the street, the time of day, the car
// parked at the kerb, the pistol, and the wanted level; everything the player does is real input.
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
export const GAMEPLAY_PHASES = Object.freeze({ walk: 8, board: 6, cruise: 11, chase: 22, stop: 4, shoot: 10 });

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

  let carId = null;
  let last = null;
  let lastDir = null;
  let laneShift = 0;
  const traffic = C('traffic') ?? C('trafficFlow');
  window.__record = {
    say: () => {
      const p = lead().position;
      return { state: game.state.current, kind: lead().kind, inVehicle: !!player.vehicle, wanted: wanted?.level ?? null, x: Math.round(p.x), z: Math.round(p.z), hours: Math.round((game.clock.timeOfDay ?? 0) * 100) / 100, police: C('policeDispatch')?.units?.length ?? null, mouseCaptured: !!document.pointerLockElement };
    },
    /** Parks a car at the kerb beside the lead, pointing along the traffic lane. */
    parkCarBeside: () => {
      const here = lead().position;
      const hit = plan.nearestLane(here.x, here.z, 300);
      const dir = directionAlong(hit.lane.points, hit.x, hit.z);
      lastDir = dir;
      const at ={ x: here.x + (hit.x - here.x) * 0.55 + dir.fx * 3, z: here.z + (hit.z - here.z) * 0.55 + dir.fz * 3 };
      carId = fleet.spawn({ modelId: 'sports_coupe', position: { x: at.x, y: C('openWorldCity').groundHeightAt(at.x, at.z) + 0.6, z: at.z }, heading: compassOf(dir.fx, dir.fz), parked: true, ownerSystem: 'showcase' });
      return carId;
    },
    boardFallback: () => { if (!player.vehicle && carId != null) M.command('player/enterVehicle', { vehicleId: carId }); },
    setWanted: (level) => M.command('wanted/setLevel', { level }),
    givePistol: () => M.command('player/giveWeapon', { weaponId: 'pistol', ammo: 120 }),
    /** Where to steer to follow the road ahead: -1 left, 1 right, 0 straight, and the speed in m/s. */
    steer: (dt) => {
      const car = player.vehicle ? game.entities.get(player.vehicle.id ?? player.vehicle) ?? lead() : lead();
      const p = car.position;
      const now = { x: p.x, z: p.z };
      let vx = 0;
      let vz = 0;
      if (last) { vx = (now.x - last.x) / dt; vz = (now.z - last.z) / dt; }
      last = now;
      const speed = Math.hypot(vx, vz);
      // Follow a lane that runs our way: the nearest lane may be the opposite carriageway across a
      // median, so probe to the right of the car (traffic keeps right) until one runs with us.
      let fx = speed > 2 ? vx / speed : (lastDir?.fx ?? 0);
      let fz = speed > 2 ? vz / speed : (lastDir?.fz ?? -1);
      let hit = null;
      let dir = null;
      for (const offset of [0, 3.5, 7, 10.5]) {
        const probe = plan.nearestLane(now.x - fz * offset, now.z + fx * offset, 60);
        if (!probe) continue;
        const d = directionAlong(probe.lane.points, probe.x, probe.z);
        if (d.fx * fx + d.fz * fz > 0.3) { hit = probe; dir = d; break; }
      }
      if (!hit) return { steer: 0, speed, brake: false };
      lastDir = dir;
      if (speed <= 2) { fx = dir.fx; fz = dir.fz; }
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
        const free = [0, -3.5, 3.5, -7].find((offset) => offset !== laneShift && !blocked(offset));
        if (free === undefined) brake = true; else laneShift = free;
      } else if (laneShift !== 0 && !blocked(0)) laneShift = 0;
      const tx = hit.x + dir.fx * 16 - dir.fz * laneShift - now.x;
      const tz = hit.z + dir.fz * 16 + dir.fx * laneShift - now.z;
      const right = (tx * -fz + tz * fx) / (Math.hypot(tx, tz) || 1);
      return { steer: right > 0.08 ? 1 : right < -0.08 ? -1 : 0, speed, brake };
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
    let held = '';
    const end = Date.now() + seconds * 1000;
    let tick = Date.now();
    await key.down('KeyW');
    let throttle = true;
    let braking = false;
    while (Date.now() < end) {
      await wait(110);
      const dt = Math.max(0.05, (Date.now() - tick) / 1000);
      tick = Date.now();
      const hint = await page.evaluate((s) => window.__record.steer(s), dt).catch(() => ({ steer: 0, speed: 0 }));
      const want = hint.steer > 0 ? 'KeyD' : hint.steer < 0 ? 'KeyA' : '';
      if (want !== held) { if (held) await key.up(held); if (want) await key.down(want); held = want; }
      if (hint.brake && !braking) { if (throttle) await key.up('KeyW'); throttle = false; await key.down('KeyS'); braking = true; }
      else if (!hint.brake && braking) { await key.up('KeyS'); braking = false; }
      else if (braking && hint.speed < 1.5) { await key.up('KeyS'); braking = false; }
      if (braking) continue;
      if (throttle && hint.speed > targetSpeed) { await key.up('KeyW'); throttle = false; }
      else if (!throttle && hint.speed < targetSpeed - 3) { await key.down('KeyW'); throttle = true; }
    }
    if (held) await key.up(held);
    if (throttle) await key.up('KeyW');
    if (braking) await key.up('KeyS');
  };

  // A click on the game captures the mouse (pointer lock), as a player does; then the mouse turns the camera.
  await page.mouse.move(SIZE.width / 2, SIZE.height / 2);
  await page.mouse.click(SIZE.width / 2, SIZE.height / 2);
  await mark('start: on the kerb of Gran Via Marazul');
  // 1. Walk the busy street, sprint a little, look around with the mouse.
  await key.down('KeyW');
  await wait(2500);
  await key.down('ShiftLeft');
  for (let i = 0; i < 12; i += 1) { await page.mouse.move(SIZE.width / 2 + Math.sin(i / 2) * 10, SIZE.height / 2, { steps: 4 }); await wait(130); }
  await wait(1800);
  await key.up('ShiftLeft');
  await wait((GAMEPLAY_PHASES.walk - 6) * 1000);
  await key.up('KeyW');
  await mark('walked');
  // 2. A car at the kerb: F to get in.
  await page.evaluate(() => window.__record.parkCarBeside());
  await wait(600);
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
  await drive(GAMEPLAY_PHASES.cruise, 15);
  await mark('cruised');
  // 4. The police: three stars, a honk, and away from them at speed.
  await page.evaluate(() => window.__record.setWanted(3));
  await tap('KeyH', 400);
  await mark('wanted level 3');
  await drive(GAMEPLAY_PHASES.chase / 2, 25);
  await mark('chase, half way');
  await drive(GAMEPLAY_PHASES.chase / 2, 25);
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
  // Level the view (it tends to look up after getting out): the mouse down a little.
  for (let i = 1; i <= 8; i += 1) { await page.mouse.move(SIZE.width / 2, SIZE.height / 2 + i * 10, { steps: 2 }); await wait(40); }
  await wait(400);
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
    const video = page.video();
    await context.close();
    const raw = join(outDir, 'gameplay-raw.webm');
    renameSync(await video.path(), raw);
    report = { recordedAt: new Date().toISOString(), gpuFlags, hours, setUp, actionStartsAt: Math.round(actionStartsAt * 10) / 10, timeline, errors };
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
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const made = encodeMp4(raw, mp4, start);
    // An encode once came out a third as long as the raw video: check the length, and try again.
    if (made.seconds >= expected - 3) return made;
    console.error(`the MP4 is ${made.seconds} s, expected about ${expected} s: encoding again`);
  }
  throw new Error('the MP4 came out too short twice');
}

/** One ffmpeg encode: H.264, yuv420p, faststart, no audio. */
function encodeMp4(raw, mp4, start) {
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(start), '-i', raw, '-t', '72', '-an',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-maxrate', '2800k', '-bufsize', '5600k',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr}`);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], { encoding: 'utf8' });
  return { mp4, seconds: Math.round(Number(probe.stdout.trim()) * 10) / 10, megabytes: Math.round(statSync(mp4).size / 104857.6) / 10 };
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
