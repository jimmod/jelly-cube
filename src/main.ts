import * as THREE from 'three';
import { JellyPhysics } from './physics';
import { createUI, getSegments } from './ui';
import type { UIState } from './ui';
import { playPressSound } from './audio';
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
  uniforms: {
    tDiffuse: { value: null },
    hasTexture: { value: 0 },
    textureMode: { value: 0 },
    uColor: { value: new THREE.Color() }
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform int hasTexture;
    uniform int textureMode;
    uniform vec3 uColor;
    
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec2 vUv;

    void main() {
      vec3 n = normalize(vNormal);
      vec3 baseColor;
      
      if (textureMode == 3 && hasTexture == 1) {
        // File texture
        baseColor = texture2D(tDiffuse, vUv).rgb;
      } else if (textureMode == 1) {
        // Rainbow mode (map normals to colors)
        baseColor = abs(n) * 1.2; // use absolute normals for symmetry, brightened
      } else if (textureMode == 2) {
        // Custom color
        baseColor = uColor;
      } else {
        // Default (mode == 0)
        // Map normals to vibrant magenta/green like the reference
        baseColor = vec3(
          n.x * 0.5 + 0.5,
          n.y * 0.5 + 0.5,
          n.z * 0.3 + 0.7
        );
        // Enhance saturation and vibrancy
        baseColor = pow(baseColor, vec3(0.8));
        baseColor *= 1.1;
      }
      
      // Subtle lighting
      vec3 lightDir = normalize(vec3(0.5, 1.0, 0.7));
      float diffuse = max(dot(n, lightDir), 0.0) * 0.3 + 0.7;
      vec3 color = baseColor * diffuse;
      
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

function createJellyCube(segments: number, size: number, offsetX: number): JellyCube {
  const physics = new JellyPhysics(segments, size);

  // Apply offset to all particles
  for (const p of physics.particles) {
    p.position.x += offsetX;
    p.restPosition.x += offsetX;
  }

  const geo = new THREE.BoxGeometry(size, size, size, segments, segments, segments);

  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(normalShader.uniforms),
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

function rebuildAllCubes(segments: number, count: number, size: number) {
  // Clear existing
  for (const cube of cubes) {
    removeJellyCube(cube);
  }
  cubes.length = 0;

  // Use the size from UI
  const cubeSize = size;

  // Create new cubes
  const offsets = getCubeOffsets(count);
  for (let i = 0; i < count; i++) {
    cubes.push(createJellyCube(segments, cubeSize, offsets[i]));
  }

  // Adjust camera to frame all cubes
  updateCamera(count);
  
  // Update screen bounds for collisions
  updateBounds();
  
  // Shift all cubes down to start near the bottom edge
  // The user wants the gap between the bottom of the cube and the bottom edge to be ~ cubeSize / 2
  // The bottom of the cube is currently at y = 0.5
  const targetBottomY = floor.position.y + (cubeSize / 2);
  const shiftY = targetBottomY - 0.5;
  
  for (const cube of cubes) {
    for (const p of cube.physics.particles) {
      p.position.y += shiftY;
      p.restPosition.y += shiftY; // also update rest position for correctness
    }
  }
}

function updateCamera(cubeCount: number) {
  const distance = 16 + (cubeCount - 1) * 4;
  camera.position.set(0, 4, distance);
  camera.lookAt(0, 2, 0);
  camera.updateMatrixWorld(); // Important: Update matrices before raycasting for bounds!
}

function updateBounds() {
  const boundsRaycaster = new THREE.Raycaster();
  const zPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  
  boundsRaycaster.setFromCamera(new THREE.Vector2(-1, 1), camera);
  const topLeft = new THREE.Vector3();
  boundsRaycaster.ray.intersectPlane(zPlane, topLeft);

  boundsRaycaster.setFromCamera(new THREE.Vector2(1, -1), camera);
  const bottomRight = new THREE.Vector3();
  boundsRaycaster.ray.intersectPlane(zPlane, bottomRight);
  
  // The user wants a gap between the cube's resting place and the bottom of the screen.
  // We'll set the floor boundary to be half the cube size above the screen's bottom edge.
  // (Assuming cubeSize is approximately 3.0, gap is 1.5)

  const cubeSize = uiState.cubeSize;
  const floorY = bottomRight.y + (cubeSize / 2);
  
  // Match shadow floor to the padded bottom
  floor.position.y = floorY;
  
  for (const cube of cubes) {
    cube.physics.setBounds(topLeft.x, bottomRight.x, floorY, topLeft.y);
  }
}

// ─── Interaction ─────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const _intersectPt = new THREE.Vector3();

// Track active pointers for multi-touch
const activePointers = new Map<number, { cube: JellyCube, plane: THREE.Plane }>();

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
  const active = activePointers.get(event.pointerId);
  if (!active) return;

  screenToNDC(event.clientX, event.clientY);
  raycaster.setFromCamera(mouse, camera);
  raycaster.ray.intersectPlane(active.plane, _intersectPt);

  active.cube.physics.updateDrag(event.pointerId, _intersectPt);
  event.preventDefault();
}

function onPointerUp(event: PointerEvent) {
  const active = activePointers.get(event.pointerId);
  if (active) {
    active.cube.physics.endDrag(event.pointerId);
    activePointers.delete(event.pointerId);
    
    if (activePointers.size === 0) {
      document.body.style.cursor = 'auto';
    }
    
    renderer.domElement.releasePointerCapture(event.pointerId);
  }
}

renderer.domElement.addEventListener('pointerdown', onPointerDown);
renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('pointerup', onPointerUp);
renderer.domElement.addEventListener('pointercancel', onPointerUp);

// ─── UI ──────────────────────────────────────────────────────────────────────
let uiState: UIState;
let currentCubeSize = 0; // 0 initially to force first build
let currentTextureUrl: string | null = null;

function onUIChange(state: UIState) {
  const segmentsChanged = cubes.length === 0 || getSegments(state.resolution) !== cubes[0].physics.segments;
  const countChanged = state.cubeCount !== cubes.length;
  const sizeChanged = state.cubeSize !== currentCubeSize;

  if (segmentsChanged || countChanged || sizeChanged) {
    currentCubeSize = state.cubeSize;
    // Only ever build 1 cube now as multiple cubes have no collisions
    rebuildAllCubes(getSegments(state.resolution), 1, currentCubeSize);
    // Force re-apply texture to new cubes
    currentTextureUrl = 'force-reapply';

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

  // Update Texture & Mode
  const modeMap: Record<string, number> = { 'default': 0, 'rainbow': 1, 'color': 2, 'file': 3 };
  const texModeInt = modeMap[state.textureMode] ?? 0;
  
  for (const cube of cubes) {
    cube.mat.uniforms.textureMode.value = texModeInt;
    cube.mat.uniforms.uColor.value.set(state.customColor);
  }

  if (state.textureMode === 'file' && state.textureUrl !== currentTextureUrl) {
    currentTextureUrl = state.textureUrl;
    if (currentTextureUrl && currentTextureUrl !== 'force-reapply') {
      const loader = new THREE.TextureLoader();
      loader.load(currentTextureUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace; // keep it looking right
        for (const cube of cubes) {
          cube.mat.uniforms.tDiffuse.value = tex;
          cube.mat.uniforms.hasTexture.value = 1;
        }
      });
    } else if (!currentTextureUrl || currentTextureUrl === 'force-reapply') {
      currentTextureUrl = state.textureUrl; // actually clear or reapply
      for (const cube of cubes) {
        if (!state.textureUrl) {
          cube.mat.uniforms.tDiffuse.value = null;
          cube.mat.uniforms.hasTexture.value = 0;
        } else {
          // It was a force-reapply and URL exists, we need to load it again or reuse it
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

  // Update elasticity, damping, & gravity
  for (const cube of cubes) {
    cube.physics.stiffnessMultiplier = state.elasticity;
    cube.physics.dampingMultiplier = state.damping;
    // Map 0 -> 0, 5 -> -20, 10 -> -40
    if (!state.tiltGravity) {
      cube.physics.gravity.set(0, - (state.gravity * 4), 0);
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

// ─── Resize & Device Orientation ─────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  
  // Update physics bounds and potentially rebuild if size changes drastically
  updateBounds();
});

window.addEventListener('deviceorientation', (event) => {
  if (!uiState || !uiState.tiltGravity) return;
  
  // event.beta (front-to-back in degrees, -180 to 180) -> Y gravity
  // event.gamma (left-to-right in degrees, -90 to 90) -> X gravity
  let beta = event.beta || 0;
  let gamma = event.gamma || 0;
  
  // clamp sensible angles
  beta = Math.max(-90, Math.min(90, beta));
  gamma = Math.max(-90, Math.min(90, gamma));

  // Map 90 degrees to max gravity (e.g. 40)
  const gravX = (gamma / 90) * 40;
  // Beta is usually 45-90 when holding phone naturally. Let's make 45 degrees the "neutral" y=0.
  // Actually, standard is 0 = flat on table.
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
