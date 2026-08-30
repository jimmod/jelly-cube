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

export interface SurfaceTriangle {
  i1: number;
  i2: number;
  i3: number;
}

export class JellyPhysics {
  particles: Particle[] = [];
  springs: Spring[] = [];
  surfaceTriangles: SurfaceTriangle[] = [];
  gravity: THREE.Vector3 = new THREE.Vector3(0, -20, 0);
  floorY = 0;
  globalDamping = 0.998;
  segments: number;
  size: number = 3.0;
  restVolume: number = 27.0;
  substepsPerUpdate: number;

  // Physical parameters exposed to UI
  stiffnessMultiplier = 1.0; // Elasticity: return spring stiffness
  dampingMultiplier = 1.0;   // Friction / Viscosity: damping factor
  weightMultiplier = 1.0;    // Weight / Mass: inertia scaling
  pressureMultiplier = 1.0;  // Pressure: internal air/fluid volume pressure

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
    this.restVolume = size * size * size;

    // Cap substeps at 4 for massive performance boost on mobile at High resolutions
    this.substepsPerUpdate = segments <= 3 ? 1 : segments <= 5 ? 2 : 4;
    
    // As resolution (n) increases, particle mass decreases as O(1/n^3) while spring stiffness 
    // needs to scale up, making the system highly stiff and prone to explosion at low substeps.
    if (segments >= 8) {
      this.baseStiffnessScale = 0.5; // Aggressive scale down
      this.baseDampingScale = 2.0;
    }
    this.init(segments, size);
  }

  init(segments: number, size: number) {
    this.segments = segments;
    this.size = size;
    this.restVolume = size * size * size;
    this.particles = [];
    this.springs = [];
    this.surfaceTriangles = [];

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

    // ─── Surface Triangles Generation (for 3D Volume & Internal Pressure) ──
    for (let iy = 0; iy < segments; iy++) {
      for (let ix = 0; ix < segments; ix++) {
        // Front Face (+Z, normal (0, 0, 1))
        const f00 = idx(ix, iy, n - 1);
        const f10 = idx(ix + 1, iy, n - 1);
        const f11 = idx(ix + 1, iy + 1, n - 1);
        const f01 = idx(ix, iy + 1, n - 1);
        this.surfaceTriangles.push({ i1: f00, i2: f10, i3: f11 });
        this.surfaceTriangles.push({ i1: f00, i2: f11, i3: f01 });

        // Back Face (-Z, normal (0, 0, -1))
        const b00 = idx(ix, iy, 0);
        const b10 = idx(ix + 1, iy, 0);
        const b11 = idx(ix + 1, iy + 1, 0);
        const b01 = idx(ix, iy + 1, 0);
        this.surfaceTriangles.push({ i1: b00, i2: b11, i3: b10 });
        this.surfaceTriangles.push({ i1: b00, i2: b01, i3: b11 });

        // Top Face (+Y, normal (0, 1, 0))
        const t00 = idx(ix, n - 1, iy);
        const t10 = idx(ix + 1, n - 1, iy);
        const t11 = idx(ix + 1, n - 1, iy + 1);
        const t01 = idx(ix, n - 1, iy + 1);
        this.surfaceTriangles.push({ i1: t00, i2: t11, i3: t10 });
        this.surfaceTriangles.push({ i1: t00, i2: t01, i3: t11 });

        // Bottom Face (-Y, normal (0, -1, 0))
        const bot00 = idx(ix, 0, iy);
        const bot10 = idx(ix + 1, 0, iy);
        const bot11 = idx(ix + 1, 0, iy + 1);
        const bot01 = idx(ix, 0, iy + 1);
        this.surfaceTriangles.push({ i1: bot00, i2: bot10, i3: bot11 });
        this.surfaceTriangles.push({ i1: bot00, i2: bot11, i3: bot01 });

        // Right Face (+X, normal (1, 0, 0))
        const r00 = idx(n - 1, ix, iy);
        const r10 = idx(n - 1, ix, iy + 1);
        const r11 = idx(n - 1, ix + 1, iy + 1);
        const r01 = idx(n - 1, ix + 1, iy);
        this.surfaceTriangles.push({ i1: r00, i2: r11, i3: r10 });
        this.surfaceTriangles.push({ i1: r00, i2: r01, i3: r11 });

        // Left Face (-X, normal (-1, 0, 0))
        const l00 = idx(0, ix, iy);
        const l10 = idx(0, ix, iy + 1);
        const l11 = idx(0, ix + 1, iy + 1);
        const l01 = idx(0, ix + 1, iy);
        this.surfaceTriangles.push({ i1: l00, i2: l10, i3: l11 });
        this.surfaceTriangles.push({ i1: l00, i2: l11, i3: l01 });
      }
    }

    // Spring stiffness: scale inversely with segments so material properties
    // remain consistent across different resolutions. (Area / Length = 1/N)
    // Base values calibrated for Medium (segments=5).
    const stiffness = 300 * (5 / segments);
    const damping = 5 * (5 / segments);

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
    // Dynamically increase substeps if the jelly is very stiff (like the Jello preset)
    // to prevent numerical oscillation at high resolutions.
    let currentSubsteps = this.substepsPerUpdate;
    if (this.segments >= 8 && this.stiffnessMultiplier > 1.2) {
      currentSubsteps = 6;
    }

    // Subdivide the timestep for stability at high resolutions
    const subDt = dt / currentSubsteps;

    for (let sub = 0; sub < currentSubsteps; sub++) {
      this._substep(subDt);
    }
  }

  private _substep(dt: number) {
    const weightMul = Math.max(0.1, this.weightMultiplier);

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

      // Non-Newtonian shear-thickening for Slime / dense fluids:
      // High relative speed (sudden pressure/impact) causes molecules to lock, increasing resistance
      const relSpeedSq = rvx * rvx + rvy * rvy + rvz * rvz;
      const shearThickening = 1.0 + Math.min(relSpeedSq * 0.04, 3.0);

      const baseStiff = s.stiffness * (this.stiffnessMultiplier * this.baseStiffnessScale);
      const baseDamp = s.damping * (this.dampingMultiplier * this.baseDampingScale);

      const effStiff = baseStiff * (1.0 + Math.min(relSpeedSq * 0.015, 1.5));
      const effDamp = baseDamp * shearThickening;

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

    // ─── 3D Soft-Body Volume & Pressure Simulation ───────────────────
    if (this.pressureMultiplier > 0.01 && this.surfaceTriangles.length > 0) {
      // 1. Calculate signed volume using Gauss' divergence theorem
      let volumeSum = 0;
      for (const tri of this.surfaceTriangles) {
        const p1 = this.particles[tri.i1].position;
        const p2 = this.particles[tri.i2].position;
        const p3 = this.particles[tri.i3].position;

        // Scalar triple product: p1 . (p2 x p3)
        const crossX = p2.y * p3.z - p2.z * p3.y;
        const crossY = p2.z * p3.x - p2.x * p3.z;
        const crossZ = p2.x * p3.y - p2.y * p3.x;
        volumeSum += p1.x * crossX + p1.y * crossY + p1.z * crossZ;
      }
      const currentVolume = Math.max(Math.abs(volumeSum) / 6.0, this.restVolume * 0.1);

      // 2. Compute pressure based on ideal volume conservation and inflation setting
      // Pressure scales inversely with volume (P ~ V0 / V)
      const volumeRatio = this.restVolume / currentVolume;
      const kPressure = 80.0 * (5.0 / this.segments) * this.pressureMultiplier;
      const pressureMagnitude = kPressure * (volumeRatio - 0.2);

      // 3. Apply outward normal pressure forces to surface faces
      for (const tri of this.surfaceTriangles) {
        const p1 = this.particles[tri.i1];
        const p2 = this.particles[tri.i2];
        const p3 = this.particles[tri.i3];

        const e12x = p2.position.x - p1.position.x;
        const e12y = p2.position.y - p1.position.y;
        const e12z = p2.position.z - p1.position.z;

        const e13x = p3.position.x - p1.position.x;
        const e13y = p3.position.y - p1.position.y;
        const e13z = p3.position.z - p1.position.z;

        // Normal vector with magnitude equal to 2x triangle area
        const normX = e12y * e13z - e12z * e13y;
        const normY = e12z * e13x - e12x * e13z;
        const normZ = e12x * e13y - e12y * e13x;

        // Force on triangle = Pressure * AreaNormal = Pressure * 0.5 * crossProduct
        // Each of the 3 vertices receives 1/3 of the triangle force = (1/6) * Pressure * crossProduct
        const forceFactor = (pressureMagnitude / 6.0);
        const fx = normX * forceFactor;
        const fy = normY * forceFactor;
        const fz = normZ * forceFactor;

        p1.force.x += fx;
        p1.force.y += fy;
        p1.force.z += fz;

        p2.force.x += fx;
        p2.force.y += fy;
        p2.force.z += fz;

        p3.force.x += fx;
        p3.force.y += fy;
        p3.force.z += fz;
      }
    }

    // Drag: position-based — directly move grabbed particles toward target
    // Scale strength inversely with substeps so total impulse per frame is consistent
    if (this.activeDrags.size > 0) {
      const baseStrength = 500 / this.substepsPerUpdate;
      const dampFactor = this.substepsPerUpdate <= 2 ? 0.88 : 0.80;

      for (const drag of this.activeDrags.values()) {
        for (const info of drag.particles) {
          const p = this.particles[info.particleIndex];

          // Target position for this particle = dragTarget + original offset * (1-weight)
          const lerpW = info.weight;
          const targetX = drag.target.x + info.offset.x * (1 - lerpW);
          const targetY = drag.target.y + info.offset.y * (1 - lerpW);
          const targetZ = drag.target.z + info.offset.z * (1 - lerpW);

          const strength = baseStrength * info.weight;
          p.force.x += (targetX - p.position.x) * strength;
          p.force.y += (targetY - p.position.y) * strength;
          p.force.z += (targetZ - p.position.z) * strength;

          // Damping on dragged particles — stronger for more substeps
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
