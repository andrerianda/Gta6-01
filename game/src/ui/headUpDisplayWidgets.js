// Builds every widget of the head-up display into the containers of game/index.html and ticks
// them together: wanted stars, cash, health and armour, the weapon panel, the mission line,
// subtitles, the location banner, the speedometer, the notification stack and the weapon wheel.
import { createCashCounter, createHealthAndArmour } from './cashAndHealth.js';
import { createWeaponWheelControl } from './weaponWheelControl.js';
import { createLocationBanner } from './locationBanner.js';
import { createMissionObjective } from './missionObjective.js';
import { createNotifications } from './notifications.js';
import { createSpeedometer } from './speedometer.js';
import { createSubtitles } from './subtitles.js';
import { createWantedStars } from './wantedStars.js';
import { createWeaponPanel } from './weaponPanel.js';

/** The ids of the static HUD containers in game/index.html. */
export const HUD_CONTAINER_IDS = Object.freeze({
  hud: 'head-up-display',
  wantedStars: 'hud-wanted-stars',
  cash: 'hud-cash',
  vitals: 'hud-health-and-armour',
  weapon: 'hud-weapon-and-ammunition',
  objective: 'hud-mission-objective',
  location: 'hud-location-name',
  speedometer: 'hud-speedometer',
  subtitles: 'hud-subtitles',
});

/**
 * Builds the HUD widgets.
 * @param {{document: Document, element: (id: string) => HTMLElement}} page context.page.
 * @param {{weapons?: object, wheelSlots?: object}} [catalogs] WEAPON_CATALOG and
 *   WEAPON_WHEEL_SLOTS, when loaded.
 * @param {import('../core/systems/gameContext.js').GameContext} [context] For the weapon wheel
 *   (input, game state, slow motion, combat's inventory); without it there is no wheel.
 */
export function buildHeadUpDisplay(page, catalogs = {}, context = null) {
  const { document } = page;
  const ids = HUD_CONTAINER_IDS;
  const hud = page.element(ids.hud);
  hud.classList.add('hud-root');
  const widgets = {
    wantedStars: createWantedStars(document, page.element(ids.wantedStars)),
    cash: createCashCounter(document, page.element(ids.cash)),
    vitals: createHealthAndArmour(document, page.element(ids.vitals)),
    weapon: createWeaponPanel(document, page.element(ids.weapon), catalogs.weapons ?? {}),
    objective: createMissionObjective(document, page.element(ids.objective), hud),
    subtitles: createSubtitles(document, page.element(ids.subtitles)),
    location: createLocationBanner(document, page.element(ids.location)),
    speedometer: createSpeedometer(document, page.element(ids.speedometer)),
    notifications: createNotifications(document, hud),
    weaponWheel: context && catalogs.wheelSlots
      ? createWeaponWheelControl(context, hud, { slots: catalogs.wheelSlots, catalog: catalogs.weapons }) : null,
  };
  widgets.vitals.set(100, 0);

  return {
    ...widgets,
    /** @param {boolean} driving Shows the speedometer and moves the location banner beside it. */
    setDriving(driving) {
      widgets.speedometer.setVisible(driving);
      hud.classList.toggle('is-driving', Boolean(driving));
    },
    /**
     * Ticks the animated widgets.
     * @param {number} deltaSeconds Real time.
     * @param {number} vehicleSpeed The player's vehicle speed in m/s (0 on foot).
     * @param {'kmh'|'mph'} speedUnit
     */
    update(deltaSeconds, vehicleSpeed, speedUnit) {
      widgets.cash.update(deltaSeconds);
      widgets.objective.update(deltaSeconds);
      widgets.subtitles.update(deltaSeconds);
      widgets.location.update(deltaSeconds);
      widgets.notifications.update(deltaSeconds);
      widgets.speedometer.update(vehicleSpeed, speedUnit);
      widgets.weaponWheel?.update();
    },
  };
}
