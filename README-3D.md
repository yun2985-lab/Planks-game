# Belcat 3D Race — v05

Play: https://yun2985-lab.github.io/Planks-game/plinko-3d.html?v=05

## Current edition
- Full viewport game with compact high-contrast minimap; settings and results open on demand. No ball nameplates.
- Continuous sand ground, winding purple course edges, stone obstacles and plants. Bridge supports removed.
- One real opening in the terrain at the finish, with an open shaft and dark bottom. Entering balls transition into falling, then finish; follow camera closes in on the hole with falling streaks.
- Simulation rate 1.40, exactly twice v04's 0.70. Fixed 120Hz integration remains. Actual race duration depends on collisions and attacks.
- Belcat projectiles run at 580 simulation units/s (v04: 340), with white-core purple bolts, long trails, muzzle bursts and impact rings. Swept hit testing remains.
- Doubled course length, original leader camera state and boss recovery protection retained.

## Validation
Deterministic 1-, 8-, and 50-player simulations all completed with finite coordinates and unique rankings. Course length and speed assertions pass.
Software-WebGL browser verified terrain with one hole, falling transition below the ground, settings and follow/overview controls without JavaScript errors.
Approach and fall preview images use actual renderer with test-controlled positions; they are not an unedited full-race recording.
Phone FPS, perceived speed and visual parity with the reference remain unverified. Software-renderer FPS is not a phone benchmark.

Original index.html/plinko-game.html remain available.
