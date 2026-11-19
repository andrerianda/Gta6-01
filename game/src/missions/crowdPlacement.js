// Stands a member of the pedestrian crowd at an exact point, even where the crowd has no
// pavement route (the port quay, a yard), through the crowd's placeAt. A crowd without placeAt
// whose spawnAt finds no route within 25 m gets the person made on the nearest route edge of
// the whole graph and moved to the point; standing ('chat' with an endless timer) they stay put,
// and the crowd draws them where their x, z say. Used for givers, their company and enemies.

/**
 * The id of the route edge nearest a point (by its polyline's vertices), or -1.
 * @param {{edges?: {points: ArrayLike<number>}[]}} routes The crowd's walking routes.
 */
export function nearestRouteEdge(routes, x, z) {
  const edges = routes?.edges;
  if (!edges) return -1;
  let best = -1, bestGap = Infinity;
  for (let id = 0; id < edges.length; id += 1) {
    const p = edges[id].points;
    for (let i = 0; i + 1 < p.length; i += 2) {
      const gap = (p[i] - x) * (p[i] - x) + (p[i + 1] - z) * (p[i + 1] - z);
      if (gap < bestGap) { bestGap = gap; best = id; }
    }
  }
  return best;
}

const RINGS = [1.5, 3, 4.5, 6, 8, 10, 13];
const TURNS = 12;

/**
 * The nearest point to x, z that is not on a road (rings of 1.5 to 13 m), or null when there is
 * none: where mission people stand so that traffic does not run them down (the port's quay road).
 * @param {(x: number, z: number) => boolean} onRoad True on a carriageway, junction or crossing.
 */
export function offCarriageway(onRoad, x, z) {
  if (!onRoad(x, z)) return { x, z };
  for (const r of RINGS) {
    for (let i = 0; i < TURNS; i += 1) {
      const a = (i / TURNS) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!onRoad(px, pz)) return { x: px, z: pz };
    }
  }
  return null;
}

/** Puts a crowd person at x, z now (the crowd keeps them there while they stand). */
export function moveCrowdPerson(person, x, z) {
  person.x = x;
  person.z = z;
  if (person.entity?.position) { person.entity.position.x = x; person.entity.position.z = z; }
}

/**
 * Stands one person up near (or, with exact, at) a point.
 * @param {object|null} simulation pedestrians.simulation.
 * @param {string|object} profile An archetype id or a profile of the same shape.
 * @param {number} x
 * @param {number} z
 * @param {{mode?: string, extra?: object, exact?: boolean}} [how] exact: always at x, z; otherwise
 *   on the pavement point nearest x, z when one is within 25 m, at x, z when none is.
 * @returns {object|null} The person.
 */
export function standInCrowd(simulation, profile, x, z, { mode = 'chat', extra = null, exact = false, heading = NaN } = {}) {
  if (!simulation) return null;
  // The crowd's own exact placement (pedestrians' placeAt: no route needed) when it has one.
  const placeExactly = exact && typeof simulation.placeAt === 'function';
  let person = placeExactly ? simulation.placeAt(profile, x, z, { mode, heading, tags: extra?.tags, data: extra?.data })
    : typeof simulation.spawnAt === 'function' ? simulation.spawnAt(profile, x, z, mode, extra) : null;
  let far = false;
  if (!person && typeof simulation.spawn === 'function' && typeof simulation.routes?.locate === 'function') {
    const edge = nearestRouteEdge(simulation.routes, x, z);
    if (edge >= 0) person = simulation.spawn(profile, edge, true, simulation.routes.locate(edge, true, x, z), mode, extra);
    far = Boolean(person);
  }
  if (!person) return null;
  if (mode === 'chat') person.timer = Infinity;
  if (Number.isFinite(heading)) person.facing = heading;
  // Exactly there (placeAt keeps 1.5 m from anyone and 2.5 m from the lead; a giver stands closer).
  if (exact || far) moveCrowdPerson(person, x, z);
  return person;
}
