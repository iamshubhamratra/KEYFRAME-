// IMPORT THE LONG-FORM HANDOFF — 58 five-minute 16:9 kinetic-typography films.
//
// The handoff ships each film as a self-contained `standalone/<slug>.html`: a
// __bundler page whose `__bundler/manifest` block holds every resource (engine,
// kit, per-film identity, four woff2 faces) as base64 gzip keyed by UUID. The
// omelette renderer already knows how to drive that shape, so a film needs no
// composer of its own — it becomes a frame pack that names its bundle.
//
// EXACTLY ONE EDIT IS REQUIRED, and it is not cosmetic. The engine's SceneStage
// reserves room for its on-screen scrubber:
//
//     const barH = 44; // playback bar height
//     const s = Math.min(el.clientWidth / width, (el.clientHeight - barH) / height);
//
// A browser preview wants that. A RENDER does not: hyperframes captures the full
// 1920x1080 stage, so 44 reserved pixels scale the film down and leave a band of
// desk colour along the bottom of every frame of every film. Setting it to 0 is
// what the shipped Field Notes bundle does — diffing the shipped bundle against
// its handoff twin shows a single differing resource, differing by a single
// character. This script reproduces that edit rather than re-deriving it, so
// every one of the 58 is imported the way the proven one was.
//
// Everything else (pack.json, FRAME.md) is generated from the film's OWN
// identity — the palette/fonts it declares in source/lf-pack-N.js, resolved
// against the tweaks its own page sets — rather than hand-transcribed, so a pack
// can never drift from the film it renders.
//
// Re-run scripts/fix-pack-grounds.js --write afterwards: pack.json is regenerated
// from the identity's paper/ink, and 48 of these films paint a DARK page behind a
// light-declared palette. scripts/compare-handoff.js --src <same dir> then reports
// whether every installed bundle still equals the handoff.
//
//   node scripts/import-longform-handoff.js --src <longform-handoff dir> [--force] [--only slug]
//
// Idempotent: an existing pack is skipped unless --force.

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const FORCE = argv.includes("--force");
const ONLY = argOf("only", null);
const SRC = argOf("src", null);
if (!SRC) { console.error("usage: node scripts/import-longform-handoff.js --src <longform-handoff dir>"); process.exit(1); }

const ROOT = path.resolve(__dirname, "..", "..");           // repo root
const FRAMES_DIR = path.join(ROOT, "frames");
const TPL_DIR = path.join(ROOT, "server", "public", "omelette-templates");

