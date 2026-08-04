# Fetch

**Renderer** `fetch` · **Composer** `server/src/services/fetch_composer.js` · **Stage** 1920×1080 (`orientation: landscape`) · built on `om_port_kit`

A bright park afternoon. Pale blue sky, a warm sun, drifting clouds and rolling grass in two greens with a scalloped horizon that sways. Cream cards with soft rounded corners and a friendly chunky display face, and one warm orange accent. The signature is BOUNCE — everything arrives on an overshoot and settles, and a ball arcs and spins across the frame on every single beat. Pictures ride in rounded cream cards tilted a degree or two, like photos stuck to a fridge, and the figures land on cream rosettes. Authored landscape-first (16:9) as a native GSAP + DOM composition. Best for pets, family, food, community, education and any brand that should feel warm and unserious.

## Spine

`title · fetch · feature · stats · comeplay`

Picture slots: **2 (title, fetch)**. The first beat and the last are fixed; the middle beats walk their
roles in order, skipping any layout the beat cannot carry. A film may show three of the middle
layouts — never a reshuffle.

## Signature

The signature is BOUNCE — everything arrives on an overshoot and settles, and a ball arcs and spins across the frame on every beat. NOTE: the reference ships this file three times (`launch` and `flightVertical` are byte-identical copies), so it is ported ONCE, here.

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

Fredoka → Caprasimo, Nunito → Figtree

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
node scripts/om-port-harness.js fetch <outDir> "" shots:8
cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft
```

Test at `shots:8`, `shots:1` and `shots:0` — the low counts are what exercise both laws above.
