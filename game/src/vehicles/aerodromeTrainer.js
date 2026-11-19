// The Gaviota T-2 trainer that stands at Aeródromo Los Pantanos in free roam: parked on the
// runway's south shoulder near the terminal end, nose towards the runway, unlocked. It appears when
// the lead comes within sight of the field and is put back when it is gone (flown off, wrecked)
// and the lead is far away. Two more Gaviota stand beside it in a parking row along the shoulder,
// kept by the same rule (real fleet vehicles, unlocked: the common light aircraft). Also reads the runway out of the city plan for the launch flags and
// the flight deck: its two ends, heading and height.

/**
 * The airstrip's runway from the city plan.
 * @param {{special?: {areas?: object[]}, specialAreas?: object[]} | null} plan The city plan.
 * @returns {{x0: number, z0: number, x1: number, z1: number, y: number, width: number, length: number, heading: number} | null}
 *   Its two ends (west first, as planned), height, and the compass heading (0 = -Z, clockwise)
 *   of a take-off from end 0 towards end 1.
 */
export function runwayOf(plan) {
  const areas = plan?.special?.areas ?? plan?.specialAreas ?? plan?.areas ?? [];
  const area = Array.isArray(areas) ? areas.find((each) => each && each.kind === 'runway' && Array.isArray(each.line)) : null;
  if (!area) return null;
  const [x0, z0, x1, z1] = area.line;
  const length = Math.hypot(x1 - x0, z1 - z0);
  if (!(length > 50)) return null;
  return { x0, z0, x1, z1, y: area.y ?? 0, width: area.width ?? 20, length, heading: Math.atan2(x1 - x0, -(z1 - z0)) };
}

/** The trainer's catalog id. */
export const TRAINER_MODEL = 'gaviota_t2';
/** Metres from the stand within which the trainer is put out, and beyond which a lost one is replaced. */
export const TRAINER_RANGE = Object.freeze({ appear: 700, replaceBeyond: 450, strayed: 120 });
/** Metres from the runway's centreline to the stand, and from the runway's terminal end along it. */
const STAND = Object.freeze({ aside: 16.5, along: 70 });

/**
 * Where an aircraft lines up for take-off: `inset` metres in from one end, heading for the other.
 * @param {ReturnType<typeof runwayOf>} runway
 * @param {0 | 1} [end] The end to start from (default 1, the terminal end, taking off towards end 0).
 * @param {number} [inset] Metres in from the end.
 * @returns {{x: number, z: number, y: number, heading: number}}
 */
export function runwayThreshold(runway, end = 1, inset = 22) {
  const ux = (runway.x1 - runway.x0) / runway.length, uz = (runway.z1 - runway.z0) / runway.length;
  if (end === 0) return { x: runway.x0 + ux * inset, z: runway.z0 + uz * inset, y: runway.y, heading: runway.heading };
  return { x: runway.x1 - ux * inset, z: runway.z1 - uz * inset, y: runway.y, heading: wrapAngle(runway.heading + Math.PI) };
}

/**
 * The trainer's stand: on the shoulder on the side of `towards` (the airstrip's buildings), nose
 * to the runway.
 * @param {ReturnType<typeof runwayOf>} runway
 * @param {{x: number, z: number} | null} towards
 * @returns {{x: number, z: number, heading: number}}
 */
export function trainerStand(runway, towards) {
  const ux = (runway.x1 - runway.x0) / runway.length, uz = (runway.z1 - runway.z0) / runway.length;
  let nx = -uz, nz = ux;
  const cx = runway.x1 - ux * STAND.along, cz = runway.z1 - uz * STAND.along;
  if (towards && (towards.x - cx) * nx + (towards.z - cz) * nz < 0) { nx = -nx; nz = -nz; }
  // Facing the centreline: the heading whose forward (sin h, -cos h) is -n.
  return { x: cx + nx * STAND.aside, z: cz + nz * STAND.aside, heading: Math.atan2(-nx, nz) };
}

/** The parking row: how many Gaviota stand at the field in all, and the metres between their stands (span 8.6 m). */
export const TRAINER_ROW = Object.freeze({ count: 3, spacing: 13 });

/**
 * The whole parking row: the trainer's stand first, then the others beside it along the runway's
 * shoulder, away from the terminal end, all nose to the runway.
 * @param {ReturnType<typeof runwayOf>} runway
 * @param {{x: number, z: number} | null} towards
 * @param {number} [count]
 * @returns {Array<{x: number, z: number, heading: number}>}
 */