// Per-film editorial metadata, transcribed from the handoff README's own table.
// The palette, fonts and brand come from the film's code; only the things code
// cannot state — what the film is ABOUT, and therefore what stock imagery and
// music suit it — live here.
const NICHE = {
  "fetch-club":      { niche: "dogs / off-leash club", world: "trotting dog with cycling legs, bouncing ball, paw prints", kw: ["dog", "puppy", "park", "pet", "walk", "ball"], bgm: "bright playful acoustic, hand claps, sunny", energy: "upbeat", photo: "warm natural light, candid outdoor pets" },
  "nine-lives":      { niche: "cats", world: "breathing cat, twitching ear, unspooling yarn, dust motes", kw: ["cat", "kitten", "pet", "yarn", "window", "nap"], bgm: "soft plucked strings, unhurried, cosy", energy: "calm", photo: "soft window light, cosy interior" },
  "knife-and-board": { niche: "cooking / prep", world: "chopping knife, flying herbs, simmering pot with steam", kw: ["cooking", "kitchen", "food", "chef", "herbs", "knife"], bgm: "warm rhythmic acoustic, kitchen energy", energy: "medium", photo: "warm kitchen light, rustic food styling" },
  "lunch-hour":      { niche: "office lunch / workplace", world: "sweeping clock, bento grid filling, queue of dots", kw: ["office", "lunch", "desk", "bento", "team", "break"], bgm: "clean modern indie pop, light percussion", energy: "upbeat" , photo: "bright modern workplace, clean editorial"},
  "ship-log":        { niche: "dev tooling / CI", world: "commit graph drawing, terminal typing, packets on a wire", kw: ["code", "terminal", "developer", "server", "pipeline", "software"], bgm: "minimal electronic, steady pulse, technical", energy: "medium", photo: "dark technical workspace, screens and code" },
  "split-times":     { niche: "running", world: "bobbing runner, curved track, live split readout", kw: ["running", "track", "athlete", "race", "training", "sport"], bgm: "driving electronic, insistent tempo", energy: "high", photo: "high-contrast sports photography, motion" },
  "dawn-chorus":     { niche: "birdwatching", world: "birds flapping on sine paths, four on a wire, rising sun", kw: ["bird", "nature", "dawn", "forest", "wildlife", "sky"], bgm: "gentle ambient folk, airy, spacious", energy: "calm", photo: "soft dawn light, nature photography" },
  "canopy":          { niche: "rainforest / ecology", world: "swaying leaf layers, light shafts, drips, hanging vine", kw: ["rainforest", "jungle", "leaf", "canopy", "green", "nature"], bgm: "lush ambient pads, organic percussion", energy: "calm", photo: "deep green foliage, dappled light" },
  "ledger-and-lift": { niche: "personal finance", world: "candlestick chart building, tilting card, rising coins", kw: ["finance", "money", "savings", "chart", "budget", "invest"], bgm: "confident minimal piano, forward motion", energy: "medium", photo: "clean editorial finance, considered still life" },
  "tide-table":      { niche: "coast / sea swimming", world: "four wave layers, spinning parasol, gulls, sun glare", kw: ["sea", "coast", "swim", "beach", "wave", "tide"], bgm: "breezy surf guitar, open and bright", energy: "medium", photo: "coastal daylight, open water" },
  "hive-mind":       { niche: "beekeeping", world: "comb cells filling, bees on figure-eights, smoker", kw: ["bee", "honey", "hive", "apiary", "flower", "pollen"], bgm: "warm folk with gentle drone, golden", energy: "calm", photo: "golden hour, warm honey tones" },
  "wheel-and-spoke": { niche: "cycling", world: "two spinning spoked wheels, road dashes, climb profile", kw: ["cycling", "bike", "road", "ride", "wheel", "sport"], bgm: "rolling indie rock, steady cadence", energy: "medium", photo: "open road, dynamic outdoor sport" },
  "loft-notes":      { niche: "vinyl / record collecting", world: "spinning platter, tracking tonearm, EQ bars, sleeve rack", kw: ["vinyl", "record", "music", "turntable", "audio", "sleeve"], bgm: "warm dusty soul groove, vinyl crackle", energy: "medium", photo: "warm interior, analogue textures" },
  "kiln-fire":       { niche: "ceramics / pottery", world: "wobbling wheel with rising pot, glowing kiln, bending cone", kw: ["pottery", "ceramic", "clay", "kiln", "craft", "studio"], bgm: "earthy acoustic, patient, handmade", energy: "calm", photo: "studio craft light, clay and hands" },
  "night-shift":     { niche: "24h bakery / night city", world: "windows lighting at random, delivery van, sweeping clock", kw: ["night", "bakery", "city", "bread", "neon", "shift"], bgm: "late-night lo-fi, warm keys, quiet city", energy: "calm", photo: "night city light, warm windows" },
  "allotment":       { niche: "vegetable plot", world: "rows of seedlings growing, watering can, hopping robin", kw: ["garden", "vegetable", "allotment", "grow", "soil", "harvest"], bgm: "gentle fingerpicked folk, unhurried", energy: "calm", photo: "soft daylight, garden and soil" },
  "slow-pour":       { niche: "coffee", world: "spiralling pour, blooming bubbles, drips, live scale", kw: ["coffee", "brew", "cafe", "pour", "beans", "barista"], bgm: "mellow jazz-adjacent keys, café warmth", energy: "calm", photo: "warm café light, close craft detail" },
  "chalk-and-crimp": { niche: "climbing", world: "holds popping in sequence, chalk puff, swinging rope", kw: ["climbing", "boulder", "chalk", "rock", "route", "grip"], bgm: "taut percussive rock, building tension", energy: "high", photo: "textured rock, dramatic directional light" },
  "stitch-line":     { niche: "sewing / making", world: "bobbing needle, feeding stitch line, pattern pieces, tape", kw: ["sewing", "fabric", "stitch", "pattern", "textile", "craft"], bgm: "light acoustic with rhythmic pulse", energy: "medium", photo: "bright craft table, fabric texture" },
  "blitz-hour":      { niche: "chess", world: "knight hopping L-moves, fast clock with falling flag", kw: ["chess", "board", "strategy", "clock", "game", "tournament"], bgm: "tense minimal strings, ticking pulse", energy: "medium", photo: "high-contrast tabletop, dramatic shadow" },
  "safelight":       { niche: "darkroom photography", world: "pulsing red bulb, swaying negatives, tray ripples", kw: ["darkroom", "film", "photography", "negative", "print", "analog"], bgm: "moody ambient, red-lit and patient", energy: "calm", photo: "deep shadow, single-source red light" },
  "reef-tank":       { niche: "marine aquarium", world: "fish schooling in a glass box, swaying anemones, bubbles", kw: ["aquarium", "reef", "fish", "coral", "tank", "marine"], bgm: "shimmering ambient, submerged and slow", energy: "calm", photo: "blue aquatic light, vivid coral colour" },
  "branch-line":     { niche: "steam railway", world: "loco crossing with steam, semaphore arm, telegraph poles", kw: ["railway", "steam", "train", "track", "station", "heritage"], bgm: "nostalgic brass-tinged folk, rolling", energy: "medium", photo: "heritage railway, steam and iron" },
  "steep-and-steam": { niche: "tea house", world: "pouring kettle arc, steam curls, leaves unfurling, timer", kw: ["tea", "teapot", "leaves", "brew", "ceremony", "steam"], bgm: "quiet koto-tinged ambient, meditative", energy: "calm", photo: "soft steam, muted ceramic tones" },
  "rope-and-round":  { niche: "boxing gym", world: "swinging heavy bag, skipping-rope arc, ring ropes, bell", kw: ["boxing", "gym", "training", "ring", "gloves", "fight"], bgm: "hard-hitting percussive hip-hop, gritty", energy: "high", photo: "gritty gym light, hard shadow" },
  "field-of-view":   { niche: "astronomy", world: "twinkling stars, constellation drawing, rotating dome, meteors", kw: ["astronomy", "stars", "night sky", "telescope", "space", "galaxy"], bgm: "wide cinematic ambient, cosmic and still", energy: "calm", photo: "night sky, deep space imagery" },
  "grain-line":      { niche: "hand woodwork", world: "plane throwing shavings, sawdust, dovetails cutting, clamps", kw: ["woodwork", "timber", "workshop", "tools", "craft", "joinery"], bgm: "warm acoustic with woody percussion", energy: "medium", photo: "workshop light, timber grain and tools" },

  // ---- the 30 films this drop added -------------------------------------------
  // Authored from each film's OWN animated world (the `World:` SVG in its
  // lf-pack block) and its garnish tags, NOT from the handoff README's subject
  // table — the README is wrong about several of them, and the world is the part
  // that survives into the user's film. Verified mismatches:
  //   trail-team  README "trail running"  -> world draws an eight-dog sled team
  //   orbit-nine  README "space station"  -> world draws the solar system
  //   silver-run  README "river fishing"  -> world draws elvers and a lift net
  //   kite-line   README "kite festival"  -> world draws a kitesurfer and board
  //   bull-run    README "trading desk"   -> world draws a bucking bull and an
  //               8-second rodeo clock, and its tags read "AN ARENA FILM". Its
  //               PLACEHOLDER copy really is about a trading desk, but that copy
  //               is replaced by the user's script while the arena is not, so the
  //               pack is cast as rodeo.
  "hay-and-holler":        { niche: "small farm / livestock", world: "tractor crossing the field, hay bales rolling, spinning sun wheel, crowing rooster", kw: ["farm", "tractor", "hay", "barn", "cattle", "field"], bgm: "warm folk with banjo and brushed kit, rural", energy: "medium", photo: "dusty golden daylight, ochre and green field tones" },
  "koi-hour":              { niche: "koi pond keeping", world: "koi circling the pond, ripple rings spreading, lily pads drifting, dragonfly hovering", kw: ["koi", "pond", "fish", "water", "lily", "garden"], bgm: "sparse ambient with koto and water, unhurried", energy: "calm", photo: "soft overcast reflections, teal water and orange fish" },
  "chalk-circle":          { niche: "children's outdoor play", world: "hopscotch squares lighting in sequence, a skipping rope arcing, a bouncing ball, a swaying swing", kw: ["playground", "children", "chalk", "hopscotch", "swing", "ball"], bgm: "playful marimba and handclaps, skipping-rhyme bounce", energy: "upbeat", photo: "bright afternoon pavement, chalk pastels and warm cream" },
  "truce":                 { niche: "pets / cats and dogs", world: "dog and cat hauling a tug rope, scoreboard numerals ticking, paw prints drifting past", kw: ["dog", "cat", "pet", "puppy", "kitten", "sofa"], bgm: "playful acoustic with plucked strings, mischievous", energy: "upbeat", photo: "soft indoor daylight, warm living-room tones" },
  "tinsel-row":            { niche: "christmas / street lights", world: "snow falling, two sagging strings of bulbs blinking, lit tree with star, wreath turning", kw: ["christmas", "lights", "snow", "wreath", "garland", "street"], bgm: "warm festive bells over soft strings, twinkling", energy: "medium", photo: "night exteriors, warm bulb glow against cold blue" },
  "proof-and-crust":       { niche: "bakery / sourdough", world: "dough dome rising and falling, oven glowing with loaves, flour specks falling, scoring blade cutting, steam curling up", kw: ["bread", "dough", "bakery", "sourdough", "flour", "oven"], bgm: "warm mid-tempo acoustic guitar with brushed kit and wooden hand percussion, steady working rhythm", energy: "medium", photo: "warm oven light, flour dust and matte crust" },
  "white-line":            { niche: "ski patrol / avalanche control", world: "ridgeline peaks, falling snow, a skier arcing across the bowl, chairlifts crossing the cable", kw: ["snow", "ski", "mountain", "avalanche", "slope", "alpine"], bgm: "wide cinematic strings over a low drone, cold and patient", energy: "medium", photo: "cold blue-white daylight, snow glare, red jacket accents" },
  "neon-stalls":           { niche: "night market street food", world: "two sagging lantern strings flickering, wok flame flaring, smoke plumes rising, stall awning and drifting crowd", kw: ["market", "neon", "food", "wok", "lantern", "noodles"], bgm: "neon synth with clattering hand percussion, humid and busy", energy: "upbeat", photo: "night market neon, wet reflections, magenta and teal glow" },
  "insert-coin":           { niche: "retro arcade", world: "glowing pixel grid, a chunky sprite bouncing across, flickering high-score board, joystick rocking with lit buttons", kw: ["arcade", "joystick", "gaming", "coin", "pinball", "retro"], bgm: "chiptune with fat synth bass, 8-bit swagger", energy: "high", photo: "dark arcade room, CRT glow, yellow and teal light" },
  "stem-and-sprig":        { niche: "wedding florist", world: "stems swaying with turning flower heads, petals drifting down, ribbon spiral drawing outward, wreath ring of turning petals", kw: ["flower", "bouquet", "florist", "garden", "wedding", "petal"], bgm: "soft acoustic strings with light pastoral air, unhurried", energy: "calm", photo: "soft morning light, dusty rose and sage tones" },
  "copper-still":          { niche: "whisky distillery", world: "copper pot still with swan neck, vapour rising through the condenser, spirit droplets falling, numbered oak casks", kw: ["whisky", "barrel", "distillery", "copper", "bourbon", "cellar"], bgm: "slow warm strings over a low drone, patient and aged", energy: "calm", photo: "dim bonded-warehouse lamplight, copper vessels and dark oak, low-key" },
  "kite-line":             { niche: "kitesurfing", world: "kite arcing on its lines, rider on a board throwing spray, scrolling wave bands, live wind-speed readout", kw: ["kitesurfing", "kiteboarding", "beach", "ocean", "waves", "surfer"], bgm: "driving surf rock with bright percussion, salt-air energy", energy: "high", photo: "bright coastal daylight, turquoise water and white spray" },
  "wax-and-wick":          { niche: "candle making", world: "wax pouring from a tilted pitcher, jars filling with wicks, a flickering flame, scent motes rising", kw: ["candle", "wax", "wick", "flame", "jar", "candlelight"], bgm: "soft felted piano over quiet room tone, unhurried", energy: "calm", photo: "candle-flame light in a near-dark room, small warm pools of glow on cream" },
  "fret-and-fingerboard":  { niche: "luthiery / guitar building", world: "guitar body swaying with vibrating strings, fretboard and inlays, glue clamps turning, wood shavings curling", kw: ["guitar", "luthier", "woodworking", "workbench", "sawdust", "chisel"], bgm: "sparse fingerpicked acoustic, woody and intimate", energy: "calm", photo: "warm daylit workbench, pale spruce, shavings and steel hand tools" },
  "salt-flats":            { niche: "land speed racing", world: "a streamliner running across a white salt plain, heat-shimmer bands, blinking timing posts, an mph readout ticking", kw: ["desert", "racing", "car", "motorsport", "dust", "horizon"], bgm: "driving motorik synth over a low engine drone, wide", energy: "high", photo: "blown-out white desert glare, heat haze with red and blue accents" },
  "loft-and-ring":         { niche: "pigeon racing", world: "pigeons flapping across the sky, a nest-box loft with birds on the landing board, a sweeping race clock, rolling hills", kw: ["pigeon", "dove", "feather", "flock", "sky", "wing"], bgm: "warm folk with brushed drums, homely and patient", energy: "medium", photo: "soft overcast dawn, terracotta and slate blue" },
  "trail-team":            { niche: "sled dog mushing / kennel life", world: "an eight-dog gangline running, sled and driver on the runners, falling snow over a mountain ridge, a dashed trail and a live sub-zero temperature readout", kw: ["husky", "sled", "snow", "dog", "winter", "malamute"], bgm: "driving percussive strings, cold air, forward momentum", energy: "high", photo: "blue-hour snow, orange parka against white" },
  "silver-run":            { niche: "river ecology / eel monitoring", world: "transparent eels wriggling upstream, scrolling current lines, a lift net raising and lowering, a live tally counter under night stars", kw: ["eel", "river", "net", "water", "night", "stream"], bgm: "ambient minimal with water textures, nocturnal and still", energy: "calm", photo: "cold night river, teal water and lamplight gold" },
  "six-bells":             { niche: "change ringing / bell tower", world: "six bells swinging on their ropes, sallies pulled below, sound rings spreading, a change grid lighting cell by cell", kw: ["bell", "tower", "church", "rope", "belfry", "steeple"], bgm: "sparse strings over a slow tolling bell pulse, two beats, reverent", energy: "calm", photo: "low tower light, warm brass and old stone" },
  "blistered-crust":       { niche: "wood-fired pizza / long-proved dough", world: "a pizza with cheese and basil turning, char blisters fixed round the rim, a domed oven flickering, flour drifting and a peel", kw: ["pizza", "dough", "oven", "flour", "fire", "kitchen"], bgm: "loose acoustic swing with handclaps, hot and busy", energy: "upbeat", photo: "firelight on flour, charred red and cream" },
  "deep-field":            { niche: "space telescope / deep-sky astronomy", world: "a twinkling starfield, tilted galaxy discs with bright cores slowly turning, a folded gold hexagon mirror bobbing above its trapezoid sunshield, a scan marker drifting upward", kw: ["galaxy", "nebula", "telescope", "satellite", "space", "stars"], bgm: "low sustained drones under a slow pulse, vast and clinical", energy: "calm", photo: "deep black sky, cold blue with gold glints" },
  "orbit-nine":            { niche: "astronomy / solar system", world: "planets circling a pulsing sun on flattened orbit rings, a ringed gas giant, a comet crossing right to left, a twinkling starfield, a light-delay readout", kw: ["planet", "moon", "saturn", "astronomy", "planetarium", "space"], bgm: "wide ambient synth with slow swells, cosmic awe", energy: "medium", photo: "deep space blue-black, warm amber planet light" },
  "spiral-arm":            { niche: "astronomy / the galaxy", world: "a face-on spiral galaxy slowly rotating with four density-wave arms and a glowing core, a scattered twinkling starfield, a separate pulsing 'you are here' marker ringed and labelled at the far side of the frame", kw: ["galaxy", "stars", "stargazing", "constellation", "universe", "night"], bgm: "sparse ambient pads with distant chimes, weightless", energy: "calm", photo: "long-exposure night sky, violet and soft lilac glow" },
  "apex-lap":              { niche: "motorsport / formula 1", world: "f1 car running a track ribbon, scrolling kerb stripes, throttle-trace readout, speed streaks", kw: ["racing", "motorsport", "racetrack", "helmet", "tires", "grandstand"], bgm: "driving percussive rock with engine pulse, urgent", energy: "high", photo: "high-contrast trackside, red and cyan motion blur" },
  "bull-run":              { niche: "rodeo / bull riding", world: "a bucking bull with rider, arena fence rails, kicked dust, an eight-second clock", kw: ["bull", "rodeo", "cowboy", "ranch", "cattle", "western"], bgm: "driving country rock with stomp and handclaps, dusty", energy: "high", photo: "dust-lit arena, warm ochre and cream" },
  "standing-desk":         { niche: "workspace / deep work", world: "a desk with a laptop lid opening, cursor blinking under text lines, a coiled cable, a swaying potted plant, shelf slabs", kw: ["desk", "laptop", "workspace", "office", "plant", "monitor"], bgm: "calm minimal keys over a soft pulse, focused", energy: "medium", photo: "bright tidy desk, soft daylight and cool blue" },
  "merge-conflict":        { niche: "code review / version control", world: "diff lines in green and pink gutters, a blinking cursor, giant curly braces, test dots and a coverage bar", kw: ["code", "developer", "computer", "keyboard", "programming", "laptop"], bgm: "dry synth arpeggio over a clipped beat, precise and forward", energy: "medium", photo: "dark editor glow, green and magenta on near-black" },
  "out-of-office":         { niche: "annual leave / holiday travel", world: "sun with turning rays, paper plane arcing on a dashed route, rolling suitcase bobbing, boarding pass with barcode", kw: ["travel", "suitcase", "airport", "airplane", "passport", "vacation"], bgm: "sunny indie pop, handclaps, easygoing", energy: "upbeat", photo: "bright travel daylight, airports and packed bags, orange and teal" },
  "palolem":               { niche: "beach travel / slow coastal stays", world: "low sun over a sunset band, waves scrolling shoreward, palms swaying, sailboat bobbing, lanterns pulsing", kw: ["beach", "palm", "boat", "sunset", "ocean", "coconut"], bgm: "slow coastal acoustic, soft tabla and guitar, sunset", energy: "calm", photo: "low golden sunset light, terracotta and sea-green" },
  "col-and-cairn":         { niche: "hillwalking / mountaineering", world: "jagged ridgeline with snowcaps, cloud inversion drifting through the valley, cairn stones stacking one by one, hiker with a pole climbing", kw: ["mountain", "hiking", "ridge", "summit", "trail", "backpack"], bgm: "sparse ambient strings, wide and cold, patient", energy: "calm", photo: "cold high-altitude light, slate blue with rust accents" },
};

