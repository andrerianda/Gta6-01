// The six radio stations of Marazul: name, dial position, genre, the hints the WebAudio music
// synthesiser composes from (tempo range, scale, mood, instrument voices, rhythm pattern), the
// host, and the banter and advert lines shown as subtitles between songs. Everything invented.
// Plain frozen data, no imports.
//
// Tempo in beats per minute. `scale` names an interval set in RADIO_SCALES (semitones from the
// root); `roots` are MIDI note numbers the synthesiser picks a key from. Patterns are sixteen
// steps per bar: x a hit, - a rest. Advert lines name a brand id from brandsAndSignage.js.
// A host's `character` is an id from storyCharacters.js when the host is in the cast.

/**
 * The stations keyed by id (vehicleCatalog.js names one as each vehicle's default).
 * @type {Readonly<Record<string, object>>}
 */
export const RADIO_STATIONS = freezeCatalog({
  muelle_88: {
    id: 'muelle_88', name: 'Muelle 88', frequency: '88.1 FM', genre: 'Sunshine pop', tagline: 'The sound of the pier, all day',
    description: 'Bright chart pop with handclaps and a bassline you can whistle. The station of hatchbacks, beach bars and anyone under twenty-five.',
    host: { name: 'Lupe Marín', character: null, voice: 'Fast, bright, laughs at her own links; every sentence ends on the way up.' },
    music: { tempoRange: [104, 122], scale: 'major_pentatonic', roots: [60, 62, 65, 67], mood: 'bright', swing: 0, chordProgression: ['I', 'V', 'vi', 'IV'], lead: { wave: 'square', attack: 0.01, release: 0.18, vibrato: 0.2 }, bass: { wave: 'triangle', pattern: 'x--x--x-x--x--x-' }, pad: { wave: 'sawtooth', filterHz: 1800 }, drums: { kick: 'x---x---x---x---', snare: '----x-------x---', hat: 'x-x-x-x-x-x-x-x-', clap: '----x-------x---' } },
    lines: [
      line('banter', 'Muelle 88, it is thirty-one degrees on the sand and there is still no parking. You love it here.'),
      line('banter', 'That one goes out to whoever jumped a hatchback off the end of the pier this morning. We saw you. Everyone saw you.'),
      line('banter', 'Lupe Marín with you until the sun gives up. Text the show; do not text and drive, the Bulevar is hard enough.'),
      line('banter', 'Traffic: the causeway is slow, the bridge is slower, and somebody has left a tow truck on Avenida Flamenco.'),
      line('banter', 'Up next, three in a row with no talking. I know. I will miss me too.'),
      line('advert', 'Coco Bravo. Coconut soda with a kick. Shake the tree!', 'coco_bravo'),
      line('advert', 'Brisa and Hilo, on the boulevard: because the police description said a white shirt.', 'brisa_y_hilo'),
      line('advert', 'Marea Móvil: five bars of signal from the pier to the swamp. Mostly.', 'marea_movil'),
      line('advert', 'Hungry? Pollo Pirata. We plunder the flavour so you do not have to.', 'pollo_pirata'),
    ],
  },
  voz_del_golfo: {
    id: 'voz_del_golfo', name: 'La Voz del Golfo', frequency: '97.5 FM', genre: 'Talk, news and late-night jazz', tagline: 'Marazul talks. We just hold the microphone',
    description: 'News on the hour, callers in between and a slow jazz bed under everything. Once the story is on the air its bulletins report what the leads have been doing.',
    host: { name: 'Nadia Finch', character: 'nadia_finch', voice: 'Low, unhurried, amused. Lets a silence sit until the caller fills it.' },
    music: { tempoRange: [68, 92], scale: 'dorian', roots: [50, 53, 55, 57], mood: 'smoky', swing: 0.33, chordProgression: ['ii7', 'V7', 'Imaj7', 'vi7'], lead: { wave: 'sine', attack: 0.04, release: 0.5, vibrato: 0.35 }, bass: { wave: 'sine', pattern: 'x---x---x---x-x-' }, pad: { wave: 'triangle', filterHz: 900 }, drums: { kick: 'x---------x-----', snare: '----x-------x---', hat: 'x--xx--xx--xx--x', clap: '----------------' } },
    newsReports: { unlockedBy: 'm10_dead_air', everyGameHours: 1, reportsRecentCrimes: true, template: 'This is La Voz del Golfo. Police are looking for the driver of a {color} {vehicle} after {crime} in {district}.' },
    lines: [
      line('banter', 'You are on Línea Abierta. I am Nadia Finch, it is late, and you are not asleep either. First caller.'),
      line('banter', 'Caller says the old foundry in Barrio Hierro is closed. Caller also says its chimney was smoking at three this morning. Interesting.'),
      line('banter', 'The Harbor Patrol reports zero incidents at the port this month. Zero. I just read what they send me.'),
      line('banter', 'City hall approved another waterfront permit before lunch. The applicant has no address. The lunch was excellent, I am told.'),
      line('banter', 'If you are listening from a stolen car: slow down, signal, and stay on the line.'),
      line('banter', 'I used to write for the newspaper. Then the newspaper was bought. Now I talk. You cannot buy air. They have tried.'),
      line('advert', 'Banco Meridiano. Your money, at the centre of everything.', 'banco_meridiano'),
      line('advert', 'Vigía Azul Security. Siempre despiertos. Always awake, so you can pretend to sleep.', 'vigia_azul'),
      line('advert', 'Canal 6 Golfo. If it crashes, we are overhead.', 'canal_6_golfo'),
    ],
  },
  brisa_dorada: {
    id: 'brisa_dorada', name: 'Brisa Dorada', frequency: '101.3 FM', genre: 'Lounge and yacht soul', tagline: 'Smooth water, all the way out',
    description: 'Electric piano, soft congas and nothing that would spill a drink. The default in luxury saloons, SUVs and anything with a teak deck.',
    host: { name: 'Celeste Arroyo', character: null, voice: 'Velvet and slow, as if reading a wine list to someone she likes.' },
    music: { tempoRange: [84, 104], scale: 'lydian', roots: [53, 55, 58, 60], mood: 'warm', swing: 0.12, chordProgression: ['Imaj7', 'iii7', 'IVmaj7', 'V7sus'], lead: { wave: 'triangle', attack: 0.03, release: 0.6, vibrato: 0.25 }, bass: { wave: 'sine', pattern: 'x--x----x--x--x-' }, pad: { wave: 'sine', filterHz: 1400 }, drums: { kick: 'x-----x---x-----', snare: '----x-------x---', hat: '--x---x---x---x-', clap: '----------------' } },
    lines: [
      line('banter', 'Brisa Dorada. The sun is going down behind the cranes and, for eleven minutes, even the port is beautiful.'),
      line('banter', 'This is Celeste. Loosen something. A tie, a grip on the wheel, a principle.'),
      line('banter', 'For the gentleman on Isla Coral who requests the same song every night: we know. We always know.'),
      line('banter', 'Golden hour in Marazul. If you are driving west, forgive the person in front of you. They cannot see either.'),
      line('banter', 'No news on this station. Whatever happened, it will still have happened tomorrow.'),
      line('advert', 'The Aurelia Resort and Casino. The house always welcomes you.', 'the_aurelia'),
      line('advert', 'Lucero. Arrive as if you were expected.', 'lucero'),
      line('advert', 'Casa Lino. Forty shades of white, and a jacket for each.', 'casa_lino'),
      line('advert', 'Hotel Cielo Rosa. Pink since before it was fashionable, and after.', 'hotel_cielo_rosa'),
    ],
  },
  onda_neon: {
    id: 'onda_neon', name: 'Onda Neón', frequency: '104.7 FM', genre: 'Electronic and night drive', tagline: 'After dark, on purpose',
    description: 'Arpeggios, side-chained pads and a kick drum like a pulse. The station of sports cars, superbikes and the strip after midnight.',
    host: { name: 'Kilo Vatio', character: null, voice: 'A calm robot-adjacent murmur through a vocoder; speaks rarely and in the lower case.' },
    music: { tempoRange: [118, 132], scale: 'natural_minor', roots: [45, 48, 50, 52], mood: 'driving', swing: 0, chordProgression: ['i', 'VI', 'III', 'VII'], lead: { wave: 'sawtooth', attack: 0.005, release: 0.12, vibrato: 0, arpeggio: [0, 2, 4, 7] }, bass: { wave: 'sawtooth', pattern: 'x-xxx-xxx-xxx-xx' }, pad: { wave: 'sawtooth', filterHz: 2400, sidechain: true }, drums: { kick: 'x---x---x---x---', snare: '----x-------x---', hat: '--x---x---x---x-', clap: '----x-------x--x' } },
    lines: [
      line('banter', 'onda neón. one hundred and four point seven. the city is a circuit board. you are the current.'),
      line('banter', 'kilo vatio here. that was nine minutes with no chorus. you are welcome.'),
      line('banter', 'the lights on the bulevar are timed for sixty. you did not hear that from a radio.'),
      line('banter', 'someone is doing laps of the stadium car park. we can hear you from the studio. nice line through the last gate.'),
      line('banter', 'stay hydrated. stay in your lane. stay up.'),
      line('advert', 'Club Salitre. Doors at ten. Regrets at four.', 'club_salitre'),
      line('advert', 'Zarco Vendaval. The wind does not signal.', 'zarco'),
      line('advert', 'Lux Marea. If your name is on the list, you already know.', 'lux_marea'),
      line('advert', 'Rayo motorcycles. Two wheels, one opinion.', 'rayo'),
    ],
  },
  hierro_rock: {
    id: 'hierro_rock', name: 'Hierro Rock', frequency: '92.9 FM', genre: 'Garage and hard rock', tagline: 'Loud since the foundry closed',
    description: 'Overdriven riffs, a snare like a dropped tailgate and a host who sounds like the inside of an exhaust. Muscle cars, pickups and choppers tune here.',
    host: { name: 'Tío Óxido', character: null, voice: 'Gravel and cigarettes; shouts the time, the temperature and his opinions.' },
    music: { tempoRange: [126, 160], scale: 'minor_pentatonic', roots: [40, 43, 45, 47], mood: 'aggressive', swing: 0, chordProgression: ['i', 'bVII', 'bVI', 'bVII'], lead: { wave: 'sawtooth', attack: 0.004, release: 0.2, vibrato: 0.4, distortion: 0.7 }, bass: { wave: 'square', pattern: 'x-x-x-x-x-x-x-xx' }, pad: { wave: 'sawtooth', filterHz: 3200, distortion: 0.5, powerChords: true }, drums: { kick: 'x-----x-x-----x-', snare: '----x-------x---', hat: 'x-x-x-x-x-x-x-x-', clap: '----------------' } },
    lines: [
      line('banter', 'HIERRO ROCK! Ninety-two nine! If you can hear the vocals, it is not loud enough!'),
      line('banter', 'Tío Óxido here. That song is older than your car and it still starts first time.'),
      line('banter', 'Shout-out to the Remaches at the scrapyard. Boys, I want my hubcaps back.'),
      line('banter', 'The Fundidores lost again last night. Nine to two. I am not angry. I am LOUD, it is different.'),
      line('banter', 'Weather: hot. Tomorrow: hot. Sunday: hot, with a chance of somebody else being wrong.'),
      line('banter', 'They keep saying the foundry is closed. Then why does my street smell like money?'),
      line('advert', 'Holloway Thunderhead. Eight cylinders. No apologies.', 'holloway'),
      line('advert', 'Yunque trucks. Hit it with a hammer; it is fine.', 'yunque'),
      line('advert', 'Capa Fresca. New paint, new plates, new you. No questions.', 'capa_fresca'),
      line('advert', 'Cerveza Faro. The light at the end of the shift.', 'cerveza_faro'),
    ],
  },
  la_tumbadora: {
    id: 'la_tumbadora', name: 'La Tumbadora', frequency: '106.1 FM', genre: 'Salsa, son and descarga', tagline: 'En clave, from the balcony of Salón Guaracha',
    description: 'Congas, a piano montuno and a horn line, live from the old town\'s dance hall. Buses, delivery vans and every convertible on the boulevard.',
    host: { name: 'Doña Charo Valdivieso', character: null, voice: 'Warm, teasing, grandmotherly until someone requests the wrong song.' },
    music: { tempoRange: [168, 204], scale: 'mixolydian', roots: [55, 57, 60, 62], mood: 'festive', swing: 0.08, chordProgression: ['I', 'IV', 'V', 'IV'], clave: 'x--x--x---x-x---', lead: { wave: 'square', attack: 0.008, release: 0.14, vibrato: 0.15, montuno: true }, bass: { wave: 'triangle', pattern: '---x--x----x--x-' }, pad: { wave: 'sawtooth', filterHz: 2600, stabs: true }, drums: { kick: '---x------x-----', snare: '--x--x-x--x--x-x', hat: 'x-xxx-xxx-xxx-xx', clap: 'x--x--x---x-x---' } },
    lines: [
      line('banter', 'La Tumbadora, ciento seis punto uno. If your feet are still, check your pulse.'),
      line('banter', 'Doña Charo with you from the balcony of the Salón Guaracha. Shoes, mi amor. We have a policy on shoes.'),
      line('banter', 'This one is for the domino table at the Jardín de los Faroles. Somebody slammed the double nine. I heard it from here.'),
      line('banter', 'A request from La Marisma: play it loud enough that the men in the cream jackets go home. With pleasure.'),
      line('banter', 'The number twelve bus is late. The driver is dancing. I know because he called to tell me.'),
      line('banter', 'In this town everybody knows and nobody saw. But everybody heard this next one.'),
      line('advert', 'Fonda Doña Pilar. One menu. No substitutions. No complaints.', 'fonda_dona_pilar'),
      line('advert', 'Gaviota Express. It gets there. Usually before you do.', 'gaviota_express'),
      line('advert', 'Delmara Ocaso. Top down, volume up, sunset included.', 'delmara'),
      line('advert', 'Bodega La Esquina. We have it. If we do not have it, you do not need it.', 'bodega_la_esquina'),
    ],
  },
});

