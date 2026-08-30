# Jelly Cube Physical Simulation Rules & Guidelines

These rules define the physical simulation behavior, material presets, and parameter definitions for the Jelly Cube project.

## Core Physical Parameters

- **Stiffness / Elasticity**: Controls how fast the cube returns to its original shape (spring return force).
- **Damping / Friction**: Controls how long the cube jiggles before stopping.
  - *Low friction*: Creates a wild, gelatinous wiggle.
  - *High friction*: Creates a heavy, muddy lag / viscous resistance.
- **Mass / Weight**: Higher mass creates more inertia, causing the cube to deform more drastically upon sudden stops, acceleration, or impacts.
- **Pressure**: Simulates internal air/fluid volume for soft bodies.
  - *High pressure*: Creates a plump, rigid shape.
  - *Low pressure*: Creates a deflated, saggy sack.
  - *Negative pressure*: Simulates an inward implosion / vacuum collapse.

---

## 6 Material Presets & Behavioral Dynamics

### 🍮 1. Gelatin (The "Jelly" Default)
- **Settings**: Elasticity Medium (`1.5×`), Friction Low (`0.3×`), Weight Medium (`1.0×`), Pressure Medium-Low (`0.8×`).
- **Behavior**: Instantly recognizable, springy, and playful. Deforms easily but always snaps back to its original shape with a satisfying wiggle. Squeezing or throwing causes prolonged wobbling.

### 🛡️ 2. Rubber (The "Solid" Deformer)
- **Settings**: Elasticity High (`2.6×`), Friction High (`3.0×`), Weight High (`2.2×`), Pressure Very High (`2.0×`).
- **Behavior**: Dense, heavy block of industrial rubber or solid tire. Requires massive force to deform; stops vibrating almost immediately. Dropping results in a heavy, dead thud with almost zero bounce.

### 🎈 3. Balloon (The "Fluid-Filled" Shell)
- **Settings**: Elasticity Low (`0.3×`), Friction Very Low (`0.2×`), Weight Medium-High (`1.5×`), Pressure High (`1.8×`).
- **Behavior**: Thin, flexible membrane holding an incompressible fluid. Loose and sloshy; gravity makes it sag heavily at the bottom when resting. Shaking or poking sends distortion waves rippling across the surface.

### 🧴 4. Foam (The "Slime / Mud" Slowpoke)
- **Settings**: Elasticity Low (`0.35×`), Friction Extremely High (`4.2×`), Weight Medium (`1.2×`), Pressure Low (`0.3×`).
- **Behavior**: Wet clay, Oobleck, or thick slime. Deforms under pressure and flattens down against surfaces with thick molasses-like lag without bouncing, slowly returning to form.

### 💨 5. Marshmallow (The "Airy" Cushion)
- **Settings**: Elasticity Medium-High (`1.8×`), Friction Medium (`0.7×`), Weight Low (`0.5×`), Pressure Low (`0.5×`).
- **Behavior**: Light, soft, bouncy, and highly compressible. Bounces around like a beach ball, squishes effortlessly under pressure, and instantly pops back to full size without heavy lagging weight.

### 💥 6. Crushed (The Black Hole Collapse)
- **Settings**: Elasticity Minimal (`0.1×`), Friction Maximized (`5.0×`), Weight Extremely High (`3.0×`), Pressure Negative / Vacuum (`-1.5×`).
- **Behavior**: Total structural collapse. The moment this preset is activated, the cube violently implodes with inward vacuum suction, crumpling into a dense, heavily distorted clump resisting any outward bounce.
