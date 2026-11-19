# Garden of Delight

A compact walled English cottage garden (about 54 × 86 m inside its brick wall) lit for a night exhibition — fairy-lit trees, fields of glowing stalks, frosted globes, a tunnel of light arches — with ten black holes of different sizes hanging in it: pinholes nesting in tree canopies that drain a single bush, larger ones over the walks, and a giant above the great fountain that you can walk beneath.

Each void sleeps as a small dark bead. Walk close enough and it wakes (bigger voids notice you from farther away — ~10 m for a pinhole, ~28 m for the giant): it grows, lenses the scene behind it, twists and pulls nearby lights toward its horizon, drains the light from the ground, trees and globes around it, and draws streams of stolen light spiralling in. It also tugs on you. Walk away and the light seeps back over the next half-minute.

**Play:** open `index.html` (or the GitHub Pages site).

- Desktop: WASD / arrows walk, mouse looks (click to capture, Esc to release), Shift hurries, **E** opens a new void of random size ahead of you, **M** toggles sound.
- Time of day: the pill at bottom right toggles **night** (default) ↔ **live** (your real clock; also **T**), and its slider scrubs to any hour. Live/set times place the sun by a real solar-position calculation (≈42°N, longitude from your time zone), with day sky, twilight and stars fading in. In daylight the voids carve pockets of night out of the day.
- Touch: drag the left half to walk, the right half to look, double-tap (or the button) to open a void.

## The great void

A giant black hole hangs 12 m above the grand fountain. It never fully sleeps; walk within ~40 m and it wakes, draining the central garden while an accretion disk of stolen light orbits it (inner edge white-hot, outer amber, the approaching side brighter). The lensing pass bends the far side of the disk over the top of the shadow and lets the near side cross in front; the disk's glow lights the fountain and parterre below, and the whole thing hangs reflected in the pool.

## Time

Every plant, tree and patch of ground cover has its own clock. A static clock at distance r from a void ticks at √(1 − Σ rₛ/r) of the garden's calendar rate (Schwarzschild time dilation, weak-field potentials summed over all voids; rₛ = 2.6 × the void's horizon radius, so the effect grows as a void wakes and feeds). Each frame, each plant integrates its own proper time and its phenology is read from that, not from the calendar: near an awake void the border lags behind the season, and under the giant the parterre can still be in bloom while the outer garden has gone bare.

You have a clock too. Your watch is real time; the garden's calendar advances at 1/√(1 − Σ rₛ/r) of that while you stand in a well, so the rest of the garden runs fast for you, its light and the sky arrive blueshifted, the music rises in pitch, and the HUD tallies how much younger than the garden you've become. Light from deeper wells than yours arrives redshifted.

