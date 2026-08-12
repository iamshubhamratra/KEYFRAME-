// Build hover-preview clips for the template gallery: a short, muted, looping
// preview.mp4 + a poster.jpg for every frame pack, written into
//   server/public/frames/<pack>/
// The gallery route (src/routes/frames.js -> mediaUrls) auto-exposes these as
// previewUrl / posterUrl, and the web PackCard (web/src/screens/Templates.jsx)
// fades the <video> in on hover. So generating these files is all it takes to
// light up hover previews across the whole gallery.
//
// It mirrors the production composer routing (see pipeline.js): a pack that
// declares a "renderer" in its manifest (flagship / brightlife / blueprint /
// bloom-fable / bauhaus-riot) renders through that dedicated composer so the
// preview shows the pack's real motion; every other pack renders through the
// deterministic scene-kit (+ the same vector/motion enrich floor the pipeline
// applies). Fully offline and deterministic — no LLM, no TTS, no network assets.
//
// Usage:
//   node scripts/build-previews.js                 # every pack
//   node scripts/build-previews.js --missing       # only packs with no preview.mp4
//   node scripts/build-previews.js sumi-kaze bloom-fable   # named packs
//
// Env knobs: PREVIEW_W/PREVIEW_H (render dims, default 1024x576),
//   PREVIEW_SCENE_SEC (per-scene seconds, default 2.4), PREVIEW_OUT_W (final
//   clip width, default 720), PREVIEW_QUALITY (hyperframes quality, default draft).

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const config = require("../src/config");
const frameRegistry = require("../src/services/frame_registry");
const frameManifest = require("../src/services/frame_manifest");
const sceneKit = require("../src/services/scene_kit");
const { enrichComposition } = require("../src/services/enrich");
const { render } = require("../src/services/renderer");

// Dedicated pack renderers — same map the pipeline uses. Keyed by the manifest
// "renderer" value; the pack's own composer draws its signature look.
const PACK_RENDERERS = {
  "three-flagship": require("../src/services/flagship_composer"),
  "three-brightlife": require("../src/services/brightlife_composer"),
  "blueprint": require("../src/services/blueprint_composer"),
  "bloom-fable": require("../src/services/bloom_composer"),
  "bauhaus-riot": require("../src/services/bauhaus_composer"),
  "genesis": require("../src/services/genesis_composer"),
  "momentum": require("../src/services/momentum_composer"),
  "showcase": require("../src/services/showcase_composer"),
  "poster-loud": require("../src/services/family_poster"),
  "retro-terminal": require("../src/services/family_terminal"),
  "editorial-quiet": require("../src/services/family_editorial"),
  "dark-premium": require("../src/services/family_darkpremium"),
  "bright-minimal": require("../src/services/family_bright"),
  "cinema": require("../src/services/family_cinema"),
  "story-handmade": require("../src/services/family_story"),
  "charged": require("../src/services/family_charged"),
  "daybreak-bakehouse": require("../src/services/daybreak_composer"),
  "organic-garden": require("../src/services/organic_composer"),
  "lantern-night": require("../src/services/lantern_composer"),
  "hype-wave": require("../src/services/hype_composer"),
  "poster-pop": require("../src/services/posterpop_composer"),
  "story-blocks": require("../src/services/storyblocks_composer"),
  "premiere-night": require("../src/services/premiere_composer"),
  // Bundled-template packs (Reel / *Vertical / …) render through the adapter.
  "omelette": require("../src/services/omelette_adapter"),
};

const W = Number(process.env.PREVIEW_W) || 1280;
const H = Number(process.env.PREVIEW_H) || 720;
const FPS = 30;
const SCENE_SEC = Number(process.env.PREVIEW_SCENE_SEC) || 2.4;
const OUT_W = Number(process.env.PREVIEW_OUT_W) || 960;
const CRF = Number(process.env.PREVIEW_CRF) || 26;
const QUALITY = process.env.PREVIEW_QUALITY || "standard";

const PUBLIC_FRAMES = path.join(config.paths.root, "public", "frames");
const WORK = path.join(config.paths.root, "jobs", "_previews");

