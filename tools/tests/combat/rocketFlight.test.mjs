// The shoulder launcher's rocket (thrownProjectiles.js): it leaves the muzzle, eases onto the
// camera's aim line within a few metres and flies level along it to the aim point at the
// catalog's speed, sending its trail to effects by name ('rocket_trail'); it never dives from
// below the aim line into the road.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { WEAPON_CATALOG } = await import('../../../game/src/catalog/weaponCatalog.js');
const { GAME_COMMANDS } = await import('../../../game/src/core/events/gameCommands.js');
const { createThrownProjectiles, rocketAimLine, rocketPathPoint } = await import('../../../game/src/combat/thrownProjectiles.js');

const LAUNCHER = WEAPON_CATALOG.rocket_launcher;

test('the rocket path starts at the muzzle and joins the aim line smoothly', () => {
  // Camera 1.8 m up, looking level down -z; muzzle 0.4 m left of and 0.3 m below the ray.
  const camera = { x: 0, y: 1.8, z: 0 };
  const ray = { x: 0, y: 0, z: -1 };
  const muzzle = { x: -0.4, y: 1.5, z: -1.2 };
  const line = rocketAimLine(muzzle, camera, ray, { x: 0, y: 1.8, z: -30 });
  const at = { x: 0, y: 0, z: 0 };
  rocketPathPoint(at, line, 0);
  assert.ok(Math.hypot(at.x - muzzle.x, at.y - muzzle.y, at.z - muzzle.z) < 1e-9, 'leaves the muzzle');
  let lastOff = Infinity;
  for (let s = 0; s <= 30; s += 0.5) {
    rocketPathPoint(at, line, s);
    const off = Math.hypot(at.x, at.y - 1.8);
    assert.ok(off <= lastOff + 1e-9, `closes on the line monotonically (${off} at ${s} m)`);
    assert.ok(at.y >= 1.5 - 1e-9, 'never below the muzzle on a level aim');
    lastOff = off;
  }
  rocketPathPoint(at, line, line.converge);
  assert.ok(Math.hypot(at.x, at.y - 1.8) < 1e-9 && line.converge <= 7, 'on the aim line within 7 m');
  // A near aim point closes sooner.
  assert.ok(rocketAimLine(muzzle, camera, ray, { x: 0, y: 1.8, z: -5 }).converge < 4);
});

function flatStreet() {
  // Ground at y = 0 and the target car: a box 20-23 m ahead.
  const sent = [];
  const detector = {
    cast(out, ox, oy, oz, dx, dy, dz, max) {
      out.hit = false;
      let best = Infinity;
      if (dy < 0) { const t = -oy / dy; if (t >= 0 && t <= max) { best = t; out.nx = 0; out.ny = 1; out.nz = 0; out.kind = 'world'; } }
      if (dz < 0) {
        const t = (-20 - oz) / dz; const y = oy + dy * t, x = ox + dx * t;
        if (t >= 0 && t <= max && t < best && y < 1.9 && Math.abs(x) < 2) { best = t; out.nx = 0; out.ny = 0; out.nz = 1; out.kind = 'vehicle'; }
      }
      if (best <= max) { out.hit = true; out.distance = best; out.x = ox + dx * best; out.y = oy + dy * best; out.z = oz + dz * best; }
      return out;
    },
  };
  const bursts = [];
  const firing = { detector, detonate: (shooter, weapon, at) => bursts.push(at) };
  const context = {
    view: { scene: new THREE.Scene(), layers: null },
    assets: null,
    commands: {
      has: (name) => name === GAME_COMMANDS.EFFECT_SPAWN,
      send: (name, payload) => sent.push(payload),
    },
  };
  return { projectiles: createThrownProjectiles(context, { firing }), sent, bursts };
}

test('a launched rocket flies level along the aim line to the target with its rocket_trail', () => {
  const { projectiles, sent, bursts } = flatStreet();
  // The lead's stance: camera behind-right at 1.62 m looking 1.5 degrees down at the car's door.
  const camera = { x: 0.6, y: 1.62, z: 3 };
  const target = { x: 0, y: 1.0, z: -20 };
  const ray = { x: target.x - camera.x, y: target.y - camera.y, z: target.z - camera.z };
  const n = Math.hypot(ray.x, ray.y, ray.z); ray.x /= n; ray.y /= n; ray.z /= n;
  // Muzzle on the shoulder, below and left of the ray, aimed (the old way) a little downwards.
  const muzzle = { x: -0.25, y: 1.45, z: 0.4 };
  const aim = { x: 0, y: -0.2, z: -1 };
  projectiles.launch({ id: 1, position: { x: 0, y: 0, z: 1 } }, LAUNCHER, muzzle, aim, null, { point: camera, direction: ray, target });
  assert.equal(projectiles.flying, 1);
  const step = 1 / 60;
  let t = 0, at04 = null;
  while (projectiles.flying > 0 && t < 2) {
    projectiles.fixedUpdate(step);
    t += step;
    if (!at04 && t >= 0.28) at04 = sent.filter((p) => p.effectId === 'rocket_trail').at(-1)?.position;
  }
  assert.equal(bursts.length, 1, 'burst once');
  const hit = bursts[0];
  assert.ok(Math.abs(hit.z + 20) < 0.2 && Math.abs(hit.x - target.x) < 0.3 && Math.abs(hit.y - 0.15 - target.y) < 0.3, `burst at the car's aim point (${JSON.stringify(hit)})`);
  assert.ok(t > 0.3 && t < 0.5, `about 21 m at ${LAUNCHER.projectile.speed} m/s (${t.toFixed(2)} s)`);
  const trail = sent.filter((p) => p.effectId === 'rocket_trail');
  assert.ok(trail.length >= 8, 'a trail all the way');
  assert.ok(!sent.some((p) => p.effectId === 'engine_smoke'), 'the trail by its own name');
  for (const puff of trail) assert.ok(puff.position.y > 0.9, `trail above the street (${puff.position.y})`);
  assert.ok(at04 && at04.z < -10 && at04.z > -19.5, `mid-street 0.28 s after launch (${at04 && at04.z})`);
  // Effects joins puffs closer than 2.6 m into one rope (effectsDirector ROCKET_PUFF_GAP).
  for (let i = 1; i < trail.length; i += 1) {
    const a = trail[i - 1].position, b = trail[i].position;
    const gap = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    assert.ok(gap < 2.2, `puffs ${gap.toFixed(2)} m apart`);
  }
  const last = trail.at(-1);
  assert.ok(last.direction.z > 0.99, 'trail points back along the flight');
});

test('without the camera sight a rocket still flies straight along its aim', () => {
  const { projectiles, bursts } = flatStreet();
  projectiles.launch({ id: 1 }, LAUNCHER, { x: 0, y: 1.4, z: 0 }, { x: 0, y: 0, z: -1 }, null);
  for (let i = 0; i < 60 && projectiles.flying; i += 1) projectiles.fixedUpdate(1 / 60);
  assert.equal(bursts.length, 1);
  assert.ok(Math.abs(bursts[0].z + 20) < 0.1 && Math.abs(bursts[0].y - 1.55) < 0.01);
});
