import * as THREE from "three";
import getLayer from "./getLayer.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";


const w = window.innerWidth;
const h = window.innerHeight;
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
camera.position.x = 5;

// make canvas transparent
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(w, h);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.6;

// ensure correct color/output encoding and physically correct lights
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.physicallyCorrectLights = true;

// ensure clear color is fully transparent
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);

// ensure page background is transparent
document.documentElement.style.background = 'transparent';
document.body.style.background = 'transparent';

const ctrls = new OrbitControls(camera, renderer.domElement);
ctrls.enableDamping = true;


const gltfLoader = new GLTFLoader();

const busshelterGlb = await gltfLoader.loadAsync(
  `${import.meta.env.BASE_URL}Day 12 - ChurchRoof.glb`
);
const busshelter = busshelterGlb.scene;

// create a small environment for proper metal/roughness reflections
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
const envMap = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envMap;
pmremGenerator.dispose();

busshelter.traverse((child) => {
  if (child.isMesh) {
    child.castShadow = true;
    child.receiveShadow = true;

    // ensure material texture encodings are correct for PBR
    const fixMaterial = (mat) => {
      if (!mat) return;
      if (Array.isArray(mat)) { mat.forEach(fixMaterial); return; }

      // color/intensity maps should be sRGB
      ["map", "emissiveMap", "aoMap", "lightMap", "environmentMap"].forEach((k) => {
        if (mat[k] && mat[k].isTexture) mat[k].encoding = THREE.sRGBEncoding;
      });

      // non-color and data maps should stay linear
      ["metalnessMap", "roughnessMap", "normalMap", "bumpMap", "displacementMap", "alphaMap"].forEach((k) => {
        if (mat[k] && mat[k].isTexture) mat[k].encoding = THREE.LinearEncoding;
      });

      // ensure the material updates and uses environment reflections
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        mat.envMap = scene.environment;
        mat.needsUpdate = true;
      }
    };

    fixMaterial(child.material);
  }
});

// ensure world matrices are correct before measuring
busshelter.updateMatrixWorld(true);

// compute bounds and scale so the model's largest dimension equals `targetSize`
let box = new THREE.Box3().setFromObject(busshelter);
const size = box.getSize(new THREE.Vector3());
const maxDim = Math.max(size.x, size.y, size.z);
const targetSize = 4; // world units you want the model to fit in
if (maxDim > 0) {
  const scale = targetSize / maxDim;
  busshelter.scale.setScalar(scale);
  busshelter.updateMatrixWorld(true); // update after scaling
}

// recompute bounds and get center
box = new THREE.Box3().setFromObject(busshelter);
const center = box.getCenter(new THREE.Vector3());

// create a pivot at the world origin and add the model offset so its center is at pivot
const pivot = new THREE.Group();
scene.add(pivot);
busshelter.position.sub(center); // move model so its center is at (0,0,0) relative to pivot
pivot.add(busshelter);

// start rotated 270 degrees around Y
pivot.rotation.y = -0.7 * Math.PI / 2; // 270deg

// pivot.rotation.z = 0.08 * Math.PI / 2; // 270deg

// bounce setup: 180° total (min = 270° - 180° = 90°, max = 270°)
const clock = new THREE.Clock();
const rotationSpeed = 0.3; // radians per second (~0.005 per frame at 60fps)
const startAngle = pivot.rotation.y; // 270deg
const fullRange = 0.5 * Math.PI; // 180° in radians
const minAngle = startAngle - fullRange; // 90deg
const maxAngle = startAngle; // 270deg
let rotationDirection = -1; // start moving away from 270° in the same direction as before

// update controls target to the pivot center
ctrls.target.set(0, 0, 0);
ctrls.update();

// stop / resume auto-rotation on pointer press/release
let isRotating = true;
const canvas = renderer.domElement;

// stop rotation while pointer is down on the canvas
canvas.addEventListener('pointerdown', () => {
  isRotating = false;
}, { passive: true });

// resume rotation when pointer is released
canvas.addEventListener('pointerup', () => {
  isRotating = true;
}, { passive: true });

// handle cancel/leave to ensure rotation resumes
canvas.addEventListener('pointercancel', () => { isRotating = true; }, { passive: true });
canvas.addEventListener('pointerout', () => { isRotating = true; }, { passive: true });
canvas.addEventListener('pointerleave', () => { isRotating = true; }, { passive: true });


const hemiLight = new THREE.HemisphereLight(0xffffff, 0x666666, 2);
scene.add(hemiLight);
// add ambient fill light (no directional light)
const ambient = new THREE.AmbientLight(0xffffff, 2);
scene.add(ambient);


function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  // bounce between minAngle and maxAngle when allowed
  if (isRotating) {
    pivot.rotation.y += rotationDirection * rotationSpeed * delta;

    if (pivot.rotation.y <= minAngle) {
      pivot.rotation.y = minAngle;
      rotationDirection = 1;
    } else if (pivot.rotation.y >= maxAngle) {
      pivot.rotation.y = maxAngle;
      rotationDirection = -1;
    }
  }

  // update controls (damping) before render
  ctrls.update();
  renderer.render(scene, camera);
}

animate();

function handleWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', handleWindowResize, false);