// The rocket's impact for the rocket picture (rocket-strike-hierro): the instant the warhead
// bursts on the cruiser, layered over the game's own vehicle_explosion. A white-yellow heart, a
// ball of orange billows round it (drawn after the effect particles, so the soot cap does not
// darken the fire at a glance), a warm halo, burning fragments flung out in streaks, a ring of
// street dust racing out low along the asphalt and one strong orange light that lights the
// street, the cars and the walls round the blast. Everything is placed from a fixed hash, so the
// picture is the same on every run. The cruiser itself is kicked into the air by `kickWreck`.
import * as THREE from 'three';

/** Metres: the fireball's radius and its centre's height over the ground. */
const BALL_RADIUS = 2.6;
const BALL_HEIGHT = 1.9;
/** Metres the ball's centre stands behind the blast, away from the camera. */
const BEHIND = 1.6;
/** The light of the blast: candela, reach in metres, its height over the ground. */
const LIGHT = Object.freeze({ intensity: 1300, range: 30, height: 2.2, color: 0xff9a3c });
/** Billows in the ball, the hot heart's sprites, flung fragments, dust puffs in the ring. */
const BILLOWS = 16;
const HEART = 4;
const FRAGMENTS = 10;
const DUST = 22;
/** Metres from the blast the dust ring has reached by the picture. */
const DUST_RING = [5.2, 7.4];

/**
 * Adds the burst at a point.
 * @param {object} game The game context.
 * @param {{x: number, y: number, z: number}} at The blast (y: the ground under it).
 * @param {{x: number, z: number}} toward Unit direction along the ground from the blast toward the camera.
 * @param {{x: number, z: number}[]} [keepClear] Points the dust must not veil (the intact cruiser).
 * @returns {() => void} Removes it again.
 */
export function addRocketImpactBurst(game, at, toward, keepClear = []) {
  const parent = game.view?.layers?.effects ?? game.view?.scene;
  if (!parent) return () => {};
  const hash = seededHash(1031);
  const group = new THREE.Group();
  group.name = 'rocketImpactBurst';
  const billow = billowTexture(hash);
  const glow = glowTexture();
  const made = [billow, glow];
  const sprite = (map, color, blending, opacity, size, x, y, z, rotation = 0) => {
    const material = new THREE.SpriteMaterial({ map, color: new THREE.Color(color[0], color[1], color[2]), blending, transparent: true, opacity, depthWrite: false, fog: false, rotation });
    made.push(material);
    const s = new THREE.Sprite(material);
    s.scale.set(Array.isArray(size) ? size[0] : size, Array.isArray(size) ? size[1] : size, 1);
    s.position.set(x, y, z);
    s.renderOrder = 20;
    group.add(s);
    return s;
  };
  // the ball stands just behind the cruiser (seen from the camera), so the car thrown up in front
  // of it shows dark against the fire instead of vanishing in it
  const cx = at.x - toward.x * BEHIND;
  const cy = at.y + BALL_HEIGHT;
  const cz = at.z - toward.z * BEHIND;
  /** Folds an offset's camera-side part back, so nothing of the ball hangs in front of the car. */
  const fold = (ox, oz) => {
    const d = ox * toward.x + oz * toward.z;
    return d > 0 ? [ox - toward.x * d * 1.3, oz - toward.z * d * 1.3] : [ox, oz];
  };
  // the warm halo round the whole ball, low and wide
  sprite(glow, [1.6, 0.62, 0.14], THREE.AdditiveBlending, 1, 8.5, cx, cy - 0.2, cz);
  // orange billows: a squashed ball, hottest near the middle, deeper orange at its rim
  for (let i = 0; i < BILLOWS; i += 1) {
    const u = hash() * Math.PI * 2;
    const v = hash() * 2 - 1;
    const r = BALL_RADIUS * Math.cbrt(0.15 + 0.85 * hash());
    const ring = Math.sqrt(1 - v * v);
    const [ox, oz] = fold(Math.cos(u) * ring * r, Math.sin(u) * ring * r);
    const x = cx + ox;
    const y = cy + v * r * 0.8 + 0.4;
    const z = cz + oz;
    const hot = 1 - r / BALL_RADIUS;
    const color = [5.5 + 5 * hot, 1.5 + 3.4 * hot, 0.22 + 0.9 * hot];
    sprite(billow, color, THREE.NormalBlending, 0.96, 2.4 + 1.8 * hash(), x, y, z, hash() * Math.PI * 2);
  }
  // the white-yellow heart, added over the billows
  for (let i = 0; i < HEART; i += 1) {
    const x = cx + (hash() - 0.5) * 1.2;
    const y = cy + (hash() - 0.3) * 0.9;
    const z = cz + (hash() - 0.5) * 1.2;
    sprite(billow, [9, 6.2, 2.4], THREE.AdditiveBlending, 1, 2.2 + 1.2 * hash(), x, y, z, hash() * Math.PI * 2);
  }
  // burning fragments flung out and up, each a short streak along its flight
  for (let i = 0; i < FRAGMENTS; i += 1) {
    const a = (i / FRAGMENTS) * Math.PI * 2 + hash() * 0.5;
    const up = 0.15 + hash() * 0.55;
    const reach = BALL_RADIUS + 1.0 + hash() * 2.6;
    const x = cx + Math.cos(a) * reach;
    const y = cy + up * reach * 0.8;
    const z = cz + Math.sin(a) * reach;
    const s = sprite(glow, [12, 5, 1.1], THREE.AdditiveBlending, 1, [0.2, 0.7 + 0.6 * hash()], x, y, z);
    s.material.rotation = Math.atan2(-(Math.cos(a) * toward.z - Math.sin(a) * toward.x), up + 0.3);
  }
  // the shock of street dust racing out low along the asphalt, lit warm on its inner side
  for (let i = 0; i < DUST; i += 1) {
    const a = (i / DUST) * Math.PI * 2 + hash() * 0.25;
    const reach = DUST_RING[0] + hash() * (DUST_RING[1] - DUST_RING[0]);
    const x = at.x + Math.cos(a) * reach;
    const z = at.z + Math.sin(a) * reach;
    const near = Math.max(0, Math.cos(a) * toward.x + Math.sin(a) * toward.z);
    const size = 2.2 + hash() * 1.4;
    if (keepClear.some((p) => Math.hypot(p.x - x, p.z - z) < 4.5)) continue;
    sprite(billow, [0.62, 0.52, 0.4], THREE.NormalBlending, 0.6 - 0.35 * near, [size * 1.6, size * 0.6], x, at.y + size * 0.2, z, (hash() - 0.5) * 0.3);
  }
  parent.add(group);
  const light = game.atmosphere?.addLight?.({
    kind: 'point', position: [cx, at.y + LIGHT.height, cz], color: LIGHT.color, intensity: LIGHT.intensity, range: LIGHT.range,
    importance: 6, nightOnly: false, groundY: at.y, pool: true, glow: 0,
  }) ?? null;
  return () => {
    group.removeFromParent();
    for (const thing of made) thing.dispose();
    if (light) game.atmosphere?.removeLight?.(light);
  };
}

