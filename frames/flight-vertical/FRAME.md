# Flight Vertical

**Renderer** `flight-vertical` · **Composer** `server/src/services/flight_vertical_composer.js` · **Stage** 1080×1920 (`orientation: portrait`) · built on `om_port_kit`

The 9:16 cut of Flight, re-proportioned rather than scaled: the horizon sits lower, the cabin windows stack down the frame instead of across it, and the instrument dials run as a column. Same graded daylight sky, warm sun disc, scrolling runway and hot orange accent; the aircraft mark still crosses every beat. Authored portrait-first (9:16) as a native GSAP + DOM composition sharing one module with its landscape sibling, so the two cuts can never drift apart. Best for travel, logistics, mobility and onboarding, cut for Reels, Shorts and Stories.

## Spine

`gate · climb · cruise · instruments · arrival`

Picture slots: **up to 5 (gate, climb, cruise×3)**. The first beat and the last are fixed; the middle beats walk their
roles in order, skipping any layout the beat cannot carry. A film may show three of the middle
layouts — never a reshuffle.

## Signature

The 9:16 cut of `flight`, sharing its module (see `flight_composer.js`). The horizon drops, cabin windows stack down the frame and the instrument dials run as a column.

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

Manrope → Figtree, DM Mono → JetBrains Mono

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
node scripts/om-port-harness.js flight-vertical <outDir> "" shots:8
cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft
```

Test at `shots:8`, `shots:1` and `shots:0` — the low counts are what exercise both laws above.
