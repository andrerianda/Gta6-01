// The Manta Sombra's radar signature, 0 (lost in the clutter) .. 1 (painted bright): what the
// cockpit's signature meter shows and what the final mission's radar sweeps will test. Low and slow
// and level with everything closed is quiet; height lifts the aircraft out of the ground clutter,
// a steep bank shows the radar the whole planform, speed heats the skin, and an open gear bay or
// hatch is a corner reflector. Pure: no DOM, no three.js.

/** Signature at or above which a radar holds a track. */
export const SIGNATURE_DETECTED = 0.6;

/**
 * The signature for an instrument readout.
 * @param {{radarAltitudeFeet: number, mach: number, rollDegrees: number, gearDown: boolean, gearInTransit?: boolean,
 *   afterburner?: boolean, onGround?: boolean}} readout From readInstruments.
 * @param {{hatchOpen?: boolean}} [extra] State the readout does not carry.
 * @returns {number} 0..1.
 */
export function stealthSignatureOf(readout, extra = null) {
  if (readout.onGround) return 1; // parked in plain sight
  const feet = Number.isFinite(readout.radarAltitudeFeet) ? Math.max(0, readout.radarAltitudeFeet) : 0;
  // 500 ft: 0.1; 2,500 ft (the radar altimeter's cap): about 0.4; the caller may pass barometric
  // height through radarAltitudeFeet when above the cap.
  let signature = 0.04 + 0.52 * (1 - Math.exp(-feet / 2600));
  const bank = Math.abs(Number.isFinite(readout.rollDegrees) ? readout.rollDegrees : 0);
  if (bank > 15) signature += Math.min(0.3, (bank - 15) / 100);
  const mach = Number.isFinite(readout.mach) ? readout.mach : 0;
  if (mach > 0.7) signature += Math.min(0.15, (mach - 0.7) * 0.75);
  if (readout.gearDown || readout.gearInTransit) signature += 0.3;
  if (extra && extra.hatchOpen) signature += 0.25;
  if (readout.afterburner) signature += 0.2;
  return signature < 0 ? 0 : signature > 1 ? 1 : signature;
}

/**
 * The meter's word for a signature.
 * @param {number} signature 0..1.
 * @returns {'HIDDEN' | 'LOW' | 'EXPOSED' | 'TRACKED'}
 */
export function stealthSignatureLabel(signature) {
  if (signature >= SIGNATURE_DETECTED + 0.2) return 'TRACKED';
  if (signature >= SIGNATURE_DETECTED) return 'EXPOSED';
  return signature >= 0.3 ? 'LOW' : 'HIDDEN';
}