/**
 * Throws the hit cruiser up and over: the warhead bursts under its flank, so it leaves the ground
 * rolling about the rocket's line. Call it the moment it is wrecked.
 * @param {object} record The vehicle record (record.car.body is its rigid body).
 * @param {{x: number, z: number}} along Unit direction of the rocket's flight.
 */
export function kickWreck(record, along) {
  const body = record?.car?.body;
  if (!body?.linearVelocity || !body.angularVelocity) return;
  body.wake?.();
  body.linearVelocity.x += along.x * 2.2;
  body.linearVelocity.z += along.z * 2.2;
  body.linearVelocity.y += 8.5;
  body.angularVelocity.x += along.x * 4.2;
  body.angularVelocity.z += along.z * 4.2;
}

/** A small seeded generator (mulberry32) for the burst's layout. */
function seededHash(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A lumpy round puff: soft edge torn by value noise, brighter in its middle. */
function billowTexture(hash) {
  const size = 64;
  const grid = 8;
  const lattice = Array.from({ length: (grid + 1) * (grid + 1) }, () => hash());
  const noise = (x, y) => {
    const gx = x * grid;
    const gy = y * grid;
    const ix = Math.min(grid - 1, Math.floor(gx));
    const iy = Math.min(grid - 1, Math.floor(gy));
    const fx = gx - ix;
    const fy = gy - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const at = (i, j) => lattice[j * (grid + 1) + i];
    const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
    const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
    return top + (bottom - top) * sy;
  };
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const d = Math.hypot(u - 0.5, v - 0.5) * 2;
      const n = noise(u, v) * 0.65 + noise((u * 2) % 1, (v * 2) % 1) * 0.35;
      const edge = 1 - smooth(0.55, 1.0, d + (n - 0.5) * 0.5);
      const shade = 0.7 + 0.3 * (1 - d) + (n - 0.5) * 0.35;
      const i = (y * size + x) * 4;
      const c = Math.round(255 * Math.max(0, Math.min(1, shade)));
      data[i] = c; data[i + 1] = c; data[i + 2] = c;
      data[i + 3] = Math.round(255 * Math.max(0, Math.min(1, edge)));
    }
  }
  return finish(new THREE.DataTexture(data, size, size, THREE.RGBAFormat));
}

/** A smooth round glow, bright in the middle and gone at the edge. */
function glowTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
      const g = Math.max(0, 1 - d);
      const i = (y * size + x) * 4;
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
      data[i + 3] = Math.round(255 * g * g);
    }
  }
  return finish(new THREE.DataTexture(data, size, size, THREE.RGBAFormat));
}

function finish(texture) {
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
