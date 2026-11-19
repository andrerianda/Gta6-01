// The flight screen's DOM pieces, run against a small stand-in document: the notice slot (one card
// at a time while flying, the rest queued), the key hint (brief after boarding, gone at the first
// key, back only on request), the location banner's names (the air base, the aerodrome, the island
// and the sea instead of a district the player is not in), the brief banner in flight, the story
// subtitle's mark on the page, and the air guard's corner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLIGHT_HINT_SECONDS, NOTICE_MIN_SECONDS, NOTICE_QUEUE_LIMIT, createNotifications } from '../../../game/src/ui/notifications.js';
import { PLACE_MARGINS, SEA_NAMES, createNamedPlaces, distanceToRing } from '../../../game/src/ui/namedPlaces.js';
import { createLocationBanner } from '../../../game/src/ui/locationBanner.js';
import { createStorySubtitles } from '../../../game/src/ui/storySubtitles.js';
import { connectHeadUpDisplay } from '../../../game/src/ui/headUpDisplayEvents.js';
import { createAirGuardHud } from '../../../game/src/flight/defence/airGuardHud.js';
import { GAME_EVENTS } from '../../../game/src/core/events/gameEvents.js';
import { PUNTA_GARZA_AIR_BASE, puntaGarzaToWorld } from '../../../game/src/catalog/puntaGarzaAirBase.js';
import { SEA_AND_AIRSPACE_CHART } from '../../../game/src/catalog/seaAndAirspaceChart.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';

/** A stand-in element: classes, dataset, hidden, text, children, an inline style. */
function element(tag) {
  const classes = new Set();
  const node = {
    tag, hidden: false, textContent: '', dataset: {}, children: [], style: { cssText: '' }, attributes: {}, offsetWidth: 0, parent: null,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, on) => ((on ?? !classes.has(name)) ? classes.add(name) : classes.delete(name)),
      contains: (name) => classes.has(name),
    },
    set className(value) { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach((name) => classes.add(name)); },
    get className() { return [...classes].join(' '); },
    append(...nodes) { for (const child of nodes) { node.children = node.children.filter((each) => each !== child); node.children.push(child); child.parent = node; } },
    appendChild(child) { node.append(child); },
    setAttribute(name, value) { node.attributes[name] = value; },
    remove() { if (node.parent) node.parent.children = node.parent.children.filter((each) => each !== node); },
  };
  return node;
}

function makeDocument() {
  const listeners = {};
  const view = {
    addEventListener: (type, handler) => { (listeners[type] ??= []).push(handler); },
    removeEventListener: (type, handler) => { listeners[type] = (listeners[type] ?? []).filter((each) => each !== handler); },
    setTimeout: () => 1, clearTimeout: () => {},
    press: (code) => (listeners.keydown ?? []).forEach((handler) => handler({ code, repeat: false })),
  };
  return { body: element('body'), defaultView: view, createElement: element, createElementNS: (ns, tag) => element(tag) };
}

const shownCards = (hud) => hud.children[0].children.filter((child) => child.classList.contains('hud-note') && child.classList.contains('is-shown'));
const HINT = 'throttle up, Ctrl down, W/S pitch, A/D roll';

