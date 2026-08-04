# Pipeline

**Renderer** `pipeline` · **Composer** `server/src/services/pipeline_composer.js` · **Stage** 1920×1080 (`orientation: landscape`) · built on `om_port_kit`

A factory line in motion. Cool machine-shop grey under a fine engineering grid, white equipment panels with hard 3px borders, brushed-steel rules and one safety orange. A conveyor runs across the foot of every frame with chevrons scrolling along it and parts travelling into station. Screenshots ride in inspection bays — a bordered panel with a station number, a label and a status lamp — and the process beat lays numbered stations across the frame linked by feed arrows. The close is a full-bleed safety field over hazard stripes. Authored landscape-first (16:9) as a native GSAP + DOM composition. Best for manufacturing, logistics, devops, data pipelines, QA and any product that is really a process.

## Spine

`boot · line · assemble · throughput · ship`

Picture slots: **up to 4 (boot, assemble×3)**. The first beat and the last are fixed; the middle beats walk their
roles in order, skipping any layout the beat cannot carry. A film may show three of the middle
layouts — never a reshuffle.

## Signature

A DEFECT FIXED AT PORT TIME: the reference declares its stage as **14×20**, a scaled-down constant that would render a fourteen-pixel-wide film. Every geometry number in it was authored against 1920×1080, which is the stage used here. A conveyor runs across the foot of every frame with chevrons scrolling along it.

## The two laws it inherits from the kit

**1 · Never draw an empty container.** No device frame, panel, card or plate is drawn around
nothing. Layouts that need pictures are skipped when short; multi-picture layouts re-lay their
grid to the number they actually have.

**2 · Never leave an empty frame either.** A beat with no picture gets `statement` — a layout
*designed* to be pictureless (oversized type scaled to the room it has, an accent rule, and the
beat's own bullets as a ruled list whose rows divide the remaining height to reach the stage
foot). Every word of it comes from the script. Law 2 exists because QA blocked a delivered film
at 4/10 for "massive empty space around headline" even with law 1 satisfied.

## Fonts

Chakra Petch → Archivo; IBM Plex Mono is bundled and used as authored

## Brand

In `SKIN_AWARE_RENDERERS`. One brand accent is resolved against this pack's own ground (dark
grounds LIFT it, light grounds darken it) and every companion hue is derived from it by rotation,
so a rebranded film repaints its whole palette rather than only its furniture.

## Figures

Stat beats print only numbers found in the script — nothing is invented — and the counters land
EARLY in the beat, because every frame before they do shows a number the script never claimed
and this film is frame-sampled by review.

## Dev harness

```
node scripts/om-port-harness.js pipeline <outDir> "" shots:8
cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft
```

Test at `shots:8`, `shots:1` and `shots:0` — the low counts are what exercise both laws above.
