// The QA tour of the real game: boots index.html, drives it through window.MARAZUL, visits the
// places of docs/CITY_PLAN.md (the staging streets, a signalled junction, the beach and pier, the
// causeway, the marina, the port, Barrio Hierro, Las Lomas, Los Pantanos, Isla Coral) on foot and
// in a car at golden hour and at night, and plays the basic loops by scripted input (walk, sprint,
// enter a car with F, drive into a wall, shoot a car until it burns, a wanted level gained and
// lost, the first mission). Every view is grabbed from the canvas (without the DOM HUD); the
// page picture at the end shows the last view with the HUD. It also gathers the frame times, the
// scene cost (MARAZUL.sceneCost / profile), the player's height over the ground and the game's
// warnings, and writes them beside the pictures.
//
//   node tools/qa-tour.mjs --part streets --out-dir /tmp/marazul/qa/tour      (GPU machine)
//   node tools/qa-tour.mjs --part districts --out-dir /tmp/marazul/qa/tour
//   node tools/qa-tour.mjs --part loops --out-dir /tmp/marazul/qa/loops
//   node tools/qa-tour.mjs --part streets --local ...       (software browser of this machine)
//   node tools/qa-tour.mjs --part streets --print-eval      (only print the in-page snippet)
//
// The GPU tool does not ship files from /tmp, so the snippet goes inline as --eval. Output goes
// only under /tmp/marazul/. A contact sheet is made with ImageMagick's montage when it is there.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

/** The parts of the tour: which places each visits, or the loops. */
export const QA_TOUR_PARTS = Object.freeze({
  streets: ['bulevar_dorado', 'gran_via_marazul', 'signal_junction', 'beach_and_pier', 'calzada_coral', 'marina'],
  districts: ['port_quay', 'barrio_hierro', 'las_lomas', 'los_pantanos', 'isla_coral'],
  loops: [],
});

/**
 * The snippet run in the page: the tour of some places, or the loops.
 * @param {{part: string, places: string[], golden: number, night: number, jpeg: number}} options
 * @returns {string} A JavaScript expression whose promise resolves with the results.
 */
export function buildTourSnippet(options) {
  return `(${tourInPage.toString()})(${JSON.stringify(options)})`;
}

