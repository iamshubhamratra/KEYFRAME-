# Hacker

**Renderer** `hacker` · **Composer** `server/src/services/hacker_composer.js` · **Stage** 1920×1080 (`orientation: landscape`) · built on `om_port_kit`

A terminal in motion. Near-black ground, phosphor green, one monospace face for the entire system — bracketed prompts, boot logs that type themselves line by line, progress bars that fill in discrete blocks, and scanlines with a soft CRT flicker over every frame. Screenshots are framed as terminal windows with a filesystem path in the titlebar rather than as pictures on a wall; the reveal beat glitches a full-width banner across the screen in hard step-eased jumps. Authored landscape-first (16:9) as a native GSAP + DOM composition. Best for developer tools, security, infrastructure, CLI products and anything whose audience lives in a shell.

## Spine

`boot · access · compile · metrics · deploy`

Picture slots: **2 (boot, access)**. The first beat and the last are fixed; the middle beats walk their
roles in order, skipping any layout the beat cannot carry. A film may show three of the middle
layouts — never a reshuffle.

## Signature

Boot logs type themselves line by line, block progress bars fill in discrete cells, and the reveal beat glitches a full-width banner across the screen in hard step-eased jumps. Screenshots are framed as terminal windows with a filesystem path in the titlebar.

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

none — JetBrains Mono is bundled

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
node scripts/om-port-harness.js hacker <outDir> "" shots:8
cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft
```

Test at `shots:8`, `shots:1` and `shots:0` — the low counts are what exercise both laws above.