export function trainerRow(runway, towards, count = TRAINER_ROW.count) {
  const first = trainerStand(runway, towards);
  const ux = (runway.x1 - runway.x0) / runway.length, uz = (runway.z1 - runway.z0) / runway.length;
  const row = [first];
  for (let i = 1; i < count; i += 1) row.push({ x: first.x - ux * TRAINER_ROW.spacing * i, z: first.z - uz * TRAINER_ROW.spacing * i, heading: first.heading });
  return row;
}

/**
 * Keeps the trainers at the field: the one on the first stand and the rest of the parking row,
 * each a real, unlocked fleet vehicle kept by the same rule.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {{spawn: Function, remove: Function, get: Function}} roster The vehicle roster.
 */
export function createAerodromeTrainer(context, roster) {
  let runway = null, stand = null, planned = false;
  let loading = false, wait = 0;
  /** @type {Array<{stand: {x: number, z: number, heading: number}, vehicleId: number | string | null}>} */
  let slots = [];

  function plan() {
    if (planned) return;
    const city = context.systems.find('openWorldCity');
    if (!city || !city.plan) return;
    planned = true;
    runway = runwayOf(city.plan);
    if (!runway) return;
    const landmark = (city.plan.landmarks ?? []).find((each) => each && each.kind === 'airstrip') ?? null;
    const at = landmark ? landmark.position ?? landmark.center ?? landmark : null;
    slots = trainerRow(runway, at && Number.isFinite(at.x) && Number.isFinite(at.z) ? at : null).map((each) => ({ stand: each, vehicleId: null }));
    stand = slots[0].stand;
  }

  // One stand of the row: puts its trainer out, or replaces a lost one while the lead is far away.
  function keep(slot, focus) {
    const here = slot.stand;
    const away = Math.hypot(focus.x - here.x, focus.z - here.z);
    const record = slot.vehicleId === null ? null : roster.get(slot.vehicleId);
    if (record) {
      const p = record.entity.position;
      const lost = record.wrecked || Math.hypot(p.x - here.x, p.z - here.z) > TRAINER_RANGE.strayed;
      if (!lost || away < TRAINER_RANGE.replaceBeyond || record.entity.data.driverId !== null) return;
      // Gone from its stand with the lead far from the field: a wreck or an abandoned one out of
      // the lead's sight is cleared away, one still near the lead is left to them.
      if (Math.hypot(p.x - focus.x, p.z - focus.z) > TRAINER_RANGE.replaceBeyond) roster.remove(slot.vehicleId);
      slot.vehicleId = null;
      return;
    }
    slot.vehicleId = null;
    if (away > TRAINER_RANGE.appear || !modelReady()) return;
    slot.vehicleId = roster.spawn({ modelId: TRAINER_MODEL, position: { x: here.x, z: here.z }, heading: here.heading, parked: true, ownerSystem: 'vehicles' }) ?? null;
  }

  /** Whether the model is in memory; starts loading it once when it is registered but not yet in. */
  function modelReady() {
    const assets = context.assets;
    if (!assets || typeof assets.has !== 'function') return true;
    if (assets.has(TRAINER_MODEL)) return true;
    if (!assets.registry || !assets.registry[TRAINER_MODEL]) return true; // no model yet: the fleet's stand-in body
    if (!loading) {
      loading = true;
      Promise.resolve(assets.load([TRAINER_MODEL])).catch(() => { /* the stand-in body is used */ }).then(() => { loading = 'done'; });
    }
    return loading === 'done';
  }

  return {
    /** The runway ({x0, z0, x1, z1, y, width, length, heading}) or null before the city is planned. */
    get runway() { plan(); return runway; },
    /** Where the trainer stands ({x, z, heading}) or null. */
    get stand() { plan(); return stand; },
    /** The trainer's vehicle id while one is out, else null. */
    get vehicleId() { return slots[0]?.vehicleId ?? null; },
    /** The whole parking row: [{stand: {x, z, heading}, vehicleId}] (vehicleId null while not out); the first is the trainer. */
    get row() { plan(); return slots; },
    /**
     * Once a second: puts the trainers out, or replaces lost ones while the lead is far away.
     * @param {number} dt Step seconds.
     */
    update(dt) {
      wait -= dt;
      if (wait > 0) return;
      wait = 1;
      plan();
      if (!stand || context.launch?.shot) return;
      const focus = context.focus?.position;
      if (!focus) return;
      for (const slot of slots) keep(slot, focus);
    },
  };
}

function wrapAngle(angle) {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}
