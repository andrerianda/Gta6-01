// The aim picture, scene `mission-firefight`: a story mission's shootout in Barrio Hierro, the
// worn industrial quarter (brick warehouses, chain-link, bins, tyres, overhead wires), in the low
// warm sun. The lead stands on one pavement in the two-handed shooter's stance, seen through the
// game's own aim camera (behind-right, above the head), the reticle on a gunman of the loading
// crew across the street; the crew (the mission's own squad, stood in the far lane round their
// SUV slewed across it, burning, and on the far pavement) faces the lead and shoots back. The lead's last shot is frozen with its small flash.
// Mission m05 Night Shift at "Take out the loading crew" is on the HUD.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { openScene, placeLead } from './showcaseStaging.js';

/** The mission shown and the objective it is at (missions' 'firefight' moment). */
const MISSION = Object.freeze({ missionId: 'm05_night_shift', startIndex: 1 });
/**
 * Clock: the sun low and warm over the warehouses (take f7, mean luminance 114: the crew in their
 * hi-vis and the SUV's dark column read against the bright sky; at 18.8, take f6, it was 78).
 */
const HOURS = 18.35;
/** Which Barrio Hierro street (nearest the district's centre first) and where along it. */
const STREET = Object.freeze({ pick: 0, along: 0.56 });
/** The crew's SUV burning at this stage of 'effects/burn' (take f6: flames and a dark column behind the crew). */
const SUV_FIRE = 'blazing';
/**
 * Where the crew stands across the street: [metres ahead of the lead, metres from the street's
 * centre line (negative: the far side)]. The first is the one under the reticle; the others in
 * the far lane round their SUV and back on the far pavement. (On the far pavement only, take f1,
 * they were too small to read 20 m away.)
 */
const CREW = Object.freeze([[10.2, -5.4], [11.6, -6.3], [12.4, -5.0], [10.9, -7.3], [13.3, -6.6], [9.4, -6.6]]);
/**
 * How many of the crew (the first ones) have already turned to fire at the lead; the rest still
 * face the huddle's middle, caught turning (QA, shift 9: a row facing the lead read as bystanders).
 */
const TURNED = 3;
/** The crew's SUV slewed across the far lane as cover: [ahead, from the centre line, turn of its nose]. */
const SUV = Object.freeze([11, -3.6, 1.2]);

/**
 * Registers the aim scene.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerMissionFirefight(context) {
  return context.showcase.register({
    name: 'mission-firefight',
    title: 'A shootout in Barrio Hierro',
    description: 'The mission objective on the HUD, the lead in a two-handed stance aiming across a worn industrial street at the loading crew shooting back.',
    async run(game, tools) {
      const { commands } = game;
      const query = new URLSearchParams(globalThis.location?.search ?? '');
      openScene(game, { hours: HOURS, traffic: 0.35, crowd: 0.8 });
      const street = hierroStreet(game, numberOr(query.get('pick'), STREET.pick), numberOr(query.get('t'), STREET.along));
      const shift = numberOr(query.get('ahead'), 0);
      const lead = street.at(street.nearSide, 0);
      const crew = CREW.map(([ahead, side]) => street.at(side, ahead + shift));
      const facing = Math.atan2(crew[0].x - lead.x, -(crew[0].z - lead.z));
      await placeLead(game, tools, lead, -facing);
      if (!(commands.has('missions/moment') && commands.run('missions/moment', { name: 'firefight' })) && commands.has(GAME_COMMANDS.MISSION_START)) {
        commands.run(GAME_COMMANDS.MISSION_START, { ...MISSION, skipIntro: true });
      }
      commands.run(GAME_COMMANDS.PLAYER_GIVE_WEAPON, { weaponId: 'pistol', ammo: 60 });
      const fleet = game.systems.get('vehicles');
      const suv = fleet?.spawn({
        modelId: 'suv', position: street.at(SUV[1], SUV[0] + shift), heading: street.compass + Math.PI + SUV[2], colour: '#1E2226', parked: true, ownerSystem: 'showcase',
      });
      tools.advance(0.4);
      // The crew's SUV burning; `&fire=<stage>` (smoking, burning, blazing, or 0) for other takes.
      const fire = query.get('fire') ?? SUV_FIRE;
      if (fire && fire !== '0' && suv !== undefined && suv !== null && commands.has('effects/burn')) commands.run('effects/burn', { vehicleId: suv, stage: fire, warm: 6 });
      standCrew(game, crew, lead);
      clearAroundLead(game, 4);
      game.input.setVirtual('aim', true);
      tools.advance(1.2);
      standCrew(game, crew, lead);
      clearAroundLead(game, 3);
      // The crew's tracers fly at the lead's hips, under the camera, and read as white scratches
      // to the bottom edge at 768x480 (QA, shift 9): from here to the picture only the lead's own
      // tracer is drawn (the crew's flashes stay). The effects hold still `&after=` (0.02) s after
      // the LEAD's flash appears (a crew flash coming first no longer starts the count).
      const after = numberOr(query.get('after'), 0.02);
      const restore = holdForLeadShot(game, after);
      tools.advance(0.4);
      game.input.setVirtual('attack', true);
      tools.advance(0.08);
      game.input.setVirtual('attack', false);
      tools.advance(0.04);
      restore();
    },
  });
}

/**
 * A street of Barrio Hierro as a frame: `at(side, ahead)` gives a point `side` metres to the
 * near-pavement side of the centre line (negative: the far side) and `ahead` metres along it.
 */
