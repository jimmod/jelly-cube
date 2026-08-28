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

  // Drag state
  dragTarget: THREE.Vector3 = new THREE.Vector3();
  dragParticles: DragInfo[] = [];
  isDragging = false;

  constructor(segments: number) {
    this.segments = segments;
    // More substeps for higher resolution to maintain stability
    this.substepsPerUpdate = segments <= 3 ? 1 : segments <= 5 ? 2 : segments <= 8 ? 4 : 8;
    this.init(segments);
  }

  init(segments: number) {
    this.segments = segments;
    this.particles = [];
    this.springs = [];

    const n = segments + 1;
    const halfSize = 2.0;
    const step = (halfSize * 2) / segments;

    // Create particles
    for (let iz = 0; iz < n; iz++) {
      for (let iy = 0; iy < n; iy++) {
        for (let ix = 0; ix < n; ix++) {
          const px = ix * step - halfSize;
          const py = iy * step + 0.5; // bottom of cube at y=0.5 (just above floor)
          const pz = iz * step - halfSize;
          this.particles.push(new Particle(px, py, pz, 1.0));
        }
      }
    }

    // Index helper
    const idx = (x: number, y: number, z: number) => z * n * n + y * n + x;

    // Spring stiffness: use a moderate base that works at all resolutions
    // The key insight: spring restLength is proportional to 1/segments,
    // so forces are naturally proportional. We just need moderate stiffness.
    const stiffness = 300;
    const damping = 5;

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

  startDrag(hitPoint: THREE.Vector3, radius: number) {
    this.dragParticles = [];
    this.isDragging = true;
    this.dragTarget.copy(hitPoint);

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const dist = p.position.distanceTo(hitPoint);
      if (dist < radius) {
        const t = dist / radius;
        // Smooth falloff: cubic hermite
        const weight = 1.0 - t * t * (3 - 2 * t);
        this.dragParticles.push({
          particleIndex: i,
          weight,
          offset: new THREE.Vector3().subVectors(p.position, hitPoint),
        });
      }
    }

    // Fallback: grab closest
    if (this.dragParticles.length === 0) {
      let minDist = Infinity;
      let closestIdx = 0;
      for (let i = 0; i < this.particles.length; i++) {
        const d = this.particles[i].position.distanceTo(hitPoint);
        if (d < minDist) {
          minDist = d;
          closestIdx = i;
        }
      }
      this.dragParticles.push({
        particleIndex: closestIdx,
        weight: 1.0,
        offset: new THREE.Vector3().subVectors(this.particles[closestIdx].position, hitPoint),
      });
    }
  }

  updateDrag(target: THREE.Vector3) {
    this.dragTarget.copy(target);
  }

  endDrag() {
    this.isDragging = false;
    this.dragParticles = [];
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
      s.applyForce();
    }

    // Drag: position-based — directly move grabbed particles toward target
    if (this.isDragging) {
      for (const info of this.dragParticles) {
        const p = this.particles[info.particleIndex];

        // Target position for this particle = dragTarget + original offset * (1-weight)
        // Highest weight particles go exactly to target, lower weight ones keep some offset
        const lerpW = info.weight;
        const targetX = this.dragTarget.x + info.offset.x * (1 - lerpW);
        const targetY = this.dragTarget.y + info.offset.y * (1 - lerpW);
        const targetZ = this.dragTarget.z + info.offset.z * (1 - lerpW);

        // Very strong spring toward target position
        const strength = 500 * info.weight;
        p.force.x += (targetX - p.position.x) * strength;
        p.force.y += (targetY - p.position.y) * strength;
        p.force.z += (targetZ - p.position.z) * strength;

        // Heavy damping on dragged particles
        p.velocity.x *= 0.85;
        p.velocity.y *= 0.85;
        p.velocity.z *= 0.85;
      }
    }

    // Semi-implicit Euler integration
    for (const p of this.particles) {
      const ax = p.force.x * p.invMass;
      const ay = p.force.y * p.invMass;
      const az = p.force.z * p.invMass;

      p.velocity.x = (p.velocity.x + ax * dt) * this.globalDamping;
      p.velocity.y = (p.velocity.y + ay * dt) * this.globalDamping;
      p.velocity.z = (p.velocity.z + az * dt) * this.globalDamping;

      p.prevPosition.copy(p.position);

      p.position.x += p.velocity.x * dt;
      p.position.y += p.velocity.y * dt;
      p.position.z += p.velocity.z * dt;

      // Floor collision
      if (p.position.y < this.floorY) {
        p.position.y = this.floorY;
        p.velocity.x *= 0.7;
        p.velocity.z *= 0.7;
        if (p.velocity.y < 0) p.velocity.y *= -0.3;
      }
    }
  }
}
