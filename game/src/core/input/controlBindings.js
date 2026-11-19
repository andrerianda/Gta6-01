// The control bindings the game starts with: for each input context (on foot, in a vehicle, the
// menus, the map, the phone, cutscenes) which keys and mouse buttons trigger which action. The
// playerControls catalog replaces or extends these defaults when it exists, and the player's
// own rebindings (settings 'controls.bindings') are applied last.
//
//   const { bindings, axes, labels } = resolveControlBindings({ catalog, overrides });
//   createInputActionMap({ bindings, axes });

/**
 * Merges the default bindings, the playerControls catalog and the player's rebindings.
 * @param {Object} [sources]
 * @param {object | null} [sources.catalog] The playerControls catalog module. It may export
 *   PLAYER_CONTROLS (or CONTROL_BINDINGS): context -> action -> codes[] or { codes, label }.
 * @param {Record<string, Record<string, string[]>> | null} [sources.overrides] The player's
 *   rebindings: context -> action -> codes.
 * @returns {{bindings: Record<string, Record<string, string[]>>,
 *   axes: Record<string, {negative: string, positive: string}>, labels: Record<string, string>}}
 */
export function resolveControlBindings(sources = {}) {
  /** @type {Record<string, Record<string, string[]>>} */
  const bindings = {};
  /** @type {Record<string, string>} */
  const labels = { ...DEFAULT_ACTION_LABELS };
  const merge = (table, withLabels) => {
    if (table === null || typeof table !== 'object') return;
    for (const context of Object.keys(table)) {
      const actions = table[context];
      if (actions === null || typeof actions !== 'object') continue;
      bindings[context] = bindings[context] ?? {};
      for (const action of Object.keys(actions)) {
        const entry = actions[action];
        const codes = Array.isArray(entry) ? entry : entry?.codes ?? entry?.keys ?? null;
        if (!Array.isArray(codes)) continue;
        bindings[context][action] = codes.filter((code) => typeof code === 'string');
        if (withLabels && entry && typeof entry.label === 'string') labels[action] = entry.label;
      }
    }
  };
  merge(DEFAULT_CONTROL_BINDINGS, false);
  const catalog = sources.catalog ?? null;
  const catalogTable = catalog ? catalog.PLAYER_CONTROLS ?? catalog.CONTROL_BINDINGS ?? null : null;
  // The playerControls catalog today lists actions by its own ids for the controls menu
  // (move_forward in context on_foot); only a table by context (onFoot -> moveForward -> codes),
  // the names the systems read, replaces the defaults.
  if (catalogTable && !listsActionsById(catalogTable)) merge(catalogTable, true);
  merge(sources.overrides ?? null, false);
  return { bindings, axes: { ...CONTROL_AXES }, labels };
}

function listsActionsById(table) {
  return Object.values(table).some((entry) => entry !== null && typeof entry === 'object' && typeof entry.context === 'string');
}

/** The input contexts: the same key can mean different actions in each. */
export const INPUT_CONTEXTS = Object.freeze({
  ON_FOOT: 'onFoot',
  IN_VEHICLE: 'inVehicle',
  /** At the controls of a fixed-wing aircraft (the player system sets it on boarding one). */
  IN_AIRCRAFT: 'inAircraft',
  MENU: 'menu',
  /** An in-world shop's menu while the world runs (economy: controls.setPlayContext('shop')). */
  SHOP: 'shop',
  MAP: 'map',
  PHONE: 'phone',
  CUTSCENE: 'cutscene',
});

