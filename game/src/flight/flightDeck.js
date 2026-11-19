// The flight deck: what the pilot reads and hears while the lead flies a fixed-wing aircraft.
// A flight HUD in the HUD layer (pitch ladder and horizon, roll scale, airspeed, altitude and
// heading tapes, vertical speed, flight-path marker, Mach, G, throttle, flap / gear / trim / brake
// annunciators, the Casual / Realistic mode, the autopilot line, and the flashing STALL, PULL UP,
// OVERSPEED, GEAR and AP OFF warnings); the cockpit's instrument panel painted live on the
// aircraft's `instrument_panel` mesh from the real flight state (the trainer's six instruments, the
// flying wing's four displays with map, radar and stealth-signature meter, the reconnaissance
// jet's wall of round gauges); and the GPS route handed to the autopilot's NAV mode. In the cockpit
// view the jets keep a combiner HUD and the trainer only its annunciator line.
// It reads the Airplane of physics/aircraft/Airplane.js through flight/flightInstruments.js and
// never writes the flight controls. The aircraft's sounds (propeller, jet, afterburner, wind,
// stall horn, gear and flap motors, touchdown) belong to the audio system (audio/aircraftVoices.js).
//
// Members: active (bool), readout (the instrument readout or null), hudMode, view,
//   setContacts([{bearingDegrees, distanceNm, hostile?}]) for the radar display,
//   setHatchOpen(bool) for the cautions and the signature meter.
// Listens: VEHICLE_ENTERED / VEHICLE_EXITED / VEHICLE_REMOVED, FLIGHT_VIEW_CHANGED.
// Implementation: flight/deck/flightDeckRuntime.js and its neighbours.

/**
 * Creates the flight deck system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createFlightDeckSystem(context) {
  let deck = null;

  return {
    name: 'flightDeck',
    runsWhen: 'always',

    /** True while the lead flies an airplane. */
    get active() { return deck ? deck.active : false; },
    /** The instrument readout shown now (knots, feet, degrees: flightInstruments.js), or null. */
    get readout() { return deck ? deck.readout : null; },
    /** 'full', 'combiner' or 'annunciator'. */
    get hudMode() { return deck ? deck.hudMode : 'full'; },
    /** 'cockpit', 'chase' or 'outside'. */
    get view() { return deck ? deck.view : 'chase'; },
    /** Radar contacts for the stealth display: [{bearingDegrees, distanceNm, hostile?}]. */
    setContacts(contacts) { if (deck) deck.setContacts(contacts); },
    /** The belly hatch's state, for the cautions and the signature meter. */
    setHatchOpen(open) { if (deck) deck.setHatchOpen(open); },

    async init() {
      // No instruments, no deck: the game plays on without the flight HUD rather than fail.
      try {
        const [instruments, runtime] = await Promise.all([import('./flightInstruments.js'), import('./deck/flightDeckRuntime.js')]);
        if (typeof instruments.readInstruments === 'function' && typeof instruments.createInstrumentReadout === 'function') {
          deck = runtime.createFlightDeck(context, instruments);
        }
      } catch (error) {
        context.log.child('flightDeck').warn?.(`flight deck unavailable: ${error?.message ?? error}`);
      }
    },

    update(deltaSeconds) {
      if (deck) deck.update(deltaSeconds);
    },

    dispose() {
      if (deck) deck.dispose();
      deck = null;
    },
  };
}
