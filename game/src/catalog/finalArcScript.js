// The script of the final arc, "POINT OF NO RETURN" (mission 17 of 17): every spoken line with its
// speaker, the channel it is heard through and the scene it belongs to, and the people who speak
// them with the stock voice each one is generated with. Desmond "Dez" Tolliver was a gifted air
// force captain, dismissed after a mission in which his decision cost his two wingmen their lives;
// years of depression followed, then a tow truck and a family garage the bank is about to take.
// A buyer who knows all of it offers one flight. Plain frozen data, no imports.
//
// Channels: 'face' (in the room), 'phone', 'radio' (cockpit radio), 'helmet' (Dez to himself inside
// the helmet), 'memory' (the flashback: a radio from eight years ago), 'news' (a radio set).
// Tones (the colour of the speaker's name, ui/subtitle): see FINAL_ARC_SPEAKERS; the tower turns
// from amber to red when the alarm goes off and El Comprador from violet to red on his last line.

/** The mission's name and number as the HUD shows them. */
export const FINAL_MISSION = Object.freeze({
  id: 'm17_point_of_no_return',
  order: 17,
  of: 17,
  title: 'POINT OF NO RETURN',
  hudLabel: 'MISSION 17/17 · POINT OF NO RETURN',
  requires: 'm16_for_the_record',
  callsign: 'Osorio Three-Seven',
  coverName: 'Lt. Ramiro Osorio',
  takeoffWindowSeconds: 180,
  closingCard: 'Some men fall once and learn to walk. Dez Tolliver fell twice, and took the world with him.',
  timeSkipCard: 'Three hours later...',
});

/**
 * Who speaks. `voice` is the stock voice model the lines are generated with (no imitation of any
 * real person); `tone` is the colour of the name in subtitles; `filter` is the default channel.
 * @type {Readonly<Record<string, {name: string, voice: string, tone: string, role: string}>>}
 */
export const FINAL_ARC_SPEAKERS = Object.freeze({
  dez_tolliver: Object.freeze({ name: 'Dez', voice: 'aura-2-arcas-en', tone: 'white', role: 'the lead: former air force captain, tow driver' }),
  el_comprador: Object.freeze({ name: 'El Comprador', voice: 'aura-2-zeus-en', tone: 'violet', role: 'the buyer: calm, almost friendly, never hurried' }),
  mayor_quiroga: Object.freeze({ name: 'Maj. Quiroga', voice: 'aura-2-saturn-en', tone: 'steel', role: 'the insider: a corrupt officer of Punta Garza on the buyer\'s payroll' }),
  bank_officer: Object.freeze({ name: 'Bank officer', voice: 'aura-2-helena-en', tone: 'steel', role: 'seals the garage for Banco Meridiano; takes no pleasure in it' }),
  ximena_robles: Object.freeze({ name: 'La Notaria', voice: 'aura-2-andromeda-en', tone: 'steel', role: 'the forger: makes the pass of Lt. Ramiro Osorio' }),
  gate_guard: Object.freeze({ name: 'Gate guard', voice: 'aura-2-hermes-en', tone: 'steel', role: 'checks the pass at the gate' }),
  sargento_beltran: Object.freeze({ name: 'Sgt. Beltrán', voice: 'aura-2-jupiter-en', tone: 'steel', role: 'the old sergeant who squints' }),
  crew_chief: Object.freeze({ name: 'Crew chief', voice: 'aura-2-pluto-en', tone: 'steel', role: 'ground crew chief on the apron' }),
  duty_officer: Object.freeze({ name: 'Duty officer', voice: 'aura-2-orpheus-en', tone: 'steel', role: 'salutes on the walk-out' }),
  garza_tower: Object.freeze({ name: 'Garza Tower', voice: 'aura-2-athena-en', tone: 'amber', role: 'the tower of Punta Garza: neutral until the alarm' }),
  coronel_vargas: Object.freeze({ name: 'Coronel Vargas', voice: 'aura-2-atlas-en', tone: 'red', role: 'the base commander' }),
  halcon_uno: Object.freeze({ name: 'Halcón Uno', voice: 'aura-2-orion-en', tone: 'red', role: 'the interceptor leader' }),
  halcon_dos: Object.freeze({ name: 'Halcón Dos', voice: 'aura-2-aries-en', tone: 'red', role: 'his wingman' }),
  air_control: Object.freeze({ name: 'Control', voice: 'aura-2-atlas-en', tone: 'red', role: 'air guard control' }),
  navy_picket: Object.freeze({ name: 'Patrullera Albatros', voice: 'aura-2-mars-en', tone: 'red', role: 'the navy picket ship' }),
  cormoran_dos: Object.freeze({ name: 'Cormorán Dos', voice: 'aura-2-odysseus-en', tone: 'memory', role: 'Dez\'s wingman, eight years ago' }),
  cormoran_tres: Object.freeze({ name: 'Cormorán Tres', voice: 'aura-2-luna-en', tone: 'memory', role: 'Dez\'s second wingman, eight years ago' }),
  news_reader: Object.freeze({ name: 'Radio Marazul', voice: 'aura-2-thalia-en', tone: 'steel', role: 'the hour\'s headlines' }),
});

