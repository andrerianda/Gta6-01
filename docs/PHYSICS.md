# MARAZUL physics: the interface

The game's own physics library, `game/src/physics/`. Pure simulation, no three.js, testable in Node.
Units and axes are those of `docs/CONVENTIONS.md`. One difference to remember: the physics speaks of a
**heading** as a compass angle (0 looks along -Z, a quarter turn looks along +X, clockwise seen from
above), which is **minus** a three.js `rotation.y`. Quaternions are the same in both.

Status: the collision world, four-wheeled vehicles and the character capsule controller are done and
tested. Two-wheelers, boats, the helicopter, knockable props, explosions, the cheap crowd and traffic
modes and trigger enter/exit events are not written yet.

## The world

    import { PhysicsWorld } from './physics/PhysicsWorld.js';
    const world = new PhysicsWorld({ ground, waterHeightAt });
    // ground: { heightAt(x, z), normalAt?(x, z, out), surfaceAt?(x, z) -> id or name, wetness? (0..1, read live) }

    world.advance(frameSeconds);      // runs 0..5 fixed steps of 1/60 s; world.alpha is the blend for drawing
    world.step();                     // or exactly one step (deterministic: same calls, same world.digest())

A slow frame never piles up work: `advance(seconds, maxSteps = 5)` drops time beyond `maxSteps`.

## Static geometry, streamed by sector

    const handles = world.addStatics(asset.colliders, { x, y, z, heading | quaternion, scale },
                                     { layer, surface, userRef, group: sectorId });
    world.addStaticBox(x, y, z, halfX, halfY, halfZ, heading, { group, userRef, surface, layer });
    world.addStaticCylinder(x, y, z, radius, halfHeight, { ... });
    world.removeStatic(handle);
    world.removeStaticGroup(sectorId);   // a sector streaming out

Descriptions are plain data, and the asset library's collider proxies fit as they are:
`{ shape: 'box' | 'cyl' | 'sphere' | 'capsule' | 'hull' | 'mesh', position, quaternion, size, vertices, indices }`
(`describePrism(footprint, yBottom, yTop)` and `describeRamp(width, length, height)` in
`collision/colliderDescriptions.js` make city shapes). Layers and ready-made masks are in
`collisionLayers.js` (`LAYER.STATIC` blocks sight, `LAYER.SEE_THROUGH` does not, `LAYER.TRIGGER` only
shows up in overlap queries that ask for it); surfaces are in `surfaceTypes.js`.

## Queries

All take a unit direction, a layer mask (default `MASK.SOLID`) and an ignore list (static handles, bodies
or your `userRef`s), allocate nothing, and write into `world.hit` (or the `out` you pass):

    world.raycast(ox, oy, oz, dx, dy, dz, maxDistance, mask, ignore, out)        -> boolean
    world.sphereCast(ox, oy, oz, dx, dy, dz, maxDistance, radius, mask, ignore, out)
    world.capsuleCast(ax, ay, az, bx, by, bz, radius, dx, dy, dz, maxDistance, mask, ignore, out)
    world.supportBelow(x, y, z, maxDrop, mask, ignore, out)       // what holds a point up; out.y is its height
    world.lineOfSight(ax, ay, az, bx, by, bz, mask = MASK.SIGHT, ignore)          -> true when clear
    world.overlapSphere(x, y, z, radius, mask, ignore, results)   -> count; world.overlaps.{kinds, indices, bodies}
    world.overlapCapsule(ax, ay, az, bx, by, bz, radius, mask, ignore, results)

A hit has `hit, kind (HIT_KIND.GROUND | STATIC | BODY), distance, x, y, z, nx, ny, nz, body, handle,
userRef, surface, layer`.

## Bodies and actors

    const crate = world.createBody({ colliders: [{ shape: 'box', size: { x: 1, y: 1, z: 1 } }], mass: 40,
                                     x, y, z, heading, layer: LAYER.PROP, userRef });
    crate.applyImpulse(ix, iy, iz, px, py, pz);  crate.wake();
    crate.interpolatedPose(world.alpha, position, quaternion);   // where to draw the model's origin
    world.removeBody(crate);

