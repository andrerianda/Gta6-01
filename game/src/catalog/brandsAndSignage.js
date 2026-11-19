// The invented brands of Marazul: every hotel, bar, shop, bank, vehicle maker, public service
// and product whose name appears on a storefront, a billboard, a vehicle livery or the radio,
// with a slogan, a three-colour scheme and a sign style for the sign-texture generator.
// Nothing here is a real company or borrowed from another game. Plain frozen data, no imports.
//
// A landmark's `brand` in cityDistricts.js, a vehicle's `makeBrand`, `liveryBrands` and
// `livery.brand` in vehicleCatalog.js and an advert's `brand` in radioStations.js are ids of
// this catalog. Colours are sRGB hex: primary is the sign background or body colour, secondary
// the lettering, accent the trim or neon. `uses` says where the brand may appear.

/**
 * The brands keyed by id.
 * @type {Readonly<Record<string, object>>}
 */
export const BRANDS_AND_SIGNAGE = freezeCatalog({
  // Hotels, casino and clubs
  hotel_cielo_rosa: brand('hotel_cielo_rosa', 'Hotel Cielo Rosa', 'hotel', 'Pink since before it was fashionable', '#F6A6B2', '#FFFFFF', '#3DE0D0', 'deco_marquee', ['storefront', 'billboard', 'rooftop'], 'A setting sun cut by three deco speed lines.'),
  hotel_pelicano: brand('hotel_pelicano', 'The Pelícano', 'hotel', 'Check in. Lie low', '#BFE8DF', '#1F5F5B', '#FFC53D', 'neon_script', ['storefront', 'rooftop'], 'A pelican in sunglasses.'),
  hotel_marejada: brand('hotel_marejada', 'Hotel Marejada', 'hotel', 'Every room an ocean room, technically', '#FBE3A6', '#1D4E7A', '#FF4FA3', 'deco_marquee', ['storefront', 'rooftop'], 'A wave inside a porthole.'),
  motel_garza_azul: brand('motel_garza_azul', 'Motel Garza Azul', 'motel', 'Vacancy. Ice. Silence', '#17324D', '#6FD3F2', '#FF6B6B', 'neon_script', ['storefront', 'roadside_pylon'], 'A blue heron standing on one leg, in neon.'),
  the_aurelia: brand('the_aurelia', 'The Aurelia Resort & Casino', 'casino', 'The house always welcomes you', '#F4EFE6', '#C9A227', '#1E1E20', 'gold_serif', ['storefront', 'billboard', 'rooftop', 'livery'], 'A capital A inside a ring of laurel.'),
  club_salitre: brand('club_salitre', 'Club Salitre', 'nightclub', 'Doors at ten. Regrets at four', '#1B1B2F', '#FF4FA3', '#3DE0D0', 'neon_script', ['storefront', 'billboard'], 'A salt crystal drawn as a disco ball.'),
  lux_marea: brand('lux_marea', 'Lux Marea', 'nightclub', 'If your name is on the list, you already know', '#101018', '#E8C46A', '#8A5CF6', 'thin_neon_caps', ['storefront'], 'A crescent tide line under the letters.'),
  salon_guaracha: brand('salon_guaracha', 'Salón Guaracha', 'nightclub', 'Baile todas las noches', '#7C1F2B', '#FBE3A6', '#F2B544', 'painted_wall', ['storefront'], 'A pair of maracas crossed over a dancing shoe.'),
  bahia_vista_yacht_club: brand('bahia_vista_yacht_club', 'Bahía Vista Yacht Club', 'private_club', 'Members and their guests', '#14294A', '#F4EFE6', '#C9A227', 'gold_serif', ['storefront', 'flag'], 'A burgee with a gold compass rose.'),
  coral_beach_club: brand('coral_beach_club', 'Coral Beach Club', 'private_club', 'By invitation', '#F28B82', '#FFFFFF', '#14294A', 'gold_serif', ['storefront', 'flag'], 'A branch of coral in a circle.'),
  // Bars and food
  ancla_torcida: brand('ancla_torcida', 'Cantina El Ancla Torcida', 'bar', 'Since nobody remembers', '#2F6F6A', '#F4E4C1', '#C75B7A', 'painted_wall', ['storefront'], 'An anchor with a bent shank.'),
  cantina_la_sentina: brand('cantina_la_sentina', 'Cantina La Sentina', 'bar', 'The shift ends here', '#0E3B43', '#F28C28', '#E9E4D8', 'stencil', ['storefront'], 'A bilge pump handle and a beer glass.'),
  mudline_roadhouse: brand('mudline_roadhouse', 'The Mudline Roadhouse', 'bar', 'Wipe your boots or do not', '#3A2A1E', '#C9B84A', '#D8432F', 'neon_script', ['storefront', 'roadside_pylon'], 'A tyre track turning into an alligator tail.'),
  dos_soles_diner: brand('dos_soles_diner', 'Dos Soles Diner', 'diner', 'Breakfast twice a day', '#3DBFC4', '#FFFFFF', '#FFB52E', 'neon_script', ['storefront', 'billboard', 'roadside_pylon'], 'Two overlapping suns like fried eggs.'),
  fonda_dona_pilar: brand('fonda_dona_pilar', 'Fonda Doña Pilar', 'diner', 'One menu. No substitutions', '#F4E4C1', '#7C1F2B', '#2F6F6A', 'painted_wall', ['storefront'], 'A ladle crossed with a wooden spoon.'),
  grua_grill: brand('grua_grill', 'Grúa Grill', 'diner', 'Plates you need a crane for', '#F2C230', '#1E1E20', '#D8432F', 'block_letters', ['storefront', 'roadside_pylon'], 'A gantry crane lifting a burger.'),
  pollo_pirata: brand('pollo_pirata', 'Pollo Pirata', 'fast_food', 'We plunder the flavour', '#D8432F', '#FFE08A', '#1E1E20', 'block_letters', ['billboard', 'livery', 'storefront'], 'A chicken with an eyepatch and a tricorn hat.'),
  helados_la_ola: brand('helados_la_ola', 'Helados La Ola', 'ice_cream', 'Catch it before it melts', '#7FD6C8', '#FFFFFF', '#FF7AA8', 'bubble_letters', ['billboard', 'storefront', 'cart'], 'A wave curling into a soft-serve swirl.'),
  cafe_tinto_real: brand('cafe_tinto_real', 'Café Tinto Real', 'coffee', 'Small cup. Long day', '#4A2C1D', '#F4E4C1', '#C8372D', 'enamel_plate', ['billboard', 'storefront'], 'A tiny cup wearing a crown.'),
  // Drinks
  coco_bravo: brand('coco_bravo', 'Coco Bravo', 'soft_drink', 'Shake the tree!', '#19A974', '#FFFFFF', '#FFD23F', 'bubble_letters', ['billboard', 'livery', 'vending', 'rooftop'], 'A coconut flexing a palm-leaf arm.'),
  cerveza_faro: brand('cerveza_faro', 'Cerveza Faro', 'beer', 'The light at the end of the shift', '#F2B544', '#14294A', '#FFFFFF', 'enamel_plate', ['billboard', 'livery', 'storefront'], 'A lighthouse whose beam is a pour of beer.'),
  ron_tres_mareas: brand('ron_tres_mareas', 'Ron Tres Mareas', 'spirits', 'Aged by three tides', '#5C2A1E', '#E8C46A', '#F4EFE6', 'gold_serif', ['billboard'], 'Three stacked wave lines on a barrel head.'),
  // Shops
  brisa_y_hilo: brand('brisa_y_hilo', 'Brisa & Hilo', 'fashion', 'Dress like you are on holiday. You are', '#FF7A59', '#FFFFFF', '#2F6F6A', 'neon_script', ['storefront', 'billboard'], 'A needle threaded with a breeze line.'),
  ropa_vieja_vintage: brand('ropa_vieja_vintage', 'Ropa Vieja Vintage', 'fashion', 'Jackets with history', '#6B4E71', '#F4E4C1', '#E0B13C', 'painted_wall', ['storefront'], 'A coat hanger shaped like a moustache.'),
  atelier_lomas: brand('atelier_lomas', 'Atelier Lomas', 'fashion', 'By appointment', '#2A2A33', '#D8CFB8', '#8A7A62', 'thin_serif', ['storefront'], 'A pair of tailor\'s shears, closed.'),
  casa_lino: brand('casa_lino', 'Casa Lino', 'fashion', 'Forty shades of white', '#F4EFE6', '#8A7A62', '#3FA9B3', 'thin_serif', ['storefront', 'billboard'], 'A single flax flower.'),
  linea_blanca: brand('linea_blanca', 'Línea Blanca', 'fashion', 'Sharp enough', '#FFFFFF', '#1E1E20', '#C8372D', 'thin_neon_caps', ['storefront', 'billboard'], 'One white line under the name.'),
  galerias_aurora: brand('galerias_aurora', 'Galerías Aurora', 'mall', 'Three floors of yes', '#8A5CF6', '#FFFFFF', '#FFC53D', 'lightbox', ['storefront', 'billboard', 'rooftop'], 'A sunrise fan of seven rays.'),
  bodega_la_esquina: brand('bodega_la_esquina', 'Bodega La Esquina', 'grocery', 'If we do not have it, you do not need it', '#F2C230', '#C8372D', '#1D4E7A', 'painted_wall', ['storefront'], 'A street corner drawn as an arrow.'),
  mercadito_24: brand('mercadito_24', 'Mercadito 24', 'grocery', 'Open, obviously', '#E6392F', '#FFFFFF', '#2BB673', 'lightbox', ['storefront', 'livery'], 'A clock face with no hands.'),
  pantano_provisions: brand('pantano_provisions', 'Pantano Provisions', 'grocery', 'Bait, batteries, directions', '#4E6B3A', '#F4E4C1', '#D8432F', 'stencil', ['storefront'], 'A heron holding a shopping basket.'),
  voltio: brand('voltio', 'Voltio Electrónica', 'electronics', 'Louder. Brighter. Cheaper', '#0B5FFF', '#FFFFFF', '#FFE600', 'lightbox', ['storefront', 'billboard'], 'A lightning bolt for the letter V.'),
  marea_movil: brand('marea_movil', 'Marea Móvil', 'telecom', 'Five bars from the pier to the swamp', '#00B3A4', '#FFFFFF', '#FF4FA3', 'lightbox', ['billboard', 'livery', 'storefront'], 'Signal bars rising like a tide.'),
  farmacia_santa_marea: brand('farmacia_santa_marea', 'Farmacia Santa Marea', 'pharmacy', 'Open when it hurts', '#FFFFFF', '#1F9A6B', '#D8432F', 'lightbox', ['storefront'], 'A green cross on a wave.'),
  trueno_armory: brand('trueno_armory', 'Trueno Armory', 'gun_shop', 'Speak softly', '#2B2B2E', '#E8B23A', '#C8372D', 'stencil', ['storefront'], 'A thunderbolt through a target ring.'),
  pantano_gun_and_bait: brand('pantano_gun_and_bait', 'Pantano Gun & Bait', 'gun_shop', 'Something for everything that bites', '#5C3A21', '#F2C230', '#4E6B3A', 'painted_wall', ['storefront', 'roadside_pylon'], 'A fish hook crossed with a shotgun shell.'),
  // Fuel, garages and paint
  solana_fuel: brand('solana_fuel', 'Solana Fuel', 'fuel', 'Fill up on sunshine', '#FFB52E', '#D8432F', '#FFFFFF', 'lightbox', ['storefront', 'roadside_pylon', 'billboard'], 'A half sun rising over a road.'),
  petromar: brand('petromar', 'Petromar', 'fuel', 'Diesel, coffee, paperwork', '#0E4C92', '#FFFFFF', '#2BB673', 'lightbox', ['storefront', 'roadside_pylon', 'livery'], 'A drop of oil with a wave inside it.'),
  capa_fresca: brand('capa_fresca', 'Capa Fresca', 'auto_service', 'New paint. No questions', '#FF4FA3', '#FFFFFF', '#3DE0D0', 'bubble_letters', ['storefront', 'billboard'], 'A spray can wearing a halo.'),
  lodo_y_laca: brand('lodo_y_laca', 'Lodo y Laca', 'auto_service', 'We remember nothing', '#6B4129', '#F2C230', '#3DBFC4', 'painted_wall', ['storefront'], 'A paint drip landing in a mud splash.'),
  tolliver_tow: brand('tolliver_tow', 'Tolliver Tow & Recovery', 'auto_service', 'We come and get it', '#2F5D8A', '#F2E6C8', '#E0A526', 'painted_wall', ['storefront', 'livery'], 'A tow hook shaped like a letter T.'),
  chatarreria_el_remache: brand('chatarreria_el_remache', 'Chatarrería El Remache', 'auto_service', 'Nothing leaves whole', '#2B2B2E', '#F08A3C', '#C0C4C8', 'stencil', ['storefront'], 'A rivet head throwing a spark.'),
  marea_motorsport: brand('marea_motorsport', 'Marea Motorsport', 'auto_service', 'Faster than the tide', '#101820', '#3DE0D0', '#FF4FA3', 'thin_neon_caps', ['storefront', 'billboard'], 'A tachometer needle drawn as a wave.'),
  lomas_prestige_motors: brand('lomas_prestige_motors', 'Lomas Prestige Motors', 'car_dealership', 'You have arrived. Now leave quickly', '#F4EFE6', '#1E1E20', '#C9A227', 'thin_serif', ['storefront', 'billboard'], 'A winding hill road as a monogram.'),
  // Vehicle makers
  tavira: brand('tavira', 'Tavira', 'auto_maker', 'It starts', '#1D4E7A', '#F2F0E8', '#C0C4C8', 'badge', ['badge', 'billboard'], 'A rounded T inside an oval.'),
  lucero: brand('lucero', 'Lucero', 'auto_maker', 'Arrive as if you were expected', '#1E1E20', '#D8CFB8', '#C9A227', 'badge', ['badge', 'billboard'], 'An eight-pointed morning star.'),
  zarco: brand('zarco', 'Zarco', 'auto_maker', 'The wind does not signal', '#1456C4', '#FFFFFF', '#C0C4C8', 'badge', ['badge', 'billboard'], 'A slanted Z like a gust line.'),
  ravello: brand('ravello', 'Ravello', 'auto_maker', 'Unreasonable by design', '#C8102E', '#F2F0E8', '#1E1E20', 'badge', ['badge', 'billboard'], 'A rearing ram\'s horn curl in a shield.'),
  holloway: brand('holloway', 'Holloway', 'auto_maker', 'Eight cylinders. No apologies', '#2B2B2E', '#F2F0E8', '#C8372D', 'badge', ['badge', 'billboard'], 'A block H with a lightning notch.'),
  delmara: brand('delmara', 'Delmara', 'auto_maker', 'Sunset included', '#3DBFC4', '#FFFFFF', '#FF7A59', 'badge', ['badge', 'billboard'], 'A chrome script with a setting-sun dot.'),
  yunque: brand('yunque', 'Yunque', 'auto_maker', 'Hit it with a hammer; it is fine', '#3A3D40', '#F2C230', '#F2F0E8', 'badge', ['badge', 'billboard'], 'An anvil in profile.'),
  brazo: brand('brazo', 'Brazo', 'auto_maker', 'Carries the city', '#1F6F4A', '#FFFFFF', '#F2C230', 'badge', ['badge'], 'A flexed arm made of three bars.'),
  rayo: brand('rayo', 'Rayo', 'auto_maker', 'Two wheels, one opinion', '#FFE600', '#1E1E20', '#C8372D', 'badge', ['badge', 'billboard'], 'A single bolt of lightning, leaning forward.'),
  cypress_cycle_works: brand('cypress_cycle_works', 'Cypress Cycle Works', 'auto_maker', 'Built slow to ride slow', '#26262B', '#C9B84A', '#5C3A21', 'badge', ['badge'], 'A cypress tree whose trunk is a front fork.'),
  golfo_aero: brand('golfo_aero', 'Golfo Aero', 'aircraft_maker', 'Above it all', '#F2F0E8', '#14294A', '#3DBFC4', 'badge', ['badge'], 'A rotor disc seen from above, as a compass.'),
  olabarria_marine: brand('olabarria_marine', 'Olabarría Marine', 'marine', 'Three generations of hulls', '#0E3B43', '#F2F0E8', '#1F9AA0', 'enamel_plate', ['badge', 'storefront', 'livery'], 'A sailfish leaping over the letter O.'),
  prieto_charters: brand('prieto_charters', 'Prieto Charters', 'marine', 'Out by dawn, back with a story', '#5CC4BE', '#FFFFFF', '#F28C28', 'painted_wall', ['storefront'], 'A fishing rod bent into a P.'),
  // Port, freight and transport
  naviera_tamarindo: brand('naviera_tamarindo', 'Naviera Tamarindo', 'shipping', 'Everything arrives', '#C8372D', '#FFFFFF', '#14294A', 'block_letters', ['livery', 'container', 'storefront'], 'A tamarind pod as a ship\'s hull.'),
  frigorificos_golfo: brand('frigorificos_golfo', 'Frigoríficos Golfo', 'logistics', 'Cold, sealed, on time', '#DFF3FA', '#0E4C92', '#3DBFC4', 'block_letters', ['livery', 'storefront', 'container'], 'A snowflake with a fish at its centre.'),
  gaviota_express: brand('gaviota_express', 'Gaviota Express', 'logistics', 'It gets there', '#FFFFFF', '#E6392F', '#14294A', 'block_letters', ['livery', 'billboard'], 'A seagull carrying a parcel by the string.'),
  metro_marazul: brand('metro_marazul', 'Metro Marazul', 'transit', 'Línea 12: Centro, Playa Dorada, Bahía Vista', '#1E9AA6', '#F3EBD8', '#F2B544', 'enamel_plate', ['livery', 'storefront', 'bus_stop'], 'An M whose middle is a wave.'),
  cangrejo_cab: brand('cangrejo_cab', 'Cangrejo Cab', 'taxi', 'We go straight there', '#E8703A', '#F3E9D2', '#2B2B2E', 'block_letters', ['livery', 'billboard'], 'A crab with a taxi light on its shell.'),
  alas_del_golfo: brand('alas_del_golfo', 'Alas del Golfo', 'airline', 'The Gulf, from above', '#14294A', '#FFFFFF', '#FFB52E', 'thin_serif', ['billboard'], 'A pelican in flight, wings as a tick.'),
  // Money
  banco_meridiano: brand('banco_meridiano', 'Banco Meridiano', 'bank', 'Your money, at the centre of everything', '#0B2545', '#FFFFFF', '#3DBFC4', 'thin_serif', ['storefront', 'billboard', 'rooftop'], 'A globe line crossed by a vertical meridian.'),
  caja_coral: brand('caja_coral', 'Caja Coral Savings', 'bank', 'Small bank. Discreet tellers', '#F28B82', '#FFFFFF', '#14294A', 'lightbox', ['storefront'], 'A piggy bank shaped like a seashell.'),
  seguros_el_ancla: brand('seguros_el_ancla', 'Seguros El Ancla', 'insurance', 'Holds, whatever happens. Terms apply', '#14294A', '#FFFFFF', '#E6392F', 'block_letters', ['billboard', 'storefront'], 'An anchor inside an umbrella.'),
  aurelia_group: brand('aurelia_group', 'Aurelia Group', 'real_estate', 'Building the Marazul of tomorrow', '#F4EFE6', '#C9A227', '#1E1E20', 'gold_serif', ['billboard', 'hoarding'], 'A skyline rising out of a laurel wreath.'),
  loteria_del_golfo: brand('loteria_del_golfo', 'Lotería del Golfo', 'lottery', 'Somebody has to win. Probably', '#8A1FBF', '#FFE600', '#FFFFFF', 'bubble_letters', ['billboard', 'storefront'], 'A numbered ball with a starfish on it.'),
  // Public services, media and sport
  marazul_police: brand('marazul_police', 'Policía de Marazul', 'public_service', 'Guardianes del Golfo', '#F2F0E8', '#1D4E7A', '#E8B23A', 'block_letters', ['livery', 'storefront'], 'A gold lighthouse inside a blue shield.'),
  marazul_fire_rescue: brand('marazul_fire_rescue', 'Marazul Fire & Rescue', 'public_service', 'Primero en llegar', '#F4F2EC', '#D8432F', '#1F9AA0', 'block_letters', ['livery', 'storefront'], 'A red anchor crossed with a fire axe.'),
  santa_brisa_health: brand('santa_brisa_health', 'Hospital General Santa Brisa', 'health', 'Emergencias 24 horas', '#FFFFFF', '#1F9AA0', '#D8432F', 'lightbox', ['storefront'], 'A cross made of four breeze curls.'),
  clinica_las_lomas: brand('clinica_las_lomas', 'Clínica Las Lomas', 'health', 'Private care, public discretion', '#F4EFE6', '#2456A6', '#C9A227', 'thin_serif', ['storefront'], 'A hill line under a small cross.'),
  vigia_azul: brand('vigia_azul', 'Vigía Azul Security', 'security', 'Siempre despiertos', '#2456A6', '#F2F0E8', '#F2C230', 'block_letters', ['livery', 'storefront', 'gate_plate'], 'A blue eye inside a watchtower.'),
  canal_6_golfo: brand('canal_6_golfo', 'Canal 6 Golfo', 'media', 'If it crashes, we are overhead', '#C2337A', '#F1EFEA', '#2B2F36', 'lightbox', ['livery', 'billboard', 'storefront'], 'A numeral 6 whose loop is a camera lens.'),
  el_faro_diario: brand('el_faro_diario', 'El Faro Diario', 'media', 'All the news the owners approve', '#F4EFE6', '#1E1E20', '#C8372D', 'thin_serif', ['billboard', 'newsstand'], 'A lighthouse drawn as a fountain-pen nib.'),
  fundidores_de_marazul: brand('fundidores_de_marazul', 'Fundidores de Marazul', 'sports_team', 'Forjados aquí', '#7C1F2B', '#F2B544', '#F2F0E8', 'block_letters', ['storefront', 'billboard', 'flag'], 'A baseball in a pair of foundry tongs.'),
  sol_y_sombra: brand('sol_y_sombra', 'Sol y Sombra', 'sunscreen', 'Factor fifty. You will need it', '#FFD23F', '#D8432F', '#FFFFFF', 'bubble_letters', ['billboard'], 'A sun wearing a wide-brimmed hat.'),
});