const line = (scene, speaker, channel, text, extra = {}) => Object.freeze({ scene, speaker, channel, text, ...extra });

/**
 * Every line by id. `seconds` (optional) overrides the estimate until the voice index gives the real
 * length; `tone` overrides the speaker's; `pack` groups the generated audio into a few files.
 * @type {Readonly<Record<string, {scene: string, speaker: string, channel: string, text: string, tone?: string, pack?: string}>>}
 */
export const FINAL_ARC_LINES = Object.freeze({
  // ---- "Midnight Call": rain, the dark garage, the foreclosure letter, the old photograph ----
  mc_01: line('midnight_call', 'el_comprador', 'phone', 'Captain Tolliver. Forgive the hour.'),
  mc_02: line('midnight_call', 'dez_tolliver', 'face', 'Nobody calls me that. You have the wrong number.'),
  mc_03: line('midnight_call', 'el_comprador', 'phone', 'You are still the best pilot they ever had, Captain. Pity they threw you away.'),
  mc_04: line('midnight_call', 'el_comprador', 'phone', 'One flight. Enough to save your garage... and more. You still remember how to fly, Captain?'),

  // ---- "The Decision": morning, the bank seals the garage ----
  td_01: line('the_decision', 'bank_officer', 'face', 'Mr. Tolliver. By order of Banco Meridiano, this property is sealed as of today. You have thirty days to settle the debt.'),
  td_02: line('the_decision', 'bank_officer', 'face', 'I am sorry. I only carry the paper.'),
  td_03: line('the_decision', 'dez_tolliver', 'face', 'When?'),
  td_04: line('the_decision', 'el_comprador', 'phone', 'Soon, Captain. A friend of ours will find you.'),

  // ---- "New Face": the forged pass, the uniform, the schedule ----
  nf_01: line('new_face', 'ximena_robles', 'face', 'Lieutenant Ramiro Osorio. Visiting test pilot. Your face, his name, and a stamp nobody at that gate has seen twice.'),
  nf_02: line('new_face', 'ximena_robles', 'face', 'The real one will have car trouble on the coast road. Nobody gets hurt. That part I checked myself.'),
  nf_03: line('new_face', 'dez_tolliver', 'face', 'Eight years since I wore one of these.'),
  nf_04: line('new_face', 'ximena_robles', 'face', 'Then stand like it has been eight minutes.'),
  ic_01: line('insider_call', 'mayor_quiroga', 'phone', 'The gate opens at 05:40, Lieutenant. Do not be late.', { spoken: 'The gate opens at oh five forty, Lieutenant. Do not be late.' }),
  ic_02: line('insider_call', 'dez_tolliver', 'face', 'Understood.'),

  // ---- the gate and the walk through the base ----
  gt_01: line('gate', 'gate_guard', 'face', 'Good morning, sir. Your pass, please.'),
  gt_02: line('gate', 'gate_guard', 'face', 'Lieutenant Osorio. Test flight at zero six hundred. You are on the schedule, sir. Go ahead.'),
  gt_03: line('gate', 'mayor_quiroga', 'face', 'Walk like you own the place. Hangar two. Do not stop for anyone.'),
  sg_01: line('suspicion', 'sargento_beltran', 'face', 'Lieutenant Osorio... I thought you were taller.'),
  sg_a: line('suspicion', 'dez_tolliver', 'face', 'They say that about every pilot, Sergeant. It is the helmet.'),
  sg_a_r: line('suspicion', 'sargento_beltran', 'face', 'Ha. It always is, sir.'),
  sg_b: line('suspicion', 'dez_tolliver', 'face', 'You will mind your own post, Sergeant, not my height.'),
  sg_b_r: line('suspicion', 'sargento_beltran', 'face', '...Yes, sir.'),
  sg_c: line('suspicion', 'dez_tolliver', 'face', 'I have a zero six hundred slot and a cold aircraft, Sergeant. Which way is hangar two?'),
  sg_c_r: line('suspicion', 'sargento_beltran', 'face', 'Straight across the apron, sir. They are waiting for you.'),
  su_01: line('suspicion', 'gate_guard', 'face', 'Sir? No running on the apron, sir.'),
  su_02: line('suspicion', 'sargento_beltran', 'face', 'Lieutenant! Stop right there!', { tone: 'red' }),

  // ---- the dark hangar, the walk-out, boarding ----
  hr_01: line('hangar_reveal', 'dez_tolliver', 'helmet', 'Eight years.'),
  wo_01: line('walk_out', 'crew_chief', 'face', 'Morning, Lieutenant. She is fuelled and waiting.'),
  wo_02: line('walk_out', 'duty_officer', 'face', 'Good flight, sir.'),
  bd_01: line('boarding', 'crew_chief', 'face', 'Where is your co-pilot, Lieutenant?'),
  bd_02: line('boarding', 'dez_tolliver', 'face', 'On his way.'),
  bd_g1: line('boarding', 'crew_chief', 'face', 'Suit checks green, Lieutenant. Cooler off. Canopy coming down.'),
  bd_g2: line('boarding', 'dez_tolliver', 'helmet', 'Close it.'),
  bd_03: line('boarding', 'dez_tolliver', 'helmet', 'Steady. You know how to do this.'),

  // ---- the three-minute window and the takeoff ----
  tw_01: line('takeoff', 'garza_tower', 'radio', 'Osorio Three-Seven, Garza Tower. Radio check.'),
  tw_02: line('takeoff', 'dez_tolliver', 'radio', 'Garza Tower, Osorio Three-Seven, loud and clear. Request taxi.'),
  tw_03: line('takeoff', 'garza_tower', 'radio', 'Osorio Three-Seven, taxi to runway two-seven. Wind two-six-zero at six.'),
  tw_04: line('takeoff', 'garza_tower', 'radio', 'Osorio Three-Seven, confirm your readiness...'),
  tw_05: line('takeoff', 'garza_tower', 'radio', 'Osorio Three-Seven, the main gate is holding a call about you. Say your status.'),
  tw_06: line('takeoff', 'garza_tower', 'radio', 'Osorio Three-Seven, cleared for takeoff runway two-seven.'),
  tw_07: line('takeoff', 'dez_tolliver', 'radio', 'Cleared for takeoff, two-seven, Osorio Three-Seven.'),
  tw_08: line('takeoff', 'dez_tolliver', 'helmet', 'V one... rotate.'),
  tw_09: line('takeoff', 'dez_tolliver', 'helmet', 'Positive rate. Gear up.'),
  tw_fail: line('takeoff', 'garza_tower', 'radio', 'Osorio Three-Seven, shut down your engines. Shut down now!', { tone: 'red' }),

  // ---- the alarm ----
  al_01: line('alarm', 'garza_tower', 'radio', 'Osorio Three-Seven, you are off your filed plan. Turn back to the field. Now.', { tone: 'red' }),
  al_02: line('alarm', 'coronel_vargas', 'radio', 'Osorio Three-Seven, return to base immediately. That is an order.'),
  al_03: line('alarm', 'coronel_vargas', 'radio', 'That is not Osorio. Whoever you are, you will not reach the coast.'),
  al_04: line('alarm', 'coronel_vargas', 'radio', 'Halcón flight, he does not leave our sky. Bring him down if you must.'),

  // ---- "blind the radar" ----
  br_01: line('blind_radar', 'el_comprador', 'radio', 'Do not answer them, Captain. First, blind them. The radar tower on Cabo Lejano. One bomb. Nobody is there.'),
  br_g1: line('blind_radar', 'el_comprador', 'radio', 'Do not answer them, Captain. You carry no bomb, so climb. Above their radar on Cabo Lejano you are a rumour.'),
  br_02: line('blind_radar', 'dez_tolliver', 'helmet', 'Target locked.'),
  br_03: line('blind_radar', 'dez_tolliver', 'helmet', 'Weapon away.'),
  br_04: line('blind_radar', 'garza_tower', 'radio', 'We have lost the coastal picture! Cabo Lejano is off the air!', { tone: 'red' }),
  br_g4: line('blind_radar', 'garza_tower', 'radio', 'Contact is above our coverage. We are losing him!', { tone: 'red' }),

  // ---- the interception, and what it brings back ----
  'airGuard.contact': line('interception', 'halcon_uno', 'radio', 'Control, Halcón Uno has the target in sight. Closing.'),
  'airGuard.order1': line('interception', 'halcon_uno', 'radio', 'Aircraft ahead of us, this is Halcón Uno. Rock your wings and follow us.'),
  'airGuard.order2': line('interception', 'halcon_uno', 'radio', 'You are in closed airspace. Turn back to Marazul and descend. Acknowledge by rocking your wings.'),
  'airGuard.order3': line('interception', 'halcon_uno', 'radio', 'Follow us. This is your last warning.'),
  'airGuard.warningShots': line('interception', 'halcon_uno', 'radio', 'Warning shots across your nose. Turn back or we fire on you.'),
  'airGuard.fire': line('interception', 'halcon_uno', 'radio', 'Control, the target does not comply. Halcón Uno is engaging.'),
  'airGuard.lost': line('interception', 'halcon_dos', 'radio', 'Uno, Halcón Dos has lost him. No contact on the scope.'),
  'airGuard.reacquired': line('interception', 'halcon_dos', 'radio', 'Contact again. Halcón Dos has him.'),
  'airGuard.border': line('interception', 'halcon_uno', 'radio', 'This is the border. Halcón flight is breaking off. He is somebody else\'s problem now.'),
  fb_01: line('flashback', 'cormoran_dos', 'memory', 'Cormorán Uno, Dos. Missile warning, they have us lit. Do we break off?'),
  fb_02: line('flashback', 'dez_tolliver', 'memory', 'Negative. Hold the line. Thirty seconds to target.', { tone: 'memory' }),
  fb_03: line('flashback', 'cormoran_tres', 'memory', 'Uno, I am hit, I am...'),
  fb_04: line('flashback', 'cormoran_dos', 'memory', 'Tres is gone! Dez, call it! Dez...'),
  fb_05: line('flashback', 'dez_tolliver', 'helmet', 'Not again. Fly the aircraft.'),

  // ---- El Comprador's stealth test ----
  st_01: line('stealth_test', 'el_comprador', 'radio', 'Impressive, Captain. One more door. A navy picket lies across your road. Pass it unseen and I will give you a heading.'),
  st_02: line('stealth_test', 'el_comprador', 'radio', 'Stay low. Count their sweeps. Slip between them.'),
  st_g2: line('stealth_test', 'el_comprador', 'radio', 'You cannot hide that machine. So do not hide. Outrun their lock.'),
  st_03: line('stealth_test', 'navy_picket', 'radio', 'Unknown aircraft, this is patrol ship Albatros. Identify yourself.'),
  st_04: line('stealth_test', 'navy_picket', 'radio', 'Missile lock. Last call. Turn away.'),
  st_05: line('stealth_test', 'el_comprador', 'radio', 'Clean. Heading two-eight-five, Captain.'),

  // ---- the time skip, the dawn approach ----
  ts_01: line('time_skip', 'el_comprador', 'radio', 'Hold your heading, Lieutenant. We are waiting.'),
  da_01: line('dawn_approach', 'dez_tolliver', 'helmet', 'There you are.'),
  da_02: line('dawn_approach', 'el_comprador', 'radio', 'We see you, Captain. The strip lies between the cliffs. Bring her down gently.'),

  // ---- the handover and the betrayal: locked, word for word ----
  hv_01: line('handover', 'el_comprador', 'face', 'You flew beautifully, Captain.'),
  hv_02: line('handover', 'dez_tolliver', 'face', 'Then we\'re done.'),
  hv_03: line('handover', 'el_comprador', 'face', 'We are.'),
  hv_04: line('handover', 'el_comprador', 'face', 'We needed the aircraft. Not the witness.', { tone: 'red' }),

  // ---- the epilogue: the radio news of Marazul ----
  ep_01: line('epilogue', 'news_reader', 'news', 'Radio Marazul, the headlines at this hour. The air force confirms that an experimental aircraft taken from Base Aérea Punta Garza at dawn has not been found.'),
  ep_02: line('epilogue', 'news_reader', 'news', 'The Ministry of Defence warns that its secrets, in foreign hands, leave the country\'s skies open for a generation.'),
  ep_03: line('epilogue', 'news_reader', 'news', 'The man at the controls has been named as Desmond Tolliver, a former air force captain dismissed eight years ago. The government calls him a traitor. His whereabouts are unknown.'),
  ep_04: line('epilogue', 'news_reader', 'news', 'The family garage that bears his name remains sealed by the bank.'),
});