/** Station ids in dial order, as the radio wheel shows them (the last entry is radio off). */
export const RADIO_DIAL_ORDER = Object.freeze(['muelle_88', 'hierro_rock', 'voz_del_golfo', 'brisa_dorada', 'onda_neon', 'la_tumbadora']);

/** Interval sets (semitones above the root) for the scale names the stations use. */
export const RADIO_SCALES = freezeCatalog({
  major_pentatonic: [0, 2, 4, 7, 9],
  minor_pentatonic: [0, 3, 5, 7, 10],
  natural_minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
});

/** How the radio behaves in a vehicle. */
export const RADIO_RULES = freezeCatalog({
  songSeconds: [70, 110],
  linesBetweenSongs: 1,
  advertEverySongs: 3,
  tuneStaticSeconds: 0.35,
  volumeDuckWhileSubtitled: 0.6,
  emergencyVehiclesHaveNoRadio: true,
  rememberStationPerVehicle: true,
  offOption: { id: 'radio_off', name: 'Radio off' },
  lineKinds: ['banter', 'advert'],
  seedSongsFrom: 'station id and in-game hour, so that the same hour replays the same song',
});

/** Builds one spoken line; an advert names the brand it sells. */
function line(kind, text, brand) {
  return brand ? { kind, text, brand } : { kind, text };
}

/** Recursively freezes a plain data tree so that no system can mutate the shared catalog. */
function freezeCatalog(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) freezeCatalog(value[key]);
  }
  return value;
}
