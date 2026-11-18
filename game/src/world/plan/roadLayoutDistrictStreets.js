// The local streets of Marazul, each district with its own pattern, in city coordinates: the
// tight downtown grid with one-way streets, the bent lanes of the old town, the coarse grid of
// the port and the factories, the resort streets behind the beach and round the bay, the curving
// streets of lower Las Lomas and the few rural roads of the wetlands.

/**
 * Adds the local streets of every district to a stroke set.
 * @param {ReturnType<typeof import('./roadStrokes.js').createRoadStrokeSet>} set
 * @param {import('../../core/random/seededRandom.js').SeededRandom} random Bends the old town.
 */
export function layOutDistrictStreets(set, random) {
  layOutLongStreets(set);
  layOutCentroGrid(set);
  layOutOldTown(set, random.fork('la_marisma'));
  layOutPortAndFactories(set);
  layOutBayAndLowerHills(set);
  layOutWetlandRoads(set);
}

// Streets that run through several districts.
function layOutLongStreets(set) {
  set.add('calle_de_las_palmas', 'resort_street', [-690, -780, 1250, -780]);
  set.add('calle_del_mercado', 'street', [-250, -860, -250, 660]);
  set.add('calle_frontera', 'street', [-690, -430, 1660, -430]);
  set.add('calle_520', 'street', [-250, -520, 1660, -520]);
  set.add('calle_260', 'street', [-690, 260, 760, 260]);
  set.add('calle_540', 'street', [-1080, 540, 520, 540]);
  set.add('calle_del_norte', 'street', [-1080, 660, 520, 660]);
}

// Centro: blocks of about 105 by 85 metres, with one-way pairs.
function layOutCentroGrid(set) {
  for (const e of [-140, -30, 85, 310, 415]) {
    if (e === 85) set.add(`centro_ns_${e}`, 'street_one_way', [e, -860, e, 660]);
    else if (e === 310) set.add(`centro_ns_${e}`, 'street_one_way', [e, 660, e, -860]);
    else set.add(`centro_ns_${e}`, 'street', [e, -860, e, 660]);
  }
  set.add('centro_ns_640', 'street', [640, -860, 640, 420]);
  set.add('calle_oriente', 'street', [760, -860, 760, 420]);
  for (const n of [-690, -605, -350, -265, -95, -10, 75, 160, 340]) {
    if (n === -265) set.add(`centro_ew_${n}`, 'street_one_way', [-250, n, 760, n]);
    else if (n === -95) set.add(`centro_ew_${n}`, 'street_one_way', [760, n, -250, n]);
    else set.add(`centro_ew_${n}`, 'street', [-250, n, 760, n]);
  }
}

// La Marisma: a lattice whose inner corners are pushed about, so no two blocks are alike.
function layOutOldTown(set, random) {
  const columns = [-590, -480, -365];
  const rows = [-660, -560, -305, -60, 30, 160];
  const fixedRows = [-780, -430, -180, 260];
  const corner = columns.map(() => rows.map(() => [random.range(-13, 13), random.range(-10, 10)]));
  columns.forEach((e, c) => {
    // The middle lane runs on north of the old town as the Calle de la Vía, so it ends on its line.
    const stops = fixedRows.map((n) => [c === 1 && n === 260 ? -470 : e + random.range(-12, 12), n]);
    rows.forEach((n, r) => stops.push([e + corner[c][r][0], n + corner[c][r][1]]));
    stops.sort((a, b) => a[1] - b[1]);
    set.add(`marisma_ns_${c}`, 'old_town_street', stops.flat(), { prefix: 'Calle' });
  });
  rows.forEach((n, r) => {
    const line = [-690, n];
    columns.forEach((e, c) => line.push(e + corner[c][r][0], n + corner[c][r][1]));
    line.push(-250, n);
    set.add(`marisma_ew_${r}`, r % 2 === 0 ? 'old_town_street' : 'old_town_lane', line, { prefix: r % 2 === 0 ? 'Calle' : 'Callejón' });
  });
}

