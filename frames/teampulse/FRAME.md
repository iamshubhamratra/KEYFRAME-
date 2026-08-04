# Teampulse

**Renderer** `teampulse` · **Composer** `server/src/services/teampulse_composer.js` · **Stage** 1080×1920 (`orientation: portrait`) · built on `om_port_kit`

A kinetic-typography film where the TYPE is the design. A warm earthy office ground — deep umber washed with a terracotta bloom and a sage counter-tone — with cream paper for every card. Headlines are set enormous in a chunky display face and animated WORD BY WORD: words flip on their X axis, type on one at a time under a blinking cursor, or slide out of hard-edged masks, with every third word taking the accent. Feature rows slide in from alternating sides and the figures land on full-width cream slabs. Authored portrait-first (9:16) as a native GSAP + DOM composition. Best for hiring, culture, internal comms, agencies and any brand whose message is a sentence rather than a screenshot.

## Spine

`hook · showcase · features · wall · wall-flip · numbers · join`

Picture slots: **2 (hook, showcase)**. The first beat and the last are fixed; the middle beats walk their
roles in order, skipping any layout the beat cannot carry. A film may show three of the middle
layouts — never a reshuffle.

## Signature

THIRTEEN REFERENCE SCENES, SIX ROLES. The reference is a scene LIBRARY, not a fixed sequence — TypeWall/Typewriter/FlipWords are one composition with three entrances, and Problem/Outline/BigQuote are one more. They are consolidated to the six the storyboard can actually feed, with the distinct entrances preserved as variants. Type is animated WORD BY WORD.

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

none — Caprasimo + Figtree are bundled

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
node scripts/om-port-harness.js teampulse <outDir> "" shots:8
cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft
```

Test at `shots:8`, `shots:1` and `shots:0` — the low counts are what exercise both laws above.
