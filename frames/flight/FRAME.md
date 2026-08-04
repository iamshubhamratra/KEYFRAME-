# Flight

**Renderer** `flight` · **Composer** `server/src/services/flight_composer.js` · **Stage** 1920×1080 (`orientation: landscape`) · built on `om_port_kit`

A departure film. A daylight sky graded from a pale horizon to a deeper zenith, a warm sun disc bleeding light, drifting cloud banks and a dark ground plane with a dashed runway centreline that scrolls beneath you. One hot orange against all that blue. A simple aircraft mark crosses the frame on every beat — taxiing on the opener, banking up and away on the reveal — and pictures ride in rounded cabin-window panels with an inner light-catch. Authored landscape-first (16:9) as a native GSAP + DOM composition, sharing one module with its 9:16 cut. Best for travel, logistics, mobility, onboarding and any brand whose story is going somewhere.

## Spine

`gate · climb · cruise · instruments · arrival`

Picture slots: **up to 5 (gate, climb, cruise×3)**. The first beat and the last are fixed; the middle beats walk their
roles in order, skipping any layout the beat cannot carry. A film may show three of the middle
layouts — never a reshuffle.

## Signature

ONE MODULE, TWO ASPECTS — `flight` and `flight-vertical` share this file, branching on `stage.portrait` so the horizon, climb arc and instrument row re-proportion rather than being duplicated. An aircraft mark crosses every beat; pictures ride rounded cabin-window panels.

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
node scripts/om-port-harness.js flight <outDir> "" shots:8
cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft
```

Test at `shots:8`, `shots:1` and `shots:0` — the low counts are what exercise both laws above.
