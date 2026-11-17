// Vehicles: cars, trucks, motorcycles, boats. Written by hand (see index.js).
//
// A vehicle entry promises its moving parts in `nodes` (wheel_fl, wheel_fr, wheel_rl, wheel_rr,
// steer_fl, steer_fr, door_fl, ...), its anchors (anchor_seat_driver, anchor_light_head_l, ...)
// and its role materials (paint, glass, lamp_head, lamp_tail, lamp_brake, ...).

/** @type {Record<string, import('./index.js').AssetEntry>} */
export const VEHICLE_ASSETS = {};