const relLum = (hex) => {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return 1;
  const v = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};

/** Load every film identity by RUNNING the packs against stubs — the palette is
 *  a function of the tweak object, so it has to be called, not parsed. */
function loadIdentities(engineDir) {
  const cfgs = [];
  const g = globalThis;
  const prevReact = g.React, prevKit = g.LFKit;
  g.React = { createElement: () => null };
  g.LFKit = { rgba: () => "", make: (c) => cfgs.push(c) };
  try {
    for (const f of fs.readdirSync(engineDir).filter((x) => /^lf-pack-\d+\.js$/.test(x)).sort()) {
      // eslint-disable-next-line no-eval
      eval(fs.readFileSync(path.join(engineDir, f), "utf8"));
    }
  } finally { g.React = prevReact; g.LFKit = prevKit; }
  const fam = (s) => { const m = /"([^"]+)"/.exec(String(s || "")); return m ? m[1] : String(s || "").split(",")[0].trim(); };
  return cfgs.map((c) => ({
    global: c.global, brand: c.brand, desk: c.desk,
    display: fam(c.FH), body: fam(c.FB),
    tags: c.tags || [],
    // Deferred: the palette is a FUNCTION OF THE FILM'S TWEAKS, so it cannot be
    // resolved until we know which film we are importing. See paletteOf().
    palette: c.palette, accent2Opts: c.accent2Opts,
  }));
}

