// The rocket picture, scene `rocket-strike-hierro` (judged picture 2): late afternoon in Barrio
// Hierro, the lead in the game's own aim view with the rocket launcher on his right shoulder; the
// police have thrown a roadblock across the street ahead (two cruisers nose to nose, light bars
// burning, as the police's own roadblocks stand) and his rocket has flown the whole way and burst on
// the near-lane cruiser, the instant after the impact: fireball, debris, light, the officers round
// it knocked down or drawing on him, passers-by running. The second cruiser stands intact beside the
// fireball, so the picture reads "police roadblock hit" even small. The HUD shows story mission 10
// ("Dead Air", at "Lose the police"), three wanted stars
// (roadblocks come from three), the launcher with its rounds, the cash and the minimap.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { createSirenLights, releaseSirenLights, updateSirenLights } from '../police/sirenLights.js';
import { cutCamera, groundAt, openScene, placeLead } from './showcaseStaging.js';
import { clearAroundLead, hierroStreet } from './missionFirefight.js';

/**
 * The mission shown and the objective it is at (`&step=` for another objective of it): story mission
 * 10, "Dead Air", at "Lose the police" (its lead is either one, so the lead stays; the steps skipped
 * to it put nobody in a car, unlike mission 14's, whose restore seats the lead in the truck).
 */
const MISSION = Object.freeze({ missionId: 'm10_dead_air', startIndex: 3 });
/** The lead's cash by the tenth mission (shown on the HUD instead of the new game's $2,000). */
const CASH = 96350;
/** Late afternoon, the sun still well up (the cover already has the golden hour and a burning wreck). */
const HOURS = 17.1;
/** Which Barrio Hierro street and where along it (the firefight's brick warehouse block). */
const STREET = Object.freeze({ pick: 0, along: 0.47 });
/**
 * The roadblock: [ahead, from the centre line (+ the lead's side), turn of the nose from the street's
 * reverse heading]. The first is the rocket's target (the far lane, right of the picture's centre),
 * the second stands nose to it in the near lane, intact, left of the fireball.
 */
const ROADBLOCK = Object.freeze([[18, -3.6, 1.25], [19.6, 2.7, -1.3]]);
/** Officers on foot at the roadblock: [ahead, from the centre line] (each mark is a pair of two). */
const OFFICERS = Object.freeze([[21.5, -0.6], [17.2, 5.2]]);
/** Seconds before the shot the officers come (they run out from the roadblock towards the lead). */
const OFFICERS_LEAD_SECONDS = 0.5;
/**
 * The steps the rocket's flight is played in until it bursts on the cruiser (at most
 * MAX_FLIGHT_SECONDS), and seconds of the blast before the picture (`&blast=`).
 */
const FLIGHT_STEP_SECONDS = 1 / 60;
const MAX_FLIGHT_SECONDS = 0.9;
const BLAST_SECONDS = 0.12;
/** Metres either side of the rocket's line kept clear of parked cars and passers-by. */
const LINE_CLEARANCE = 2.6;
/** Metres round each roadblock cruiser kept clear of other cars. */
const ROADBLOCK_CLEARANCE = 4.2;
/** Where the lead stands: metres from the centre line (the near lane, so the side camera stays on the street). */
const LEAD_SIDE = 2;
/**
 * The picture's camera once the rocket is away: close over the lead's right shoulder like his aim
 * view, the lead large from the waist up at the left third, the rocket's line running diagonally into
 * the frame toward the roadblock near the centre. Metres right of and behind the lead along the aim
 * line, height over the ground, the point looked at along the aim line, how far left of it, its
 * height, vertical field of view. `&view=aim` keeps the game's aim camera.
 */
const SIDE_VIEW = Object.freeze({ right: 1.15, back: 1.5, height: 1.65, look: 12, lookLeft: 2.2, lookHeight: 1.5, fieldOfView: 48 });
/** Wanted stars on the HUD (the police roadblocks come from three). */
const WANTED = 3;

