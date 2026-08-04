# Fight

**Renderer** `fight` · **Composer** `server/src/services/fight_composer.js` · **Stage** 1920×1080 (`orientation: landscape`) · built on `om_port_kit`

A fight-night promo. Near-black arena under a breathing spotlight pool, one hot red and one belt gold, ring ropes across the foot of every frame. Anton set enormous and tight so beats LAND rather than arrive: type slams in on back-eased scale, the frame shakes once on the hit, and a struck VS drops between two angled fighter cards. Pictures ride in gold-keylined cards with a corner flash and a name plate; the tale of the tape slams its points in one at a time and the judges' scorecard counts real figures onto gold plates. Authored landscape-first (16:9) as a native GSAP + DOM composition. Best for sports, fitness, competitive products, launches and any brand that wants confrontation and stakes.

## Spine

`main · tape · combos · card · stepin`

Picture slots: **3 (main, tape×2)**. The first beat and the last are fixed; the middle beats walk their
roles in order, skipping any layout the beat cannot carry. A film may show three of the middle
layouts — never a reshuffle.

## Signature

Beats LAND rather than arrive: type slams in on back-eased scale and the frame shakes once on the hit (one shake per beat, never a loop). A struck VS drops between two angled, gold-keylined fighter cards.

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
node scripts/om-port-harness.js fight <outDir> "" shots:8
cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft
```

Test at `shots:8`, `shots:1` and `shots:0` — the low counts are what exercise both laws above.
