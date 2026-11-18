// Driving effects: what the tyres of every physics car leave behind, read each frame from the
// vehicle's wheels (car.wheelContact, wheelSlip, wheelSurface, wheelHubPosition; see
// docs/PHYSICS.md). On asphalt, concrete, wood and metal a sliding or spinning tyre smokes and
// draws a black skid mark; on sand, grass and dirt a rolling tyre throws dust (more with speed
// and slip); in water it throws spray. Scrapes and crashes (VEHICLE_COLLIDED) throw sparks.
// Only cars near the camera's subject are looked at; nothing is allocated per frame.

/** Surface ids of game/src/physics/surfaceTypes.js. */
const SURFACE_SAND = 2;
const SURFACE_GRASS = 3;
const SURFACE_DIRT = 4;
const SURFACE_WATER = 7;

/** Tuning, in one place. */
export const DRIVING_EFFECTS = Object.freeze({
  range: 90, // metres from the camera's subject
  smokeSlip: 0.35, // slip above which a tyre on a hard surface smokes
  skidSlip: 0.3, // slip above which it marks the road
  smokeInterval: 0.07, // seconds between puffs at full slip
  dustInterval: 0.09, // seconds between dust puffs at speed
  dustSpeed: 3, // m/s from which loose ground throws dust
  skidSegment: 0.7, // metres of mark per decal
  skidWidth: 0.22,
  skidLife: 90,
  sparkGap: 0.08, // seconds between spark bursts of one car
  sparkSpeed: 2.5, // closing m/s from which a contact sparks
});

/**
 * Creates the driving effects.
 * @param {{
 *   spawn: (request: object) => boolean,
 *   addDecal: (cell: string, x: number, y: number, z: number, nx: number, ny: number, nz: number, angle: number, width: number, length: number, opacity?: number, life?: number) => number,
 *   vehicles: () => Iterable<{id: string, position: {x: number, y: number, z: number}, heading: number, tags?: Set<string>}>,
 *   carOf: (vehicleId: string) => object | null,
 *   listener: () => ({x: number, z: number} | null),
 *   groundHeightAt: (x: number, z: number) => number,
 * }} options `heading` is the entity's (three.js rotation.y); a car's model space faces -Z.
 */
