// Surface clearance: whether a trunk, pole or sign of a given radius may stand at a point, asked
// of the BUILT street (openWorldCity.surfaceAt, streets/streetSurfaceQuery.js: the very numbers
// and junction layouts the street builder meshes). The disc's centre must be on pavement, verge,
// open ground or a planted median, and a ring of probes `radius + margin` round it must touch no
// carriageway, junction surface or crosswalk; an item on a median keeps its whole ring on the
// median. Pure; about thirteen surface queries (0.4 us each) per item.
//
//   const clearance = createSurfaceClearance(city);   // anything with surfaceAt(x, z, out)
//   clearance.isClear(x, z, 0.45)      // false on asphalt or too near it
//   clearance.blockedAt(x, z, 0.45)    // null, or { kind, segment, node, x, z } of the first hit
//   clearance.liftAt(x, z)             // kerb height on a raised pavement or median, else 0

/** Surface kinds no item may stand on or reach over. */
export const ASPHALT_KINDS = Object.freeze(['carriageway', 'junction', 'crosswalk']);

const PROBES = 12;
const DIRECTIONS = Array.from({ length: PROBES }, (_, i) => [Math.cos((i / PROBES) * Math.PI * 2), Math.sin((i / PROBES) * Math.PI * 2)]);
const KERB_HEIGHT = 0.15;

/**
 * Builds the clearance test on a street surface query.
 * @param {{surfaceAt: (x: number, z: number, out?: object) => {kind: string, segment: number, node: number,
 *   raised: boolean, planted: boolean}, crossSection?: (segmentId: number) => ({kerbHeight?: number} | null)}} streets
 * @param {{margin?: number}} [options] Metres an item keeps from the asphalt beyond its radius (default 0.4).
 * @returns {{isClear: (x: number, z: number, radius?: number) => boolean,
 *   blockedAt: (x: number, z: number, radius?: number) => ({kind: string, segment: number, node: number, x: number, z: number} | null),
 *   liftAt: (x: number, z: number) => number}}
 */
export function createSurfaceClearance(streets, options = {}) {
  const margin = options.margin ?? 0.4;
  const hit = {};
  const blocked = (kind, x, z) => ({ kind, segment: hit.segment ?? -1, node: hit.node ?? -1, x, z });

  function blockedAt(x, z, radius = 0.3) {
    streets.surfaceAt(x, z, hit);
    if (ASPHALT_KINDS.includes(hit.kind) || hit.kind === 'kerb') return blocked(hit.kind, x, z);
    const onMedian = hit.kind === 'median';
    if (onMedian && !hit.planted) return blocked('painted median', x, z);
    const reach = radius + margin;
    for (const [cx, cz] of DIRECTIONS) {
      const px = x + cx * reach;
      const pz = z + cz * reach;
      streets.surfaceAt(px, pz, hit);
      if (ASPHALT_KINDS.includes(hit.kind)) return blocked(hit.kind, px, pz);
      if (onMedian !== (hit.kind === 'median')) return blocked(onMedian ? 'median edge' : 'median', px, pz);
    }
    return null;
  }

  return {
    blockedAt,
    /** The same answer under the name the plan clearance (streetClearance.js) uses. */
    carriagewayAt: blockedAt,
    isClear: (x, z, radius = 0.3) => blockedAt(x, z, radius) === null,
    /** The built surface's kind at a point (pavement, verge, median, kerb, carriageway ...). */
    kindAt(x, z) {
      streets.surfaceAt(x, z, hit);
      return hit.kind;
    },
    liftAt(x, z) {
      streets.surfaceAt(x, z, hit);
      if (!hit.raised) return 0;
      const section = hit.segment >= 0 ? streets.crossSection?.(hit.segment) : null;
      return section?.kerbHeight ?? KERB_HEIGHT;
    },
  };
}