/** The tweak object the SHIPPED page sets, from its own OM_TWEAKS block.
 *
 *  In a standalone build the page lives inside the `__bundler/template`
 *  resource, which is itself a JSON STRING — so the object arrives escaped
 *  (`{\n  \"accent\": \"#12d67a\" …}`). Unwrapping it by hand with a chain of
 *  backslash replaces is how this kind of parser goes subtly wrong, so let JSON
 *  do it: quote the fragment and parse it once to unescape, then parse the
 *  result. An unescaped fragment (a loose `.dc.html` wrapper) fails that first
 *  parse and is read directly. */
function tweaksOf(html) {
  const m = /\/\*EDITMODE-BEGIN\*\/([\s\S]*?)\/\*EDITMODE-END\*\//.exec(html);
  if (!m) return {};
  const frag = m[1].trim();
  for (const text of [(() => { try { return JSON.parse(`"${frag}"`); } catch { return null; } })(), frag]) {
    if (typeof text !== "string") continue;
    try { const o = JSON.parse(text); if (o && typeof o === "object") return o; } catch { /* try the next reading */ }
  }
  return {};
}

/** The palette the film ACTUALLY PAINTS.
 *
 *  Every identity declares `palette: (t) => ({ accent: t.accent || "#b8352c", … })`
 *  — the default is only what shows when the film sets no tweak. Resolving it
 *  against an EMPTY object recorded the default instead of the film's own
 *  choice, and the pack then declared colours the template never paints.
 *  Measured across all 58 films in this drop: one diverges, and it diverges
 *  completely — bull-run's page sets accent #12d67a / accent2 #f2b23c while its
 *  identity defaults to #b8352c / #8c6a2c. That is the pack's emphasis colour,
 *  its skin accents and its brand-recolour contrast guard, all wrong. */
