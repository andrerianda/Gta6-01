// The flight deck at work: while the lead flies an airplane it reads the instruments once a frame
// (flightInstruments.js, the one place that converts units), draws the flight HUD on its canvas in
// the HUD layer, repaints the cockpit's instrument panel, and hands the GPS route to the autopilot.
// It finds the aircraft through the vehicles system (physicsOf, modelOf), the view through the
// follow camera (flightView / FLIGHT_VIEW_CHANGED), and shows nothing rather than fail when one of
// them is missing. The aircraft's sounds are the audio director's (audio/aircraftVoices.js).
// An aircraft with a cockpit model (cockpitModel.js) gets it when the lead boards: in the cockpit
// view the model shows, its instrument faces are repainted at the panel rate and its combiner
// glass carries the HUD's symbology (the screen then paints no ladder or tapes); lateUpdate, after
// the camera, lights it and moves the controls. Without the model the aircraft's own
// `instrument_panel` quad is painted as before (and from outside in every case).
import { GAME_EVENTS } from '../../core/events/gameEvents.js';
import { autopilotLine, flightWarnings, hudFrame, screenHudModeFor } from './flightHudLayout.js';
import { paintFlightHud } from './flightHudPainter.js';
import { bearingDegrees, createFlightRouteFeed } from './flightRouteFeed.js';
import { createRadarContactLists } from './radarContactLists.js';
import { paintTargetingScreen } from './targetingDisplay.js';

const KNOTS = 1.943844;
/** Seconds between panel repaints in the cockpit view, and from outside while the camera is near. */
const PANEL_PERIOD = Object.freeze({ cockpit: 1 / 20, near: 1 / 5, nearMetres: 14 });
const FLASH_HZ = 3;
/** The cockpit model shows while the camera is within this many metres of the pilot's eye (a held cinematic camera is not). */
const COCKPIT_EYE_REACH = 1.2;
/** Seconds a loading cockpit model counts as background work (what a screenshot waits for). */
const COCKPIT_LOAD_PATIENCE = 20;

/**
 * Creates the flight deck.
 * @param {import('../../core/systems/gameContext.js').GameContext} context
 * @param {{readInstruments: Function, createInstrumentReadout: Function}} instruments flightInstruments.js.
 * @param {Function | null} [createPanelSurface] createCockpitPanelSurface of cockpitPanelSurface.js (the
 *   one part that needs three.js; without it the panels stay dark and the rest works, as in Node).
 * @param {{has: Function, ready: Function, request: Function, attach: Function, release: Function, dispose: Function} | null} [cockpitModels]
 *   createCockpitModels(context) of cockpitModel.js (three.js too); without it every aircraft keeps its own interior.
 */