test('on foot three cards stack; in flight one notice shows and the rest wait their turn', () => {
  const document = makeDocument();
  const hud = element('div');
  const notes = createNotifications(document, hud);
  notes.post('one');
  notes.post('two');
  assert.equal(shownCards(hud).length, 2, 'the stack, as before');
  notes.update(10);
  assert.equal(shownCards(hud).length, 0);

  notes.setFlying(true);
  assert.ok(hud.children[0].classList.contains('is-flight'));
  notes.post('Tower: confirm your readiness', 'warning', 9);
  notes.post('Radar signature: PAINTED', 'info', 6);
  notes.post('Checkpoint reached', 'mission', 6);
  notes.post('Radar signature: PAINTED', 'info', 6);           // a repeat of a waiting notice is dropped
  notes.post('Tower: confirm your readiness', 'warning', 9);    // and of the one on screen
  assert.equal(shownCards(hud).length, 1, 'one notice in the slot');
  assert.equal(shownCards(hud)[0].children[0].textContent, 'Tower: confirm your readiness');
  assert.equal(notes.waiting, 2);
  // The card on screen makes room once it has had its minimum time; the next takes the slot.
  notes.update(NOTICE_MIN_SECONDS - 0.5);
  assert.equal(shownCards(hud)[0].children[0].textContent, 'Tower: confirm your readiness');
  notes.update(0.6);
  assert.equal(shownCards(hud).length, 1);
  assert.equal(shownCards(hud)[0].children[0].textContent, 'Radar signature: PAINTED');
  assert.equal(shownCards(hud)[0].dataset.kind, 'info');
  for (let i = 0; i < 40; i += 1) { notes.update(0.5); assert.ok(shownCards(hud).length <= 1, 'never two at once'); }
  assert.equal(notes.waiting, 0);
  // The queue is short: the oldest waiting notice gives way.
  notes.post('first', 'info', 30);
  for (let i = 0; i < NOTICE_QUEUE_LIMIT + 3; i += 1) notes.post(`later ${i}`);
  assert.equal(notes.waiting, NOTICE_QUEUE_LIMIT);
  // Out of the aircraft the waiting notices come out as cards again.
  notes.setFlying(false);
  assert.ok(shownCards(hud).length >= 2);
  assert.equal(notes.waiting, 0);
});

test('boarding with cards on screen keeps the newest and queues the others', () => {
  const hud = element('div');
  const notes = createNotifications(makeDocument(), hud);
  notes.post('old', 'info', 8);
  notes.update(1);
  notes.post('new', 'info', 8);
  notes.setFlying(true);
  assert.equal(shownCards(hud).length, 1);
  assert.equal(shownCards(hud)[0].children[0].textContent, 'new');
  assert.equal(notes.waiting, 1);
});

test('the key hint shows briefly after boarding, leaves at the first key and returns only on request', () => {
  const hud = element('div');
  const notes = createNotifications(makeDocument(), hud);
  const help = hud.children[0].children.find((child) => child.classList.contains('hud-help'));
  // On foot the prompt stands until it is cleared, as before.
  notes.setHelp('F', 'Steal the car');
  assert.equal(help.hidden, false);
  assert.ok(!help.classList.contains('is-flight'));
  notes.update(60);
  assert.equal(help.hidden, false);
  notes.setHelp(null, null);
  assert.equal(help.hidden, true);

  // Boarding: the pilot's seat asks for the hint (before or after the HUD learns of the flight).
  notes.setHelp('Shift', HINT);
  notes.setFlying(true);
  assert.ok(help.classList.contains('is-flight') && help.classList.contains('is-shown'));
  assert.equal(notes.hintShown, true);
  notes.dismissHint();
  assert.ok(help.classList.contains('is-shown'), 'the key that boarded does not dismiss it');
  notes.update(FLIGHT_HINT_SECONDS - 0.5);
  assert.ok(help.classList.contains('is-shown'), `it stays about ${FLIGHT_HINT_SECONDS} s`);
  notes.update(0.6);
  assert.ok(!help.classList.contains('is-shown'), 'then fades');
  notes.update(1);
  assert.equal(help.hidden, true, 'and is taken out');
  assert.equal(notes.hintShown, false);
  // The seat repeating or clearing its hint never brings it back.
  notes.setHelp('Shift', HINT);
  notes.setHelp(null, null);
  notes.setHelp('Shift', HINT);
  notes.update(1);
  assert.equal(help.hidden, true);
  // H asks for it; a key sends it away at once; H again toggles.
  notes.recallHint();
  assert.equal(help.hidden, false);
  assert.ok(help.classList.contains('is-shown'));
  assert.equal(help.children[1].textContent, HINT);
  notes.update(1);
  notes.dismissHint();
  assert.ok(!help.classList.contains('is-shown'), 'the first input dismisses it');
  notes.update(1);
  assert.equal(help.hidden, true);
  notes.recallHint();
  notes.recallHint();
  assert.ok(!help.classList.contains('is-shown'), 'H while it is up puts it away');
  // A different prompt (a stage's short instruction) is new information: it shows once.
  notes.update(1);
  notes.setHelp(null, 'Landing before you step out');
  assert.ok(help.classList.contains('is-shown'));
  // Leaving the aircraft: an ordinary prompt again; the next boarding shows the hint again.
  notes.setHelp(null, null);
  notes.setFlying(false);
  assert.ok(!help.classList.contains('is-flight'));
  assert.equal(help.hidden, true);
  notes.setFlying(true);
  notes.setHelp('Shift', HINT);
  assert.ok(help.classList.contains('is-shown'));
});