/** The brand kinds, for filtering billboards and storefronts by what a block needs. */
export const BRAND_KINDS = Object.freeze([
  'hotel', 'motel', 'casino', 'nightclub', 'private_club', 'bar', 'diner', 'fast_food', 'ice_cream', 'coffee',
  'soft_drink', 'beer', 'spirits', 'fashion', 'mall', 'grocery', 'electronics', 'telecom', 'pharmacy', 'gun_shop',
  'fuel', 'auto_service', 'car_dealership', 'auto_maker', 'aircraft_maker', 'marine', 'shipping', 'logistics', 'transit', 'taxi', 'airline',
  'bank', 'insurance', 'real_estate', 'lottery', 'public_service', 'health', 'security', 'media', 'sports_team', 'sunscreen',
]);

/** Sign styles the sign-texture generator draws; fonts are system fonts only. */
export const SIGN_STYLES = freezeCatalog({
  neon_script: { id: 'neon_script', font: 'italic 700 1em "Brush Script MT", "Segoe Script", cursive', glow: true, lit: 'night', backing: 'dark_panel' },
  thin_neon_caps: { id: 'thin_neon_caps', font: '300 1em "Helvetica Neue", Arial, sans-serif', letterSpacing: 0.3, uppercase: true, glow: true, lit: 'night', backing: 'dark_panel' },
  deco_marquee: { id: 'deco_marquee', font: '700 1em "Gill Sans", "Trebuchet MS", sans-serif', letterSpacing: 0.18, uppercase: true, glow: true, lit: 'night', backing: 'stepped_fin' },
  gold_serif: { id: 'gold_serif', font: '600 1em Georgia, "Times New Roman", serif', letterSpacing: 0.12, uppercase: true, glow: false, lit: 'uplight', backing: 'stone_or_brass' },
  thin_serif: { id: 'thin_serif', font: '400 1em Georgia, "Times New Roman", serif', letterSpacing: 0.2, uppercase: true, glow: false, lit: 'uplight', backing: 'flat_panel' },
  block_letters: { id: 'block_letters', font: '800 1em "Arial Black", Impact, sans-serif', uppercase: true, glow: false, lit: 'floodlight', backing: 'flat_panel' },
  bubble_letters: { id: 'bubble_letters', font: '800 1em "Arial Rounded MT Bold", "Trebuchet MS", sans-serif', outline: true, glow: false, lit: 'lightbox', backing: 'flat_panel' },
  lightbox: { id: 'lightbox', font: '700 1em "Helvetica Neue", Arial, sans-serif', glow: false, lit: 'lightbox', backing: 'acrylic_box' },
  painted_wall: { id: 'painted_wall', font: '700 1em Georgia, serif', weathered: true, glow: false, lit: 'none', backing: 'facade' },
  enamel_plate: { id: 'enamel_plate', font: '700 1em "Gill Sans", "Trebuchet MS", sans-serif', uppercase: true, border: true, glow: false, lit: 'none', backing: 'enamel' },
  stencil: { id: 'stencil', font: '700 1em "Courier New", monospace', uppercase: true, weathered: true, glow: false, lit: 'none', backing: 'metal_or_shutter' },
  badge: { id: 'badge', font: '700 1em "Helvetica Neue", Arial, sans-serif', uppercase: true, chrome: true, glow: false, lit: 'none', backing: 'none' },
});