/* eslint-disable no-undef */
/** Runs inside the game page. Everything it needs is defined inside it. */
async function tourInPage(options) {
  const M = window.MARAZUL;
  await M.whenReady();
  const game = M.context;
  const C = (name) => game.systems.find(name);
  const city = C('openWorldCity');
  const plan = city.plan;
  const fleet = C('vehicles');
  const canvas = game.view?.renderer?.domElement ?? document.querySelector('canvas');
  const grabCanvas = document.createElement('canvas');
  grabCanvas.width = 960;
  grabCanvas.height = 540;
  const grab2d = grabCanvas.getContext('2d');
  const frames = [];
  const notes = [];
  const r1 = (v) => Math.round(v * 10) / 10;
  const ground = (x, z) => city.groundHeightAt(x, z);
  const pointsOf = (line) => {
    if (!line) return [];
    if (typeof line[0] === 'number') {
      const out = [];
      for (let i = 0; i + 1 < line.length; i += 2) out.push({ x: line[i], z: line[i + 1] });
      return out;
    }
    return line.map((p) => (Array.isArray(p) ? { x: p[0], z: p[1] } : { x: p.x, z: p.z }));
  };
  const compassOf = (fx, fz) => Math.atan2(fx, -fz);
  const toward = (from, to) => compassOf(to.x - from.x, to.z - from.z);
  const directionAlong = (line, x, z) => {
    const pts = pointsOf(line);
    let best = Infinity;
    let dir = { fx: 0, fz: -1 };
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const mz = (pts[i].z + pts[i + 1].z) / 2;
      const d = Math.hypot(mx - x, mz - z);
      const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z) || 1;
      if (d < best) { best = d; dir = { fx: (pts[i + 1].x - pts[i].x) / len, fz: (pts[i + 1].z - pts[i].z) / len }; }
    }
    return dir;
  };
  /** A pavement spot beside the nearest road, looking along it (dir sign 1 or -1). */
  const kerbView = (x, z, sign = 1) => {
    const road = plan.nearestRoad(x, z, 200);
    if (!road) return { foot: { x, z }, compass: 0 };
    const seg = road.segment;
    const d = directionAlong(seg.points, road.x, road.z);
    const fx = d.fx * sign;
    const fz = d.fz * sign;
    const side = (seg.halfWidth ?? 6) + 1.6;
    return { foot: { x: road.x - fz * side, z: road.z + fx * side }, compass: compassOf(fx, fz), roadName: seg.name };
  };
  /** The nearest lane point and its direction of travel. */
  const laneSpot = (x, z) => {
    const hit = plan.nearestLane(x, z, 300);
    if (!hit) return null;
    const d = directionAlong(hit.lane.points, hit.x, hit.z);
    return { x: hit.x, z: hit.z, compass: compassOf(d.fx, d.fz) };
  };
  const nearestLand = (x, z) => {
    if (!plan.isWaterAt(x, z) && plan.shoreDistanceAt(x, z) > 1) return { x, z };
    for (let radius = 6; radius < 200; radius += 6) {
      for (let k = 0; k < 16; k += 1) {
        const a = (k / 16) * Math.PI * 2;
        const px = x + Math.cos(a) * radius;
        const pz = z + Math.sin(a) * radius;
        if (!plan.isWaterAt(px, pz) && plan.shoreDistanceAt(px, pz) > 2) return { x: px, z: pz };
      }
    }
    return { x, z };
  };
  const seaward = (x, z) => {
    let best = -Infinity;
    let compass = 0;
    for (let k = 0; k < 16; k += 1) {
      const a = (k / 16) * Math.PI * 2;
      let water = 0;
      for (let s = 20; s <= 120; s += 20) if (plan.isWaterAt(x + Math.sin(a) * s, z - Math.cos(a) * s)) water += 1;
      if (water > best) { best = water; compass = a; }
    }
    return compass;
  };
  const street = (key, t) => {
    const s = plan.stagingStreets.find((each) => each.key === key);
    const e = s.eastEnd;
    const w = s.westEnd;
    return { x: e.x + (w.x - e.x) * t, z: e.z + (w.z - e.z) * t };
  };
  const area = (kind) => plan.specialAreas.find((a) => a.kind === kind);
  const vantage = (id) => plan.vantagePoints.find((v) => v.id === id);
  const districtPoint = (id) => plan.districtById?.[id] ?? plan.districts.find((d) => d.id === id);

  /** Each place: a foot spot and look direction, and a car spot. */
  const PLACES = {
    bulevar_dorado: () => { const p = street('bulevar_dorado', 0.45); const k = kerbView(p.x, p.z, 1); return { ...k, car: laneSpot(p.x, p.z) }; },
    gran_via_marazul: () => { const p = street('gran_via_marazul', 0.58); const k = kerbView(p.x, p.z, 1); return { ...k, car: laneSpot(p.x, p.z) }; },
    signal_junction: () => {
      const p = street('gran_via_marazul', 0.62);
      const node = plan.roads.nodes.filter((n) => n.control === 'signals').sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      const arm = node.arms?.[0];
      const ax = arm ? arm.dx : 1;
      const az = arm ? arm.dz : 0;
      const back = { x: node.x + ax * 28, z: node.z + az * 28 };
      const k = kerbView(back.x, back.z, 1);
      return { foot: k.foot, compass: toward(k.foot, node), car: laneSpot(node.x + ax * 34, node.z + az * 34), node: node.id };
    },
    beach_and_pier: () => {
      const pier = area('pier');
      const line = pointsOf(pier?.line);
      const land = line[0] ?? { x: pier.x, z: pier.z };
      const head = line[line.length - 1] ?? { x: pier.x, z: pier.z + 100 };
      const foot = { x: land.x + (head.x - land.x) * 0.35, z: land.z + (head.z - land.z) * 0.35 };
      return { foot, compass: toward(foot, land), car: laneSpot(land.x, land.z), y: pier?.deckHeight };
    },
    calzada_coral: () => {
      const v = vantage('calzada_coral');
      const k = kerbView(v.x, v.z, 1);
      return { foot: k.foot, compass: toward(k.foot, { x: v.lookX, z: v.lookZ }), car: laneSpot(v.x, v.z) };
    },
    marina: () => { const a = area('marina'); const foot = nearestLand(a.x, a.z); return { foot, compass: seaward(foot.x, foot.z), car: laneSpot(foot.x, foot.z) }; },
    port_quay: () => { const a = area('quay'); const foot = nearestLand(a.x, a.z); return { foot, compass: seaward(foot.x, foot.z), car: laneSpot(foot.x, foot.z) }; },
    barrio_hierro: () => { const d = districtPoint('barrio_hierro'); const k = kerbView(d.x, d.z, 1); return { ...k, car: laneSpot(d.x, d.z) }; },
    las_lomas: () => { const v = vantage('mirador_de_la_loma'); return { foot: { x: v.x, z: v.z }, compass: toward(v, { x: v.lookX, z: v.lookZ }), car: laneSpot(v.x, v.z) }; },
    los_pantanos: () => { const d = districtPoint('los_pantanos'); const k = kerbView(d.x, d.z, 1); return { ...k, car: laneSpot(d.x, d.z) }; },
    isla_coral: () => { const d = districtPoint('isla_coral'); const k = kerbView(d.x, d.z, -1); return { ...k, car: laneSpot(d.x, d.z) }; },
  };

  function grab(id, extra = {}) {
    game.view.renderFrame(0, 1);
    grab2d.drawImage(canvas, 0, 0, grabCanvas.width, grabCanvas.height);
    const player = game.entities.firstWithTag('player');
    const p = player?.position;
    const view = {
      id,
      dataUrl: grabCanvas.toDataURL('image/jpeg', options.jpeg),
      player: p ? { x: r1(p.x), y: r1(p.y), z: r1(p.z), groundY: r1(ground(p.x, p.z)), kind: player.kind } : null,
      camera: { x: r1(game.view.camera.position.x), y: r1(game.view.camera.position.y), z: r1(game.view.camera.position.z) },
      clock: game.clock.label?.(),
      ...extra,
    };
    frames.push(view);
    return view;
  }
  async function frameTimes(count = 45) {
    return new Promise((done) => {
      const times = [];
      let last = performance.now();
      const step = (now) => {
        times.push(now - last);
        last = now;
        if (times.length < count) requestAnimationFrame(step);
        else {
          times.shift();
          times.sort((a, b) => a - b);
          done({ median: r1(times[Math.floor(times.length / 2)]), p95: r1(times[Math.floor(times.length * 0.95)]), max: r1(times[times.length - 1]) });
        }
      };
      requestAnimationFrame(step);
    });
  }
  function costTotals() {
    try {
      const rows = M.sceneCost();
      const total = rows.reduce((t, row) => ({ drawCalls: t.drawCalls + (row.drawCalls ?? 0), triangles: t.triangles + (row.triangles ?? 0) }), { drawCalls: 0, triangles: 0 });
      return { ...total, top: rows.slice(0, 6).map((row) => `${row.name ?? row.group}:${row.drawCalls}/${Math.round((row.triangles ?? 0) / 1000)}k`) };
    } catch (error) { return { error: String(error) }; }
  }
  async function settle(seconds = 1.2) {
    M.advance(seconds);
    await M.render();
  }
  async function stand(spot, compass, y) {
    M.teleport({ x: spot.x, z: spot.z, ...(typeof y === 'number' ? { y } : {}) }, -compass);
    await M.whenIdle(90000);
    M.teleport({ x: spot.x, z: spot.z, ...(typeof y === 'number' ? { y } : {}) }, -compass);
  }
  const info = { part: options.part, places: {}, profile: null, loops: null };

  if (options.part !== 'loops') {
    if (game.state.current !== 'playing') M.enterState('playing');
    M.setWeather('clear');
    for (const name of options.places) {
      try {
        const place = PLACES[name]();
        const record = { foot: { x: r1(place.foot.x), z: r1(place.foot.z) }, compass: r1(place.compass), road: place.roadName ?? null };
        info.places[name] = record;
        M.setTime(options.golden);
        await stand(place.foot, place.compass, place.y);
        await settle(1.5);
        grab(`${name}-foot-golden`);
        record.frameTimes = await frameTimes();
        record.cost = costTotals();
        if (name === 'gran_via_marazul' || name === 'bulevar_dorado') {
          try {
            const profile = M.profile({ frames: 40, drawnFrames: 2 });
            record.profile = { systemsMs: r1(profile.systemsMillisecondsPerFrame), draw: profile.draw ?? profile.drawn ?? null, systems: profile.systems.filter((s) => s.milliseconds > 0.15).map((s) => `${s.name}:${r1(s.milliseconds)}`) };
          } catch (error) { record.profile = { error: String(error) }; }
        }
        M.setTime(options.night);
        await settle(0.3);
        grab(`${name}-foot-night`);
        if (place.car && fleet) {
          const y = ground(place.car.x, place.car.z) + 0.6;
          const id = fleet.spawn({ modelId: 'sports_coupe', position: { x: place.car.x, y, z: place.car.z }, heading: place.car.compass, parked: false, ownerSystem: 'showcase' });
          const entered = M.command('player/enterVehicle', { vehicleId: id });
          record.car = { x: r1(place.car.x), z: r1(place.car.z), id, entered };
          M.setTime(options.golden);
          await settle(1.5);
          grab(`${name}-car-golden`);
          record.carFrameTimes = await frameTimes(30);
          M.setTime(options.night);
          await settle(0.3);
          grab(`${name}-car-night`);
          M.teleport({ x: place.foot.x, z: place.foot.z }, -place.compass);
          M.advance(0.1);
          try { fleet.remove(id); } catch (error) { notes.push(`remove ${id}: ${error}`); }
        }
      } catch (error) {
        notes.push(`${name}: ${error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : error}`);
      }
    }
  } else {
    info.loops = await playLoops();
  }

  info.summary = M.summary();
  info.warnings = M.log('warn').slice(-40).map((entry) => `${entry.level ?? ''} ${entry.source ?? entry.system ?? ''}: ${entry.message ?? JSON.stringify(entry).slice(0, 200)}`);
  info.notes = notes;
  return { info, frames };

  /** The basic loops by scripted input. */
  async function playLoops() {
    const log = [];
    const say = (step, data) => log.push({ step, ...data });
    const player = C('player');
    const wanted = C('wantedLevel');
    const combat = C('combat');
    const missions = C('missions');
    const lead = () => game.entities.firstWithTag('player');
    const where = () => { const p = lead().position; return { x: r1(p.x), y: r1(p.y), z: r1(p.z), g: r1(ground(p.x, p.z)), kind: lead().kind }; };
    if (game.state.current !== 'playing') M.enterState('playing');
    M.setWeather('clear');
    M.setTime(options.golden);
    // Record what moves or downs the lead, with the time and place, to explain surprises.
    const heard = [];
    for (const name of ['player/teleported', 'player/wasted', 'player/busted', 'player/respawned', 'vehicle/destroyed', 'police/wantedLevelChanged']) {
      try {
        game.events.on(name, (payload) => {
          const at = payload?.position ?? lead()?.position ?? {};
          heard.push(`${r1(game.clock.hours ?? 0)}h ${name} ${r1(at.x ?? 0)},${r1(at.z ?? 0)} ${payload?.after ?? payload?.cause ?? payload?.level ?? ''} state=${game.state.current}`);
        });
      } catch (error) { heard.push(`listen ${name}: ${error}`); }
    }
    log.heard = heard;
    const p = street('gran_via_marazul', 0.58);
    const k = kerbView(p.x, p.z, 1);
    await stand(k.foot, k.compass);
    await settle(1);
    grab('loop-01-stand');
    const start = where();
    M.press('moveForward', true);
    M.advance(2.5);
    await M.render();
    grab('loop-02-walk');
    say('walk 2.5 s', { from: start, to: where(), motion: player.motion?.gait ?? player.mode ?? null });
    M.press('sprint', true);
    M.advance(2.5);
    await M.render();
    grab('loop-03-sprint');
    say('sprint 2.5 s', { to: where() });
    M.press('sprint', false);
    M.press('moveForward', false);
    M.advance(1);
    // Enter a car with F: a coupe parked beside the lead.
    const lane = laneSpot(lead().position.x, lead().position.z);
    const here = lead().position;
    const carAt = { x: here.x + (lane.x - here.x) * 0.6, z: here.z + (lane.z - here.z) * 0.6 };
    const carId = fleet.spawn({ modelId: 'sports_coupe', position: { x: carAt.x, y: ground(carAt.x, carAt.z) + 0.6, z: carAt.z }, heading: lane.compass, parked: true, ownerSystem: 'showcase' });
    M.advance(0.5);
    M.press('enterVehicle', true);
    M.advance(0.1);
    M.press('enterVehicle', false);
    // Boarding walks to the door, opens it and sits: allow up to 8 s and note how long it took.
    let boardedAfter = null;
    for (let t = 0.5; t <= 8 && boardedAfter === null; t += 0.5) {
      M.advance(0.5);
      if (player.vehicle) boardedAfter = t;
      else if (t === 2) { await M.render(); grab('loop-04-enter-car'); }
    }
    if (!frames.some((frame) => frame.id === 'loop-04-enter-car')) { await M.render(); grab('loop-04-enter-car'); }
    const spawned = game.entities.get(carId)?.position;
    say('press F near a car', { carId, boardedAfter, playerKind: lead().kind, inVehicle: !!player.vehicle, where: where(), carAt: spawned ? { x: r1(spawned.x), z: r1(spawned.z), metres: r1(Math.hypot(spawned.x - here.x, spawned.z - here.z)) } : null, prompt: game.controls?.promptFor?.('enterVehicle') ?? null });
    if (!player.vehicle) {
      M.command('player/enterVehicle', { vehicleId: carId });
      M.advance(2);
      say('fallback PLAYER_ENTER_VEHICLE', { inVehicle: !!player.vehicle });
    }
    // Drive: accelerate and steer to the right side, into the buildings.
    M.press('accelerate', true);
    M.advance(2.5);
    M.press('steerRight', true);
    M.advance(1.2);
    M.press('steerRight', false);
    M.advance(3.5);
    await M.render();
    grab('loop-05-drive-into-wall');
    const vehicleEntity = game.entities.get(carId);
    say('drive into the wall', { where: where(), speed: r1(vehicleEntity?.data?.speed ?? -1), health: vehicleEntity?.data?.health, stage: vehicleEntity?.data?.stage });
    M.press('accelerate', false);
    M.press('brake', true);
    M.advance(2);
    M.press('brake', false);
    M.press('exitVehicle', true);
    M.advance(0.1);
    M.press('exitVehicle', false);
    M.advance(2.5);
    say('press F to exit', { kind: lead().kind, inVehicle: !!player.vehicle, where: where() });
    // Shoot a car until it burns: by input first (step back nine metres facing the car, hold the
    // right mouse, click the left mouse), then the combat facade from there if input did nothing.
    M.command('player/giveWeapon', { weaponId: 'pistol', ammo: 200 });
    M.advance(0.3);
    const target = game.entities.get(carId);
    const shots = [];
    if (target) {
      const road = laneSpot(target.position.x, target.position.z) ?? { x: target.position.x + 9, z: target.position.z };
      let ax = road.x - target.position.x;
      let az = road.z - target.position.z;
      const len = Math.hypot(ax, az) || 1;
      ax /= len; az /= len;
      const spot = { x: target.position.x + ax * 9, z: target.position.z + az * 9 };
      await stand(spot, toward(spot, target.position));
      M.advance(1);
      M.press('aim', true);
      M.advance(0.6);
      await M.render();
      grab('loop-06a-aim-at-car');
      const before = target.data?.health;
      for (let i = 0; i < 70 && target.alive !== false && (target.data?.health ?? 0) > 0 && (target.data?.stage ?? 0) < 3; i += 1) {
        M.press('attack', true);
        M.advance(0.1);
        M.press('attack', false);
        M.advance(0.2);
        if (i % 10 === 0) shots.push({ byInput: i, health: r1(target.data?.health ?? -1), stage: target.data?.stage, ammo: combat?.inventory?.current?.()?.ammo ?? null });
      }
      say('shoot the car by input (aim + clicks)', { from: where(), car: { x: r1(target.position.x), z: r1(target.position.z) }, before, after: target.data?.health, stage: target.data?.stage, wanted: wanted?.level });
      M.press('aim', false);
    }
    if (combat && target && (target.data?.stage ?? 0) < 2) {
      for (let i = 0; i < 60 && target.alive !== false && (target.data?.health ?? 0) > 0; i += 1) {
        const from = lead().position;
        const muzzle = { x: from.x, y: from.y + 1.4, z: from.z };
        const towards = { x: target.position.x - muzzle.x, y: target.position.y + 0.6 - muzzle.y, z: target.position.z - muzzle.z };
        let result = null;
        try { result = combat.fire(lead(), 'pistol', muzzle, towards, { accuracy: 1 }); } catch (error) { shots.push(String(error)); break; }
        M.advance(0.25);
        if (i % 10 === 0) shots.push({ i, health: r1(target.data?.health ?? -1), stage: target.data?.stage, hits: result?.hits?.length ?? result?.hits });
      }
    }
    M.advance(2);
    await M.render();
    grab('loop-06-car-shot');
    say('shoot the car', { shots, health: target?.data?.health, stage: target?.data?.stage, alive: target?.alive });
    M.advance(6);
    await M.render();
    grab('loop-07-car-burning');
    say('six seconds later', { health: target?.data?.health, stage: target?.data?.stage, alive: target?.alive, effects: C('effects')?.stats?.() });
    // Wanted level: the shooting may already have raised it; make sure of two stars.
    say('wanted after shooting', { level: wanted?.level, heat: wanted?.heat });
    if ((wanted?.level ?? 0) < 2) M.command('wanted/setLevel', { level: 2 });
    const track = [];
    for (let second = 1; second <= 8; second += 1) {
      M.advance(1);
      const at = where();
      track.push(`${second}s ${game.state.current} down=${player.down ?? '-'} lvl=${wanted?.level} at ${at.x},${at.z}`);
    }
    say('wanted 2, second by second', { track });
    await M.render();
    grab('loop-08-wanted');
    say('wanted 2 after 8 s', { level: wanted?.level, searching: wanted?.searching, units: C('policeDispatch')?.units?.length ?? null, officers: C('policeDispatch')?.officers?.length ?? null, state: game.state.current });
    // Lose it: run far away and hide.
    const away = kerbView(street('bulevar_dorado', 0.2).x, street('bulevar_dorado', 0.2).z, 1);
    say('before hiding', { state: game.state.current, down: player.down ?? null, where: where(), target: { x: r1(away.foot.x), z: r1(away.foot.z) } });
    await stand(away.foot, away.compass);
    say('teleported to hide', { where: where(), state: game.state.current });
    let waited = 0;
    const hiding = [];
    while ((wanted?.level ?? 0) > 0 && waited < 120) {
      M.advance(5);
      waited += 5;
      const at = where();
      hiding.push(`${waited}s ${game.state.current} lvl=${wanted?.level} at ${at.x},${at.y},${at.z}`);
    }
    say('hiding, every five seconds', { hiding });
    await M.render();
    grab('loop-09-wanted-lost');
    say('after hiding', { waited, level: wanted?.level, state: game.state.current, health: player.health });
    // A lead busted or down is respawned a few seconds later: wait for that before the mission,
    // or the respawn moves the lead away from the mission's start in the middle of its intro.
    let respawnWait = 0;
    while (game.state.current !== 'playing' && respawnWait < 20) { M.advance(1); respawnWait += 1; }
    say('back in play', { respawnWait, state: game.state.current, where: where() });
    // The first mission.
    let started = null;
    try { started = M.command('mission/start', { missionId: 'm01_hook_and_chain' }); } catch (error) { started = String(error); }
    M.advance(2);
    await M.render();
    grab('loop-10-mission-start');
    say('start m01', { started, active: missions?.activeMissionId, phase: missions?.phase, state: game.state.current });
    M.advance(6);
    await M.render();
    grab('loop-11-mission-later');
    say('m01 eight seconds on', { active: missions?.activeMissionId, phase: missions?.phase, objective: missions?.objectiveIndex, state: game.state.current });
    if (game.state.current === 'cutscene') { M.command('cutscene/skip'); M.advance(2); }
    await M.render();
    grab('loop-12-mission-objective');
    const nearby = game.entities.within(lead().position.x, lead().position.z, 80, { kind: 'vehicle' }, []).map((v) => `${v.data?.modelId}@${r1(v.position.x)},${r1(v.position.z)}${v.tags?.has?.('mission') || (v.tags?.includes?.('mission')) ? ' mission' : ''}`);
    say('after cutscene', { active: missions?.activeMissionId, phase: missions?.phase, objective: missions?.objectiveIndex, state: game.state.current, where: where(), vehiclesWithin80m: nearby.slice(0, 8) });
    say('events heard', { heard });
    return log;
  }
}
/* eslint-enable no-undef */

