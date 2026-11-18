// The fight objectives of the story missions: eliminate, brawl and subdue end when every wave
// of enemies is down; defend and survive hold a place for their seconds while waves keep
// coming. Enemies are real squads from the world (o.world.spawnSquad and fightSquad, built on
// missionEnemies.js); without them the place is simply held for the seconds. Brawls and
// subdues are fists-only fights. Same contract as every kind in objectiveKinds.js.
import { DONE, PENDING, placeOf, planeDistance } from './objectiveBasics.js';

/** The waves of enemies an objective sends, each a list of {crew, count, weapon?} groups. */
export function wavesOf(mode, params) {
  if (mode === 'subdue') return typeof params.target === 'string' ? [[{ crew: params.target, count: 1 }]] : [];
  if (mode === 'defend') return (params.waves || []).map((wave) => [wave]);
  const enemies = (params.enemies || []).slice();
  if (params.boss?.character) enemies.unshift({ crew: params.boss.crew ?? 'circle_enforcer', count: 1 });
  // eliminate with waves: each catalog group is a wave; otherwise one fight with everyone.
  if (mode === 'eliminate' && Number(params.waves) > 1 && enemies.length > 1) return enemies.map((group) => [group]);
  return enemies.length ? [enemies] : [];
}

/**
 * A fight at a place.
 * @param {'eliminate'|'brawl'|'subdue'|'defend'|'survive'} mode
 * @param {number} defaultSeconds How long a timed fight (or one without enemies) lasts.
 */
export function combatKind(mode, defaultSeconds) {
  const melee = mode === 'brawl' || mode === 'subdue';
  const timed = mode === 'defend' || mode === 'survive';
  function nextWave(o) {
    if (o.state.squad) o.world.releaseSquad?.(o.state.squad);
    o.state.wave += 1;
    o.state.waveTime = 0;
    const waves = o.state.waves;
    const groups = timed ? waves[o.state.wave % Math.max(1, waves.length)] : waves[o.state.wave];
    o.state.squad = groups && o.world.spawnSquad ? o.world.spawnSquad(groups, o.state.place, { melee, limit: timed ? 6 : 8, distance: timed ? 22 : 14 }) : null;
    o.state.foe = null;
  }
  return {
    begin(o) {
      const named = o.params.at || o.params.landmark || (typeof o.params.target === 'string' ? o.params.target : null);
      const p = o.world.player();
      o.target = placeOf(o, named);
      // No place of its own and the run's place is out of reach (after a checkpoint run, or
      // started from a checkpoint): the enemies come to where the lead stands.
      if (!o.target || (!(named && o.world.place(named)) && planeDistance(p, o.target) > 40)) o.target = { x: p.x, y: p.y, z: p.z, frontX: 0, frontZ: 1 };
      o.memory.place = o.target;
      o.state.place = o.target;
      o.state.held = 0;
      o.state.seconds = o.params.seconds ?? defaultSeconds;
      o.state.waves = wavesOf(mode, o.params);
      o.state.wave = -1;
      o.state.squad = null;
      o.state.engaged = false;
      o.state.pause = 0;
    },
    update(o, dt) {
      const player = o.world.player();
      const place = o.state.place;
      if (!place) return DONE;
      const gap = planeDistance(player, place);
      if (!o.state.engaged) {
        if (gap > 40) return PENDING;
        o.state.engaged = true;
        o.world.help(melee ? 'Fists and melee weapons only' : timed ? 'Hold this place' : null);
        nextWave(o);
      }
      if (gap > 90) return 'left_area';
      const squad = o.state.squad;
      const real = squad && squad.total > 0;
      const standing = real ? o.world.fightSquad(squad, dt) : 0;
      o.state.held += dt;
      o.state.waveTime += dt;
      if (real && standing > 0) {
        // The HUD and the beam follow the nearest enemy still standing.
        const foe = o.world.nearestEnemy(squad, player);
        if (foe && foe !== o.state.foe) { o.state.foe = foe; o.target = foe.position; o.retarget = true; }
      }
      if (timed) {
        const between = o.params.secondsBetweenWaves ?? 20;
        if (real && (standing === 0 ? o.state.waveTime > 4 : o.state.waveTime > between * 3)) nextWave(o);
        return o.state.held >= o.state.seconds ? DONE : PENDING;
      }
      if (!real) return o.state.held >= o.state.seconds ? DONE : PENDING;
      if (standing > 0) return PENDING;
      if (o.state.wave + 1 >= o.state.waves.length) return DONE;
      o.state.pause += dt;
      if (o.state.pause < 3) return PENDING;
      o.state.pause = 0;
      nextWave(o);
      return PENDING;
    },
    end(o) {
      if (o.state.squad) o.world.releaseSquad?.(o.state.squad);
      o.state.squad = null;
      o.world.help(null);
    },
  };
}
