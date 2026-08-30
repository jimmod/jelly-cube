import * as THREE from 'three';
import type { JellyCube, TrajectoryData } from './types';

// ─── Box Wireframe ──────────────────────────────────────────────────────────
export function buildBoxHelper(cube: JellyCube): THREE.Group {
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

export function updateBoxHelper(cube: JellyCube) {
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

// ─── Velocity Lines ─────────────────────────────────────────────────────────
export function buildVelocityHelper(cube: JellyCube): THREE.LineSegments {
  const count = cube.physics.particles.length;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 6);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 });
  return new THREE.LineSegments(geo, mat);
}

export function updateVelocityHelper(cube: JellyCube) {
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

// ─── Stress / Strain Heatmap (FEA) ──────────────────────────────────────────
export function buildStressHelper(cube: JellyCube): THREE.LineSegments {
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

export function updateStressHelper(cube: JellyCube) {
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

    colArray[base] = r; colArray[base + 1] = g; colArray[base + 2] = b;
    colArray[base + 3] = r; colArray[base + 4] = g; colArray[base + 5] = b;
  }

  (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
}

// ─── Trajectory & Center of Mass ────────────────────────────────────────────
export function buildTrajectoryHelper(): TrajectoryData {
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

export function updateTrajectoryHelper(cube: JellyCube) {
  if (!cube.trajectoryHelper) return;
  const helper = cube.trajectoryHelper;

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

  const currentPos = new THREE.Vector3(avgX, avgY, avgZ);
  if (helper.history.length === 0 || helper.history[helper.history.length - 1].distanceTo(currentPos) > 0.04) {
    helper.history.push(currentPos);
    if (helper.history.length > helper.maxPoints) {
      helper.history.shift();
    }
  }

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

// ─── Speed Heatmap Vertex Colors ────────────────────────────────────────────
export function updateSpeedHeatmap(cube: JellyCube) {
  const colAttr = cube.geo.attributes.color as THREE.BufferAttribute;
  const colArray = colAttr.array as Float32Array;
  const posAttr = cube.geo.attributes.position as THREE.BufferAttribute;
  const mapping = cube.vertexParticleMapping;

  for (let i = 0; i < posAttr.count; i++) {
    const p = cube.physics.particles[mapping[i]];
    const spd = Math.sqrt(p.velocity.x * p.velocity.x + p.velocity.y * p.velocity.y + p.velocity.z * p.velocity.z);
    const s = Math.min(1.0, spd / 15.0);

    let r = 0.08, g = 0.35, b = 0.95;
    if (s < 0.33) {
      const t = s / 0.33;
      r = 0.08 + (0.05 - 0.08) * t;
      g = 0.35 + (0.92 - 0.35) * t;
      b = 0.95 + (0.75 - 0.95) * t;
    } else if (s < 0.66) {
      const t = (s - 0.33) / 0.33;
      r = 0.05 + (0.98 - 0.05) * t;
      g = 0.92 + (0.85 - 0.92) * t;
      b = 0.75 + (0.12 - 0.75) * t;
    } else {
      const t = (s - 0.66) / 0.34;
      r = 0.98 + (1.0 - 0.98) * t;
      g = 0.85 + (0.12 - 0.85) * t;
      b = 0.12 + (0.25 - 0.12) * t;
    }

    const base = i * 3;
    colArray[base] = r;
    colArray[base + 1] = g;
    colArray[base + 2] = b;
  }
  colAttr.needsUpdate = true;
}
