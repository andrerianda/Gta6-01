// The city's sound by place, hour and weather, as numbers: for a district, the clock and the
// atmosphere's rain, wind and night factor, how loud each ambience bed is (traffic hum, wind,
// rain, waves, night insects) and how often the scattered calls happen (birds, gulls, distant
// horns and sirens). Pure: no WebAudio, no allocation (writes into a levels object).

/** Per district: traffic density, how green it is, police activity, and a harbour flag. */
export const DISTRICT_SOUND = Object.freeze({
  centro: { traffic: 1.0, green: 0.25, sirens: 0.8, harbour: 0 },
  playa_dorada: { traffic: 0.65, green: 0.3, sirens: 0.5, harbour: 0.3 },
  la_marisma: { traffic: 0.45, green: 0.8, sirens: 0.3, harbour: 0.2 },
  puerto_tamarindo: { traffic: 0.7, green: 0.2, sirens: 0.5, harbour: 1 },
  las_lomas: { traffic: 0.35, green: 0.9, sirens: 0.2, harbour: 0 },
  bahia_vista: { traffic: 0.6, green: 0.5, sirens: 0.4, harbour: 0.4 },
  isla_coral: { traffic: 0.25, green: 0.7, sirens: 0.2, harbour: 0.5 },
  barrio_hierro: { traffic: 0.75, green: 0.3, sirens: 1.0, harbour: 0.2 },
  los_pantanos: { traffic: 0.2, green: 1.0, sirens: 0.3, harbour: 0 },
});
const DEFAULT_DISTRICT = Object.freeze({ traffic: 0.5, green: 0.5, sirens: 0.5, harbour: 0 });

/** A fresh levels object (allocate once, refill with ambienceLevels). */
export function createAmbienceLevels() {
  return {
    traffic: 0, wind: 0, rain: 0, waves: 0, insects: 0,
    birdsPerSecond: 0, gullsPerSecond: 0, hornsPerSecond: 0, sirensPerSecond: 0,
    dawnChorus: 0,
  };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const bump = (h, centre, width) => {
  const d = (h - centre) / width;
  return Math.exp(-d * d);
};

/** Road traffic by hour (0..24): quiet small hours, morning and evening rush, busy day. */
export function trafficByHour(hour) {
  const h = ((hour % 24) + 24) % 24;
  const day = clamp01((h - 5) / 3) * clamp01((24.5 - h) / 3.5);
  return clamp01(0.18 + 0.62 * day + 0.25 * bump(h, 8.2, 1.3) + 0.3 * bump(h, 18.3, 1.6));
}

/**
 * Fills `out` with the ambience mix.
 * @param {ReturnType<typeof createAmbienceLevels>} out
 * @param {{district?: string|null, hour: number, nightFactor?: number, rain?: number, windSpeed?: number,
 *   shoreDistance?: number|null, inVehicle?: boolean}} s
 */
export function ambienceLevels(out, s) {
  const d = (s.district && DISTRICT_SOUND[s.district]) || DEFAULT_DISTRICT;
  const hour = ((s.hour % 24) + 24) % 24;
  const night = clamp01(s.nightFactor ?? (hour < 6 || hour > 20 ? 1 : 0));
  const day = 1 - night;
  const rain = clamp01(s.rain ?? 0);
  const shore = s.shoreDistance ?? 1000;
  const coast = shore <= 0 ? 1 : clamp01(1 - shore / 240);
  const nearCoast = shore <= 0 ? 1 : clamp01(1 - shore / 450);

  out.traffic = d.traffic * trafficByHour(hour) * (1 - 0.35 * coast);
  out.wind = clamp01((s.windSpeed ?? 3) / 14) * (0.7 + 0.3 * coast) + 0.06 * coast;
  out.rain = rain;
  out.waves = coast * (0.75 + 0.25 * clamp01((s.windSpeed ?? 3) / 10));
  out.insects = (0.25 + 0.75 * d.green) * night * (1 - 0.85 * rain);
  out.dawnChorus = bump(hour, 7, 1.2);
  out.birdsPerSecond = (0.1 + 0.6 * d.green) * day * (1 - rain) * (0.5 + 1.5 * out.dawnChorus) * 0.9;
  out.gullsPerSecond = Math.max(nearCoast, d.harbour * 0.7) * day * (1 - 0.7 * rain) * 0.22;
  out.hornsPerSecond = out.traffic * 0.1;
  out.sirensPerSecond = d.sirens * (0.012 + 0.02 * night);
  if (s.inVehicle) {
    out.birdsPerSecond *= 0.3;
    out.gullsPerSecond *= 0.4;
  }
  return out;
}
