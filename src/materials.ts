import * as THREE from 'three';
import type { UIState } from './types';

// ─── Texture Cache ──────────────────────────────────────────────────────────
let loadedFileTexture: THREE.Texture | null = null;

export function setFileTexture(tex: THREE.Texture | null) {
  loadedFileTexture = tex;
}

export function getFileTexture(): THREE.Texture | null {
  return loadedFileTexture;
}

// ─── Material Generator ─────────────────────────────────────────────────────
export function createCubeMaterial(state: UIState): THREE.Material {
  if (state.showSpeedHeatmap) {
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.3,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
  }

  if (state.textureMode === 'file' && loadedFileTexture) {
    return new THREE.MeshStandardMaterial({
      map: loadedFileTexture,
      roughness: 0.35,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
  }

  if (state.textureMode === 'color') {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(state.customColor),
      roughness: 0.25,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
  }

  // Default & Rainbow: Built-in Normal Material
  return new THREE.MeshNormalMaterial({
    wireframe: false,
    side: THREE.DoubleSide,
  });
}
