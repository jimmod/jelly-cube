import * as THREE from 'three';
import { JellyPhysics } from './physics';
import { createUI, getSegments } from './ui';
import type { UIState } from './ui';
import './style.css';

// ─── Scene ───────────────────────────────────────────────────────────────────
const container = document.getElementById('app')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc0c0c0);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 4, 16);
camera.lookAt(0, 2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

// ─── Lighting ────────────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 15, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.1;
dirLight.shadow.camera.far = 40;
dirLight.shadow.camera.left = -10;
dirLight.shadow.camera.right = 10;
dirLight.shadow.camera.top = 10;
dirLight.shadow.camera.bottom = -10;
dirLight.shadow.bias = -0.002;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0x8888ff, 0.4);
fillLight.position.set(-5, 5, -5);
scene.add(fillLight);

// ─── Invisible floor (for shadow only) ──────────────────────────────────────
const floorGeo = new THREE.PlaneGeometry(80, 80);
const floorMat = new THREE.ShadowMaterial({ opacity: 0.15 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// ─── Normal-color material (matches reference: surface normals → color) ─────
const normalShader = {
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    varying vec3 vWorldPos;

    void main() {
      vec3 n = normalize(vNormal);
      
      // Map normals to vibrant magenta/green like the reference
      vec3 color = vec3(
        n.x * 0.5 + 0.5,
        n.y * 0.5 + 0.5,
        n.z * 0.3 + 0.7
      );
      
      // Enhance saturation and vibrancy
      color = pow(color, vec3(0.8));
      color *= 1.1;
      
      // Subtle lighting
      vec3 lightDir = normalize(vec3(0.5, 1.0, 0.7));
      float diffuse = max(dot(n, lightDir), 0.0) * 0.3 + 0.7;
      color *= diffuse;
      
      // Edge darkening for depth
      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.0);
      color = mix(color, color * 0.5, fresnel * 0.3);
      
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

// ─── State ───────────────────────────────────────────────────────────────────
let jellyPhysics: JellyPhysics;
let jellyMesh: THREE.Mesh;
let jellyGeo: THREE.BufferGeometry;
let jellyMat: THREE.ShaderMaterial;
let vertexParticleMapping: number[] = [];

// Debug objects
let boxHelper: THREE.Group | null = null;
let velocityHelper: THREE.LineSegments | null = null;

function buildJelly(segments: number) {
  // Remove old mesh
  if (jellyMesh) {
    scene.remove(jellyMesh);
    jellyGeo.dispose();
  }
  if (boxHelper) {
    scene.remove(boxHelper);
    boxHelper = null;
  }
  if (velocityHelper) {
    scene.remove(velocityHelper);
    velocityHelper = null;
  }

  jellyPhysics = new JellyPhysics(segments);

  const size = 4.0; // full size
  jellyGeo = new THREE.BoxGeometry(size, size, size, segments, segments, segments);

  jellyMat = new THREE.ShaderMaterial({
    vertexShader: normalShader.vertexShader,
    fragmentShader: normalShader.fragmentShader,
    side: THREE.DoubleSide,
  });

  jellyMesh = new THREE.Mesh(jellyGeo, jellyMat);
  jellyMesh.castShadow = true;
  jellyMesh.receiveShadow = true;
  scene.add(jellyMesh);

  // Map vertices to nearest physics particle
  const posAttr = jellyGeo.attributes.position;
  vertexParticleMapping = [];

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i) + size / 2 + 0.5; // offset: geom centered at 0, physics bottom at 0.5
    const vz = posAttr.getZ(i);

    let minDist = Infinity;
    let closestIdx = 0;
    for (let j = 0; j < jellyPhysics.particles.length; j++) {
      const p = jellyPhysics.particles[j];
      const dx = p.restPosition.x - vx;
      const dy = p.restPosition.y - vy;
      const dz = p.restPosition.z - vz;
      const dist = dx * dx + dy * dy + dz * dz;
      if (dist < minDist) {
        minDist = dist;
        closestIdx = j;
      }
    }
    vertexParticleMapping.push(closestIdx);
  }
}

// ─── Debug: Box wireframe overlay ────────────────────────────────────────────
function buildBoxHelper(segments: number): THREE.Group {
  const group = new THREE.Group();
  const n = segments;
  const size = 2.0;
  const step = (size * 2) / n;

  const mat = new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.4 });

  for (let iz = 0; iz < n; iz++) {
    for (let iy = 0; iy < n; iy++) {
      for (let ix = 0; ix < n; ix++) {
        const cx = ix * step - size + step / 2;
        const cy = iy * step - size + step / 2;
        const cz = iz * step - size + step / 2;
        const boxGeo = new THREE.BoxGeometry(step * 0.95, step * 0.95, step * 0.95);
        const edges = new THREE.EdgesGeometry(boxGeo);
        const line = new THREE.LineSegments(edges, mat);
        line.position.set(cx, cy, cz);
        group.add(line);
        boxGeo.dispose();
        edges.dispose();
      }
    }
  }

  return group;
}

