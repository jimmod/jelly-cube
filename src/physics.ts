import * as THREE from 'three';
import { playBounceSound } from './audio';

export class Particle {
  mass: number;
  position: THREE.Vector3;
  prevPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  force: THREE.Vector3;
  invMass: number;
  restPosition: THREE.Vector3;
  initialZ: number;

  constructor(x: number, y: number, z: number, mass: number = 1.0) {
    this.mass = mass;
    this.invMass = mass > 0 ? 1.0 / mass : 0;
    this.position = new THREE.Vector3(x, y, z);
    this.prevPosition = new THREE.Vector3(x, y, z);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.force = new THREE.Vector3(0, 0, 0);
    this.restPosition = new THREE.Vector3(x, y, z);
    this.initialZ = z;
  }
}

export class Spring {
  p1: Particle;
  p2: Particle;
  restLength: number;
  stiffness: number;
  damping: number;

  constructor(p1: Particle, p2: Particle, stiffness: number, damping: number) {
    this.p1 = p1;
    this.p2 = p2;
    this.restLength = p1.position.distanceTo(p2.position);
    this.stiffness = stiffness;
    this.damping = damping;
  }

  applyForce(stiffnessMultiplier = 1.0, dampingMultiplier = 1.0) {
    const dx = this.p2.position.x - this.p1.position.x;
    const dy = this.p2.position.y - this.p1.position.y;
    const dz = this.p2.position.z - this.p1.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 1e-8) return;

    const stretch = dist - this.restLength;
    const forceMag = (this.stiffness * stiffnessMultiplier) * stretch;

    const invDist = 1.0 / dist;
    const dirX = dx * invDist;
    const dirY = dy * invDist;
    const dirZ = dz * invDist;

    // Damping along spring axis
    const rvx = this.p2.velocity.x - this.p1.velocity.x;
    const rvy = this.p2.velocity.y - this.p1.velocity.y;
    const rvz = this.p2.velocity.z - this.p1.velocity.z;
    const dampF = (rvx * dirX + rvy * dirY + rvz * dirZ) * (this.damping * dampingMultiplier);

    const fx = dirX * (forceMag + dampF);
    const fy = dirY * (forceMag + dampF);
    const fz = dirZ * (forceMag + dampF);

    this.p1.force.x += fx;
    this.p1.force.y += fy;
    this.p1.force.z += fz;

    this.p2.force.x -= fx;
    this.p2.force.y -= fy;
    this.p2.force.z -= fz;
  }
}

export interface DragInfo {
  particleIndex: number;
  weight: number;
  offset: THREE.Vector3; // offset from drag center at time of grab
}

export interface BoundaryEdge {
  i1: number;
  i2: number;
}

export class JellyPhysics {
  particles: Particle[] = [];
  springs: Spring[] = [];
  boundaryEdges: BoundaryEdge[] = [];
  gravity: THREE.Vector3 = new THREE.Vector3(0, -20, 0);
  floorY = 0;
  globalDamping = 0.998;
  segments: number;
  size: number = 3.0;
  restArea: number = 9.0;
  substepsPerUpdate: number;

  // Physical parameters exposed to UI
  stiffnessMultiplier = 1.5; // Elasticity: return spring stiffness
  dampingMultiplier = 0.3;   // Friction / Viscosity: damping factor
  weightMultiplier = 1.0;    // Weight / Mass: inertia scaling
  pressureMultiplier = 0.8;  // Pressure: internal volume/area conservation

  // Internal multipliers to keep high resolutions stable at low substeps
  private baseStiffnessScale = 1.0;
  private baseDampingScale = 1.0;

  // Drag state - support multiple touches via Pointer Events
  activeDrags: Map<number, { target: THREE.Vector3, particles: DragInfo[] }> = new Map();

  // Screen bounds
  bounds = { minX: -10, maxX: 10, minY: 0, maxY: 10, minZ: -10, maxZ: 10 };

  constructor(segments: number, size: number) {
    this.segments = segments;
    this.size = size;
    this.restArea = size * size;

    this.substepsPerUpdate = segments <= 3 ? 2 : segments <= 5 ? 4 : 6;
    
    if (segments >= 8) {
      this.baseStiffnessScale = 0.5;
      this.baseDampingScale = 1.8;
    }
    this.init(segments, size);
  }

