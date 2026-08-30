import * as THREE from 'three';
import type { JellyCube, PointerDrag } from './types';
import { GRAB_RADIUS } from './config';
import { camera, renderer } from './scene';
import { playPressSound } from './audio';

// ─── State ──────────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const activePointers: Map<number, PointerDrag> = new Map();

function screenToNDC(clientX: number, clientY: number) {
  mouse.x = (clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(clientY / window.innerHeight) * 2 + 1;
}

// ─── Pointer Handlers ───────────────────────────────────────────────────────
function onPointerDown(event: PointerEvent, cubes: JellyCube[]) {
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

    hitCube.physics.startDrag(event.pointerId, hitPoint, GRAB_RADIUS);
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

// ─── Setup ──────────────────────────────────────────────────────────────────
export function setupPointerInteraction(cubes: JellyCube[]) {
  const down = (e: PointerEvent) => onPointerDown(e, cubes);
  renderer.domElement.addEventListener('pointerdown', down);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerUp);

  // Return cleanup function
  return () => {
    renderer.domElement.removeEventListener('pointerdown', down);
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    renderer.domElement.removeEventListener('pointerup', onPointerUp);
    renderer.domElement.removeEventListener('pointercancel', onPointerUp);
  };
}
