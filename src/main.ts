import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { JellyPhysics } from './physics';
import './style.css';

// Scene setup
const container = document.getElementById('app')!;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x1a1a2e, 0.02);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(10, 8, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 5;
controls.maxDistance = 30;
controls.maxPolarAngle = Math.PI / 2 + 0.1; // Don't go below floor much

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.bias = -0.001;
scene.add(dirLight);

const pointLight = new THREE.PointLight(0xff0066, 2, 20);
pointLight.position.set(-5, 5, -5);
scene.add(pointLight);

const pointLight2 = new THREE.PointLight(0x0066ff, 2, 20);
pointLight2.position.set(5, 5, -5);
scene.add(pointLight2);

// Floor
const floorGeo = new THREE.PlaneGeometry(100, 100);
const floorMat = new THREE.MeshStandardMaterial({ 
    color: 0x16213e,
    roughness: 0.1,
    metalness: 0.2
});
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Jelly setup
const size = 4;
const segments = 4; // 4 segments = 5 vertices per edge = 125 total
const jellyPhysics = new JellyPhysics(size, segments, 1500, 20);

const jellyGeo = new THREE.BoxGeometry(size, size, size, segments, segments, segments);
const jellyMat = new THREE.MeshPhysicalMaterial({
    color: 0xff3366,
    metalness: 0.1,
    roughness: 0.1,
    transmission: 0.9,
    ior: 1.5,
    thickness: 2.0,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide
});
const jellyMesh = new THREE.Mesh(jellyGeo, jellyMat);
jellyMesh.castShadow = true;
jellyMesh.receiveShadow = true;
scene.add(jellyMesh);

// Map vertices to particles
// Box geometry creates vertices with positions that we can match exactly to our physics grid
const positionAttribute = jellyGeo.attributes.position;
const vertexParticleMapping: number[] = [];

for (let i = 0; i < positionAttribute.count; i++) {
    const vx = positionAttribute.getX(i);
    const vy = positionAttribute.getY(i) + size / 2; // Shift up because physics starts above floor
    const vz = positionAttribute.getZ(i);
    
    // Find closest particle
    let minDist = Infinity;
    let closestIdx = -1;
    for (let j = 0; j < jellyPhysics.particles.length; j++) {
        const p = jellyPhysics.particles[j];
        const dist = Math.sqrt(
            Math.pow(p.position.x - vx, 2) + 
            Math.pow(p.position.y - vy, 2) + 
            Math.pow(p.position.z - vz, 2)
        );
        if (dist < minDist) {
            minDist = dist;
            closestIdx = j;
        }
    }
    vertexParticleMapping.push(closestIdx);
}

// Interaction
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let draggedParticle: any = null;
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const dragOffset = new THREE.Vector3();

// Helper to find nearest particle to ray intersection
function getIntersectedParticle(event: MouseEvent | TouchEvent) {
    let clientX, clientY;
    if ('touches' in event) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else {
        clientX = (event as MouseEvent).clientX;
        clientY = (event as MouseEvent).clientY;
    }

    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(jellyMesh);
    
    if (intersects.length > 0) {
        // Find closest particle to the intersection point
        const pt = intersects[0].point;
        let minDist = Infinity;
        let closestP = null;
        for (const p of jellyPhysics.particles) {
            const d = p.position.distanceTo(pt);
            if (d < minDist) {
                minDist = d;
                closestP = p;
            }
        }
        
        if (closestP) {
            plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(plane.normal), pt);
            raycaster.ray.intersectPlane(plane, dragOffset);
            dragOffset.sub(closestP.position);
            return closestP;
        }
    }
    return null;
}

const onPointerDown = (event: MouseEvent | TouchEvent) => {
    draggedParticle = getIntersectedParticle(event);
    if (draggedParticle) {
        controls.enabled = false;
        // Make it much heavier/stiffer while dragging to pull the rest of the cube
        draggedParticle.mass = 100;
        draggedParticle.invMass = 1.0 / 100;
        document.body.style.cursor = 'grabbing';
    }
};

const onPointerMove = (event: MouseEvent | TouchEvent) => {
    if (!draggedParticle) return;
    
    let clientX, clientY;
    if ('touches' in event) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else {
        clientX = (event as MouseEvent).clientX;
        clientY = (event as MouseEvent).clientY;
    }

    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersectPt = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersectPt);
    
    const targetPos = intersectPt.sub(dragOffset);
    // Apply a spring force towards target instead of hard setting position for smoother physics
    const pullForce = targetPos.sub(draggedParticle.position).multiplyScalar(5000);
    draggedParticle.force.add(pullForce);
};

const onPointerUp = () => {
    if (draggedParticle) {
        draggedParticle.mass = 1;
        draggedParticle.invMass = 1;
        draggedParticle = null;
        controls.enabled = true;
        document.body.style.cursor = 'auto';
    }
};

window.addEventListener('mousedown', onPointerDown);
window.addEventListener('mousemove', onPointerMove);
window.addEventListener('mouseup', onPointerUp);

window.addEventListener('touchstart', onPointerDown, { passive: false });
window.addEventListener('touchmove', (e) => {
    if (draggedParticle) e.preventDefault(); // Prevent scrolling while dragging jelly
    onPointerMove(e);
}, { passive: false });
window.addEventListener('touchend', onPointerUp);

// Resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
const clock = new THREE.Clock();
let timeAccumulator = 0;
const physicsTimeStep = 1 / 120; // 120Hz physics

function animate() {
    requestAnimationFrame(animate);
    
    const dt = Math.min(clock.getDelta(), 0.1);
    timeAccumulator += dt;
    
    // Fixed time step for physics stability
    while (timeAccumulator >= physicsTimeStep) {
        jellyPhysics.update(physicsTimeStep);
        timeAccumulator -= physicsTimeStep;
    }
    
    // Update geometry
    const positions = jellyGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        const pIdx = vertexParticleMapping[i];
        const p = jellyPhysics.particles[pIdx];
        positions.setXYZ(i, p.position.x, p.position.y, p.position.z);
    }
    positions.needsUpdate = true;
    jellyGeo.computeVertexNormals(); // Recompute normals for proper lighting on deformed shape
    
    controls.update();
    renderer.render(scene, camera);
}

animate();
