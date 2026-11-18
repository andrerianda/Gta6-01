// What the lead throws and launches, flying for real: grenades and fire bottles leave the hand
// above the aim line (the stance's throwLift) and fall on a ballistic arc, traced against the city,
// cars and people segment by segment; a grenade bounces and rolls until its fuse ends, a bottle
// breaks where it first lands; a rocket leaves the launcher's muzzle, eases onto the camera's aim
// line and flies level along it with a smoke trail (effects' 'rocket_trail') and bursts on the first thing it meets (or its fuse). Each burst is weaponFiring's
// detonate(). While a thrown weapon is aimed a dotted arc and a ring show where it will land
// (the same simulation as the flight). A launch blows a back-blast out of the launcher's exhaust:
// flash, smoke and dust behind the shooter and a short camera shake. Pooled: the preview's
// buffers, the flights and their models are made once and reused.
import * as THREE from 'three';
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { createShotResult } from './hitDetection.js';
import { createWeaponModel } from './weaponModels.js';

/** Seconds per step of the preview's simulation and the most steps it shows. */
const PREVIEW_STEP = 0.06;
const PREVIEW_POINTS = 56;
/** A grenade's bounce: speed kept along the normal and along the ground. */
const RESTITUTION = 0.38;
const FRICTION = 0.72;
/** Flights in the air at once (the oldest lands early when more are thrown). */
const MAX_FLIGHTS = 6;
/**
 * Seconds between puffs of a rocket's smoke trail (effects' 'rocket_trail'): every second 60 Hz
 * step, ~1.8 m apart at 55 m/s. Effects joins puffs closer than 2.6 m into one rope (its
 * ROCKET_PUFF_GAP); 0.035 s fell to every third step, 2.75 m apart, and each puff restarted the
 * trail's motor-only first 3.5 m, so no smoke ever showed.
 */
const TRAIL_EVERY = 0.03;
/**
 * A rocket leaves the muzzle and slides onto the camera's aim line within this many metres
 * (shorter for a near aim point), then flies along it, level with the view, to the aim point.
 */
const ROCKET_CONVERGE = 7;

/**
 * The aim line of a rocket launched from `from`: the camera's centre ray `direction` (unit)
 * through `point`, the muzzle's offset from it, and how soon it closes (shorter for a near aim
 * point `target`).
 * @param {{x: number, y: number, z: number}} from The muzzle.
 * @param {{x: number, y: number, z: number}} point A point on the camera's ray (the camera).
 * @param {{x: number, y: number, z: number}} direction The ray's unit direction.
 * @param {{x: number, y: number, z: number} | null} [target] The aim point on the ray.
 */
export function rocketAimLine(from, point, direction, target = null) {
  const dx = direction.x, dy = direction.y, dz = direction.z;
  const t0 = (from.x - point.x) * dx + (from.y - point.y) * dy + (from.z - point.z) * dz;
  const px = point.x + dx * t0, py = point.y + dy * t0, pz = point.z + dz * t0;
  const reach = target ? (target.x - px) * dx + (target.y - py) * dy + (target.z - pz) * dz : Infinity;
  const converge = Math.max(1.5, Math.min(ROCKET_CONVERGE, reach * 0.6));
  return { px, py, pz, dx, dy, dz, ox: from.x - px, oy: from.y - py, oz: from.z - pz, converge };
}

/**
 * Where a rocket is after `s` metres along its aim line: the muzzle's offset eases out
 * (smoothly, no kink) over the line's `converge` metres, then it rides the line itself.
 * @param {{x: number, y: number, z: number}} out
 * @param {ReturnType<typeof rocketAimLine>} line
 * @param {number} s Metres flown along the line.
 */
export function rocketPathPoint(out, line, s) {
  const u = Math.min(1, Math.max(0, s / line.converge));
  const keep = 1 - u * u * (3 - 2 * u);
  out.x = line.px + line.dx * s + line.ox * keep;
  out.y = line.py + line.dy * s + line.oy * keep;
  out.z = line.pz + line.dz * s + line.oz * keep;
  return out;
}

/**
 * The launch velocity of a throw: the aim direction turned `lift` radians further up (capped
 * short of straight up), at `speed`.
 * @param {{x: number, y: number, z: number}} out
 * @param {number} dx Aim direction (any length).
 * @param {number} dy
 * @param {number} dz
 * @param {number} speed m/s
 * @param {number} lift radians
 */