const USAGE = `node tools/qa-tour.mjs --part streets|districts|loops --out-dir /tmp/marazul/qa/<dir> [--local] [--quality high] [--print-eval]`;

async function runTourCommand() {
  const { values } = parseArgs({
    options: {
      part: { type: 'string', default: 'streets' },
      'out-dir': { type: 'string', default: '/tmp/marazul/qa/tour' },
      quality: { type: 'string', default: 'high' },
      local: { type: 'boolean', default: false },
      'print-eval': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help || !(values.part in QA_TOUR_PARTS)) {
    console.log(USAGE);
    process.exit(values.help ? 0 : 2);
  }
  const snippet = buildTourSnippet({ part: values.part, places: QA_TOUR_PARTS[values.part], golden: 18.83, night: 22.5, jpeg: 0.66 });
  if (values['print-eval']) {
    console.log(snippet);
    return;
  }
  const outDir = resolve(values['out-dir']);
  if (!outDir.startsWith('/tmp/marazul/')) {
    console.log('qa-tour: --out-dir must be under /tmp/marazul/');
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });
  const captureArgs = [
    '--size', '960x540', '--page', `index.html?autostart=1&seed=1&quality=${values.quality}`,
    '--out', join(outDir, `${values.part}-page.jpg`), '--eval', snippet,
    '--eval-timeout-ms', '840000', '--timeout-ms', '300000', '--frames', '2',
  ];
  const run = (command, args) => spawnSync(command, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  let result = values.local ? null : run('/opt/marazul-tools/gpu-capture', ['capture', ...captureArgs]);
  if (!result || result.status === 75 || result.error) {
    if (result) console.log('qa-tour: no GPU machine; using the local browser');
    result = run(process.execPath, ['tools/capture.mjs', ...captureArgs]);
  }
  const lines = String(result.stdout || '').trim().split('\n');
  const last = lines.reverse().find((line) => line.startsWith('{'));
  if (!last) {
    console.log(`qa-tour: no summary (exit ${result.status})\n${String(result.stdout).slice(-2000)}\n${String(result.stderr).slice(-2000)}`);
    process.exit(1);
  }
  const summary = JSON.parse(last);
  const { info, frames } = summary.eval ?? { info: null, frames: [] };
  const files = [];
  for (const frame of frames ?? []) {
    const file = join(outDir, `${frame.id}.jpg`);
    writeFileSync(file, Buffer.from(frame.dataUrl.split(',')[1], 'base64'));
    delete frame.dataUrl;
    files.push(file);
  }
  const report = { ok: summary.ok, errors: summary.errors, warnings: summary.warnings, timings: summary.timings, info, frames };
  writeFileSync(join(outDir, `${values.part}-report.json`), `${JSON.stringify(report, null, 1)}\n`);
  if (files.length && existsSync('/usr/bin/montage')) {
    run('/usr/bin/montage', ['-label', '%t', '-pointsize', '14', ...files, '-tile', '4x', '-geometry', '480x270+2+2', join(outDir, `${values.part}-sheet.jpg`)]);
  }
  console.log(`qa-tour: ${files.length} views, ok=${summary.ok}, errors=${summary.errors.length}, report ${join(outDir, `${values.part}-report.json`)}`);
  for (const error of summary.errors) console.log(`qa-tour: ERROR ${error}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runTourCommand();
}
