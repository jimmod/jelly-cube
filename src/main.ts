import './style.css';
import * as THREE from 'three';
import { JellyPhysics } from './physics';
import { createUI } from './ui';
import { getSegments, DEFAULT_UI_STATE, CUBE_SPACING, PHYSICS_DT } from './config';
import { scene, camera, renderer, updateCamera, getVisibleBounds, handleResize } from './scene';
import { createCubeMaterial, setFileTexture } from './materials';
import {
  buildBoxHelper, updateBoxHelper,
  buildVelocityHelper, updateVelocityHelper,
  buildStressHelper, updateStressHelper,
  buildTrajectoryHelper, updateTrajectoryHelper,
  updateSpeedHeatmap,
} from './debug-helpers';
import { setupPointerInteraction } from './interaction';
import type { UIState, JellyCube } from './types';

// ─── Cube Management ────────────────────────────────────────────────────────
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
  const colorArray = new Float32Array(count * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));

  const mat = createCubeMaterial(uiState || DEFAULT_UI_STATE);

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

  // Initialize vertex positions to starting particle positions
  const array = posAttr.array as Float32Array;
  for (let i = 0; i < posAttr.count; i++) {
    const p = physics.particles[vertexParticleMapping[i]];
    const base = i * 3;
    array[base] = p.position.x;
    array[base + 1] = p.position.y;
    array[base + 2] = p.position.z;
  }
  posAttr.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

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

// ─── Layout & Bounds ────────────────────────────────────────────────────────
function getCubeOffsets(count: number): number[] {
  const offsets: number[] = [];
  const totalWidth = (count - 1) * CUBE_SPACING;
  for (let i = 0; i < count; i++) {
    offsets.push(i * CUBE_SPACING - totalWidth / 2);
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

  // Re-setup pointer interaction with new cubes array
  cleanupPointers();
  cleanupPointers = setupPointerInteraction(cubes);
}

function updateBounds() {
  const bounds = getVisibleBounds();
  for (const cube of cubes) {
    cube.physics.setBounds(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
  }
}

// ─── Pointer Interaction ────────────────────────────────────────────────────
let cleanupPointers = setupPointerInteraction(cubes);

// ─── UI & HUD Integration ──────────────────────────────────────────────────
let uiState: UIState;
let currentTextureUrl: string | null = null;

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

  // Handle custom image texture loading
  if (state.textureMode === 'file' && state.textureUrl !== currentTextureUrl) {
    currentTextureUrl = state.textureUrl;
    if (currentTextureUrl && currentTextureUrl !== 'force-reapply') {
      const loader = new THREE.TextureLoader();
      loader.load(currentTextureUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        setFileTexture(tex);
        for (const cube of cubes) {
          const mat = createCubeMaterial(state);
          cube.mesh.material = mat;
          cube.mat = mat;
        }
      });
    }
  }

  // Update materials for all cubes
  for (const cube of cubes) {
    const mat = createCubeMaterial(state);
    cube.mesh.material = mat;
    cube.mat = mat;
  }

  // Update physical parameters
  for (const cube of cubes) {
    cube.physics.stiffnessMultiplier = state.elasticity;
    cube.physics.dampingMultiplier = state.friction;
    cube.physics.weightMultiplier = state.weight;
    cube.physics.pressureMultiplier = state.pressure;
    if (!state.tiltGravity) {
      cube.physics.gravity.set(0, -(state.gravity * 4), 0);
    }
  }

  // Debug helpers: Box
  for (const cube of cubes) {
    if (state.showBox && !cube.boxHelper) {
      cube.boxHelper = buildBoxHelper(cube);
      scene.add(cube.boxHelper);
    } else if (!state.showBox && cube.boxHelper) {
      scene.remove(cube.boxHelper);
      cube.boxHelper = null;
    }
  }

  // Debug helpers: Velocity
  for (const cube of cubes) {
    if (state.showVelocity && !cube.velocityHelper) {
      cube.velocityHelper = buildVelocityHelper(cube);
      scene.add(cube.velocityHelper);
    } else if (!state.showVelocity && cube.velocityHelper) {
      scene.remove(cube.velocityHelper);
      cube.velocityHelper = null;
    }
  }

  // Debug helpers: Stress
  for (const cube of cubes) {
    if (state.showStress && !cube.stressHelper) {
      cube.stressHelper = buildStressHelper(cube);
      scene.add(cube.stressHelper);
    } else if (!state.showStress && cube.stressHelper) {
      scene.remove(cube.stressHelper);
      cube.stressHelper = null;
    }
  }

  // Debug helpers: Trajectory
  for (const cube of cubes) {
    if (state.showTrajectory && !cube.trajectoryHelper) {
      cube.trajectoryHelper = buildTrajectoryHelper();
      scene.add(cube.trajectoryHelper.group);
    } else if (!state.showTrajectory && cube.trajectoryHelper) {
      scene.remove(cube.trajectoryHelper.group);
      cube.trajectoryHelper = null;
    }
  }

  // Stats HUD
  if (state.showStats) {
    statsHud.classList.add('show');
  } else {
    statsHud.classList.remove('show');
  }

  uiState = state;
}

uiState = createUI(onUIChange);

// ─── Resize & Device Orientation ────────────────────────────────────────────
handleResize(updateBounds);

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

// ─── Init ───────────────────────────────────────────────────────────────────
rebuildAllCubes(getSegments(uiState.resolution), 1, uiState.cubeSize);
onUIChange(uiState);

// ─── Animation Loop ─────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let accumulator = 0;

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

  // Fixed timestep physics
  while (accumulator >= PHYSICS_DT) {
    for (const cube of cubes) {
      cube.physics.update(PHYSICS_DT);
    }
    accumulator -= PHYSICS_DT;
  }

  // Sync mesh vertices & debug helpers
  for (const cube of cubes) {
    const posAttr = cube.geo.attributes.position as THREE.BufferAttribute;
    const array = posAttr.array as Float32Array;
    const mapping = cube.vertexParticleMapping;

    for (let i = 0; i < posAttr.count; i++) {
      const p = cube.physics.particles[mapping[i]];
      const base = i * 3;
      array[base] = p.position.x;
      array[base + 1] = p.position.y;
      array[base + 2] = p.position.z;
    }
    posAttr.needsUpdate = true;

    if (uiState.showSpeedHeatmap) {
      updateSpeedHeatmap(cube);
    }

    cube.geo.computeVertexNormals();
    cube.geo.computeBoundingSphere();

    if (uiState.showBox && cube.boxHelper) updateBoxHelper(cube);
    if (uiState.showVelocity && cube.velocityHelper) updateVelocityHelper(cube);
    if (uiState.showStress && cube.stressHelper) updateStressHelper(cube);
    if (uiState.showTrajectory && cube.trajectoryHelper) updateTrajectoryHelper(cube);
  }

  // Stats HUD
  if (uiState.showStats && cubes.length > 0) {
    const primaryPhysics = cubes[0].physics;
    const particleCount = primaryPhysics.particles.length * cubes.length;
    const springCount = primaryPhysics.springs.length * cubes.length;

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
