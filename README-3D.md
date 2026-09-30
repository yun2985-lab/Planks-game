# Belcat 3D Race — v02

Play: https://yun2985-lab.github.io/Planks-game/plinko-3d.html

The original index.html and plinko-game.html remain available. This edition uses the bundled Three.js renderer and the existing game simulation.

## Changes
- Richer warm wood, purple Belcats, and mint/gold accents with reduced overexposure.
- Simulation runs at 62% of the previous pace; fixed-step physics and interpolated rendering remain.
- Original leader-follow camera restored, with course scoring adapted to the longer layout. Manual and overview controls remain.
- Course centerline doubled exactly: 3092.7876 to 6185.5752. Original Belcat counts retained and distributed over the longer course.
- Course minimap, leader percentage, top three positions, and completed count.
- Attack anticipation, recoil, muzzle flashes, projectile trails, and impact rings driven by actual simulation events.
- Boss hits grant 14 simulation seconds of boss protection, displayed as a mint halo, to prevent repeated beam knockback trapping trailing balls.
- Mobile nameplates, dock status, and replay control refined.

## Validation
Deterministic simulation checks with 1, 8, and 50 participants all finished, with finite coordinates and unique rankings. Exact 2x course length and 0.62 simulation rate asserted.
A local software-WebGL browser checked rendering, race start, overview, quality toggle, reset, settings, and 50-player start without JavaScript errors.
Reference footage was reviewed for tabletop framing, warm color, and motion direction. Visual parity with the reference is not claimed.
Actual phone FPS and perceived pacing still require device verification. Software-renderer FPS is not a phone benchmark.
