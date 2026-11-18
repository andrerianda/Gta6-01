// The craft in the skyline picture: a speedboat under way in the near water, its white hull
// leaving a foaming wake, and Canal 6's magenta-and-white news helicopter crossing the view with
// its rotors blurred ("the news circles the city"). Both are the real models of the asset library
// (speedboat, news_helicopter) placed for the still, held where they are: the picture is one frame.
// Positions are given in the camera's own terms: metres ahead of the eye towards the city, metres
// to the right, and (for the helicopter) metres above the sea.
// three.js and the asset helpers are loaded when a craft is staged (the director's scene list is
// also read by Node tests, where the bare 'three' does not resolve).
import { GAME_COMMANDS } from '../core/events/gameCommands.js';

/** three.js and setLamp, imported on first use. */
let libraries = null;
const loadLibraries = () => {
  libraries ??= Promise.all([import('three'), import('../assets/index.js')]).then(([THREE, assets]) => ({ THREE, setLamp: assets.setLamp }));
  return libraries;
};

/** Length of the speedboat's wake behind the transom, and the half-angle it spreads at (Kelvin's 19.5 degrees). */
const WAKE = Object.freeze({ length: 64, spread: 0.34, transom: 4.3, opacity: 0.85 });

/**
 * Places the speedboat: `ahead` / `right` metres from the eye, running across the view
 * (`course` radians off square to the line of sight, + turns its bow towards the camera), its bow
 * lifted a little as a planing hull's is, nav and stern lamps on, a wake behind it and spray at
 * the chines.
 * @param {object} game The game context.
 * @param {{x: number, z: number}} eye The camera's ground position.
 * @param {{x: number, z: number}} toward The unit direction the camera looks.
 * @param {{ahead: number, right: number, course: number}} setting
 * @returns {Promise<THREE.Object3D|null>} The boat, or null when the model or the scene is missing.
 */
export async function stageSpeedboat(game, eye, toward, setting) {
  const boat = await instanceOf(game, 'speedboat');
  if (!boat) return null;
  const { THREE, setLamp } = await loadLibraries();
  const x = eye.x + toward.x * setting.ahead - toward.z * setting.right;
  const z = eye.z + toward.z * setting.ahead + toward.x * setting.right;
  const [bowX, bowZ] = acrossTheView(toward, setting.course);
  const sea = waveHeightAt(game, x, z);
  boat.rotation.order = 'YXZ';
  boat.rotation.set(0.055, Math.atan2(-bowX, -bowZ), -0.03);
  boat.position.set(x, sea - 0.08, z);
  for (const group of ['head', 'nav_red', 'nav_green', 'tail']) setLamp(boat, group, true);
  addToWorld(game, boat);
  addToWorld(game, wakeMesh(THREE, x - bowX * WAKE.transom, sea + 0.06, z - bowZ * WAKE.transom, bowX, bowZ));
  if (game.commands?.has?.(GAME_COMMANDS.EFFECT_SPAWN)) {
    for (const side of [-1, 1]) {
      const sx = x + bowX * 1.6 - bowZ * side * 1.25;
      const sz = z + bowZ * 1.6 + bowX * side * 1.25;
      game.commands.run(GAME_COMMANDS.EFFECT_SPAWN, { effectId: 'sea_spray', position: { x: sx, y: sea + 0.2, z: sz }, direction: { x: -bowZ * side, y: 0.6, z: bowX * side }, scale: 1.4 });
    }
    game.commands.run(GAME_COMMANDS.EFFECT_SPAWN, { effectId: 'sea_spray', position: { x: x - bowX * 5, y: sea + 0.2, z: z - bowZ * 5 }, direction: { x: -bowX, y: 0.5, z: -bowZ }, scale: 1.6 });
  }
  return boat;
}

/**
 * Places the news helicopter: `ahead` / `right` metres from the eye at `altitude` metres, flying
 * across the view nose a little down and banked into a gentle turn, rotors shown as their blur
 * discs, nav lamps on.
 * @param {object} game The game context.
 * @param {{x: number, z: number}} eye The camera's ground position.
 * @param {{x: number, z: number}} toward The unit direction the camera looks.
 * @param {{ahead: number, right: number, altitude: number}} setting
 * @returns {Promise<THREE.Object3D|null>} The helicopter, or null when the model or the scene is missing.
 */