test('the banner names the base, the aerodrome, the island and the sea, never a district the player is not in', () => {
  const plan = generateCityPlan(createSeededRandom('1'));
  const places = createNamedPlaces(plan);
  const at = (x, z) => places.placeAt(x, z)?.name ?? null;
  const base = PUNTA_GARZA_AIR_BASE;
  // On the base: the apron, both ends of the runway on its causeway, the gate.
  const [fromE, fromN] = base.runway.from;
  const [toE, toN] = base.runway.to;
  for (const [e, n] of [[fromE - 20, fromN], [toE + 20, toN], [(fromE + toE) / 2, fromN], [-1400, 1000]]) {
    const p = puntaGarzaToWorld(e, n);
    assert.equal(at(p.x, p.z), 'Base Aérea Punta Garza', `city ${e}, ${n}`);
  }
  // At the aerodrome: its lot and along its runway.
  const strip = plan.landmarkById.aerodromo_los_pantanos;
  assert.equal(at(strip.x, strip.z), 'Aeródromo Los Pantanos');
  const runway = plan.specialAreas.find((area) => area.kind === 'runway' && area.landmarkId === 'aerodromo_los_pantanos');
  assert.equal(at(runway.x, runway.z), 'Aeródromo Los Pantanos');
  assert.equal(at(runway.line[0], runway.line[1]), 'Aeródromo Los Pantanos');
  // In the city: no name of ours, the district's card stays (Centro only in Centro).
  assert.equal(at(0, 0), null);
  assert.equal(plan.districtAt(0, 0), 'centro');
  assert.equal(at(-800, -1100), null, 'Los Pantanos beyond the aerodrome is the district');
  // Offshore: the sea inside the boundary, the open sea past it, the island around Norvast.
  const chart = SEA_AND_AIRSPACE_CHART;
  assert.equal(at(-3000, -1500), SEA_NAMES.coastal);
  assert.equal(at(chart.cityExtent.minX - 10, 0), 'Mar de Marazul');
  assert.equal(at(chart.centre.x - chart.boundary.warn - 300, chart.centre.z), 'Mar Abierto');
  const island = chart.norvastIsland;
  assert.equal(at(island.x, island.z), 'Isla Norvast');
  assert.equal(at(island.x + island.radius * 1.3, island.z), 'Isla Norvast');
  assert.equal(at(island.x + island.radius * (PLACE_MARGINS.islandFactor + 0.4), island.z), 'Mar Abierto');
  assert.equal(at(NaN, 0), null);
  // The whole way of the final flight never reads a city district: base, sea, open sea, island.
  const start = puntaGarzaToWorld(toE, toN);
  const seen = [];
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const name = at(start.x + (island.x - start.x) * t, start.z + (island.z - start.z) * t);
    assert.ok(name, `a name at ${Math.round(t * 100)} % of the way`);
    if (seen.at(-1) !== name) seen.push(name);
  }
  assert.deepEqual(seen, ['Base Aérea Punta Garza', 'Mar de Marazul', 'Mar Abierto', 'Isla Norvast']);
  // Without a plan (a stub world) the catalogs still name the base, the island and the sea beyond the map.
  const bare = createNamedPlaces(null);
  assert.equal(bare.placeAt(start.x, start.z).kind, 'base');
  assert.equal(bare.placeAt(0, 0), null);
  assert.equal(bare.placeAt(-9000, 9000).name, 'Mar Abierto');
  assert.equal(distanceToRing([0, 0, 10, 0, 10, 10, 0, 10], 5, 5), 0);
  assert.equal(distanceToRing([0, 0, 10, 0, 10, 10, 0, 10], 13, 5), 3);
});

