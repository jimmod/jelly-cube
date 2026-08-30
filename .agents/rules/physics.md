# Physical Simulation & Material Rules

## Physical Parameters
- **Stiffness / Elasticity**: Controls how fast the cube returns to its original shape.
- **Damping / Friction**: Controls how long the cube jiggles before stopping. Low damping creates a wild, gelatinous wiggle; high damping creates a heavy, muddy lag.
- **Mass / Weight**: Higher mass creates more inertia, making the cube deform more drastically upon sudden stops or impacts.
- **Pressure**: (For gas-filled soft bodies) Simulates internal air volume. High pressure makes a rigid ball; low pressure creates a deflated, saggy sack.

## Material Types & Pressure Characteristics

### 🍮 1. Jelly (Elastic Soft Body)
- Acts like a spring with structural memory.
- **Under Pressure**: Deforms, squishes, and flattens out.
- **When Released**: Bounces right back to its original shape.
- **Limit**: If pressure exceeds structural strength, it fractures and breaks apart.

### 🧪 2. Slime (Non-Newtonian Fluid)
- Changes thickness (viscosity) depending on how fast pressure is applied (shear-thickening).
- **Sudden Pressure**: Turns solid; molecules lock together, resisting pressure.
- **Slow Pressure**: Acts like a thick liquid; sinks right through.

### 💧 3. Water (Incompressible Liquid)
- Does not have a fixed shape; volume cannot be easily changed by pressure.
- **Open Container**: Applying pressure pushes water out of the way (flows).
- **Closed Container**: Incompressible; pressure transfers equally in all directions.