export function createVehicleDrivingEffects(options) {
  const T = DRIVING_EFFECTS;
  const states = new Map();
  const hub = { x: 0, y: 0, z: 0 };
  const request = { effectId: '', position: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 }, scale: 1 };
  let clock = 0;

  function stateOf(id) {
    let s = states.get(id);
    if (!s) {
      s = { seen: 0, timers: new Float32Array(4), marking: new Uint8Array(4), lastX: new Float32Array(4), lastZ: new Float32Array(4), sparkAt: -1 };
      states.set(id, s);
    }
    return s;
  }

  function send(effectId, x, y, z, dx, dy, dz, scale) {
    request.effectId = effectId;
    request.position.x = x; request.position.y = y; request.position.z = z;
    request.direction.x = dx; request.direction.y = dy; request.direction.z = dz;
    request.scale = scale;
    options.spawn(request);
  }

  function wheel(entity, car, s, i, dt, cos, sin, speed) {
    if (!car.wheelContact[i]) { s.marking[i] = 0; return; }
    car.wheelHubPosition(i, hub);
    const p = entity.position;
    // model space to world: rotate by the entity's heading about +Y
    const x = p.x + hub.x * cos + hub.z * sin;
    const z = p.z - hub.x * sin + hub.z * cos;
    const surface = car.wheelSurface[i];
    let slip = car.wheelSlip[i];
    // a burnout: full throttle against the brake or from a standstill spins the driven wheels,
    // which the physics does not count as slip below 3 m/s
    if (i >= 2 && car.throttle > 0.8 && (car.brake > 0.3 || Math.abs(speed) < 2.5)) slip = Math.max(slip, 0.7);
    s.timers[i] -= dt;
    const loose = surface === SURFACE_SAND || surface === SURFACE_GRASS || surface === SURFACE_DIRT;
    if (surface === SURFACE_WATER) {
      if (Math.abs(speed) > 2 && s.timers[i] <= 0) {
        s.timers[i] = T.dustInterval;
        // thrown back off the tyre (the car's nose is -Z in its model space)
        send('water_spray', x, p.y + 0.2, z, sin * Math.sign(speed), 0.6, cos * Math.sign(speed), Math.min(1.5, Math.abs(speed) / 10));
      }
      s.marking[i] = 0;
      return;
    }
    if (loose) {
      const amount = Math.min(1, Math.abs(speed) / 20 + slip);
      if ((Math.abs(speed) > T.dustSpeed || slip > 0.2) && s.timers[i] <= 0) {
        s.timers[i] = T.dustInterval / Math.max(0.35, amount);
        send(surface === SURFACE_SAND ? 'sand_dust' : 'dirt_dust', x, p.y, z, 0, 1, 0, (surface === SURFACE_GRASS ? 0.6 : 0.8) + amount * 0.7);
      }
      s.marking[i] = 0;
      return;
    }
    if (slip > T.smokeSlip && s.timers[i] <= 0) {
      s.timers[i] = T.smokeInterval / slip;
      send('tyre_smoke', x, p.y, z, 0, 1, 0, 0.6 + slip * 0.7);
    }
    if (slip > T.skidSlip) {
      if (!s.marking[i]) { s.marking[i] = 1; s.lastX[i] = x; s.lastZ[i] = z; return; }
      const ddx = x - s.lastX[i];
      const ddz = z - s.lastZ[i];
      const length = Math.hypot(ddx, ddz);
      if (length < T.skidSegment) return;
      const mx = (x + s.lastX[i]) * 0.5;
      const mz = (z + s.lastZ[i]) * 0.5;
      if (length < 3) {
        options.addDecal('skid', mx, options.groundHeightAt(mx, mz), mz, 0, 1, 0, Math.atan2(-ddx, -ddz), T.skidWidth, length + 0.05, Math.min(0.75, 0.3 + slip * 0.5), T.skidLife);
      }
      s.lastX[i] = x; s.lastZ[i] = z;
    } else {
      s.marking[i] = 0;
    }
  }

  return {
    /** Looks at every car near the listener and throws smoke, dust, spray and marks. */
    update(dt) {
      if (!(dt > 0)) return;
      clock += dt;
      const at = options.listener();
      for (const entity of options.vehicles()) {
        const p = entity.position;
        if (at && Math.abs(p.x - at.x) + Math.abs(p.z - at.z) > T.range) continue;
        if (entity.tags?.has?.('dead')) continue;
        const car = options.carOf(entity.id);
        if (!car?.wheelSlip) continue;
        const s = stateOf(entity.id);
        s.seen = clock;
        const cos = Math.cos(entity.heading);
        const sin = Math.sin(entity.heading);
        const speed = car.speed ?? 0;
        for (let i = 0; i < 4 && i < car.wheelSlip.length; i += 1) wheel(entity, car, s, i, dt, cos, sin, speed);
      }
      // forget cars not seen for a while (removed or far away)
      if (states.size > 64) for (const [id, s] of states) if (clock - s.seen > 5) states.delete(id);
    },

    /** VEHICLE_COLLIDED {vehicleId, speed, position, normal}: sparks where metal meets. */
    collided(payload) {
      const p = payload?.position;
      if (!p || !(payload.speed > T.sparkSpeed)) return;
      const s = stateOf(payload.vehicleId);
      if (s.sparkAt >= 0 && clock - s.sparkAt < T.sparkGap) return;
      s.sparkAt = clock;
      const n = payload.normal;
      // throw the sparks back off the contact and a little up
      const dx = n ? -n.x : 0; const dz = n ? -n.z : 0;
      send('scrape_sparks', p.x, p.y, p.z, dx, 0.5, dz, Math.min(2.5, 0.6 + payload.speed / 8));
      if (payload.speed > 12) send('vehicle_debris', p.x, p.y + 0.4, p.z, 0, 1, 0, Math.min(1.5, payload.speed / 14));
    },

    /** Drops what is remembered about the cars. */
    clear() { states.clear(); },
  };
}
