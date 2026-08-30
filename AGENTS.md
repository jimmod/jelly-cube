# Jelly Cube Physical Simulation Rules & Guidelines

These rules define the physical simulation behavior, material presets, and parameter definitions for the Jelly Cube project.

## Core Physical Parameters

- **Stiffness / Elasticity**: Controls how fast the cube returns to its original shape (spring return force).
- **Damping / Friction**: Controls how long the cube jiggles before stopping.
  - *Low damping*: Creates a wild, gelatinous wiggle.
  - *High damping*: Creates a heavy, muddy lag / viscous resistance.
- **Mass / Weight**: Higher mass creates more inertia, causing the cube to deform more drastically upon sudden stops, acceleration, or impacts.
- **Pressure**: Simulates internal air/fluid volume for soft bodies.
  - *High pressure*: Creates a plump, rigid shape.
  - *Low pressure*: Creates a deflated, saggy sack.

---

## Material Behaviors & Pressure Dynamics

### 🍮 1. Jelly (Elastic Soft Body)
- **Behavior**: Acts like a spring network with structural memory.
- **Under Pressure**: Deforms, squishes, and flattens out against surfaces.
- **When Released**: Bounces right back to its original shape with characteristic oscillation.
- **Structural Limits**: If stress/deformation exceeds structural strength, it fractures or deforms irreversibly.

### 🧪 2. Slime (Non-Newtonian / Shear-Thickening Fluid)
- **Behavior**: Changes its apparent viscosity depending on the rate of applied strain/pressure.
- **Sudden Pressure** *(fast drag / rapid impact)*: Turns solid/stiff as molecules lock together, resisting deformation.
- **Slow Pressure** *(gentle manipulation / resting)*: Acts like a thick, viscous liquid that flows and yields smoothly.

### 💧 3. Water (Incompressible Liquid)
- **Behavior**: Has no fixed shape; resists volume compression.
- **Open Environment**: Pressure displaces fluid, causing free flow, splashing, and low restoring stiffness.
- **Enclosed / Pressurized**: Incompressible—volume is conserved, transferring applied force and pressure equally in all directions (Pascal's principle).
