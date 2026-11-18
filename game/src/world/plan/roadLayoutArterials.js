// The main roads of Marazul, drawn in city coordinates (e east, n north; the grid is turned six
// degrees so that the long east-west roads head 276 degrees when driven westwards): the highway
// that skirts the north and leaves the map at both ends, the ocean boulevard, the avenues that
// tie the districts together, the causeway to Isla Coral and the hill road of Las Lomas.

/**
 * Adds the highway, the avenues, the causeway and the hill roads to a stroke set.
 * @param {ReturnType<typeof import('./roadStrokes.js').createRoadStrokeSet>} set
 */
export function layOutArterialRoads(set) {
  // The through highway: over the wetlands on a causeway from the west, across the Rio Tamarindo
  // on its bridge, along the northern edge of the city, then north-east past the hills and out
  // over the north shore.
  set.add('autopista_del_golfo', 'highway',
    [-2020, 745, -1700, 745, -1300, 745, -600, 745, 0, 745, 340, 745, 520, 800, 720, 975, 900, 1180, 960, 1400, 985, 1720],
    { smooth: true, exitStart: true, exitEnd: true });

  // The two staging streets, dead straight and heading 276 degrees westwards.
  set.add('bulevar_dorado', 'beach_drive', STAGING_STREETS.bulevar_dorado.cityLine);
  set.add('gran_via_marazul', 'grand_avenue', STAGING_STREETS.gran_via_marazul.cityLine);

  set.add('avenida_de_los_fundadores', 'avenue', [200, -860, 200, 745]);
  set.add('avenida_meridiano', 'avenue', [520, -860, 520, 800]);
  set.add('avenida_tamarindo', 'avenue', [-690, -1060, -690, 745]);
  set.add('avenida_del_riel', 'avenue', [-1080, 420, 760, 420]);

  // Around the bay to the east shore, the shore road and the causeway to the island.
  set.add('paseo_bahia', 'avenue', [1085, -860, 1170, -845, 1230, -780, 1245, -700, 1290, -645, 1420, -630, 1560, -630, 1660, -630], { smooth: true });
  set.add('costanera_oriente', 'avenue', [1660, -1050, 1660, 560]);
  set.add('costanera_norte', 'rural_avenue', [1660, 560, 1650, 800, 1600, 1000, 1500, 1150, 1350, 1260, 1150, 1300, 920, 1300], { smooth: true, prefix: 'Costanera' });
  set.add('calzada_coral', 'avenue_bridge', [1660, -1050, 1655, -1150, 1630, -1380, 1605, -1500, 1600, -1580], { smooth: true });
  set.add('vuelta_coral', 'resort_street', ellipse(1600, -1680, 205, 100), { closed: true });

  // Las Lomas: the hill road along the contour, the ring under the summit and its connectors.
  set.add('camino_de_las_lomas', 'avenue', [760, 420, 880, 395, 990, 320, 1090, 245, 1220, 225, 1350, 265, 1455, 370, 1510, 520, 1580, 555, 1660, 560], { smooth: true });
  set.add('vuelta_de_la_loma', 'hill_street', ellipse(1130, 560, 150, 135), { closed: true });
  set.add('subida_del_mirador', 'hill_street', [1090, 245, 1060, 300, 1110, 350, 1130, 425], { smooth: true });
  set.add('bajada_oriente', 'hill_street', [1280, 560, 1360, 590, 1440, 560, 1510, 520], { smooth: true, prefix: 'Bajada' });
  set.add('cresta_norte', 'hill_street', [1130, 695, 1150, 790, 1250, 850, 1340, 930, 1420, 1040, 1500, 1150], { smooth: true, prefix: 'Cresta' });
  set.add('mirador_de_la_loma', 'hill_street', [980, 560, 1040, 575, 1100, 565], { smooth: true, deadEndEnd: true, prefix: 'Mirador' });
}

/**
 * The two long straight streets where the showcase screenshots are staged. Driven westwards they
 * head 276 degrees (the golden-hour sun stands at 286.7 degrees, just right of the vanishing
 * point). `cityLine` is [e0, n0, e1, n1] in city coordinates.
 * @type {Readonly<Record<string, {district: string, cityLine: number[], headingDegrees: number, note: string}>>}
 */
export const STAGING_STREETS = Object.freeze({
  bulevar_dorado: Object.freeze({
    district: 'playa_dorada',
    cityLine: [-690, -860, 1085, -860],
    headingDegrees: 276,
    note: 'The beachfront drive with the palm median: the sea and the sand on the south (left) side when looking west.',
  }),
  gran_via_marazul: Object.freeze({
    district: 'centro',
    cityLine: [-690, -180, 1660, -180],
    headingDegrees: 276,
    note: 'The palm-lined grand avenue through downtown; the towers stand between e -250 and 760.',
  }),
});

// Twelve control points of an ellipse, counter-clockwise from its northern point.
function ellipse(e, n, radiusE, radiusN) {
  const points = [];
  for (let i = 0; i < 12; i += 1) {
    const angle = Math.PI / 2 + (i / 12) * Math.PI * 2;
    points.push(e + Math.cos(angle) * radiusE, n + Math.sin(angle) * radiusN);
  }
  return points;
}
