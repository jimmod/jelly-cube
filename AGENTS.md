# Jelly Cube — Agent Guidance

An interactive 3D soft-body physics simulation built with **Three.js** + **TypeScript** + **Vite**. Users grab, drag, squish, and throw a jelly cube that deforms in real time using a spring-mass-damper lattice with internal area pressure.

**Deployed at**: `jelly.jimmod.com` (via `git push` → auto-deploy)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict) |
| 3D Rendering | Three.js r185 |
| Bundler | Vite 8 |
| Build | `tsc && vite build` |
| Dev Server | `npm run dev` (Vite HMR) |

**No framework** — vanilla DOM manipulation for UI. No React, no Tailwind.

---

## File Architecture

Each source file has a single clear responsibility. When modifying behavior, edit only the relevant file.

```
src/
├── types.ts           Shared interfaces (UIState, JellyCube, PointerDrag, TrajectoryData)
├── config.ts          Defaults, presets, constants — single source of truth
├── scene.ts           Three.js scene, camera, renderer, lighting, floor, resize
├── materials.ts       Material factory (createCubeMaterial) & texture cache
├── physics.ts         Spring-mass-damper simulation engine (Particle, Spring, JellyPhysics)
├── audio.ts           Web Audio API sound synthesis (bounce, press)
├── debug-helpers.ts   Visualizers: box wireframe, velocity, stress, trajectory, speed heatmap
├── interaction.ts     Pointer drag raycasting & event handlers
├── ui.ts              Control panel DOM construction (sliders, presets, toggles, accordions)
├── main.ts            Slim orchestrator: init, animate loop, glues everything together
├── style.css          All CSS (panel, toggles, HUD, animations)
└── assets/            Static assets
```

### Where to make changes

| I want to... | Edit this file |
|---|---|
| Add/change a material preset | `config.ts` → `MATERIAL_PRESETS` array |
| Change default slider values | `config.ts` → `DEFAULT_UI_STATE` |
| Change resolution options | `config.ts` → `RESOLUTION_MAP` |
| Add a new UI control | `ui.ts` (DOM construction) + `types.ts` (add field to `UIState`) |
| Change how the cube looks | `materials.ts` → `createCubeMaterial()` |
| Change physics behavior | `physics.ts` → `JellyPhysics._substep()` |
| Add a new debug visualizer | `debug-helpers.ts` (build + update functions) |
| Change lighting or camera | `scene.ts` |
| Change grab/drag behavior | `interaction.ts` |
| Change the animation loop | `main.ts` → `animate()` |
| Add a new sound effect | `audio.ts` |

---

## Physics Engine Overview

The simulation in `physics.ts` uses a **3D spring-mass-damper lattice** with **2D area pressure**.

### Particle Grid
- Particles are arranged in an `(N+1)³` grid where `N` = segments (3, 5, or 8).
- Total mass is constant (~64 units) regardless of resolution; per-particle mass = `64 / (N+1)³`.
- Particles are integrated with semi-implicit Euler: `v += (F/m) * dt`, `x += v * dt`.
- Z-axis is locked (`position.z = initialZ`) to keep the cube facing the camera.

### Springs
Three types connect particles:
1. **Structural** (axis-aligned neighbors, stiffness = `280 * (5/N)`)
2. **Shear** (diagonal neighbors, stiffness scaled by `1/distance`)
3. **Bend** (skip-1 neighbors, stiffness = `0.3×` structural)

Spring force includes **non-Newtonian shear-thickening**: effective damping increases with relative velocity squared, simulating viscous fluids.

### Pressure
A 2D signed-area calculation across boundary edges estimates cross-sectional volume. A Hookean area strain drives outward normal forces on the boundary perimeter. Negative pressure inverts the force direction (inward suction) with a stable equilibrium at ~45% rest area.

### Substeps
Physics runs at a fixed `1/120s` timestep. Each `update(dt)` call performs 2–6 substeps depending on resolution and stiffness ratio to prevent instability.

