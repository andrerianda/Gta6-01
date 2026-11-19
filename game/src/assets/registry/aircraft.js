// The fixed-wing aircraft of the flight phase (art/blender/aircraft/, built by
// art/build_aircraft.py). Written by hand (see index.js).
//
// One contract with the game for all four:
// - Origin on the ground under the centre of gravity, standing on its wheels, facing -Z.
// - lod0..2 and <part>_lod0..2 (wing, detail, cockpit) are the airframe; the cockpit interior is
//   the cockpit_* part. instrument_panel is one flat quad in the material screen_panel that the
//   flight deck paints live (scene extra panel_size, metres).
// - Moving parts show at every level, each with its origin on its hinge: control surfaces
//   (aileron_l/r, elevator, rudder, flap_l/r; elevon_l/r on the flying wing and the delta;
//   rudder_l/r on the twin fins; stabilator_l/r on the interceptor), gear_nose / gear_l / gear_r
//   (scene extra gear_retract: the axis and angle that fold each leg), and what opens to board:
//   door_fl, canopy, hatch and ladder (extras door_open, canopy_open, hatch_open, ladder_down).
//   Hinge extras name Blender axes: x is the game's +X, y the game's -Z, z the game's +Y.
// - Anchors: anchor_seat_driver (hip point), anchor_camera (the pilot's eye, looking forward),
//   anchor_door_driver (where the lead stands to board), anchor_exhaust_n (pointing aft),
//   anchor_wingtip_l/r, anchor_gear_nose/l/r (tyre contact points), anchor_light_landing.
// - Lamps by group: lamp_nav_red (left tip), lamp_nav_green (right), lamp_beacon, lamp_strobe,
//   lamp_landing, and lamp_burner in the nozzles of the jets with an afterburner.
// Every aircraft is over the vehicle defaults in draw calls (each lamp group and each moving
// surface is its own node and material) and in bytes (uncompressed geometry, a 2048 atlas).

//
// The cockpit view has its own model per aircraft (COCKPIT_ASSETS below): the full interior the
// pilot sees, in the aircraft's frame and origin, loaded when the lead boards and shown only in
// the cockpit view (flight/deck/cockpitModel.js).

const AIRCRAFT_ANCHORS = [
  'anchor_seat_driver', 'anchor_camera', 'anchor_door_driver', 'anchor_exhaust_1', 'anchor_wingtip_l', 'anchor_wingtip_r',
  'anchor_gear_nose', 'anchor_gear_l', 'anchor_gear_r', 'anchor_light_landing',
];
const AIRCRAFT_COLLIDERS = ['col_box_fuselage', 'col_box_wing', 'col_box_tail'];
const AIRCRAFT_LAMPS = ['lamp_nav_red', 'lamp_nav_green', 'lamp_beacon', 'lamp_strobe', 'lamp_landing'];
const GEAR_NODES = ['gear_nose', 'gear_l', 'gear_r'];

/**
 * The aircraft assets by id.
 * @type {Readonly<Record<string, import('./index.js').AssetEntry>>}
 */
export const AIRCRAFT_ASSETS = {
  // Gaviota T-2: two-seat high-wing piston trainer, 8.6 m span. Fixed gear, a full cockpit with
  // the six-instrument panel (0.95 x 0.36 m), the pilot's door on the left. Two tintable paints.
  gaviota_t2: {
    file: 'aircraft/gaviota_t2.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: ['lod0', 'wing_lod0', 'cockpit_lod0', 'instrument_panel', 'propeller', 'propeller_blur', 'aileron_l', 'aileron_r',
      'flap_l', 'flap_r', 'elevator', 'rudder', 'door_fl', ...GEAR_NODES],
    anchors: [...AIRCRAFT_ANCHORS, 'anchor_seat_passenger_1'],
    colliders: AIRCRAFT_COLLIDERS,
    materials: ['atlas', 'paint', 'paint_wing', 'glass', 'glass_blur', 'screen_panel', ...AIRCRAFT_LAMPS],
    maxDraws: 32,
    maxBytes: 1200000,
  },
  // Manta Sombra: flying-wing stealth bomber, 46 m span. Glass cockpit (panel 1.7 x 0.45 m),
  // belly hatch and folding ladder, retractable gear, four exhaust anchors.
  manta_sombra: {
    file: 'aircraft/manta_sombra.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: ['lod0', 'detail_lod0', 'cockpit_lod0', 'instrument_panel', 'elevon_l', 'elevon_r', 'hatch', 'ladder', ...GEAR_NODES],
    anchors: [...AIRCRAFT_ANCHORS, 'anchor_seat_passenger_1', 'anchor_exhaust_2', 'anchor_exhaust_3', 'anchor_exhaust_4'],
    colliders: AIRCRAFT_COLLIDERS,
    materials: ['atlas', 'glass', 'screen_panel', ...AIRCRAFT_LAMPS],
    maxTriangles: 30000,
    maxDraws: 22,
    maxBytes: 1700000,
  },
  // Garza Negra: long black high-speed jet, 31 m. Analog cockpit (panel 0.8 x 0.49 m), opening
  // canopy, twin all-moving fins, burner lamps in both nozzles.
  garza_negra: {
    file: 'aircraft/garza_negra.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: ['lod0', 'detail_lod0', 'cockpit_lod0', 'instrument_panel', 'canopy', 'elevon_l', 'elevon_r', 'rudder_l', 'rudder_r', ...GEAR_NODES],
    anchors: [...AIRCRAFT_ANCHORS, 'anchor_seat_passenger_1', 'anchor_exhaust_2'],
    colliders: AIRCRAFT_COLLIDERS,
    materials: ['atlas', 'glass', 'screen_panel', 'lamp_burner', ...AIRCRAFT_LAMPS],
    maxDraws: 24,
    maxBytes: 1500000,
  },
  // Halcón: single-seat interceptor of the Air Guard, exterior only (no instrument panel).
  halcon: {
    file: 'aircraft/halcon.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: ['lod0', 'wing_lod0', 'canopy', 'aileron_l', 'aileron_r', 'flap_l', 'flap_r', 'stabilator_l', 'stabilator_r', 'rudder', ...GEAR_NODES],
    anchors: AIRCRAFT_ANCHORS,
    colliders: AIRCRAFT_COLLIDERS,
    materials: ['atlas', 'glass', 'lamp_burner', ...AIRCRAFT_LAMPS],
    maxDraws: 24,
    maxBytes: 1400000,
  },
};

