// Where a mission's intro stands the lead, pure: the spot in front of the start's door from
// which every camera of the intro (the establishing shot, the push-ins, the reverse over the
// shoulder; cutsceneShots.js) and the follow camera that takes over afterwards see the lead and
// the giver with nothing thin in between. Lamp poles, signal posts and tree trunks along the
// kerb stood between the camera and the lead at the starts of m02 and m03 (QA bug 8). The
// candidates slide along the facade and a little nearer to or further from the door; each sight
// line that passes an obstacle circle costs, the follow camera's most, and the cheapest spot
// nearest the door wins. Headings follow three.js (0 faces -Z, growing to the left).
import { planCutsceneShots } from './cutsceneShots.js';

/** Slides along the facade (metres, right of the lead) and steps from the marker towards the door. */
const SLIDES = Object.freeze([0, 1.5, -1.5, 3, -3, 4.5, -4.5]);
const TOWARD_DOOR = Object.freeze([1.2, 0.6, 1.8]);
/** Clearance kept between a sight line and an obstacle circle, metres. */
const SIGHT_MARGIN = 0.3;
/** The shots tried: the establishing line, the lead's push-ins on both sides, a reverse. */
const PROBE_LINES = Object.freeze([{ speaker: 'giver' }, { speaker: 'lead' }, { speaker: 'lead' }, { speaker: 'giver' }]);

/**
 * Picks the clearest stage near a start point.
 * @param {{x: number, y: number, z: number, frontX: number, frontZ: number}} point The start (marker) with
 *   the unit direction from the door out to the street.
 * @param {{x: number, z: number, radius: number}[]} obstacles Obstacle circles round the point.
 * @returns {{position: {x: number, y: number, z: number}, heading: number, blocked: number}}
 */
export function pickClearStage(point, obstacles = []) {
  const fx = point.frontX, fz = point.frontZ;
  const heading = Math.atan2(-fx, -fz);
  const rx = -fz, rz = fx;
  let best = null;
  for (const step of TOWARD_DOOR) {
    for (const slide of SLIDES) {
      const x = point.x - fx * step + rx * slide, z = point.z - fz * step + rz * slide;
      const blocked = sightCost({ x, y: point.y, z, heading }, obstacles);
      if (!best || blocked < best.blocked) best = { position: { x, y: point.y, z }, heading, blocked };
      if (blocked === 0) return best;
    }
  }
  return best;
}

/** Sum of the blocked sight lines from the intro's cameras and the follow camera, 0 when clear. */
export function sightCost(lead, obstacles) {
  const fx = -Math.sin(lead.heading), fz = -Math.cos(lead.heading);
  const rx = -fz, rz = fx;
  const at = (ahead, right) => ({ x: lead.x + fx * ahead + rx * right, z: lead.z + fz * ahead + rz * right });
  const head = at(0, 0), giver = at(2.4, -0.35);
  let cost = 0;
  for (const spot of [head, giver]) if (inside(spot, obstacles, 0.45)) cost += 4;
  for (const shot of planCutsceneShots({ ...lead, y: 0 }, PROBE_LINES, 'lead')) {
    if (crosses(shot.from, shot.lookFrom, obstacles)) cost += 1;
    if (crosses(shot.to, shot.lookTo, obstacles)) cost += 1;
  }
  // The follow camera after the intro: about 2.3 m behind the lead, a little right.
  if (crosses(at(-2.3, 0.5), head, obstacles)) cost += 3;
  return cost;
}

function inside(spot, obstacles, margin) {
  for (const o of obstacles) if (Math.hypot(spot.x - o.x, spot.z - o.z) < (o.radius || 0.2) + margin) return true;
  return false;
}

/** True when the ground track of a sight line passes within an obstacle circle (plus margin). */
function crosses(a, b, obstacles) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const length2 = dx * dx + dz * dz || 1e-6;
  for (const o of obstacles) {
    const t = Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.z - a.z) * dz) / length2));
    const px = a.x + dx * t - o.x, pz = a.z + dz * t - o.z;
    const reach = (o.radius || 0.2) + SIGHT_MARGIN;
    if (px * px + pz * pz < reach * reach) return true;
  }
  return false;
}
