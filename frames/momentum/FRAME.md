# Momentum

**Renderer** `momentum` · **Composer** `server/src/services/momentum_composer.js` · **Stage** 1920×1080 (`orientation: landscape`) · built on `om_port_kit`

A kinetic-velocity film. A near-black warm ground with cream ink and one hot vermilion, and a horizontal motion axis on every single beat. Headlines arrive as whole words sliding out of hard-edged masks; speed rules streak in from the left and settle; a marquee of the beat's OWN words scrolls through the middle band. Pictures are not panels here — they are edge-to-edge bands that crop wide and drift under a directional scrim, so the film always reads as moving rather than presenting. Authored landscape-first (16:9) as a native GSAP + DOM composition. Best for sport, automotive, fintech, agencies and any brand whose pitch is speed.

## Spine

`intro · point · feature · gallery · stats · go`

Picture slots: **up to 5 (intro, feature, gallery×3)**. The first beat and the last are fixed; the middle beats walk their
roles in order, skipping any layout the beat cannot carry. A film may show three of the middle
layouts — never a reshuffle.

## Signature

Every beat has a horizontal motion axis. Headlines arrive as whole words sliding out of hard-edged masks; speed rules streak in and settle; a marquee of the beat's OWN words scrolls through the middle band. Pictures are edge-to-edge bands, not panels.

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

Hanken Grotesk → Figtree, Space Mono → JetBrains Mono

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
node scripts/om-port-harness.js momentum <outDir> "" shots:8
cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft
```

Test at `shots:8`, `shots:1` and `shots:0` — the low counts are what exercise both laws above.