/** The default bindings: context -> action -> codes ('always' is live in every context). */
export const DEFAULT_CONTROL_BINDINGS = Object.freeze({
  always: Object.freeze({
    pause: ['Escape', 'KeyP'],
    togglePerformanceOverlay: ['F3'],
  }),
  onFoot: Object.freeze({
    moveForward: ['KeyW', 'ArrowUp'],
    moveBackward: ['KeyS', 'ArrowDown'],
    moveLeft: ['KeyA', 'ArrowLeft'],
    moveRight: ['KeyD', 'ArrowRight'],
    sprint: ['ShiftLeft', 'ShiftRight'],
    walk: ['AltLeft'],
    jump: ['Space'],
    crouch: ['KeyC'],
    enterVehicle: ['KeyF', 'Enter'],
    interact: ['KeyE'],
    attack: ['Mouse0'],
    aim: ['Mouse2'],
    reload: ['KeyR'],
    nextWeapon: ['WheelDown', 'KeyX'],
    previousWeapon: ['WheelUp', 'KeyZ'],
    holsterWeapon: ['KeyQ'],
    weaponSlot1: ['Digit1'],
    weaponSlot2: ['Digit2'],
    weaponSlot3: ['Digit3'],
    weaponSlot4: ['Digit4'],
    weaponSlot5: ['Digit5'],
    weaponSlot6: ['Digit6'],
    weaponSlot7: ['Digit7'],
    weaponSlot8: ['Digit8'],
    weaponWheel: ['Tab'],
    changeCamera: ['KeyV'],
    openMap: ['KeyM'],
    openPhone: ['KeyT'],
    // An incoming call (ui/incomingCalls.js): while the phone rings it takes these keys first, so
    // Enter answers and does not also enter or leave a vehicle.
    callAccept: ['Enter', 'KeyY'],
    callDecline: ['Backspace', 'KeyN'],
  }),
  inVehicle: Object.freeze({
    accelerate: ['KeyW', 'ArrowUp'],
    brake: ['KeyS', 'ArrowDown'],
    steerLeft: ['KeyA', 'ArrowLeft'],
    steerRight: ['KeyD', 'ArrowRight'],
    handbrake: ['Space'],
    // Helicopters: the player writes controls.lift = ascend - descend (a car ignores both; Space
    // stays the handbrake for cars, which a helicopter does not use).
    ascend: ['Space'],
    descend: ['ShiftLeft', 'ControlLeft'],
    exitVehicle: ['KeyF', 'Enter'],
    horn: ['KeyH'],
    headlights: ['KeyL'],
    nextRadioStation: ['KeyE', 'WheelDown'],
    previousRadioStation: ['KeyQ', 'WheelUp'],
    driveByFire: ['Mouse0'],
    lookBehind: ['KeyC'],
    weaponWheel: ['Tab'],
    changeCamera: ['KeyV'],
    openMap: ['KeyM'],
    openPhone: ['KeyT'],
    // An incoming call (ui/incomingCalls.js): while the phone rings it takes these keys first, so
    // Enter answers and does not also enter or leave a vehicle.
    callAccept: ['Enter', 'KeyY'],
    callDecline: ['Backspace', 'KeyN'],
  }),
  // At the controls of a fixed-wing aircraft (player/aircraftPilotControls.js). W pushes the stick
  // forward (nose down), S pulls it back. P is the autopilot here, so the pause is Escape only
  // (CONTEXTS_THAT_SHADOW_ALWAYS). F leaves the aircraft standing still on the ground and moves
  // the flaps otherwise; T held with W / S turns the trim wheel.
  inAircraft: Object.freeze({
    pitchDown: ['KeyW', 'ArrowUp'],
    pitchUp: ['KeyS', 'ArrowDown'],
    rollLeft: ['KeyA'],
    rollRight: ['KeyD'],
    rudderLeft: ['KeyQ'],
    rudderRight: ['KeyE'],
    throttleUp: ['ShiftLeft'],
    throttleDown: ['ControlLeft'],
    flaps: ['KeyX'],
    trim: ['KeyT'],
    gear: ['KeyG'],
    wheelBrakes: ['KeyB', 'Space'],
    autopilot: ['KeyP'],
    autopilotHeading: ['Digit1'],
    autopilotAltitude: ['Digit2'],
    autopilotVerticalSpeed: ['Digit3'],
    autopilotNav: ['Digit4'],
    autoThrottle: ['Digit5'],
    autopilotLeft: ['ArrowLeft'],
    autopilotRight: ['ArrowRight'],
    autopilotUp: ['PageUp'],
    autopilotDown: ['PageDown'],
    bombTargeting: ['KeyR'],
    bombRelease: ['KeyU'],
    exitVehicle: ['KeyF', 'Enter'],
    changeCamera: ['KeyC', 'KeyV'],
    openMap: ['KeyM'],
    callAccept: ['Enter', 'KeyY'],
    callDecline: ['Backspace', 'KeyN'],
  }),
  menu: Object.freeze({
    menuUp: ['ArrowUp', 'KeyW'],
    menuDown: ['ArrowDown', 'KeyS'],
    menuLeft: ['ArrowLeft', 'KeyA'],
    menuRight: ['ArrowRight', 'KeyD'],
    menuAccept: ['Enter', 'Space'],
    menuBack: ['Backspace'],
  }),
  // The menu actions, plus Escape to leave (the menus do not pause the game in this context).
  shop: Object.freeze({
    menuUp: ['ArrowUp', 'KeyW'],
    menuDown: ['ArrowDown', 'KeyS'],
    menuLeft: ['ArrowLeft', 'KeyA'],
    menuRight: ['ArrowRight', 'KeyD'],
    menuAccept: ['Enter', 'Space'],
    menuBack: ['Backspace', 'Escape'],
  }),
  map: Object.freeze({
    mapPanUp: ['KeyW', 'ArrowUp'],
    mapPanDown: ['KeyS', 'ArrowDown'],
    mapPanLeft: ['KeyA', 'ArrowLeft'],
    mapPanRight: ['KeyD', 'ArrowRight'],
    mapZoomIn: ['WheelUp', 'Equal'],
    mapZoomOut: ['WheelDown', 'Minus'],
    mapSetWaypoint: ['Mouse0', 'Enter'],
    closeMap: ['KeyM', 'Backspace'],
  }),
  phone: Object.freeze({
    phoneUp: ['ArrowUp'],
    phoneDown: ['ArrowDown'],
    phoneAccept: ['Enter'],
    phoneBack: ['Backspace'],
    closePhone: ['KeyT'],
    callAccept: ['Enter', 'KeyY'],
    callDecline: ['Backspace', 'KeyN'],
  }),
  cutscene: Object.freeze({
    skipCutscene: ['Enter', 'Space'],
    // A call that rings in a cinematic takes Enter first: it answers and does not skip.
    callAccept: ['Enter', 'KeyY'],
    callDecline: ['Backspace', 'KeyN'],
  }),
});