/** The three answers to the old sergeant: what Dez says, what comes back, what it does to the suspicion. */
export const SERGEANT_CHOICES = Object.freeze([
  Object.freeze({ id: 'joke', label: 'Joke', hint: 'Make light of it', say: 'sg_a', reply: 'sg_a_r', suspicion: 8 }),
  Object.freeze({ id: 'snap', label: 'Officer\'s snap', hint: 'Pull rank on him', say: 'sg_b', reply: 'sg_b_r', suspicion: 34 }),
  Object.freeze({ id: 'schedule', label: 'Steer to the schedule', hint: 'Talk about the flight', say: 'sg_c', reply: 'sg_c_r', suspicion: -12 }),
]);

/** The credits, in order: [heading, lines]. Everything in MARAZUL is original. */
export const FINAL_CREDITS = Object.freeze([
  ['MARAZUL', ['An original open-world crime game']],
  ['POINT OF NO RETURN', ['The last flight of Desmond Tolliver']],
  ['The city, the sea and the sky', ['Generated at run time by the game\'s own code']],
  ['Models and textures', ['Modelled and baked in Blender by our own scripts']],
  ['Voices', ['Stock synthetic voices, generated once for this story', 'No voice imitates a real person']],
  ['Sound and music', ['Synthesised in the browser']],
  ['Every name, place, aircraft, insignia and brand is invented', ['Any resemblance to real ones is coincidence']],
  ['Free roam continues', ['as Sol Arrieta']],
]);