/** A HUD connection over stand-ins: the events bus, a city, a player in or out of an aircraft. */
function makeConnection() {
  const document = makeDocument();
  const handlers = {};
  const banner = createLocationBanner(document, element('div'));
  const calls = [];
  const location = {
    setDistrict(name, street, seconds) { calls.push({ name, street, seconds }); banner.setDistrict(name, street, seconds); },
    setStreet(name) { calls.push({ street: name }); banner.setStreet(name); },
  };
  const noop = () => {};
  const notifications = createNotifications(document, element('div'));
  const hud = {
    location, notifications, setDriving: noop,
    subtitles: { setEnabled: noop, show: noop }, cash: { set: noop }, wantedStars: { setLevel: noop, setSearching: noop }, vitals: { set: noop },
    weapon: { equip: noop, setAmmunition: noop }, objective: { start: noop, setObjective: noop, setTimer: noop, clear: noop, showResult: noop },
    radio: { show: noop }, call: { show: noop },
  };
  const plan = generateCityPlan(createSeededRandom('1'));
  const world = { position: { x: 0, y: 0, z: 0 }, vehicle: null, view: 'cockpit' };
  const plane = { id: 7, tags: new Set(['airplane']) };
  const context = {
    content: { find: (name) => (name === 'cityDistricts' ? { CITY_DISTRICTS: { centro: { name: 'Centro' }, los_pantanos: { name: 'Los Pantanos' } } } : null) },
    controls: { promptFor: (action) => action },
    events: { on(topic, handler) { (handlers[topic] ??= []).push(handler); return noop; }, emit(topic, payload) { (handlers[topic] ?? []).forEach((handler) => handler(payload)); } },
    settings: { get: () => undefined },
    systems: { find: (name) => (name === 'openWorldCity' ? { plan, nearestRoad: () => null, districtAt: plan.districtAt }
      : name === 'player' ? { vehicle: world.vehicle } : name === 'followCamera' ? { flightView: world.view } : null) },
    entities: { get: (id) => (id === 7 ? plane : null) },
    focus: { position: world.position },
    state: { simulates: true },
    page: { document },
  };
  const connection = connectHeadUpDisplay(context, hud);
  return { connection, context, world, calls, document, notifications, banner, look: () => { connection.tick(0.3); connection.tick(0.3); } };
}