/** Where billboards go and which brand kinds each district favours. */
export const BILLBOARD_RULES = freezeCatalog({
  aspect: [2.9, 1],
  sizeMetres: [14.6, 5],
  layout: 'logo left third, name in the sign style, slogan below in 40 percent height',
  districtFavourites: {
    playa_dorada: ['hotel', 'soft_drink', 'sunscreen', 'ice_cream', 'nightclub', 'fashion'],
    centro: ['bank', 'insurance', 'telecom', 'electronics', 'media', 'airline'],
    la_marisma: ['coffee', 'beer', 'grocery', 'lottery', 'pharmacy'],
    puerto_tamarindo: ['shipping', 'logistics', 'beer', 'fuel', 'fast_food'],
    barrio_hierro: ['auto_service', 'auto_maker', 'sports_team', 'beer', 'soft_drink'],
    las_lomas: ['car_dealership', 'real_estate', 'security', 'fashion', 'spirits'],
    bahia_vista: ['casino', 'spirits', 'fashion', 'real_estate', 'marine'],
    isla_coral: ['real_estate', 'private_club'],
    los_pantanos: ['fuel', 'motel', 'fast_food', 'gun_shop', 'lottery'],
  },
});

/** Builds one brand entry. */
function brand(id, name, kind, slogan, primary, secondary, accent, signStyle, uses, logo) {
  return { id, name, kind, slogan, colors: { primary, secondary, accent }, signStyle, uses, logo };
}

/** Recursively freezes a plain data tree so that no system can mutate the shared catalog. */
function freezeCatalog(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) freezeCatalog(value[key]);
  }
  return value;
}
