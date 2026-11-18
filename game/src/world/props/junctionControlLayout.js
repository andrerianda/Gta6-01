// Junction control layout: where the traffic signals, walker signals, stop signs and street-name
// posts of a junction stand, from the city plan's node (arms, control, crosswalks) and its road
// segments. Pure: positions in plan metres and a rotation about +Y for objects of
// set_traffic_control, whose lenses and faces look towards -Z and whose mast arm reaches +X.
//
//   const items = layOutJunctionControls(node, plan.roads.segments);
//   // [{object: 'traffic_signal_mast', x, z, rotationY, nodeId, phase, role: 'vehicle'}, ...]
//
// Traffic keeps to the right (docs/CITY_PLAN.md): an approach's mast stands at the kerb on the
// driver's right just before the junction, its arm over the approach lanes and its heads looking
// at the oncoming drivers; walker signals face each other across every signalled arm; stop signs
// stand on the right of each approach that must stop; one street-name post on a corner.

/** Rotation about +Y that turns an object's -Z towards (dx, dz). */
export function rotationFacing(dx, dz) {
  return Math.atan2(-dx, -dz);
}

/**
 * The control objects of one junction.
 * @param {{id: number, x: number, z: number, control: string, arms: {segment: number, dx: number,
 *   dz: number, trim: number, phase: number, mustStop?: boolean}[], signal?: object}} node A plan node.
 * @param {Array<{halfWidth?: number, sidewalkLeft?: number, sidewalkRight?: number}>} segments plan.roads.segments.
 * @returns {{object: string, x: number, z: number, rotationY: number, nodeId: number, phase: number,
 *   role: 'vehicle' | 'walker' | 'sign'}[]}
 */
export function layOutJunctionControls(node, segments) {
  const items = [];
  const arms = node.arms ?? [];
  if (arms.length < 2) return items;
  const signals = node.control === 'signals' && node.signal;
  const stops = node.control === 'stop';
  for (const arm of arms) {
    const segment = segments[arm.segment] ?? {};
    const half = segment.halfWidth ?? 4;
    const length = Math.hypot(arm.dx, arm.dz) || 1;
    const dx = arm.dx / length;
    const dz = arm.dz / length;
    // The approach drives towards the node (-d); its right-hand kerb is towards (dz, -dx).
    const rx = dz;
    const rz = -dx;
    const trim = arm.trim ?? 8;
    // Every pole stands on the pavement past the junction's trim, 0.6 m or more behind the kerb.
    const kerbside = half + 0.95;
    if (signals) {
      const at = trim + 2.6;
      items.push({ object: 'traffic_signal_mast', x: node.x + dx * at + rx * kerbside, z: node.z + dz * at + rz * kerbside,
        rotationY: rotationFacing(dx, dz), nodeId: node.id, phase: arm.phase ?? -1, role: 'vehicle' });
      // Walker signals at both ends of the crosswalk over this arm, each looking across the road.
      const walk = trim + 0.9;
      for (const s of [1, -1]) {
        items.push({ object: 'pedestrian_signal', x: node.x + dx * walk + rx * s * kerbside, z: node.z + dz * walk + rz * s * kerbside,
          rotationY: rotationFacing(-rx * s, -rz * s), nodeId: node.id, phase: arm.phase ?? -1, role: 'walker' });
      }
    } else if (stops && arm.mustStop) {
      const at = trim + 1.2;
      const side = kerbside;
      items.push({ object: 'sign_octagon', x: node.x + dx * at + rx * side, z: node.z + dz * at + rz * side,
        rotationY: rotationFacing(dx, dz), nodeId: node.id, phase: -1, role: 'sign' });
    }
  }
  if (signals || stops) {
    // A name post at the corner between the first two arms: on arm 0's pavement just past the
    // trim, on the side towards arm 1 (the rounded kerb leaves the corner point itself on the
    // asphalt), its first blade along arm 0.
    const [a, b] = arms;
    const la = Math.hypot(a.dx, a.dz) || 1;
    const ax = a.dx / la; const az = a.dz / la;
    const ha = segments[a.segment]?.halfWidth ?? 4;
    const towardsB = Math.sign(b.dx * az - b.dz * ax) || 1;
    const at = (a.trim ?? 8) + 1.6;
    const side = (ha + 1.3) * towardsB;
    items.push({ object: 'street_name_post', x: node.x + ax * at + az * side, z: node.z + az * at - ax * side,
      rotationY: Math.atan2(-az, ax), nodeId: node.id, phase: -1, role: 'sign' });
  }
  return items;
}

/**
 * Drops the planting that stands within `clearance` metres of a lamp or a junction object, so a
 * palm never grows out of a lamp post.
 * @param {{x: number, z: number}[]} plants The planting layout.
 * @param {{x: number, z: number}[]} fixed Lamps and junction objects.
 * @param {number} [clearance] Metres.
 * @returns {object[]} The plants that keep their place.
 */
export function clearPlantingAround(plants, fixed, clearance = 2.2) {
  if (!fixed.length) return plants;
  const limit = clearance * clearance;
  return plants.filter((plant) => !fixed.some((item) => (item.x - plant.x) ** 2 + (item.z - plant.z) ** 2 < limit));
}