function paletteOf(id, html) {
  const tw = tweaksOf(html);
  const p = id.palette ? id.palette(tw) : {};
  return {
    paper: p.paper, ink: p.ink,
    accent: p.accent,
    accent2: tw.accent2 || id.accent2Opts?.[0] || p.accent2,
    sageT: p.sageT, terraT: p.terraT,
  };
}

/** The one edit. Returns the rewritten page, or throws if the bundle does not
 *  look like what we think it is — a silent no-op here would ship 27 films with
 *  a black band along the bottom of every frame. */
function stripPlaybackBar(html) {
  const re = /<script type="__bundler\/manifest">([\s\S]*?)<\/script>/;
  const m = re.exec(html);
  if (!m) throw new Error("no __bundler/manifest block — not a handoff bundle");
  const manifest = JSON.parse(m[1]);
  let edited = 0;
  for (const [key, res] of Object.entries(manifest)) {
    if (!res || !res.data || !res.compressed) continue;
    let text;
    try { text = zlib.gunzipSync(Buffer.from(res.data, "base64")).toString("utf8"); }
    catch { continue; }                                    // fonts / binaries
    if (!text.includes("const barH = 44;")) continue;
    const next = text.replace(/const barH = 44;/g, "const barH = 0;");
    manifest[key] = { ...res, data: zlib.gzipSync(Buffer.from(next, "utf8"), { level: 9 }).toString("base64") };
    edited++;
  }
  if (edited !== 1) throw new Error(`expected exactly 1 resource carrying the playback bar, found ${edited}`);
  return html.slice(0, m.index) + `<script type="__bundler/manifest">${JSON.stringify(manifest)}</script>` + html.slice(m.index + m[0].length);
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

// How many scene renderers the kit inside THIS bundle carries. The drop that
// added the FX set took it from 60 to 74, and a FRAME.md that states the number
// has to state the one its own bundle actually ships.
function kitSceneCount(html) {
  const m = /<script type="__bundler\/manifest">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return 0;
  let manifest;
  try { manifest = JSON.parse(m[1]); } catch { return 0; }
  for (const res of Object.values(manifest)) {
    if (!res || !res.data || !res.compressed) continue;
    let text;
    try { text = zlib.gunzipSync(Buffer.from(res.data, "base64")).toString("utf8"); } catch { continue; }
    const sm = /SCENE_MAP\s*=\s*\{([^}]*)\}/.exec(text);
    if (sm) return sm[1].split(",").map((x) => x.trim()).filter(Boolean).length;
  }
  return 0;
}

