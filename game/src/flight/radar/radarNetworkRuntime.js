// The radar network at work: the coastal radar of Cabo Lejano and, while the navy picket is on
// station, its three ships; each frame it turns their antennas, works out the signature the
// lead's aircraft shows to each (radarSignature.js), paints it when a beam crosses it in reach
// (radarSweep.js), and keeps the track the air guard and the cockpit read. It also runs the
// guided bomb (guidedBombRun.js) and destroys or rebuilds the tower. The models in the world are
// radarEmitterModels.js (three.js); without them (Node tests) everything else still works.
import { GAME_COMMANDS } from '../../core/events/gameCommands.js';
import { GAME_EVENTS } from '../../core/events/gameEvents.js';
import { WORLD_FLAGS } from '../../core/state/worldFlags.js';
import { createGuidedBombRun } from './guidedBombRun.js';
import { radarHorizonMetres, radarSignatureOf, signatureWord } from './radarSignature.js';
import { RADAR_SWEEP, beamAzimuthAt, beamCrossed, compassBearing, createRadarTrack, detectionRange, resetRadarTrack, signatureNeededAt, stepRadarTrack, terrainSightFree } from './radarSweep.js';

const METRES_PER_NM = 1852;
/** The picket ships steam a long oval about their station: half length and half width (metres), seconds a lap. */
export const PICKET_PATROL = Object.freeze({ along: 350, across: 70, lapSeconds: 420 });
/** The viewer the meter assumes when no radar is alive: far off the nose, on the sea. */
const FAR_VIEWER = { x: 0, y: 30, z: 0 };

/**
 * Creates the radar network.
 * @param {import('../../core/systems/gameContext.js').GameContext} context
 * @param {{radarTower: object, navyPicket: ReadonlyArray<object>}} chart SEA_AND_AIRSPACE_CHART.
 * @param {{sync: Function, setTowerWrecked: Function, dispose: Function} | null} [models] radarEmitterModels.js.
 */