  init(segments: number, size: number) {
    this.segments = segments;
    this.size = size;
    this.restArea = size * size;
    this.particles = [];
    this.springs = [];
    this.boundaryEdges = [];

    const n = segments + 1;
    const halfSize = size / 2.0;
    const step = size / segments;

    // Calculate particle mass to keep total mass constant across resolutions
    const totalMass = 64.0; // Base mass from low res (4^3 * 1.0)
    const particleMass = totalMass / (n * n * n);

    // Create particles
    for (let iz = 0; iz < n; iz++) {
      for (let iy = 0; iy < n; iy++) {
        for (let ix = 0; ix < n; ix++) {
          const px = ix * step - halfSize;
          const py = iy * step + 0.5; // bottom of cube at y=0.5 (just above floor)
          const pz = iz * step - halfSize;
          this.particles.push(new Particle(px, py, pz, particleMass));
        }
      }
    }

    // Index helper
    const idx = (x: number, y: number, z: number) => z * n * n + y * n + x;

    // ─── 2D Perimeter Boundary Loop Generation (for XY Volume/Pressure) ──
    for (let iz = 0; iz < n; iz++) {
      // 1. Bottom edge (left to right): (ix, 0) -> (ix+1, 0), outward normal (0, -1)
      for (let ix = 0; ix < segments; ix++) {
        this.boundaryEdges.push({ i1: idx(ix, 0, iz), i2: idx(ix + 1, 0, iz) });
      }
      // 2. Right edge (bottom to top): (n-1, iy) -> (n-1, iy+1), outward normal (1, 0)
      for (let iy = 0; iy < segments; iy++) {
        this.boundaryEdges.push({ i1: idx(n - 1, iy, iz), i2: idx(n - 1, iy + 1, iz) });
      }
      // 3. Top edge (right to left): (ix+1, n-1) -> (ix, n-1), outward normal (0, 1)
      for (let ix = segments - 1; ix >= 0; ix--) {
        this.boundaryEdges.push({ i1: idx(ix + 1, n - 1, iz), i2: idx(ix, n - 1, iz) });
      }
      // 4. Left edge (top to bottom): (0, iy+1) -> (0, iy), outward normal (-1, 0)
      for (let iy = segments - 1; iy >= 0; iy--) {
        this.boundaryEdges.push({ i1: idx(0, iy + 1, iz), i2: idx(0, iy, iz) });
      }
    }

    // Spring stiffness: scale inversely with segments so material properties
    // remain consistent across different resolutions.
    const stiffness = 280 * (5 / segments);
    const damping = 4.5 * (5 / segments);

    // Create springs — structural, shear, and bend
    for (let iz = 0; iz < n; iz++) {
      for (let iy = 0; iy < n; iy++) {
        for (let ix = 0; ix < n; ix++) {
          const p1 = this.particles[idx(ix, iy, iz)];

          // Structural + Shear (26 neighbors)
          for (let dz = -1; dz <= 1; dz++) {
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0 && dz === 0) continue;
                if (dz < 0) continue;
                if (dz === 0 && dy < 0) continue;
                if (dz === 0 && dy === 0 && dx < 0) continue;

                const nx = ix + dx;
                const ny = iy + dy;
                const nz = iz + dz;

                if (nx >= 0 && nx < n && ny >= 0 && ny < n && nz >= 0 && nz < n) {
                  const p2 = this.particles[idx(nx, ny, nz)];
                  const diagDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                  // Diagonal springs are weaker proportionally
                  this.springs.push(new Spring(p1, p2, stiffness / diagDist, damping));
                }
              }
            }
          }

          // Bend springs (skip 1 node for resistance to bending)
          for (const [dx, dy, dz] of [[2,0,0],[0,2,0],[0,0,2]]) {
            const nx = ix + dx;
            const ny = iy + dy;
            const nz = iz + dz;
            if (nx < n && ny < n && nz < n) {
              const p2 = this.particles[idx(nx, ny, nz)];
              this.springs.push(new Spring(p1, p2, stiffness * 0.3, damping * 0.5));
            }
          }
        }
      }
    }
  }

  startDrag(pointerId: number, hitPoint: THREE.Vector3, radius: number) {
    const dragParticles: DragInfo[] = [];
    const dragTarget = hitPoint.clone();

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const dist = p.position.distanceTo(hitPoint);
      if (dist < radius) {
        const t = dist / radius;
        // Smooth falloff: cubic hermite
        const weight = 1.0 - t * t * (3 - 2 * t);
        dragParticles.push({
          particleIndex: i,
          weight,
          offset: new THREE.Vector3().subVectors(p.position, hitPoint),
        });
      }
    }

    // Fallback: grab closest
    if (dragParticles.length === 0) {
      let minDist = Infinity;
      let closestIdx = 0;
      for (let i = 0; i < this.particles.length; i++) {
        const d = this.particles[i].position.distanceTo(hitPoint);
        if (d < minDist) {
          minDist = d;
          closestIdx = i;
        }
      }
      dragParticles.push({
        particleIndex: closestIdx,
        weight: 1.0,
        offset: new THREE.Vector3().subVectors(this.particles[closestIdx].position, hitPoint),
      });
    }

    this.activeDrags.set(pointerId, { target: dragTarget, particles: dragParticles });
  }

  updateDrag(pointerId: number, target: THREE.Vector3) {
    const drag = this.activeDrags.get(pointerId);
    if (drag) {
      drag.target.copy(target);
    }
  }

  endDrag(pointerId: number) {
    this.activeDrags.delete(pointerId);
  }

  setBounds(minX: number, maxX: number, minY: number, maxY: number) {
    this.bounds = { ...this.bounds, minX, maxX, minY, maxY };
  }

  update(dt: number) {
    const weightMul = Math.max(0.1, this.weightMultiplier);
    const effectiveStiffnessRatio = this.stiffnessMultiplier / weightMul;

    let currentSubsteps = this.substepsPerUpdate;
    if (effectiveStiffnessRatio > 2.5 || this.segments >= 8) {
      currentSubsteps = Math.max(currentSubsteps, 4);
    }
    if (effectiveStiffnessRatio > 5.0) {
      currentSubsteps = Math.max(currentSubsteps, 6);
    }

    const subDt = dt / currentSubsteps;

    for (let sub = 0; sub < currentSubsteps; sub++) {
      this._substep(subDt);
    }
  }

  private _substep(dt: number) {
    const weightMul = Math.max(0.1, this.weightMultiplier);
    const n = this.segments + 1;

    // Reset forces, apply gravity scaled by particle mass and weightMultiplier
    for (const p of this.particles) {
      const pMass = p.mass * weightMul;
      p.force.x = this.gravity.x * pMass;
      p.force.y = this.gravity.y * pMass;
      p.force.z = this.gravity.z * pMass;
    }

    // ─── Spring forces & Non-Newtonian Strain Rate Viscosity ───────
    for (const s of this.springs) {
      const dx = s.p2.position.x - s.p1.position.x;
      const dy = s.p2.position.y - s.p1.position.y;
      const dz = s.p2.position.z - s.p1.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 1e-8) continue;

      const stretch = dist - s.restLength;
      const invDist = 1.0 / dist;
      const dirX = dx * invDist;
      const dirY = dy * invDist;
      const dirZ = dz * invDist;

      const rvx = s.p2.velocity.x - s.p1.velocity.x;
      const rvy = s.p2.velocity.y - s.p1.velocity.y;
      const rvz = s.p2.velocity.z - s.p1.velocity.z;
      const relSpeedAlongDir = rvx * dirX + rvy * dirY + rvz * dirZ;

      // Non-Newtonian shear-thickening
      const relSpeedSq = rvx * rvx + rvy * rvy + rvz * rvz;
      const shearThickening = 1.0 + Math.min(relSpeedSq * 0.04, 2.5);

      const baseStiff = s.stiffness * (this.stiffnessMultiplier * this.baseStiffnessScale);
      const baseDamp = s.damping * (this.dampingMultiplier * this.baseDampingScale);

      const effStiff = baseStiff * (1.0 + Math.min(relSpeedSq * 0.01, 1.2));
      const effDamp = Math.min(baseDamp * shearThickening, 25.0);

      const forceMag = effStiff * stretch;
      const dampF = relSpeedAlongDir * effDamp;

      const fx = dirX * (forceMag + dampF);
      const fy = dirY * (forceMag + dampF);
      const fz = dirZ * (forceMag + dampF);

      s.p1.force.x += fx;
      s.p1.force.y += fy;
      s.p1.force.z += fz;

      s.p2.force.x -= fx;
      s.p2.force.y -= fy;
      s.p2.force.z -= fz;
    }

    // ─── 2D Perimeter Volume & Internal Pressure Simulation ────────
    if (Math.abs(this.pressureMultiplier) > 0.01 && this.boundaryEdges.length > 0) {
      // 1. Calculate signed 2D area across all Z layers
      let areaSum = 0;
      for (const edge of this.boundaryEdges) {
        const p1 = this.particles[edge.i1].position;
        const p2 = this.particles[edge.i2].position;
        areaSum += p1.x * p2.y - p2.x * p1.y;
      }
      const currentArea = areaSum / (2.0 * n);

      // 2. Linear Hookean area strain (bounded, completely singularity-free)
      const areaStrain = Math.max(-1.5, Math.min(1.5, (this.restArea - currentArea) / this.restArea));
      const kPressure = 90.0 * (5.0 / this.segments);

      let pressureVal = 0;
      if (this.pressureMultiplier >= 0) {
        pressureVal = this.pressureMultiplier * kPressure * areaStrain;
      } else {
        // Negative / Vacuum pressure for Crushed collapse
        pressureVal = this.pressureMultiplier * kPressure * 1.5;
      }

      // 3. Apply outward normal forces on boundary edges
      for (const edge of this.boundaryEdges) {
        const p1 = this.particles[edge.i1];
        const p2 = this.particles[edge.i2];

        const dx = p2.position.x - p1.position.x;
        const dy = p2.position.y - p1.position.y;

        // Outward normal in counter-clockwise winding: (dy, -dx)
        const fx = dy * pressureVal * 0.5;
        const fy = -dx * pressureVal * 0.5;

        p1.force.x += fx;
        p1.force.y += fy;

        p2.force.x += fx;
        p2.force.y += fy;
      }

      // 4. Central gravitational suction for Crushed preset
      if (this.pressureMultiplier < -0.1) {
        let avgX = 0, avgY = 0;
        for (const p of this.particles) {
          avgX += p.position.x;
          avgY += p.position.y;
        }
        avgX /= this.particles.length;
        avgY /= this.particles.length;

        const suction = -this.pressureMultiplier * 350.0;
        for (const p of this.particles) {
          p.force.x += (avgX - p.position.x) * suction;
          p.force.y += (avgY - p.position.y) * suction;
        }
      }
    }

    // Drag: Direct, responsive interactive drag force
    if (this.activeDrags.size > 0) {
      const baseStrength = 1800.0 / this.substepsPerUpdate;
      const dampFactor = this.substepsPerUpdate <= 2 ? 0.88 : 0.80;

      for (const drag of this.activeDrags.values()) {
        for (const info of drag.particles) {
          const p = this.particles[info.particleIndex];
          const pMass = p.mass * weightMul;

          const lerpW = info.weight;
          const targetX = drag.target.x + info.offset.x * (1 - lerpW);
          const targetY = drag.target.y + info.offset.y * (1 - lerpW);
          const targetZ = drag.target.z + info.offset.z * (1 - lerpW);

          // Force scales with mass so all materials accelerate at the same target rate toward pointer
          const strength = baseStrength * info.weight * pMass * 15.0;
          p.force.x += (targetX - p.position.x) * strength;
          p.force.y += (targetY - p.position.y) * strength;
          p.force.z += (targetZ - p.position.z) * strength;

          p.velocity.x *= dampFactor;
          p.velocity.y *= dampFactor;
          p.velocity.z *= dampFactor;
        }
      }
    }

    // Semi-implicit Euler integration
    const maxSpeed = 40; // velocity clamp to prevent flyaway
    for (const p of this.particles) {
      const invMass = (1.0 / (p.mass * weightMul));
      const ax = p.force.x * invMass;
      const ay = p.force.y * invMass;
      const az = p.force.z * invMass;

      p.velocity.x = (p.velocity.x + ax * dt) * this.globalDamping;
      p.velocity.y = (p.velocity.y + ay * dt) * this.globalDamping;
      p.velocity.z = (p.velocity.z + az * dt) * this.globalDamping;

      // Clamp velocity to prevent instability
      const speed = Math.sqrt(p.velocity.x * p.velocity.x + p.velocity.y * p.velocity.y + p.velocity.z * p.velocity.z);
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        p.velocity.x *= scale;
        p.velocity.y *= scale;
        p.velocity.z *= scale;
      }

      p.prevPosition.copy(p.position);

      p.position.x += p.velocity.x * dt;
      p.position.y += p.velocity.y * dt;
      p.position.z += p.velocity.z * dt;
      
      // Enforce pure 2D movement by locking Z
      p.position.z = p.initialZ;
      p.velocity.z = 0;
      p.force.z = 0;

      // Screen boundary collisions
      const restitution = 0.5; // bounce factor
      const friction = 0.8; // slide friction

      // Floor (minY)
      if (p.position.y < this.bounds.minY) {
        p.position.y = this.bounds.minY;
        if (p.velocity.y < 0) {
          if (p.velocity.y < -2) playBounceSound(-p.velocity.y);
          p.velocity.y *= -restitution;
        }
        p.velocity.x *= friction;
        p.velocity.z *= friction;
      }
      // Ceiling (maxY)
      else if (p.position.y > this.bounds.maxY) {
        p.position.y = this.bounds.maxY;
        if (p.velocity.y > 0) {
          if (p.velocity.y > 2) playBounceSound(p.velocity.y);
          p.velocity.y *= -restitution;
        }
        p.velocity.x *= friction;
        p.velocity.z *= friction;
      }

      // Left Wall (minX)
      if (p.position.x < this.bounds.minX) {
        p.position.x = this.bounds.minX;
        if (p.velocity.x < 0) {
          if (p.velocity.x < -2) playBounceSound(-p.velocity.x);
          p.velocity.x *= -restitution;
        }
        p.velocity.x *= friction;
        p.velocity.z *= friction;
      }
      // Right Wall (maxX)
      else if (p.position.x > this.bounds.maxX) {
        p.position.x = this.bounds.maxX;
        if (p.velocity.x > 0) {
          if (p.velocity.x > 2) playBounceSound(p.velocity.x);
          p.velocity.x *= -restitution;
        }
        p.velocity.x *= friction;
        p.velocity.z *= friction;
      }
    }
  }
}
