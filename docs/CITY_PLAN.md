# The city plan of Marazul

`game/src/world/plan/` turns a seeded generator into the whole city as plain data, with queries.
Nothing in it imports three.js, so it runs in Node and in the browser alike.

    import { createSeededRandom } from '../../core/random/seededRandom.js';
    import { generateCityPlan } from '../world/plan/cityPlanGenerator.js';
    const plan = generateCityPlan(createSeededRandom('marazul'), { landmarks, streetNames });   // options are optional

The default seed gives about 76 km of road, 560 segments, 305 intersections (67 with signals),
1410 lanes, 2540 lots and all 87 landmarks of `game/src/catalog/cityDistricts.js`, in about 0.45 s
(0.65 s the first time). The same seed always gives the same plan (`plan.digest`).

## Coordinates

World: metres, +X east, -Z north, sea level y = 0. The street grid is turned six degrees, so the
plan is drawn in **city coordinates** (e east, n north) and converted by `cityToWorld(e, n)` and
`worldToCity(x, z)` in `cityFrame.js`. The long east-west streets head 276 degrees when driven
westwards. `CITY_FRAME.extent` is the world rectangle of the height field (x -2048..2048,
z -1856..2240).

## What the plan holds

| Field | What it is |
| --- | --- |
| `plan.terrain` | Height field, 4 m grid: `heights`, `columns`, `rows`, `minX`, `minZ`, `heightAt`, `normalAt`, `shoreDistanceAt`, `isWaterAt`, `shoreKindAt`, `naturalSandAt` |
| `plan.coast` | `landRings` (mainland, island; each vertex has a shore kind), `carves` (river, channels, ponds: centre line, half widths, outline), `waterBodies` |
| `plan.districts`, `plan.districtById` | Nine polygons: `id`, `pattern`, `ring` (world), `x`, `z` (label point) |
| `plan.roads.nodes` | Intersections: `id`, `x`, `y`, `z`, `segments`, `arms` (sorted by angle: `segment`, `atStart`, `dx`, `dz`, `trim`, `phase`, `mustStop`), `control` (`signals`, `stop`, `none`, `cul_de_sac`, `exit`), `signal` (`phases` of arm indices with `green` and `yellow`, `allRed`, `cycle`, `offset`), `crosswalks`, `radius` |
| `plan.roads.segments` | Road pieces between two nodes: `id`, `a`, `b`, `points` (flat x, z; at most 10 m apart), `along`, `heights`, `length`, `key`, `name`, `district`, `bridge`, `trimA`, `trimB`, and the cross-section of `roadSpecifications.js`: `roadClass`, `lanesForward`, `lanesBackward`, `oneWay`, `laneWidth`, `medianWidth`, `parkingLeft/Right`, `sidewalkLeft/Right`, `width`, `halfWidth`, `corridorLeft/Right`, `speedLimit`, `streetscape` |
| `plan.lanes` | Directed traffic lanes (about 1430): `id`, `segment`, `direction` (1 along the segment, -1 against), `index` (0 innermost), `lanesInGroup`, `points` (centre line in the direction of travel, between the junction areas), `length`, `speedLimit`, `fromNode`, `toNode`, `leftLane`, `rightLane` (lane changes, -1 for none), `control`, `signalNode`, `phase`, `mustStop`, `successors` (`{lane, turn}` with turn `straight`, `left`, `right` or `uturn`; cul-de-sacs and map exits turn back) |
| `plan.lots` | Oriented rectangles: `id`, `ring` (counter-clockwise: front right, front left, back left, back right), `x`, `y` (ground), `z`, `frontX`, `frontZ`, `heading`, `width`, `depth`, `area`, `frontages` (`segment`, edge `ax, az, bx, bz`), `entrance`, `district`, `zone`, `zoning`, `floorsMin`, `floorsMax`, `style`, `corner`, `landmarkId`, `landmarkKind` |
| `plan.landmarks`, `plan.landmarkById` | `id`, `kind`, `name`, `district`, `lot`, `x`, `y`, `z`, `entrance`, `frontX`, `frontZ`, `facing` |
| `plan.cover` | 2 m raster of what is on the ground: 0 open, 1 paved road corridor, 2 dirt road, 3 + lot id |
| `plan.sectors` | 128 m grid; each cell lists `segments`, `nodes`, `lots` |
| `plan.stats`, `plan.diagnostics` | Totals for reports; problems found while building (empty on a good plan) |

`laneOffset(spec, direction, laneIndex)` and `walkwayOffset(spec, side)` in `roadSpecifications.js`
give lane centre lines and sidewalk lines from a segment. Traffic keeps to the right.

## Queries