function updateBoxHelper() {
  if (!boxHelper) return;
  const n = jellyPhysics.segments;
  const nn = n + 1;
  let childIdx = 0;

  for (let iz = 0; iz < n; iz++) {
    for (let iy = 0; iy < n; iy++) {
      for (let ix = 0; ix < n; ix++) {
        // Cell center = average of 8 corner particles
        const getIdx = (x: number, y: number, z: number) => z * nn * nn + y * nn + x;

        const corners = [
          getIdx(ix, iy, iz), getIdx(ix + 1, iy, iz),
          getIdx(ix, iy + 1, iz), getIdx(ix + 1, iy + 1, iz),
          getIdx(ix, iy, iz + 1), getIdx(ix + 1, iy, iz + 1),
          getIdx(ix, iy + 1, iz + 1), getIdx(ix + 1, iy + 1, iz + 1),
        ];

        let cx = 0, cy = 0, cz = 0;
        for (const ci of corners) {
          const p = jellyPhysics.particles[ci];
          cx += p.position.x;
          cy += p.position.y;
          cz += p.position.z;
        }
        cx /= 8; cy /= 8; cz /= 8;

        if (childIdx < boxHelper.children.length) {
          boxHelper.children[childIdx].position.set(cx, cy, cz);
        }
        childIdx++;
      }
    }
  }
}

// ─── Debug: Velocity lines ───────────────────────────────────────────────────
function buildVelocityHelper(): THREE.LineSegments {
  const count = jellyPhysics.particles.length;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 6); // 2 points per line
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
  return new THREE.LineSegments(geo, mat);
}

