// Stands a member of the pedestrian crowd at an exact point, even where the crowd has no
// pavement route (the port quay, a yard): the crowd's spawnAt only finds people a place on a
// route within 25 m. Without one the person is made on the nearest route edge of the whole
// graph and moved to the point; standing ('chat' with an endless timer) they stay put, and the
// crowd draws them where their x, z say. Used for givers, their company and mission enemies.

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
export function standInCrowd(simulation, profile, x, z, { mode = 'chat', extra = null, exact = false } = {}) {
  if (!simulation) return null;
  let person = typeof simulation.spawnAt === 'function' ? simulation.spawnAt(profile, x, z, mode, extra) : null;
  let far = false;
  if (!person && typeof simulation.spawn === 'function' && typeof simulation.routes?.locate === 'function') {
    const edge = nearestRouteEdge(simulation.routes, x, z);
    if (edge >= 0) person = simulation.spawn(profile, edge, true, simulation.routes.locate(edge, true, x, z), mode, extra);
    far = Boolean(person);
  }
  if (!person) return null;
  if (mode === 'chat') person.timer = Infinity;
  if (exact || far) moveCrowdPerson(person, x, z);
  return person;
}
