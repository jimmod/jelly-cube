import * as THREE from 'three';

export class Particle {
  mass: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  force: THREE.Vector3;
  invMass: number;
  isFixed: boolean;

  constructor(x: number, y: number, z: number, mass: number = 1.0) {
    this.mass = mass;
    this.invMass = mass > 0 ? 1.0 / mass : 0;
    this.position = new THREE.Vector3(x, y, z);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.force = new THREE.Vector3(0, 0, 0);
    this.isFixed = false;
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

  update() {
    const diff = new THREE.Vector3().subVectors(this.p2.position, this.p1.position);
    const dist = diff.length();
    if (dist === 0) return;

    // Hooke's Law: F = -k * (x - L)
    const stretch = dist - this.restLength;
    const forceMag = this.stiffness * stretch;
    
    // Normalize diff
    const dir = diff.clone().divideScalar(dist);
    
    const force = dir.clone().multiplyScalar(forceMag);
    
    // Damping: Fd = -c * v_rel
    const relVel = new THREE.Vector3().subVectors(this.p2.velocity, this.p1.velocity);
    const dampForceMag = relVel.dot(dir) * this.damping;
    const dampForce = dir.clone().multiplyScalar(dampForceMag);
    
    force.add(dampForce);

    if (!this.p1.isFixed) this.p1.force.add(force);
    if (!this.p2.isFixed) this.p2.force.sub(force);
  }
}

export class JellyPhysics {
  particles: Particle[] = [];
  springs: Spring[] = [];
  gravity: THREE.Vector3 = new THREE.Vector3(0, -9.81 * 2, 0); // extra gravity for snap
  bounds = { floor: 0 };
  dragFriction = 0.99;
  
  size: number;
  segments: number;
  stiffness: number;
  damping: number;
  
  constructor(
    size: number, 
    segments: number, 
    stiffness: number, 
    damping: number
  ) {
    this.size = size;
    this.segments = segments;
    this.stiffness = stiffness;
    this.damping = damping;
    this.init();
  }

  init() {
    this.particles = [];
    this.springs = [];
    
    const n = this.segments + 1;
    const step = this.size / this.segments;
    const offset = this.size / 2;

    // Create particles
    for (let z = 0; z < n; z++) {
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const px = x * step - offset;
          const py = y * step - offset + this.size; // start above floor
          const pz = z * step - offset;
          this.particles.push(new Particle(px, py, pz, 1.0));
        }
      }
    }

    const getIndex = (x: number, y: number, z: number) => z * n * n + y * n + x;

    // Create springs
    for (let z = 0; z < n; z++) {
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const idx = getIndex(x, y, z);
          const p1 = this.particles[idx];

          // Structural & Shear springs: connect to neighbors within a 3x3x3 block
          for (let dz = 0; dz <= 1; dz++) {
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                // Avoid backward connections and self
                if (dz === 0 && dy === 0 && dx <= 0) continue;
                if (dz === 0 && dy === -1) continue;

                const nx = x + dx;
                const ny = y + dy;
                const nz = z + dz;

                if (nx >= 0 && nx < n && ny >= 0 && ny < n && nz >= 0 && nz < n) {
                  const nidx = getIndex(nx, ny, nz);
                  const p2 = this.particles[nidx];
                  
                  // Adjust stiffness based on distance (diagonal vs straight)
                  const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                  const s = this.stiffness / dist;
                  
                  this.springs.push(new Spring(p1, p2, s, this.damping));
                }
              }
            }
          }
          
          // Bend springs (skip 1 node)
          const bendOffsets = [
            [2, 0, 0], [0, 2, 0], [0, 0, 2]
          ];
          for (const [dx, dy, dz] of bendOffsets) {
            const nx = x + dx;
            const ny = y + dy;
            const nz = z + dz;
            if (nx < n && ny < n && nz < n) {
              const nidx = getIndex(nx, ny, nz);
              const p2 = this.particles[nidx];
              this.springs.push(new Spring(p1, p2, this.stiffness * 0.5, this.damping));
            }
          }
        }
      }
    }
  }

  update(dt: number) {
    // Accumulate forces
    for (const p of this.particles) {
      if (p.isFixed) continue;
      p.force.set(0, 0, 0);
      p.force.add(this.gravity.clone().multiplyScalar(p.mass));
    }

    for (const s of this.springs) {
      s.update();
    }

    // Integrate (Semi-implicit Euler)
    for (const p of this.particles) {
      if (p.isFixed) continue;
      
      const acc = p.force.clone().multiplyScalar(p.invMass);
      p.velocity.add(acc.multiplyScalar(dt));
      p.velocity.multiplyScalar(this.dragFriction); // Global damping
      
      const newPos = p.position.clone().add(p.velocity.clone().multiplyScalar(dt));
      
      // Floor collision
      if (newPos.y < this.bounds.floor) {
        newPos.y = this.bounds.floor;
        // Friction on floor
        p.velocity.x *= 0.5;
        p.velocity.z *= 0.5;
        // Bounce
        p.velocity.y *= -0.2; 
      }
      
      p.position.copy(newPos);
    }
  }
}
