// The default keyboard and mouse bindings of MARAZUL, by action id: on foot, in road vehicles,
// in boats and helicopters, in the weapon and radio wheels, the phone and the menus. Each action
// carries the label the controls menu shows and the key cap that on-screen prompts draw.
// Plain frozen data, no imports.
//
// `codes` are KeyboardEvent.code values, or Mouse0 (left), Mouse1 (middle), Mouse2 (right),
// WheelUp and WheelDown. The first code is the primary binding (shown in prompts); the rest are
// alternatives. `hold` is the number of seconds the input must be held, `whileHeld` true means
// the action lasts as long as the key is down. The player may rebind anything; two actions may
// share a code only when their contexts cannot be active together.

/**
 * The actions keyed by id.
 * @type {Readonly<Record<string, object>>}
 */
export const PLAYER_CONTROLS = freezeCatalog({
  // On foot
  move_forward: bind('move_forward', 'on_foot', 'Move forward', ['KeyW', 'ArrowUp'], 'W', { whileHeld: true }),
  move_back: bind('move_back', 'on_foot', 'Move back', ['KeyS', 'ArrowDown'], 'S', { whileHeld: true }),
  move_left: bind('move_left', 'on_foot', 'Move left', ['KeyA', 'ArrowLeft'], 'A', { whileHeld: true }),
  move_right: bind('move_right', 'on_foot', 'Move right', ['KeyD', 'ArrowRight'], 'D', { whileHeld: true }),
  sprint: bind('sprint', 'on_foot', 'Sprint', ['ShiftLeft', 'ShiftRight'], 'Shift', { whileHeld: true }),
  jump: bind('jump', 'on_foot', 'Jump / climb', ['Space'], 'Space'),
  crouch: bind('crouch', 'on_foot', 'Crouch (toggle)', ['KeyC', 'ControlLeft'], 'C'),
  enter_vehicle: bind('enter_vehicle', 'on_foot', 'Enter or steal vehicle', ['KeyF'], 'F'),
  interact: bind('interact', 'on_foot', 'Interact / start marker / talk', ['KeyE'], 'E'),
  aim: bind('aim', 'on_foot', 'Aim / scope', ['Mouse2'], 'RMB', { whileHeld: true }),
  fire: bind('fire', 'on_foot', 'Fire / punch / throw', ['Mouse0'], 'LMB', { whileHeld: true }),
  quick_melee: bind('quick_melee', 'on_foot', 'Quick melee', ['KeyQ'], 'Q'),
  reload: bind('reload', 'on_foot', 'Reload', ['KeyR'], 'R'),
  holster_weapon: bind('holster_weapon', 'on_foot', 'Holster weapon', ['KeyX'], 'X'),
  next_weapon: bind('next_weapon', 'on_foot', 'Next weapon', ['WheelDown'], 'Wheel'),
  previous_weapon: bind('previous_weapon', 'on_foot', 'Previous weapon', ['WheelUp'], 'Wheel'),
  weapon_wheel: bind('weapon_wheel', 'on_foot', 'Weapon wheel', ['Tab'], 'Tab', { whileHeld: true }),
  phone_camera: bind('phone_camera', 'on_foot', 'Phone camera (photograph)', ['KeyG'], 'G', { whileHeld: true }),
  // Road vehicles (cars, trucks, motorcycles)
  accelerate: bind('accelerate', 'vehicle', 'Accelerate', ['KeyW', 'ArrowUp'], 'W', { whileHeld: true }),
  brake_reverse: bind('brake_reverse', 'vehicle', 'Brake / reverse', ['KeyS', 'ArrowDown'], 'S', { whileHeld: true }),
  steer_left: bind('steer_left', 'vehicle', 'Steer left', ['KeyA', 'ArrowLeft'], 'A', { whileHeld: true }),
  steer_right: bind('steer_right', 'vehicle', 'Steer right', ['KeyD', 'ArrowRight'], 'D', { whileHeld: true }),
  handbrake: bind('handbrake', 'vehicle', 'Handbrake', ['Space'], 'Space', { whileHeld: true }),
  nitro: bind('nitro', 'vehicle', 'Nitro', ['ShiftLeft', 'ShiftRight'], 'Shift'),
  exit_vehicle: bind('exit_vehicle', 'vehicle', 'Exit vehicle', ['KeyF'], 'F'),
  horn_siren: bind('horn_siren', 'vehicle', 'Horn (tap) / siren (emergency vehicles)', ['KeyH'], 'H'),
  headlights: bind('headlights', 'vehicle', 'Headlights', ['KeyL'], 'L'),
  look_behind: bind('look_behind', 'vehicle', 'Look behind', ['KeyB', 'Mouse1'], 'B', { whileHeld: true }),
  drive_by_aim: bind('drive_by_aim', 'vehicle', 'Aim from the window', ['Mouse2'], 'RMB', { whileHeld: true }),
  drive_by_fire: bind('drive_by_fire', 'vehicle', 'Fire from the window', ['Mouse0'], 'LMB', { whileHeld: true }),
  vehicle_job: bind('vehicle_job', 'vehicle', 'Start vehicle job (taxi, tow, courier, bus, ambulance)', ['KeyY'], 'Y'),
  tow_hook: bind('tow_hook', 'vehicle', 'Hook / release tow', ['KeyG'], 'G', { hold: 3 }),
  radio_wheel: bind('radio_wheel', 'vehicle', 'Radio wheel', ['KeyQ'], 'Q', { whileHeld: true }),
  radio_next: bind('radio_next', 'vehicle', 'Next station', ['Period', 'WheelDown'], '.'),
  radio_previous: bind('radio_previous', 'vehicle', 'Previous station', ['Comma', 'WheelUp'], ','),
  bike_lean_forward: bind('bike_lean_forward', 'vehicle', 'Lean forward (motorcycles)', ['ControlLeft'], 'Ctrl', { whileHeld: true }),
  bike_lean_back: bind('bike_lean_back', 'vehicle', 'Lean back / wheelie (motorcycles)', ['KeyX'], 'X', { whileHeld: true }),
  reset_vehicle: bind('reset_vehicle', 'vehicle', 'Flip vehicle upright (when stopped)', ['KeyR'], 'R', { hold: 1 }),
  // Boats
  boat_throttle: bind('boat_throttle', 'boat', 'Throttle', ['KeyW', 'ArrowUp'], 'W', { whileHeld: true }),
  boat_reverse: bind('boat_reverse', 'boat', 'Reverse', ['KeyS', 'ArrowDown'], 'S', { whileHeld: true }),
  boat_steer_left: bind('boat_steer_left', 'boat', 'Steer left', ['KeyA', 'ArrowLeft'], 'A', { whileHeld: true }),
  boat_steer_right: bind('boat_steer_right', 'boat', 'Steer right', ['KeyD', 'ArrowRight'], 'D', { whileHeld: true }),
  boat_trim: bind('boat_trim', 'boat', 'Trim the bow down (holds speed in chop)', ['Space'], 'Space', { whileHeld: true }),
  boat_exit: bind('boat_exit', 'boat', 'Leave the helm', ['KeyF'], 'F'),
  // Helicopters
  heli_ascend: bind('heli_ascend', 'helicopter', 'Climb', ['KeyW'], 'W', { whileHeld: true }),
  heli_descend: bind('heli_descend', 'helicopter', 'Descend', ['KeyS'], 'S', { whileHeld: true }),
  heli_yaw_left: bind('heli_yaw_left', 'helicopter', 'Turn left', ['KeyA'], 'A', { whileHeld: true }),
  heli_yaw_right: bind('heli_yaw_right', 'helicopter', 'Turn right', ['KeyD'], 'D', { whileHeld: true }),
  heli_pitch_forward: bind('heli_pitch_forward', 'helicopter', 'Nose down (fly forward)', ['ArrowUp'], 'Up', { whileHeld: true }),
  heli_pitch_back: bind('heli_pitch_back', 'helicopter', 'Nose up (slow, fly back)', ['ArrowDown'], 'Down', { whileHeld: true }),
  heli_roll_left: bind('heli_roll_left', 'helicopter', 'Bank left', ['ArrowLeft'], 'Left', { whileHeld: true }),
  heli_roll_right: bind('heli_roll_right', 'helicopter', 'Bank right', ['ArrowRight'], 'Right', { whileHeld: true }),
  heli_exit: bind('heli_exit', 'helicopter', 'Leave the helicopter (when landed)', ['KeyF'], 'F'),
  // Fixed-wing aircraft (the input context inAircraft of core/input/controlBindings.js)
  plane_pitch_down: bind('plane_pitch_down', 'aircraft', 'Stick forward (nose down)', ['KeyW', 'ArrowUp'], 'W', { whileHeld: true }),
  plane_pitch_up: bind('plane_pitch_up', 'aircraft', 'Stick back (nose up)', ['KeyS', 'ArrowDown'], 'S', { whileHeld: true }),
  plane_roll_left: bind('plane_roll_left', 'aircraft', 'Roll left', ['KeyA'], 'A', { whileHeld: true }),
  plane_roll_right: bind('plane_roll_right', 'aircraft', 'Roll right', ['KeyD'], 'D', { whileHeld: true }),
  plane_rudder_left: bind('plane_rudder_left', 'aircraft', 'Rudder left (steers the nose wheel on the ground)', ['KeyQ'], 'Q', { whileHeld: true }),
  plane_rudder_right: bind('plane_rudder_right', 'aircraft', 'Rudder right', ['KeyE'], 'E', { whileHeld: true }),
  plane_throttle_up: bind('plane_throttle_up', 'aircraft', 'Throttle up', ['ShiftLeft'], 'Shift', { whileHeld: true }),
  plane_throttle_down: bind('plane_throttle_down', 'aircraft', 'Throttle down', ['ControlLeft'], 'Ctrl', { whileHeld: true }),
  plane_flaps: bind('plane_flaps', 'aircraft', 'Flaps, next notch (also F while moving)', ['KeyX'], 'X'),
  plane_trim: bind('plane_trim', 'aircraft', 'Trim: hold with stick forward / back (realistic mode)', ['KeyT'], 'T', { whileHeld: true }),
  plane_gear: bind('plane_gear', 'aircraft', 'Landing gear up / down', ['KeyG'], 'G'),
  plane_brakes: bind('plane_brakes', 'aircraft', 'Wheel brakes', ['KeyB', 'Space'], 'B', { whileHeld: true }),
  plane_autopilot: bind('plane_autopilot', 'aircraft', 'Autopilot on / off', ['KeyP'], 'P'),
  plane_autopilot_hdg: bind('plane_autopilot_hdg', 'aircraft', 'Autopilot: heading hold (HDG)', ['Digit1'], '1'),
  plane_autopilot_alt: bind('plane_autopilot_alt', 'aircraft', 'Autopilot: altitude hold (ALT)', ['Digit2'], '2'),
  plane_autopilot_vs: bind('plane_autopilot_vs', 'aircraft', 'Autopilot: vertical speed (VS)', ['Digit3'], '3'),
  plane_autopilot_nav: bind('plane_autopilot_nav', 'aircraft', 'Autopilot: follow the GPS route (NAV)', ['Digit4'], '4'),
  plane_auto_throttle: bind('plane_auto_throttle', 'aircraft', 'Auto-throttle (jets)', ['Digit5'], '5'),
  plane_autopilot_heading: bind('plane_autopilot_heading', 'aircraft', 'Autopilot heading bug left / right', ['ArrowLeft', 'ArrowRight'], 'Left / Right', { whileHeld: true }),
  plane_autopilot_target: bind('plane_autopilot_target', 'aircraft', 'Autopilot altitude or vertical-speed target up / down', ['PageUp', 'PageDown'], 'PgUp / PgDn', { whileHeld: true }),
  plane_camera: bind('plane_camera', 'aircraft', 'Camera: cockpit, chase, outside', ['KeyC', 'KeyV'], 'C'),
  plane_exit: bind('plane_exit', 'aircraft', 'Leave the aircraft (standing still on the ground)', ['KeyF', 'Enter'], 'F'),
  // Always available
  phone: bind('phone', 'global', 'Phone (contacts, messages, map, jobs)', ['KeyT'], 'T'),
  city_map: bind('city_map', 'global', 'City map', ['KeyM'], 'M'),
  switch_lead: bind('switch_lead', 'global', 'Switch between Dez and Sol', ['KeyZ'], 'Z', { hold: 0.6 }),
  camera_cycle: bind('camera_cycle', 'global', 'Change camera distance', ['KeyV'], 'V'),
  minimap_zoom: bind('minimap_zoom', 'global', 'Zoom minimap', ['KeyN'], 'N'),
  use_first_aid: bind('use_first_aid', 'global', 'Use first-aid kit', ['KeyJ'], 'J'),
  call_backup: bind('call_backup', 'global', 'Call faction backup', ['KeyK'], 'K', { hold: 1 }),
  activity_quit: bind('activity_quit', 'global', 'Quit the current job or race', ['Backspace'], 'Backspace', { hold: 1.5 }),
  skip_cutscene: bind('skip_cutscene', 'global', 'Skip cutscene / next subtitle', ['Enter'], 'Enter'),
  quick_save: bind('quick_save', 'global', 'Quick save (inside an owned safehouse)', ['F5'], 'F5'),
  pause: bind('pause', 'global', 'Pause menu', ['Escape', 'KeyP'], 'Esc'),
  screenshot_mode: bind('screenshot_mode', 'global', 'Photo mode (hides the HUD)', ['F2'], 'F2'),
  // Menus, phone and wheels
  menu_up: bind('menu_up', 'menu', 'Up', ['ArrowUp', 'KeyW'], 'Up'),
  menu_down: bind('menu_down', 'menu', 'Down', ['ArrowDown', 'KeyS'], 'Down'),
  menu_left: bind('menu_left', 'menu', 'Left / previous tab', ['ArrowLeft', 'KeyA'], 'Left'),
  menu_right: bind('menu_right', 'menu', 'Right / next tab', ['ArrowRight', 'KeyD'], 'Right'),
  menu_accept: bind('menu_accept', 'menu', 'Accept', ['Enter', 'Mouse0', 'KeyE'], 'Enter'),
  menu_back: bind('menu_back', 'menu', 'Back', ['Escape', 'Mouse2', 'Backspace'], 'Esc'),
});