An actor is anything with `beforeStep(world, dt)` (apply impulses; runs after gravity, before contacts)
and/or `afterStep(world, dt)`; add it with `world.addActor(actor)`. Vehicles are actors.

## Events

After stepping, read `world.events.items[0 .. world.events.count)` and then call `world.events.clear()`
(the world never clears them, so nothing is lost across several steps). Every event has the same
fields; the types reported today are `IMPACT` (bodies), `LANDING` and `KNOCKDOWN` (characters, in `a`).
`PHYSICS_EVENT.IMPACT`: `{ a, b, aRef, bRef, staticHandle, ground, x, y, z, nx, ny, nz (from a to b),
speed (closing, m/s), impulse (N s), energy (J), surface }`. `b` is null for the fixed world, and `bRef`
is then the static collider's `userRef`. A hard crash may be reported in two consecutive steps: add the
energies.

## Vehicles

    import { Vehicle } from './physics/vehicles/Vehicle.js';
    import { deriveVehicleTuning } from './physics/vehicles/vehicleTuning.js';
    const tuning = deriveVehicleTuning(VEHICLE_CATALOG.sports_coupe, wheels);   // once per model
    const car = new Vehicle(world, tuning, { x, z, heading, userRef });         // stands on the ground
    car.input.drive = 1;        // 1 ahead, -1 back; brakes first when rolling the other way
    car.input.steer = -1;       // -1 left .. 1 right (speed-sensitive lock is applied inside)
    car.input.handbrake = 1;    // locks the rear wheels
    car.speed, car.rpm, car.gear (-1 reverse), car.throttle, car.brake, car.heading, car.groundedWheels
    car.body.interpolatedPose(world.alpha, position, quaternion);               // the model's origin
    car.wheelHubPosition(i, out)  car.wheelSteer[i]  car.wheelSpin[i]  car.wheelContact[i]
    car.wheelSlip[i] (0 rolling .. 1 sliding: skid marks, smoke, squeal)  car.wheelSurface[i]
    car.placeAt(x, y, z, heading);  car.dispose();

`wheels` is optional: four `{ x, y, z, radius }` in **model space** (origin on the ground at the centre
of the vehicle, facing -Z, +X to its right), in the order front left, front right, rear left, rear right,
read from the model's `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr` hubs. Without them the catalog's
wheelbase, width and wheel radius are used. The tuning reads from the catalog entry: `mass`,
`dimensions.{length, width, height, wheelbase, wheelRadius, groundClearance}`,
`handling.{topSpeed, zeroToHundred, timeToTopSpeed, braking, grip, driftTendency, driveWheels, suspension}`
and `engine.gears`. Engine power is solved from the 0 to 100 km/h time and drag from the top speed, so a
vehicle reaches the top speed its catalog entry states.

A parked car brakes itself, does not creep on slopes, and sleeps after a second; any `input.drive` or a
collision wakes it. A car left on its roof or side and nearly still is rolled back onto its wheels.

## Characters

    import { CharacterController } from './physics/characters/CharacterController.js';
    const walker = new CharacterController(world, { x, z, userRef });   // feet on the ground; radius 0.3, height 1.75
    walker.input.x = vx;  walker.input.z = vz;    // wanted horizontal velocity, world axes, m/s
    walker.input.jump = true;                     // while held on the ground it jumps
    walker.position (the feet), walker.previousPosition (blend with world.alpha), walker.velocity,
    walker.grounded, walker.surface, walker.waterDepth (wade from about 0.4, swim from about 1.3),
    walker.knockedDown (set with a KNOCKDOWN event when a vehicle hits it; the game clears it),
    walker.ignore (bodies or userRefs the capsule passes through), walker.placeAt(x, y, z), walker.dispose()

It slides along static geometry, vehicles and props, steps up to 0.35 m, refuses slopes steeper than
about 50 degrees, follows the ground downhill and reports hard landings (`PHYSICS_EVENT.LANDING`).
Characters do not collide with each other yet, and queries do not see them yet.

## Tests

    node --test "tools/tests/physics/*.test.mjs"
