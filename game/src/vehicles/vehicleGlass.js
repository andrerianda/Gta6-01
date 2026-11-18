// Run-time tuning of vehicle glass, once per asset (glass is shared by every car of a model).
// - Window glass ('glass': windscreen, door and side panes) was dark and nearly opaque from
//   outside (sports cars 0.72 over a near-black tint, trucks 0.62), so a seated driver's face did
//   not show. It is lightened a little: less opaque, a slightly paler tint, still reflective.
// - Roof and fastback glass ('glass_rear', which the chase camera looks down on) is made darker
//   and nearly solid, and keeps part of its sky reflection at night: at night the cut reflection
//   let the tan seats show through the coupe's long rear pane, which reads as its roof.
// The merged middle/far levels darken glass in their own vertex colours (vehicleMergedLevels.js
// GLASS_SHADE), using the same window shade so near and far read alike.

/** Window glass: opacity is scaled by this, then kept within the range below. */
export const WINDOW_OPACITY_SCALE = 0.82;
export const WINDOW_OPACITY_MIN = 0.3;
export const WINDOW_OPACITY_MAX = 0.52;
/** Window glass tint: lifted toward this linear grey-blue by WINDOW_TINT_LIFT. */
export const WINDOW_TINT = Object.freeze({ r: 0.16, g: 0.2, b: 0.22 });
export const WINDOW_TINT_LIFT = 0.35;
/**
 * Roof / rear glass: at least this opaque, tint scaled by ROOF_TINT_SCALE. At night (exposure
 * ~2.8) even 0.95 let the coupe's tan seats glow through its fastback pane (GPU, shift 11,
 * /tmp/marazul/vehicle-system/g5-night-roof.jpg), so it is solid: a dark reflective pane.
 */
export const ROOF_OPACITY_MIN = 1;
export const ROOF_TINT_SCALE = 0.6;
/** Share of the day sky reflection roof glass keeps at full night (other materials keep 0.28). */
export const ROOF_NIGHT_REFLECTION = 0.6;

const tunedAssets = new WeakSet();

/**
 * The tuned look of one glass material, from its source values (pure, for tests).
 * @param {string} name The material name ('glass', 'glass_rear', ...).
 * @param {{opacity: number, color: {r: number, g: number, b: number}}} source As loaded.
 * @returns {{opacity: number, color: {r: number, g: number, b: number}, nightReflection?: number} | null}
 *   The new values, or null for glass this leaves alone (lamp lenses, rotor blur discs).
 */
export function tunedGlassLook(name, source) {
  const { r, g, b } = source.color;
  if (name === 'glass') {
    const opacity = Math.min(WINDOW_OPACITY_MAX, Math.max(WINDOW_OPACITY_MIN, source.opacity * WINDOW_OPACITY_SCALE));
    const lift = (c, t) => c + (Math.max(c, t) - c) * WINDOW_TINT_LIFT;
    return { opacity: Math.min(opacity, source.opacity), color: { r: lift(r, WINDOW_TINT.r), g: lift(g, WINDOW_TINT.g), b: lift(b, WINDOW_TINT.b) } };
  }
  if (name === 'glass_rear' || name === 'glass_roof') {
    return {
      opacity: Math.max(ROOF_OPACITY_MIN, source.opacity),
      color: { r: r * ROOF_TINT_SCALE, g: g * ROOF_TINT_SCALE, b: b * ROOF_TINT_SCALE },
      nightReflection: ROOF_NIGHT_REFLECTION,
    };
  }
  return null;
}

/**
 * Tunes a vehicle asset's glass materials once (later calls do nothing). The source values stay
 * in userData.sourceGlass so a probe can compare.
 * @param {{materials: Map<string, object>}} asset A loaded vehicle asset.
 */
export function tuneVehicleGlass(asset) {
  if (!asset?.materials || tunedAssets.has(asset)) return;
  tunedAssets.add(asset);
  for (const [name, material] of asset.materials) {
    if (!material?.color || typeof material.opacity !== 'number') continue;
    const source = { opacity: material.opacity, color: { r: material.color.r, g: material.color.g, b: material.color.b } };
    const look = tunedGlassLook(name, source);
    if (!look) continue;
    material.userData.sourceGlass = source;
    material.opacity = look.opacity;
    material.color.setRGB(look.color.r, look.color.g, look.color.b);
    if (look.nightReflection !== undefined) material.userData.nightReflection = look.nightReflection;
    material.needsUpdate = true;
  }
}