// BESPOKE 30s BRIEFS — the 2026-07-18 wave packs each get a full six-beat,
// pack-VOICED storyboard (hook → bullets → stat → quote → feature → cta) so the
// preview exercises the pack's whole grammar: every entrance/cut rotation, the
// stat & quote archetypes, and every kind-gated ornament in
// scene_kit_bespoke_ornaments.js (enso + bamboo, pendulum + escapement,
// clay ball + pellet pop, needle + heart + bow, jellyfish + sonar + angler).
// 6 scenes × 5s = 30s.
const BESPOKE_SCENE_SEC = 5;
// Preview length window. The gallery clip should read as a real preview of the
// film, not a glance at its opening — see the note in storyboardFor.
const PREVIEW_MIN_SEC = Number(process.env.PREVIEW_MIN_SEC) || 30;
const PREVIEW_MAX_SEC = Number(process.env.PREVIEW_MAX_SEC) || 45;
const PREVIEW_TARGET_SEC = Number(process.env.PREVIEW_TARGET_SEC) || 36;
const BESPOKE_PREVIEWS = {
  // The 2026-07-25 hearth trio — previews voiced with the source templates' OWN
  // OM_SCENES copy, so the gallery clip reads like the original bundled reel.
  "daybreak-bakehouse": [
    { kind: "hook",  purpose: "hook",    headline: "Baked before the town wakes up.", emphasis: "Baked", subtext: "A neighbourhood bakehouse, one honest batch at a time." },
    { kind: "text",  purpose: "how",     headline: "Today's board, written at dawn", emphasis: "dawn", onScreenText: ["Milled that week", "Slow overnight rise", "Out of the oven at 6"] },
    { kind: "stat",  purpose: "data",    headline: "The day, by the numbers", emphasis: "numbers", onScreenText: ["4am the ovens come on", "32 loaves in the first batch", "11 yrs on the same corner"] },
    { kind: "quote", purpose: "problem", headline: "Most mornings taste like a queue", emphasis: "queue", onScreenText: ["Ours was up at four,", "thinking about you."] },
    { kind: "text",  purpose: "feature", headline: "Straight from the cooling rack", emphasis: "warm", subtext: "Sourdough, croissant, rye tin, cardamom bun." },
    { kind: "cta",   purpose: "cta",     headline: "Daybreak Bakehouse", emphasis: "Come in while it's still warm", subtext: "Made with KEYFRAME" },
  ],
  "organic-garden": [
    { kind: "hook",  purpose: "hook",    headline: "Your garden deserves a film", emphasis: "film", subtext: "Made from your own site, shots and story." },
    { kind: "text",  purpose: "how",     headline: "Your screens, planted center stage", emphasis: "planted", onScreenText: ["Drops in your shots", "On-brand every frame", "Ready in minutes"] },
    { kind: "stat",  purpose: "data",    headline: "Numbers that keep growing", emphasis: "growing", onScreenText: ["4x faster to publish", "92% watch to the end", "300+ scenes to plant"] },
    { kind: "quote", purpose: "problem", headline: "Most launch videos feel like a spreadsheet", emphasis: "spreadsheet", onScreenText: ["Yours should feel alive —", "warm, moving, you."] },
    { kind: "text",  purpose: "feature", headline: "Every corner of the product", emphasis: "Every", subtext: "Home, dashboard, details, mobile — grown on-brand." },
    { kind: "cta",   purpose: "cta",     headline: "Organic Garden", emphasis: "Start planting", subtext: "Made with KEYFRAME" },
  ],
  "lantern-night": [
    { kind: "hook",  purpose: "hook",    headline: "The night comes alive.", emphasis: "alive", subtext: "One night. A thousand lanterns. Your story in lights." },
    { kind: "text",  purpose: "how",     headline: "Light up the main event", emphasis: "Light", onScreenText: ["Glows on any feed", "Loops forever", "Yours in one evening"] },
    { kind: "stat",  purpose: "data",    headline: "The night, measured", emphasis: "measured", onScreenText: ["1000+ lanterns released at once", "9pm the sky catches fire", "1 night is all it takes"] },
    { kind: "quote", purpose: "problem", headline: "Everything looks the same in daylight", emphasis: "daylight", onScreenText: ["Stand out where nobody", "else is even looking."] },
    { kind: "text",  purpose: "feature", headline: "Four corners of the night", emphasis: "night", subtext: "The gates, food row, main stage, river launch." },
    { kind: "cta",   purpose: "cta",     headline: "Lantern Night", emphasis: "Send yours into the sky", subtext: "Made with KEYFRAME" },
  ],
  "hype-wave": [
    { kind: "hook",  purpose: "hook",    headline: "Make some actual noise.", emphasis: "noise", subtext: "Ten loud seconds. Zero boring frames." },
    { kind: "text",  purpose: "how",     headline: "Your product, front row", emphasis: "front", onScreenText: ["Drop screenshots in", "Recolour in one tap", "Loops forever"] },
    { kind: "stat",  purpose: "data",    headline: "Numbers that pop", emphasis: "pop", onScreenText: ["5x more shares than static posts", "12s average watch — the whole loop", "1 tap to make it yours"] },
    { kind: "quote", purpose: "problem", headline: "Beige is a choice. Refuse it.", emphasis: "Refuse", onScreenText: ["Feeds reward the brave.", "Bring colour or bring nothing."] },
    { kind: "text",  purpose: "feature", headline: "Every page slaps", emphasis: "slaps", subtext: "Home, pricing, dashboard, checkout." },
    { kind: "cta",   purpose: "cta",     headline: "Hype Wave", emphasis: "Go be loud", subtext: "Made with KEYFRAME" },
  ],
  "poster-pop": [
    { kind: "hook",  purpose: "hook",    headline: "Big. Bold. Impossible to miss.", emphasis: "Impossible", subtext: "The loudest way to say it — in ten seconds flat." },
    { kind: "text",  purpose: "how",     headline: "Your product, poster-sized", emphasis: "poster-sized", onScreenText: ["Ready in minutes", "Loops forever", "Zero editing"] },
    { kind: "stat",  purpose: "data",    headline: "Numbers, loud ones", emphasis: "loud", onScreenText: ["10s to make your point", "4x more eyes than a static post", "100% yours — copy, color, everything"] },
    { kind: "quote", purpose: "problem", headline: "Quiet doesn't sell", emphasis: "Quiet", onScreenText: ["Say it once, say it huge,", "and let the color do the rest."] },
    { kind: "text",  purpose: "feature", headline: "Every page. Every angle.", emphasis: "Every", subtext: "Home, pricing, dashboard, checkout." },
    { kind: "cta",   purpose: "cta",     headline: "Poster Pop", emphasis: "Stop scrolling. Start now.", subtext: "Made with KEYFRAME" },
  ],
  "premiere-night": [
    { kind: "hook",  purpose: "hook",    headline: "The premiere your product deserves.", emphasis: "premiere", subtext: "Roll out the terracotta carpet." },
    { kind: "text",  purpose: "how",     headline: "Tonight's main feature", emphasis: "feature", onScreenText: ["Spotlight your screens", "Graded like film", "Loops all night"] },
    { kind: "stat",  purpose: "data",    headline: "The box office report", emphasis: "box office", onScreenText: ["98% stayed for the credits", "24fps of pure hand-tuned motion", "5-star reviews from the front row"] },
    { kind: "quote", purpose: "problem", headline: "Most launches whisper. Yours roars.", emphasis: "roars", onScreenText: ["Ten seconds of spotlight", "beats ten pages of specs."] },
    { kind: "text",  purpose: "feature", headline: "Scene by scene", emphasis: "Scene", subtext: "Opening shot, the build, the reveal, standing ovation." },
    { kind: "cta",   purpose: "cta",     headline: "Premiere Night", emphasis: "Take your seat", subtext: "Made with KEYFRAME" },
  ],
  "story-blocks": [
    { kind: "hook",  purpose: "hook",    headline: "Every brand has a story.", emphasis: "story", subtext: "Tell yours in blocks — bold, fast, impossible to skim past." },
    { kind: "text",  purpose: "how",     headline: "Built from your screens", emphasis: "screens", onScreenText: ["Drag in screenshots", "Swap every word", "Recolor in one tap"] },
    { kind: "stat",  purpose: "data",    headline: "Numbers with weight", emphasis: "weight", onScreenText: ["3x longer watch time than static", "6 panels tell the whole arc", "15s start to cliffhanger"] },
    { kind: "quote", purpose: "problem", headline: "Feeds are noisy. Blocks cut through.", emphasis: "cut", onScreenText: ["One idea per panel.", "No fluff between."] },
    { kind: "text",  purpose: "feature", headline: "The whole story, panel by panel", emphasis: "panel", subtext: "Home, pricing, dashboard, checkout." },
    { kind: "cta",   purpose: "cta",     headline: "Story Blocks", emphasis: "Start the story", subtext: "Made with KEYFRAME" },
  ],
  "sumi-kaze": [
    { kind: "hook",  purpose: "hook",    headline: "Every idea flows like ink.", emphasis: "ink", subtext: "One brushstroke is all it takes." },
    { kind: "text",  purpose: "how",     headline: "The scroll unrolls", emphasis: "scroll", onScreenText: ["Write — one honest sentence", "We grind the ink", "A film unrolls by itself"] },
    { kind: "stat",  purpose: "data",    headline: "Ten thousand frames", emphasis: "frames", onScreenText: ["12 agents on every film", "1080p full bloom", "0 hands required"] },
    { kind: "quote", purpose: "problem", headline: "Stillness, then motion", emphasis: "motion", onScreenText: ["No studio.", "No stress."] },
    { kind: "text",  purpose: "feature", headline: "The brush remembers", emphasis: "brush", subtext: "Every scene set in your brand's own ink." },
    { kind: "cta",   purpose: "cta",     headline: "Sumi Kaze", emphasis: "Paint your first film", subtext: "Made with KEYFRAME" },
  ],
  "orrery-brass": [
    { kind: "hook",  purpose: "hook",    headline: "Every launch has its hour.", emphasis: "hour", subtext: "Wind it with one sentence." },
    { kind: "text",  purpose: "how",     headline: "The wheels are turning", emphasis: "turning", onScreenText: ["Wind — one sentence in", "Mesh — agents take their orbits", "Strike — a film on the hour"] },
    { kind: "stat",  purpose: "data",    headline: "Precision, engineered", emphasis: "Precision", onScreenText: ["12 agents in mesh", "1080p brasswork", "0 missed beats"] },
    { kind: "quote", purpose: "problem", headline: "As the planets align", emphasis: "align", onScreenText: ["No studio.", "No stress."] },
    { kind: "text",  purpose: "feature", headline: "Set your story in motion", emphasis: "motion", subtext: "Each scene ticks into place, on time." },
    { kind: "cta",   purpose: "cta",     headline: "Orrery Brass", emphasis: "Wind the mainspring", subtext: "Made with KEYFRAME" },
  ],
  claymotion: [
    { kind: "hook",  purpose: "hook",    headline: "Squish an idea. Ship a film.", emphasis: "film", subtext: "Rolled by hand, one sentence at a time." },
    { kind: "text",  purpose: "how",     headline: "Pinch, press, play", emphasis: "play", onScreenText: ["Pinch — one honest sentence", "Press — scenes take shape", "Play — 8fps of joy"] },
    { kind: "stat",  purpose: "data",    headline: "Handmade numbers", emphasis: "Handmade", onScreenText: ["8 fps of charm", "12 tiny hands", "1 sentence in"] },
    { kind: "quote", purpose: "problem", headline: "Play is serious work", emphasis: "Play", onScreenText: ["No studio.", "No stress."] },
    { kind: "text",  purpose: "feature", headline: "Every frame has fingerprints", emphasis: "fingerprints", subtext: "Nothing here came off a shelf." },
    { kind: "cta",   purpose: "cta",     headline: "Claymotion", emphasis: "Get your hands dirty", subtext: "Made with KEYFRAME" },
  ],
  "folk-stitch": [
    { kind: "hook",  purpose: "hook",    headline: "Sewn with love, told in thread.", emphasis: "thread", subtext: "One sentence starts the sampler." },
    { kind: "text",  purpose: "how",     headline: "Thread by thread", emphasis: "Thread", onScreenText: ["Cut — one honest line", "Stitch — agents embroider scenes", "Tie — a film, knotted tight"] },
    { kind: "stat",  purpose: "data",    headline: "Counted stitches", emphasis: "Counted", onScreenText: ["12 agents at the loom", "1080p needlework", "0 dropped threads"] },
    { kind: "quote", purpose: "problem", headline: "Measure twice, tell once", emphasis: "once", onScreenText: ["No studio.", "No stress."] },
    { kind: "text",  purpose: "feature", headline: "Patterns of your brand", emphasis: "Patterns", subtext: "Your colors, cross-stitched into every scene." },
    { kind: "cta",   purpose: "cta",     headline: "Folk Stitch", emphasis: "Thread your needle", subtext: "Made with KEYFRAME" },
  ],
  "abyssal-glow": [
    { kind: "hook",  purpose: "hook",    headline: "Light lives in the deep.", emphasis: "deep", subtext: "One sentence, and we dive." },
    { kind: "text",  purpose: "how",     headline: "Descend with us", emphasis: "Descend", onScreenText: ["Dive — one sentence down", "Glow — agents light every scene", "Surface — a film that shines"] },
    { kind: "stat",  purpose: "data",    headline: "Sounding the depths", emphasis: "depths", onScreenText: ["−4,000 m of calm", "12 agents aglow", "1080p bioluminescence"] },
    { kind: "quote", purpose: "problem", headline: "In darkness, we glow", emphasis: "glow", onScreenText: ["No studio.", "No stress."] },
    { kind: "text",  purpose: "feature", headline: "Signals from below", emphasis: "Signals", subtext: "Sonar-true timing in every cut." },
    { kind: "cta",   purpose: "cta",     headline: "Abyssal Glow", emphasis: "Turn on your light", subtext: "Made with KEYFRAME" },
  ],
  kaleido: [
    { kind: "hook",  purpose: "hook",    headline: "Every idea refracts.", emphasis: "refracts", subtext: "One hue, endless symmetry." },
    { kind: "text",  purpose: "how",     headline: "It turns, it blooms", emphasis: "blooms", onScreenText: ["Write — one honest line", "Turn — the kaleidoscope blooms", "Reveal — a mesmerizing film"] },
    { kind: "stat",  purpose: "data",    headline: "Seen by millions", emphasis: "millions", onScreenText: ["2.4M mesmerized", "12 lenses", "0 two frames alike"] },
    { kind: "quote", purpose: "problem", headline: "Symmetry, in motion", emphasis: "motion", onScreenText: ["No studio.", "No stress."] },
    { kind: "text",  purpose: "feature", headline: "Your color, refracted", emphasis: "color", subtext: "Pick a hue — the whole kaleidoscope re-tints." },
    { kind: "cta",   purpose: "cta",     headline: "Kaleido", emphasis: "Enter the light", subtext: "Made with KEYFRAME" },
  ],
  ignition: [
    { kind: "hook",  purpose: "hook",    headline: "T-minus one sentence.", emphasis: "T-minus", subtext: "Your launch film, on the pad." },
    { kind: "text",  purpose: "how",     headline: "All systems go", emphasis: "go", onScreenText: ["Fuel — one honest sentence", "Guidance — agents lock the story", "Liftoff — a launch film flies"] },
    { kind: "stat",  purpose: "data",    headline: "Telemetry looks good", emphasis: "Telemetry", onScreenText: ["12 agents in mission control", "1080p at max-Q", "0 scrubbed launches"] },
    { kind: "quote", purpose: "problem", headline: "Every launch needs a countdown", emphasis: "countdown", onScreenText: ["No studio.", "No stress."] },
    { kind: "text",  purpose: "feature", headline: "Your color is the flame", emphasis: "flame", subtext: "Pick a hue — every streak and spark re-tints." },
    { kind: "cta",   purpose: "cta",     headline: "Ignition", emphasis: "Start the countdown", subtext: "Made with KEYFRAME" },
  ],
  voltage: [
    { kind: "hook",  purpose: "hook",    headline: "Ideas hit like lightning.", emphasis: "lightning", subtext: "One sentence, full charge." },
    { kind: "text",  purpose: "how",     headline: "Charge it up", emphasis: "Charge", onScreenText: ["Write — one honest line", "Charge — agents light the coils", "Strike — a high-voltage film"] },
    { kind: "stat",  purpose: "data",    headline: "Rated ten times faster", emphasis: "ten", onScreenText: ["10x throughput", "99.9% uptime", "0 lag"] },
    { kind: "quote", purpose: "problem", headline: "Nothing slows it down", emphasis: "Nothing", onScreenText: ["No studio.", "No stress."] },
    { kind: "text",  purpose: "feature", headline: "Your color is the current", emphasis: "current", subtext: "Pick a hue — every bolt and arc re-tints." },
    { kind: "cta",   purpose: "cta",     headline: "Voltage", emphasis: "Plug in now", subtext: "Made with KEYFRAME" },
  ],
  // Flagship: the full eight-beat living-world arc (world → chaos → order →
  // reveal → features → proof → growth → logo climax).
  genesis: [
    { kind: "hook",  purpose: "hook",      headline: "A world built for makers", subtext: "Watch your story come alive." },
    { kind: "text",  purpose: "problem",   headline: "Creation used to be chaos", subtext: "Scattered tools, broken flow." },
    { kind: "text",  purpose: "discovery", headline: "Now everything connects", subtext: "One world. Perfect order." },
    { kind: "feature", purpose: "reveal",  headline: "Meet Genesis", subtext: "Your studio, reimagined." },
    { kind: "feature", purpose: "features",headline: "Built to amaze", onScreenText: ["Cinematic in one click", "Fully brand-aware", "Renders in minutes"] },
    { kind: "stat",  purpose: "proof",     headline: "Loved by creators", onScreenText: ["24000 studios", "4.9 rating", "98% retention"] },
    { kind: "stat",  purpose: "growth",    headline: "Growth that compounds", subtext: "Every launch, bigger." },
    { kind: "cta",   purpose: "cta",       headline: "Genesis", subtext: "Create your world" },
  ],
};