export async function stageNewsHelicopter(game, eye, toward, setting) {
  const heli = await instanceOf(game, 'news_helicopter');
  if (!heli) return null;
  const { THREE, setLamp } = await loadLibraries();
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  for (const name of ['rotor_main', 'rotor_tail']) {
    const blades = heli.getObjectByName(name);
    if (blades?.isMesh) blades.material = hidden;
  }
  const disc = heli.getObjectByName('rotor_main_blur');
  if (disc?.isMesh && disc.material) {
    disc.material = disc.material.clone();
    disc.material.opacity *= 0.55;
    disc.material.transparent = true;
  }
  for (const group of ['nav_red', 'nav_green', 'tail']) setLamp(heli, group, true);
  const x = eye.x + toward.x * setting.ahead - toward.z * setting.right;
  const z = eye.z + toward.z * setting.ahead + toward.x * setting.right;
  // Side-on, flying right to left across the frame (turned 0.35 rad towards the camera, take k7,
  // it read foreshortened and small); `setting.course` turns the nose towards the camera.
  const [bowX, bowZ] = acrossTheView(toward, Number.isFinite(setting.course) ? setting.course : 0.05);
  heli.rotation.order = 'YXZ';
  heli.rotation.set(-0.09, Math.atan2(-bowX, -bowZ), 0.12);
  heli.position.set(x, setting.altitude, z);
  addToWorld(game, heli);
  return heli;
}

/**
 * A heading across the view from right to left (the camera's left), turned `course` radians
 * towards the camera; returned as the unit direction [x, z] of the bow (a model's -Z).
 */
function acrossTheView(toward, course) {
  const leftX = toward.z;
  const leftZ = -toward.x;
  return [leftX * Math.cos(course) - toward.x * Math.sin(course), leftZ * Math.cos(course) - toward.z * Math.sin(course)];
}

/** A level-0 instance of a model, loading it first if the boot has not. */
async function instanceOf(game, id) {
  const assets = game.assets;
  if (!assets?.load || !parentOf(game)) return null;
  try {
    if (!assets.has(id)) await assets.load([id]);
    return assets.instantiate(id, { lod: 0 });
  } catch {
    return null;
  }
}

function parentOf(game) {
  return game.view?.layers?.dynamic ?? game.view?.scene ?? null;
}

function addToWorld(game, object) {
  parentOf(game)?.add(object);
}

/** The sea's height at (x, z): the atmosphere's waves when it has them, else the still level 0. */
function waveHeightAt(game, x, z) {
  const height = game.atmosphere?.getWaveHeight?.(x, z);
  return Number.isFinite(height) ? height : 0;
}

/**
 * The wake: a flat fan on the water from the transom backwards, narrow at the boat and spreading
 * at the Kelvin angle, painted with churned foam down the middle and the two diverging wave crests
 * at its edges, all fading out behind.
 */
function wakeMesh(THREE, x, y, z, bowX, bowZ) {
  const half0 = 1.2;
  const half1 = half0 + WAKE.length * Math.tan(WAKE.spread);
  const geometry = new THREE.BufferGeometry();
  // Local frame: +v runs back from the transom (0) to the wake's end (1), u across (-1 .. 1).
  const rows = 8;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const half = half0 + (half1 - half0) * v;
    const back = WAKE.length * v;
    for (const u of [-1, 1]) {
      // world: back along -bow, across along the bow's left/right normal
      positions.push(x - bowX * back - bowZ * u * half, y, z - bowZ * back + bowX * u * half);
      uvs.push((u + 1) / 2, 1 - v);
    }
    if (row < rows) {
      const a = row * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({
    map: foamTexture(THREE), color: 0xf4efe8, transparent: true, opacity: WAKE.opacity,
    depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  mesh.name = 'showcase_speedboat_wake';
  return mesh;
}

/** The foam picture: v = 1 at the transom; a churned band in the middle, crests at the edges. */
function foamTexture(THREE) {
  const width = 128;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const paint = canvas.getContext('2d');
  const image = paint.createImageData(width, height);
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let row = 0; row < height; row += 1) {
    const age = row / (height - 1); // 0 at the transom (top row, v = 1) .. 1 at the end
    for (let col = 0; col < width; col += 1) {
      const u = (col / (width - 1)) * 2 - 1;
      const churn = Math.exp(-((u / (0.28 + age * 0.4)) ** 2)) * (1 - age) ** 1.1 * 1.2;
      const crest = Math.exp(-(((Math.abs(u) - 0.92) / 0.08) ** 2)) * (1 - age) ** 0.8;
      const grain = 0.55 + random() * 0.45;
      const alpha = Math.min(1, (churn + crest) * grain);
      const at = (row * width + col) * 4;
      image.data[at] = 255;
      image.data[at + 1] = 255;
      image.data[at + 2] = 255;
      image.data[at + 3] = Math.round(alpha * 255);
    }
  }
  paint.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