### Key Multipliers (exposed to UI)
| Parameter | Field | Default | Range |
|---|---|---|---|
| Elasticity | `stiffnessMultiplier` | 1.5 | 0.0 – 3.0 |
| Friction | `dampingMultiplier` | 0.3 | 0.1 – 5.0 |
| Weight | `weightMultiplier` | 1.0 | 0.2 – 3.0 |
| Pressure | `pressureMultiplier` | 0.8 | -2.0 – 3.0 |

---

## 6 Material Presets

Presets are defined in `config.ts` → `MATERIAL_PRESETS`. Each preset sets the 4 multipliers above.

| # | Preset | Elasticity | Friction | Weight | Pressure | Character |
|---|--------|-----------|----------|--------|----------|-----------|
| 1 | 🍮 Gelatin | 1.5× | 0.3× | 1.0× | 0.8× | Springy, playful default. Prolonged wobble. |
| 2 | 🛡️ Rubber | 2.6× | 3.0× | 2.2× | 2.0× | Dense, dead thud. Almost zero bounce. |
| 3 | 🎈 Balloon | 0.3× | 0.2× | 1.5× | 1.8× | Sloshy membrane. Sags at bottom, ripples. |
| 4 | 🧴 Foam | 0.35× | 4.2× | 1.2× | 0.3× | Thick slime. Molasses-like lag, no bounce. |
| 5 | 💨 Marshmallow | 1.8× | 0.7× | 0.5× | 0.5× | Light beach ball. Effortless squish & pop-back. |
| 6 | 💥 Crushed | 0.4× | 3.5× | 1.8× | -0.6× | Vacuum-squished lump at ~45% volume. |

**To add a new preset**: add one entry to the `MATERIAL_PRESETS` array in `config.ts`. The UI button is auto-generated.

---

## Rendering Pipeline

1. Each `JellyCube` owns a `THREE.BoxGeometry(size, size, size, segments, segments, segments)`.
2. A `vertexParticleMapping[]` maps each BoxGeometry vertex to its nearest physics particle (computed once at creation).
3. Every animation frame, vertex positions are overwritten from particle positions.
4. `computeVertexNormals()` recalculates smooth shading per frame.
5. Materials are swapped on the fly via `createCubeMaterial(state)` based on texture mode (normal, color, file, heatmap).

---

## Interaction Model

- **Pointer down** → raycast against cube mesh → find closest particles within `GRAB_RADIUS` (2.5 units) → weight by smooth hermite falloff → attach spring force toward drag target.
- **Pointer move** → update drag target position on the camera-facing plane.
- **Pointer up** → release drag, particles retain momentum (throw).
- Multi-touch supported via Pointer Events API with pointer capture.

---

## Debug Visualizers

All toggled from the UI panel. Implementation in `debug-helpers.ts`.

| Visualizer | What it shows |
|---|---|
| **Wireframe Lattice** | Per-cell wireframe boxes tracking particle deformation |
| **Velocity Vectors** | Blue line segments showing particle velocity direction & magnitude |
| **Stress Heatmap** | Spring-level strain coloring: green (rest) → red (tension) → blue (compression) |
| **Trajectory Trail** | Center-of-mass flight path with 60-point history |
| **Speed Heatmap** | Per-vertex coloring by kinetic speed: blue → green → yellow → red |
| **Stats HUD** | FPS, particle count, spring count, substeps, area ratio |

---

## Commands

```bash
npm run dev          # Start Vite dev server with HMR
npm run build        # TypeScript check + production build → dist/
npm run preview      # Serve production build locally
npx tsc --noEmit     # Type-check only (no output)
git push             # Deploy to jelly.jimmod.com
```

---

## Guidelines for Agents

1. **Always run `npx tsc --noEmit` before committing** to catch type errors.
2. **Don't add new dependencies** without user approval — the project is intentionally minimal (only `three`).
3. **Preset values live in `config.ts`** — never hardcode physics values directly in UI or physics files.
4. **The Z-axis is locked** — particles simulate in XY with Z frozen to `initialZ`. Don't add Z-axis physics without understanding this constraint.
5. **Negative pressure** uses a volume-equilibrium curve targeting ~45% rest area. Don't use a constant inward force — it causes runaway collapse.
6. **The `counter.ts` file is unused** — it's a Vite template leftover.
