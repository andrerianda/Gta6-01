// Resolves the order in which game systems initialise: every system after the systems it depends
// on, and otherwise in the order of the manifest. Pure, so Node can test it.

/**
 * @typedef {Object} OrderedSystemEntry
 * @property {string} name The system's name.
 * @property {string[]} [dependsOn] Names that must come first.
 */

/**
 * Sorts systems so that dependencies come first, keeping the given order wherever the
 * dependencies allow (a stable topological sort).
 * @template {OrderedSystemEntry} T
 * @param {T[]} systems The systems in manifest order.
 * @returns {{ order: T[], problems: string[] }} The init order, and what was wrong with the
 *   declarations: a dependency nobody provides (ignored), or a cycle (broken at the dependency
 *   that closes it, so every system is still placed).
 */
export function resolveSystemInitOrder(systems) {
  const problems = [];
  const byName = new Map();
  for (const system of systems) byName.set(system.name, system);

  /** @type {Map<string, string[]>} */
  const waitingFor = new Map();
  for (const system of systems) {
    const known = [];
    for (const dependency of system.dependsOn ?? []) {
      if (dependency === system.name) continue;
      if (byName.has(dependency)) known.push(dependency);
      else problems.push(`"${system.name}" depends on "${dependency}", which is not in the manifest`);
    }
    waitingFor.set(system.name, known);
  }

  // Walk the manifest in order; before a system is placed, its dependencies are pulled forward
  // (and theirs before them). The result differs from the manifest only where a dependency
  // forces it.
  const order = [];
  const placed = new Set();
  /** The systems being placed right now, outermost first: a name met again here is a cycle. */
  const path = [];
  const reportedCycles = new Set();
  const place = (system) => {
    if (placed.has(system.name)) return;
    path.push(system.name);
    for (const dependency of waitingFor.get(system.name)) {
      const seenAt = path.indexOf(dependency);
      if (seenAt !== -1) {
        const cycle = [...path.slice(seenAt), dependency].join(' -> ');
        const signature = path.slice(seenAt).sort().join(',');
        if (!reportedCycles.has(signature)) {
          reportedCycles.add(signature);
          problems.push(`dependency cycle: ${cycle}`);
        }
        continue;
      }
      place(byName.get(dependency));
    }
    path.pop();
    order.push(system);
    placed.add(system.name);
  };
  for (const system of systems) place(system);
  return { order, problems };
}
