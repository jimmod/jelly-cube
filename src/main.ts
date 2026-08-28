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
dirLight.shadow.camera.left = -15;
dirLight.shadow.camera.right = 15;
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

// ─── JellyCube: encapsulates a single cube ──────────────────────────────────
interface JellyCube {
  physics: JellyPhysics;
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
  vertexParticleMapping: number[];
  boxHelper: THREE.Group | null;
  velocityHelper: THREE.LineSegments | null;
  offsetX: number; // world-space X offset
}

const cubes: JellyCube[] = [];

function createJellyCube(segments: number, offsetX: number): JellyCube {
  const physics = new JellyPhysics(segments);

  // Apply offset to all particles
  for (const p of physics.particles) {
    p.position.x += offsetX;
    p.restPosition.x += offsetX;
  }

  const size = 4.0;
  const geo = new THREE.BoxGeometry(size, size, size, segments, segments, segments);

  const mat = new THREE.ShaderMaterial({
    vertexShader: normalShader.vertexShader,
    fragmentShader: normalShader.fragmentShader,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  // Map vertices to nearest physics particle
  const posAttr = geo.attributes.position;
  const vertexParticleMapping: number[] = [];

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i) + offsetX;
    const vy = posAttr.getY(i) + size / 2 + 0.5;
    const vz = posAttr.getZ(i);

    let minDist = Infinity;
    let closestIdx = 0;
    for (let j = 0; j < physics.particles.length; j++) {
      const p = physics.particles[j];
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

  return {
    physics,
    mesh,
    geo,
    mat,
    vertexParticleMapping,
    boxHelper: null,
    velocityHelper: null,
    offsetX,
  };
}

function removeJellyCube(cube: JellyCube) {
  scene.remove(cube.mesh);
  cube.geo.dispose();
  cube.mat.dispose();
  if (cube.boxHelper) {
    scene.remove(cube.boxHelper);
    cube.boxHelper = null;
  }
  if (cube.velocityHelper) {
    scene.remove(cube.velocityHelper);
    cube.velocityHelper = null;
  }
}

// ─── Debug: Box wireframe overlay ────────────────────────────────────────────
function buildBoxHelper(cube: JellyCube): THREE.Group {
  const segments = cube.physics.segments;
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

function updateBoxHelper(cube: JellyCube) {
  if (!cube.boxHelper) return;
  const n = cube.physics.segments;
  const nn = n + 1;
  let childIdx = 0;

  for (let iz = 0; iz < n; iz++) {
    for (let iy = 0; iy < n; iy++) {
      for (let ix = 0; ix < n; ix++) {
        const getIdx = (x: number, y: number, z: number) => z * nn * nn + y * nn + x;

        const corners = [
          getIdx(ix, iy, iz), getIdx(ix + 1, iy, iz),
          getIdx(ix, iy + 1, iz), getIdx(ix + 1, iy + 1, iz),
          getIdx(ix, iy, iz + 1), getIdx(ix + 1, iy, iz + 1),
          getIdx(ix, iy + 1, iz + 1), getIdx(ix + 1, iy + 1, iz + 1),
        ];

        let cx = 0, cy = 0, cz = 0;
        for (const ci of corners) {
          const p = cube.physics.particles[ci];
          cx += p.position.x;
          cy += p.position.y;
          cz += p.position.z;
        }
        cx /= 8; cy /= 8; cz /= 8;

        if (childIdx < cube.boxHelper.children.length) {
          cube.boxHelper.children[childIdx].position.set(cx, cy, cz);
        }
        childIdx++;
      }
    }
  }
}

// ─── Debug: Velocity lines ───────────────────────────────────────────────────
function buildVelocityHelper(cube: JellyCube): THREE.LineSegments {
  const count = cube.physics.particles.length;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 6);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
  return new THREE.LineSegments(geo, mat);
}

function updateVelocityHelper(cube: JellyCube) {
  if (!cube.velocityHelper) return;
  const positions = (cube.velocityHelper.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
  const scale = 0.15;

  for (let i = 0; i < cube.physics.particles.length; i++) {
    const p = cube.physics.particles[i];
    const base = i * 6;
    positions[base] = p.position.x;
    positions[base + 1] = p.position.y;
    positions[base + 2] = p.position.z;
    positions[base + 3] = p.position.x + p.velocity.x * scale;
    positions[base + 4] = p.position.y + p.velocity.y * scale;
    positions[base + 5] = p.position.z + p.velocity.z * scale;
  }
  (cube.velocityHelper.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
}

// ─── Cube layout ─────────────────────────────────────────────────────────────
function getCubeOffsets(count: number): number[] {
  const spacing = 5.0; // distance between cube centers
  const offsets: number[] = [];
  const totalWidth = (count - 1) * spacing;
  for (let i = 0; i < count; i++) {
    offsets.push(i * spacing - totalWidth / 2);
  }
  return offsets;
}

function rebuildAllCubes(segments: number, count: number) {
  // Remove existing cubes
  for (const cube of cubes) {
    removeJellyCube(cube);
  }
  cubes.length = 0;

  // Create new cubes
  const offsets = getCubeOffsets(count);
  for (let i = 0; i < count; i++) {
    cubes.push(createJellyCube(segments, offsets[i]));
  }

  // Adjust camera to frame all cubes
  updateCamera(count);
}

function updateCamera(cubeCount: number) {
  const distance = 16 + (cubeCount - 1) * 4;
  camera.position.set(0, 4, distance);
  camera.lookAt(0, 2, 0);
}

// ─── Interaction ─────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const dragPlane = new THREE.Plane();
const _intersectPt = new THREE.Vector3();
let isDragging = false;
let draggedCube: JellyCube | null = null;

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
  // Ignore clicks on the control panel
  const target = event.target as HTMLElement;
  if (target.closest('#control-panel')) return;

  const pos = getClientPos(event);
  if (!pos) return;

  screenToNDC(pos.x, pos.y);
  raycaster.setFromCamera(mouse, camera);

  // Check all cube meshes for intersection
  let closestHit: THREE.Intersection | null = null;
  let hitCube: JellyCube | null = null;

  for (const cube of cubes) {
    const intersects = raycaster.intersectObject(cube.mesh);
    if (intersects.length > 0) {
      if (!closestHit || intersects[0].distance < closestHit.distance) {
        closestHit = intersects[0];
        hitCube = cube;
      }
    }
  }

  if (closestHit && hitCube) {
    const hitPoint = closestHit.point;

    const normal = new THREE.Vector3();
    camera.getWorldDirection(normal);
    dragPlane.setFromNormalAndCoplanarPoint(normal, hitPoint);

    const grabRadius = 2.5;
    hitCube.physics.startDrag(hitPoint, grabRadius);
    isDragging = true;
    draggedCube = hitCube;
    document.body.style.cursor = 'grabbing';

    event.preventDefault();
  }
}

function onPointerMove(event: MouseEvent | TouchEvent) {
  if (!isDragging || !draggedCube) return;

  const pos = getClientPos(event);
  if (!pos) return;

  screenToNDC(pos.x, pos.y);
  raycaster.setFromCamera(mouse, camera);
  raycaster.ray.intersectPlane(dragPlane, _intersectPt);

  draggedCube.physics.updateDrag(_intersectPt);
  event.preventDefault();
}

function onPointerUp() {
  if (isDragging && draggedCube) {
    draggedCube.physics.endDrag();
    isDragging = false;
    draggedCube = null;
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
  const segmentsChanged = cubes.length === 0 || getSegments(state.resolution) !== cubes[0].physics.segments;
  const countChanged = state.cubeCount !== cubes.length;

  if (segmentsChanged || countChanged) {
    rebuildAllCubes(getSegments(state.resolution), state.cubeCount);

    // Rebuild debug helpers if active
    for (const cube of cubes) {
      if (state.showBox) {
        cube.boxHelper = buildBoxHelper(cube);
        scene.add(cube.boxHelper);
      }
      if (state.showVelocity) {
        cube.velocityHelper = buildVelocityHelper(cube);
        scene.add(cube.velocityHelper);
      }
    }
  }

  // Box toggle
  for (const cube of cubes) {
    if (state.showBox && !cube.boxHelper) {
      cube.boxHelper = buildBoxHelper(cube);
      scene.add(cube.boxHelper);
    } else if (!state.showBox && cube.boxHelper) {
      scene.remove(cube.boxHelper);
      cube.boxHelper = null;
    }
  }

  // Velocity toggle
  for (const cube of cubes) {
    if (state.showVelocity && !cube.velocityHelper) {
      cube.velocityHelper = buildVelocityHelper(cube);
      scene.add(cube.velocityHelper);
    } else if (!state.showVelocity && cube.velocityHelper) {
      scene.remove(cube.velocityHelper);
      cube.velocityHelper = null;
    }
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
rebuildAllCubes(getSegments(uiState.resolution), uiState.cubeCount);

// ─── Animation Loop ──────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let accumulator = 0;
const physicsDt = 1 / 120;

function animate() {
  requestAnimationFrame(animate);

  const frameDt = Math.min(clock.getDelta(), 0.05);
  accumulator += frameDt;

  // Fixed timestep physics for all cubes
  while (accumulator >= physicsDt) {
    for (const cube of cubes) {
      cube.physics.update(physicsDt);
    }
    accumulator -= physicsDt;
  }

  // Update mesh vertices from physics for all cubes
  for (const cube of cubes) {
    const posAttr = cube.geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const p = cube.physics.particles[cube.vertexParticleMapping[i]];
      posAttr.setXYZ(i, p.position.x, p.position.y, p.position.z);
    }
    posAttr.needsUpdate = true;
    cube.geo.computeVertexNormals();
    cube.geo.computeBoundingSphere();

    // Update debug helpers
    if (uiState.showBox && cube.boxHelper) updateBoxHelper(cube);
    if (uiState.showVelocity && cube.velocityHelper) updateVelocityHelper(cube);
  }

  renderer.render(scene, camera);
}

animate();
