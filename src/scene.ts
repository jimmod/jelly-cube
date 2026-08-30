import * as THREE from 'three';

// ─── Three.js Scene Setup ───────────────────────────────────────────────────
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1016);

export const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 4.5, 14);

export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

// ─── Lighting ────────────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffeedd, 1.4);
dirLight.position.set(6, 12, 8);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 30;
dirLight.shadow.camera.left = -10;
dirLight.shadow.camera.right = 10;
dirLight.shadow.camera.top = 10;
dirLight.shadow.camera.bottom = -10;
dirLight.shadow.bias = -0.001;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0x60a5fa, 0.6);
fillLight.position.set(-6, 6, -5);
scene.add(fillLight);

// ─── Invisible floor (for shadow only) ──────────────────────────────────────
const floorGeo = new THREE.PlaneGeometry(80, 80);
const floorMat = new THREE.ShadowMaterial({ opacity: 0.25 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// ─── Camera & Bounds ────────────────────────────────────────────────────────
export function updateCamera(count: number) {
  const targetY = 3.5;
  const dist = 11 + count * 2.0;
  camera.position.set(0, targetY + 1.0, dist);
  camera.lookAt(0, targetY, 0);
}

export function getVisibleBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
  const aspect = window.innerWidth / window.innerHeight;
  const vFOV = (camera.fov * Math.PI) / 180;
  const targetZ = 0;
  const dist = camera.position.z - targetZ;

  const visibleHeight = 2 * Math.tan(vFOV / 2) * dist;
  const visibleWidth = visibleHeight * aspect;

  const camY = camera.position.y;
  const margin = 0.5;

  return {
    minX: -visibleWidth / 2 + margin,
    maxX: visibleWidth / 2 - margin,
    minY: 0.0,
    maxY: camY + visibleHeight / 2 - margin,
  };
}

// ─── Resize Handler ─────────────────────────────────────────────────────────
export function handleResize(onBoundsChanged: () => void) {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    onBoundsChanged();
  });
}
