# Reel

**Renderer** `reel` · **Composer** `server/src/services/reel_composer.js` · **Stage** 1080×1920 (`orientation: portrait`) · built on `om_port_kit`

A social story film, built for the thumb. A deep violet ground washed with three saturated blooms and one electric lime accent; Archivo set heavy, tight and uppercase, stacked so each line lands on its own beat. Everything is a sticker card with a hard offset shadow rather than a panel in a UI, tilted a degree or two and snapping in from alternating sides. A segmented story bar runs across the top, one segment per scene, filling in real time. Authored portrait-first (9:16) as a native GSAP + DOM composition. Best for Reels, Shorts, TikTok, DTC launches and any brand that needs to stop a scroll in the first second.

## Spine

`hook · show · perks · numbers · cta`

Picture slots: **2 (hook, show)**. The first beat and the last are fixed; the middle beats walk their
roles in order, skipping any layout the beat cannot carry. A film may show three of the middle
layouts — never a reshuffle.

## Signature

A segmented story bar runs across the top, one segment per scene, filling in real time — driven per beat rather than by the kit's film-wide rule. Everything is a tilted sticker card with a hard offset shadow.

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

none — Archivo is bundled

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
node scripts/om-port-harness.js reel <outDir> "" shots:8
cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft
```

Test at `shots:8`, `shots:1` and `shots:0` — the low counts are what exercise both laws above.
