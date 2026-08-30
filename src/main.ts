import './style.css';
import * as THREE from 'three';
import { JellyPhysics } from './physics';
import { createUI, getSegments } from './ui';
import type { UIState } from './ui';
import { playPressSound } from './audio';

// ─── Three.js Scene Setup ───────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1016); // Deep space dark background

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 4.5, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

// ─── Lighting ────────────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
dirLight.position.set(5, 12, 8);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 30;
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

// ─── Normal-color & Speed Heatmap Shader ────────────────────────────────────
const normalShader = {
  uniforms: {
    tDiffuse: { value: null },
    hasTexture: { value: 0 },
    textureMode: { value: 0 },
    showSpeedHeatmap: { value: 0 },
    uColor: { value: new THREE.Color('#ff0055') }
  },
  vertexShader: `
    attribute float aSpeed;
    varying vec3 vWorldPos;
    varying vec2 vUv;
    varying float vSpeed;

    void main() {
      vUv = uv;
      vSpeed = aSpeed;
      vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform int hasTexture;
    uniform int textureMode;
    uniform int showSpeedHeatmap;
    uniform vec3 uColor;
    
    varying vec3 vWorldPos;
    varying vec2 vUv;
    varying float vSpeed;

    void main() {
      // Compute flat face normal via derivatives (GPU hardware)
      vec3 fdx = dFdx(vWorldPos);
      vec3 fdy = dFdy(vWorldPos);
      vec3 n = normalize(cross(fdx, fdy));
      
      vec3 baseColor;
      
      if (showSpeedHeatmap == 1) {
        // Kinetic Energy / Speed Heatmap:
        // 0 -> Deep Electric Blue
        // 5 -> Neon Cyan
        // 10 -> Vibrant Yellow/Orange
        // 18+ -> Blazing Hot Magenta/Red
        float s = clamp(vSpeed / 15.0, 0.0, 1.0);
        vec3 c0 = vec3(0.08, 0.35, 0.95);
        vec3 c1 = vec3(0.05, 0.92, 0.75);
        vec3 c2 = vec3(0.98, 0.85, 0.12);
        vec3 c3 = vec3(1.0, 0.12, 0.25);
        
        if (s < 0.33) {
          baseColor = mix(c0, c1, s / 0.33);
        } else if (s < 0.66) {
          baseColor = mix(c1, c2, (s - 0.33) / 0.33);
        } else {
          baseColor = mix(c2, c3, (s - 0.66) / 0.34);
        }
      } else if (textureMode == 3 && hasTexture == 1) {
        // File texture
        baseColor = texture2D(tDiffuse, vUv).rgb;
      } else if (textureMode == 1) {
        // Rainbow mode (map normals to colors)
        baseColor = abs(n) * 1.2;
      } else if (textureMode == 2) {
        // Custom color
        baseColor = uColor;
      } else {
        // Default (mode == 0): Normal-mapped magenta/green gradient
        baseColor = vec3(
          n.x * 0.5 + 0.5,
          n.y * 0.5 + 0.5,
          n.z * 0.3 + 0.7
        );
        baseColor = pow(baseColor, vec3(0.8));
        baseColor *= 1.1;
      }
      
      // Apply lighting and edge darkening
      vec3 color = baseColor;
      if (textureMode != 3) {
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.7));
        float diffuse = max(dot(n, lightDir), 0.0) * 0.3 + 0.7;
        color = baseColor * diffuse;
        
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.0);
        color = mix(color, color * 0.5, fresnel * 0.3);
      } else {
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.7));
        float diffuse = max(dot(n, lightDir), 0.0) * 0.1 + 0.9;
        color = baseColor * diffuse;
      }
      
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

// ─── Trajectory Helper Interface ────────────────────────────────────────────
interface TrajectoryData {
  group: THREE.Group;
  trailLine: THREE.Line;
  marker: THREE.Mesh;
  history: THREE.Vector3[];
  maxPoints: number;
}

// ─── JellyCube Interface ────────────────────────────────────────────────────
interface JellyCube {
  physics: JellyPhysics;
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
  vertexParticleMapping: number[];
  boxHelper: THREE.Group | null;
  velocityHelper: THREE.LineSegments | null;
  stressHelper: THREE.LineSegments | null;
  trajectoryHelper: TrajectoryData | null;
  offsetX: number;
}

const cubes: JellyCube[] = [];

function createJellyCube(segments: number, size: number, offsetX: number): JellyCube {
  const physics = new JellyPhysics(segments, size);

  // Apply offset to all particles
  for (const p of physics.particles) {
    p.position.x += offsetX;
    p.restPosition.x += offsetX;
  }

  const geo = new THREE.BoxGeometry(size, size, size, segments, segments, segments);
  const count = geo.attributes.position.count;
  const speedArray = new Float32Array(count);
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speedArray, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(normalShader.uniforms),
    vertexShader: normalShader.vertexShader,
    fragmentShader: normalShader.fragmentShader,
    side: THREE.DoubleSide
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
    stressHelper: null,
    trajectoryHelper: null,
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
  if (cube.stressHelper) {
    scene.remove(cube.stressHelper);
    cube.stressHelper = null;
  }
  if (cube.trajectoryHelper) {
    scene.remove(cube.trajectoryHelper.group);
    cube.trajectoryHelper = null;
  }
}

// ─── Debug: Box Wireframe ───────────────────────────────────────────────────
function buildBoxHelper(cube: JellyCube): THREE.Group {
  const segments = cube.physics.segments;
  const group = new THREE.Group();
  const n = segments;
  const size = 2.0;
  const step = (size * 2) / n;

  const mat = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.45 });

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

// ─── Debug: Velocity Lines ──────────────────────────────────────────────────
function buildVelocityHelper(cube: JellyCube): THREE.LineSegments {
  const count = cube.physics.particles.length;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 6);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 });
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

// ─── Debug: Stress / Strain Heatmap (FEA) ───────────────────────────────────
function buildStressHelper(cube: JellyCube): THREE.LineSegments {
  const count = cube.physics.springs.length;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 6);
  const colors = new Float32Array(count * 6);

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false
  });
  return new THREE.LineSegments(geo, mat);
}

function updateStressHelper(cube: JellyCube) {
  if (!cube.stressHelper) return;
  const geo = cube.stressHelper.geometry;
  const posArray = (geo.attributes.position as THREE.BufferAttribute).array as Float32Array;
  const colArray = (geo.attributes.color as THREE.BufferAttribute).array as Float32Array;

  const springs = cube.physics.springs;
  for (let i = 0; i < springs.length; i++) {
    const s = springs[i];
    const p1 = s.p1.position;
    const p2 = s.p2.position;

    const base = i * 6;
    posArray[base] = p1.x;
    posArray[base + 1] = p1.y;
    posArray[base + 2] = p1.z;
    posArray[base + 3] = p2.x;
    posArray[base + 4] = p2.y;
    posArray[base + 5] = p2.z;

    const dist = p1.distanceTo(p2);
    const strain = (dist - s.restLength) / s.restLength;

    let r = 0.2, g = 0.9, b = 0.3;
    if (strain >= 0) {
      // Tension (Stretching) -> Red
      const t = Math.min(1.0, strain * 4.5);
      r = 0.2 + 0.8 * t;
      g = 0.9 * (1.0 - t * 0.85);
      b = 0.3 * (1.0 - t);
    } else {
      // Compression (Squishing) -> Electric Cyan / Blue
      const t = Math.min(1.0, -strain * 4.5);
      r = 0.2 * (1.0 - t);
      g = 0.9 * (1.0 - t * 0.4);
      b = 0.3 + 0.7 * t;
    }

    // Both line endpoints share stress color
    colArray[base] = r; colArray[base + 1] = g; colArray[base + 2] = b;
    colArray[base + 3] = r; colArray[base + 4] = g; colArray[base + 5] = b;
  }

  (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
}

// ─── Debug: Trajectory & Center of Mass ─────────────────────────────────────
function buildTrajectoryHelper(): TrajectoryData {
  const group = new THREE.Group();
  const maxPoints = 60;
  const positions = new Float32Array(maxPoints * 3);

  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const trailMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 });
  const trailLine = new THREE.Line(trailGeo, trailMat);

  const markerGeo = new THREE.SphereGeometry(0.18, 16, 16);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa });
  const marker = new THREE.Mesh(markerGeo, markerMat);

  const ringGeo = new THREE.RingGeometry(0.24, 0.32, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x93c5fd, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  marker.add(ring);

  group.add(trailLine);
  group.add(marker);

  return {
    group,
    trailLine,
    marker,
    history: [],
    maxPoints,
  };
}

function updateTrajectoryHelper(cube: JellyCube) {
  if (!cube.trajectoryHelper) return;
  const helper = cube.trajectoryHelper;

  // Compute center of mass
  let avgX = 0, avgY = 0, avgZ = 0;
  const particles = cube.physics.particles;
  for (const p of particles) {
    avgX += p.position.x;
    avgY += p.position.y;
    avgZ += p.position.z;
  }
  avgX /= particles.length;
  avgY /= particles.length;
  avgZ /= particles.length;

  helper.marker.position.set(avgX, avgY, avgZ);

  // Push new history point if moved
  const currentPos = new THREE.Vector3(avgX, avgY, avgZ);
  if (helper.history.length === 0 || helper.history[helper.history.length - 1].distanceTo(currentPos) > 0.04) {
    helper.history.push(currentPos);
    if (helper.history.length > helper.maxPoints) {
      helper.history.shift();
    }
  }

  // Update line buffer
  const posAttr = helper.trailLine.geometry.attributes.position as THREE.BufferAttribute;
  const array = posAttr.array as Float32Array;

  for (let i = 0; i < helper.maxPoints; i++) {
    const pt = i < helper.history.length ? helper.history[i] : currentPos;
    const base = i * 3;
    array[base] = pt.x;
    array[base + 1] = pt.y;
    array[base + 2] = pt.z;
  }
  posAttr.needsUpdate = true;
}

// ─── Cube layout ─────────────────────────────────────────────────────────────
function getCubeOffsets(count: number): number[] {
  const spacing = 5.0;
  const offsets: number[] = [];
  const totalWidth = (count - 1) * spacing;
  for (let i = 0; i < count; i++) {
    offsets.push(i * spacing - totalWidth / 2);
  }
  return offsets;
}

function rebuildAllCubes(segments: number, count: number, size: number) {
  for (const cube of cubes) {
    removeJellyCube(cube);
  }
  cubes.length = 0;

  const offsets = getCubeOffsets(count);
  for (let i = 0; i < count; i++) {
    cubes.push(createJellyCube(segments, size, offsets[i]));
  }

  updateCamera(count);
  updateBounds();
}

function updateCamera(count: number) {
  const targetY = 3.5;
  const dist = 11 + count * 2.0;
  camera.position.set(0, targetY + 1.0, dist);
  camera.lookAt(0, targetY, 0);
}

function updateBounds() {
  const aspect = window.innerWidth / window.innerHeight;
  const vFOV = (camera.fov * Math.PI) / 180;
  const targetZ = 0;
  const dist = camera.position.z - targetZ;

  const visibleHeight = 2 * Math.tan(vFOV / 2) * dist;
  const visibleWidth = visibleHeight * aspect;

  const camY = camera.position.y;
  const margin = 0.5;

  const minX = -visibleWidth / 2 + margin;
  const maxX = visibleWidth / 2 - margin;
  const minY = 0.0; // Floor at y=0
  const maxY = camY + visibleHeight / 2 - margin;

  for (const cube of cubes) {
    cube.physics.setBounds(minX, maxX, minY, maxY);
  }
}

// ─── Pointer Interaction ─────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

interface PointerDrag {
  cube: JellyCube;
  plane: THREE.Plane;
}
const activePointers: Map<number, PointerDrag> = new Map();

function screenToNDC(clientX: number, clientY: number) {
  mouse.x = (clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(clientY / window.innerHeight) * 2 + 1;
}

function onPointerDown(event: PointerEvent) {
  if (event.target instanceof HTMLElement && event.target.closest('#control-panel')) return;

  screenToNDC(event.clientX, event.clientY);
  raycaster.setFromCamera(mouse, camera);

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
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hitPoint);

    const grabRadius = 2.5;
    hitCube.physics.startDrag(event.pointerId, hitPoint, grabRadius);
    playPressSound();
    
    activePointers.set(event.pointerId, { cube: hitCube, plane });
    document.body.style.cursor = 'grabbing';
    
    renderer.domElement.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
}

function onPointerMove(event: PointerEvent) {
  const drag = activePointers.get(event.pointerId);
  if (!drag) return;

  screenToNDC(event.clientX, event.clientY);
  raycaster.setFromCamera(mouse, camera);

  const intersection = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(drag.plane, intersection)) {
    drag.cube.physics.updateDrag(event.pointerId, intersection);
  }
  event.preventDefault();
}

function onPointerUp(event: PointerEvent) {
  const drag = activePointers.get(event.pointerId);
  if (drag) {
    drag.cube.physics.endDrag(event.pointerId);
    activePointers.delete(event.pointerId);
    if (activePointers.size === 0) {
      document.body.style.cursor = 'default';
    }
    try {
      renderer.domElement.releasePointerCapture(event.pointerId);
    } catch (_) {}
  }
}

renderer.domElement.addEventListener('pointerdown', onPointerDown);
renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('pointerup', onPointerUp);
renderer.domElement.addEventListener('pointercancel', onPointerUp);

// ─── UI & HUD Integration ───────────────────────────────────────────────────
let uiState: UIState;
let currentTextureUrl: string | null = null;

// Stats HUD DOM Element
const statsHud = document.createElement('div');
statsHud.id = 'physics-stats-hud';
document.body.appendChild(statsHud);

function onUIChange(state: UIState) {
  const needsRebuild =
    state.resolution !== uiState?.resolution ||
    state.cubeCount !== uiState?.cubeCount ||
    state.cubeSize !== uiState?.cubeSize;

  if (needsRebuild) {
    rebuildAllCubes(getSegments(state.resolution), state.cubeCount, state.cubeSize);
    currentTextureUrl = 'force-reapply';
  }

  // Update texture modes and colors
  for (const cube of cubes) {
    const texModeIdx =
      state.textureMode === 'default' ? 0 :
      state.textureMode === 'rainbow' ? 1 :
      state.textureMode === 'color' ? 2 : 3;
    cube.mat.uniforms.textureMode.value = texModeIdx;
    cube.mat.uniforms.uColor.value.set(state.customColor);
    cube.mat.uniforms.showSpeedHeatmap.value = state.showSpeedHeatmap ? 1 : 0;
  }

  if (state.textureMode === 'file' && state.textureUrl !== currentTextureUrl) {
    currentTextureUrl = state.textureUrl;
    if (currentTextureUrl && currentTextureUrl !== 'force-reapply') {
      const loader = new THREE.TextureLoader();
      loader.load(currentTextureUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        for (const cube of cubes) {
          cube.mat.uniforms.tDiffuse.value = tex;
          cube.mat.uniforms.hasTexture.value = 1;
        }
      });
    } else if (!currentTextureUrl || currentTextureUrl === 'force-reapply') {
      currentTextureUrl = state.textureUrl;
      for (const cube of cubes) {
        if (!state.textureUrl) {
          cube.mat.uniforms.tDiffuse.value = null;
          cube.mat.uniforms.hasTexture.value = 0;
        } else {
          const loader = new THREE.TextureLoader();
          loader.load(state.textureUrl, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            for (const cube of cubes) {
              cube.mat.uniforms.tDiffuse.value = tex;
              cube.mat.uniforms.hasTexture.value = 1;
            }
          });
        }
      }
    }
  }

  // Update physical parameters
  for (const cube of cubes) {
    cube.physics.stiffnessMultiplier = state.elasticity;
    cube.physics.dampingMultiplier = state.friction;
    cube.physics.weightMultiplier = state.weight;
    cube.physics.pressureMultiplier = state.pressure;
    if (!state.tiltGravity) {
      cube.physics.gravity.set(0, - (state.gravity * 4), 0);
    }
  }

  // Debug: Box Helper
  for (const cube of cubes) {
    if (state.showBox && !cube.boxHelper) {
      cube.boxHelper = buildBoxHelper(cube);
      scene.add(cube.boxHelper);
    } else if (!state.showBox && cube.boxHelper) {
      scene.remove(cube.boxHelper);
      cube.boxHelper = null;
    }
  }

  // Debug: Velocity Helper
  for (const cube of cubes) {
    if (state.showVelocity && !cube.velocityHelper) {
      cube.velocityHelper = buildVelocityHelper(cube);
      scene.add(cube.velocityHelper);
    } else if (!state.showVelocity && cube.velocityHelper) {
      scene.remove(cube.velocityHelper);
      cube.velocityHelper = null;
    }
  }

  // Debug: Stress Helper
  for (const cube of cubes) {
    if (state.showStress && !cube.stressHelper) {
      cube.stressHelper = buildStressHelper(cube);
      scene.add(cube.stressHelper);
    } else if (!state.showStress && cube.stressHelper) {
      scene.remove(cube.stressHelper);
      cube.stressHelper = null;
    }
  }

  // Debug: Trajectory Helper
  for (const cube of cubes) {
    if (state.showTrajectory && !cube.trajectoryHelper) {
      cube.trajectoryHelper = buildTrajectoryHelper();
      scene.add(cube.trajectoryHelper.group);
    } else if (!state.showTrajectory && cube.trajectoryHelper) {
      scene.remove(cube.trajectoryHelper.group);
      cube.trajectoryHelper = null;
    }
  }

  // Debug: Stats HUD Toggle
  if (state.showStats) {
    statsHud.classList.add('show');
  } else {
    statsHud.classList.remove('show');
  }

  uiState = state;
}

uiState = createUI(onUIChange);

// ─── Resize & Device Orientation ─────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateBounds();
});

window.addEventListener('deviceorientation', (event) => {
  if (!uiState || !uiState.tiltGravity) return;
  
  let beta = event.beta || 0;
  let gamma = event.gamma || 0;
  
  beta = Math.max(-90, Math.min(90, beta));
  gamma = Math.max(-90, Math.min(90, gamma));

  const gravX = (gamma / 90) * 40;
  const gravY = -(beta / 90) * 40;
  
  for (const cube of cubes) {
    cube.physics.gravity.set(gravX, gravY, 0);
  }
});

// ─── Init ────────────────────────────────────────────────────────────────────
rebuildAllCubes(getSegments(uiState.resolution), 1, uiState.cubeSize);

// ─── Animation Loop ──────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let accumulator = 0;
const physicsDt = 1 / 120;

// Stats tracking
let frameCount = 0;
let lastFpsTime = performance.now();
let currentFps = 60;
let currentFrameMs = 16.6;

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const frameDt = Math.min(clock.getDelta(), 0.05);
  accumulator += frameDt;

  // FPS calculation
  frameCount++;
  if (now - lastFpsTime >= 500) {
    currentFps = Math.round((frameCount * 1000) / (now - lastFpsTime));
    currentFrameMs = (now - lastFpsTime) / frameCount;
    frameCount = 0;
    lastFpsTime = now;
  }

  // Fixed timestep physics for all cubes
  while (accumulator >= physicsDt) {
    for (const cube of cubes) {
      cube.physics.update(physicsDt);
    }
    accumulator -= physicsDt;
  }

  // Update mesh vertices and debug helpers
  for (const cube of cubes) {
    const posAttr = cube.geo.attributes.position as THREE.BufferAttribute;
    const speedAttr = cube.geo.attributes.aSpeed as THREE.BufferAttribute;
    const array = posAttr.array as Float32Array;
    const speedArray = speedAttr.array as Float32Array;
    const mapping = cube.vertexParticleMapping;
    
    for (let i = 0; i < posAttr.count; i++) {
      const p = cube.physics.particles[mapping[i]];
      const base = i * 3;
      array[base] = p.position.x;
      array[base + 1] = p.position.y;
      array[base + 2] = p.position.z;

      if (uiState.showSpeedHeatmap) {
        speedArray[i] = Math.sqrt(p.velocity.x * p.velocity.x + p.velocity.y * p.velocity.y + p.velocity.z * p.velocity.z);
      }
    }
    posAttr.needsUpdate = true;
    if (uiState.showSpeedHeatmap) speedAttr.needsUpdate = true;
    cube.geo.computeBoundingSphere();

    // Update active debug helpers
    if (uiState.showBox && cube.boxHelper) updateBoxHelper(cube);
    if (uiState.showVelocity && cube.velocityHelper) updateVelocityHelper(cube);
    if (uiState.showStress && cube.stressHelper) updateStressHelper(cube);
    if (uiState.showTrajectory && cube.trajectoryHelper) updateTrajectoryHelper(cube);
  }

  // Update Stats HUD content
  if (uiState.showStats && cubes.length > 0) {
    const primaryPhysics = cubes[0].physics;
    const particleCount = primaryPhysics.particles.length * cubes.length;
    const springCount = primaryPhysics.springs.length * cubes.length;

    // Calculate current cross-section area vs rest area
    let areaSum = 0;
    const n = primaryPhysics.segments + 1;
    for (const edge of primaryPhysics.boundaryEdges) {
      const p1 = primaryPhysics.particles[edge.i1].position;
      const p2 = primaryPhysics.particles[edge.i2].position;
      areaSum += p1.x * p2.y - p2.x * p1.y;
    }
    const currentArea = areaSum / (2.0 * n);
    const areaPct = Math.round((currentArea / primaryPhysics.restArea) * 100);

    statsHud.innerHTML = `
      <div class="stats-row"><span class="stats-label">FPS</span><span class="stats-val">${currentFps} (${currentFrameMs.toFixed(1)}ms)</span></div>
      <div class="stats-row"><span class="stats-label">Particles</span><span class="stats-val">${particleCount}</span></div>
      <div class="stats-row"><span class="stats-label">Springs</span><span class="stats-val">${springCount.toLocaleString()}</span></div>
      <div class="stats-row"><span class="stats-label">Substeps</span><span class="stats-val">${primaryPhysics.substepsPerUpdate} / update</span></div>
      <div class="stats-row"><span class="stats-label">Area Ratio</span><span class="stats-val">${areaPct}%</span></div>
    `;
  }

  renderer.render(scene, camera);
}

animate();
