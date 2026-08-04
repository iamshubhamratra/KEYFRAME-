# Deep

**Renderer** `deep` · **Composer** `server/src/services/deep_composer.js` · **Stage** 1920×1080 (`orientation: landscape`) · built on `om_port_kit`

A descent into a bioluminescent trench. The ground DARKENS down the frame — a teal shelf at the surface grading to near-black at the foot — with god-rays raking down and motes of marine snow drifting up through them. One bioluminescent teal against a deep violet counter-glow, and everything glows rather than shines: type carries a soft halo, copy sits on slabs lit from within, and pictures ride in rim-lit portholes with a caustic sheen that bob gently on the current. The closing beat inverts the whole column so the light rises. Authored landscape-first (16:9) as a native GSAP + DOM composition. Best for research, biotech, data, AI and any brand that wants depth and discovery rather than noise.

## Spine

`descend · discover · explore · signals · surface`

Picture slots: **up to 5 (descend, discover, explore×3)**. The first beat and the last are fixed; the middle beats walk their
roles in order, skipping any layout the beat cannot carry. A film may show three of the middle
layouts — never a reshuffle.

## Signature

The ground DARKENS down the frame and the closing beat inverts the whole column so the light rises. God-rays rake through drifting marine snow; pictures ride rim-lit portholes that bob on the current.

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

Outfit → Figtree, DM Mono → JetBrains Mono

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
node scripts/om-port-harness.js deep <outDir> "" shots:8
cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft
```

Test at `shots:8`, `shots:1` and `shots:0` — the low counts are what exercise both laws above.