function packJson(id, meta, film) {
  const { sceneCount, runtime } = film;
  const pace = (runtime / sceneCount).toFixed(1);
  const light = relLum(id.paper) > 0.5;
  // Per-pack visual signature — the previous importer hardcoded the same
  // layout/textfx/motion for all 58 long-form packs, so any scene-kit
  // fallback (auto jobs, portrait, runtime smoke) rendered the identical
  // "rise/accent/panel" film regardless of which Long Form shelf card the
  // user picked. Derive a stable, hash-based signature from the slug so
  // every long-form pack keeps a distinct cut, entrance, emphasis, case,
  // layout and drift while preserving its authored colours/fonts/world.
  const ENTERS = ["rise","glitch","zap","pop","slide","reveal","fade","type"];
  const EMPHASIS = ["accent","marker","ring","glow","underline","bold","soft"];
  const CASES = ["mixed","upper","lower"];
  const CUTS = ["panel","cut","flux","zoom","glide","shutter"];
  const STATS = ["inline","card","strip","badge"];
  const ASSET_STYLES = ["plain","browser","card","polaroid"];
  const CANVAS = ["none","none","none","grain","clay"];
  const h = [...id.slug].reduce((a,c)=>a+c.charCodeAt(0),0);
  const pick = (arr, off=0) => arr[(h + off*31) % arr.length];
  const hash01 = (salt) => {
    let x = 5381;
    for (let i=0;i<id.slug.length;i++) x = ((x<<5)+x) ^ id.slug.charCodeAt(i);
    for (let i=0;i<salt.length;i++) x = ((x<<5)+x) ^ salt.charCodeAt(i);
    return (x>>>0) % 1000 / 1000;
  };
  const enter = pick(ENTERS, 1);
  const emphasis = pick(EMPHASIS, 2);
  const c = pick(CASES, 3);
  const cut = pick(CUTS, 4);
  const stat = pick(STATS, 5);
  const assetStyle = pick(ASSET_STYLES, 6);
  const canvas = pick(CANVAS, 7);
  const align = c === "upper" ? "center" : (["left","center","left"][h % 3]);
  const tracking = c === "upper" ? -0.02 : 0;
  const weight = c === "upper" && hash01("w") > 0.6 ? 800 : null;
  const drift = Math.round((0.96 + hash01("d")*0.08)*100)/100;
  const propFill = hash01("pf") > 0.7;
  const underline = hash01("ul") > 0.5;
  const sizeScale = Math.round((0.98 + hash01("ss")*0.08)*100)/100;
  return {
    name: id.slug,
    renderer: "omelette",
    template: id.global,
    portraitNative: false,
    longForm: true,
    longFormOk: true,
    vibe: `long-form 16:9 kinetic-typography film for ${meta.niche} — ${sceneCount} authored beats, ~${pace}s each, ${mmss(runtime)} as shipped. ${meta.world}. ${id.display} display over ${id.body} body; per-scene garnish layer (corner tags, footnotes, side labels, doodles) so no frame reads empty. Text-first: two image slots in the whole film.`,
    colors: { ground: id.paper, ink: id.ink, accent: id.accent, a2: id.accent2 },
    fonts: [id.display, id.body],
    surface: { flat: true, lightCinematic: light, ground: id.paper, ink: id.ink },
    motion: { cut, drift },
    fx: { canvas, three: null },
    typography: { display: id.display, body: id.body, case: c },
    audio: { bgm: meta.bgm, energy: meta.energy },
    skin: {
      accents: [id.accent, id.accent2],
      extras: [id.sageT, id.terraT, id.ink].filter(Boolean),
      emphasisCss: `color:${id.accent};`,
    },
    assets: { photoMod: meta.photo, iconStyle: "outline", keywords: meta.kw, prefer: ["photo", "screenshot"] },
    camera3d: { ground: id.paper },
    layout: { propFill, kicker: true, underline, stat, assetStyle },
    textfx: { enter, emphasis, case: c, tracking, weight, sizeScale, align },
  };
}

