// The numbers and the radio lines of the air guard: the Halcón interceptor's speed envelope, how
// the pair scrambles, formates, orders, shoots and searches, how far its own radar and eyes reach,
// and every radio line with its stable lineId (text now; subtitles and voices come later).
// Frozen data, no imports.

/** The air guard's tuning. Distances in metres, speeds in metres per second, times in seconds. */
export const AIR_GUARD_TUNING = Object.freeze({
  /** The Halcón as an interceptor: faster than the Manta Sombra (Mach 0.85), slower than a Garza Negra at Mach 3. */
  envelope: Object.freeze({
    machAtSeaLevel: 1.12, machAtBest: 1.8, bestAltitude: 11000, ceiling: 17000,
    soundAtSeaLevel: 340, soundAtBest: 295,
    minSpeed: 75, acceleration: 14, deceleration: 20, climbRate: 90, sinkRate: 160,
    maxLoadFactor: 7, rollRate: 1.9, afterburnerFrom: 280,
  }),
  scramble: Object.freeze({
    delaySeconds: 6, wingmanDelaySeconds: 4, taxiSpeed: 18, rotateSpeed: 82, rollAcceleration: 9.5,
    /** The lead sees the base inside this distance: the pair takes off for real instead of appearing airborne. */
    sightDistance: 3200, airborneHeight: 650, airborneSpeed: 210,
  }),
  formation: Object.freeze({
    /** Uno on the lead's left wing; Dos behind and above (metres in the lead's frame: right, up, back). */
    slots: Object.freeze([Object.freeze({ right: -25, up: 2, back: 7 }), Object.freeze({ right: 14, up: 16, back: 70 })]),
    /** Behind the lead to shoot. */
    gunSlots: Object.freeze([Object.freeze({ right: -6, up: 5, back: 240 }), Object.freeze({ right: 40, up: 22, back: 420 })]),
    /** Station keeping starts this close to the slot; `joinedDistance` counts as on the wing. */
    captureDistance: 700, joinedDistance: 45, settleSeconds: 2, closureSpeed: 70, stationSeconds: 1.6,
  }),
  order: Object.freeze({
    /** Seconds after the order stage begins at which each line goes out, then the warning shots. */
    lineSeconds: Object.freeze([0, 10, 20]), patienceSeconds: 30,
    /** Hard evasion (turning away, running) spends the patience this many times faster. */
    evasionFactor: 3,
    warningShotsSeconds: 9, warningBurstEvery: 1.7,
    escortSeconds: 40, escortDefianceSeconds: 8,
  }),
  gunnery: Object.freeze({
    burstEvery: 1.9, maxRange: 1100, fullRange: 300, coneDegrees: 25, baseChance: 0.6, maxChance: 0.9,
    /** Jinking takes up to this share of the chance away; speed above `speedFrom` up to `speedSpan` more takes the rest down to `speedFloor`. */
    jinkShare: 0.85, speedFrom: 150, speedSpan: 600, speedFloor: 0.4, autopilotBonus: 1.35,
    /** Share of the aircraft's full health one hit takes. */
    hitDamageShare: 0.14,
  }),
  tracking: Object.freeze({
    /** The Halcón's own radar reaches `radarRange` against a signature of 1; a target low over the surface hides in the clutter. */
    radarRange: 14000, lowHeight: 150, lowFactor: 0.35, eyesRange: 1800,
    lineOfSightSamples: 14, cityClutterHeight: 14, checkEvery: 0.25,
    /** Seconds without a track before the pair starts searching, and how long it searches. */
    coastSeconds: 4, searchSeconds: 45, searchRadius: 900, searchSpeed: 190,
  }),
  wanted: Object.freeze({ none: 0, watched: 1, intercepted: 2, weaponsFree: 3 }),
  /** Seconds between repeats of the boundary warning while outside. */
  boundaryWarningEvery: 12,
  /** Taking off from the base in one of these without officer access scrambles the pair. */
  militaryAircraft: Object.freeze(['manta_sombra', 'garza_negra', 'halcon']),
  baseTakeoffRadius: 1500,
  /** Radar signature (0..1) by model when the radar network does not say. */
  fallbackSignature: Object.freeze({ manta_sombra: 0.12, garza_negra: 0.95, halcon: 0.6, gaviota_t2: 0.5 }),
});

