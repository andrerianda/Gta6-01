// Who walks where and when: the archetype mix of a district at an hour (the district's
// pedestrianMix, kept to the archetypes whose hours include it), how crowded the pavements are
// (the district's day and night density, easing through dusk and dawn), what each person looks
// like (the archetype's appearance ranges turned into the six paint colours of a character
// body) and which body carries them (every registered pedestrian_* body that fits, else the
// lead's recoloured). Pure functions of catalog data and a random() source (Node-tested).

/** Picks a key of a weight table ({id: weight}); null when every weight is zero. */
export function pickWeighted(table, random) {
  let total = 0;
  for (const key in table) total += Math.max(0, table[key]);
  if (!(total > 0)) return null;
  let roll = random() * total;
  let last = null;
  for (const key in table) {
    const weight = Math.max(0, table[key]);
    if (weight <= 0) continue;
    last = key;
    roll -= weight;
    if (roll < 0) return key;
  }
  return last;
}

/** Picks one element of a list uniformly. */
export function pickOne(list, random) {
  return list && list.length ? list[Math.min(list.length - 1, Math.floor(random() * list.length))] : null;
}

/** True when a clock hour lies in a range [start, end] that may wrap past midnight. */
export function hourInRange(hour, range) {
  const [start, end] = range;
  return start <= end ? hour >= start && hour <= end : hour >= start || hour <= end;
}

/**
 * The archetype weights of a district at an hour.
 * @param {{pedestrianMix?: Record<string, number>}} district
 * @param {number} hour Clock hours (0..24).
 * @param {Record<string, {hours: [number, number]}>} archetypes
 * @returns {Record<string, number>} Weights; archetypes out of their hours keep a twentieth.
 */
export function archetypeMixAt(district, hour, archetypes) {
  const mix = {};
  const source = (district && district.pedestrianMix) || {};
  for (const id in source) {
    const archetype = archetypes[id];
    if (!archetype) continue;
    mix[id] = source[id] * (hourInRange(hour, archetype.hours) ? 1 : 0.05);
  }
  return mix;
}

/**
 * How full the pavements are, 0..1: the district's day density from 08:00 to 19:30, night
 * density from 22:30 to 05:30, eased between.
 * @param {{pedestrianDensity?: {day: number, night: number}}} district
 * @param {number} hour
 */
export function crowdDensityAt(district, hour) {
  const density = (district && district.pedestrianDensity) || { day: 0.6, night: 0.25 };
  const ease = (t) => t * t * (3 - 2 * t);
  let day;
  if (hour >= 8 && hour <= 19.5) day = 1;
  else if (hour > 19.5 && hour < 22.5) day = 1 - ease((hour - 19.5) / 3);
  else if (hour > 5.5 && hour < 8) day = ease((hour - 5.5) / 2.5);
  else day = 0;
  return density.night + (density.day - density.night) * day;
}

/**
 * The look of one person from an archetype's appearance ranges.
 * @param {object} appearance PedestrianArchetype.appearance.
 * @param {() => number} random
 * @returns {{sex: string, height: number, ageBand: string, build: string, hairStyle: string,
 *   outfit: string, paints: Record<string, string>}}
 */
export function pickAppearance(appearance, random) {
  const sex = pickWeighted(appearance.sexes, random) || 'male';
  const [low, high] = appearance.heightRange || [1.6, 1.85];
  const shift = sex === 'female' ? -0.25 : 0.25;
  const height = low + (high - low) * Math.min(1, Math.max(0, (random() + random()) / 2 + shift * 0.4));
  const skin = pickOne(appearance.skinTones, random) || '#C68B63';
  const hairStyle = pickOne(appearance.hairStyles && appearance.hairStyles[sex], random) || 'short_crop';
  const bald = hairStyle === 'bald' || hairStyle === 'shaved';
  const hair = bald ? skin : pickOne(appearance.hairColors, random) || '#2E2019';
  const fitting = (appearance.outfits || []).filter((outfit) => outfit.sex === 'any' || outfit.sex === sex);
  const table = {};
  fitting.forEach((outfit, index) => { table[index] = outfit.weight; });
  const outfit = fitting[Number(pickWeighted(table, random) ?? 0)] || null;
  const top = outfit ? pickOne(outfit.top.colors, random) : '#F4F0E6';
  const under = outfit && outfit.top.secondaryColors ? pickOne(outfit.top.secondaryColors, random) : top;
  return {
    sex,
    height: Math.round(height * 100) / 100,
    ageBand: pickWeighted(appearance.ageBands || {}, random) || 'adult',
    build: pickWeighted(appearance.builds || {}, random) || 'average',
    hairStyle,
    outfit: outfit ? outfit.top.piece : 'tee',
    paints: {
      paint_skin: skin,
      paint_hair: hair,
      // An open shirt over a tee: the shirt is the jacket shell, the tee shows beneath it.
      paint_jacket: top,
      paint_top: under,
      paint_bottom: outfit ? pickOne(outfit.bottom.colors, random) : '#3A3D40',
      paint_shoes: outfit ? pickOne(outfit.shoes.colors, random) : '#2A2A2E',
    },
  };
}

/**
 * The bodies a person of a sex may wear: registered character ids that start with
 * "pedestrian_", those naming the other sex left out; the fallback when there is none.
 * @param {string[]} characterIds Every registered character asset id.
 * @param {string} sex 'female' | 'male'.
 * @param {string} [fallback]
 */
export function bodiesFor(characterIds, sex, fallback = 'dez_tolliver') {
  const people = characterIds.filter((id) => id.startsWith('pedestrian_'));
  const other = sex === 'female' ? /(^|_)(male|man|m)(_|$)/ : /(^|_)(female|woman|f)(_|$)/;
  const fitting = people.filter((id) => !other.test(id));
  return fitting.length ? fitting : [fallback];
}