function frameMd(id, meta, film) {
  const { sceneCount, runtime } = film;
  const pace = (runtime / sceneCount).toFixed(1);
  return `# ${id.brand} — long-form kinetic-typography film (16:9)

A ${mmss(runtime)}, ${sceneCount}-beat looping film for ${meta.niche}, rendered from its own
original bundle — only the words and the two pictures change. Built for LONG-FORM
video: every beat is a different type animation (~${pace}s each), so a 2–5 minute
script never repeats a layout.

## Design system
- Paper \`${id.paper}\`, ink \`${id.ink}\`, accent \`${id.accent}\`, second accent
  \`${id.accent2}\`, tinted grounds \`${id.sageT}\` / \`${id.terraT}\`.
- **${id.display}** display over **${id.body}** body (bundled in the standalone).
- Brand mark top-left; per-scene garnish layer — rotating corner tag, italic
  footnote, vertical side label or spinning doodle — so no frame reads empty.
- Animated SVG world behind every scene: ${meta.world}.

## Shape vocabulary (${sceneCount} authored beats)
Drawn from the kit's ${film.kitScenes} scene renderers with no name repeating inside the film —
letter-level (Open, Rain, Spiral, Wave…), word-level (Problem, Marker, Magnet…),
line/block (Wilt, Curtain, Cards…), data (Counts, Ladder, Gauge, Plans…), the FX
set (NeonSign, Glitch, FlipCube, Ticker3D, Kaleido, Spotlight…) and the
bookends (Kit chapter cards, Peek image card, QA, Join CTA). Slot keys include
kicker/title/sub/lines/steps/stats/items/words/pairs/rows/q&a/plans — text-first;
\`image\` appears twice (a mid-film setup card and the CTA logo).

## Casting notes
- 16:9 only (\`portraitNative: false\`); it is a LONG FORM gallery entry
  (\`longForm: true\`) and must not be rerouted to scene-kit past 75s
  (\`longFormOk: true\` — honoured per-pack by the pipeline).
- Copy law: \`title\` is the primary slot (kit convention) — the adapter maps it
  from the beat's own line.
- The engine caps the scene list at 50 entries and the serialized scenes string
  at 16KB; the adapter's \`__kfplate__\` sentinel keeps the branded fill plate out
  of that budget.
`;
}

// ---- run ----
// The handoff renamed engine/ -> source/ between drops; accept either so an
// older zip and a newer one both import with the same command.
const engineDir = ["source", "engine"].map((d) => path.join(SRC, d)).find((d) => fs.existsSync(d));
const standaloneDir = path.join(SRC, "standalone");
if (!engineDir) { console.error(`missing ${path.join(SRC, "source")} (or engine/)`); process.exit(1); }
if (!fs.existsSync(standaloneDir)) { console.error(`missing ${standaloneDir}`); process.exit(1); }

