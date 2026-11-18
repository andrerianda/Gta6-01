// One silhouette per weapon of the weapon catalog, drawn by code as inline SVG on a 64 x 32 grid
// (side view, muzzle to the right, filled with currentColor so the stylesheet colours them), for
// the weapon wheel and the weapon panel. A weapon without its own drawing falls back to its class.
import { WEAPON_CLASS_ICONS } from './hudIcons.js';

const draw = (body) => `<svg viewBox="0 0 64 32" aria-hidden="true" focusable="false"><g fill="currentColor">${body}</g></svg>`;
const guard = (x, y) => `<path d="M${x} ${y}c0 3.2 2.1 4.8 4.6 4.8" fill="none" stroke="currentColor" stroke-width="2"/>`;

/** Weapon id -> SVG markup. */
export const WEAPON_ICONS = Object.freeze({
  fists: draw('<path d="M19 12.5c0-2 1.4-3.2 3-3.2s3 1.2 3 3.2V11c0-2 1.4-3.2 3-3.2s3 1.2 3 3.2v-.6c0-2 1.4-3.2 3-3.2s3 1.2 3 3.2v.9c0-2 1.4-3.1 3-3.1s3 1.1 3 3.1V22c0 4.8-3.8 7.8-8.6 7.8h-6.2c-4 0-7-2-8.2-5.2l-2.8-7.2c-.8-2 .2-3.8 2-4.1 1.6-.3 2.8.7 3.6 2.5z"/>'
    + '<path d="M25 12.5v5M31 11v5.5M37 10.8v5.6" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>'),
  tire_iron: draw('<path d="M5 25.5l39-13.4 1.3 3.2L6.4 28.8z"/><path d="M42.5 11.2l7.2-6.6 2.6 2.4-6.2 7.6z"/>'
    + '<circle cx="52" cy="5.4" r="3.4" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M3 24.6l4.2-1.5 1.3 3.6-4.2 1.5z"/>'),
  baseball_bat: draw('<circle cx="5" cy="22" r="2.8"/><path d="M6.5 20.4l12.5-1.7 26-6.7c5.4-1.4 11.2-.6 12.2 2.4 1 3-3 6-8.6 6.8L21 24.9l-14 1.6z"/>'),
  pistol: draw('<path d="M15 8h37a1.2 1.2 0 011.2 1.2V15H31.5l-1.6 2.6h-3.4L23 28.5h-8.6l3.6-12-2.4-1.6V9.2A1.2 1.2 0 0115 8z"/>'
    + guard(25.5, 17.2) + '<path d="M50 6.4h2.6V8H50z"/>'),
  heavy_revolver: draw('<path d="M35 9h25v4.6H35z"/><rect x="23.5" y="7.6" width="13" height="10" rx="2.2"/>'
    + '<path d="M17 9h7.4v8.6l-1.4 2.2-4.4 9H10l4.8-10.4-1-3.6z"/><path d="M16.4 8.6l-3.4-3.2h3.4l3 3.2z"/>' + guard(26.6, 18)),
  smg: draw('<path d="M12 9h36v3h8.4v3.2H48V18H36.5l-2 2v9h-6v-9h-5l-2.6 6.2h-6.2l2.6-7.4H12z"/><path d="M3 9.6h9.4v2.6H6.2v5.6H3z"/>'),
  pump_shotgun: draw('<path d="M2 15.4l11.4-4.2h48.8v3.4H30v4.2H19.2l-2.6 2.6h-3.6L6.4 26.8H2z"/><rect x="33" y="15.4" width="17.6" height="4.4" rx="1.6"/>'),
  assault_rifle: draw('<path d="M2 13.2l10-2.2h6.2l2-2h28.2V12h11.8v2.6H48.2v2.6H40l-1.6 1.6H32.8l3.2 8.8h-5.6l-3.2-8.4h-4l-2 3.6h-4.6l1.6-4.2H14l-8 5.2H2z"/>'
    + '<path d="M23 6.4h11v2.2H23z"/>'),
  sniper_rifle: draw('<path d="M2 15.4l12-3.2h12l2-1.2h34.4v2.6H36v2.2h-8l-2 2.6h-4l-1.6 3.2h-4.2l1.2-3.2h-3L6 25.6H2z"/>'
    + '<rect x="21" y="4.6" width="17" height="4.6" rx="2.2"/><path d="M25 9h2.2v2.4H25zM31.4 9h2.2v2.4h-2.2z"/>'),
  grenade: draw('<circle cx="31" cy="19" r="9.2"/><path d="M27 7.8h8.4v3.6H27z"/><path d="M35.4 8.6l8.2-4.4 1.4 2.6-8.2 4.4z"/>'
    + '<circle cx="23.6" cy="7.4" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/>'
    + '<path d="M22 15.5h18M22 22.5h18M31 10v18" stroke="rgba(0,0,0,0.3)" stroke-width="1.3"/>'),
  fire_bottle: draw('<path d="M27.6 30.5h9.2a2 2 0 002-2V17.2c0-2.6-3-4.2-3-6.8V7.2h-7.2v3.2c0 2.6-3 4.2-3 6.8v11.3a2 2 0 002 2z"/>'
    + '<path d="M32.2 7.4c-3-1.6-2.2-4.8-.2-6.2-.2 2 3.6 2.4 3.4 5.2z" opacity="0.85"/><path d="M25.6 20h13.2v5H25.6z" fill="rgba(0,0,0,0.3)"/>'),
  rocket_launcher: draw('<path d="M5 11.2h41v8.2H5z"/><path d="M46 9.6h4.4l10.6 5.7-10.6 5.7H46z"/><path d="M1.6 12.4H5v5.8H1.6z"/>'
    + '<path d="M19 19.4h5.6l-2.2 8.4H17zM30.4 19.4h4.6l-1 5.4h-4.6z"/><path d="M24 7h7v4.2h-7z"/>'),
});

/**
 * The silhouette of a weapon.
 * @param {string} weaponId
 * @param {string} [weaponClass] Its class, for the fallback.
 * @returns {string} SVG markup.
 */
export function weaponIconFor(weaponId, weaponClass) {
  return WEAPON_ICONS[weaponId] ?? WEAPON_CLASS_ICONS[weaponClass] ?? WEAPON_ICONS.fists;
}