**Seasons:** S cycles paused / 1 day / 1 week / 1 month per second; the slider scrubs the calendar (which also sets the sun's height); R replants so you can watch three years of establishment. Phenology comes from Shortwood Meadow's sourced bloom months: spring emergence (early and late species), bloom windows, summer-dormant alliums and poppies, standing seed heads, grasses that stand as straw until cut back in February, evergreen lavender, pinks and lamb's ears, woody roses and hydrangea, deciduous trees with spring flush, autumn colour and leaf fall, and a lawn that greens, dries and dulls through the year.

## The garden

Small on purpose, so every surface can be close-up quality. Materials are photo-scans; stonework is modelled in Blender; plants are procedural structure dressed in scanned leaves.

- **Layout:** an iron gate in a brick wall; a gravel forecourt; a tunnel of light arches through double herbaceous borders backed by yew; a canal garden with arching jets, yew columns, box hedges and lavender walks; a round central garden with a three-tier fountain, urns and box-edged parterre beds inside a yew ring; a loop walk with deep borders against the ivy-patched wall; two bowl fountains, rose arches, a bench niche, two long-grass meadows, six trees, ten cast-iron lamp posts.
- **Ground:** four scanned PBR materials (lawn, mulch, gravel, granite setts: colour, normal and AO/roughness maps) blended by two painted masks, with noise-broken edges, setts edging along every path, painted contact shadows under everything, and wet stone round the fountains.
- **Lawn:** ~360k GPU grass blades in two tiers that follow the walker — curved nine-vertex blades with rounded normals, clumping, mowing stripes, and long golden grass in the meadows.
- **Stonework (Blender):** fountains, pool kerbs of jointed coping stones, urns and pier finials are built by `tools/blender/build_stone.py` — turned profiles carved with gadroons, flutes and pinecone scales, weathered, simplified, with ambient occlusion baked into vertex colours. `blender/stone.blend` opens in Blender. In the garden they wear a scanned limestone, projected triplanar, with moss on upward faces, rain streaks and a wet variant.
- **Plants:** 57 perennials, bulbs, grasses, shrubs and roses from [Shortwood Meadow](https://github.com/samuelling/shortwood-meadow) (`src/plantart.js`, `src/looks.js`) — plant structure and painted flowers — now with scanned leaves (colour + normal maps) for every leaf type. ~3,000 plants draw as instanced meshes with distance LOD and wind sway.
- **Showpiece flowers in true 3D** (`src/flowers3d.js`): English-rose rosettes, double peonies, crinkled poppies, allium globes, delphinium, lupine and foxglove spires built floret by floret.
- **Hedges & topiary:** swept, clipped forms shelled with scanned yew sprays and box twigs (some growing out of the face, some lying against it).
- **Trees:** limbs are tapered tubes along curves with flared roots and scanned bark; canopies are boughs of scanned lime leaves, darker toward the middle. A belt of trees stands outside the wall.
- **Props:** scanned lamp posts, gate, bench and a stone cat on the pool rim.
- **Water:** one planar reflection pass shared by every pool and the canal (the voids appear in it as black spheres), a refracted stone floor with caustics, ripples, ribbons of falling water, foam and droplet jets.
- **Light:** sun or moon with soft shadows following you, a sky with drifting cloud, environment lighting, fog; the exhibit's light pools and the voids' drain are injected into every material.
- **Rendering:** 4× multisampling with alpha-to-coverage (smooth leaf edges without sorting), screen-space ambient occlusion from the depth buffer, bloom, a light colour grade, ACES tone mapping. Resolution drops by itself if frames run slow; `?q=low`, `?msaa=0` and `?ao=0` turn things down by hand.

### Assets and credits

All CC0: textures and models from [Poly Haven](https://polyhaven.com) (gravel_floor, sparse_grass, yellow_flower_mulch, cobblestone_square, castle_brick_02_red, white_plaster_02, bark_brown_02; street_lamp_01, large_iron_gate, painted_wooden_bench, concrete_cat_statue) and leaf scans from [ambientCG](https://ambientcg.com) (LeafSet and Foliage sets). `tools/build_assets.py` cuts the leaf scans into the atlas and foliage cards. Models are glTF with the buffer embedded, saved as `.json` so any static host will serve them (`tools/gltf_embed.py`). The water normal map is from the three.js examples (MIT).

## How it works

- **Drain field:** every light, surface and ground fragment computes `L = Π (1 − sᵢ·fᵢ(d))` over up to 12 voids, where `s` is each void's (slowly decaying) strength and `f` a smooth falloff whose reach grows as it wakes.
- **Infall:** light points inside a void's reach are rotated around its axis and pulled toward it in the vertex shader; a separate GPU particle system spirals light from the surrounding ground into the horizon, tinted by the local light colours and blue-shifting as it falls.
- **Lensing:** a post pass maps each pixel behind a void to `β = θ(1 − θE²/θ²)` (point-lens equation), with a depth test so foreground objects aren't lensed, and blacks out the shadow disk. Bloom and ACES tone mapping follow.
- **Ground light:** pools of light are baked into a canvas light map at load and multiplied by the drain field per fragment.
- **Sound (Web Audio):** a chord pad whose filter and level follow the light where you stand, glints that fade as the light does, a sub-rumble near awake voids, and an inhale when one wakes.

ES modules, no build step; three.js r160 from jsDelivr; about 15 MB of textures and models in `assets/`.