// A universal 3-beat brief — hook / feature / sign-off. The copy is generic on
// purpose: a hover preview sells the pack's MOTION, type and color, not a story.
// The sign-off headline is the pack's own display name, set in the pack's type.
function storyboardFor(label, packName) {
  const bespoke = BESPOKE_PREVIEWS[packName];
  if (bespoke) {
    const scenes = bespoke.map((s, i) => ({ ...s, id: `s${i + 1}` }));
    let bt = 0;
    for (const s of scenes) { s.start = +bt.toFixed(2); s.duration = BESPOKE_SCENE_SEC; bt += BESPOKE_SCENE_SEC; }
    return { title: label, durationSec: +(BESPOKE_SCENE_SEC * scenes.length).toFixed(2), scenes };
  }
  // A preview has one job: show what THIS template can do. Three scenes could not
  // — the omelette packs cast an opener, ONE middle shape and a closer, so a
  // 14-shape template showed 3 of them and the gallery clip read as a glance
  // rather than a preview. These purposes are chosen to exercise the DISTINCT
  // shapes a pack's grammar publishes (problem/board, data/stat, quote, feature
  // list), so arc casting has to reach for a different layout on each one.
  const scenes = [
    { id: "s1", purpose: "hook",    kind: "hook", headline: "Every idea deserves a film.", emphasis: "film",
      subtext: "Say it in one sentence.",
      voiceover: "Every idea deserves a film. Say it in one sentence." },
    { id: "s2", purpose: "problem", kind: "quote", headline: "Good ideas stall in a doc.", emphasis: "stall",
      subtext: "Slides go stale. Edits take weeks. Nobody watches.",
      onScreenText: ["Slides go stale", "Edits take weeks", "Nobody watches"],
      voiceover: "Good ideas stall in a doc. Slides go stale, edits take weeks, nobody watches." },
    { id: "s3", purpose: "feature", kind: "text", headline: "One line in. A film out.", emphasis: "film",
      subtext: "Agents write, design and score every scene.",
      onScreenText: ["Write one honest line", "We art-direct the rest", "A finished film, done"],
      voiceover: "One line in, a film out. Agents write, design and score every scene." },
    { id: "s4", purpose: "data",    kind: "stat", headline: "Proof, not promises.", emphasis: "Proof",
      subtext: "Measured across every film we ship.",
      onScreenText: ["240% faster to a first cut", "12k teams onboard", "9 out of 10 ship it"],
      voiceover: "Proof, not promises. Measured across every film we ship." },
    { id: "s5", purpose: "how",     kind: "text", headline: "Built for your brand.", emphasis: "brand",
      subtext: "Your palette, your type, your screenshots.",
      onScreenText: ["Your palette", "Your typography", "Your product"],
      voiceover: "Built for your brand — your palette, your type, your product." },
    // Beats 6-12 exist because the preview is now the length of the TEMPLATE'S own
    // program (12-15 beats), and a 5-beat copy deck rotated across 15 beats would
    // put the same words on screen three times — the copy equivalent of the shape
    // repetition this whole pass is fixing. Each carries a DIFFERENT purpose so
    // casting is handed a different demand every beat and has to reach for another
    // shape, which is what actually keeps a long preview varied.
    { id: "s6", purpose: "proof",   kind: "quote", headline: "Teams keep the first cut.", emphasis: "first cut",
      subtext: "No re-shoots, no agency round-trips.",
      onScreenText: ["Shipped the same day", "Approved in one pass"],
      voiceover: "Teams keep the first cut — no re-shoots, no agency round-trips." },
    { id: "s7", purpose: "context", kind: "text", headline: "Every scene is yours.", emphasis: "yours",
      subtext: "Swap a line, a colour or a screenshot and it re-cuts.",
      onScreenText: ["Swap the copy", "Swap the palette", "Swap the shots"],
      voiceover: "Every scene is yours — swap a line, a colour or a shot and it re-cuts." },
    { id: "s8", purpose: "feature", kind: "text", headline: "Motion with a point.", emphasis: "point",
      subtext: "Every move lands on a beat of the story.",
      onScreenText: ["Cuts on the beat", "Type that arrives", "Nothing decorative"],
      voiceover: "Motion with a point — every move lands on a beat of the story." },
    { id: "s9", purpose: "data",    kind: "stat", headline: "Made to be finished.", emphasis: "finished",
      subtext: "The numbers behind every render.",
      onScreenText: ["45 seconds, start to end", "1 take, no timeline", "0 plugins"],
      voiceover: "Made to be finished — forty five seconds, one take, no timeline." },
    { id: "s10", purpose: "how",    kind: "text", headline: "Give it a sentence.", emphasis: "sentence",
      subtext: "The script, the shots and the score follow.",
      onScreenText: ["Write the line", "Pick the look", "Watch it cut"],
      voiceover: "Give it a sentence — the script, the shots and the score follow." },
    { id: "s11", purpose: "problem", kind: "quote", headline: "A deck is not a film.", emphasis: "not a film",
      subtext: "One holds attention. The other asks for it.",
      onScreenText: ["Slides ask.", "Films hold."],
      voiceover: "A deck is not a film. One holds attention, the other asks for it." },
    { id: "s12", purpose: "feature", kind: "text", headline: "Your product, on screen.", emphasis: "on screen",
      subtext: "Real captures, framed the way the template intends.",
      onScreenText: ["Real screens", "Framed on-brand", "Never a placeholder"],
      voiceover: "Your product on screen — real captures, framed the way the template intends." },
    { id: "s13", purpose: "cta",     kind: "cta",  headline: label, emphasis: label,
      subtext: "Made with KEYFRAME",
      voiceover: `${label}. Made with KEYFRAME.` },
  ];
  // SHOW THE WHOLE TEMPLATE, AT ITS OWN PACE.
  //
  // Six scenes at 2.4s is a 14.4s clip, and it was the same 14.4s for all 203
  // packs. But these templates are not 14s pieces: measured across the 141
  // bundled programs, the average authored film is 40.6 SECONDS over 13.4 beats
  // drawn from 8.9 distinct shapes, and the handoff README says so outright —
  // "6 recurring beats expanded to ~15-18 scenes so each loop runs 45-55
  // seconds". A 6-beat preview therefore showed roughly a third of the template
  // and never reached most of its vocabulary, which is why packs looked far more
  // samey in the gallery than they actually are.
  //
  // So the preview now follows the TEMPLATE'S OWN program: its beat count and its
  // authored per-beat pace, clamped into the 30-45s window that reads as a real
  // preview rather than a loop. Packs with no authored program (the family
  // engines) get the same target filled at a natural ~3s/beat.
  const authored = authoredProgram(packName);
  const beats = authored
    ? Math.max(8, Math.min(15, authored.beats))
    : Math.max(8, Math.min(13, Math.round(PREVIEW_TARGET_SEC / 3)));
  // Repeat the copy deck as needed, but ROTATE it so a longer preview keeps
  // handing casting a different purpose — the same thing that stops a real film
  // repeating a shape. Never re-uses a purpose back to back.
  const mid = scenes.slice(0, -1);            // every beat except the sign-off
  const closer = scenes[scenes.length - 1];   // the CTA, and ONLY at the end
  const deck = [];
  for (let i = 0; i < beats; i++) {
    // The closer is placed by position, never by falling off the end of the deck:
    // indexing past the middles used to land on the CTA for every remaining beat,
    // so a 15-beat preview ended on THREE identical sign-off slides in a row.
    const src = (i === beats - 1) ? closer : mid[i % mid.length];
    deck.push({ ...src, id: `s${i + 1}` });
  }
  // Per-beat pace: the template's own average, clamped so the clip lands in range.
  const per = authored
    ? Math.max(2.2, Math.min(4.0, authored.sec / Math.max(1, authored.beats)))
    : SCENE_SEC;
  const scaled = Math.max(PREVIEW_MIN_SEC / beats, Math.min(PREVIEW_MAX_SEC / beats, per));
  let t = 0;
  for (const s of deck) { s.start = +t.toFixed(2); s.duration = +scaled.toFixed(2); t += scaled; }
  return { title: label, durationSec: +t.toFixed(2), scenes: deck };
}

