// flora.js: the plants you can set out yourself.
//
// The garden's own 66 perennials came from Shortwood Meadow's sourced table. This adds about as many again from other kinds of garden
// (woodland shade, Mediterranean, desert, tropical, water's edge, alpine, bulbs), and a catalogue of all of them for the planting menu.
// A new plant is drawn with the same parts as the old ones: one of the six forms (mound, upright, shrub, strap, grass, rosette), one of the
// scanned leaf shapes, and one of the painted flower styles, at its own sizes and colours. So an agave is a strap plant with few, very wide
// swords, a banana is a strap plant whose blades are broad leaves ten feet long, a red-hot poker is a grass with a brush for a plume.
//
// What is modelled for each: mature height and spread (inches, as nurseries give them), the years it takes to get there from a pot, the
// months it flowers, and how it spends the winter (dies back, stands as straw, keeps its leaves, drops them). What is not: hardiness.
// Inside the bubble nothing is killed by cold; a tender plant simply comes up late and dies down like any other perennial.
import { LOOKS, SIZE } from './looks.js';
import { addSpecies, GROW_YEARS, bloomLabel } from './seasons.js';

export const CATS = [['cottage', 'Cottage border'], ['prairie', 'Prairie & meadow'], ['grass', 'Grasses & sedges'], ['shade', 'Woodland shade'], ['med', 'Mediterranean'],
  ['desert', 'Desert & succulents'], ['tropic', 'Tropical'], ['bog', 'Water’s edge'], ['alpine', 'Alpine & rock'], ['bulb', 'Bulbs']];

// [key, common name, botanical name, category] for the plants the garden already grew
const OLD = [
  ['nepeta', 'Catmint', 'Nepeta × faassenii', 'cottage'], ['phloxJ', 'Garden phlox ‘Jeana’', 'Phlox paniculata', 'cottage'], ['phloxR', 'Garden phlox, red', 'Phlox paniculata', 'cottage'],
  ['geranium', 'Cranesbill ‘Rozanne’', 'Geranium', 'cottage'], ['peony', 'Peony', 'Paeonia lactiflora', 'cottage'], ['iris', 'Siberian iris', 'Iris sibirica', 'cottage'],
  ['alchemilla', 'Lady’s mantle', 'Alchemilla mollis', 'cottage'], ['leucanthemum', 'Shasta daisy', 'Leucanthemum × superbum', 'cottage'], ['digitalis', 'Foxglove', 'Digitalis purpurea', 'cottage'],
  ['delphinium', 'Delphinium', 'Delphinium elatum', 'cottage'], ['dianthus', 'Pinks', 'Dianthus', 'cottage'], ['hemerocallis', 'Daylily', 'Hemerocallis', 'cottage'], ['lilium', 'Lily', 'Lilium', 'cottage'],
  ['irisG', 'Bearded iris', 'Iris germanica', 'cottage'], ['lupinus', 'Lupine', 'Lupinus polyphyllus', 'cottage'], ['papaver', 'Oriental poppy', 'Papaver orientale', 'cottage'],
  ['platycodon', 'Balloon flower', 'Platycodon grandiflorus', 'cottage'], ['roseKO', 'Shrub rose', 'Rosa ‘Knock Out’', 'cottage'], ['roseDA', 'English rose', 'Rosa (Austin)', 'cottage'],
  ['stachys', 'Lamb’s ears', 'Stachys byzantina', 'cottage'], ['veronica', 'Speedwell', 'Veronica spicata', 'cottage'], ['anemone', 'Japanese anemone', 'Anemone × hybrida', 'cottage'],
  ['aquilegia', 'Columbine', 'Aquilegia', 'cottage'], ['astrantia', 'Masterwort', 'Astrantia major', 'cottage'], ['knautia', 'Macedonian scabious', 'Knautia macedonica', 'cottage'],
  ['salvia', 'Meadow sage', 'Salvia nemorosa', 'cottage'], ['hydrangea', 'Smooth hydrangea', 'Hydrangea arborescens', 'cottage'],
  ['monardaF', 'Wild bergamot', 'Monarda fistulosa', 'prairie'], ['monardaJ', 'Bee balm ‘Jacob Cline’', 'Monarda didyma', 'prairie'], ['echinacea', 'Purple coneflower', 'Echinacea purpurea', 'prairie'],
  ['echinaceaS', 'Coneflower, sunset', 'Echinacea', 'prairie'], ['rudbeckia', 'Black-eyed Susan', 'Rudbeckia fulgida', 'prairie'], ['aster', 'New England aster', 'Symphyotrichum novae-angliae', 'prairie'],
  ['baptisia', 'Blue false indigo', 'Baptisia australis', 'prairie'], ['amsonia', 'Bluestar', 'Amsonia hubrichtii', 'prairie'], ['coreopsis', 'Threadleaf coreopsis', 'Coreopsis verticillata', 'prairie'],
  ['achillea', 'Yarrow', 'Achillea', 'prairie'], ['agastache', 'Anise hyssop', 'Agastache', 'prairie'], ['asclepias', 'Butterfly weed', 'Asclepias tuberosa', 'prairie'],
  ['echinops', 'Globe thistle', 'Echinops ritro', 'prairie'], ['eutrochium', 'Joe-Pye weed', 'Eutrochium purpureum', 'prairie'], ['gaillardia', 'Blanket flower', 'Gaillardia', 'prairie'],
  ['helenium', 'Sneezeweed', 'Helenium autumnale', 'prairie'], ['heliopsis', 'False sunflower', 'Heliopsis helianthoides', 'prairie'], ['liatris', 'Blazing star', 'Liatris spicata', 'prairie'],
  ['penstemon', 'Beardtongue ‘Husker Red’', 'Penstemon digitalis', 'prairie'], ['solidago', 'Goldenrod', 'Solidago rugosa', 'prairie'], ['sanguisorba', 'Burnet', 'Sanguisorba officinalis', 'prairie'],
  ['persicaria', 'Mountain fleece', 'Persicaria amplexicaulis', 'prairie'], ['verbena', 'Tall verbena', 'Verbena bonariensis', 'prairie'], ['sedum', 'Stonecrop ‘Autumn Joy’', 'Hylotelephium', 'prairie'],
  ['hibiscus', 'Hardy hibiscus', 'Hibiscus moscheutos', 'bog'],
  ['calamagrostis', 'Feather reed grass', 'Calamagrostis × acutiflora', 'grass'], ['panicum', 'Switchgrass', 'Panicum virgatum', 'grass'], ['schizachyrium', 'Little bluestem', 'Schizachyrium scoparium', 'grass'],
  ['sporobolus', 'Prairie dropseed', 'Sporobolus heterolepis', 'grass'], ['pennisetum', 'Fountain grass', 'Pennisetum alopecuroides', 'grass'], ['sesleria', 'Autumn moor grass', 'Sesleria autumnalis', 'grass'],
  ['deschampsia', 'Tufted hair grass', 'Deschampsia cespitosa', 'grass'], ['hakonechloa', 'Japanese forest grass', 'Hakonechloa macra', 'grass'], ['molinia', 'Purple moor grass', 'Molinia caerulea', 'grass'],
  ['lavandula', 'English lavender', 'Lavandula angustifolia', 'med'], ['thymus', 'Creeping thyme', 'Thymus serpyllum', 'med'], ['perovskia', 'Russian sage', 'Salvia yangii', 'med'],
  ['alliumG', 'Allium ‘Globemaster’', 'Allium', 'bulb'], ['alliumM', 'Allium ‘Millenium’', 'Allium', 'bulb'], ['alliumS', 'Drumstick allium', 'Allium sphaerocephalon', 'bulb'],
];