const COCKPIT_NODES = ['cockpit_shell', 'canopy_glass', 'stick', 'hand_stick', 'throttles', 'hand_throttle'];
const COCKPIT_ANCHORS = ['eye', 'glow_panel', 'glow_console'];

/**
 * The cockpit models by id (art/blender/aircraft/<id>.py through art/build_aircraft.py). They are
 * NOT part of ASSETS: the boot never preloads them; the flight deck fetches one through its own
 * library when the lead boards that aircraft. One baked atlas each, no levels of detail; the live
 * instrument faces (material screen_live) and the combiner glass (hud_glass) are painted by the
 * game. Scene extras: eye [x, y, z] (Blender's frame), fov (degrees), gaze (degrees, negative down).
 * List a model here only once its file is built: a missing file is a failed request.
 * @type {Readonly<Record<string, import('./index.js').AssetEntry>>}
 */
export const COCKPIT_ASSETS = Object.freeze({
  // Manta Sombra: four faceted windscreen panes, four displays, two seats, four throttles on the centre console.
  manta_cockpit: {
    file: 'aircraft/manta_cockpit.glb',
    kind: 'vehicle',
    lods: 1,
    nodes: [...COCKPIT_NODES, 'hud_combiner', 'display_map', 'display_radar', 'display_engines', 'display_cautions'],
    anchors: COCKPIT_ANCHORS,
    materials: ['canopy_glass', 'screen_live', 'hud_glass'],
    maxBytes: 1363149, // 1.3 MiB: one 2048 atlas of a whole interior
  },
  // Garza Negra: a narrow analog cockpit with a centre frame, twelve round gauges, two throttles on the left console.
  garza_cockpit: {
    file: 'aircraft/garza_cockpit.glb',
    kind: 'vehicle',
    lods: 1,
    nodes: [...COCKPIT_NODES, 'hud_combiner', 'gauge_airspeed', 'gauge_mach', 'gauge_attitude', 'gauge_altitude', 'gauge_heading',
      'gauge_vsi', 'gauge_skin_temp', 'gauge_egt_l', 'gauge_egt_r', 'gauge_rpm_l', 'gauge_rpm_r', 'gauge_fuel'],
    anchors: COCKPIT_ANCHORS,
    materials: ['canopy_glass', 'screen_live', 'hud_glass'],
    maxBytes: 1153433, // 1.1 MiB
  },
  // Gaviota T-2: the trainer's side-by-side cabin, a yoke, the six flight gauges plus rpm and fuel, no combiner.
  gaviota_cockpit: {
    file: 'aircraft/gaviota_cockpit.glb',
    kind: 'vehicle',
    lods: 1,
    nodes: [...COCKPIT_NODES, 'gauge_airspeed', 'gauge_attitude', 'gauge_altitude', 'gauge_turn', 'gauge_heading', 'gauge_vsi',
      'gauge_rpm', 'gauge_fuel'],
    anchors: COCKPIT_ANCHORS,
    materials: ['canopy_glass', 'screen_live'],
    maxBytes: 734003, // 0.7 MiB
  },
});

/** The cockpit model of each aircraft that has one built (aircraft asset id to COCKPIT_ASSETS id). */
export const COCKPIT_OF_AIRCRAFT = Object.freeze({
  manta_sombra: 'manta_cockpit',
  garza_negra: 'garza_cockpit',
  gaviota_t2: 'gaviota_cockpit',
});
