// The air guard at work in the game: each frame it reads the craft the lead flies, runs the sea
// boundary (seaBoundary.js) and the Halcón pair (interceptPatrol.js), publishes what they did
// (radio lines, stage, boundary and air-wanted events), deals the cannon hits through the fleet's
// damage path, draws the pair (interceptorModels.js), the tracers and its HUD corner, and feeds
// the cockpit radar. The triggers of free roam live here: the boundary, a military aircraft taken
// from Punta Garza without officer access, the alert flag and the scramble command.
import { GAME_EVENTS } from '../../core/events/gameEvents.js';
import { GAME_COMMANDS } from '../../core/events/gameCommands.js';
import { WORLD_FLAGS } from '../../core/state/worldFlags.js';
import { SEA_AND_AIRSPACE_CHART } from '../../catalog/seaAndAirspaceChart.js';
import { AIR_GUARD_RADIO_LINES, AIR_GUARD_TUNING } from './airGuardTuning.js';
import { createAirGuardSetup } from './airGuardSetup.js';
import { createSeaBoundary } from './seaBoundary.js';
import { createInterceptPatrol } from './interceptPatrol.js';
import { airWantedLevel, airWantedWord } from './airWantedLevel.js';
import { createInterceptorModels } from './interceptorModels.js';
import { createAirGuardHud } from './airGuardHud.js';

const NM = 1852;
const DEGREES = 180 / Math.PI;
const STAGINGS = new Set(['boundary', 'intercept', 'wing', 'shots']);
const RESCRAMBLE_SECONDS = 20;
const TRACER_EVERY = 0.07;
const BURST_SECONDS = 0.5;

/**
 * Creates the air guard.
 * @param {import('../../core/systems/gameContext.js').GameContext} context
 */
