# Physical Simulation & Material Rules

## Physical Parameters
- **Stiffness / Elasticity**: Controls how fast the cube returns to its original shape.
- **Damping / Friction**: Controls how long the cube jiggles before stopping (low = wild wiggle, high = muddy lag).
- **Mass / Weight**: Governs inertia, dictating how drastically the body deforms on sudden stops or impacts.
- **Pressure**: Simulates internal volume/air pressure (high = rigid ball, low = deflated sack, negative = vacuum collapse).

## 6 Material Presets
1. 🍮 **Classic Gelatin**: Elasticity 1.4×, Friction 0.3×, Weight 1.0×, Pressure 0.8× (playful, persistent jiggle).
2. 🛡️ **Heavy Rubber**: Elasticity 2.6×, Friction 3.0×, Weight 2.5×, Pressure 2.5× (dead thud, solid dense resistance).
3. 🎈 **Water Balloon**: Elasticity 0.2×, Friction 0.15×, Weight 1.6×, Pressure 2.2× (fluid ripples, bottom sag, area conservation).
4. 🧴 **Memory Foam**: Elasticity 0.05×, Friction 4.5×, Weight 1.0×, Pressure 0.0× (thick slime/clay, flattens down).
5. 💨 **Fluffy Marshmallow**: Elasticity 1.8×, Friction 0.8×, Weight 0.3×, Pressure 0.4× (airy, light, beach-ball bounce).
6. 💥 **Crushed**: Elasticity 0.1×, Friction 5.0×, Weight 3.0×, Pressure -1.5× (inward black hole vacuum implosion).