/**
 * Registers the rocket scene.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerRocketStrikeHierro(context) {
  return context.showcase.register({
    name: 'rocket-strike-hierro',
    title: 'A rocket strike on a police roadblock in Barrio Hierro',
    description: 'The lead fires the rocket launcher from the aim view; the rocket trails smoke down the street and bursts on a police cruiser of the roadblock, the officers knocked down or drawing on him.',
    async run(game, tools) {
      const { commands } = game;
      const query = new URLSearchParams(globalThis.location?.search ?? '');
      const hours = Number(query.get('hours'));
      openScene(game, { hours: hours > 12 && hours < 19 ? hours : HOURS, traffic: 0.3, crowd: 1 });
      // Early, so the "+$" change has faded by the picture and only the total shows.
      const cash = game.systems.find('economy')?.cash;
      if (Number.isFinite(cash) && cash < CASH && commands.has(GAME_COMMANDS.ECONOMY_ADD_MONEY)) {
        commands.run(GAME_COMMANDS.ECONOMY_ADD_MONEY, { amount: CASH - cash, reason: 'showcase' });
      }
      const street = hierroStreet(game, numberOr(query.get('pick'), STREET.pick), numberOr(query.get('t'), STREET.along));
      const lead = street.at(numberOr(query.get('leadside'), LEAD_SIDE), 0);
      const marks = ROADBLOCK.map(([ahead, side, turn]) => ({ at: street.at(side, ahead), heading: street.compass + Math.PI + turn }));
      const target = marks[0].at;
      const facing = Math.atan2(target.x - lead.x, -(target.z - lead.z));
      await placeLead(game, tools, lead, -facing);
      commands.run(GAME_COMMANDS.PLAYER_GIVE_WEAPON, { weaponId: 'rocket_launcher', ammo: 4 });
      const roadblock = placeRoadblock(game, marks);
      const lights = () => roadblock.update(game);
      tools.advance(0.4);
      lights();
      clearAroundLead(game, 4);
      game.input.setVirtual('aim', true);
      tools.advance(0.6);
      lights();
      clearAroundLead(game, 3);
      const step = numberOr(query.get('step'), MISSION.startIndex);
      if (commands.has(GAME_COMMANDS.MISSION_START)) commands.run(GAME_COMMANDS.MISSION_START, { ...MISSION, startIndex: step, skipIntro: true });
      tools.advance(Math.max(0, 0.6 - OFFICERS_LEAD_SECONDS));
      lights();
      const dispatch = game.systems.find('policeDispatch');
      if (query.get('officers') !== '0' && typeof dispatch?.spawnUnit === 'function') {
        for (const [ahead, side] of OFFICERS) {
          const at = street.at(side, ahead);
          dispatch.spawnUnit('beat_officer', { x: at.x, y: groundAt(game, at.x, at.z), z: at.z }, street.compass + Math.PI);
        }
      }
      if (commands.has(GAME_COMMANDS.WANTED_SET_LEVEL)) commands.run(GAME_COMMANDS.WANTED_SET_LEVEL, { level: numberOr(query.get('wanted'), WANTED) });
      tools.advance(OFFICERS_LEAD_SECONDS);
      lights();
      clearLineOfFire(game, lead, target, roadblock.ids);
      // Fire: the rocket flies the whole way (55 m/s, about 0.35 s to the cruiser) and bursts on it;
      // the picture is the instant after the impact, the trail unbroken from the muzzle to the fireball.
      const fleet = game.systems.get('vehicles');
      const hit = roadblock.ids[0];
      roadblock.shield(game, true);
      game.input.setVirtual('attack', true);
      tools.advance(0.06);
      game.input.setVirtual('attack', false);
      if (query.get('view') !== 'aim') sideView(game, lead, target, query);
      for (let flown = 0; flown < MAX_FLIGHT_SECONDS && !fleet?.get(hit)?.wrecked; flown += FLIGHT_STEP_SECONDS) {
        tools.advance(FLIGHT_STEP_SECONDS);
        lights();
      }
      // A rocket that met nothing (it never should once the line is clear) still ends at the cruiser.
      if (fleet?.get(hit) && !fleet.get(hit).wrecked && typeof fleet.damage === 'function') fleet.damage(hit, 1e6, 'explosion');
      tools.advance(numberOr(query.get('blast'), BLAST_SECONDS));
      roadblock.shield(game, false);
      lights();
      if (commands.has('effects/freeze')) commands.run('effects/freeze', { after: 0 });
    },
  });
}

/**
 * Parks the roadblock's cruisers (police-tagged, handbrake on, light bars on steady burn, as
 * police/roadblocks.js parks them) and clears other cars round them. Returns their ids, `update`
 * (keeps the bars lit; a wrecked car's bar goes dark) and `shield` (keeps the second cruiser in one
 * piece through the blast beside it: it stands inside the rocket's 9 m radius).
 */