// New plants: [key, common name, botanical name, category, [height, spread] in inches, years to full size, bloom months (0 = May … 4 = September), winter habit and timing, look]
const NEW = [
  // ---- cottage
  ['alcea', 'Hollyhock', 'Alcea rosea', 'cottage', [84, 24], 2, [2, 3], [],
    { form: 'rosette', leaves: 14, leaf: 'palmate', leafIn: [7, 7], rosUp: 0.45, leafCol: '#5a8048', stemCol: '#6a8050', spires: [1, 3], spireAt: 0.42, spireLean: 0.05, flStyle: 'delphinium', flCol: '#e86a9a', flIn: [8, 44], flN: 3, flAt: 'spires' }],
  ['campanula', 'Peach-leaved bellflower', 'Campanula persicifolia', 'cottage', [36, 18], 2, [1, 2], [],
    { form: 'rosette', leaves: 20, leaf: 'lance', leafIn: [1.0, 5], rosUp: 0.3, leafCol: '#3f6a3a', stemCol: '#4f6a40', spires: [3, 6], spireAt: 0.5, spireLean: 0.08, flStyle: 'foxglove', flCol: '#7a8ae8', flIn: [4, 18], flN: 6, flAt: 'spires' }],
  // ---- grasses and sedges
  ['miscanthus', 'Maiden grass', 'Miscanthus sinensis', 'grass', [78, 54], 3, [3, 4], ['grass', 'seedheads', 'late'],
    { form: 'grass', blades: 200, lean: [0.05, 0.5], leaf: 'blade', leafIn: [0.8, 1], bend: 0.5, bladeLen: 0.8, leafCol: '#5a8a5a', stemCol: '#a89a78', flStyle: 'plumeAiry', flCol: '#d8c0b0', flIn: [6, 16], flN: 26, plumeAt: 0.8, scapeLean: 0.08, stemR: 0.07 }],
  ['stipa', 'Mexican feather grass', 'Nassella tenuissima', 'grass', [22, 20], 1.5, [1, 2, 3], ['grass', 'seedheads'],
    { form: 'grass', blades: 260, lean: [0.2, 1.0], leaf: 'blade', leafIn: [0.25, 1], bend: 0.8, bladeLen: 0.9, leafCol: '#9ab07a', stemCol: '#c8b888', flStyle: 'plumeFeather', flCol: '#d8c890', flIn: [1.4, 10], flN: 40, plumeAt: 0.6, scapeLean: 0.3, stemR: 0.03 }],
  ['festuca', 'Blue fescue', 'Festuca glauca', 'grass', [10, 12], 2, [1, 2], ['evergreen'],
    { form: 'grass', blades: 150, lean: [0.2, 0.9], leaf: 'blade', leafIn: [0.3, 1], bend: 0.4, bladeLen: 0.75, leafCol: '#8fb0bc', stemCol: '#b0a880', flStyle: 'plumeTuft', flCol: '#c2b07a', flIn: [1.2, 6], flN: 16, plumeAt: 0.7, scapeLean: 0.1, stemR: 0.04 }],
  ['carex', 'Sedge ‘Evergold’', 'Carex oshimensis', 'grass', [12, 18], 2, [], ['evergreen'],
    { form: 'grass', blades: 90, lean: [0.3, 0.8], leaf: 'blade', leafIn: [0.5, 1], bend: 0.7, bladeLen: 0.9, leafCol: '#c2c46a', stemCol: '#9a9a5a', flN: 0 }],
  // ---- woodland shade
  ['hosta', 'Hosta', 'Hosta sieboldiana', 'shade', [26, 44], 4, [2, 3], [],
    { form: 'mound', moundH: 0.7, leaves: 46, leaf: 'broad', leafIn: [7, 10], leafCol: '#5e8f76', stemCol: '#8a8ab0', flStyle: 'lavender', flCol: '#b7a6e0', flIn: [1.6, 14], flN: 12, flAt: 'stalks' }],
  ['fern', 'Ostrich fern', 'Matteuccia struthiopteris', 'shade', [44, 30], 3, [], [],
    { form: 'rosette', leaves: 22, leaf: 'fern', leafIn: [7, 30], rosUp: 0.75, leafCol: '#4f8a3e', stemCol: '#5a7a40', spires: [0, 0], flN: 0 }],
  ['astilbe', 'Astilbe', 'Astilbe × arendsii', 'shade', [30, 24], 3, [1, 2], ['seedheads'],
    { form: 'upright', stems: 9, perStem: 5, basal: 14, lean: [0.25, 0.55], leaf: 'compound', leafIn: [5, 6], leafCol: '#3f6a34', stemCol: '#6a3a3a', flStyle: 'plumeFeather', flCol: '#e58ab0', flIn: [4, 12], flN: 9, flAt: 'tips' }],
  ['heuchera', 'Coral bells', 'Heuchera ‘Palace Purple’', 'shade', [18, 20], 2, [1, 2], ['evergreen'],
    { form: 'mound', moundH: 0.5, leaves: 60, leaf: 'round', leafIn: [3.6, 3.6], leafCol: '#6a3448', stemCol: '#7a4a52', flStyle: 'haze', flCol: '#f2e6ea', flIn: [2.6, 12], flN: 14, flAt: 'stalks' }],
  ['helleborus', 'Lenten rose', 'Helleborus × hybridus', 'shade', [18, 22], 3, [0], ['evergreen', 'early'],
    { form: 'mound', moundH: 0.7, leaves: 44, leaf: 'digitate', leafIn: [5.5, 5.5], leafCol: '#2f5630', stemCol: '#5a6a48', flStyle: 'anemone', flCol: '#b48aa0', flEye: '#e8e2a0', flIn: 2.6, flN: 14, flAt: 'surface', nod: true }],
  ['brunnera', 'Siberian bugloss', 'Brunnera macrophylla', 'shade', [16, 22], 2, [0], ['early'],
    { form: 'mound', moundH: 0.6, leaves: 50, leaf: 'round', leafIn: [4.6, 4.6], leafCol: '#7fa08a', stemCol: '#6a8a6a', flStyle: 'froth', flCol: '#6a9ae8', flIn: 4, flN: 22, flAt: 'stalks' }],
  ['dicentra', 'Bleeding heart', 'Lamprocapnos spectabilis', 'shade', [30, 30], 3, [0, 1], ['early'],
    { form: 'upright', stems: 9, perStem: 4, basal: 14, lean: [0.5, 0.95], leaf: 'compound', leafIn: [5, 5.5], leafCol: '#5a8a5a', stemCol: '#8a5a5a', flStyle: 'baptisia', flCol: '#e8508a', flIn: [2.2, 9], flN: 9, flAt: 'tips' }, 2.0],
  ['actaea', 'Bugbane', 'Actaea simplex', 'shade', [60, 30], 4, [3, 4], ['late'],
    { form: 'rosette', leaves: 14, leaf: 'compound', leafIn: [8, 9], rosUp: 0.5, leafCol: '#3a4a3a', stemCol: '#4a3a4a', spires: [2, 4], spireAt: 0.5, spireLean: 0.08, flStyle: 'veronica', flCol: '#f4f0ea', flIn: [2.2, 20], flN: 4, flAt: 'spires' }],
  ['polygonatum', 'Solomon’s seal', 'Polygonatum × hybridum', 'shade', [30, 20], 4, [], [],
    { form: 'upright', stems: 9, perStem: 9, lean: [0.6, 1.0], leaf: 'ovate', leafIn: [1.8, 4.2], leafCol: '#5a8a4a', stemCol: '#5a7a48', flN: 0 }],
  // ---- Mediterranean and dry gardens
  ['rosmarinus', 'Rosemary', 'Salvia rosmarinus', 'med', [40, 40], 4, [0, 1], ['evergreen'],
    { form: 'shrub', stems: 26, perStem: 14, lean: [0.3, 0.7], leaf: 'thread', leafIn: [1.2, 1.6], leafCol: '#5a7462', stemCol: '#6a5a48', flStyle: 'froth', flCol: '#8aa2e6', flIn: 2.2, flN: 60, flAt: 'upper' }],
  ['santolina', 'Cotton lavender', 'Santolina chamaecyparissus', 'med', [20, 30], 3, [1, 2], ['evergreen'],
    { form: 'mound', moundH: 0.6, leaves: 180, leaf: 'thread', leafIn: [1.4, 2.2], leafCol: '#b4bcb0', stemCol: '#a8b0a0', flStyle: 'allium', flCol: '#f0d43a', flIn: 0.8, flN: 70, flAt: 'stalks' }],
  ['euphorbia', 'Mediterranean spurge', 'Euphorbia characias', 'med', [42, 36], 3, [0, 1], ['evergreen', 'early'],
    { form: 'upright', stems: 14, perStem: 18, lean: [0.25, 0.6], leaf: 'lance', leafIn: [0.9, 4.4], leafCol: '#7f9a8e', stemCol: '#8a8a6a', flStyle: 'froth', flCol: '#c6d84a', flIn: 7, flN: 14, flAt: 'tips' }],
  ['cistus', 'Rock rose', 'Cistus × hybridus', 'med', [36, 44], 3, [1, 2], ['evergreen'],
    { form: 'shrub', stems: 22, perStem: 8, opposite: true, lean: [0.4, 0.85], leaf: 'ovate', leafIn: [1.2, 2.6], leafCol: '#5e7858', stemCol: '#6a5a48', flStyle: 'anemone', flCol: '#f8f4ee', flEye: '#f2d24a', flIn: 2.8, flN: 40, flAt: 'upper' }],
  ['phlomis', 'Jerusalem sage', 'Phlomis fruticosa', 'med', [40, 40], 3, [1, 2], ['evergreen', 'seedheads'],
    { form: 'upright', stems: 12, perStem: 7, opposite: true, lean: [0.3, 0.6], leaf: 'fuzzy', leafIn: [2.4, 5], leafCol: '#93a184', stemCol: '#9aa08a', flStyle: 'whorl', flCol: '#ecc83a', flEye: '#b8922a', flIn: 3, flN: 30, flAt: 'upper' }],
  ['artemisia', 'Wormwood ‘Powis Castle’', 'Artemisia', 'med', [28, 40], 2, [], ['evergreen'],
    { form: 'mound', moundH: 0.75, leaves: 240, leaf: 'fern', leafIn: [2.4, 3.4], leafCol: '#b9c2bc', stemCol: '#aab2ac', flN: 0 }],
  ['eryngium', 'Sea holly', 'Eryngium planum', 'med', [30, 20], 3, [2, 3], ['seedheads'],
    { form: 'upright', stems: 8, perStem: 7, lean: [0.2, 0.5], leaf: 'fern', leafIn: [2.4, 5], leafCol: '#7a94a0', stemCol: '#7a8ab8', flStyle: 'echinops', flCol: '#6a82d8', flIn: 1.4, flN: 30, flAt: 'tips' }],
  ['kniphofia', 'Red-hot poker', 'Kniphofia uvaria', 'med', [40, 30], 3, [2, 3], [],
    { form: 'grass', blades: 70, lean: [0.2, 0.7], leaf: 'blade', leafIn: [0.9, 1], bend: 0.6, bladeLen: 0.6, leafCol: '#5a7e4a', stemCol: '#6a7a4a', flStyle: 'plumeBrush', flCol: '#f0642a', flIn: [2.6, 9], flN: 9, plumeAt: 0.86, scapeLean: 0.06, stemR: 0.16 }],
  ['agapanthus', 'Lily of the Nile', 'Agapanthus africanus', 'med', [34, 26], 4, [2, 3], [],
    { form: 'strap', blades: 34, leaf: 'sword', leafIn: [1.4, 1], bend: 0.5, bladeLen: 0.5, leafCol: '#3f7a44', stemCol: '#4f7a48', flStyle: 'allium', flCol: '#5a6ad8', flIn: 6, flN: 7, scapeLean: 0.1, stemR: 0.16 }],
  ['crocosmia', 'Montbretia ‘Lucifer’', 'Crocosmia', 'med', [40, 22], 3, [2, 3], [],
    { form: 'grass', blades: 60, lean: [0.1, 0.5], leaf: 'sword', leafIn: [1.0, 1], bend: 0.3, bladeLen: 0.75, leafCol: '#5a8a3e', stemCol: '#6a7a3a', flStyle: 'plumeTuft', flCol: '#e0321a', flIn: [3, 12], flN: 10, plumeAt: 0.8, scapeLean: 0.25 }],
  ['verbascum', 'Mullein', 'Verbascum olympicum', 'med', [60, 24], 2, [1, 2, 3], ['seedheads'],
    { form: 'rosette', leaves: 18, leaf: 'fuzzy', leafIn: [5, 12], rosUp: 0.3, leafCol: '#a9b49c', stemCol: '#a8b09a', spires: [1, 3], spireAt: 0.45, spireLean: 0.05, flStyle: 'veronica', flCol: '#f0d84a', flIn: [2.6, 30], flN: 3, flAt: 'spires' }],
  // ---- desert and succulents
  ['agave', 'Parry’s agave', 'Agave parryi', 'desert', [24, 34], 8, [], ['evergreen'],
    { form: 'strap', blades: 30, lean: [0.25, 0.95], leaf: 'sword', leafIn: [4.6, 1], bend: 0.12, bladeLen: 0.9, leafCol: '#8fa7a4', stemCol: '#8a9a9a', flN: 0 }],
  ['agaveA', 'Century plant', 'Agave americana', 'desert', [60, 84], 10, [], ['evergreen'],
    { form: 'strap', blades: 34, lean: [0.2, 1.0], leaf: 'sword', leafIn: [8, 1], bend: 0.18, bladeLen: 0.95, leafCol: '#7f9ea0', stemCol: '#8a9a9a', flN: 0 }],
  ['yucca', 'Adam’s needle', 'Yucca filamentosa', 'desert', [66, 40], 4, [1, 2], ['evergreen'],
    { form: 'grass', blades: 80, lean: [0.2, 0.9], leaf: 'sword', leafIn: [1.5, 1], bend: 0.1, bladeLen: 0.45, leafCol: '#5e8068', stemCol: '#8a9a7a', flStyle: 'foxglove', flCol: '#f4efd8', flIn: [10, 26], flN: 2, plumeAt: 0.72, scapeLean: 0.03, stemR: 0.3 }],
  ['aloe', 'Aloe', 'Aloe striatula', 'desert', [30, 30], 5, [1, 2], ['evergreen'],
    { form: 'grass', blades: 26, lean: [0.3, 0.9], leaf: 'sword', leafIn: [2.6, 1], bend: 0.2, bladeLen: 0.62, leafCol: '#6f9a78', stemCol: '#9a7a5a', flStyle: 'plumeBrush', flCol: '#f07a2a', flIn: [2.4, 8], flN: 4, plumeAt: 0.88, scapeLean: 0.05, stemR: 0.18 }],
  ['hesperaloe', 'Red yucca', 'Hesperaloe parviflora', 'desert', [48, 40], 4, [1, 2, 3], ['evergreen'],
    { form: 'grass', blades: 110, lean: [0.3, 0.9], leaf: 'blade', leafIn: [0.6, 1], bend: 0.5, bladeLen: 0.5, leafCol: '#5a7a6a', stemCol: '#b05a5a', flStyle: 'penstemon', flCol: '#e8607a', flIn: [6, 16], flN: 7, plumeAt: 0.75, scapeLean: 0.2, stemR: 0.1 }],
  ['opuntia', 'Prickly pear', 'Opuntia humifusa', 'desert', [18, 36], 5, [1], ['evergreen'],
    { form: 'mound', moundH: 0.9, leaves: 22, leaf: 'round', leafIn: [6.5, 6.5], leafCol: '#6f9068', stemCol: '#6f9068', flStyle: 'poppy', flCol: '#f2d23a', flIn: 3, flN: 12, flAt: 'surface' }],
  ['echeveria', 'Echeveria', 'Echeveria elegans', 'desert', [5, 12], 3, [2], ['evergreen'],
    { form: 'mound', moundH: 0.5, leaves: 90, leaf: 'fleshy', leafIn: [1.4, 1.4], leafCol: '#8fae9c', stemCol: '#b08a8a', flStyle: 'umbel', flCol: '#e8908a', flIn: 1.6, flN: 5, flAt: 'stalks' }],
  ['delosperma', 'Ice plant', 'Delosperma cooperi', 'desert', [5, 24], 2, [1, 2, 3, 4], ['evergreen'],
    { form: 'mound', moundH: 0.35, leaves: 200, leaf: 'fleshy', leafIn: [0.9, 0.9], leafCol: '#7fa66e', stemCol: '#7fa66e', flStyle: 'aster', flCol: '#e23ab0', flEye: '#f6e04a', flIn: 1.5, flN: 110, flAt: 'surface' }],
  ['dasylirion', 'Desert spoon', 'Dasylirion wheeleri', 'desert', [48, 54], 9, [], ['evergreen'],
    { form: 'strap', blades: 220, lean: [0.2, 1.1], leaf: 'blade', leafIn: [0.55, 1], bend: 0.12, bladeLen: 0.95, leafCol: '#93aab0', stemCol: '#8a9a9a', flN: 0 }],
  ['euphorbiaR', 'Gopher spurge', 'Euphorbia rigida', 'desert', [20, 26], 3, [0], ['evergreen', 'early'],
    { form: 'upright', stems: 16, perStem: 16, lean: [0.5, 0.95], leaf: 'fleshy', leafIn: [1.0, 1.8], leafCol: '#93aeb0', stemCol: '#9aaea8', flStyle: 'froth', flCol: '#d8e04a', flIn: 4, flN: 16, flAt: 'tips' }],
  // ---- tropical
  ['canna', 'Canna', 'Canna × generalis', 'tropic', [66, 30], 1.5, [2, 3, 4], ['late'],
    { form: 'upright', stems: 6, perStem: 6, lean: [0.08, 0.25], leaf: 'broad', leafIn: [8, 20], leafCol: '#3f7a3a', stemCol: '#4f7a40', flStyle: 'daylily', flCol: '#e8351c', flEye: '#f0a020', flIn: 5, flN: 12, flAt: 'tips' }],
  ['hedychium', 'Ginger lily', 'Hedychium gardnerianum', 'tropic', [60, 36], 3, [3, 4], ['late'],
    { form: 'upright', stems: 8, perStem: 10, lean: [0.15, 0.4], leaf: 'lance', leafIn: [3.4, 14], leafCol: '#3f7a3e', stemCol: '#4f7a44', flStyle: 'lupine', flCol: '#f4d27a', flIn: [5, 12], flN: 8, flAt: 'tips' }],
  ['colocasia', 'Elephant ear', 'Colocasia esculenta', 'tropic', [54, 48], 1.5, [], ['late'],
    { form: 'mound', moundH: 1.0, leaves: 12, leaf: 'broad', leafIn: [20, 28], leafCol: '#2f6a3a', stemCol: '#4a7a4a', flN: 0 }],
  ['colocasiaB', 'Elephant ear ‘Black Magic’', 'Colocasia esculenta', 'tropic', [54, 44], 1.5, [], ['late'],
    { form: 'mound', moundH: 1.0, leaves: 12, leaf: 'broad', leafIn: [18, 26], leafCol: '#2a2430', stemCol: '#3a2a3a', flN: 0 }],
  ['musa', 'Hardy banana', 'Musa basjoo', 'tropic', [120, 84], 3, [], ['late'],
    { form: 'strap', blades: 9, lean: [0.2, 0.75], leaf: 'broad', leafIn: [22, 1], bend: 0.3, bladeLen: 0.95, leafCol: '#5f9a4a', stemCol: '#7a9a5a', flN: 0 }],
  ['strelitzia', 'Bird of paradise', 'Strelitzia reginae', 'tropic', [54, 40], 5, [1, 2, 3], ['evergreen'],
    { form: 'strap', blades: 16, lean: [0.15, 0.55], leaf: 'broad', leafIn: [7, 1], bend: 0.2, bladeLen: 0.9, leafCol: '#4f7f5a', stemCol: '#5a7a5a', flStyle: 'iris', flCol: '#f08a1a', flEye: '#3a4ad0', flCol2: '#3a4ad0', flIn: 6, flN: 4, scapeLean: 0.1 }],
  ['hibiscusT', 'Chinese hibiscus', 'Hibiscus rosa-sinensis', 'tropic', [60, 48], 3, [1, 2, 3, 4], ['woody'],
    { form: 'shrub', stems: 14, perStem: 8, lean: [0.3, 0.7], leaf: 'ovate', leafIn: [2.6, 4.2], leafCol: '#2f6a34', stemCol: '#5a5a3a', gloss: true, flStyle: 'hibiscus', flCol: '#f04a2a', flEye: '#8a1020', flIn: 6, flN: 18, flAt: 'tips' }],
  ['dahlia', 'Dahlia', 'Dahlia', 'tropic', [44, 26], 1, [2, 3, 4], ['late'],
    { form: 'upright', stems: 8, perStem: 6, opposite: true, lean: [0.2, 0.5], leaf: 'compound', leafIn: [4.5, 5.5], leafCol: '#3a6a34', stemCol: '#5a4a3a', flStyle: 'peonyCup', flCol: '#e84a6a', flEye: '#f0a030', flIn: 5, flN: 16, flAt: 'tips' }],
  ['zantedeschia', 'Calla lily', 'Zantedeschia aethiopica', 'tropic', [30, 22], 2, [1, 2], [],
    { form: 'mound', moundH: 0.9, leaves: 22, leaf: 'broad', leafIn: [5.5, 11], leafCol: '#3f7a48', stemCol: '#5a8a5a', flStyle: 'aquilegia', flCol: '#faf7ee', flEye: '#f2d24a', flIn: 4, flN: 7, flAt: 'stalks' }],
  ['phormium', 'New Zealand flax', 'Phormium tenax', 'tropic', [60, 54], 4, [], ['evergreen'],
    { form: 'strap', blades: 60, lean: [0.1, 0.6], leaf: 'sword', leafIn: [2.4, 1], bend: 0.3, bladeLen: 0.95, leafCol: '#6a4a48', stemCol: '#5a4a44', flN: 0 }],
  ['brugmansia', 'Angel’s trumpet', 'Brugmansia', 'tropic', [84, 60], 3, [2, 3, 4], ['woody'],
    { form: 'shrub', stems: 12, perStem: 8, lean: [0.3, 0.7], leaf: 'broad', leafIn: [5, 10], leafCol: '#5a8a4a', stemCol: '#7a7a5a', flStyle: 'daylily', flCol: '#f6e6b4', flEye: '#f0d890', flIn: 8, flN: 26, flAt: 'upper', nod: true }],
  // ---- water's edge
  ['irisP', 'Yellow flag', 'Iris pseudacorus', 'bog', [44, 30], 3, [0, 1], ['early'],
    { form: 'strap', blades: 50, leaf: 'sword', leafIn: [1.1, 1], leafCol: '#4f8a4a', stemCol: '#4f7650', flStyle: 'iris', flCol: '#f2cf2a', flEye: '#b8862a', flIn: 4.2, flN: 14, flAt: 'scapes', bend: 0.15, bladeLen: 0.85 }],
  ['ligularia', 'Leopard plant ‘The Rocket’', 'Ligularia stenocephala', 'bog', [60, 36], 3, [2, 3], [],
    { form: 'rosette', leaves: 14, leaf: 'round', leafIn: [9, 9], rosUp: 0.55, leafCol: '#3f6a3a', stemCol: '#3a2a3a', spires: [2, 4], spireAt: 0.5, spireLean: 0.05, flStyle: 'veronica', flCol: '#f2c81a', flIn: [3, 26], flN: 4, flAt: 'spires' }],
  ['rodgersia', 'Rodgersia', 'Rodgersia aesculifolia', 'bog', [48, 44], 4, [1, 2], ['seedheads'],
    { form: 'rosette', leaves: 12, leaf: 'palmate', leafIn: [14, 14], rosUp: 0.6, leafCol: '#4a6a3a', stemCol: '#6a4a3a', spires: [1, 3], spireAt: 0.55, spireLean: 0.06, flStyle: 'plumeFeather', flCol: '#f0dcc8', flIn: [7, 18], flN: 3, flAt: 'spires' }],
  ['lobelia', 'Cardinal flower', 'Lobelia cardinalis', 'bog', [40, 18], 2, [2, 3, 4], [],
    { form: 'rosette', leaves: 14, leaf: 'lance', leafIn: [1.6, 5], rosUp: 0.35, leafCol: '#3f5a3a', stemCol: '#5a3a3a', spires: [2, 5], spireAt: 0.5, spireLean: 0.05, flStyle: 'salvia', flCol: '#d8141c', flIn: [2.4, 18], flN: 5, flAt: 'spires' }],
  ['filipendula', 'Queen of the prairie', 'Filipendula rubra', 'bog', [66, 40], 3, [1, 2], ['seedheads'],
    { form: 'upright', stems: 10, perStem: 6, lean: [0.15, 0.4], leaf: 'palmate', leafIn: [6, 6], leafCol: '#3f6a34', stemCol: '#7a4a4a', flStyle: 'plumeAiry', flCol: '#f08ab0', flIn: [8, 12], flN: 10, flAt: 'tips' }],
  ['gunnera', 'Giant rhubarb', 'Gunnera manicata', 'bog', [84, 120], 4, [], ['late'],
    { form: 'mound', moundH: 1.0, leaves: 9, leaf: 'round', leafIn: [50, 50], leafCol: '#3f6a30', stemCol: '#6a5a3a', flN: 0 }],
  ['typha', 'Cattail', 'Typha latifolia', 'bog', [72, 30], 2, [1, 2, 3, 4], ['grass', 'seedheads'],
    { form: 'grass', blades: 90, lean: [0.03, 0.25], leaf: 'blade', leafIn: [0.8, 1], bend: 0.2, bladeLen: 0.95, leafCol: '#5a8a5a', stemCol: '#7a8a5a', flStyle: 'plumeBrush', flCol: '#5a3a22', flIn: [1.6, 8], flN: 14, plumeAt: 0.9, scapeLean: 0.03, stemR: 0.12 }],
  ['caltha', 'Marsh marigold', 'Caltha palustris', 'bog', [14, 18], 2, [0], ['early'],
    { form: 'mound', moundH: 0.7, leaves: 50, leaf: 'round', leafIn: [3.4, 3.4], leafCol: '#3f7a3a', stemCol: '#4f7a40', flStyle: 'coreopsis', flCol: '#f6d21a', flEye: '#e0a010', flIn: 1.6, flN: 40, flAt: 'surface' }, 1.8],
  // ---- alpine and rock garden
  ['sempervivum', 'Hens and chicks', 'Sempervivum tectorum', 'alpine', [4, 10], 3, [2], ['evergreen'],
    { form: 'mound', moundH: 0.45, leaves: 110, leaf: 'fleshy', leafIn: [1.1, 1.1], leafCol: '#7f9a7a', stemCol: '#a07a7a', flStyle: 'aster', flCol: '#d8708a', flEye: '#e8d080', flIn: 1.0, flN: 6, flAt: 'stalks' }],
  ['pulsatilla', 'Pasque flower', 'Pulsatilla vulgaris', 'alpine', [10, 12], 3, [0], ['early', 'seedheads'],
    { form: 'mound', moundH: 0.7, leaves: 70, leaf: 'fern', leafIn: [2, 3.4], leafCol: '#7f9a7a', stemCol: '#8a9a8a', flStyle: 'anemone', flCol: '#7a4ab8', flEye: '#f2d24a', flIn: 2.4, flN: 14, flAt: 'stalks' }],
  ['gentiana', 'Gentian', 'Gentiana septemfida', 'alpine', [8, 14], 3, [3, 4], ['late'],
    { form: 'mound', moundH: 0.5, leaves: 120, leaf: 'lance', leafIn: [0.7, 1.8], leafCol: '#3f6a3a', stemCol: '#4f6a40', flStyle: 'platycodon', flCol: '#2438c8', flIn: 1.8, flN: 40, flAt: 'surface' }],
  ['armeria', 'Sea thrift', 'Armeria maritima', 'alpine', [8, 12], 2, [0, 1], ['evergreen'],
    { form: 'strap', blades: 130, lean: [0.3, 1.0], leaf: 'blade', leafIn: [0.35, 1], bend: 0.5, bladeLen: 0.45, leafCol: '#4f7a4a', stemCol: '#6a7a5a', flStyle: 'allium', flCol: '#f07ab0', flIn: 1.3, flN: 16, scapeLean: 0.12, stemR: 0.06 }],
  ['aubrieta', 'Rock cress', 'Aubrieta deltoidea', 'alpine', [5, 20], 2, [0], ['evergreen', 'early'],
    { form: 'mound', moundH: 0.35, leaves: 220, leaf: 'ovate', leafIn: [0.6, 0.9], leafCol: '#6a8a6a', stemCol: '#6a8a6a', flStyle: 'geranium', flCol: '#8a3ac8', flEye: '#f2e6a0', flIn: 0.8, flN: 160, flAt: 'surface' }],
  ['saxifraga', 'Saxifrage', 'Saxifraga × arendsii', 'alpine', [6, 12], 3, [0, 1], ['evergreen'],
    { form: 'mound', moundH: 0.4, leaves: 200, leaf: 'fleshy', leafIn: [0.6, 0.6], leafCol: '#7fa07a', stemCol: '#a07a7a', flStyle: 'star', flCol: '#f6f2ee', flIn: 2.2, flN: 26, flAt: 'stalks' }],
  ['campanulaC', 'Carpathian bellflower', 'Campanula carpatica', 'alpine', [9, 14], 2, [1, 2, 3], [],
    { form: 'mound', moundH: 0.6, leaves: 130, leaf: 'serrate', leafIn: [1.0, 1.3], leafCol: '#4f7a4a', stemCol: '#4f7a4a', flStyle: 'platycodon', flCol: '#7a7ae0', flIn: 1.6, flN: 60, flAt: 'surface' }],
  // ---- bulbs
  ['tulipa', 'Tulip', 'Tulipa', 'bulb', [18, 6], 1, [0], ['early'],
    { form: 'strap', blades: 4, lean: [0.15, 0.5], leaf: 'sword', leafIn: [2.2, 1], bend: 0.3, bladeLen: 0.6, leafCol: '#6f9a7a', stemCol: '#6f9a6a', flStyle: 'poppy', flCol: '#e02a2a', flIn: 3, flN: 1, scapeLean: 0.03, stemR: 0.14 }, 1.3],
  ['narcissus', 'Daffodil', 'Narcissus', 'bulb', [16, 8], 2, [0], ['early'],
    { form: 'strap', blades: 9, lean: [0.1, 0.4], leaf: 'blade', leafIn: [0.7, 1], bend: 0.25, bladeLen: 0.8, leafCol: '#5f9a6a', stemCol: '#5f9a5a', flStyle: 'coreopsis', flCol: '#f8dc3a', flEye: '#f0a020', flIn: 2.6, flN: 3, scapeLean: 0.05, stemR: 0.1 }, 1.5],
  ['camassia', 'Camas', 'Camassia leichtlinii', 'bulb', [30, 14], 3, [0], ['early'],
    { form: 'grass', blades: 26, lean: [0.1, 0.5], leaf: 'blade', leafIn: [0.8, 1], bend: 0.4, bladeLen: 0.6, leafCol: '#4f8a4a', stemCol: '#5a8a4a', flStyle: 'veronica', flCol: '#6a7ae0', flIn: [2.4, 12], flN: 4, plumeAt: 0.8, scapeLean: 0.05, stemR: 0.1 }, 1.8],
];

