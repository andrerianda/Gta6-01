// Road strokes: the roads of the plan as they are drawn, before they are cut into a graph. A
// stroke is one named road from end to end (an avenue, a street of the grid, a hill curve) as a
// world polyline with a cross-section. The layout modules add strokes in city coordinates; the
// graph assembly finds where they cross and cuts them into segments and intersections.
//
//   const set = createRoadStrokeSet(streetNames);
//   set.add('gran_via_marazul', 'grand_avenue', [-690, -180, 1660, -180]);
//   set.add('camino_de_las_lomas', 'avenue', [760, 420, 880, 395, 990, 320], { smooth: true });

import { cityPointsToWorld } from './cityFrame.js';
import { resamplePolyline, smoothCurve } from './planGeometry.js';
import { ROAD_PROFILES } from './roadSpecifications.js';

/**
 * Creates an empty set of road strokes.
 * @param {Record<string, string>} [streetNames] Names by road key, from the story team; a road
 *   without one gets a neutral invented name.
 * @returns {{strokes: RoadStroke[], add: (key: string, profile: string, cityPoints: number[], options?: RoadStrokeOptions) => RoadStroke}}
 */
export function createRoadStrokeSet(streetNames = {}) {
  const strokes = [];
  let invented = 0;
  return {
    strokes,
    add(key, profile, cityPoints, options = {}) {
      if (!ROAD_PROFILES[profile]) throw new Error(`unknown road profile ${profile}`);
      const smooth = options.smooth === true || options.closed === true;
      const cityLine = smooth ? smoothCurve(cityPoints, 9, options.closed === true) : resamplePolyline(cityPoints, 10);
      let name = streetNames[key] ?? DEFAULT_ROAD_NAMES[key];
      if (!name) {
        name = `${options.prefix ?? 'Calle'} ${INVENTED_NAMES[invented % INVENTED_NAMES.length]}`;
        invented += 1;
      }
      const stroke = {
        id: strokes.length,
        key,
        name,
        profile,
        points: cityPointsToWorld(cityLine),
        closed: options.closed === true,
        exitStart: options.exitStart === true,
        exitEnd: options.exitEnd === true,
        deadEndStart: options.deadEndStart === true,
        deadEndEnd: options.deadEndEnd === true,
      };
      strokes.push(stroke);
      return stroke;
    },
  };
}

/**
 * @typedef {Object} RoadStrokeOptions
 * @property {boolean} [smooth] Draw a smooth curve through the points instead of straight pieces.
 * @property {boolean} [closed] A loop road (always smooth).
 * @property {boolean} [exitStart] The first point is a map exit (the road leaves the city there).
 * @property {boolean} [exitEnd]
 * @property {boolean} [deadEndStart] The first point is a deliberate cul-de-sac.
 * @property {boolean} [deadEndEnd]
 * @property {string} [prefix] 'Calle', 'Camino', 'Callejón'... for an invented name.
 */
/**
 * @typedef {Object} RoadStroke
 * @property {number} id
 * @property {string} key Stable snake_case key of the road (the thoroughfare id for the main ones).
 * @property {string} name
 * @property {string} profile A key of ROAD_PROFILES.
 * @property {number[]} points Flat world polyline, sampled at most every 10 m.
 * @property {boolean} closed
 * @property {boolean} exitStart
 * @property {boolean} exitEnd
 * @property {boolean} deadEndStart
 * @property {boolean} deadEndEnd
 */

/** Names of the main roads when the story team passes none (the same as the districts catalog). */
const DEFAULT_ROAD_NAMES = {
  autopista_del_golfo: 'Autopista del Golfo',
  calzada_coral: 'Calzada Coral',
  bulevar_dorado: 'Bulevar Dorado',
  avenida_de_los_fundadores: 'Avenida de los Fundadores',
  gran_via_marazul: 'Gran Vía Marazul',
  avenida_meridiano: 'Avenida Meridiano',
  avenida_tamarindo: 'Avenida Tamarindo',
  avenida_del_riel: 'Avenida del Riel',
  camino_de_las_lomas: 'Camino de las Lomas',
  paseo_bahia: 'Paseo Bahía',
  costanera_oriente: 'Costanera Oriente',
  vuelta_coral: 'Vuelta Coral',
  ribera_del_tamarindo: 'Ribera del Tamarindo',
  vuelta_de_la_loma: 'Vuelta de la Loma',
  subida_del_mirador: 'Subida del Mirador',
  camino_del_pantano: 'Camino del Pantano',
  camino_de_la_pista: 'Camino de la Pista',
};

// Neutral invented words for the streets nobody named.
const INVENTED_NAMES = [
  'Almendro', 'Brisa', 'Caracola', 'Delfín', 'Espuma', 'Faro', 'Garza', 'Hibisco', 'Iguana', 'Jazmín', 'Laurel', 'Marea',
  'Naranjo', 'Ola', 'Palmera', 'Quetzal', 'Ribera', 'Salina', 'Tortuga', 'Uva', 'Vela', 'Yagua', 'Zafiro', 'Arrecife',
  'Bambú', 'Coral', 'Duna', 'Estrella', 'Flamenco', 'Golondrina', 'Higuera', 'Isleta', 'Jacaranda', 'Lirio', 'Manglar',
  'Nácar', 'Orquídea', 'Pelícano', 'Rocío', 'Sirena', 'Tamarindo Viejo', 'Albatros', 'Bahía Chica', 'Ceiba', 'Dorado',
  'Encanto', 'Fragata', 'Gaviota', 'Horizonte', 'Limonero', 'Mirlo', 'Nube', 'Oleaje', 'Piedra Blanca', 'Remo', 'Sol',
  'Timón', 'Vigía', 'Ancla', 'Bruma', 'Cangrejo', 'Diamante', 'Ébano', 'Fuente', 'Guayabo', 'Halcón', 'Jade', 'Loro',
];