/**
 * Contexts in which a key bound in the context no longer triggers its 'always' action: flying, P
 * is the autopilot and must not pause the game (Escape still does).
 */
export const CONTEXTS_THAT_SHADOW_ALWAYS = Object.freeze(['inAircraft']);

/** The axes: two actions pull each one to -1 and +1. */
export const CONTROL_AXES = Object.freeze({
  moveX: Object.freeze({ negative: 'moveLeft', positive: 'moveRight' }),
  moveZ: Object.freeze({ negative: 'moveBackward', positive: 'moveForward' }),
  steer: Object.freeze({ negative: 'steerLeft', positive: 'steerRight' }),
  throttle: Object.freeze({ negative: 'brake', positive: 'accelerate' }),
  mapPanX: Object.freeze({ negative: 'mapPanLeft', positive: 'mapPanRight' }),
  mapPanY: Object.freeze({ negative: 'mapPanDown', positive: 'mapPanUp' }),
});

/** What each action is called in the controls menu and in on-screen prompts. */
export const DEFAULT_ACTION_LABELS = Object.freeze({
  pause: 'Pause',
  togglePerformanceOverlay: 'Performance overlay',
  moveForward: 'Walk forward',
  moveBackward: 'Walk backward',
  moveLeft: 'Walk left',
  moveRight: 'Walk right',
  sprint: 'Sprint',
  walk: 'Walk (hold)',
  jump: 'Jump / climb',
  crouch: 'Crouch',
  enterVehicle: 'Enter vehicle',
  interact: 'Interact',
  attack: 'Attack / fire',
  aim: 'Aim',
  reload: 'Reload',
  nextWeapon: 'Next weapon',
  previousWeapon: 'Previous weapon',
  holsterWeapon: 'Holster weapon',
  weaponSlot1: 'Weapon slot 1',
  weaponSlot2: 'Weapon slot 2',
  weaponSlot3: 'Weapon slot 3',
  weaponSlot4: 'Weapon slot 4',
  weaponSlot5: 'Weapon slot 5',
  weaponSlot6: 'Weapon slot 6',
  weaponSlot7: 'Weapon slot 7',
  weaponSlot8: 'Weapon slot 8',
  weaponWheel: 'Weapon wheel (hold)',
  changeCamera: 'Change camera',
  openMap: 'City map',
  openPhone: 'Phone',
  callAccept: 'Answer a call',
  callDecline: 'Decline a call / hang up',
  accelerate: 'Accelerate',
  brake: 'Brake / reverse',
  steerLeft: 'Steer left',
  steerRight: 'Steer right',
  handbrake: 'Handbrake',
  ascend: 'Climb (helicopter)',
  descend: 'Descend (helicopter)',
  exitVehicle: 'Leave vehicle',
  horn: 'Horn / siren',
  headlights: 'Headlights',
  nextRadioStation: 'Next radio station',
  previousRadioStation: 'Previous radio station',
  pitchDown: 'Stick forward (nose down)',
  pitchUp: 'Stick back (nose up)',
  rollLeft: 'Roll left',
  rollRight: 'Roll right',
  rudderLeft: 'Rudder left',
  rudderRight: 'Rudder right',
  throttleUp: 'Throttle up',
  throttleDown: 'Throttle down',
  flaps: 'Flaps (next notch)',
  trim: 'Trim (hold, with stick forward / back)',
  gear: 'Landing gear',
  wheelBrakes: 'Wheel brakes',
  autopilot: 'Autopilot on / off',
  autopilotHeading: 'Autopilot: heading hold (HDG)',
  autopilotAltitude: 'Autopilot: altitude hold (ALT)',
  autopilotVerticalSpeed: 'Autopilot: vertical speed (VS)',
  autopilotNav: 'Autopilot: follow the GPS route (NAV)',
  autoThrottle: 'Auto-throttle (jets)',
  bombTargeting: 'Guided bomb: targeting screen on / off (Manta Sombra)',
  bombRelease: 'Guided bomb: release',
  autopilotLeft: 'Autopilot heading left',
  autopilotRight: 'Autopilot heading right',
  autopilotUp: 'Autopilot target up',
  autopilotDown: 'Autopilot target down',
  driveByFire: 'Fire from vehicle',
  lookBehind: 'Look behind',
  menuUp: 'Up',
  menuDown: 'Down',
  menuLeft: 'Previous choice',
  menuRight: 'Next choice',
  menuAccept: 'Select',
  menuBack: 'Back',
  skipCutscene: 'Skip cutscene',
});