/** The stage words of AIR_INTERCEPT_STAGE_CHANGED ('escort' is the air guard's own addition). */
export const INTERCEPT_STAGES = Object.freeze(['idle', 'scramble', 'intercept', 'formate', 'order', 'warningShots', 'fire', 'escort', 'searching', 'returning']);

/** Every radio line of the air guard by lineId: { speaker: 0 Uno | 1 Dos | 'control', text, seconds, urgent }. */
export const AIR_GUARD_RADIO_LINES = Object.freeze({
  'airspace.warning': Object.freeze({ speaker: 'control', text: 'International airspace: return to Marazul', seconds: 5, urgent: true }),
  'airspace.violation': Object.freeze({ speaker: 'control', text: 'You have left Marazul airspace. Interceptors are on their way. Turn back now.', seconds: 6, urgent: true }),
  'airspace.weaponsFree': Object.freeze({ speaker: 'control', text: 'Halcón flight, you are cleared to fire.', seconds: 5, urgent: true }),
  'airspace.cleared': Object.freeze({ speaker: 'control', text: 'You are back inside Marazul airspace. Stay there.', seconds: 4, urgent: false }),
  'airGuard.scramble': Object.freeze({ speaker: 0, text: 'Control, Halcón flight is rolling.', seconds: 4, urgent: false }),
  'airGuard.contact': Object.freeze({ speaker: 0, text: 'Control, Halcón Uno has the target in sight. Closing.', seconds: 4, urgent: false }),
  'airGuard.order1': Object.freeze({ speaker: 0, text: 'Aircraft ahead of us, this is Halcón Uno. Rock your wings and follow us.', seconds: 6, urgent: true }),
  'airGuard.order2': Object.freeze({ speaker: 0, text: 'You are in closed airspace. Turn back to Marazul and descend. Acknowledge by rocking your wings.', seconds: 7, urgent: true }),
  'airGuard.order3': Object.freeze({ speaker: 0, text: 'Follow us. This is your last order.', seconds: 5, urgent: true }),
  'airGuard.warningShots': Object.freeze({ speaker: 0, text: 'Warning shots across your nose. Turn back or we fire on you.', seconds: 5, urgent: true }),
  'airGuard.fire': Object.freeze({ speaker: 0, text: 'Control, the target does not comply. Halcón Uno is engaging.', seconds: 5, urgent: true }),
  'airGuard.complied': Object.freeze({ speaker: 0, text: 'Good. Hold this heading and stay with us.', seconds: 5, urgent: false }),
  'airGuard.ceaseFire': Object.freeze({ speaker: 0, text: 'Halcón Dos, hold your fire. He is turning back.', seconds: 4, urgent: false }),
  'airGuard.standDown': Object.freeze({ speaker: 0, text: 'Halcón flight is returning to base. Do not leave Marazul airspace again.', seconds: 5, urgent: false }),
  'airGuard.lost': Object.freeze({ speaker: 1, text: 'Uno, Halcón Dos has lost him. No contact on the scope.', seconds: 5, urgent: false }),
  'airGuard.searchEnd': Object.freeze({ speaker: 0, text: 'Control, no joy. Halcón flight is returning to base.', seconds: 5, urgent: false }),
  'airGuard.reacquired': Object.freeze({ speaker: 1, text: 'Contact again. Halcón Dos has him.', seconds: 4, urgent: false }),
  'airGuard.border': Object.freeze({ speaker: 0, text: 'This is the border. Halcón flight is breaking off. He is somebody else\'s problem now.', seconds: 6, urgent: false }),
  'airGuard.splash': Object.freeze({ speaker: 0, text: 'Control, the target is down. Halcón flight is returning to base.', seconds: 5, urgent: false }),
});
