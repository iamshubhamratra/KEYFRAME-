# Orbit

**Renderer** `orbit` · **Composer** `server/src/services/orbit_composer.js` · **Stage** 1920×1080 (`orientation: landscape`) · built on `om_port_kit`

A launch-control film. Deep-space ground scattered with a slow-drifting starfield, a cool blue accent set against a hot flame orange, and thin hairline panels with corner ticks — mission-control instrumentation rather than sci-fi chrome. A monospace clock ticks the opener down from ten; the reveal beat rides the payload up out of frame-bottom on a flame column; screenshots sit inside bracketed viewports labelled like telemetry feeds, and the closing readouts count real figures onto accent-topped panels. Authored landscape-first (16:9) as a native GSAP + DOM composition. Best for launches, hardware, deep-tech, fintech and any product that wants to feel engineered rather than decorated.

## Spine

`countdown · liftoff · fleet · telemetry · go`

Picture slots: **up to 6 (countdown, liftoff, fleet×4)**. The first beat and the last are fixed; the middle beats walk their
roles in order, skipping any layout the beat cannot carry. A film may show three of the middle
layouts — never a reshuffle.

## Signature

A monospace clock ticks the opener down from ten in whole numbers; the reveal rides the payload up out of frame-bottom on a flame column. Screenshots sit in hairline viewports with corner ticks, labelled like telemetry feeds.

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

none — Space Grotesk + JetBrains Mono are bundled

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
node scripts/om-port-harness.js orbit <outDir> "" shots:8
cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft
```

Test at `shots:8`, `shots:1` and `shots:0` — the low counts are what exercise both laws above.
