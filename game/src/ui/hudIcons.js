// The interface's icons as inline SVG markup: the wanted star, health and armour, a silhouette
// per weapon class, and the glyphs of the minimap blips and the phone's apps. Drawn on a 24 unit
// grid with currentColor, so the stylesheet colours them.

const svg = (body, viewBox = '0 0 24 24') =>
  `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

/** The five-pointed wanted star. */
export const STAR_ICON = svg('<path d="M12 1.8l3.05 6.6 7.2.8-5.37 4.88 1.5 7.1L12 17.6l-6.38 3.58 1.5-7.1L1.75 9.2l7.2-.8z" fill="currentColor"/>');

/** Health: a rounded cross. */
export const HEALTH_ICON = svg('<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="currentColor" stroke-linejoin="round"/>');

/** Armour: a shield. */
export const ARMOUR_ICON = svg('<path d="M12 2l8 3v6.2c0 5-3.4 9.1-8 10.8-4.6-1.7-8-5.8-8-10.8V5z" fill="currentColor"/>');

/** One silhouette per weapon class of the weapon catalog (`class`), on a 48 x 24 grid. */
export const WEAPON_CLASS_ICONS = Object.freeze({
  unarmed: svg('<path d="M17 6h11a3 3 0 013 3v2h3a3 3 0 013 3v3a5 5 0 01-5 5H20a4 4 0 01-4-4v-3h-2a2 2 0 010-4h3V9a3 3 0 010-3z" fill="currentColor"/>', '0 0 48 24'),
  melee: svg('<path d="M4 17l26-11 3 1-1 3L6 21l-3-1z M30 5l8-3 3 3-3 8-3-1 2-5-4 1z" fill="currentColor"/>', '0 0 48 24'),
  handgun: svg('<path d="M10 6h28v6H22l-1 3h-4l-2 7H9l3-10h-2z" fill="currentColor"/>', '0 0 48 24'),
  smg: svg('<path d="M4 7h36v3h4v3H28l-2 2h-3v6h-5v-6h-4l-2 6H8l2-8H4z" fill="currentColor"/>', '0 0 48 24'),
  shotgun: svg('<path d="M2 8h44v3H24l-2 3H14l-6 6H2l4-8H2z" fill="currentColor"/>', '0 0 48 24'),
  rifle: svg('<path d="M2 9h42v3h3v2H30l-4 2v5h-4v-5h-6l-6 5H4l4-7H2z M18 6h10v3H18z" fill="currentColor"/>', '0 0 48 24'),
  sniper: svg('<path d="M1 10h44v3H28l-3 2H14l-6 5H2l4-7H1z M16 5h12v4H16z" fill="currentColor"/>', '0 0 48 24'),
  thrown: svg('<circle cx="24" cy="14" r="7" fill="currentColor"/><path d="M21 4h6v4h-6z M27 5l6-2 1 3-6 2z" fill="currentColor"/>', '0 0 48 24'),
  heavy: svg('<path d="M2 8h34l6-3h4v14h-4l-6-3H22l-2 5h-5l1-5H2z" fill="currentColor"/>', '0 0 48 24'),
});

/** The phone's app glyphs. */
export const PHONE_APP_ICONS = Object.freeze({
  contacts: svg('<circle cx="12" cy="8" r="4.2" fill="currentColor"/><path d="M4 20c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5z" fill="currentColor"/>'),
  messages: svg('<path d="M3 5h18v11H9l-5 4v-4H3z" fill="currentColor"/>'),
  map: svg('<path d="M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2z M9 3v16 M15 5v16" fill="currentColor" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>'),
  settings: svg('<path d="M10.3 2h3.4l.6 2.7 2 1 2.5-1.3 2.4 2.4-1.3 2.5.9 2 2.7.6v3.4l-2.7.6-.9 2 1.3 2.5-2.4 2.4-2.5-1.3-2 .9-.6 2.7h-3.4l-.6-2.7-2-.9-2.5 1.3-2.4-2.4 1.3-2.5-.9-2L1.5 13.7v-3.4l2.7-.6.9-2-1.3-2.5 2.4-2.4 2.5 1.3 2-1zM12 8.4a3.6 3.6 0 100 7.2 3.6 3.6 0 000-7.2z" fill="currentColor" fill-rule="evenodd"/>'),
  save: svg('<path d="M4 3h13l3 3v15H4z M7 3v6h9V3 M7 14h10v7H7z" fill="currentColor" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>'),
  taxi: svg('<path d="M5 11l2-5h10l2 5h1a1 1 0 011 1v5h-2v2h-3v-2H8v2H5v-2H3v-5a1 1 0 011-1z M9 3h6v2H9z" fill="currentColor"/>'),
});
