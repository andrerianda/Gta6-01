// The flight deck: what the pilot reads and hears while the lead flies a fixed-wing aircraft.
// A flight HUD in the HUD layer (flight/deck/flightHudPainter.js: a clean screen in ASSISTED, the
// pilot's extras in SIMULATION, the flashing STALL, PULL UP, OVERSPEED, GEAR and AP OFF warnings);
// the cockpit view's own model for the aircraft that have one (flight/deck/cockpitModel.js: the full
// interior with Dez's hands on stick and throttles, lit by the sky and by the instruments' glow,
// its instrument faces painted live from the real flight state and the HUD's symbology on its
// combiner glass); the older single panel quad on the aircraft's `instrument_panel` mesh for the
// others and from outside (the trainer's six instruments, the flying wing's displays with map,
// radar and stealth-signature meter, the reconnaissance jet's wall of round gauges); and the GPS
// route handed to the autopilot's NAV mode.
// It reads the Airplane of physics/aircraft/Airplane.js through flight/flightInstruments.js and
// never writes the flight controls. The aircraft's sounds (propeller, jet, afterburner, wind,
// stall horn, gear and flap motors, touchdown) belong to the audio system (audio/aircraftVoices.js).
//
// Members: active (bool), readout (the instrument readout or null), hudMode, view,
//   cockpitFraming ({eye, fovDegrees, gazeRadians} of the cockpit model, for the cockpit camera),
//   cockpitShown (bool),
//   setContacts([{bearingDegrees, distanceNm, hostile?}], source?) for the radar display (one list
//   per source key, merged), setHatchOpen(bool) / hatchOpen for the cautions and the signature.
// The radar network's `display` (signature, emitters, the bomb's targeting screen) is read each
// repaint and shown on the Manta Sombra's displays and, outside the cockpit, as a HUD inset.
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
    /** 'assisted' or 'simulation': what the screen's HUD shows (flightHudLayout.js screenHudModeFor). */
    get hudMode() { return deck ? deck.hudMode : 'assisted'; },
    /** 'cockpit', 'chase' or 'outside'. */
    get view() { return deck ? deck.view : 'chase'; },
    /**
     * The flown aircraft's cockpit model as the cockpit camera needs it: {eye (aircraft frame),
     * fovDegrees, gazeRadians}, any of them null to fall back; null without a cockpit model.
     */
    get cockpitFraming() { return deck ? deck.cockpitFraming : null; },
    /** True while the cockpit model is drawn. */
    get cockpitShown() { return deck ? deck.cockpitShown : false; },
    /**
     * Radar contacts for the stealth display: [{bearingDegrees, distanceNm, hostile?}]. Each caller passes
     * its own `source` key ('airGuard', 'radar', ...): the lists are kept apart and shown together.
     */
    setContacts(contacts, source) { if (deck) deck.setContacts(contacts, source); },
    /** The belly hatch's state, for the cautions and the signature meter. */
    setHatchOpen(open) { if (deck) deck.setHatchOpen(open); },
    /** True while the belly hatch is reported open (the radar network adds it to the signature). */
    get hatchOpen() { return deck ? deck.hatchOpen : false; },

    async init() {
      // No instruments, no deck: the game plays on without the flight HUD rather than fail.
      try {
        const [instruments, runtime, panels] = await Promise.all([
          import('./flightInstruments.js'), import('./deck/flightDeckRuntime.js'), import('./deck/cockpitPanelSurface.js'),
        ]);
        // The cockpit models are an extra: without them every aircraft keeps its own interior.
        let cockpits = null;
        try {
          cockpits = (await import('./deck/cockpitModel.js')).createCockpitModels(context);
        } catch (error) {
          context.log.child('flightDeck').warn?.(`cockpit models unavailable: ${error?.message ?? error}`);
        }
        if (typeof instruments.readInstruments === 'function' && typeof instruments.createInstrumentReadout === 'function') {
          deck = runtime.createFlightDeck(context, instruments, panels.createCockpitPanelSurface, cockpits);
        }
      } catch (error) {
        context.log.child('flightDeck').warn?.(`flight deck unavailable: ${error?.message ?? error}`);
      }
    },

    update(deltaSeconds) {
      if (deck) deck.update(deltaSeconds);
    },

    /** After the follow camera: the cockpit model follows the view, its lights the aircraft's pose of this frame. */
    lateUpdate(deltaSeconds) {
      if (deck) deck.lateUpdate(deltaSeconds);
    },

    dispose() {
      if (deck) deck.dispose();
      deck = null;
    },
  };
}