export function throwVelocity(out, dx, dy, dz, speed, lift) {
  const flat = Math.hypot(dx, dz) || 1e-6;
  const pitch = Math.min(1.15, Math.max(-0.5, Math.atan2(dy, flat) + lift));
  const c = Math.cos(pitch) * speed / flat;
  out.x = dx * c; out.y = Math.sin(pitch) * speed; out.z = dz * c;
  return out;
}

/**
 * One step of free flight (semi-implicit Euler): the velocity takes gravity, then moves the body.
 * @param {{x: number, y: number, z: number, vx: number, vy: number, vz: number}} body
 * @param {number} dt
 * @param {number} gravity m/s^2 (down)
 */
export function stepFlight(body, dt, gravity) {
  body.vy -= gravity * dt;
  body.x += body.vx * dt; body.y += body.vy * dt; body.z += body.vz * dt;
  return body;
}

/**
 * Bounces a body off a surface with unit normal n: the speed into it reversed and scaled by the
 * restitution, the speed along it scaled by the friction.
 */
export function bounceOff(body, nx, ny, nz, restitution = RESTITUTION, friction = FRICTION) {
  const into = body.vx * nx + body.vy * ny + body.vz * nz;
  if (into >= 0) return body;
  const tx = body.vx - into * nx, ty = body.vy - into * ny, tz = body.vz - into * nz;
  body.vx = tx * friction - into * restitution * nx;
  body.vy = ty * friction - into * restitution * ny;
  body.vz = tz * friction - into * restitution * nz;
  return body;
}

/**
 * Creates the lead's projectiles.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {{firing: object, catalog: Record<string, object>}} parts
 */