test('the banner waits for the player to be where he is put, then names the place; in flight it is brief and has no street', () => {
  const { connection, context, world, calls, document, look } = makeConnection();
  const base = puntaGarzaToWorld(-1400, 1000);
  // Boot: the city announces the district of the world's origin before the player is put at the base.
  context.events.emit(GAME_EVENTS.DISTRICT_ENTERED, { districtId: 'centro', name: 'Centro' });
  look();
  assert.equal(calls.length, 0, 'nothing before the first frame');
  world.position.x = base.x;
  world.position.z = base.z;
  context.events.emit(GAME_EVENTS.GAME_READY, { seed: 1 });
  look();
  look();
  assert.deepEqual(calls.map((call) => call.name), ['Base Aérea Punta Garza'], 'never Centro at the air base');
  assert.equal(calls[0].seconds, undefined, 'on foot the full card');
  // A jump across the map is looked at again once settled, and a real change of place shows.
  world.position.x = 0;
  world.position.z = 0;
  look();
  look();
  assert.equal(calls.at(-1).name, 'Centro');
  // In the aircraft: the flight screen is marked on the page; over the sea the banner is small and brief.
  world.vehicle = 7;
  connection.tick(0.016);
  assert.equal(connection.flying, true);
  assert.equal(document.body.dataset.flying, 'cockpit');
  world.view = 'chase';
  connection.tick(0.016);
  assert.equal(document.body.dataset.flying, 'chase');
  world.position.x = -3000;
  world.position.z = -1500;
  look();
  look();
  assert.equal(calls.at(-1).name, 'Mar de Marazul');
  assert.equal(calls.at(-1).street, null);
  assert.ok(calls.at(-1).seconds <= 4, 'brief in flight');
  world.vehicle = null;
  connection.tick(0.016);
  assert.equal(connection.flying, false);
  assert.equal(document.body.dataset.flying, undefined);
  connection.dispose();
});

test('the first key in flight sends the hint away and H asks for it', () => {
  const { connection, context, world, document, notifications } = makeConnection();
  world.vehicle = 7;
  connection.tick(0.016);
  context.events.emit(GAME_EVENTS.HELP_PROMPT_CHANGED, { action: 'throttleUp', text: HINT });
  assert.equal(notifications.hintShown, true);
  notifications.update(1);
  document.defaultView.press('KeyW');
  notifications.update(1);
  assert.equal(notifications.hintShown, false);
  document.defaultView.press('KeyH');
  assert.equal(notifications.hintShown, true);
  connection.dispose();
  document.defaultView.press('KeyH');
  assert.equal(notifications.hintShown, true, 'no listener left behind');
});

test('a story line marks the page so the HUD subtitle steps aside, and keeps the faction colours', () => {
  const document = makeDocument();
  const subtitles = createStorySubtitles(document);
  assert.equal(document.body.dataset.storyLine, undefined);
  subtitles.show({ speakerName: 'Coronel Vargas', text: 'Osorio Three-Seven, return to base immediately. That is an order.', tone: 'red', seconds: 4 });
  assert.equal(document.body.dataset.storyLine, '1');
  const [name, words] = subtitles.element.children;
  assert.equal(name.textContent, 'CORONEL VARGAS');
  assert.equal(name.style.color, '#e5484d');
  assert.ok(words.textContent.endsWith('That is an order.'));
  const colourOf = (tone) => { subtitles.show({ speakerName: 'x', text: 'y', tone }); return name.style.color; };
  assert.deepEqual(['amber', 'white', 'violet'].map(colourOf), ['#f2b13c', '#ffffff', '#6f42c1']);
  subtitles.setEnabled(false);
  assert.equal(document.body.dataset.storyLine, undefined);
  subtitles.setEnabled(true);
  subtitles.update(10);
  assert.equal(document.body.dataset.storyLine, undefined, 'the mark leaves with the line');
  subtitles.dispose();
});

test('the air guard sits in its slot of the right column, under the stars', () => {
  const document = makeDocument();
  const host = element('div');
  const guard = createAirGuardHud({ document, element: () => host });
  const root = host.children[0];
  assert.equal(root.className, 'air-guard-hud');
  assert.equal(root.hidden, true);
  assert.match(root.style.cssText, /top:calc\(60 \* var\(--u/);
  assert.match(root.style.cssText, /right:var\(--map-edge/);
  assert.match(root.style.cssText, /max-width:23vw/);
  guard.show(3, 'WEAPONS FREE', 'International airspace: return to Marazul', true);
  assert.equal(root.hidden, false);
  assert.equal(root.children[0].children[0].textContent, 'WEAPONS FREE');
  guard.hide();
  assert.equal(root.hidden, true);
  guard.dispose();
  assert.equal(host.children.length, 0);
});
