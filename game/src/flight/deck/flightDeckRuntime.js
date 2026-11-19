// The flight deck at work: while the lead flies an airplane it reads the instruments once a frame
// (flightInstruments.js, the one place that converts units), draws the flight HUD on its canvas in
// the HUD layer, repaints the cockpit's instrument panel, and hands the GPS route to the autopilot.
// It finds the aircraft through the vehicles system (physicsOf, modelOf), the view through the
// follow camera (flightView / FLIGHT_VIEW_CHANGED), and shows nothing rather than fail when one of
// them is missing. The aircraft's sounds are the audio director's (audio/aircraftVoices.js).
import { GAME_EVENTS } from '../../core/events/gameEvents.js';
import { autopilotLine, flightWarnings, hudFrame, hudModeFor } from './flightHudLayout.js';
import { paintFlightHud } from './flightHudPainter.js';
import { bearingDegrees, createFlightRouteFeed } from './flightRouteFeed.js';

const KNOTS = 1.943844;
/** Seconds between panel repaints in the cockpit view, and from outside while the camera is near. */
const PANEL_PERIOD = Object.freeze({ cockpit: 1 / 20, near: 1 / 5, nearMetres: 14 });
const FLASH_HZ = 3;

/**
 * Creates the flight deck.
 * @param {import('../../core/systems/gameContext.js').GameContext} context
 * @param {{readInstruments: Function, createInstrumentReadout: Function}} instruments flightInstruments.js.
 * @param {Function | null} [createPanelSurface] createCockpitPanelSurface of cockpitPanelSurface.js (the
 *   one part that needs three.js; without it the panels stay dark and the rest works, as in Node).
 */
export function createFlightDeck(context, instruments, createPanelSurface = null) {
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
  const hudOptions = { mode: 'full', warnings, flash: true, jet: false, waypointBearing: null, autopilotText: '', retractableGear: false, flapSteps: 1 };
  const panelExtra = { position: { x: 0, z: 0 }, route: null, contacts: [], hatchOpen: false, timeSeconds: 0 };
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
    return { id, entity, airplane, entry, cockpit: flight.cockpit ?? null, model: null, panel: null, panelTried: false, disengaged: airplane.state.autopilotDisengaged ?? 0 };
  }

  function leave() {
    if (!flown) return;
    flown.panel?.dispose();
    flown = null;
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
    const assetExtras = context.assets?.get?.(flown.entry?.id)?.extras ?? null;
    const flight = flown.entry?.flight ?? {};
    const speeds = flight.stallSpeedClean ? {
      stallClean: flight.stallSpeedClean * KNOTS, stallFlaps: (flight.stallSpeedFlaps ?? flight.stallSpeedClean) * KNOTS,
      neverExceed: (flight.neverExceedSpeed ?? flight.stallSpeedClean * 3) * KNOTS,
    } : null;
    flown.panel = createPanelSurface(document, model, flown.cockpit, assetExtras?.panel_size, speeds);
    panelTimer = 0;
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
    /** 'full', 'combiner' or 'annunciator': the HUD drawn now. */
    get hudMode() { return hudOptions.mode; },
    /** The camera view the deck follows: 'cockpit', 'chase' or 'outside'. */
    get view() { return systems.find('followCamera')?.flightView ?? eventView ?? 'chase'; },
    /** The stealth display's radar contacts: [{bearingDegrees, distanceNm, hostile?}] (the final mission). */
    setContacts(contacts) { panelExtra.contacts = Array.isArray(contacts) ? contacts : []; },
    /** Tells the cautions and the signature meter that the belly hatch is open. */
    setHatchOpen(open) { panelExtra.hatchOpen = Boolean(open); },

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
        hudOptions.mode = hudModeFor(view, flown.cockpit);
        hudOptions.flash = (clock * FLASH_HZ) % 1 < 0.6;
        hudOptions.autopilotText = autopilotLine(readout.autopilot);
        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        paintFlightHud(ctx, readout, frame, hudOptions);
      }

      // The cockpit panel.
      if (flown.cockpit) {
        attachPanel();
        if (flown.panel) {
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
              flown.panel.paint(readout, panelExtra);
            } else panelTimer = PANEL_PERIOD.near;
          }
        }
      }
    },

    dispose() {
      leave();
      for (const stop of stops) if (typeof stop === 'function') stop();
      canvas.remove();
    },
  };
}