// The authored beat count + total seconds of a bundled template, so a preview can
// mirror the film the designer actually built. Null for packs with no bundle.
let _progCache = null;
function authoredProgram(packName) {
  if (!_progCache) {
    _progCache = new Map();
    try {
      const om = require("../src/services/omelette_adapter.js");
      const fm = require("../src/services/frame_manifest");
      for (const p of fs.readdirSync(path.join(__dirname, "..", "..", "frames"))) {
        let man; try { man = fm.getManifest(p); } catch { continue; }
        if (!man || man.renderer !== "omelette") continue;
        const file = om.templatePath(man.template || p);
        if (!file) continue;
        let sc; try { sc = om.readTemplateScenes(fs.readFileSync(file, "utf8")) || []; } catch { continue; }
        if (!sc.length) continue;
        _progCache.set(p, { beats: sc.length, sec: sc.reduce((a, s) => a + (Number(s.dur) || 0), 0) });
      }
    } catch { /* no bundles → every pack uses the generic target */ }
  }
  return _progCache.get(packName) || null;
}

// Human display label for a pack (manifest name / FRAME.md `name:` / slug).
function labelFor(name) {
  const md = frameRegistry.getFrameMd(name) || "";
  const fm = (md.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || md;
  let label = (fm.match(/^name:\s*"?(.+?)"?\s*$/m) || [])[1] || "";
  label = label.replace(/\s*[—-]\s*Frame.*$/i, "").trim();
  if (label) return label;
  return name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function rendererFor(name) {
  try { const m = frameManifest.getManifest(name); return (m && m.renderer) || null; }
  catch { return null; }
}

// Build index.html + meta.json for a pack into jobDir, routing to the right
// composer exactly like the pipeline does.
function buildComposition(name, jobDir) {
  // A portrait-NATIVE pack (pack.json "portraitNative") must preview at 9:16 —
  // rendering its tall design into a 16:9 box letterboxes it, and the resulting
  // poster would read as landscape, which is exactly what /api/frames uses to
  // decide whether the pack belongs in the Vertical section.
  // Read the RAW pack.json, not the parsed manifest: the manifest schema is a
  // zod object that strips keys it does not declare, so `portraitNative` never
  // survives it and every portrait pack would silently preview as landscape —
  // which also overwrites its portrait poster and drops it out of the Vertical tab.
  let portraitNative = false;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(frameRegistry.FRAMES_DIR, name, "pack.json"), "utf8"));
    portraitNative = !!raw.portraitNative;
  } catch { /* default landscape */ }
  // 9:16 derived from the LANDSCAPE HEIGHT as the portrait WIDTH (720 -> 720x1280).
  // Computing width and height independently (H*9/16 by H*16/9) yields 405x1280 —
  // an 0.32 aspect, not 9:16 — which renders the film as a narrow letterboxed
  // strip. The clip's dimensions still looked "portrait", so the defect survived
  // a dimensions check and only showed up in an actual frame.
  // Portrait packs render at their NATIVE 1080x1920. The bundled templates lay
  // their type out in absolute px against that canvas, so rendering smaller does
  // not reflow it — the headline simply overruns the narrower frame. The final
  // clip is downscaled to OUT_W afterwards anyway, so native costs nothing.
  const dims = portraitNative
    ? { width: 1080, height: 1920, fps: FPS }
    : { width: W, height: H, fps: FPS };
  const storyboard = storyboardFor(labelFor(name), name);
  const captionCues = []; // previews carry no baked subtitle cards
  const renderer = rendererFor(name);

  if (renderer && PACK_RENDERERS[renderer]) {
    const built = PACK_RENDERERS[renderer].buildComposition({ storyboard, dims, framePack: name, captionCues, assets: [] });
    return { storyboard, built, via: renderer };
  }

  // Default: deterministic scene-kit + the pipeline's vector/motion enrich floor.
  const built = sceneKit.buildComposition({ storyboard, dims, framePack: name, assets: [], captionCues, seedKey: `preview-${name}` });
  let indexHtml = built.indexHtml;
  try {
    const en = enrichComposition(indexHtml, {
      width: dims.width, height: dims.height, duration: storyboard.durationSec,
      packTokens: frameRegistry.getPackTokens(name),
    });
    if (en.changed) indexHtml = en.html;
  } catch { /* enrich is a bonus; the plain kit is already showcase-grade */ }
  return { storyboard, built: { indexHtml, metaJson: built.metaJson }, via: "scene-kit" };
}

