# Edition

**Renderer** `edition` · **Composer** `server/src/services/edition_composer.js` · **Stage** 1920×1080 (`orientation: landscape`) · built on `om_port_kit`

A printed broadsheet in motion. Warm newsprint stock, near-black ink, one editorial red and one ink blue. Anton set enormous and tight for every headline, heavy rules that draw themselves across the measure, a six-column grid with hairline column rules, and a dateline and folio on every page. Pictures are PRINTED in the grid with a keyline and a caption beneath, never floated as decoration; the index page rules itself into a numbered contents list and the comment page sets one statement between two heavy rules. Authored landscape-first (16:9) as a native GSAP + DOM composition. Best for journalism, research, long-form, policy, publishing and any brand that wants to sound authoritative rather than excited.

## Spine

`cover · lead · ledger · quote · colophon`

Picture slots: **2 (cover, lead)**. The first beat and the last are fixed; the middle beats walk their
roles in order, skipping any layout the beat cannot carry. A film may show three of the middle
layouts — never a reshuffle.

## Signature

Anton set enormous on a six-column measure, with heavy rules that draw themselves across it. Pictures are PRINTED in the grid with a keyline and a caption beneath, never floated. Anton is condensed: its uppercase advance is set to 0.50em, deliberately on the safe side.

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

none — Anton is bundled

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
node scripts/om-port-harness.js edition <outDir> "" shots:8
cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft
```

Test at `shots:8`, `shots:1` and `shots:0` — the low counts are what exercise both laws above.