export const FLORA = [];
for (const [k, name, latin, cat] of OLD) if (LOOKS[k] && SIZE[k]) FLORA.push({ k, name, latin, cat });
for (const [k, name, latin, cat, size, years, bloom, cls, look, dormant] of NEW) {
  LOOKS[k] = look; SIZE[k] = size; addSpecies(k, { bloom, cls, years, dormant }); FLORA.push({ k, name, latin, cat, added: true });
}
const ft = inch => inch >= 30 ? (Math.round(inch / 6) / 2) + ' ft' : Math.round(inch) + ' in';
for (const f of FLORA) {
  const [h, w] = SIZE[f.k], L = LOOKS[f.k];
  f.h = h; f.w = w; f.years = GROW_YEARS[f.k] || 2.5; f.space = Math.round(w * 0.9);           // set them their spread apart, a little less, and they knit
  f.bloom = bloomLabel(f.k); f.leafCol = L.leafCol; f.flCol = L.flStyle ? L.flCol : null;
  f.meta = `${ft(h)} tall · ${ft(w)} wide · space ${ft(f.space)} · full size in ${f.years === 1 ? 'a year' : f.years + ' years'}` + (f.bloom ? ` · flowers ${f.bloom}` : ' · foliage');
}
export const FLORA_BY_KEY = Object.fromEntries(FLORA.map(f => [f.k, f]));
