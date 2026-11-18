// The camera plan of a dialogue cutscene, pure: one shot per line, framed on the lead from
// where they stand. The first line opens on a high crane shot that sinks towards the lead; the
// lead's own lines are a slow push-in from the front three-quarter; any other speaker (a voice
// on the phone, someone off screen) is a reverse over the lead's shoulder that drifts sideways.
// Headings follow three.js: 0 faces north (-Z) and grows to the left.

/**
 * Plans the shots for a list of lines.
 * @param {{x: number, y: number, z: number, heading: number, inVehicle?: boolean}} lead
 * @param {{speaker: string | null, line: string}[]} lines
 * @param {string} leadId The character id of the lead.
 * @returns {{from: object, to: object, lookFrom: object, lookTo: object, fieldOfView: number}[]}
 */
export function planCutsceneShots(lead, lines, leadId) {
  const fx = -Math.sin(lead.heading), fz = -Math.cos(lead.heading);     // forward
  const rx = -fz, rz = fx;                                               // right
  const eye = lead.inVehicle ? 1.3 : 1.55;
  const at = (ahead, right, up) => ({ x: lead.x + fx * ahead + rx * right, y: lead.y + up, z: lead.z + fz * ahead + rz * right });
  const head = at(0, 0, eye);
  const shots = [];
  lines.forEach((line, index) => {
    if (index === 0) {
      shots.push({ from: at(11, -7, 8), to: at(8.5, -5, 4.2), lookFrom: at(0, 0, 1.2), lookTo: head, fieldOfView: 50 });
    } else if (!line.speaker || line.speaker === leadId) {
      const side = index % 2 ? 1 : -1;
      shots.push({ from: at(3.4, side * 1.3, eye + 0.15), to: at(2.6, side * 1.0, eye + 0.1), lookFrom: head, lookTo: head, fieldOfView: 40 });
    } else {
      // Over the lead's shoulder onto the giver, who stands 2.4 m in front (missionGivers.stage).
      shots.push({ from: at(-2.8, 1.1, eye + 0.35), to: at(-2.6, 1.8, eye + 0.3), lookFrom: at(2.4, 0.1, 1.45), lookTo: at(2.4, 0.45, 1.5), fieldOfView: 46 });
    }
  });
  return shots;
}

/** Seconds a subtitle line stays up: the catalog's minimum, more for long lines. */
export function lineSeconds(text, minimum = 3.6) {
  const words = String(text).split(/\s+/).filter(Boolean).length;
  return Math.max(minimum, 1.2 + words * 0.34);
}