function ff(args) {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", args, { windowsHide: true });
    let err = "";
    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("error", () => resolve({ ok: false, err: "ffmpeg not found" }));
    p.on("exit", (code) => resolve({ ok: code === 0, err }));
  });
}

// Pick the brightest of several sampled frames for the poster, so a pack that
// opens on a dark scene never yields a black card. Mirrors renderer.js.
function ffLum(videoPath, t) {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", ["-v", "error", "-ss", t.toFixed(2), "-i", videoPath, "-frames:v", "1", "-vf", "scale=1:1,format=gray", "-f", "rawvideo", "-"], { windowsHide: true });
    const chunks = [];
    p.stdout.on("data", (d) => chunks.push(d));
    p.on("error", () => resolve(0));
    p.on("exit", () => { const b = Buffer.concat(chunks); resolve(b.length ? b[0] : 0); });
  });
}

async function encodePreview(srcMp4, dur, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const previewOut = path.join(outDir, "preview.mp4");
  const posterOut = path.join(outDir, "poster.jpg");

  // Compact, muted, web-loopable H.264. Even dims for yuv420p; faststart for
  // instant hover playback.
  const enc = await ff([
    "-y", "-hide_banner", "-loglevel", "error", "-i", srcMp4,
    "-an", "-vf", `scale=${OUT_W}:-2:flags=lanczos`,
    "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-crf", String(CRF), "-preset", "veryfast", "-movflags", "+faststart",
    previewOut,
  ]);
  if (!enc.ok) throw new Error(`ffmpeg encode failed: ${enc.err.slice(-300)}`);

  // Brightest-frame poster.
  let bestT = dur * 0.45, bestLum = -1;
  for (const fr of [0.15, 0.3, 0.45, 0.6, 0.78, 0.9]) {
    const t = Math.max(0.1, dur * fr);
    const lum = await ffLum(srcMp4, t);
    if (lum > bestLum) { bestLum = lum; bestT = t; }
  }
  await ff(["-y", "-hide_banner", "-loglevel", "error", "-ss", bestT.toFixed(2), "-i", srcMp4, "-frames:v", "1", "-vf", `scale=${OUT_W}:-2`, "-q:v", "4", posterOut]);
  return { previewOut, posterOut };
}