function hierroStreet(game, pick, along) {
  const plan = game.systems.find('openWorldCity')?.plan;
  const district = plan?.districts?.find?.((each) => each.id === 'barrio_hierro');
  const segments = (plan?.roads?.segments ?? []).filter((s) => s.district === 'barrio_hierro' && s.length > 80 && !s.bridge
    && (s.sidewalkLeft ?? 0) >= 2 && s.roadClass === 'street');
  if (district) segments.sort((a, b) => Math.hypot(a.points[0] - district.x, a.points[1] - district.z) - Math.hypot(b.points[0] - district.x, b.points[1] - district.z));
  const s = segments[Math.min(segments.length - 1, Math.max(0, pick))];
  if (!s) return { at: (side, ahead) => ({ x: side, z: -ahead }), nearSide: 8, compass: 0 };
  const n = s.points.length;
  const ex = s.points[0], ez = s.points[1], wx = s.points[n - 2], wz = s.points[n - 1];
  const length = Math.hypot(wx - ex, wz - ez);
  const dx = (wx - ex) / length, dz = (wz - ez) / length;
  const cx = ex + (wx - ex) * along, cz = ez + (wz - ez) * along;
  return {
    at: (side, ahead) => ({ x: cx + dz * side + dx * ahead, z: cz - dx * side + dz * ahead }),
    nearSide: s.halfWidth + s.sidewalkLeft * 0.55,
    compass: Math.atan2(dx, -dz),
  };
}

/** Stands the mission's crew (the pedestrians tagged as mission enemies) at their marks, facing the lead. */
function standCrew(game, marks, lead) {
  const crowd = game.systems.find('pedestrians');
  const people = crowd?.people ?? [];
  let index = 0;
  let mx = 0, mz = 0;
  for (const mark of marks) { mx += mark.x / marks.length; mz += mark.z / marks.length; }
  for (const person of people) {
    if (index >= marks.length) break;
    if (!person.entity?.data?.missionEnemy) continue;
    const mark = marks[index];
    index += 1;
    person.x = mark.x;
    person.z = mark.z;
    if (person.entity.position) {
      person.entity.position.x = mark.x;
      person.entity.position.z = mark.z;
    }
    const turned = index <= TURNED || Math.hypot(mx - mark.x, mz - mark.z) < 0.4;
    const to = turned ? lead : { x: mx, z: mz };
    person.facing = Math.atan2(-(to.x - mark.x), -(to.z - mark.z));
  }
  game.log?.info?.(`showcase firefight: ${index} of the crew stood across the street`);
}

/**
 * Until the returned function is called: drops tracers that do not start at the lead, and holds
 * the effects `after` seconds after the lead's first muzzle flash.
 */
function holdForLeadShot(game, after) {
  const { commands } = game;
  const lead = game.systems.find('player')?.entity?.position;
  const send = commands.send;
  let held = false;
  const nearLead = (p) => !lead || !p || Math.hypot(p.x - lead.x, p.z - lead.z) < 1.6;
  commands.send = function sendForThePicture(name, payload, ...rest) {
    if (name === GAME_COMMANDS.EFFECT_SPAWN && payload) {
      if (payload.effectId === 'tracer' && !nearLead(payload.position)) return undefined;
      if (!held && payload.effectId === 'muzzle_flash' && nearLead(payload.position) && commands.has('effects/freeze')) {
        held = true;
        commands.run('effects/freeze', { after });
      }
    }
    return send.call(this, name, payload, ...rest);
  };
  return () => { commands.send = send; };
}

/** Sends away the passers-by within `radius` metres of the lead (nobody stands inside the aiming lead). */
function clearAroundLead(game, radius) {
  const crowd = game.systems.find('pedestrians');
  const lead = game.systems.find('player')?.motion;
  if (!crowd?.people || typeof crowd.removePerson !== 'function' || !lead) return;
  for (const person of [...crowd.people]) {
    if (person.entity?.data?.missionEnemy) continue;
    if (Math.hypot(person.x - lead.x, person.z - lead.z) < radius) crowd.removePerson(person.id);
  }
}

/** A number from the page query, or the fallback. */
function numberOr(given, fallback) {
  const value = Number(given);
  return given !== null && Number.isFinite(value) ? value : fallback;
}
