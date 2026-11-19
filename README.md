# Umbra Garden

A vast English cottage garden lit for a night exhibition — fairy-lit trees, fields of glowing stalks, frosted globes, a tunnel of arches — with about twenty black holes of different sizes hanging in it: pinholes nesting in tree canopies that drain a single bush, house-sized ones over the paths, and a giant floating over the big meadow that you can walk beneath.

Each void sleeps as a small dark bead. Walk close enough and it wakes (bigger voids notice you from farther away — ~10 m for a pinhole, ~28 m for the giant): it grows, lenses the scene behind it, twists and pulls nearby lights toward its horizon, drains the light from the ground, trees and globes around it, and draws streams of stolen light spiralling in. It also tugs on you. Walk away and the light seeps back over the next half-minute.

**Play:** open `index.html` (or the GitHub Pages site).

- Desktop: WASD / arrows walk, mouse looks (click to capture, Esc to release), Shift hurries, **E** opens a new void of random size ahead of you, **M** toggles sound.
- Time of day: the pill at bottom right toggles **night** (default) ↔ **live** (your real clock; also **T**), and its slider scrubs to any hour. Live/set times place the sun by a real solar-position calculation (≈42°N, longitude from your time zone), with day sky, twilight and stars fading in. In daylight the voids carve pockets of night out of the day.
- Touch: drag the left half to walk, the right half to look, double-tap (or the button) to open a void.

## The garden

- **Plants:** 57 perennials, bulbs, grasses, shrubs and roses ported from [Shortwood Meadow](https://github.com/samuelling/shortwood-meadow) (`src/plantart.js`, `src/looks.js`): procedural leaf and flower textures and plant structure, sized from its sourced species table. All species are packed into a leaf atlas and a flower atlas, so ~3,000 plants draw as instanced meshes in 16 m chunks, with distance LOD and wind sway.
- **Layout:** an entrance avenue of double herbaceous borders backed by yew; a canal garden with arching jets, Irish yew columns, box hedges and lavender walks; a round central garden with a three-tier limestone fountain, urns and box-edged parterre beds of roses, lavender, catmint and alliums inside a yew ring; cottage borders along the loop walk (drift-planted, tall at the back), rose arches, two bowl fountains, wildflower meadows, a grove.
- **Hedges & topiary:** swept rounded profiles with clipped-surface noise, shelled with thousands of yew or box sprig cards.
- **Lawn:** ~170k GPU grass blades that follow the walker (mown, with stripes; long and golden in the meadows), over a painted ground mask of lawn, bed soil and gravel.
- **Water:** one planar reflection pass shared by every pool and the canal (the voids appear in it as black spheres), with ripples, overflow sheets, foam and droplet jets.
- **Light:** sun or moon with soft shadows following you, sky environment lighting, fog; the exhibit's light pools and the voids' drain are injected into every material.

## How it works

- **Drain field:** every light, surface and ground fragment computes `L = Π (1 − sᵢ·fᵢ(d))` over up to 8 voids, where `s` is each void's (slowly decaying) strength and `f` a smooth falloff whose reach grows as it wakes.
- **Infall:** light points inside a void's reach are rotated around its axis and pulled toward it in the vertex shader; a separate GPU particle system spirals light from the surrounding ground into the horizon, tinted by the local light colours and blue-shifting as it falls.
- **Lensing:** a post pass maps each pixel behind a void to `β = θ(1 − θE²/θ²)` (point-lens equation), with a depth test so foreground objects aren't lensed, and blacks out the shadow disk. Bloom and ACES tone mapping follow.
- **Ground light:** pools of light are baked into a canvas light map at load and multiplied by the drain field per fragment.
- **Sound (Web Audio):** a chord pad whose filter and level follow the light where you stand, glints that fade as the light does, a sub-rumble near awake voids, and an inhale when one wakes.

Single file, three.js r160 from jsDelivr.
