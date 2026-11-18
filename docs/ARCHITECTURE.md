# MARAZUL architecture

The contract between the engine core and every game system. Read `docs/CONVENTIONS.md` first
(rules of the build, units, tools); this document says how the game is put together and what
each second-wave specialist builds. The code is the final word: every interface named here has a
JSDoc header in the file given beside it.

## 1. The shape of the game

    game/index.html                    the page: import map, stylesheet, the static containers (ids), main.js
    game/src/main.js                   names the manifest, the engine and the catalogs; starts the game
    game/src/core/                     the engine core (below)
    game/src/<domain>/<entry>.js       one entry module per game system (the manifest lists them)
    game/src/<domain>/...              that system's own files, beside its entry module
    game/src/catalog/                  content as frozen data, no imports
    game/src/assets/                   the asset library (loader, instancing, registry)
    game/src/render/{sky,lighting,postfx,water,weather,textures}/   the atmosphere and texture libraries
    game/src/world/plan/               the city plan generator (library)
    game/src/physics/                  the physics library
    game/src/characters/               the character run-time (library)

A **library** knows nothing about the engine: it is plain functions and classes. A **system**
wraps libraries for the game: it is created by a factory that receives the game context, has a
name and a lifecycle, and talks to other systems through events, commands, the entity registry
and, when it must, the other system's public members (`context.systems.get(name)`).

### Directory map and owners

| Path | What | Owner |
| --- | --- | --- |
| `game/index.html`, `game/styles/`, `game/src/main.js` | page, layout, entry | engine |
| `game/src/core/` (except `math/`, `random/`) | engine core | engine |
| `game/src/core/math/`, `core/random/`, `render/textures/` | scalar and 2D maths, seeded random, procedural textures | math and textures |
| `game/src/catalog/`, `docs/GAME_DESIGN.md` | content catalogs, the game bible | content |
| `game/src/assets/`, `art/` | asset library and the Blender pipeline | assets |
| `game/src/render/{sky,lighting,postfx,water,weather}/` | atmosphere and image pipeline (finished, do not edit) | atmosphere |
| `game/src/world/plan/` | city plan generator | city plan |
| `game/src/physics/` | physics library | physics |
| `game/src/characters/` | skeleton posing, procedural animation, crowds | character run-time |
| `game/src/world/{buildings,streets,props,vegetation}/` | code that assembles the city from plan and assets | open-world city |
| `game/src/render/worldRenderPipeline.js` | system: owns the atmosphere | engine (done) |
| `game/src/{world,player,vehicles,traffic,pedestrians,police,combat,effects,missions,activities,economy,ui,audio,save,showcase}/` | the game systems | second wave, one owner per entry module (section 13) |
| `game/src/core/dev/engineDemonstration.js` | temporary demonstration | deleted by the player and camera owners |
| `tools/tests/<area>/` | tests | the area's owner |

### The page (`game/index.html`)

Static containers, hidden until their state (the stylesheet keys on `<body data-game-state>` and
`data-hud`): `game-viewport` (canvas), `loading-screen` with `loading-progress-bar` and
`loading-status`, `start-menu`, `pause-menu`, `head-up-display` with `hud-minimap` (canvas),
`hud-wanted-stars`, `hud-cash`, `hud-health-and-armour`, `hud-weapon-and-ammunition`,
`hud-mission-objective`, `hud-location-name`, `hud-speedometer`, `hud-subtitles`,
`city-map-screen`, `phone`, `cutscene-letterbox`. Interface systems fill them through
`context.page.element(id)` and add their own style rules from script (or ask the engine owner
for a rule in `game/styles/marazul.css`). Nobody else edits `index.html`.

### What the judge reads, and the import rule that follows from it

The bounty's dossier holds the text of the sources in the order the page loads them
(`index.html`, then a depth-first walk of the static imports of `main.js`), cut at 163,840
bytes; files after the cut are only counted. So the order of static imports decides what is
read: `main.js` imports the manifest first, the manifest imports the 27 entry modules in update
order, then the engine core follows, then the catalogs. For that reason:

- **An entry module is the readable top of its system**: a header comment that says what the
  system does in the game, its factory as the first declaration, its public interface, its
  event subscriptions and its update flow. Keep it under about 4.5 KB;
  `tools/tests/core/systemManifest.test.mjs` fails an entry module over 6 KB, one with a static
  import outside `game/src/core/`, a changed system name, or a dependency cycle.
- **An entry module statically imports only small pure modules of `game/src/core/`**, typically
  `core/events/gameEvents.js`, `core/events/gameCommands.js`, `core/state/gameStates.js`,
  `core/entities/entityKinds.js`, `core/input/controlBindings.js` (the first system to import one
  pulls it forward in the reading order, which is where these catalogues belong). Everything
  else (its own implementation files, libraries,
  `three`) it loads in `init()` with `const { createLaneFollower } = await import('./laneFollowing.js');`.
  Implementation files import each other and the libraries statically, as usual.
- Never add an import to `main.js` or the manifest. Never import another system's files: use
  events, commands and `context.systems.get(name)`.

## 2. Boot sequence (`core/gameEngine.js`)

1. `main.js` builds the content registry and calls `createGameEngine({ window, document, content, systemFactories })`.
   The engine parses the launch options (`?shot ?seed ?quality ?time ?weather ?autostart ?debug`),
   creates the shared services, the WebGL2 renderer on `game-viewport`, picks the quality tier
   (query, then the saved setting, then a first-run GPU benchmark; `low` on a software renderer)
   and publishes `window.MARAZUL`.
2. `engine.start()`: state `loading`; the asset library is created (`context.assets`); every
   system factory is called in manifest order (`systems.createAll`).
3. Every model of the asset registry (all kinds except `dev`) loads with progress (bar 4 to 50 %).
4. Every system's `init(progress)` runs in dependency order (bar 50 to 96 %), then every
   `start()` in manifest order.
5. The engine waits until background work is idle (`context.work`, the job queue drained).
6. State `startMenu` (or `playing` with `?autostart=1`, or the showcase scene of `?shot=`).
7. One settled frame is drawn (per-frame work of every system with no time passing, atmosphere
   settled). `GAME_READY` is emitted, two animation frames pass, then `window.__gameReady` and
   `window.__previewReady` become true and the frame loop starts.
8. Under a software renderer (automation) the frame loop is then held until a key or pointer
   press or `MARAZUL.resume()`; the debug object advances and draws on request.

