# Physical Simulation & Material Rules

## Physical Parameters
- **Stiffness / Elasticity**: Controls how fast the cube returns to its original shape (spring return force).
- **Damping / Friction**: Controls how long the cube jiggles before stopping (low = wild wiggle, high = muddy lag).
- **Mass / Weight**: Governs inertia, dictating how drastically the body deforms on sudden stops, impacts, or accelerations.
- **Pressure**: Simulates internal volume/air pressure (high = plump rigid ball, low = deflated sack, negative = vacuum collapse).

## 6 Material Presets

### 1. 🍮 Classic Gelatin (The "Jelly" Default)
- **Settings**: Elasticity `1.5×`, Friction `0.3×`, Weight `1.0×`, Pressure `0.8×`
- **Behavior**: Instantly recognizable, springy, and playful. Deforms easily but always snaps back with a prolonged, satisfying wiggle.

### 2. 🛡️ Heavy Rubber (The "Solid" Deformer)
- **Settings**: Elasticity `2.6×`, Friction `3.0×`, Weight `2.2×`, Pressure `2.0×`
- **Behavior**: Dense, heavy block of solid rubber. Requires massive force to deform; stops vibrating almost immediately with a heavy, dead thud.

### 3. 🎈 Water Balloon (The "Fluid-Filled" Shell)
- **Settings**: Elasticity `0.3×`, Friction `0.2×`, Weight `1.5×`, Pressure `1.8×`
- **Behavior**: Thin, flexible membrane holding an incompressible fluid. Sloshy and rippling; sags heavily at the bottom while conserving cross-sectional area.

### 4. 🧴 Memory Foam (The "Slime / Mud" Slowpoke)
- **Settings**: Elasticity `0.35×`, Friction `4.2×`, Weight `1.2×`, Pressure `0.3×`
- **Behavior**: Wet clay, Oobleck, or thick slime. Deforms under pressure and flattens down with thick, molasses-like lag without bouncing.

### 5. 💨 Fluffy Marshmallow (The "Airy" Cushion)
- **Settings**: Elasticity `1.8×`, Friction `0.7×`, Weight `0.5×`, Pressure `0.5×`
- **Behavior**: Light, soft, bouncy, and highly compressible. Bounces like a beach ball and pops back to full size without heavy lagging inertia.

### 6. 💥 The "Crushed" Cube (The Black Hole Collapse)
- **Settings**: Elasticity `0.1×`, Friction `5.0×`, Weight `3.0×`, Pressure `-1.5×`
- **Behavior**: Total structural collapse. The moment this preset is activated, the cube violently implodes with internal vacuum suction into a dense crumpled core.
