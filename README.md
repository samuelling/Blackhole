# Umbra Garden

A night-time light garden — fairy-lit trees, fields of glowing stalks, frosted globes, a tunnel of arches — with black holes hanging in it.

Each void sleeps as a small dark bead. Walk within ~16 m and it wakes: it grows, lenses the scene behind it, twists and pulls nearby lights toward its horizon, drains the light from the ground, trees and globes around it, and draws streams of stolen light spiralling in. It also tugs on you. Walk away and the light seeps back over the next half-minute.

**Play:** open `index.html` (or the GitHub Pages site).

- Desktop: WASD / arrows walk, mouse looks (click to capture, Esc to release), Shift hurries, **E** opens a new void ahead of you, **M** toggles sound.
- Touch: drag the left half to walk, the right half to look, double-tap (or the button) to open a void.

## How it works

- **Drain field:** every light, surface and ground fragment computes `L = Π (1 − sᵢ·fᵢ(d))` over up to 8 voids, where `s` is each void's (slowly decaying) strength and `f` a smooth falloff whose reach grows as it wakes.
- **Infall:** light points inside a void's reach are rotated around its axis and pulled toward it in the vertex shader; a separate GPU particle system spirals light from the surrounding ground into the horizon, tinted by the local light colours and blue-shifting as it falls.
- **Lensing:** a post pass maps each pixel behind a void to `β = θ(1 − θE²/θ²)` (point-lens equation), with a depth test so foreground objects aren't lensed, and blacks out the shadow disk. Bloom and ACES tone mapping follow.
- **Ground light:** pools of light are baked into a canvas light map at load and multiplied by the drain field per fragment.
- **Sound (Web Audio):** a chord pad whose filter and level follow the light where you stand, glints that fade as the light does, a sub-rumble near awake voids, and an inhale when one wakes.

Single file, three.js r160 from jsDelivr.