## 3. The lifecycle of a system (`core/systems/gameSystemContract.js`, `systemRegistry.js`)

    export function createTrafficFlowSystem(context) {      // first declaration of the entry module
      return {
        name: 'traffic',                                    // unique, camelCase; fixed by the manifest
        dependsOn: ['openWorldCity', 'vehicles'],           // init order only
        runsWhen: 'simulating',                             // default; 'always' for interface, audio, saving
        loadWeight: 2,                                      // share of the loading bar; default 1
        async init(progress) { progress(0.5, 'lane graph'); },
        start() {},
        fixedUpdate(stepSeconds) {},                        // 60 Hz
        update(deltaSeconds, alpha) {},                     // once per drawn frame
        lateUpdate(deltaSeconds, alpha) {},                 // after every update(): cameras, followers
        dispose() {},
        // anything else is the system's public interface for other systems
      };
    }

- The **factory** only builds the object: no scene access, no lookup of other systems.
- **init** may be asynchronous; dependencies have finished theirs. Build, register command
  handlers, load implementation modules. Report progress. Long generation goes through
  `context.jobs` so the page stays alive; register streaming work with `context.work`.
- **start** runs after every init, in manifest order: subscribe to events, read what others built.
- **Update order is the manifest order** (section 12), not the dependency order.
- `runsWhen: 'simulating'` systems tick only in game states that simulate (section 6) and get
  simulated time (scaled by the state's time scale and `context.simulation.slowMotion`);
  `'always'` systems tick in every state and get real time in `update` and `lateUpdate`.
- A system that throws in any phase is reported on the error overlay with its name and
  suspended; the others keep running. Do not catch and hide your own errors.
- **Saving**: a system with state to save exposes `serialise()` (plain JSON data) and
  `restore(data)`; the save system calls them (section 11).

Per fixed step the engine runs: input step begin, `commands.flush()`, every `fixedUpdate` in
manifest order, `entities.refreshAll()`, `events.flush()`, input step end. Per frame: the state
timer, `commands.flush()`, every `update`, every `lateUpdate`, 3 ms of `context.jobs`,
`events.flush()`, input frame end; then the picture is drawn through the atmosphere. In
deterministic mode (`MARAZUL.advance`, showcase `tools.advance`) each fixed step is followed by
that frame work with a delta of exactly one step and nothing is drawn; so a system must do
nothing in `update` that depends on real time or on being drawn.

## 4. The game context (`core/systems/gameContext.js`)

| Member | What it is | Defined in |
| --- | --- | --- |
| `content` | catalogs: `get(name)`, `find(name)`, `has`, `missing` | `core/content/contentRegistry.js` |
| `launch`, `seed` | the query options; the world seed | `core/boot/launchOptions.js` |
| `random(label)` | a seeded generator for a named purpose (never `Math.random()` for the world) | `core/random/seededRandom.js` |
| `log` | logger; `context.log.child('traffic')`; nothing but errors reaches the console | `core/diagnostics/logger.js` |
| `reportFault({system, phase, error})` | error overlay and log | `core/diagnostics/errorOverlay.js` |
| `events` | `on`, `once`, `off`, `emit` (now), `queue` (at the next flush) | `core/events/eventBus.js` |
| `commands` | `handle(name, fn)`, `send` (queued), `run` (now, with result), `has` | `core/events/commandQueue.js` |
| `entities` | the entity registry (section 7) | `core/entities/entityRegistry.js` |
| `state` | `current`, `is(...)`, `enter(name, payload)`, `back()`, `simulates`, `secondsInState` | `core/state/gameStateMachine.js` |
| `input` | `pressed`, `held`, `released`, `axis`, `lookX`, `lookY`, `wheel`, `labelFor`, `setVirtual` | `core/input/inputActionMap.js` |
| `controls` | `setPlayContext('onFoot'/'inVehicle')`, `rebind`, `promptFor`, `labels`, `device` (pointer lock) | `core/input/gameInput.js` |
| `clock` | `timeOfDay`, `day`, `weekday`, `phase`, `label()`, `serialise()`, `restore()` | `core/time/gameClock.js` |
| `settings` | `get('audio.master')`, `set`, `reset`, `onChange` | `core/quality/gameSettings.js` |
| `storage` | namespaced, versioned localStorage for the save system | `core/storage/persistentStorage.js` |
| `quality` | `name`, `tier` (the table row), `renderScale`, `set(name)` | `core/quality/activeQuality.js` |
| `jobs` | sliced generation: `add(fnOrGenerator, {priority, owner, label})` returns `{done, cancel}` | `core/jobs/frameBudgetJobQueue.js` |
| `work` | `begin(label)` returns a finish function; `track(promise, label)`; `addSource(name, count)` | `core/jobs/backgroundWorkTracker.js` |
| `view` | `renderer`, `scene`, `camera`, `layers.{world,dynamic,effects,sky}`, `width`, `height`, `onResize` | `core/renderer/rendererBootstrap.js` |
| `focus` | what the camera follows: `position`, `groundLevel`, `speed`, `radius`, `depthOfField`, `distance`, `range` | `core/systems/gameContext.js` |
| `simulation` | `stepSeconds`, `stepCount`, `time`, `slowMotion` (writable) | `core/gameEngine.js` |
| `systems` | `get(name)` (throws), `find(name)` (null), `has`, `names()` | `core/systems/systemRegistry.js` |
| `showcase` | showcase scene registry: `register({name, title, run})` | `core/automation/showcaseSceneRegistry.js` |
| `page` | `document`, `element(id)` | `core/gameEngine.js` |
| `assets` | the asset library with every model loaded: `get(id)`, `instantiate(id)` | `game/src/assets/index.js` |
| `atmosphere` | the atmosphere facade, set in the init of `worldRenderPipeline` | `render/lighting/atmosphere.js` |
| `softwareRenderer` | true under automation's CPU renderer | `core/renderer/softwareRendererDetection.js` |

Utilities a system may import in its implementation files: `core/jobs/sectorStreamer.js`
(focus position to activate and deactivate calls for square sectors, with hysteresis),
`core/math/*`, `core/random/*`, `core/diagnostics/assertions.js`.

## 5. Events and commands

**Events** say what happened; anyone may listen. Topics are the constants of
`core/events/gameEvents.js` (never a string literal); payloads are plain objects with ids, not
object references (the entity is `context.entities.get(id)`), positions as `{x, y, z}`. `emit`
delivers at once; `queue` delivers at the end of the step or frame. An unknown topic is logged.

| Domain | Events (constant: payload) |
| --- | --- |
| game | `GAME_STATE_CHANGED` {from, to, payload}; `LOADING_PROGRESS` {fraction, label}; `GAME_READY` {seed}; `NEW_GAME_STARTED` {seed, characterId} |
| settings, render, input | `SETTINGS_CHANGED` {key, value, previous}; `QUALITY_CHANGED` {tier, quality}; `VIEWPORT_RESIZED` {width, height, pixelRatio}; `RENDER_CONTEXT_LOST`; `RENDER_CONTEXT_RESTORED`; `INPUT_CONTEXT_CHANGED` {context, previous}; `INPUT_BINDING_CHANGED` {context, action, codes} |
| time, weather | `CLOCK_HOUR_CHANGED` {day, hour, weekday}; `CLOCK_DAY_CHANGED` {day, weekday}; `DAY_PHASE_CHANGED` {phase, previous}; `WEATHER_CHANGED` {weather, previous, seconds}; `THUNDER_STRUCK` {distance, azimuth, delay} |
| world | `CITY_SECTOR_ACTIVATED` / `CITY_SECTOR_DEACTIVATED` {key, sectorX, sectorZ}; `DISTRICT_ENTERED` {districtId, previousId, name}; `STREET_CHANGED` {street, districtId}; `LANDMARK_REACHED` {landmarkId, districtId, kind}; `PICKUP_COLLECTED` {pickupId, kind, amount, collectorId, position}; `PROP_BROKEN` {propId, kind, position, causeId} |
| entity | `ENTITY_ADDED` / `ENTITY_REMOVED` {entity} |
| player | `PLAYER_SPAWNED` {playerId, characterId, position, heading}; `PLAYER_CHARACTER_SWITCHED` {characterId, previousId}; `PLAYER_TELEPORTED` {position, heading}; `PLAYER_HEALTH_CHANGED` {health, armour, delta, cause}; `PLAYER_WASTED` {cause, killerId, position, hospitalBill}; `PLAYER_BUSTED` {position, fine, weaponsTaken}; `PLAYER_RESPAWNED` {position, after} |
| vehicle | `VEHICLE_SPAWNED` {vehicleId, modelId, position, ownerSystem}; `VEHICLE_REMOVED` {vehicleId, modelId}; `VEHICLE_ENTERED` {vehicleId, modelId, occupantId, seat, isPlayer}; `VEHICLE_EXITED` {vehicleId, modelId, occupantId, isPlayer, bailedOut}; `VEHICLE_STOLEN` {vehicleId, modelId, thiefId, driverId, position}; `VEHICLE_COLLIDED` {vehicleId, otherId, speed, energy, position, normal}; `VEHICLE_DAMAGED` {vehicleId, amount, health, cause, attackerId, position}; `VEHICLE_DESTROYED` {vehicleId, modelId, cause, attackerId, position}; `VEHICLE_RESPRAYED` {vehicleId, colour, shopId} |
| combat | `WEAPON_FIRED` {shooterId, weaponId, origin, direction, loudness}; `WEAPON_EQUIPPED` {ownerId, weaponId, magazine, reserve}; `AMMO_CHANGED` {ownerId, weaponId, magazine, reserve}; `DAMAGE_DEALT` {targetId, attackerId, amount, kind, weaponId, position, fatal}; `CHARACTER_KILLED` {victimId, killerId, weaponId, factionId, position}; `EXPLOSION_DETONATED` {position, radius, power, causeId, weaponId} |
| crime, police | `CRIME_COMMITTED` {crimeId, offenderId, victimId, position}; `CRIME_WITNESSED` {crimeId, offenderId, witnessId, position, heat}; `WANTED_LEVEL_CHANGED` {level, previous, heat}; `WANTED_SEARCH_STARTED` {lastKnownPosition, seconds}; `WANTED_CLEARED` {reason}; `POLICE_UNIT_DISPATCHED` {unitId, unitKind, position, level}; `POLICE_SPOTTED_PLAYER` {unitId, position} |
| crowd, traffic, factions | `PEDESTRIANS_PANICKED` {position, radius, cause}; `PEDESTRIAN_KNOCKED_DOWN` {pedestrianId, causeId, speed, position}; `TRAFFIC_BLOCKED` {position, vehicleId, seconds}; `FACTION_ATTITUDE_CHANGED` {factionId, attitude, previous} |
| missions | `MISSION_AVAILABLE` {missionId, giverId, position}; `MISSION_STARTED` {missionId, title}; `MISSION_OBJECTIVE_CHANGED` {missionId, index, kind, text, target}; `MISSION_TIMER_CHANGED` {missionId, secondsLeft}; `MISSION_PASSED` {missionId, title, cash, reputation, unlocks}; `MISSION_FAILED` {missionId, title, reason}; `CUTSCENE_STARTED` {cutsceneId, missionId}; `CUTSCENE_ENDED` {cutsceneId, missionId, skipped}; `DIALOGUE_LINE_SPOKEN` {speakerId, speakerName, text, seconds} |
| activities | `ACTIVITY_STARTED` {activityId, name}; `ACTIVITY_FINISHED` {activityId, outcome, medal, cash, score}; `COLLECTIBLE_FOUND` {collectibleId, kind, found, total}; `STUNT_JUMP_LANDED` {jumpId, distance, height, clean} |
| economy, progression | `MONEY_CHANGED` {cash, delta, reason}; `ITEM_PURCHASED` {shopId, itemId, kind, price}; `PROPERTY_PURCHASED` {propertyId, price}; `PROPERTY_INCOME_PAID` {amount, day}; `REPUTATION_CHANGED` {reputation, delta, reason}; `RANK_REACHED` {rankId, name, unlocks}; `STATISTIC_CHANGED` {statistic, value, delta}; `CONTENT_UNLOCKED` {kind, id, name} |
| camera, interface, audio, save | `CAMERA_CUT` {reason}; `CAMERA_MODE_CHANGED` {mode, previous}; `NOTIFICATION_POSTED` {text, kind, seconds}; `HELP_PROMPT_CHANGED` {action, text}; `MAP_WAYPOINT_CHANGED` {position}; `PHONE_MESSAGE_RECEIVED` {contactId, text, missionId}; `RADIO_STATION_CHANGED` {stationId, name, previousId}; `SAVE_REQUESTED` {slot, reason}; `SAVE_COMPLETED` {slot, ok, bytes, reason}; `SAVE_LOADED` {slot, version} |

A new topic is added to `gameEvents.js` by asking the engine owner in your report; until then
keep it inside your system.

**Commands** are requests to the one system that owns a thing (`core/events/gameCommands.js`).
The owner registers `context.commands.handle(GAME_COMMANDS.X, fn)` in its `init`; callers use
`send` (queued to the next step) or `run` (now, returns the handler's result).

| Owner | Commands (payload, result) |
| --- | --- |
| `menus` | `GAME_START` {slot?, newGame?}; `GAME_PAUSE`; `GAME_RESUME` |
| `saveGame` | `SAVE_WRITE` {slot?, reason?} gives {ok, bytes}; `SAVE_LOAD` {slot?} gives boolean |
| `timeAndWeather` | `TIME_SET` {hours, day?}; `TIME_SKIP` {hours}; `WEATHER_SET` {weather, seconds?} |
| `player` | `PLAYER_TELEPORT` {position, heading?}; `PLAYER_HEAL` {health?, armour?}; `PLAYER_SWITCH_CHARACTER` {characterId}; `PLAYER_ENTER_VEHICLE` {vehicleId, seat?} |
| `combat` | `PLAYER_GIVE_WEAPON` {weaponId, ammo?} |
| `vehicles` | `VEHICLE_SPAWN` {modelId, position, heading, colour?, parked?} gives vehicleId; `VEHICLE_REMOVE` {vehicleId}; `VEHICLE_REPAIR` {vehicleId} |
| `traffic`, `pedestrians` | `TRAFFIC_SET_DENSITY` {scale}; `PEDESTRIAN_SPAWN` {archetypeId, position, heading?} gives id; `PEDESTRIANS_SET_DENSITY` {scale} |
| `wantedLevel` | `CRIME_REPORT` {crimeId, offenderId, victimId?, position}; `WANTED_SET_LEVEL` {level}; `WANTED_CLEAR` {reason} |
| `policeDispatch` | `POLICE_SPAWN_UNIT` {unitKind, position, heading?} gives unitId |
| `missions`, `cutscenes`, `sideActivities` | `MISSION_START` {missionId, skipIntro?}; `MISSION_ABORT` {reason?}; `MISSION_SKIP_TO_OBJECTIVE` {index}; `CUTSCENE_PLAY` {cutsceneId, missionId?, lines?}; `CUTSCENE_SKIP`; `ACTIVITY_START` {activityId} |
| `economy`, `progression` | `ECONOMY_ADD_MONEY` {amount, reason} gives cash; `ECONOMY_SPEND_MONEY` {amount, reason} gives boolean; `PROGRESSION_ADD_REPUTATION` {amount, reason}; `PROGRESSION_RECORD` {statistic, amount?} |
| `followCamera` | `CAMERA_CUT_TO` {position, target, fieldOfView?}; `CAMERA_RELEASE`; `CAMERA_SHAKE` {strength, seconds} |
| `effects`, `audio` | `EFFECT_SPAWN` {effectId, position, direction?, scale?}; `AUDIO_PLAY` {soundId, position?, volume?}; `RADIO_TUNE` {stationId} |
| `hud`, `minimap` | `UI_NOTIFY` {text, kind?, seconds?}; `UI_SHOW_SUBTITLE` {speakerName?, text, seconds?}; `UI_SET_WAYPOINT` {position} |
| engine | `SHOWCASE_RUN` {name, seed?} |

## 6. The game state machine (`core/state/gameStates.js`)

| State | Simulates | Time scale | Input context | Mouse captured | HUD | May go to |
| --- | --- | --- | --- | --- | --- | --- |
| `booting` | no | 1 | menu | no | no | loading |
| `loading` | no | 1 | menu | no | no | startMenu, playing |
| `startMenu` | yes | 1 | menu | no | no | playing, loading |
| `playing` | yes | 1 | the player's (onFoot, inVehicle) | yes | yes | paused, cutscene, mapOpen, phoneOpen, busted, wasted, missionPassed, missionFailed, startMenu, loading |
| `paused` (overlay) | no | 1 | menu | no | no | playing, cutscene, startMenu, loading |
| `cutscene` | yes | 1 | cutscene | no | no | playing, paused, missionPassed, missionFailed, startMenu |
| `mapOpen` (overlay) | no | 1 | map | no | no | playing, paused |
| `phoneOpen` (overlay) | yes | 1 | phone | no | yes | playing, paused, cutscene, busted, wasted, missionPassed, missionFailed |
| `busted` | yes | 0.35 | cutscene | no | no | playing, loading, startMenu |
| `wasted` | yes | 0.25 | cutscene | no | no | playing, loading, startMenu |
| `missionPassed` | yes | 0.6 | cutscene | no | yes | playing, cutscene, paused |
| `missionFailed` | yes | 0.35 | cutscene | no | no | playing, cutscene, loading, startMenu |

`context.state.enter(name, payload)` refuses a transition the table does not allow (it returns
false and logs); an overlay returns with `state.back()`. Every transition emits
`GAME_STATE_CHANGED` and the engine applies the row: input context, pointer capture, time scale,
`<body data-game-state>` and `data-hud` (`core/state/gameStateEffects.js`). Who enters what:
`menus` (startMenu, playing, paused), `player` (busted, wasted and back), `missions`
(missionPassed, missionFailed), `cutscenes` (cutscene), `minimap` (mapOpen), `phone` (phoneOpen).

## 7. The entity registry (`core/entities/entityRegistry.js`)

Every dynamic thing is one plain object: `{ id, kind, owner, position, heading, radius, tags, alive, data }`.
`kind` is one of `ENTITY_KINDS` (character, vehicle, pickup, prop, projectile, marker); `tags` are
`ENTITY_TAGS` (player, pedestrian, police, gang, traffic, parked, emergency, watercraft, aircraft,
armed, hostile, witness, dead, mission, persistent) or a system's own. The owner creates it with
`entities.add({ kind, owner, position, radius, tags, data })`, moves it by changing
`entity.position` in place (pass your own `THREE.Vector3`; the grid is re-filed once per fixed
step) and removes it with `entities.remove(entity)`. `data` is the owner's own object; other
systems read it only through the fields section 13 lists for that system.

Queries (x and z in metres, on a 32 m uniform grid): `nearest(x, z, maxRadius, filter)`,
`within(x, z, radius, filter, out)`, `forEachWithin(x, z, radius, visit, filter)`,
`countWithin(...)`, `ofKind(kind)`, `withTag(tag)`, `firstWithTag(tag)`, `get(id)`,
`countByKind()`, `removeOwnedBy(owner)`. A filter is `{ kind, tag, withoutTag, exclude, accept }`.
The player is `entities.firstWithTag('player')`: the character on foot, or the vehicle being driven.

## 8. Input (`core/input/`)

Systems ask for actions, never for keys. Contexts: `onFoot`, `inVehicle`, `menu`, `map`, `phone`,
`cutscene`, plus `always` (live everywhere). The game state forces the context; in `playing` it
is the player's own, set with `context.controls.setPlayContext('inVehicle')`.

| Context | Actions (default keys) |
| --- | --- |
| always | `pause` (Esc, P), `togglePerformanceOverlay` (F3) |
| onFoot | `moveForward/Backward/Left/Right` (WASD, arrows), `sprint` (Shift), `jump` (Space), `crouch` (C), `enterVehicle` (F, Enter), `interact` (E), `attack` (left mouse), `aim` (right mouse), `reload` (R), `nextWeapon` / `previousWeapon` (wheel, X / Z), `holsterWeapon` (Q), `changeCamera` (V), `openMap` (M), `openPhone` (T) |
| inVehicle | `accelerate`, `brake`, `steerLeft`, `steerRight` (WASD, arrows), `handbrake` (Space), `exitVehicle` (F, Enter), `horn` (H), `headlights` (L), `nextRadioStation` / `previousRadioStation` (E / Q, wheel), `driveByFire` (left mouse), `lookBehind` (C), `changeCamera` (V), `openMap` (M), `openPhone` (T) |
| menu | `menuUp/Down/Left/Right`, `menuAccept` (Enter, Space), `menuBack` (Backspace) |
| map | `mapPanUp/Down/Left/Right`, `mapZoomIn/Out`, `mapSetWaypoint`, `closeMap` (M) |
| phone | `phoneUp`, `phoneDown`, `phoneAccept`, `phoneBack`, `closePhone` (T) |
| cutscene | `skipCutscene` (Enter, Space) |

Axes: `moveX`, `moveZ`, `steer`, `throttle`, `mapPanX`, `mapPanY` (-1..1). Mouse: `input.lookX`,
`input.lookY` (pixels this frame), `input.wheel`. In `fixedUpdate`, `pressed` and `released` are
true for exactly one step; in `update` for one frame. Prompts: `context.controls.promptFor('enterVehicle')`
gives 'F'. Defaults live in `core/input/controlBindings.js`; the `playerControls` catalog
(export `PLAYER_CONTROLS`: context, action, `{ codes, label }`) overrides them, and the player's
rebindings (`context.controls.rebind(context, action, codes)`, stored in settings) override both.

## 9. Quality tiers (`core/quality/qualityTiers.js`)

One table, read as `context.quality.tier.<field>`; react to `QUALITY_CHANGED`; no private switches.

| Field | low | medium | high | ultra | cinematic |
| --- | --- | --- | --- | --- | --- |
| atmosphere level | low | medium | high | ultra | ultra |
| pixelRatioCap / minRenderScale | 1 / 0.6 | 1 / 0.7 | 1.5 / 0.75 | 2 / 0.85 | 2 / 1 |
| drawDistance / streamRadius (m) | 450 / 320 | 700 / 420 | 1000 / 520 | 1400 / 640 | 2200 / 900 |
| lodBias | 0.6 | 0.8 | 1 | 1.35 | 2.2 |
| propDensity / vegetationDensity | 0.45 / 0.4 | 0.7 / 0.7 | 1 / 1 | 1 / 1 | 1 / 1 |
| textureDetail / anisotropy | 0.5 / 2 | 0.75 / 4 | 1 / 8 | 1 / 16 | 1 / 16 |
| maxVehicles / trafficDensity | 28 / 0.55 | 44 / 0.8 | 60 / 1 | 72 / 1.15 | 80 / 1.3 |
| maxPedestrians / pedestrianDensity | 40 / 0.5 | 80 / 0.75 | 120 / 1 | 160 / 1.2 | 200 / 1.4 |
| maxParticles / maxDecals | 400 / 48 | 900 / 96 | 1600 / 160 | 2400 / 240 | 3200 / 320 |
| cityLightRange (m) / audioVoices | 90 / 16 | 140 / 24 | 180 / 32 | 240 / 40 | 320 / 40 |

`cinematic` is for screenshots (`?quality=cinematic`), not for play. Settings
(`core/quality/gameSettings.js`, persisted, versioned): `graphics.{quality, detectedQuality, dynamicResolution, fieldOfView, motionBlur, cameraShake}`,
`audio.{master, effects, music, voices, muted}`, `controls.{mouseSensitivity, invertLookY, bindings}`,
`gameplay.{subtitles, hints, minimapRotates, speedUnit, autosave}`.

## 10. The debug object and showcase scenes (`core/automation/`)

`window.MARAZUL` (never needed for normal play):

| Function | What it does |
| --- | --- |
| `whenReady()` | resolves with the summary when the boot has drawn its frame |
| `whenIdle(timeoutMs)` | waits for models, streaming and jobs |
| `advance(seconds)` | fixed steps without drawing; gives `{steps, stepCount, simulationTime}` |
| `render()` | settles the image, draws one frame, resolves when it is shown |
| `setTime(hours, day)`, `setWeather(name, seconds)`, `setQuality(tier)` | cuts, not fades |
| `teleport({x, y?, z}, heading)` | `PLAYER_TELEPORT` |
| `press(action, down)` | holds or releases an action as if its key were pressed |
| `enterState(name)`, `command(name, payload)` | state machine and command queue |
| `listShots()`, `runShot(name, {seed})` | showcase scenes |
| `hold()`, `resume()` | the frame loop |
| `summary()` | state, seed, quality, clock, weather, player, entity counts, systems, faults, pending work, missing catalogs |
| `log(level)`, `context`, `ready` | log history, the game context, the ready flag |

A **showcase scene** is a file under `game/src/showcase/` that the `showcase` system registers:
`context.showcase.register({ name, title, description, async run(context, tools) { ... } })`.
`run` enters the state it wants, sets the game up through commands and systems (time, weather,
teleport, spawn, wanted level, mission objective), and plays the real rules forward with
`tools.advance(seconds)`; `tools.seed`, `tools.random` and `tools.whenIdle()` are there too. The
engine then waits for idle work, settles the atmosphere and draws. `?shot=<name>&seed=<n>` runs a
scene at boot; `shots.json` at the repository root names the scenes of the final screenshots
(`start`, `play`, `end` today, registered by the temporary demonstration). A scene never fakes a
picture: no object that the game itself would not create.

## 11. Conventions of the engine, budgets, wrapping libraries, saving

**Coordinates and names.** As in `docs/CONVENTIONS.md`: metres, +Y up, -Z north, +X east, radians,
heading 0 faces north and grows to the left. Ground queries go through `openWorldCity`
(`groundHeightAt(x, z)`), never a private ray. System names are camelCase and fixed by the
manifest; entity owners are system names; ids from catalogs are used unchanged. Scene objects go
into `context.view.layers`: `world` static, `dynamic` movers, `effects`, `sky` far backdrop. Never
set `scene.fog`, `scene.environment`, tone mapping, or add a shadow-casting directional light.

**Budgets** for 60 fps on a mid-range desktop GPU at 1080p, tier high (16.7 ms per frame):

| System | CPU ms per frame | Draw calls | Triangles | Active entities |
| --- | --- | --- | --- | --- |
| worldRenderPipeline (three.js submit, atmosphere passes) | 4.5 | 30 own | 60 k own | |
| openWorldCity (visible sectors; plus the 3 ms job slice while streaming) | 0.5 | 550 | 1.5 M | 60 loose props, 40 pickups |
| physics | 2.0 | | | |
| vehicles | 1.0 | 280 | 450 k | 60 |
| traffic | 0.8 | | | 40 of the 60 vehicles |
| pedestrians, factions | 1.2 | 150 | 300 k | 120 |
| policeDispatch, wantedLevel | 0.4 | | | up to 12 units |
| combat | 0.3 | | | 20 projectiles |
| effects | 0.5 | 40 | 50 k | 1600 particles, 160 decals |
| player, followCamera | 0.3 | 12 | 40 k | 1 |
| missions, cutscenes, sideActivities, economy, progression | 0.3 | | | 40 markers |
| hud, minimap, phone, menus (DOM and one 2D canvas) | 0.6 | | | |
| audio | 0.3 | | | 32 voices |
| headroom | 1.0 | | | |

Totals: about 1100 draw calls and 2.4 M triangles in the main pass; shadow cascades redraw
casters, so keep shadow casters under 600 draws (small props do not cast). Use
`asset.createBatch()` for anything placed more than a dozen times and `createLOD()` or fixed
levels by distance for the rest. No allocation per frame in `fixedUpdate`, `update`, `lateUpdate`.
F3 shows each system's CPU time; a system over twice its budget is a bug.

**Wrapping libraries.**
- *Atmosphere*: only `worldRenderPipeline` creates and renders it. Others use `context.atmosphere`
  after depending on it: `addLight`/`removeLight` (street lamps, headlamps), `addWater`,
  `captureWaterDepth`, `getWaveHeight` (boats), `state` (nightFactor, wind, wetness), and
  `applyWetSurface(material)` from `render/weather/wetSurface.js`. Weather and time change only
  through `WEATHER_SET` and `TIME_SET`. After a camera cut emit `CAMERA_CUT`.
- *City plan*: only `openWorldCity` builds the plan (from `context.seed` and the `cityDistricts`
  catalog) and exposes it: `plan`, `groundHeightAt`, `districtAt`, `nearestRoad`, the lane graph
  and the pedestrian graph. Traffic, pedestrians, police, missions and the map read these.
- *Physics*: only the `physics` system owns the collision world and steps it (after every
  system that sets intents, before the rules that react). Others call its members to add and
  remove static colliders (the city, per sector), bodies (vehicles, props) and character
  controllers, and to cast rays and sweeps. It turns the library's event queue into
  `VEHICLE_COLLIDED`, `PROP_BROKEN`, `EXPLOSION_DETONATED`.
- *Assets*: `context.assets` has every model loaded before any `init`. Instantiate, batch, read
  anchors and collider proxies through `game/src/assets/index.js`; never load a file yourself.
- *Characters*: `player`, `pedestrians`, `policeDispatch` and `cutscenes` pose their people
  through the character run-time (`game/src/characters/`), one skinned instance per visible person.
- *Textures*: generated textures are made in jobs (`context.jobs`) at `quality.tier.textureDetail`.

**Save data** (`saveGame` collects `serialise()` of each system that has one, in manifest order,
under the system's name; `storage.write('save.slot1', data, { version })`; migrations per version):

    { version, savedAt, seed, playSeconds,
      clock: { ... },                     // context.clock.serialise()
      timeAndWeather: { weather },
      player: { characterId, position, heading, health, armour, vehicle: { modelId, colour, damage } | null },
      combat: { weapons: [{ weaponId, magazine, reserve }], equippedWeaponId },
      vehicles: { garages: [{ propertyId, modelId, colour, damage }] },
      factions: { attitudes: { factionId: number } },
      missions: { completed: [missionId], available: [missionId], attempts: { missionId: number } },
      sideActivities: { medals: { activityId: medal }, collectiblesFound: [id], stuntJumps: [id] },
      economy: { cash, ownedPropertyIds, purchasedItemIds, lastIncomeDay },
      progression: { reputation, rankId, statistics: { name: number }, unlocked: [id] },
      phone: { messages: [{ contactId, text, read }] },
      audio: { stationId } }

The wanted level, traffic, pedestrians and loose props are not saved: a loaded game starts clean
at a safehouse. Settings are stored apart from saves.

## 12. The system manifest (`core/systems/gameSystemManifest.js`), in update order

| # | Name | Entry module | Factory | Runs | Depends on (init) |
| --- | --- | --- | --- | --- | --- |
| 1 | `worldRenderPipeline` | `render/worldRenderPipeline.js` | `createWorldRenderPipelineSystem` | always | |
| 2 | `timeAndWeather` | `world/timeAndWeather.js` | `createTimeAndWeatherSystem` | simulating | worldRenderPipeline |
| 3 | `openWorldCity` | `world/openWorldCity.js` | `createOpenWorldCitySystem` | simulating | worldRenderPipeline, physics |
| 4 | `player` | `player/playerCharacter.js` | `createPlayerCharacterSystem` | simulating | openWorldCity, vehicles, physics |
| 5 | `traffic` | `traffic/trafficFlow.js` | `createTrafficFlowSystem` | simulating | openWorldCity, vehicles |
| 6 | `pedestrians` | `pedestrians/pedestrianCrowd.js` | `createPedestrianCrowdSystem` | simulating | openWorldCity, physics |
| 7 | `factions` | `pedestrians/gangTerritories.js` | `createGangTerritoriesSystem` | simulating | pedestrians |
| 8 | `policeDispatch` | `police/policeDispatch.js` | `createPoliceDispatchSystem` | simulating | wantedLevel, vehicles, pedestrians |
| 9 | `combat` | `combat/weaponsAndCombat.js` | `createWeaponsAndCombatSystem` | simulating | physics |
| 10 | `vehicles` | `vehicles/vehicleFleet.js` | `createVehicleFleetSystem` | simulating | openWorldCity, physics |
| 11 | `physics` | `world/physicsSimulation.js` | `createPhysicsSimulationSystem` | simulating | |
| 12 | `wantedLevel` | `police/wantedLevel.js` | `createWantedLevelSystem` | simulating | |
| 13 | `effects` | `effects/worldEffects.js` | `createWorldEffectsSystem` | simulating | worldRenderPipeline |
| 14 | `missions` | `missions/missionDirector.js` | `createMissionDirectorSystem` | simulating | player, vehicles, pedestrians, economy |
| 15 | `cutscenes` | `missions/cutscenePlayer.js` | `createCutscenePlayerSystem` | simulating | followCamera |
| 16 | `sideActivities` | `activities/sideActivities.js` | `createSideActivitiesSystem` | simulating | missions |
| 17 | `economy` | `economy/moneyShopsAndProperties.js` | `createMoneyShopsAndPropertiesSystem` | simulating | |
| 18 | `progression` | `economy/playerProgression.js` | `createPlayerProgressionSystem` | simulating | economy |
| 19 | `followCamera` | `player/followCamera.js` | `createFollowCameraSystem` | simulating | player |
| 20 | `hud` | `ui/headUpDisplay.js` | `createHeadUpDisplaySystem` | always | |
| 21 | `minimap` | `ui/minimapAndCityMap.js` | `createMinimapAndCityMapSystem` | always | openWorldCity |
| 22 | `phone` | `ui/phone.js` | `createPhoneSystem` | always | |
| 23 | `menus` | `ui/menus.js` | `createMenusSystem` | always | |
| 24 | `audio` | `audio/soundAndRadio.js` | `createSoundAndRadioSystem` | always | |
| 25 | `saveGame` | `save/saveGame.js` | `createSaveGameSystem` | always | |
| 26 | `showcase` | `showcase/showcaseDirector.js` | `createShowcaseDirectorSystem` | always | |
| 27 | `engineDemonstration` | `core/dev/engineDemonstration.js` | `createEngineDemonstrationSystem` | simulating | temporary |

Order within a step: the world and its clock; whoever decides (player input, traffic and
pedestrian and police AI, combat) writes intents and controls; `vehicles` applies controls to the
vehicle dynamics; `physics` steps everything; the rules that react (`wantedLevel`, `effects`,
`missions`, ...) read the results; the camera follows in `lateUpdate`; the interface draws.
The owner of a stub replaces the body of the factory (same name, same file, same factory name)
and may change `dependsOn`, `runsWhen` and `loadWeight`. Done today: 1, 2 (minimal), 23 (minimal).

## 13. Work breakdown for the second wave

For each system: its files beside the entry module (suggested), what it consumes and publishes,
and how to check it. Every system also: registers the commands section 5 gives it, exposes
`serialise`/`restore` if section 11 lists it, keeps to its budget, has Node tests for its pure
logic under `tools/tests/<domain>/`, and passes `node tools/smoke-game.mjs` with no console error.

**openWorldCity** (`world/openWorldCity.js`). Files: `world/citySectors.js` (sector streamer glue),
`world/terrainMesh.js`, `world/streets/*` (road and pavement meshes, markings, junctions),
`world/buildings/*` (kit assembly per lot), `world/props/*`, `world/vegetation/*`,
`world/cityQueries.js`. Consumes: the plan library, `cityDistricts`, `brandsAndSignage`, assets,
`render/textures`, `context.focus`, `quality.tier.{streamRadius, drawDistance, propDensity}`,
`context.jobs`, `physics` (static colliders per sector), atmosphere (lamps, wet surfaces, water
depth). Publishes: `CITY_SECTOR_*`, `DISTRICT_ENTERED`, `STREET_CHANGED`, `LANDMARK_REACHED`;
members `plan`, `groundHeightAt`, `districtAt`, `nearestRoad`, `laneGraph`, `pedestrianGraph`,
`spawnPointsNear`. Checks: the whole island is walkable and drivable with no hole; streaming
in and out leaves no hitch over 4 ms and no leak (geometries and textures return to the start
count); `whenIdle` resolves after a teleport; the same seed builds the same city.

**physics** (`world/physicsSimulation.js`). Files: `world/physicsEvents.js`. Consumes: the physics
library. Publishes: `VEHICLE_COLLIDED`, `PROP_BROKEN`, `EXPLOSION_DETONATED`; members
`addStaticColliders`, `removeStaticColliders`, `addBody`, `removeBody`, `createCharacterController`,
`raycast`, `sweepSphere`, `explode`. Checks: 60 vehicles and 120 characters step in under 2 ms;
deterministic for a seed (two `advance` runs give the same positions).

**player** (`player/playerCharacter.js`). Files: `player/onFootMovement.js`, `player/vehicleEntry.js`,
`player/healthAndRespawn.js`, `player/playerAnimation.js`. Consumes: input, `physics` character
controller, `vehicles` (enter, drive, exit), characters run-time, `storyCharacters`. Publishes:
`PLAYER_*`, enters `busted` and `wasted`; owns the entity tagged `player`; calls
`controls.setPlayContext`. Checks: walk, sprint, jump, enter and leave a car with F, drive,
die and respawn at a hospital; `PLAYER_TELEPORT` works. Deletes `core/dev/engineDemonstration.js`
together with the camera owner (and its manifest line, by asking the engine owner).

**followCamera** (`player/followCamera.js`). Files: `player/onFootCamera.js`, `player/vehicleChaseCamera.js`,
`player/cameraCollision.js`. Consumes: the player entity, mouse look, `physics` sweeps, settings
(field of view, shake, sensitivity). Publishes: `CAMERA_CUT`, `CAMERA_MODE_CHANGED`; writes
`context.focus` and `view.camera` in `lateUpdate`. Checks: no clipping through walls, smooth at
any frame rate, look-behind, cut on teleport.

**vehicles** (`vehicles/vehicleFleet.js`). Files: `vehicles/vehicleSpawning.js`, `vehicles/vehicleControls.js`,
`vehicles/vehicleDamage.js`, `vehicles/vehicleLightsAndDoors.js`, `vehicles/vehicleLevelOfDetail.js`.
Consumes: `vehicleCatalog`, assets (kind vehicle), `physics` vehicle dynamics, atmosphere lights.
Publishes: `VEHICLE_*`; members `spawn`, `remove`, `controlsOf(vehicleId)` (throttle, brake, steer,
handbrake written by player, traffic and police), `seatsOf`, `nearestEnterable`. Entity `data`:
`modelId`, `health`, `speed`, `driverId`, `controls`. Checks: every catalog model spawns, drives
and can be destroyed; 60 at once within budget.

**traffic** (`traffic/trafficFlow.js`). Files: `traffic/laneFollowing.js`, `traffic/junctionRules.js`,
`traffic/trafficSpawning.js`, `traffic/driverReactions.js`. Consumes: `openWorldCity.laneGraph`,
`vehicles`, `pedestrianArchetypes` (driver archetypes), clock, `quality.tier.{maxVehicles, trafficDensity}`.
Publishes: `TRAFFIC_BLOCKED`; tags `traffic`. Checks: cars keep their lane, stop at junctions,
do not pile up over 10 minutes of `advance`, yield to sirens, flee gunfire.

**pedestrians** (`pedestrians/pedestrianCrowd.js`). Files: `pedestrians/crowdSpawning.js`,
`pedestrians/walkingRoutes.js`, `pedestrians/pedestrianReactions.js`, `pedestrians/pedestrianActivities.js`.
Consumes: `openWorldCity.pedestrianGraph`, `pedestrianArchetypes`, characters run-time, `physics`.
Publishes: `PEDESTRIANS_PANICKED`, `PEDESTRIAN_KNOCKED_DOWN`, `CRIME_WITNESSED`; tags `pedestrian`,
`witness`. Checks: crowds differ by district and hour; they dodge cars, flee shots, some fight.

**factions** (`pedestrians/gangTerritories.js`). Consumes: `gangsAndFactions`, `cityDistricts`,
`pedestrians`. Publishes: `FACTION_ATTITUDE_CHANGED`; tags `gang`, `hostile`. Checks: gang members
stand on their turf and turn hostile when attacked.

**wantedLevel** (`police/wantedLevel.js`). Files: `police/crimeHeat.js`, `police/witnessRules.js`.
Consumes: `wantedLevels`, `crimeCatalog`; events `CRIME_COMMITTED`, `DAMAGE_DEALT`,
`VEHICLE_STOLEN`, `CHARACTER_KILLED`, `POLICE_SPOTTED_PLAYER`, `VEHICLE_RESPRAYED`. Publishes:
`CRIME_WITNESSED`, `WANTED_LEVEL_CHANGED`, `WANTED_SEARCH_STARTED`, `WANTED_CLEARED`; member
`level`. Pure rules, fully tested in Node. Checks: stars rise with crimes seen, decay unseen,
clear by the listed ways.

**policeDispatch** (`police/policeDispatch.js`). Files: `police/pursuitDriving.js`, `police/officerBehaviour.js`,
`police/roadblocks.js`, `police/policeHelicopter.js`. Consumes: `wantedLevel`, `vehicles`, characters,
lane graph. Publishes: `POLICE_UNIT_DISPATCHED`, `POLICE_SPOTTED_PLAYER`, `PLAYER_BUSTED` (through
the player). Checks: one star brings officers, three bring pursuit cars and roadblocks, five the
helicopter; an arrest happens when the player is stopped and cornered.

**combat** (`combat/weaponsAndCombat.js`). Files: `combat/weaponInventory.js`, `combat/aimingAndRecoil.js`,
`combat/hitDetection.js`, `combat/damageRules.js`. Consumes: `weaponCatalog`, input, `physics` rays.
Publishes: `WEAPON_*`, `AMMO_CHANGED`, `DAMAGE_DEALT`, `CHARACTER_KILLED`, `EXPLOSION_DETONATED`,
`CRIME_COMMITTED`. Checks: every weapon fires, hits and reloads; vehicles take damage and burn.

**effects** (`effects/worldEffects.js`). Files: `effects/particlePool.js`, `effects/decalPool.js`,
`effects/effectCatalogue.js`. Consumes: events of combat, vehicles and weather; `quality.tier.{maxParticles, maxDecals}`.
Checks: pooled, no allocation per frame, within 40 draws.

**missions** (`missions/missionDirector.js`). Files: `missions/missionScripting.js`, `missions/objectiveKinds.js`,
`missions/missionMarkers.js`. Consumes: `storyMissions`, `storyCharacters`, most commands.
Publishes: `MISSION_*`; enters `missionPassed` and `missionFailed`. Checks: each catalog mission
can be started, passed and failed through `MARAZUL.command`, and replayed.

**cutscenes** (`missions/cutscenePlayer.js`). Consumes: `followCamera` cuts, characters, `storyMissions`
dialogue. Publishes: `CUTSCENE_*`, `DIALOGUE_LINE_SPOKEN`; enters `cutscene`. Checks: skippable, letterbox shown.

**sideActivities** (`activities/sideActivities.js`). Files: one per activity kind. Consumes:
`sideActivities` catalog. Publishes: `ACTIVITY_*`, `COLLECTIBLE_FOUND`, `STUNT_JUMP_LANDED`.

**economy** and **progression** (`economy/*.js`). Files: `economy/shopCounter.js`, `economy/propertyIncome.js`.
Consume: `shopsAndProperties`, `progressionRanks`. Publish: `MONEY_CHANGED`, `ITEM_PURCHASED`,
`PROPERTY_*`, `REPUTATION_CHANGED`, `RANK_REACHED`, `STATISTIC_CHANGED`, `CONTENT_UNLOCKED`.
Pure rules, fully tested in Node.

**hud** (`ui/headUpDisplay.js`), **minimap** (`ui/minimapAndCityMap.js`), **phone** (`ui/phone.js`),
**menus** (`ui/menus.js`). Files: one per widget (`ui/wantedStars.js`, `ui/weaponWheel.js`,
`ui/subtitles.js`, `ui/minimapPainter.js`, `ui/settingsMenu.js`, `ui/controlsMenu.js`). They only
listen to events and read `context` state; they fill the containers of section 1 and never touch
the 3D scene. Checks: readable at 768x480 and at 1920x1080; the start menu leads into play with
one click and shows the controls; every setting persists; rebinding works.

**audio** (`audio/soundAndRadio.js`). Files: `audio/engineSound.js`, `audio/weaponSounds.js`,
`audio/cityAmbience.js`, `audio/radioStations.js`, `audio/synthesisVoices.js`. Consumes: events,
`radioStations`, `context.focus`, atmosphere state (rain, wind), settings. All WebAudio synthesis;
the audio context starts on the first click. Publishes: `RADIO_STATION_CHANGED`.

**saveGame** (`save/saveGame.js`). Consumes: `storage`, each system's `serialise`/`restore`.
Publishes: `SAVE_*`. Checks: save, reload the page, load: the same cash, missions, position.

**showcase** (`showcase/showcaseDirector.js`). Files: one scene per file (`showcase/goldenHourSkyline.js`,
`showcase/policeChase.js`, ...). Checks: every scene of `shots.json` renders with no console
error through `node tools/capture.mjs --page "index.html?shot=<name>&seed=1"`.

## 14. Commands for everyone

    node --test "tools/tests/core/*.test.mjs"
    node tools/smoke-game.mjs --out /tmp/marazul/<area>/smoke.jpg
    node tools/capture.mjs --size 960x540 --page "index.html?shot=engine-demo" --out /tmp/marazul/<area>/demo.jpg
    node tools/capture.mjs --size 960x540 --eval "MARAZUL.whenReady().then(() => MARAZUL.summary())" --out /tmp/marazul/<area>/summary.jpg
