# Drive

**Renderer** `drive` · **Composer** `server/src/services/drive_composer.js` · **Stage** 1920×1080 (`orientation: landscape`) · built on `om_port_kit`

A golden-hour highway film. A sunset sky graded amber to coral to rose over a violet skyline that scrolls past in two parallax bands, with a dark road filling the lower third and a dashed centreline running toward you. One cool teal against all that warmth — the signal colour in a warm frame. The signature device is the BILLBOARD: pictures ride on roadside hoardings with two support posts, angled slightly and sweeping in from the right as though you were driving by. Authored landscape-first (16:9) as a native GSAP + DOM composition. Best for automotive, travel, delivery, outdoor brands and any product with somewhere to be.

## Spine

`intro · billboards · feature · stats · wheel`

Picture slots: **up to 4 (intro, billboards×3)**. The first beat and the last are fixed; the middle beats walk their
roles in order, skipping any layout the beat cannot carry. A film may show three of the middle
layouts — never a reshuffle.

## Signature

The signature device is the BILLBOARD: pictures ride roadside hoardings on two support posts, angled and sweeping in from the right as though you were driving by. Two skyline bands parallax at different speeds over a scrolling centreline.

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

Barlow Semi Condensed → Archivo (tracked tighter to imply the condensing), Sora → Figtree

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
node scripts/om-port-harness.js drive <outDir> "" shots:8
cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft
```

Test at `shots:8`, `shots:1` and `shots:0` — the low counts are what exercise both laws above.