// Puerto Tamarindo and Barrio Hierro: wide truck streets on a coarse grid.
function layOutPortAndFactories(set) {
  set.add('ribera_del_tamarindo', 'industrial_street', [-1080, -1060, -1080, 745]);
  set.add('calle_del_muelle', 'service_road', [-1080, -1060, -690, -1060]);
  set.add('calle_de_la_grua', 'service_road', [-1080, -780, -690, -780]);
  set.add('calle_del_astillero', 'industrial_street', [-1080, -470, -690, -470]);
  set.add('calle_de_la_fundicion', 'industrial_street', [-890, -1060, -890, 660]);
  set.add('calle_del_acero', 'industrial_street', [-1080, -180, -690, -180]);
  set.add('calle_del_horno', 'industrial_street', [-1080, 120, -690, 120]);
  set.add('calle_de_la_via', 'industrial_street', [-470, 260, -470, 660]);
}

// Behind the beach, round the bay and up the lower slopes of Las Lomas.
function layOutBayAndLowerHills(set) {
  set.add('bahia_ns_890', 'resort_street', [890, -860, 890, -430]);
  set.add('bahia_ns_1020', 'resort_street', [1020, -860, 1020, -430]);
  set.add('bahia_ns_1200', 'resort_street', [1200, -520, 1200, -430]);
  set.add('bahia_ns_1460', 'resort_street', [1460, -640, 1460, -430]);
  set.add('camino_del_faro', 'resort_street', [1170, -845, 1185, -950, 1200, -1050, 1205, -1120], { smooth: true, deadEndEnd: true });
  set.add('lomas_ew_1', 'street', [760, -350, 900, -335, 1050, -300, 1200, -320, 1400, -300, 1660, -310], { smooth: true, prefix: 'Paseo' });
  set.add('lomas_ew_2', 'street', [760, -10, 900, 5, 1050, 40, 1200, 20, 1350, 60, 1500, 45, 1660, 70], { smooth: true, prefix: 'Paseo' });
  set.add('lomas_ew_3', 'hill_street', [760, 160, 880, 170, 1020, 125, 1180, 110, 1340, 150, 1480, 200, 1660, 225], { smooth: true, prefix: 'Paseo' });
  set.add('lomas_ns_1', 'hill_street', [890, -430, 905, -300, 890, -180, 900, 5, 880, 170, 885, 300, 890, 362], { smooth: true, prefix: 'Subida' });
  set.add('lomas_ns_2', 'hill_street', [1200, -430, 1190, -320, 1205, -180, 1200, 20, 1180, 110, 1220, 225], { smooth: true, prefix: 'Subida' });
  set.add('lomas_ns_3', 'hill_street', [1460, -430, 1450, -300, 1470, -180, 1500, 45, 1480, 200, 1455, 370], { smooth: true, prefix: 'Subida' });
  // The upper slopes: villa streets that wind along the contours, a loop and a cul-de-sac.
  set.add('lomas_poniente', 'hill_street', [850, 375, 810, 450, 830, 540, 900, 590, 980, 560], { smooth: true, prefix: 'Vereda' });
  set.add('lomas_umbria', 'hill_street', [1150, 790, 1050, 820, 960, 800, 900, 720, 900, 590], { smooth: true, prefix: 'Vereda' });
  set.add('lomas_del_norte', 'hill_street', [1050, 820, 1040, 930, 1080, 1050, 1150, 1150, 1150, 1300], { smooth: true, prefix: 'Vereda' });
  set.add('lomas_levante', 'hill_street', [1340, 930, 1430, 900, 1520, 840, 1600, 810, 1650, 800], { smooth: true, prefix: 'Vereda' });
  set.add('lomas_lazo', 'hill_street', [1430, 900, 1470, 980, 1420, 1040], { smooth: true, prefix: 'Lazo' });
  set.add('lomas_rincon', 'hill_street', [1580, 555, 1590, 640, 1560, 720], { smooth: true, deadEndEnd: true, prefix: 'Rincón' });
}

// Los Pantanos: service roads off the highway and a dirt track between them.
function layOutWetlandRoads(set) {
  set.add('camino_del_pantano', 'service_road', [200, 745, 200, 880, 300, 1000, 330, 1150, 300, 1290], { smooth: true, deadEndEnd: true });
  set.add('camino_de_la_pista', 'service_road', [-690, 745, -560, 820, -470, 950, -450, 1100, -480, 1180], { smooth: true, deadEndEnd: true });
  set.add('senda_del_manglar', 'dirt_track', [-450, 1100, -250, 1080, -60, 1030, 120, 1020, 300, 1000], { smooth: true, prefix: 'Senda' });
  set.add('camino_de_la_cienaga', 'service_road', [-1500, 745, -1520, 600, -1480, 450, -1500, 300], { smooth: true, deadEndEnd: true, prefix: 'Camino' });
}