const norm = (s) => String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const slugify = (s) => String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const identities = loadIdentities(engineDir);
const byNorm = new Map(identities.map((c) => [norm(c.brand), c]));

// index.html is the handoff's own gallery page, not a film.
const files = fs.readdirSync(standaloneDir).filter((f) => f.endsWith(".html") && f !== "index.html").sort();
fs.mkdirSync(TPL_DIR, { recursive: true });

const done = [], skipped = [], failed = [];
for (const file of files) {
  const base = file.replace(/\.html$/, "");
  if (ONLY && base !== ONLY) continue;
  // An already-installed pack is skipped BEFORE the identity lookup: Field Notes
  // ships from the pre-kit `field-notes-film.jsx` and so has no LFKit.make()
  // entry, which would otherwise be reported as a failure on every run.
  if (fs.existsSync(path.join(FRAMES_DIR, base, "pack.json")) && !FORCE) { skipped.push(base); continue; }
  const id = byNorm.get(norm(base));
  // Field Notes ships from the pre-kit `field-notes-film.jsx` and so has no
  // LFKit.make() entry to read a palette from. On a --force re-import from a
  // newer handoff it still needs its BUNDLE refreshed; its pack.json/FRAME.md
  // were authored against the original and are left exactly as they are.
  if (!id) {
    const existing = path.join(FRAMES_DIR, base, "pack.json");
    if (fs.existsSync(existing)) {
      try {
        const tpl = JSON.parse(fs.readFileSync(existing, "utf8")).template;
        const out = stripPlaybackBar(fs.readFileSync(path.join(standaloneDir, file), "utf8"));
        fs.writeFileSync(path.join(TPL_DIR, `${tpl}.html`), out, "utf8");
        done.push(`${base} -> ${tpl}.html (bundle only — no kit identity, pack.json kept)`);
      } catch (e) { failed.push([base, e.message]); }
      continue;
    }
    failed.push([base, "no identity in source/lf-pack-*.js"]);
    continue;
  }
  id.slug = slugify(id.brand);

  const meta = NICHE[id.slug];
  if (!meta) { failed.push([id.slug, "no editorial metadata (add it to NICHE)"]); continue; }

  const packDir = path.join(FRAMES_DIR, id.slug);
  if (fs.existsSync(path.join(packDir, "pack.json")) && !FORCE) { skipped.push(id.slug); continue; }

  try {
    const html = fs.readFileSync(path.join(standaloneDir, file), "utf8");
    // Resolve the palette against THIS film's own tweaks, not the identity's
    // defaults — see paletteOf().
    Object.assign(id, paletteOf(id, html));
    const out = stripPlaybackBar(html);
    fs.writeFileSync(path.join(TPL_DIR, `${id.global}.html`), out, "utf8");

    // Beat count AND runtime come from the film itself (OM_SCENES), not from a
    // table. OM_SCENES is JSON inside a SINGLE-quoted JS string, so its own double
    // quotes arrive backslash-escaped — without undoing that the parse throws and
    // every film silently reported the fallback 40, including the 41-beat ones.
    //
    // Runtime matters as much as the count: this drop ships 40-beat/5:01 films
    // alongside 47-beat/5:11 ones, so a hardcoded "~7.5s each, about 5 minutes"
    // described neither of them. The pace a pack DECLARES is what the adapter
    // budgets beats against, so it has to be this film's own.
    let scenes = null;
    const om = /window\.OM_SCENES\s*=\s*'([\s\S]*?)';/.exec(html);
    if (om) {
      const raw = om[1].replace(/\\"/g, '"').replace(/\'/g, "'").replace(/\\/g, "\\");
      try { const parsed = JSON.parse(raw); if (Array.isArray(parsed) && parsed.length) scenes = parsed; } catch { /* reported below */ }
    }
    if (!scenes) throw new Error("could not read OM_SCENES from the bundle");
    const film = {
      sceneCount: scenes.length,
      runtime: scenes.reduce((a, sc) => a + (Number(sc.dur) || 0), 0),
      kitScenes: kitSceneCount(out),
    };

    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(path.join(packDir, "pack.json"), JSON.stringify(packJson(id, meta, film), null, 2) + "\n", "utf8");
    fs.writeFileSync(path.join(packDir, "FRAME.md"), frameMd(id, meta, film), "utf8");
    done.push(`${id.slug} -> ${id.global}.html (${film.sceneCount} beats, ${mmss(film.runtime)})`);
  } catch (e) {
    failed.push([id.slug, e.message]);
  }
}

console.log(`\nimported ${done.length}:`);
for (const d of done) console.log("  " + d);
if (skipped.length) console.log(`\nskipped ${skipped.length} (already present; --force to overwrite): ${skipped.join(", ")}`);
if (failed.length) { console.log(`\nFAILED ${failed.length}:`); for (const [s, why] of failed) console.log(`  ${s}: ${why}`); }
process.exit(failed.length ? 1 : 0);