| Call | Returns |
| --- | --- |
| `plan.heightAt(x, z)` | Ground height anywhere on the plane; falls away to the sea floor (-32) outside the city |
| `plan.normalAt(x, z, out?)` | Unit surface normal `[x, y, z]` |
| `plan.shoreDistanceAt(x, z)` | Metres to the coast: positive on land, negative in the water, valid far outside |
| `plan.isWaterAt(x, z)` | Whether the ground is below sea level |
| `plan.districtAt(x, z)` | District id (always answers) |
| `plan.surfaceAt(x, z)` | `paved`, `dirt`, `water`, `sand` or `grass` |
| `plan.lotAt(x, z)` | The lot at the point, or null |
| `plan.nearestRoad(x, z, maxDistance = 96)` | `{segment, along, distance, x, z}` or null |
| `plan.nearestLane(x, z, maxDistance = 96)` | `{lane, along, distance, x, z}` (the projection on the lane's centre line) or null |
| `plan.streetNameAt(x, z)` | Name of the nearest road |
| `plan.sectorAt(x, z)` | The 128 m sector, or null outside the extent |

## The map painter

`paintCityPlan(context, plan, {centerX, centerZ, scale, width, height}, style)` in
`cityPlanPainter.js` draws the plan to a 2D canvas, north up. `style` switches `lots`, `labels`,
`landmarks`, `landmarkLabels` and `zones`, and can override `CITY_MAP_PALETTE`. Preview:

    node tools/capture.mjs --root . --size 1100x1000 --page "tools/preview/city-plan.html?zones=1" --out /tmp/marazul/cityplan/plan.jpg

## Staging streets (`plan.stagingStreets`)

Both are dead straight and head 276 degrees westwards, so the golden-hour sun (azimuth 286.7)
stands just right of the vanishing point.

| Street | District | East end (x, z) | West end (x, z) | Length | Notes |
| --- | --- | --- | --- | --- | --- |
| Bulevar Dorado | playa_dorada | 989, 969 | -776, 783 | 1775 m | The beachfront drive with the palm median; the sand and the sea are on the south (left looking west), hotels on the north. Ground about 3.5 m |
| Gran Vía Marazul | centro | 1632, 353 | -705, 107 | 2350 m | The palm-lined grand avenue; the towers stand between city e -250 and 760, about x -240..770. Ground about 3 m |

## Skyline vantage points (`plan.vantagePoints`)

| Id | World x, z | Looks at | View |
| --- | --- | --- | --- |
| `mirador_de_la_loma` | 1153, -447 (ground 45 m) | 217, 324 | From the summit lookout of Las Lomas over Centro to the beach |
| `calzada_coral` | 1495, 1464 (bridge deck 6 m) | 346, 539 | From the island causeway across the water to the hotel front and the towers |
| `muelle_dorado` | 79, 1165 (over the sea) | 238, 226 | The beach, the hotels and the skyline head-on from offshore |
| `puente_rio_tamarindo` | -1125, -867 (bridge deck 6 m) | 89, 110 | From the highway bridge over factories to downtown |

## Ground, graphs and special areas

- **Ground.** `limitRoadGradients` keeps every road at ten percent or less, and `conformTerrain`
  (both in `terrainConforming.js`) presses the height field to the roads and the lot pads: under a
  road corridor `plan.heightAt` is the road (`segment.heights`, within 0.1 m on the centre line),
  under a lot it is the pad `lot.y`, which is the street's height at the lot's entrance. Parks keep
  their natural ground. Within 4 m of a lot's edge the ground ramps to its neighbours (the grid is
  4 m), so terraced hill lots need a plinth or a retaining wall there. Water is never raised.
- **Lane connectors.** Every `lane.successors[i]` has `points` and `length`: the curve through the
  junction from the lane's last point to the next lane's first.
- **`plan.parkingSpots`.** `id`, `kind` (`kerb` in a parking lane, `bay` in a car park), `x`, `y`,
  `z`, `heading` (compass: 0 north, a quarter turn east), `dirX`, `dirZ`, `segment`, `side`,
  `along`, `length`, `width`, and `lot` for bays. `plan.sectors.cells[i].parking` lists their ids.
- **`plan.pedestrianGraph`.** `nodes` (`id`, `x`, `y`, `z`, `roadNode`, `edges`) are the pavement
  corners of the junctions; `edges` (`id`, `a`, `b`, `kind`, `points`, `length`, `segment`, `side`,
  `width`, `paved`, `roadNode`, `arm`, `signalNode`, `conflictPhase`) are `sidewalk`, `crosswalk`
  or `path` (the promenade and the pier, `place` says which). A walker may cross while the signal
  of `signalNode` is in any phase other than `conflictPhase`.
- **`plan.boatLanes`.** `kind` (`coastal`, `island`, `river`), `points`, `length`, `closed`,
  `width`, `speedLimit`; about 110 m off shore. Boats sail both ways, keeping right of the line.
- **`plan.specialAreas`.** `id`, `kind`, `ring`, `x`, `z`, `y`, `district`, `landmarkId`,
  `surface`, and by kind: `promenade` (`line`, `width`; the sea side of Bulevar Dorado), `pier`
  (`line`, `head`, `deckHeight`; at the foot of Avenida de los Fundadores, city e 200), `quay`
  (`edge`, `craneRails`), `marina` (`edge`, `fingers`, `berths` for moored boats), `runway`
  (`line`, `heading` 276 degrees, 450 m in Los Pantanos), `plaza`, `park` (`lot`) and
  `parking_lot` (`lot`, `firstBay`, `bays`; the lot has zone `parking` and no storeys).
- Centro has three superblocks where a street stops and starts again (see `layOutCentroGrid`).

The preview takes `walk=1`, `lanes=1` and `parking=1` to draw these graphs over the map.

## Not there yet

Second frontages of corner lots; rail tracks and container yards; docks at the yacht clubs; the
pier landmark's lot (`muelle_dorado`) still lies west of the pier itself; authored sites that let
the stadium, the mall and the terminals grow beyond block size; a diagonal avenue through Centro.

## Tests

    node --test "tools/tests/world-plan/*.test.mjs"