async function buildPack(name) {
  const jobId = `preview-${name}-${W}x${H}`;
  const jobDir = path.join(WORK, name);
  try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch { /* stale handle from a prior run */ }
  fs.mkdirSync(jobDir, { recursive: true });

  const { storyboard, built, via } = buildComposition(name, jobDir);
  fs.writeFileSync(path.join(jobDir, "index.html"), built.indexHtml, "utf8");
  fs.writeFileSync(path.join(jobDir, "meta.json"), built.metaJson, "utf8");
  console.log(`[previews] ${name}: composed via ${via} (${storyboard.scenes.length} scenes, ${storyboard.durationSec}s @ ${W}x${H})`);

  const visual = await render({ jobId, jobDir, durationSec: storyboard.durationSec, quality: QUALITY });
  const outDir = path.join(PUBLIC_FRAMES, name);
  const { previewOut } = await encodePreview(visual.videoPath, storyboard.durationSec, outDir);

  // Tidy: drop the full-res render + its stray thumbnail and the temp job dir.
  // Cleanup is best-effort — on Windows the just-finished render subprocess can
  // still hold a fleeting handle on the job dir (EPERM); the preview is already
  // saved, so a failed sweep must NOT fail the pack. Leftovers are reclaimed on
  // the next run's initial rm (also guarded).
  try { fs.unlinkSync(visual.videoPath); } catch { /* noop */ }
  try { fs.unlinkSync(visual.videoPath.replace(/\.mp4$/, ".jpg")); } catch { /* noop */ }
  try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch { /* windows handle lag */ }

  const kb = Math.round(fs.statSync(previewOut).size / 1024);
  console.log(`[previews] ${name}: ✓ preview.mp4 (${kb} KB) + poster.jpg -> public/frames/${name}/`);
}

function selectPacks(argv) {
  const all = frameRegistry.listPacks();
  const flags = argv.filter((a) => a.startsWith("--"));
  const named = argv.filter((a) => !a.startsWith("--"));
  if (named.length) return named.filter((n) => all.includes(n) || console.warn(`[previews] unknown pack: ${n}`) || false);
  if (flags.includes("--missing")) {
    return all.filter((n) => !fs.existsSync(path.join(PUBLIC_FRAMES, n, "preview.mp4")));
  }
  return all;
}

async function main() {
  fs.mkdirSync(WORK, { recursive: true });
  const packs = selectPacks(process.argv.slice(2));
  console.log(`[previews] building ${packs.length} pack preview(s): ${packs.join(", ")}`);
  const failed = [];
  for (const name of packs) {
    try { await buildPack(name); }
    catch (e) { console.error(`[previews] ${name}: ✗ ${String(e.message).slice(0, 400)}`); failed.push(name); }
  }
  console.log(`\n[previews] done. ok=${packs.length - failed.length} failed=${failed.length}${failed.length ? " -> " + failed.join(", ") : ""}`);
  if (failed.length) process.exitCode = 1;
}

main();