export function createAirGuardRuntime(context) {
  const { entities, events, commands, flags, systems } = context;
  const chart = SEA_AND_AIRSPACE_CHART;
  const tuning = AIR_GUARD_TUNING;
  const rng = typeof context.random === 'function' ? context.random('airDefence') : null;
  const random = rng && typeof rng.range === 'function' ? () => rng.range(0, 1) : Math.random;
  const setup = createAirGuardSetup(random);
  const patrol = createInterceptPatrol(setup);
  const boundary = createSeaBoundary(chart.boundary, { warningEvery: tuning.boundaryWarningEvery });
  const models = createInterceptorModels(context, patrol.interceptors.length);
  const hud = createAirGuardHud(context.page);
  const lead = {
    id: null, modelId: null, kind: null, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, speed: 0, heading: 0, roll: 0,
    onGround: false, autopilot: false, signature: 1, heightAboveSurface: 0, physics: null, entity: null,
  };
  const previous = { id: null, x: 0, y: 0, z: 0 };
  const env = { guidance: false, heightAt: null, seaOpen: false, weaponsFree: false, relentless: false };
  const conditions = { open: false, silenced: false, warningOnly: false };
  const burst = { left: 0, tick: 0, shooter: 0, kind: 'warning', hit: false, side: 1 };
  const nose = { x: 0, y: 0, z: 0 };
  const contacts = [];
  const contactPool = patrol.interceptors.map(() => ({ bearingDegrees: 0, distanceNm: 0, hostile: true }));
  const stops = [];
  let wanted = 0;
  let armedTakeoff = null;
  let cooldown = 0;
  let contactTimer = 0;
  let staged = false;
  let clock = 0;
  let boundaryLine = '';
  let lineDistance = -1;
  // Set by the mission when the lead is above the coastal radar's coverage: no ground guidance.
  let guidanceCut = false;

  const flag = (name) => flags?.get?.(name) === true;
  const city = () => systems.find('openWorldCity');
  const heightAt = (x, z) => {
    const extent = chart.cityExtent;
    if (x < extent.minX || x > extent.maxX || z < extent.minZ || z > extent.maxZ) return -1;
    const h = city()?.groundHeightAt?.(x, z);
    return typeof h === 'number' && h === h ? h : -1;
  };
  env.heightAt = heightAt;

  function say(lineId, channel) {
    const line = AIR_GUARD_RADIO_LINES[lineId];
    if (!line) return;
    const control = line.speaker === 'control';
    const speakerName = control ? chart.boundaryCallsign : chart.airGuard.callsigns[line.speaker];
    const speakerId = control ? 'control_marazul' : patrol.interceptors[line.speaker].id;
    const text = lineId === 'airspace.warning' ? chart.boundaryWarning : line.text;
    events.emit(GAME_EVENTS.RADIO_MESSAGE, { channel: channel ?? (control ? 'airspace' : 'airGuard'), speakerId, speakerName, lineId, text, seconds: line.seconds, urgent: line.urgent });
    // The voice-over draws radio lines itself (coloured, voiced); the plain subtitle is the fallback.
    if (!systems.find('voiceOver')?.ready) commands.send(GAME_COMMANDS.UI_SHOW_SUBTITLE, { speakerName, text, seconds: line.seconds });
  }

  /** Fills `lead` from the craft the player flies or sails; false when there is none. */
  function readLead(dt) {
    const vehicle = systems.find('player')?.vehicle ?? null;
    const id = vehicle !== null && typeof vehicle === 'object' ? vehicle.id ?? null : vehicle;
    const entity = id === null || id === undefined ? null : entities.get(id);
    const tags = entity?.tags;
    const kind = !tags || tags.has('dead') ? null : tags.has('airplane') ? 'airplane' : tags.has('helicopter') ? 'helicopter' : tags.has('boat') ? 'boat' : null;
    if (!kind) {
      lead.id = previous.id = null;
      return false;
    }
    const fleet = systems.find('vehicles');
    const physics = fleet?.physicsOf?.(id) ?? null;
    const body = physics?.body ?? null;
    const place = fleet?.modelOf?.(id)?.position ?? body?.position ?? entity.position;
    lead.id = id;
    lead.entity = entity;
    lead.physics = physics;
    lead.kind = kind;
    lead.modelId = entity.data?.modelId ?? null;
    lead.x = place.x;
    lead.y = place.y;
    lead.z = place.z;
    const velocity = body?.linearVelocity ?? null;
    if (velocity) {
      lead.vx = velocity.x;
      lead.vy = velocity.y;
      lead.vz = velocity.z;
    } else if (previous.id === id && dt > 1e-4) {
      lead.vx = (lead.x - previous.x) / dt;
      lead.vy = (lead.y - previous.y) / dt;
      lead.vz = (lead.z - previous.z) / dt;
    } else lead.vx = lead.vy = lead.vz = 0;
    previous.id = id;
    previous.x = lead.x;
    previous.y = lead.y;
    previous.z = lead.z;
    lead.speed = Math.hypot(lead.vx, lead.vy, lead.vz);
    const q = body?.quaternion ?? null;
    if (q) {
      // Nose (-Z) and right wing (+X) turned by the body's attitude.
      const fx = -2 * (q.x * q.z + q.w * q.y);
      const fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
      lead.heading = Math.atan2(fx, -fz);
      const rightY = 2 * (q.x * q.y + q.w * q.z);
      lead.roll = -Math.asin(rightY > 1 ? 1 : rightY < -1 ? -1 : rightY);
    } else {
      if (lead.speed > 3) lead.heading = Math.atan2(lead.vx, -lead.vz);
      lead.roll = 0;
    }
    const ground = heightAt(lead.x, lead.z);
    lead.heightAboveSurface = lead.y - (ground > 0 ? ground : 0);
    const state = physics?.state ?? null;
    lead.onGround = kind === 'boat' ? true : state && typeof state.onGround === 'boolean' ? state.onGround : lead.heightAboveSurface < 3;
    lead.autopilot = Boolean(physics?.autopilot?.engaged);
    const radar = systems.find('radarNetwork');
    const track = radar?.playerTrack ?? null;
    const known = typeof track?.signature === 'number' ? track.signature : radar?.signatureOf?.(id);
    lead.signature = typeof known === 'number' && known === known ? known : fallbackSignature();
    // Ground guidance: the radar network's word while the coastal tower stands.
    if (flag(WORLD_FLAGS.RADAR_TOWER_DESTROYED) || guidanceCut) env.guidance = false;
    else if (track && typeof track.tracked === 'boolean') env.guidance = track.tracked && track.guidance !== false;
    else {
      const tower = chart.radarTower;
      env.guidance = Math.hypot(lead.x - tower.x, lead.z - tower.z) < tower.range && lead.heightAboveSurface > 40;
    }
    return true;
  }

  function fallbackSignature() {
    const base = tuning.fallbackSignature[lead.modelId] ?? 0.6;
    if (lead.modelId !== 'manta_sombra') return base;
    return 0.04 + 0.52 * (1 - Math.exp(-(lead.heightAboveSurface * 3.28084) / 2600));
  }

  function bringDown(attackerId) {
    const fleet = systems.find('vehicles');
    const data = lead.entity?.data;
    if (!fleet?.damage || !data) return;
    fleet.damage(lead.id, (data.health ?? data.maxHealth ?? 1000) + 1, 'airGuard', attackerId, { x: lead.x, y: lead.y, z: lead.z });
    reportIfDown(attackerId);
  }

  function reportIfDown(attackerId) {
    const data = lead.entity?.data;
    if (!data || data.health > 0) return false;
    events.emit(GAME_EVENTS.AIRCRAFT_SHOT_DOWN, { vehicleId: lead.id, isPlayer: true, attackerId, position: { x: lead.x, y: lead.y, z: lead.z } });
    patrol.targetDown();
    cooldown = RESCRAMBLE_SECONDS;
    return true;
  }

  function scramble(reason) {
    if (flag(WORLD_FLAGS.AIR_DEFENCE_OFF)) return false;
    const flying = lead.id !== null && lead.kind !== 'boat';
    // The final mission's scramble: the pair is already up, two kilometres behind the lead, so
    // the whole order sequence plays before the border (a ground scramble never catches a jet).
    if (reason === 'mission' && flying && !lead.onGround) {
      if (patrol.stage !== 'idle' && patrol.stage !== 'returning') return false;
      models.load();
      patrol.place('intercept', lead, 'mission');
      return true;
    }
    const sent = patrol.scramble(reason ?? 'command', flying ? lead : null);
    if (sent) models.load();
    return sent;
  }

  function standDown(reason) {
    patrol.standDown(reason ?? 'command');
    cooldown = RESCRAMBLE_SECONDS;
  }

  function resetAll() {
    const was = patrol.stage;
    patrol.reset();
    boundary.reset();
    armedTakeoff = null;
    cooldown = 0;
    burst.left = 0;
    if (was !== 'idle') events.emit(GAME_EVENTS.AIR_INTERCEPT_STAGE_CHANGED, { stage: 'idle', previous: was, leaderId: patrol.interceptors[0].id });
    publishWanted('reset');
  }

  function publishWanted(reason) {
    const level = flag(WORLD_FLAGS.AIR_DEFENCE_OFF) ? 0 : airWantedLevel(patrol.stage, boundary.state, boundary.weaponsFree);
    if (level === wanted) return;
    const before = wanted;
    wanted = level;
    events.emit(GAME_EVENTS.AIR_WANTED_CHANGED, { level, previous: before, reason: reason ?? patrol.reason ?? 'boundary' });
  }

  /** The staging of ?stage= for captures, once the lead is in the air. */
  function stageForCapture() {
    const staging = context.launch?.stage;
    staged = true;
    if (!STAGINGS.has(staging)) return;
    models.load();
    if (staging === 'boundary') {
      if (!context.launch.at) lead.physics?.placeAt?.(chart.centre.x - chart.boundary.warn - 120, lead.y, chart.centre.z, 1.5 * Math.PI, Math.max(lead.speed, 90));
      return;
    }
    patrol.place(staging, lead, 'stage');
  }

  function runBoundary(flying, dt) {
    conditions.open = flag(WORLD_FLAGS.SEA_OPEN);
    conditions.silenced = flag(WORLD_FLAGS.AIR_DEFENCE_OFF);
    conditions.warningOnly = flying && lead.kind === 'boat';
    const distance = flying ? Math.hypot(lead.x - chart.centre.x, lead.z - chart.centre.z) : 0;
    const before = boundary.state;
    const step = boundary.update(distance, dt, conditions);
    if (step.changed) events.emit(GAME_EVENTS.AIRSPACE_BOUNDARY_CHANGED, { state: boundary.state, previous: before, distance });
    if (!flying) return;
    if (step.warn) say('airspace.warning');
    if (step.scramble) {
      say('airspace.violation');
      scramble('boundary');
    }
    if (step.weaponsFreeBegan) say('airspace.weaponsFree');
    if (step.cleared && before !== 'open') say('airspace.cleared');
    if (step.bringDown) bringDown(patrol.interceptors[0].id);
  }

  function runTriggers(flying, dt) {
    if (cooldown > 0) cooldown -= dt;
    if (flag(WORLD_FLAGS.AIR_DEFENCE_OFF)) {
      if (patrol.stage !== 'idle') resetAll();
      return;
    }
    if (patrol.brokeOffAtBorder && (!flying || Math.hypot(lead.x - chart.centre.x, lead.z - chart.centre.z) < setup.borderRadius - 500)) patrol.brokeOffAtBorder = false;
    if (!flying || lead.kind === 'boat') {
      armedTakeoff = null;
      return;
    }
    // A military aircraft leaving Punta Garza without officer access.
    if (lead.kind === 'airplane' && tuning.militaryAircraft.includes(lead.modelId) && !flag(WORLD_FLAGS.BASE_OFFICER_ACCESS)) {
      const near = Math.hypot(lead.x - setup.base.x, lead.z - setup.base.z) < tuning.baseTakeoffRadius;
      if (lead.onGround) armedTakeoff = near ? lead.id : null;
      else if (armedTakeoff === lead.id && lead.heightAboveSurface > 20) {
        armedTakeoff = null;
        scramble('stolenAircraft');
      }
    }
    const resting = patrol.stage === 'idle' || patrol.stage === 'returning';
    if (!resting || cooldown > 0 || lead.onGround) return;
    // The alert flag hunts him whatever he does; a standing violation sends them again while the radar still sees him.
    if (flag(WORLD_FLAGS.AIR_DEFENCE_ALERT) && (env.guidance || patrol.stage === 'idle')) {
      if (scramble('alert')) cooldown = RESCRAMBLE_SECONDS;
    } else if (boundary.state === 'violated' && env.guidance) scramble('boundary');
  }

  function drainPatrol() {
    const list = patrol.events;
    for (let i = 0; i < list.length; i += 1) {
      const event = list[i];
      if (event.type === 'stage') {
        events.emit(GAME_EVENTS.AIR_INTERCEPT_STAGE_CHANGED, { stage: event.stage, previous: event.previous, leaderId: patrol.interceptors[0].id });
      } else if (event.type === 'radio') say(event.lineId);
      else if (event.type === 'standDown') cooldown = RESCRAMBLE_SECONDS;
      else if (event.type === 'burst') {
        burst.left = BURST_SECONDS;
        burst.tick = 0;
        burst.shooter = event.shooter;
        burst.kind = event.kind;
        burst.hit = event.hit;
        burst.side = random() < 0.5 ? -1 : 1;
        commands.send(GAME_COMMANDS.EFFECT_SPAWN, { effectId: 'muzzle_flash', position: { ...models.noseOf(event.shooter, nose) }, direction: forwardOf(patrol.interceptors[event.shooter]), scale: 5 });
        if (event.hit && lead.id !== null) {
          const data = lead.entity?.data;
          const amount = (data?.maxHealth ?? 1000) * tuning.gunnery.hitDamageShare;
          const at = { x: lead.x, y: lead.y, z: lead.z };
          systems.find('vehicles')?.damage?.(lead.id, amount, 'airGuard', patrol.interceptors[event.shooter].id, at);
          commands.send(GAME_COMMANDS.EFFECT_SPAWN, { effectId: 'bullet_impact_metal', position: at, direction: { x: 0, y: 1, z: 0 }, scale: 4 });
          reportIfDown(patrol.interceptors[event.shooter].id);
        }
      }
    }
    // (A kill adds the pair's last call and its turn for home to the same list: the loop above reaches them.)
    list.length = 0;
  }

  function forwardOf(craft) {
    return { x: Math.sin(craft.heading), y: Math.sin(craft.pitch), z: -Math.cos(craft.heading) };
  }

  /** A tracer every few hundredths of a second while a burst lasts: across the nose, or at him. */
  function drawBurst(dt) {
    if (burst.left <= 0) return;
    burst.left -= dt;
    burst.tick -= dt;
    if (burst.tick > 0 || lead.id === null) return;
    burst.tick = TRACER_EVERY;
    models.noseOf(burst.shooter, nose);
    const sin = Math.sin(lead.heading);
    const cos = Math.cos(lead.heading);
    // Warning shots pass well ahead of his nose and above it; a miss goes wide of the wing.
    let ahead = 0;
    let side = 0;
    let up = 0;
    if (burst.kind === 'warning') { ahead = 140; up = 9; } else if (!burst.hit) { side = burst.side * 16; up = 5; }
    const tx = lead.x + sin * ahead + cos * side + lead.vx * 0.2;
    const ty = lead.y + up;
    const tz = lead.z - cos * ahead + sin * side + lead.vz * 0.2;
    const dx = tx - nose.x;
    const dy = ty - nose.y;
    const dz = tz - nose.z;
    const range = Math.hypot(dx, dy, dz) || 1;
    commands.send(GAME_COMMANDS.EFFECT_SPAWN, {
      effectId: 'tracer', position: { x: nose.x, y: nose.y, z: nose.z }, direction: { x: dx / range, y: dy / range, z: dz / range },
      scale: burst.kind === 'fire' && burst.hit ? range : range + 500,
    });
  }

  function drawPair(dt) {
    const focus = context.focus?.position ?? null;
    const nearBase = focus ? Math.hypot(focus.x - setup.base.x, focus.z - setup.base.z) < tuning.scramble.sightDistance : false;
    if (nearBase || patrol.stage !== 'idle') models.load();
    for (let i = 0; i < patrol.interceptors.length; i += 1) {
      const craft = patrol.interceptors[i];
      models.pose(i, craft, craft.phase === 'air' || (nearBase && craft.phase !== 'wait') || (craft.phase !== 'parked' && craft.phase !== 'wait'), dt);
    }
  }

  function drawHud(flying) {
    if (!flying || context.state?.simulates === false) {
      hud.hide();
      return;
    }
    const outside = boundary.state === 'warned' || boundary.state === 'violated';
    if (outside) {
      const tenths = Math.ceil(boundary.distanceToReturn / 100);
      if (tenths !== lineDistance) {
        lineDistance = tenths;
        boundaryLine = `RETURN TO MARAZUL  ${(tenths / 10).toFixed(1)} KM`;
      }
    } else {
      lineDistance = -1;
      boundaryLine = '';
    }
    const word = airWantedWord(patrol.stage, wanted);
    if (wanted === 0 && !boundaryLine) hud.hide();
    else hud.show(wanted, word, boundaryLine, wanted < 2 || (clock * 2) % 1 < 0.7);
  }

  function feedRadar(flying, dt) {
    contactTimer -= dt;
    if (contactTimer > 0) return;
    contactTimer = 0.25;
    contacts.length = 0;
    if (flying) {
      for (let i = 0; i < patrol.interceptors.length; i += 1) {
        const craft = patrol.interceptors[i];
        if (craft.phase !== 'air') continue;
        const contact = contactPool[i];
        const bearing = Math.atan2(craft.x - lead.x, -(craft.z - lead.z)) * DEGREES;
        contact.bearingDegrees = bearing < 0 ? bearing + 360 : bearing;
        contact.distanceNm = Math.hypot(craft.x - lead.x, craft.z - lead.z) / NM;
        contacts.push(contact);
      }
    }
    systems.find('flightDeck')?.setContacts?.(contacts, 'airGuard');
  }

  const listen = (topic, handler) => { if (topic) stops.push(events.on(topic, handler)); };
  listen(GAME_EVENTS.PLAYER_WASTED, resetAll);
  listen(GAME_EVENTS.NEW_GAME_STARTED, resetAll);
  listen(GAME_EVENTS.SAVE_LOADED, resetAll);
  stops.push(
    commands.handle(GAME_COMMANDS.AIR_DEFENCE_SCRAMBLE, (request) => {
      // { holdFire: seconds } only holds the pair's orders and guns (a cinematic over the flight).
      if (typeof request?.groundGuidance === 'boolean') {
        guidanceCut = !request.groundGuidance;
        return true;
      }
      if (typeof request?.holdFire === 'number') {
        patrol.holdFire(request.holdFire);
        return true;
      }
      return scramble(request?.reason ?? 'command');
    }),
    commands.handle(GAME_COMMANDS.AIR_DEFENCE_STAND_DOWN, (request) => standDown(request?.reason ?? 'command')),
  );

  return {
    get wanted() { return wanted; },
    get stage() { return patrol.stage; },
    get reason() { return patrol.reason; },
    get interceptors() { return patrol.interceptors; },
    get boundaryState() { return boundary.state; },
    get boundary() { return boundary; },
    get trackSource() { return patrol.trackSource; },
    get slotDistance() { return patrol.slotDistance; },
    get modelsReady() { return models.ready; },
    patrol,
    scramble,
    standDown,

    update(deltaSeconds) {
      if (context.state?.simulates === false || !(deltaSeconds > 0)) return;
      clock += deltaSeconds;
      const flying = readLead(deltaSeconds);
      if (flying && !staged && lead.kind === 'airplane' && !lead.onGround) stageForCapture();
      env.seaOpen = flag(WORLD_FLAGS.SEA_OPEN);
      env.relentless = flag(WORLD_FLAGS.AIR_DEFENCE_ALERT);
      runBoundary(flying, deltaSeconds);
      env.weaponsFree = boundary.weaponsFree;
      runTriggers(flying, deltaSeconds);
      patrol.update(flying && lead.kind !== 'boat' ? lead : null, env, deltaSeconds);
      drainPatrol();
      publishWanted();
      drawPair(deltaSeconds);
      drawBurst(deltaSeconds);
      drawHud(flying);
      feedRadar(flying, deltaSeconds);
    },

    dispose() {
      for (const stop of stops.splice(0)) if (typeof stop === 'function') stop();
      systems.find('flightDeck')?.setContacts?.([], 'airGuard');
      models.dispose();
      hud.dispose();
    },
  };
}
