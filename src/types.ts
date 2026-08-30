import * as THREE from 'three';
import { JellyPhysics } from './physics';

// ─── Resolution ─────────────────────────────────────────────────────────────
export type Resolution = 'low' | 'medium' | 'high';

// ─── UI State ───────────────────────────────────────────────────────────────
export interface UIState {
  resolution: Resolution;
  cubeCount: number;
  cubeSize: number;
  elasticity: number;
  friction: number;
  weight: number;
  pressure: number;
  gravity: number;
  tiltGravity: boolean;
  textureMode: 'default' | 'rainbow' | 'color' | 'file';
  customColor: string;
  textureUrl: string | null;
  soundEnabled: boolean;
  showBox: boolean;
  showVelocity: boolean;
  showStress: boolean;
  showTrajectory: boolean;
  showSpeedHeatmap: boolean;
  showStats: boolean;
}

export type UIChangeCallback = (state: UIState) => void;

// ─── Trajectory Helper ──────────────────────────────────────────────────────
export interface TrajectoryData {
  group: THREE.Group;
  trailLine: THREE.Line;
  marker: THREE.Mesh;
  history: THREE.Vector3[];
  maxPoints: number;
}

// ─── JellyCube ──────────────────────────────────────────────────────────────
export interface JellyCube {
  physics: JellyPhysics;
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  vertexParticleMapping: number[];
  boxHelper: THREE.Group | null;
  velocityHelper: THREE.LineSegments | null;
  stressHelper: THREE.LineSegments | null;
  trajectoryHelper: TrajectoryData | null;
  offsetX: number;
}

// ─── Pointer Drag ───────────────────────────────────────────────────────────
export interface PointerDrag {
  cube: JellyCube;
  plane: THREE.Plane;
}
