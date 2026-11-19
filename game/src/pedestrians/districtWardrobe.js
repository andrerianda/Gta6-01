// The crowd's clothes by district: each district has a palette that suits it (the beach in
// sun-faded corals, teals and whites; downtown and the hills in navy, grey, white and camel; the
// port in hi-vis, navy, khaki and rust; the barrios in dark denim, black, deep red and olive), and
// most passers-by there wear it on top of their archetype's cut (the palette replaces the
// garments' colours, the base model's prints and weaves stay). Two people near each other never
// wear the same base in the same colours. Uniforms, swimwear, sportswear and gang colours keep
// the archetype's own. Pure (Node-tested).

/** Colour palettes of the four kinds of street (tops: shirts, tees, jackets; bottoms: trousers, skirts). */
export const DISTRICT_PALETTES = Object.freeze({
  beach: Object.freeze({
    tops: ['#E8806A', '#F2A58E', '#3FA7A0', '#7CC6BE', '#F4EFE4', '#FFFFFF', '#F2D58A', '#9AC1E0', '#E86F8A', '#C9E4D6'],
    bottoms: ['#F1EADB', '#D9C7A5', '#6E8FAE', '#3B5C7A', '#FFFFFF', '#C98F6B', '#4F8F8A'],
  }),
  office: Object.freeze({
    tops: ['#FFFFFF', '#DDE3EA', '#9DB4CC', '#1F2E4A', '#5B6470', '#C8A980', '#EDE6D8', '#7A8FA6', '#3D4A5C'],
    bottoms: ['#1C2638', '#2E3440', '#55595F', '#8A8F96', '#B89C74', '#2A2A2E', '#3F4A5A'],
  }),
  port: Object.freeze({
    tops: ['#E8F03A', '#F07B1F', '#1E2D4D', '#8C8462', '#A0522D', '#5E6B4A', '#D9D4C5', '#2F3B47'],
    bottoms: ['#1E2D4D', '#6F6A52', '#3A3D40', '#2E4057', '#7A5A3A', '#2B2B2B'],
  }),
  barrio: Object.freeze({
    tops: ['#1C1C1E', '#7A1F24', '#5A6235', '#2B3A55', '#E9E4DA', '#9B2D30', '#45484D', '#C7A25A', '#3E2F28'],
    bottoms: ['#22304A', '#1A1A1C', '#34465F', '#4A4E3A', '#2E2A27', '#5A2427'],
  }),
});

/** Which palette each district dresses in. */
export const DISTRICT_STYLE = Object.freeze({
  playa_dorada: 'beach', isla_coral: 'beach', bahia_vista: 'beach',
  centro: 'office', las_lomas: 'office',
  puerto_tamarindo: 'port',
  barrio_hierro: 'barrio', la_marisma: 'barrio', los_pantanos: 'barrio',
});

/** Archetypes whose clothes are a uniform, swimwear or sportswear: never redressed. */
const OWN_CLOTHES = new Set(['hotel_staff', 'sunbather', 'surfer', 'jogger', 'mechanic', 'base_guard', 'base_ground_crew', 'base_officer', 'norvast_soldier']);
/** Share of passers-by who wear the district's palette (the rest wear the archetype's colours). */
export const DISTRICT_SHARE = 0.7;
/** Metres within which two people must not wear the same base in the same colours. */
export const NEIGHBOUR_RADIUS = 6;

const pick = (list, random) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

/**
 * Whether two people would look alike: the same base model in the same garment colours.
 * @param {{assetId?: string, look: {paints: Record<string, string>}}} a
 * @param {{assetId?: string, look: {paints: Record<string, string>}}} b
 */
export function dressedAlike(a, b) {
  const p = a.look.paints, q = b.look.paints;
  return (a.assetId ?? null) === (b.assetId ?? null) && p.paint_jacket === q.paint_jacket && p.paint_top === q.paint_top && p.paint_bottom === q.paint_bottom;
}

/**
 * Dresses one person for their district (changes look.paints in place) and makes sure nobody
 * in `neighbours` wears the same base in the same colours.
 * @param {{id?: string, factionId?: string}} archetype
 * @param {{paints: Record<string, string>}} look From pickAppearance.
 * @param {string} assetId The body's base model.
 * @param {string | null} districtId
 * @param {() => number} random
 * @param {{assetId?: string, look: object}[]} [neighbours] People within NEIGHBOUR_RADIUS.
 * @returns {object} The same look.
 */
export function dressForDistrict(archetype, look, assetId, districtId, random, neighbours = []) {
  if (!look || !look.paints || archetype.factionId || OWN_CLOTHES.has(archetype.id)) return look;
  const palette = DISTRICT_PALETTES[DISTRICT_STYLE[districtId]] || null;
  const paints = look.paints;
  const layered = paints.paint_top !== paints.paint_jacket;
  const self = { assetId, look };
  const redress = () => {
    const jacket = pick(palette.tops, random);
    paints.paint_jacket = jacket;
    if (layered) {
      let under = pick(palette.tops, random);
      if (under === jacket) under = palette.tops[(palette.tops.indexOf(jacket) + 1) % palette.tops.length];
      paints.paint_top = under;
    } else paints.paint_top = jacket;
    paints.paint_bottom = pick(palette.bottoms, random);
  };
  if (palette && random() < DISTRICT_SHARE) redress();
  // Never the twin of someone beside them: new colours (the district's, or any) a few times.
  for (let tries = 0; tries < 12 &&neighbours.some((other) => dressedAlike(self, other)); tries += 1) {
    if (palette) redress();
    else paints.paint_bottom = pick(DISTRICT_PALETTES.office.bottoms, random);
  }
  return look;
}