export function createFlightDeck(context, instruments, createPanelSurface = null, cockpitModels = null) {
  const { entities, events, page, systems } = context;
  const document = page.document;
  const hudRoot = page.element('head-up-display');
  const canvas = document.createElement('canvas');
  canvas.className = 'flight-hud';
  canvas.hidden = true;
  hudRoot.append(canvas);
  const ctx = canvas.getContext('2d');
  const readout = instruments.createInstrumentReadout();
  const frame = { cx: 0, cy: 0, unit: 1, pixelsPerDegree: 12, width: 0, height: 0 };
  const warnings = { stall: false, pullUp: false, overspeed: false, gear: false, apOff: false, any: false };
  const craft = { retractableGear: false, apOffSeconds: Infinity };
  const hudOptions = {
    mode: 'assisted', view: 'chase', hasCombiner: false, warnings, flash: true, jet: false, waypointBearing: null, autopilotText: '',
    retractableGear: false, flapSteps: 1,
  };
  /** What paintCombinerHud gets (cockpitDisplays.js adds the glass's size: degreesTall, boresightX / Y). */
  const combinerOptions = {
    degreesTall: 16, degreesWide: 18, boresightX: 0.5, boresightY: 0.5, warnings, flash: true, jet: false, waypointBearing: null,
    autopilotText: '', mode: 'assisted', view: 'cockpit',
  };
  const eyeWorld = { x: 0, y: 0, z: 0 };
  // The launch flags name an aircraft and the cockpit view: its cockpit model starts loading at once.
  if (cockpitModels && context.launch?.aircraft && context.launch.flightView === 'cockpit') cockpitModels.request(context.launch.aircraft);
  const contactLists = createRadarContactLists();
  const panelExtra = { position: { x: 0, z: 0 }, route: null, contacts: contactLists.merged, hatchOpen: false, timeSeconds: 0, radar: null };
  const routeFeed = createFlightRouteFeed();
  const stops = [];

  let eventVehicleId = null;   // from VEHICLE_ENTERED, when the player system does not say
  let eventView = null;        // from FLIGHT_VIEW_CHANGED
  let flown = null;            // { id, airplane, entry, model, panel, disengaged }
  let panelTimer = 0;
  let routeTimer = 0;
  let clock = 0;
  let pixelRatio = 0;

  const listen = (topic, handler) => { if (topic) stops.push(events.on(topic, handler)); };
  listen(GAME_EVENTS.VEHICLE_ENTERED, ({ vehicleId, isPlayer, seat }) => { if (isPlayer && (seat ?? 'driver') === 'driver') eventVehicleId = vehicleId; });
  listen(GAME_EVENTS.VEHICLE_EXITED, ({ vehicleId, isPlayer }) => { if (isPlayer && vehicleId === eventVehicleId) eventVehicleId = null; });
  listen(GAME_EVENTS.VEHICLE_REMOVED, ({ vehicleId }) => { if (vehicleId === eventVehicleId) eventVehicleId = null; });
  listen(GAME_EVENTS.FLIGHT_VIEW_CHANGED, ({ view }) => { eventView = view ?? null; });

  function playerVehicleId() {
    const vehicle = systems.find('player')?.vehicle;
    if (vehicle === null || vehicle === undefined) return eventVehicleId;
    return typeof vehicle === 'object' ? vehicle.id ?? eventVehicleId : vehicle;
  }

  function catalogEntry(modelId) {
    return context.content.find('vehicleCatalog')?.VEHICLE_CATALOG?.[modelId] ?? null;
  }

  function board(id) {
    const entity = entities.get(id);
    if (!entity || !entity.tags || !entity.tags.has('airplane')) return null;
    const fleet = systems.find('vehicles');
    const airplane = fleet?.physicsOf?.(id) ?? fleet?.get?.(id)?.car ?? null;
    if (!airplane || !airplane.state) return null;
    const entry = catalogEntry(entity.data?.modelId) ?? null;
    const tuning = airplane.tuning ?? {};
    const flight = entry?.flight ?? {};
    craft.retractableGear = Boolean(tuning.retractableGear ?? flight.retractableGear);
    craft.apOffSeconds = Infinity;
    hudOptions.retractableGear = craft.retractableGear;
    hudOptions.flapSteps = (tuning.flapNotches ?? flight.flapNotches ?? [0]).length;
    hudOptions.jet = (flight.kind ?? tuning.kind) === 'jet';
    routeFeed.clear();
    routeTimer = 0;
    panelTimer = 0;
    hudRoot.classList.add('is-flying');
    // The cockpit model is fetched now, whatever the view: the switch to the cockpit then costs nothing.
    const assetId = entry?.id ?? entity.data?.modelId ?? null;
    const cockpitWanted = Boolean(flight.cockpit && cockpitModels && assetId && cockpitModels.has(assetId));
    // (reported as background work until it is on the aircraft, so a screenshot waits for it)
    let cockpitLoading = null;
    if (cockpitWanted) {
      cockpitModels.request(assetId);
      cockpitLoading = typeof context.work?.begin === 'function' ? context.work.begin(`cockpit model of ${assetId}`) : null;
    }
    return {
      id, entity, airplane, entry, assetId, cockpit: flight.cockpit ?? null, model: null, panel: null, panelTried: false,
      cockpitWanted, cockpitLoading, cockpitModel: null, boardedAt: clock, disengaged: airplane.state.autopilotDisengaged ?? 0,
    };
  }

  /** The cockpit model is on the aircraft, or never will be: nothing is loading any more. */
  function cockpitSettled() {
    if (typeof flown.cockpitLoading === 'function') flown.cockpitLoading();
    flown.cockpitLoading = null;
  }

  function leave() {
    if (!flown) return;
    cockpitSettled();
    flown.panel?.dispose();
    if (flown.cockpitModel) flown.cockpitModel.dispose();
    if (flown.cockpitWanted) cockpitModels.release(flown.assetId);
    flown = null;
    hudOptions.hasCombiner = false;
    canvas.hidden = true;
    hudRoot.classList.remove('is-flying');
  }

  /** The panel's canvas goes on the model once it is there (the near rig may arrive a frame late). */
  function attachPanel() {
    if (flown.panel || flown.panelTried || !flown.cockpit || !createPanelSurface) return;
    const model = systems.find('vehicles')?.modelOf?.(flown.id) ?? null;
    if (!model) return;
    flown.panelTried = true;
    flown.model = model;
    // (assets.get throws for a model that is not loaded: an aircraft drawn by the placeholder.)
    const assets = context.assets;
    const loaded = assets && flown.entry && (typeof assets.has !== 'function' || assets.has(flown.entry.id));
    const assetExtras = loaded ? assets.get(flown.entry.id)?.extras ?? null : null;
    flown.panel = createPanelSurface(document, model, flown.cockpit, assetExtras?.panel_size, airspeedArcs());
    panelTimer = 0;
  }

  /** The airspeed arcs of the flown aircraft, knots, or null. */
  function airspeedArcs() {
    const flight = flown.entry?.flight ?? {};
    return flight.stallSpeedClean ? {
      stallClean: flight.stallSpeedClean * KNOTS, stallFlaps: (flight.stallSpeedFlaps ?? flight.stallSpeedClean) * KNOTS,
      neverExceed: (flight.neverExceedSpeed ?? flight.stallSpeedClean * 3) * KNOTS,
    } : null;
  }

  /** The cockpit model goes on the aircraft once both are there (the file may arrive a second after boarding). */
  function attachCockpitModel() {
    if (!flown.cockpitWanted || flown.cockpitModel) return;
    if (clock - flown.boardedAt > COCKPIT_LOAD_PATIENCE) cockpitSettled(); // still welcome later, but nobody waits for it
    if (!cockpitModels.has(flown.assetId)) { flown.cockpitWanted = false; cockpitSettled(); return; } // it failed to load
    if (!cockpitModels.ready(flown.assetId)) return;
    const model = systems.find('vehicles')?.modelOf?.(flown.id) ?? null;
    if (!model) return;
    flown.cockpitModel = cockpitModels.attach(flown.assetId, model, flown.cockpit, airspeedArcs());
    cockpitSettled();
    if (!flown.cockpitModel) flown.cockpitWanted = false;
    else panelTimer = 0;
  }

  /** True when the camera sits at the pilot's eye in the cockpit view (not held elsewhere by a scene). */
  function cameraInCockpit(view) {
    if (view !== 'cockpit') return false;
    const eye = flown.cockpitModel?.framing?.eye ?? null;
    const root = flown.cockpitModel?.instance?.parent ?? null;
    const camera = context.view?.camera?.position ?? null;
    if (!eye || !root || !root.quaternion || !camera) return true;
    rotate(eye, root.quaternion, eyeWorld);
    return Math.hypot(camera.x - eyeWorld.x - root.position.x, camera.y - eyeWorld.y - root.position.y, camera.z - eyeWorld.z - root.position.z) < COCKPIT_EYE_REACH;
  }

  function feedRoute(navActive) {
    const minimap = systems.find('minimap');
    const gps = minimap?.gps ?? null;
    const source = gps?.waypointRoute?.count > 1 ? gps.waypointRoute : gps?.objectiveRoute?.count > 1 ? gps.objectiveRoute : null;
    if (routeFeed.refresh(source, minimap?.waypoint ?? null, navActive)) {
      flown.airplane.setAutopilotRoute?.(routeFeed.legs.length > 0 ? routeFeed.legs : null);
    }
    panelExtra.route = routeFeed.flat.count > 0 ? routeFeed.flat : null;
  }

  function resize() {
    const width = context.view?.width || canvas.clientWidth || 1280;
    const height = context.view?.height || canvas.clientHeight || 720;
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    if (width === frame.width && height === frame.height && ratio === pixelRatio) return;
    pixelRatio = ratio;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    hudFrame(width, height, context.view?.camera?.fov ?? 55, frame);
  }

  return {
    /** True while the lead flies an airplane and the deck shows its instruments. */
    get active() { return flown !== null; },
    /** The live readout (what the HUD and the panel show), or null on the ground on foot. */
    get readout() { return flown ? readout : null; },
    /** What the screen's HUD was last painted with (mode, view, hasCombiner, warnings...): read only. */
    get screen() { return hudOptions; },
    /** 'assisted' or 'simulation': what the screen's HUD shows now. */
    get hudMode() { return hudOptions.mode; },
    /** The camera view the deck follows: 'cockpit', 'chase' or 'outside'. */
    get view() { return systems.find('followCamera')?.flightView ?? eventView ?? 'chase'; },
    /** The stealth display's radar contacts: [{bearingDegrees, distanceNm, hostile?}] (the final mission). */
    setContacts(contacts, source) { panelExtra.contacts = contactLists.set(contacts, source); },
    /** Tells the cautions and the signature meter that the belly hatch is open. */
    setHatchOpen(open) { panelExtra.hatchOpen = Boolean(open); },
    /** True while the belly hatch is reported open. */
    get hatchOpen() { return panelExtra.hatchOpen; },

    update(deltaSeconds) {
      const id = playerVehicleId();
      if (flown && flown.id !== id) leave();
      if (!flown && id !== null && id !== undefined) flown = board(id);
      if (!flown) return;
      const airplane = flown.airplane;
      if (!airplane.state || !entities.get(flown.id)) { leave(); return; }
      clock += deltaSeconds;
      instruments.readInstruments(airplane, readout);
      const view = systems.find('followCamera')?.flightView ?? eventView ?? 'chase';

      // The autopilot's route, twice a second.
      routeTimer -= deltaSeconds;
      if (routeTimer <= 0) {
        routeTimer = 0.5;
        feedRoute(Boolean(readout.autopilot.engaged && readout.autopilot.lateral === 'NAV'));
      }
      const position = flown.entity.position;
      const destination = routeFeed.destination;
      hudOptions.waypointBearing = destination ? bearingDegrees(position.x, position.z, destination.x, destination.z) : null;

      // Warnings; AP OFF flashes for a few seconds after a disconnect.
      const disengaged = airplane.state.autopilotDisengaged ?? 0;
      if (disengaged > flown.disengaged) craft.apOffSeconds = 0;
      else craft.apOffSeconds += deltaSeconds;
      flown.disengaged = disengaged;
      flightWarnings(readout, craft, warnings);

      // The HUD.
      const show = context.state.simulates !== false;
      canvas.hidden = !show;
      if (show && ctx) {
        resize();
        // (the cockpit model's state is last frame's: lateUpdate decides it after the camera)
        const inside = flown.cockpitModel?.shown === true;
        hudOptions.mode = screenHudModeFor(view, flown.cockpit, readout.mode);
        hudOptions.view = view;
        hudOptions.hasCombiner = inside && flown.cockpitModel.hasCombiner;
        hudOptions.flash = (clock * FLASH_HZ) % 1 < 0.6;
        hudOptions.autopilotText = autopilotLine(readout.autopilot);
        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        paintFlightHud(ctx, readout, frame, hudOptions);
      }
      // The radar network's picture of this aircraft (null for other aircraft and without the system).
      const radar = systems.find('radarNetwork')?.display ?? null;
      panelExtra.radar = radar && radar.vehicleId === flown.id ? radar : null;
      // Outside the cockpit the bomb's targeting screen is an inset of the HUD, lower right.
      if (show && ctx && panelExtra.radar?.targeting?.active && view !== 'cockpit') {
        const side = Math.min(frame.width * 0.3, frame.height * 0.42);
        paintTargetingScreen(ctx, panelExtra.radar.targeting, frame.width - side - 24 * frame.unit, frame.height - side - 96 * frame.unit, side, side);
      }

      // The cockpit's instruments: the model's faces from inside, the aircraft's own panel quad otherwise.
      if (flown.cockpit) {
        attachPanel();
        attachCockpitModel();
        const faces = flown.cockpitModel && flown.cockpitModel.shown && flown.cockpitModel.hasDisplays ? flown.cockpitModel : null;
        if (flown.panel || faces) {
          panelTimer -= deltaSeconds;
          if (panelTimer <= 0) {
            const camera = context.view?.camera?.position;
            const near = view === 'cockpit' || (camera && Math.hypot(camera.x - position.x, camera.y - position.y, camera.z - position.z) < PANEL_PERIOD.nearMetres);
            if (near) {
              // Carry the overshoot, so the rate holds between frames of any length.
              const period = view === 'cockpit' ? PANEL_PERIOD.cockpit : PANEL_PERIOD.near;
              panelTimer = panelTimer + period > 0 ? panelTimer + period : period;
              panelExtra.position.x = position.x;
              panelExtra.position.z = position.z;
              panelExtra.timeSeconds = clock;
              if (faces) faces.paintDisplays(readout, panelExtra);
              else if (flown.panel) flown.panel.paint(readout, panelExtra);
            } else panelTimer = PANEL_PERIOD.near;
          }
        }
      }
    },

    /**
     * After the camera has been placed: shows the cockpit model only while the camera sits at the
     * pilot's eye, lights it, moves its controls and repaints the combiner's symbology.
     * @param {number} deltaSeconds
     */
    lateUpdate(deltaSeconds) {
      const cockpit = flown ? flown.cockpitModel : null;
      if (!cockpit) return;
      const view = systems.find('followCamera')?.flightView ?? eventView ?? 'chase';
      const inside = cameraInCockpit(view);
      if (inside !== cockpit.shown) {
        cockpit.setShown(inside);
        panelTimer = 0; // the faces (or the panel quad) are repainted at once
      }
      if (!inside) return;
      cockpit.update(deltaSeconds, readout, flown.airplane.input ?? null);
      if (cockpit.hasCombiner) {
        combinerOptions.flash = hudOptions.flash;
        combinerOptions.jet = hudOptions.jet;
        combinerOptions.waypointBearing = hudOptions.waypointBearing;
        combinerOptions.autopilotText = hudOptions.autopilotText;
        combinerOptions.mode = hudOptions.mode;
        cockpit.paintCombiner(readout, combinerOptions);
      }
    },

    /** The eye, lens and gaze of the flown aircraft's cockpit model ({eye, fovDegrees, gazeRadians}; null fields fall back), or null. */
    get cockpitFraming() { return flown && flown.cockpitModel ? flown.cockpitModel.framing : null; },
    /** True while the cockpit model is drawn (the camera sits at the pilot's eye). */
    get cockpitShown() { return Boolean(flown && flown.cockpitModel && flown.cockpitModel.shown); },

    dispose() {
      leave();
      if (cockpitModels) cockpitModels.dispose();
      for (const stop of stops) if (typeof stop === 'function') stop();
      canvas.remove();
    },
  };
}

/** A vector turned by a unit quaternion (plain objects: no three.js here). */
function rotate(v, q, out) {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y;
  const iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x;
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  out.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
  out.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
  out.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;
  return out;
}
