import * as THREE from 'three';

export class Particle {
  mass: number;
  position: THREE.Vector3;
  prevPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  force: THREE.Vector3;
  invMass: number;
  restPosition: THREE.Vector3;

  constructor(x: number, y: number, z: number, mass: number = 1.0) {
    this.mass = mass;
    this.invMass = mass > 0 ? 1.0 / mass : 0;
    this.position = new THREE.Vector3(x, y, z);
    this.prevPosition = new THREE.Vector3(x, y, z);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.force = new THREE.Vector3(0, 0, 0);
    this.restPosition = new THREE.Vector3(x, y, z);
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

  applyForce() {
    const dx = this.p2.position.x - this.p1.position.x;
    const dy = this.p2.position.y - this.p1.position.y;
    const dz = this.p2.position.z - this.p1.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 1e-8) return;

    const stretch = dist - this.restLength;
    const forceMag = this.stiffness * stretch;

    const invDist = 1.0 / dist;
    const dirX = dx * invDist;
    const dirY = dy * invDist;
    const dirZ = dz * invDist;

    // Damping along spring axis
    const rvx = this.p2.velocity.x - this.p1.velocity.x;
    const rvy = this.p2.velocity.y - this.p1.velocity.y;
    const rvz = this.p2.velocity.z - this.p1.velocity.z;
    const dampF = (rvx * dirX + rvy * dirY + rvz * dirZ) * this.damping;

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

export class JellyPhysics {
  particles: Particle[] = [];
  springs: Spring[] = [];
  gravity: THREE.Vector3 = new THREE.Vector3(0, -20, 0);
  floorY = 0;
  globalDamping = 0.998;
  segments: number;
  substepsPerUpdate: number;
  stiffnessMultiplier = 1.0; // Elasticity: scales all spring stiffness at runtime

  // Drag state - support multiple touches via Pointer Events
  activeDrags: Map<number, { target: THREE.Vector3, particles: DragInfo[] }> = new Map();

  // Screen bounds
  bounds = { minX: -10, maxX: 10, minY: 0, maxY: 10, minZ: -10, maxZ: 10 };

  constructor(segments: number, size: number) {
    this.segments = segments;
    // Calculate appropriate substepping for stability
    this.substepsPerUpdate = segments <= 3 ? 1 : segments <= 5 ? 2 : segments <= 8 ? 4 : 8;
    this.init(segments, size);
  }

  init(segments: number, size: number) {
    this.segments = segments;
    this.particles = [];
    this.springs = [];

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
    // Subdivide the timestep for stability at high resolutions
    const subDt = dt / this.substepsPerUpdate;

    for (let sub = 0; sub < this.substepsPerUpdate; sub++) {
      this._substep(subDt);
    }
  }

  private _substep(dt: number) {
    // Reset forces, apply gravity
    for (const p of this.particles) {
      p.force.x = this.gravity.x * p.mass;
      p.force.y = this.gravity.y * p.mass;
      p.force.z = this.gravity.z * p.mass;
    }

    // Spring forces
    for (const s of this.springs) {
      const dx = s.p2.position.x - s.p1.position.x;
      const dy = s.p2.position.y - s.p1.position.y;
      const dz = s.p2.position.z - s.p1.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 1e-8) continue;

      const stretch = dist - s.restLength;
      const forceMag = s.stiffness * this.stiffnessMultiplier * stretch;

      const invDist = 1.0 / dist;
      const dirX = dx * invDist;
      const dirY = dy * invDist;
      const dirZ = dz * invDist;

      const rvx = s.p2.velocity.x - s.p1.velocity.x;
      const rvy = s.p2.velocity.y - s.p1.velocity.y;
      const rvz = s.p2.velocity.z - s.p1.velocity.z;
      const dampF = (rvx * dirX + rvy * dirY + rvz * dirZ) * s.damping;

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
      const ax = p.force.x * p.invMass;
      const ay = p.force.y * p.invMass;
      const az = p.force.z * p.invMass;

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

      // Screen boundary collisions
      const restitution = 0.5; // bounce factor
      const friction = 0.8; // slide friction

      // Floor (minY)
      if (p.position.y < this.bounds.minY) {
        p.position.y = this.bounds.minY;
        if (p.velocity.y < 0) p.velocity.y *= -restitution;
        p.velocity.x *= friction;
        p.velocity.z *= friction;
      }
      // Ceiling (maxY)
      else if (p.position.y > this.bounds.maxY) {
        p.position.y = this.bounds.maxY;
        if (p.velocity.y > 0) p.velocity.y *= -restitution;
        p.velocity.x *= friction;
        p.velocity.z *= friction;
      }

      // Left Wall (minX)
      if (p.position.x < this.bounds.minX) {
        p.position.x = this.bounds.minX;
        if (p.velocity.x < 0) p.velocity.x *= -restitution;
        p.velocity.y *= friction;
        p.velocity.z *= friction;
      }
      // Right Wall (maxX)
      else if (p.position.x > this.bounds.maxX) {
        p.position.x = this.bounds.maxX;
        if (p.velocity.x > 0) p.velocity.x *= -restitution;
        p.velocity.y *= friction;
        p.velocity.z *= friction;
      }
    }
  }
}
