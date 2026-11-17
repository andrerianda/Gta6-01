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
 *   declarations: a dependency nobody provides (ignored), or a cycle (its members are placed in
 *   manifest order after everything else).
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

  const order = [];
  const placed = new Set();
  const remaining = systems.slice();
  while (remaining.length > 0) {
    // Always take the earliest system of the manifest whose dependencies are all placed, so the
    // result differs from the manifest order only where a dependency forces it.
    const index = remaining.findIndex((system) =>
      waitingFor.get(system.name).every((dependency) => placed.has(dependency)));
    if (index === -1) {
      problems.push(`dependency cycle: ${describeCycle(remaining, waitingFor, placed)}`);
      for (const system of remaining) order.push(system);
      break;
    }
    const [system] = remaining.splice(index, 1);
    order.push(system);
    placed.add(system.name);
  }
  return { order, problems };
}

/** Walks unmet dependencies from the first stuck system until a name repeats. */
function describeCycle(stuck, waitingFor, placed) {
  const path = [stuck[0].name];
  for (;;) {
    const current = path[path.length - 1];
    const blocker = waitingFor.get(current).find((dependency) => !placed.has(dependency));
    if (blocker === undefined) return path.join(' -> ');
    const seenAt = path.indexOf(blocker);
    path.push(blocker);
    if (seenAt !== -1) return path.slice(seenAt).join(' -> ');
  }
}
