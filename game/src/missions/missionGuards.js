// The stealth objectives' guards in the running game: members of a crew (gangsAndFactions
// FACTION_MEMBERS, in their faction's colours) stood exactly on their posts through the
// pedestrian crowd (crowdPlacement.js), held there facing where the objective wants them to
// look (they turn with their walk controller), their real position and facing read back each
// step, walls and parked cars between a guard's eyes and the lead (physics line of sight), the
// sight cones and alert marks drawn (guardSightView.js), and the survivors let go at the end.
import { memberProfile } from '../pedestrians/turfCrews.js';
import { MASK } from '../physics/collisionLayers.js';
import { standInCrowd } from './crowdPlacement.js';
import { fairPostNear, yawToward } from './guardVision.js';
import { createGuardSightView } from './guardSightView.js';

const EYE_HEIGHT = 1.6;
const OUT_OF_ACTION = new Set(['dead', 'down', 'flee', 'cower']);
const hit = {};

/**
 * Creates the mission guards over the game context.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {{footing: (point: {x: number, z: number}) => {x: number, y: number, z: number},
 *   onRoad?: (x: number, z: number) => boolean}} how
 *   footing: the nearest spot off the carriageway with its ground height; onRoad: where traffic
 *   runs (a post on the road moves along its outward line, guardVision.fairPostSpot).
 */
export function createMissionGuards(context, { footing, onRoad }) {
  const crowd = () => context.systems.find('pedestrians')?.simulation ?? null;
  const physics = () => context.systems.find('physics') ?? null;
  const ground = (x, z) => context.systems.find('openWorldCity')?.groundHeightAt?.(x, z) ?? 0;
  const step = () => context.simulation?.stepSeconds ?? 1 / 60;
  let view = null;

  function clip(x, y, z, dx, dz, max) {
    const world = physics();
    if (!world?.raycast) return max;
    return world.raycast(x, y, z, dx, 0, dz, max, MASK.SIGHT, null, hit) ? Math.min(max, hit.distance) : max;
  }

  function sightView() {
    if (!view && context.view?.layers?.dynamic) view = createGuardSightView(context.view.layers.dynamic, { groundHeightAt: ground, clip });
    return view;
  }

  return {
    /**
     * Stands a guard of a crew member on each post (guardVision.guardPosts).
     * @returns {object[]} The guards the stealth objective watches with.
     */
    post(memberId, posts, sight = {}) {
      const simulation = crowd();
      const catalog = context.content.find('gangsAndFactions');
      const member = catalog?.FACTION_MEMBERS?.[memberId];
      const faction = member && catalog.GANGS_AND_FACTIONS?.[member.faction];
      if (!simulation || !member || !faction) return [];
      const guards = [];
      // What became of each post (read by playtests through the stealth objective's state).
      guards.report = [];
      for (const spot of posts) {
        // Off the road along the post's own outward line, never onto the lead's sneak; a post
        // with no such spot is left out.
        const fair = onRoad && Number.isFinite(spot.baseX) ? fairPostNear(onRoad, spot) : spot;
        if (!fair) { guards.report.push({ x: spot.x, z: spot.z, result: 'no fair spot' }); continue; }
        const at = footing(fair);
        const lookIn = Number.isFinite(spot.checkX) ? yawToward(at.x, at.z, spot.checkX, spot.checkZ) : spot.lookIn;
        const person = standInCrowd(simulation, memberProfile(member, faction), at.x, at.z, {
          exact: true, heading: spot.lookOut,
          extra: { tags: [], data: { factionId: faction.id, memberId: member.id, missionEnemy: true, missionGuard: true } },
        });
        guards.report.push({ x: at.x, z: at.z, gap: fair.gap ?? null, result: person ? `person ${person.id}` : 'crowd refused' });
        if (!person) continue;
        guards.push({
          id: person.id, person, post: { ...spot, x: at.x, z: at.z, lookIn }, x: at.x, z: at.z, yaw: spot.lookOut, wantYaw: spot.lookOut,
          standing: true, suspicion: 0, alerted: false, seeing: false, lastX: NaN, lastZ: NaN, counted: false,
        });
      }
      sightView()?.configure(sight.range ?? 14, sight.degrees ?? 70);
      return guards;
    },
    /** Reads each guard's real place and facing, and whether they are still on watch. */
    refresh(guards) {
      for (const guard of guards) {
        const person = guard.person;
        const entity = person?.entity;
        guard.standing = Boolean(entity) && context.entities.get(guard.id) === entity && !OUT_OF_ACTION.has(person.mode)
          && !(entity.data?.health <= 0) && !person.dismissed;
        if (!guard.standing) continue;
        guard.x = person.x;
        guard.z = person.z;
        const yaw = person.body?.walker?.state?.yaw;
        guard.yaw = Number.isFinite(yaw) ? yaw : person.facing ?? guard.yaw;
      }
    },
    /** Turns the guards to where they want to look and draws their cones. */
    drive(guards) {
      for (const guard of guards) {
        if (!guard.standing) continue;
        const person = guard.person;
        if (person.mode === 'chat') person.timer = Infinity;
        person.facing = guard.wantYaw;
      }
      sightView()?.update(guards, step());
    },
    /** True when no wall or vehicle stands between a guard's eyes and the lead's chest. */
    canSee(guard, lead) {
      const world = physics();
      if (!world?.lineOfSight) return true;
      return world.lineOfSight(guard.x, ground(guard.x, guard.z) + EYE_HEIGHT, guard.z, lead.x, (lead.y ?? 0) + 1.2, lead.z, MASK.SIGHT);
    },
    /** True when nothing solid stands between two points at chest height (picking the sneak's way). */
    clearPath(a, b) {
      const world = physics();
      if (!world?.lineOfSight) return true;
      return world.lineOfSight(a.x, ground(a.x, a.z) + 1.2, a.z, b.x, ground(b.x, b.z) + 1.2, b.z, MASK.SOLID);
    },
    /** The guards go back to being people: they walk off and leave once out of view. */
    release(guards) {
      const simulation = crowd();
      for (const guard of guards) {
        if (!context.entities.get(guard.id)) continue;
        if (simulation?.removePerson?.(guard.id, { whenUnseen: true })) continue;
        guard.person.mode = 'walk';
      }
      guards.length = 0;
      view?.hide();
    },
    dispose() { view?.dispose(); view = null; },
  };
}
