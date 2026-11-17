// Temporary pipeline proof for MARAZUL: a small lit three.js scene (PBR spheres on a ground under
// one shadow-casting sun, ACES tone mapping, sRGB output). It only shows that the vendored
// three.js build, the import map and the capture tools work; the engine replaces this file.
import * as THREE from 'three';

/**
 * Builds the proof scene: a ground, a row of PBR spheres from rough to polished, sky light and a
 * shadow-casting sun. Units are metres, +Y is up, -Z is north.
 * @returns {{ scene: THREE.Scene, camera: THREE.PerspectiveCamera }}
 */
export function createPipelineProofScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ec5e8);
  scene.fog = new THREE.Fog(0x8ec5e8, 30, 90);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0xb9a888, roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const sphereGeometry = new THREE.SphereGeometry(1, 48, 24);
  const sphereColours = [0xe2543d, 0xf0b23c, 0x2fa99b, 0x3b6fd6, 0xe9e4d8];
  for (let i = 0; i < sphereColours.length; i += 1) {
    const sphere = new THREE.Mesh(
      sphereGeometry,
      new THREE.MeshStandardMaterial({
        color: sphereColours[i],
        roughness: 0.85 - i * 0.17,
        metalness: i === sphereColours.length - 1 ? 0.6 : 0.05,
      }),
    );
    sphere.position.set((i - (sphereColours.length - 1) / 2) * 2.6, 1, 0);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    scene.add(sphere);
  }

  scene.add(new THREE.HemisphereLight(0xbfdcf5, 0x8a7352, 1.1));

  const sun = new THREE.DirectionalLight(0xfff0d6, 3.2);
  sun.position.set(9, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 200);
  camera.position.set(0, 4.2, 13);
  camera.lookAt(0, 0.9, 0);

  return { scene, camera };
}

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const { scene, camera } = createPipelineProofScene();

function fitRendererToWindow() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', fitRendererToWindow);
fitRendererToWindow();

renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
  // The capture and smoke tools wait for this flag: the first frame is on the canvas.
  window.__gameReady = true;
});
