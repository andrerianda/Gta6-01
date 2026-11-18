// The pump shotgun's rack between shots (owner, 09:15: "between shots the support hand racks the
// pump back and forward with a visible kick"): a moment after the shot the model's pump node
// (pump_shotgun_pump) slides about 7 cm back towards the shooter and forward again over the
// stance's cycleSeconds, and the support hand rides it: the walker's off-hand grip
// (setWeaponGrip) moves with the pump. When the character run-time offers a 'rack' action
// it is played as well (asked once, without throwing when it is missing).

/** How far the pump travels back (metres, model frame +Z) and the pause after the shot. */
export const PUMP_TRAVEL = 0.07;
export const RACK_DELAY = 0.1;

/**
 * How far back the pump is (0 forward .. 1 fully back) `time` seconds after a shot: still for
 * the delay, then back in the first 45 % of the cycle (eased), forward in the rest, home after.
 * @param {number} time Seconds since the shot.
 * @param {number} cycle Seconds of the whole back-and-forward stroke.
 * @returns {number}
 */
export function pumpTravel(time, cycle, delay = RACK_DELAY) {
  const t = (time - delay) / Math.max(0.05, cycle);
  if (!(t > 0) || t >= 1) return 0;
  const ease = (u) => u * u * (3 - 2 * u);
  return t < 0.45 ? ease(t / 0.45) : 1 - ease((t - 0.45) / 0.55);
}

/**
 * Creates the rack driver of the lead's shotgun.
 */
export function createPumpRack() {
  let since = Infinity, cycle = 0.42, model = null, played = false, canRack = null;
  return {
    /** A shot from a pump weapon: starts the stroke (and the run-time's 'rack' if it has one). */
    start(weapon, heldModel, walker) {
      if (weapon.stance?.cadence !== 'pump' || !heldModel) return;
      since = 0; cycle = weapon.stance.cycleSeconds ?? 0.42; model = heldModel; played = false;
      if (walker && canRack !== false) {
        try { walker.play('rack', { duration: cycle, delay: RACK_DELAY }); canRack = true; played = true; } catch { canRack = false; }
      }
    },
    /**
     * Per frame: moves the pump and the off hand.
     * @returns {number} The stroke now, 0..1.
     */
    update(dt, walker) {
      if (!model || since === Infinity) return 0;
      since += dt;
      const travel = pumpTravel(since, cycle);
      if (model.pump) model.pump.position.z = model.pumpRestZ + travel * PUMP_TRAVEL;
      if (walker && model.grip && !played) {
        const k = model.heldScale ?? 1;
        walker.setWeaponGrip(model.grip.x * k, model.grip.y * k, (model.grip.z + travel * PUMP_TRAVEL) * k);
      }
      if (since > cycle + RACK_DELAY) { since = Infinity; if (model.pump) model.pump.position.z = model.pumpRestZ; }
      return travel;
    },
    /** True while the pump is being worked (the next shot waits for it). */
    get racking() { return since < cycle + RACK_DELAY; },
  };
}