function updateVelocityHelper() {
  if (!velocityHelper) return;
  const positions = (velocityHelper.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
  const scale = 0.15;

  for (let i = 0; i < jellyPhysics.particles.length; i++) {
    const p = jellyPhysics.particles[i];
    const base = i * 6;
    positions[base] = p.position.x;
    positions[base + 1] = p.position.y;
    positions[base + 2] = p.position.z;
    positions[base + 3] = p.position.x + p.velocity.x * scale;
    positions[base + 4] = p.position.y + p.velocity.y * scale;
    positions[base + 5] = p.position.z + p.velocity.z * scale;
  }
  (velocityHelper.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
}

// ─── Interaction ─────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const dragPlane = new THREE.Plane();
const _intersectPt = new THREE.Vector3();
let isDragging = false;

function getClientPos(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if ('touches' in event) {
    if (event.touches.length === 0) return null;
    return { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }
  return { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY };
}

function screenToNDC(clientX: number, clientY: number) {
  mouse.x = (clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(clientY / window.innerHeight) * 2 + 1;
}

function onPointerDown(event: MouseEvent | TouchEvent) {
  const pos = getClientPos(event);
  if (!pos) return;

  screenToNDC(pos.x, pos.y);
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObject(jellyMesh);
  if (intersects.length > 0) {
    const hitPoint = intersects[0].point;

    // Create a drag plane facing the camera through the hit point
    const normal = new THREE.Vector3();
    camera.getWorldDirection(normal);
    dragPlane.setFromNormalAndCoplanarPoint(normal, hitPoint);

    // Grab radius — larger for more fluid deformation
    const grabRadius = 2.5;
    jellyPhysics.startDrag(hitPoint, grabRadius);
    isDragging = true;
    document.body.style.cursor = 'grabbing';

    event.preventDefault();
  }
}

function onPointerMove(event: MouseEvent | TouchEvent) {
  if (!isDragging) return;

  const pos = getClientPos(event);
  if (!pos) return;

  screenToNDC(pos.x, pos.y);
  raycaster.setFromCamera(mouse, camera);
  raycaster.ray.intersectPlane(dragPlane, _intersectPt);

  jellyPhysics.updateDrag(_intersectPt);
  event.preventDefault();
}

function onPointerUp() {
  if (isDragging) {
    jellyPhysics.endDrag();
    isDragging = false;
    document.body.style.cursor = 'auto';
  }
}

renderer.domElement.addEventListener('mousedown', onPointerDown);
window.addEventListener('mousemove', onPointerMove);
window.addEventListener('mouseup', onPointerUp);

renderer.domElement.addEventListener('touchstart', onPointerDown, { passive: false });
window.addEventListener('touchmove', onPointerMove, { passive: false });
window.addEventListener('touchend', onPointerUp);

// ─── UI ──────────────────────────────────────────────────────────────────────
let uiState: UIState;

function onUIChange(state: UIState) {
  // Resolution change
  if (getSegments(state.resolution) !== jellyPhysics.segments) {
    buildJelly(getSegments(state.resolution));

    // Rebuild debug helpers if active
    if (state.showBox) {
      if (boxHelper) scene.remove(boxHelper);
      boxHelper = buildBoxHelper(jellyPhysics.segments);
      scene.add(boxHelper);
    }
    if (state.showVelocity) {
      if (velocityHelper) scene.remove(velocityHelper);
      velocityHelper = buildVelocityHelper();
      scene.add(velocityHelper);
    }
  }

  // Box toggle
  if (state.showBox && !boxHelper) {
    boxHelper = buildBoxHelper(jellyPhysics.segments);
    scene.add(boxHelper);
  } else if (!state.showBox && boxHelper) {
    scene.remove(boxHelper);
    boxHelper = null;
  }

  // Velocity toggle
  if (state.showVelocity && !velocityHelper) {
    velocityHelper = buildVelocityHelper();
    scene.add(velocityHelper);
  } else if (!state.showVelocity && velocityHelper) {
    scene.remove(velocityHelper);
    velocityHelper = null;
  }

  uiState = state;
}

uiState = createUI(onUIChange);

// ─── Resize ──────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Init ────────────────────────────────────────────────────────────────────
buildJelly(getSegments(uiState.resolution));

// ─── Animation Loop ──────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let accumulator = 0;
const physicsDt = 1 / 120;

function animate() {
  requestAnimationFrame(animate);

  const frameDt = Math.min(clock.getDelta(), 0.05);
  accumulator += frameDt;

  // Fixed timestep physics
  while (accumulator >= physicsDt) {
    jellyPhysics.update(physicsDt);
    accumulator -= physicsDt;
  }

  // Update mesh vertices from physics
  const posAttr = jellyGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < posAttr.count; i++) {
    const p = jellyPhysics.particles[vertexParticleMapping[i]];
    posAttr.setXYZ(i, p.position.x, p.position.y, p.position.z);
  }
  posAttr.needsUpdate = true;
  jellyGeo.computeVertexNormals();
  jellyGeo.computeBoundingSphere();

  // Update debug helpers
  if (uiState.showBox && boxHelper) updateBoxHelper();
  if (uiState.showVelocity && velocityHelper) updateVelocityHelper();

  renderer.render(scene, camera);
}

animate();