export function createThrownProjectiles(context, { firing }) {
  const layer = () => context.view.layers?.dynamic ?? context.view.scene;
  const shot = createShotResult();
  const probe = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  const velocity = { x: 0, y: 0, z: 0 };
  const skip = { shooterId: null, ignore: null };
  const flights = [];
  const spares = new Map();
  const direction = new THREE.Vector3();
  const minusZ = new THREE.Vector3(0, 0, -1);
  const bead = new THREE.Matrix4();
  let preview = null;

  const effect = (effectId, x, y, z, dx, dy, dz, scale) => {
    if (context.commands.has(GAME_COMMANDS.EFFECT_SPAWN)) {
      context.commands.send(GAME_COMMANDS.EFFECT_SPAWN, { effectId, position: { x, y, z }, direction: { x: dx, y: dy, z: dz }, scale });
    }
  };

  function makePreview() {
    // Small bright beads (instanced spheres: they read in every pipeline, unlike GL points).
    const positions = new Float32Array(PREVIEW_POINTS * 3);
    const geometry = new THREE.SphereGeometry(0.05, 8, 6);
    const dots = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({
      color: 0xfff0d8, transparent: true, opacity: 0.92, depthWrite: false, toneMapped: false,
    }), PREVIEW_POINTS);
    dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    dots.name = 'combat-throw-arc';
    dots.frustumCulled = false;
    dots.renderOrder = 5;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 40), new THREE.MeshBasicMaterial({
      color: 0xffa860, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide,
    }));
    ring.name = 'combat-throw-landing';
    ring.renderOrder = 5;
    return { dots, ring, positions, geometry };
  }

  /**
   * Traces a body's path for `seconds` (or to its first hit) through the world. Calls `visit`
   * per step with the body; returns true when it hit something (shot holds the hit).
   */
  function trace(body, gravity, seconds, step, visit) {
    for (let t = 0; t < seconds; t += step) {
      const sx = body.x, sy = body.y, sz = body.z;
      stepFlight(body, step, gravity);
      const mx = body.x - sx, my = body.y - sy, mz = body.z - sz;
      const length = Math.hypot(mx, my, mz);
      if (length > 1e-5) {
        firing.detector.cast(shot, sx, sy, sz, mx / length, my / length, mz / length, length, skip);
        if (shot.hit) { body.x = shot.x; body.y = shot.y; body.z = shot.z; return true; }
      }
      if (visit && visit(body) === false) return false;
    }
    return false;
  }

  /**
   * A rocket's step along its aim line (rocketPathPoint): traced against the world and people
   * from where it was; returns true when it hit something (the flight then stands at the hit).
   */
  function flyAlongLine(flight, speed, step) {
    const sx = flight.x, sy = flight.y, sz = flight.z;
    flight.s += speed * step;
    rocketPathPoint(probe, flight.line, flight.s);
    const mx = probe.x - sx, my = probe.y - sy, mz = probe.z - sz;
    const length = Math.hypot(mx, my, mz);
    if (length > 1e-5) {
      firing.detector.cast(shot, sx, sy, sz, mx / length, my / length, mz / length, length, skip);
      if (shot.hit) { flight.x = shot.x; flight.y = shot.y; flight.z = shot.z; return true; }
      flight.vx = mx / step; flight.vy = my / step; flight.vz = mz / step;
    }
    flight.x = probe.x; flight.y = probe.y; flight.z = probe.z;
    return false;
  }

  function modelFor(weapon) {
    const list = spares.get(weapon.id);
    if (list && list.length) return list.pop();
    const made = createWeaponModel(context.assets ?? null, weapon);
    let object = made.object;
    if (weapon.projectile.kind === 'rocket') {
      // The loaded rocket of a launcher model (origin at its base on the tube's axis), alone.
      object = made.magazine ?? made.object;
      object.removeFromParent();
      object.position.set(0, 0, 0);
      object.visible = true;
    }
    object.name = `combat-flight-${weapon.id}`;
    return object;
  }

  function release(flight) {
    flight.object.removeFromParent();
    if (!spares.has(flight.weapon.id)) spares.set(flight.weapon.id, []);
    spares.get(flight.weapon.id).push(flight.object);
  }

  function burst(flight, index) {
    flights.splice(index, 1);
    release(flight);
    firing.detonate(flight.shooter, flight.weapon, { x: flight.x, y: flight.y + 0.15, z: flight.z });
  }

  return {
    /**
     * Shows the arc of a throw from `from` along `aim` (unit), or hides it (weapon null).
     * @param {object | null} weapon A thrown WEAPON_CATALOG entry.
     */
    preview(weapon, from, aim, shooterId) {
      if (!weapon || !weapon.projectile) {
        if (preview && preview.dots.parent) { preview.dots.removeFromParent(); preview.ring.removeFromParent(); }
        return;
      }
      preview ??= makePreview();
      if (!preview.dots.parent) { layer().add(preview.dots); layer().add(preview.ring); }
      const p = weapon.projectile;
      throwVelocity(velocity, aim.x, aim.y, aim.z, p.speed, weapon.stance?.throwLift ?? 0.3);
      probe.x = from.x; probe.y = from.y; probe.z = from.z;
      probe.vx = velocity.x; probe.vy = velocity.y; probe.vz = velocity.z;
      skip.shooterId = shooterId;
      let count = 0;
      const positions = preview.positions;
      const hit = trace(probe, p.gravity, PREVIEW_STEP * PREVIEW_POINTS, PREVIEW_STEP, (body) => {
        positions[count * 3] = body.x; positions[count * 3 + 1] = body.y; positions[count * 3 + 2] = body.z;
        count += 1;
        return count < PREVIEW_POINTS - 1;
      });
      positions[count * 3] = probe.x; positions[count * 3 + 1] = probe.y; positions[count * 3 + 2] = probe.z;
      count += 1;
      // Every other bead (a dotted line), growing a little with distance so the far end reads.
      let shown = 0;
      for (let i = 1; i < count; i += 2) {
        const grow = 1 + i * 0.045;
        bead.makeScale(grow, grow, grow).setPosition(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        preview.dots.setMatrixAt(shown, bead);
        shown += 1;
      }
      preview.dots.count = shown;
      preview.dots.instanceMatrix.needsUpdate = true;
      preview.ring.visible = hit;
      if (hit) {
        preview.ring.position.set(probe.x + shot.nx * 0.03, probe.y + shot.ny * 0.03, probe.z + shot.nz * 0.03);
        direction.set(shot.nx, shot.ny, shot.nz);
        preview.ring.quaternion.setFromUnitVectors(minusZ, direction.negate());
      }
    },

    /**
     * Throws or launches one: a thrown weapon from `from` above the aim line, a rocket from the
     * muzzle along it with a back-blast out of `exhaust` (a world point, or null).
     */
    launch(shooter, weapon, from, aim, exhaust, sight = null) {
      const p = weapon.projectile;
      if (!p) return;
      if (flights.length >= MAX_FLIGHTS) burst(flights[0], 0);
      const rocket = p.kind === 'rocket';
      // A rocket with the camera's sight ({point, direction, target}) flies along the view's aim
      // line (rocketAimLine), else straight along `aim`.
      const line = rocket && sight && sight.point && sight.direction ? rocketAimLine(from, sight.point, sight.direction, sight.target ?? null) : null;
      const along = line ? { x: line.dx, y: line.dy, z: line.dz } : aim;
      if (rocket) { velocity.x = along.x * p.speed; velocity.y = along.y * p.speed; velocity.z = along.z * p.speed; }
      else throwVelocity(velocity, aim.x, aim.y, aim.z, p.speed, weapon.stance?.throwLift ?? 0.3);
      const object = modelFor(weapon);
      object.position.set(from.x, from.y, from.z);
      if (rocket) { direction.set(along.x, along.y, along.z).normalize(); object.quaternion.setFromUnitVectors(minusZ, direction); }
      layer().add(object);
      flights.push({
        weapon, shooter, object, rocket, x: from.x, y: from.y, z: from.z, vx: velocity.x, vy: velocity.y, vz: velocity.z,
        age: 0, fuse: p.fuseSeconds > 0 ? p.fuseSeconds : Infinity, trail: 0, spin: 6 + Math.random() * 6, line, s: 0,
      });
      if (rocket) {
        effect('muzzle_flash', from.x, from.y, from.z, aim.x, aim.y, aim.z, 0.9);
        const back = exhaust ?? { x: from.x - aim.x * 1.1, y: from.y - aim.y * 1.1, z: from.z - aim.z * 1.1 };
        const length = weapon.stance?.backblast?.length ?? 5;
        // The back-blast out of the exhaust (effects' rocket_backblast: flash, smoke cone, dust),
        // plus dust kicked off the ground behind the shooter.
        effect('rocket_backblast', back.x, back.y, back.z, -aim.x, -aim.y, -aim.z, length / 5);
        effect('dirt_dust', back.x - aim.x * length * 0.5, (shooter?.position?.y ?? back.y - 1.4) + 0.05, back.z - aim.z * length * 0.5, -aim.x, 0.4, -aim.z, 1.6);
        if (context.commands.has(GAME_COMMANDS.CAMERA_SHAKE)) context.commands.send(GAME_COMMANDS.CAMERA_SHAKE, { strength: 0.45, seconds: 0.35 });
      }
    },

    /** Moves every flight one fixed step; bursts the ones that land or run out of fuse. */
    fixedUpdate(step) {
      for (let i = flights.length - 1; i >= 0; i -= 1) {
        const flight = flights[i];
        const p = flight.weapon.projectile;
        flight.age += step;
        skip.shooterId = flight.shooter ? flight.shooter.id : null;
        const hit = flight.line ? flyAlongLine(flight, p.speed, step) : trace(flight, p.gravity, step * 0.999, step, null);
        if (hit && (flight.rocket || !p.bounces)) { burst(flight, i); continue; }
        if (hit) {
          // The clink of each bounce, louder the faster it lands (audio's 'grenade_bounce');
          // a grenade that is only rolling stays quiet.
          const impact = Math.hypot(flight.vx, flight.vy, flight.vz);
          if (impact > 1.2 && context.commands.has(GAME_COMMANDS.AUDIO_PLAY)) {
            context.commands.send(GAME_COMMANDS.AUDIO_PLAY, { soundId: 'grenade_bounce', position: { x: flight.x, y: flight.y, z: flight.z }, volume: Math.min(1, impact / 10) });
          }
          bounceOff(flight, shot.nx, shot.ny, shot.nz);
          flight.x += shot.nx * 0.04; flight.y += shot.ny * 0.04; flight.z += shot.nz * 0.04;
          if (Math.hypot(flight.vx, flight.vy, flight.vz) < 0.6) { flight.vx = flight.vy = flight.vz = 0; }
        }
        if (flight.age >= flight.fuse || flight.y < -50) { burst(flight, i); continue; }
        flight.object.position.set(flight.x, flight.y, flight.z);
        const speed = Math.hypot(flight.vx, flight.vy, flight.vz);
        if (flight.rocket && speed > 0.1) {
          direction.set(flight.vx / speed, flight.vy / speed, flight.vz / speed);
          flight.object.quaternion.setFromUnitVectors(minusZ, direction);
          flight.trail -= step;
          if (flight.trail <= 0) {
            flight.trail = TRAIL_EVERY;
            effect('rocket_trail', flight.x - direction.x * 0.6, flight.y - direction.y * 0.6, flight.z - direction.z * 0.6, -direction.x, -direction.y, -direction.z, 0.55);
          }
        } else if (speed > 0.1) {
          flight.object.rotation.x -= flight.spin * step;
          flight.object.rotation.z += flight.spin * 0.4 * step;
        }
      }
    },

    /** Flights in the air now (tests, the debug object). */
    get flying() { return flights.length; },

    dispose() {
      for (const flight of flights) flight.object.removeFromParent();
      flights.length = 0;
      if (preview) { preview.dots.removeFromParent(); preview.ring.removeFromParent(); preview.geometry.dispose(); }
    },
  };
}