/** The input contexts; exactly one of the first four is active, global is always active unless a menu is open. */
export const CONTROL_CONTEXTS = freezeCatalog({
  on_foot: { id: 'on_foot', name: 'On foot', activeWhen: 'The lead is walking, running, swimming or in cover.' },
  vehicle: { id: 'vehicle', name: 'Driving and riding', activeWhen: 'The lead drives a car, truck or motorcycle.' },
  boat: { id: 'boat', name: 'Boats', activeWhen: 'The lead is at the helm of a watercraft. Radio and weapon actions come from the vehicle context.', inherits: 'vehicle' },
  helicopter: { id: 'helicopter', name: 'Helicopters', activeWhen: 'The lead flies an aircraft.', inherits: 'vehicle' },
  aircraft: { id: 'aircraft', name: 'Aircraft', activeWhen: 'The lead flies a fixed-wing aircraft. P is the autopilot here: pause with Escape.' },
  global: { id: 'global', name: 'General', activeWhen: 'Always, except while a menu, the phone or the map is open.' },
  menu: { id: 'menu', name: 'Menus and phone', activeWhen: 'The pause menu, the phone, the map, a shop or a wheel is open.' },
});

/** Direct weapon-slot keys (Digit1 to Digit8 select the weapon wheel slot of that index plus one). */
export const WEAPON_SLOT_KEYS = Object.freeze(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8']);

/** Mouse and camera defaults, shown as sliders and switches in the controls menu. */
export const MOUSE_AND_CAMERA_SETTINGS = freezeCatalog({
  pointerLock: true,
  sensitivity: { default: 1, min: 0.2, max: 3, radiansPerPixel: 0.0022 },
  aimSensitivityMultiplier: { default: 0.6, min: 0.2, max: 1 },
  invertY: false,
  cameraDistances: { on_foot: [3.2, 4.6, 6.5], vehicle: [5.5, 7.5, 10.5], boat: [8, 11, 15], helicopter: [12, 16, 22] },
  fieldOfViewDegrees: { default: 60, min: 50, max: 80, aim: 42, speedBoost: 8 },
  vehicleCameraRecentreSeconds: 1.5,
  aimAssist: true,
  holdToSprint: true,
  promptStyle: { keyCapColor: '#F4F1E8', keyCapTextColor: '#1E1E20', actionTextColor: '#FFFFFF' },
});

/** Builds one binding. */
function bind(id, context, label, codes, keyCap, extra) {
  return { id, context, label, codes, keyCap, hold: 0, whileHeld: false, ...(extra || {}) };
}

/** Recursively freezes a plain data tree so that no system can mutate the shared catalog. */
function freezeCatalog(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) freezeCatalog(value[key]);
  }
  return value;
}