export function createRadarNetwork(context, chart, models = null) {
  const { entities, events, flags, systems, commands } = context;
  const stops = [];
  let time = 0;
  let towerPlaced = false;
  let picketActive = false;
  let pendingTargeting = context.launch?.stage === 'bomb';

  const record = (spec, index) => ({
    id: spec.id, name: spec.name, kind: spec.kind, x: spec.x, y: spec.antennaHeight, z: spec.z, range: spec.range, alive: true, beamAzimuth: 0,
    sweepSeconds: spec.sweepSeconds, phaseDegrees: index * 97, beamWidth: RADAR_SWEEP.beamWidthDegrees[spec.kind] ?? 6, antennaHeight: spec.antennaHeight,
    baseX: spec.x, baseZ: spec.z, patrolHeading: ((spec.heading ?? 0) * Math.PI) / 180, heading: ((spec.heading ?? 0) * Math.PI) / 180,
    groundY: 0, aimY: spec.kind === 'tower' ? spec.antennaHeight / 2 : 8, active: spec.kind === 'tower',
    track: createRadarTrack(), inBeam: false, signature: 0, distance: 0, reach: 0,
  });
  const tower = record(chart.radarTower, 0);
  const ships = chart.navyPicket.map((spec, index) => record(spec, index + 1));
  const all = [tower, ...ships];
  /** The public list: the tower, and the ships while the picket is on station. */
  const emitters = [tower];

  const playerTrack = { tracked: false, signature: 0, quality: 0, guidance: true, emitterId: null, lockSeconds: 0 };
  const craft = {
    id: null, typeId: '', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, heading: 0, pitch: 0, roll: 0, mach: 0, skinTemperatureC: 0,
    heightAboveSurface: 0, onGround: false, gear: 0, afterburner: false, hatchOpen: false, bayOpen: false,
  };
  const other = { ...craft };
  /** What the cockpit shows (the flight deck reads it each repaint). */
  const display = {
    vehicleId: null, signature: 0, threshold: Infinity, word: 'HIDDEN', tracked: false, painted: false, lockSeconds: 0, bayOpen: false,
    emitters: all.map(() => ({ id: '', kind: '', bearingDegrees: 0, distanceNm: 0, beamBearingDegrees: 0, reachNm: 0, painting: false })),
    emitterCount: 0, targeting: null,
  };

  const groundHeightAt = (x, z) => {
    const height = systems.find('physics')?.groundHeightAt?.(x, z);
    return Number.isFinite(height) ? height : 0;
  };

  const bombRun = createGuidedBombRun(context, { candidates: () => emitters, groundHeightAt, onHit: (target, position, vehicleId) => destroy(target, position, vehicleId) });
  display.targeting = bombRun.data;

  function spawn(effectId, x, y, z, scale) {
    if (commands?.has?.(GAME_COMMANDS.EFFECT_SPAWN)) commands.run(GAME_COMMANDS.EFFECT_SPAWN, { effectId, position: { x, y, z }, direction: { x: 0, y: 1, z: 0 }, scale });
  }

  /** The tower falls: the largest blast the effects have, the wreck, the flag, the event. */
  function destroy(target, position, vehicleId) {
    if (target !== tower || !tower.alive) return;
    const base = tower.groundY;
    spawn('vehicle_explosion', tower.x, base + 14, tower.z, 6);
    spawn('explosion', tower.x, base + 2, tower.z, 7);
    spawn('explosion', tower.x, base + 28, tower.z, 5);
    spawn('vehicle_debris', tower.x, base + 20, tower.z, 5);
    systems.find('physics')?.explode?.({ position: { x: tower.x, y: base + 4, z: tower.z }, radius: 45, power: 60000, causeId: vehicleId ?? null, weaponId: 'guided_bomb' });
    events.emit(GAME_EVENTS.RADAR_EMITTER_DESTROYED, { emitterId: tower.id, kind: tower.kind, position: { x: tower.x, y: base, z: tower.z } });
    void position;
    flags.set(WORLD_FLAGS.RADAR_TOWER_DESTROYED, true); // (the flag listener below marks it dead)
    markTower(false);
  }

  function markTower(alive) {
    if (tower.alive === alive) return;
    tower.alive = alive;
    resetRadarTrack(tower.track);
    tower.inBeam = false;
    playerTrack.guidance = alive;
    models?.setTowerWrecked(!alive);
  }

  function setPicket(active) {
    picketActive = active;
    emitters.length = 1;
    for (const ship of ships) {
      ship.active = active;
      if (active) emitters.push(ship);
      else { resetRadarTrack(ship.track); ship.inBeam = false; }
    }
  }

  /** Rebuilds the tower (a retry, a new game); the bomb is not reloaded. */
  function restore() {
    bombRun.reset();
    flags.set(WORLD_FLAGS.RADAR_TOWER_DESTROYED, false);
    markTower(true);
  }

  const listen = (topic, handler) => { if (topic) stops.push(events.on(topic, handler)); };
  listen(GAME_EVENTS.WORLD_FLAG_CHANGED, ({ flag, value }) => {
    if (flag === WORLD_FLAGS.RADAR_TOWER_DESTROYED) markTower(!value);
    else if (flag === WORLD_FLAGS.NAVY_PICKET_ACTIVE) setPicket(Boolean(value));
  });
  listen(GAME_EVENTS.NEW_GAME_STARTED, restore);
  if (commands?.handle) {
    stops.push(commands.handle(GAME_COMMANDS.GUIDED_BOMB_RELEASE, () => bombRun.release(readLead())));
    stops.push(commands.handle(GAME_COMMANDS.RADAR_EMITTER_RESTORE, () => restore()));
  }
  const stage = context.launch?.stage ?? null;
  if (stage === 'bomb') flags.set(WORLD_FLAGS.GUIDED_BOMB_LOADED, true);
  if (stage === 'picket') flags.set(WORLD_FLAGS.NAVY_PICKET_ACTIVE, true);
  setPicket(flags.get(WORLD_FLAGS.NAVY_PICKET_ACTIVE));
  markTower(!flags.get(WORLD_FLAGS.RADAR_TOWER_DESTROYED));

  /** Fills `out` with what the signature model needs of a flying vehicle; false when it is none. */
  function readCraft(id, out, isLead) {
    const entity = id === null || id === undefined ? null : entities.get(id);
    if (!entity || !entity.tags) return false;
    const plane = entity.tags.has('airplane');
    if (!plane && !entity.tags.has('helicopter')) return false;
    const fleet = systems.find('vehicles');
    const physics = fleet?.physicsOf?.(id) ?? null;
    const state = plane ? physics?.state ?? null : null;
    const p = entity.position;
    out.id = id;
    out.typeId = plane ? entity.data?.modelId ?? '' : 'helicopter';
    out.x = p.x; out.y = p.y; out.z = p.z;
    const surface = Math.max(0, groundHeightAt(p.x, p.z));
    out.heightAboveSurface = Math.max(0, p.y - surface);
    if (state) {
      out.heading = state.heading ?? 0; out.pitch = state.pitch ?? 0; out.roll = state.roll ?? 0;
      out.mach = state.mach ?? 0; out.skinTemperatureC = state.skinTemperature ?? 0;
      out.onGround = Boolean(state.onGround);
      out.gear = physics.tuning?.retractableGear ? state.gear ?? 0 : 0;
      out.afterburner = (state.afterburner ?? 0) > 0.02;
      const v = physics.body?.velocity;
      if (v && Number.isFinite(v.x)) { out.vx = v.x; out.vy = v.y; out.vz = v.z; }
      else {
        const speed = state.groundSpeed ?? 0;
        out.vx = Math.sin(out.heading) * speed; out.vy = state.verticalSpeed ?? 0; out.vz = -Math.cos(out.heading) * speed;
      }
    } else {
      out.heading = entity.heading ?? 0; out.pitch = 0; out.roll = 0; out.mach = 0; out.skinTemperatureC = 0;
      out.onGround = out.heightAboveSurface < 1.5; out.gear = 0; out.afterburner = false; out.vx = 0; out.vy = 0; out.vz = 0;
    }
    out.hatchOpen = isLead ? Boolean(systems.find('flightDeck')?.hatchOpen) : false;
    out.bayOpen = isLead ? bombRun.bayOpen : false;
    return true;
  }

  function leadId() {
    const vehicle = systems.find('player')?.vehicle;
    if (vehicle === null || vehicle === undefined) return null;
    return typeof vehicle === 'object' ? vehicle.id ?? null : vehicle;
  }

  const readLead = () => (readCraft(leadId(), craft, true) ? craft : null);

  /** The live emitter nearest a point, or null. */
  function nearestEmitter(x, z) {
    let best = null;
    let bestDistance = Infinity;
    for (let i = 0; i < emitters.length; i += 1) {
      const e = emitters[i];
      if (!e.alive) continue;
      const distance = Math.hypot(e.x - x, e.z - z);
      if (distance < bestDistance) { best = e; bestDistance = distance; }
    }
    return best;
  }

  function placeTower() {
    const physics = systems.find('physics');
    if (!physics?.groundHeightAt) return;
    const ground = physics.groundHeightAt(tower.x, tower.z);
    if (!Number.isFinite(ground)) return;
    tower.groundY = Math.max(0, ground);
    tower.y = tower.groundY + tower.antennaHeight;
    tower.aimY = tower.groundY + tower.antennaHeight / 2;
    towerPlaced = true;
  }

  function steamShips() {
    const phase = (2 * Math.PI * time) / PICKET_PATROL.lapSeconds;
    for (let i = 0; i < ships.length; i += 1) {
      const ship = ships[i];
      const angle = phase + i * 2.1;
      const along = PICKET_PATROL.along * Math.sin(angle);
      const across = PICKET_PATROL.across * Math.cos(angle);
      const sh = Math.sin(ship.patrolHeading);
      const ch = Math.cos(ship.patrolHeading);
      ship.x = ship.baseX + along * sh + across * ch;
      ship.z = ship.baseZ - along * ch + across * sh;
      const va = PICKET_PATROL.along * Math.cos(angle);
      const vc = -PICKET_PATROL.across * Math.sin(angle);
      ship.heading = Math.atan2(va * sh + vc * ch, -(-va * ch + vc * sh));
    }
  }

  function sweep(dt, lead) {
    let best = null;
    let anyTracked = false;
    let anyPainted = false;
    let lock = 0;
    let shown = 0;
    for (let i = 0; i < all.length; i += 1) {
      const e = all[i];
      const before = e.beamAzimuth;
      e.beamAzimuth = beamAzimuthAt(e, time);
      if (!e.active || !e.alive) continue;
      if (!lead) { resetRadarTrack(e.track); e.inBeam = false; continue; }
      e.signature = radarSignatureOf(lead.typeId, lead, e);
      e.distance = Math.hypot(lead.x - e.x, lead.z - e.z);
      e.reach = detectionRange(e.range, e.signature);
      const bearing = compassBearing(e.x, e.z, lead.x, lead.z);
      const crossed = beamCrossed(before, (360 * dt) / e.sweepSeconds, bearing, e.beamWidth);
      let paint = false;
      if (crossed && !e.inBeam && e.distance <= e.reach && e.distance <= radarHorizonMetres(e.y, lead.y)) {
        paint = terrainSightFree(groundHeightAt, e.x, e.y, e.z, lead.x, lead.y, lead.z);
      }
      e.inBeam = crossed;
      stepRadarTrack(e.track, paint, dt, e.sweepSeconds, e.reach > 0 ? (1 - e.distance / e.reach) * 4 : 0);
      if (e.track.tracked) { anyTracked = true; if (e.kind === 'ship' && e.track.heldSeconds > lock) lock = e.track.heldSeconds; }
      if (e.track.painted) anyPainted = true;
      if (e.track.quality > 0 && (!best || e.track.quality > best.track.quality)) best = e;
      const slot = display.emitters[shown];
      shown += 1;
      slot.id = e.id; slot.kind = e.kind;
      slot.bearingDegrees = compassBearing(lead.x, lead.z, e.x, e.z);
      slot.distanceNm = e.distance / METRES_PER_NM;
      slot.beamBearingDegrees = e.beamAzimuth;
      slot.reachNm = e.reach / METRES_PER_NM;
      slot.painting = e.track.sincePaint < 1.2;
    }
    display.emitterCount = lead ? shown : 0;
    const nearest = lead ? nearestEmitter(lead.x, lead.z) : null;
    let signature = 0;
    if (lead) {
      if (nearest) signature = nearest.signature;
      else {
        FAR_VIEWER.x = lead.x + Math.sin(lead.heading) * 20000;
        FAR_VIEWER.z = lead.z - Math.cos(lead.heading) * 20000;
        signature = radarSignatureOf(lead.typeId, lead, FAR_VIEWER);
      }
    }
    const emitterId = best ? best.id : null;
    const changed = anyTracked !== playerTrack.tracked || (anyTracked && emitterId !== playerTrack.emitterId);
    playerTrack.tracked = anyTracked;
    playerTrack.signature = signature;
    playerTrack.quality = best ? best.track.quality : 0;
    playerTrack.emitterId = emitterId;
    playerTrack.lockSeconds = lock;
    display.vehicleId = lead ? lead.id : null;
    display.signature = signature;
    display.threshold = nearest ? signatureNeededAt(nearest.range, nearest.distance) : Infinity;
    display.tracked = anyTracked;
    display.painted = anyPainted;
    display.lockSeconds = lock;
    display.bayOpen = bombRun.bayOpen;
    display.word = signatureWord(signature, display.threshold, anyTracked, anyPainted);
    if (changed) events.emit(GAME_EVENTS.RADAR_TRACK_CHANGED, { tracked: anyTracked, signature, emitterId });
  }

  return {
    playerTrack,
    emitters,
    display,
    bombRun,
    /** Every emitter record, on station or not (the models draw from it). */
    records: all,
    get time() { return time; },

    /**
     * The signature of a flying vehicle as the nearest live radar sees it (0 for anything else).
     * @param {unknown} vehicleId An entity id.
     * @returns {number} 0..1.
     */
    signatureOf(vehicleId) {
      const isLead = vehicleId === leadId();
      if (!readCraft(vehicleId, other, isLead)) return 0;
      const nearest = nearestEmitter(other.x, other.z);
      if (nearest) return radarSignatureOf(other.typeId, other, nearest);
      FAR_VIEWER.x = other.x + Math.sin(other.heading) * 20000;
      FAR_VIEWER.z = other.z - Math.cos(other.heading) * 20000;
      return radarSignatureOf(other.typeId, other, FAR_VIEWER);
    },
    /** Switches the bomb's targeting mode (the key does the same). */
    setTargeting(on) { bombRun.setTargeting(on); },
    /** Releases the bomb if everything allows it (the key and GUIDED_BOMB_RELEASE do the same). */
    releaseBomb: () => bombRun.release(readLead()),
    restore,

    update(dt) {
      time += dt;
      if (!towerPlaced) placeTower();
      if (picketActive) steamShips();
      const lead = readLead();
      if (lead && pendingTargeting && lead.typeId === 'manta_sombra') { bombRun.setTargeting(true); pendingTargeting = false; }
      bombRun.update(dt, lead, time);
      sweep(dt, lead);
      if (models) models.sync(all, towerPlaced, bombRun.bomb, lead, time, dt);
    },

    dispose() {
      for (const stop of stops) if (typeof stop === 'function') stop();
      stops.length = 0;
      models?.dispose();
    },
  };
}
