# Jungle

**Renderer** `jungle` · **Composer** `server/src/services/jungle_composer.js` · **Stage** 1920×1080 (`orientation: landscape`) · built on `om_port_kit`

A rainforest expedition. Four layered canopy bands from pale mist at the horizon to near-black undergrowth at the foot, each with a scalloped leaf edge and each drifting at its own speed so the frame has real depth. Fireflies rise and fade through it. Warm cream paper for every card, one marigold accent and a coral pop, and a chunky hand-lettered display face on every headline. Pictures ride in leaf-cut frames — two opposite corners rounded hard — pinned with a wooden peg and swinging in from above. The route beat lays numbered stops along a dashed trail. Authored landscape-first (16:9) as a native GSAP + DOM composition. Best for kids, education, eco, travel, food and any brand that wants warmth and adventure.

## Spine

`enter · discover · trek · sightings · census · comealong`

Picture slots: **up to 5 (enter, discover, sightings×3)**. The first beat and the last are fixed; the middle beats walk their
roles in order, skipping any layout the beat cannot carry. A film may show three of the middle
layouts — never a reshuffle.

## Signature

Four canopy bands with scalloped leaf edges, each drifting at its own speed so the frame has real depth. Pictures ride leaf-cut frames — two opposite corners rounded hard — pinned with a wooden peg and swinging in from above.

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

Chewy → Caprasimo, Nunito → Figtree

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
node scripts/om-port-harness.js jungle <outDir> "" shots:8
cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft
```

Test at `shots:8`, `shots:1` and `shots:0` — the low counts are what exercise both laws above.
