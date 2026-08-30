import type { Resolution, UIState } from './types';

// ─── Resolution Map ─────────────────────────────────────────────────────────
export const RESOLUTION_MAP: Record<Resolution, { label: string; segments: number }> = {
  low:    { label: 'Low (3×3×3)',    segments: 3 },
  medium: { label: 'Medium (5×5×5)', segments: 5 },
  high:   { label: 'High (8×8×8)',   segments: 8 },
};

export function getSegments(res: Resolution): number {
  return RESOLUTION_MAP[res].segments;
}

// ─── Material Presets ───────────────────────────────────────────────────────
export interface MaterialPreset {
  label: string;
  elasticity: number;
  friction: number;
  weight: number;
  pressure: number;
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  { label: '🍮 Gelatin',     elasticity: 1.5,  friction: 0.3,  weight: 1.0, pressure: 0.8  },
  { label: '🛡️ Rubber',      elasticity: 2.6,  friction: 3.0,  weight: 2.2, pressure: 2.0  },
  { label: '🎈 Balloon',     elasticity: 0.3,  friction: 0.2,  weight: 1.5, pressure: 1.8  },
  { label: '🧴 Foam',        elasticity: 0.35, friction: 4.2,  weight: 1.2, pressure: 0.3  },
  { label: '💨 Marshmallow',  elasticity: 1.8,  friction: 0.7,  weight: 0.5, pressure: 0.5  },
  { label: '💥 Crushed',     elasticity: 0.4,  friction: 3.5,  weight: 1.8, pressure: -0.6 },
];

// ─── Default UI State ───────────────────────────────────────────────────────
export const DEFAULT_UI_STATE: UIState = {
  resolution: 'medium',
  cubeCount: 1,
  cubeSize: 3.0,
  elasticity: 1.5,
  friction: 0.3,
  weight: 1.0,
  pressure: 0.8,
  gravity: 5,
  tiltGravity: false,
  textureMode: 'default',
  customColor: '#ff0055',
  textureUrl: null,
  soundEnabled: false,
  showBox: false,
  showVelocity: false,
  showStress: false,
  showTrajectory: false,
  showSpeedHeatmap: false,
  showStats: false,
};

// ─── Physics Constants ──────────────────────────────────────────────────────
export const PHYSICS_DT = 1 / 120;
export const CUBE_SPACING = 5.0;
export const GRAB_RADIUS = 2.5;