function placeRoadblock(game, marks) {
  const fleet = game.systems.get('vehicles');
  const cars = [];
  for (const mark of marks) {
    clearCarsAround(game, mark.at, ROADBLOCK_CLEARANCE);
    const id = fleet?.spawn({
      modelId: 'police_cruiser', position: { x: mark.at.x, y: groundAt(game, mark.at.x, mark.at.z), z: mark.at.z }, heading: mark.heading, parked: true, ownerSystem: 'showcase',
    });
    const record = id === null || id === undefined ? null : fleet.get(id);
    if (!record) continue;
    game.entities.addTag(record.entity, ENTITY_TAGS.POLICE);
    record.controls.handbrake = 1;
    cars.push({ id, record, siren: record.rig ? createSirenLights(record.rig, cars.length * 0.5) : null });
  }
  return {
    ids: cars.map((car) => car.id),
    update(context) {
      const camera = context.view?.camera?.position;
      for (const car of cars) {
        if (!car.siren) continue;
        const gone = !fleet.get(car.id) || fleet.get(car.id).wrecked || (car.record.entity.data.health ?? 1) <= 0;
        if (gone) {
          releaseSirenLights(car.siren, context.atmosphere);
          car.siren = null;
          continue;
        }
        const p = car.record.entity.position;
        const near = camera ? Math.hypot(p.x - camera.x, p.z - camera.z) : true;
        updateSirenLights(car.siren, 1 / 60, true, context.atmosphere, near, true);
      }
    },
    shield(context, on) {
      for (const car of cars.slice(1)) {
        const data = car.record.entity.data;
        if (!data?.maxHealth) continue;
        data.health = on ? data.maxHealth * 40 : Math.min(data.health, data.maxHealth);
      }
    },
  };
}

/** Removes the cars (not police, not the lead's) within `radius` metres of a point. */
function clearCarsAround(game, at, radius) {
  const fleet = game.systems.get('vehicles');
  const found = [];
  game.entities.within(at.x, at.z, radius + 3, { kind: 'vehicle' }, found);
  for (const entity of found) {
    if (entity.tags.has('police') || entity.tags.has('player')) continue;
    if (Math.hypot(entity.position.x - at.x, entity.position.z - at.z) < radius + (entity.radius ?? 2)) fleet?.remove(entity.id);
  }
}

/**
 * Clears the rocket's line from the lead to the target: cars (not the roadblock's, not the
 * police's) and passers-by (not officers) within LINE_CLEARANCE of it, so the rocket flies the whole way.
 */
function clearLineOfFire(game, lead, target, keep) {
  const fleet = game.systems.get('vehicles');
  const crowd = game.systems.find('pedestrians');
  const dx = target.x - lead.x;
  const dz = target.z - lead.z;
  const length = Math.hypot(dx, dz) || 1;
  const offLine = (x, z) => {
    const t = Math.max(0, Math.min(1, ((x - lead.x) * dx + (z - lead.z) * dz) / (length * length)));
    return Math.hypot(x - (lead.x + dx * t), z - (lead.z + dz * t));
  };
  const found = [];
  game.entities.within((lead.x + target.x) / 2, (lead.z + target.z) / 2, length / 2 + LINE_CLEARANCE + 3, { kind: 'vehicle' }, found);
  for (const entity of found) {
    if (keep.includes(entity.id) || entity.tags.has('police') || entity.tags.has('player')) continue;
    if (offLine(entity.position.x, entity.position.z) < LINE_CLEARANCE + (entity.radius ?? 2)) fleet?.remove(entity.id);
  }
  if (typeof crowd?.removePerson !== 'function') return;
  for (const person of [...(crowd.people ?? [])]) {
    if (person.entity?.data?.missionEnemy || person.entity?.tags?.has?.('police')) continue;
    if (offLine(person.x, person.z) < LINE_CLEARANCE) crowd.removePerson(person.id);
  }
}

/**
 * Holds the camera behind-right of the lead, off the aim line (SIDE_VIEW; `&camright=`, `&camback=`, `&camlook=`,
 * `&camfov=` for takes), looking along the line the rocket flies.
 */
function sideView(game, lead, target, query) {
  const dx = target.x - lead.x;
  const dz = target.z - lead.z;
  const length = Math.hypot(dx, dz) || 1;
  const forward = { x: dx / length, z: dz / length };
  const right = { x: -forward.z, z: forward.x };
  const across = numberOr(query.get('camright'), SIDE_VIEW.right);
  const back = numberOr(query.get('camback'), SIDE_VIEW.back);
  const eye = { x: lead.x + right.x * across - forward.x * back, z: lead.z + right.z * across - forward.z * back };
  const ahead = numberOr(query.get('camlook'), SIDE_VIEW.look);
  const left = numberOr(query.get('camleft'), SIDE_VIEW.lookLeft);
  const look = { x: lead.x + forward.x * ahead - right.x * left, z: lead.z + forward.z * ahead - right.z * left };
  cutCamera(
    game,
    { x: eye.x, y: groundAt(game, eye.x, eye.z) + numberOr(query.get('camheight'), SIDE_VIEW.height), z: eye.z },
    { x: look.x, y: groundAt(game, look.x, look.z) + numberOr(query.get('camlookheight'), SIDE_VIEW.lookHeight), z: look.z },
    numberOr(query.get('camfov'), SIDE_VIEW.fieldOfView),
  );
}

/** A number from the page query, or the fallback. */
function numberOr(given, fallback) {
  const value = Number(given);
  return given !== null && Number.isFinite(value) ? value : fallback;
}
