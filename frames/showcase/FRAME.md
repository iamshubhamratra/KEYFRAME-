# SHOWCASE — annotated product tour

**Renderer** `showcase` · **Composer** `server/src/services/showcase_composer.js` · **Stage** 1920×1080 (`orientation: landscape`)

The library's first **landscape-authored** native pack, and its most screenshot-hungry: up to
**ten image slots across seven beats**. Where the other packs decorate around a picture, this
one *annotates* it — the film's argument is made by pointing at the product.

Ported scene-for-scene from an imported OM/React template (`showcase-film.jsx`,
`SCENE_MAP = Intro/Tour/Detail/Mobile/Montage/Proof/CTA`, `transition="cut"`). The reference's
layout, rhythm and device vocabulary are reproduced; **none of its marketing copy is** — every
string the film prints is either derived from the storyboard or is a neutral label on the
film's own structure (`STRINGS`).

## The spine — seven roles, fixed order

| # | role | draws | needs |
|---|---|---|---|
| 1 | `intro` | centred headline + hero screenshot rising into a browser window, cursor travels in | — (type-only without a shot) |
| 2 | `tour` | left copy column, browser window slides in from the right and zooms to a focal point, highlight box, arrow, callout | 1 shot (type-only without) |
| 3 | `detail` | one large centred browser window, up to 3 numbered annotations drawn onto it in sequence | 1 shot **and** ≥1 bullet |
| 4 | `mobile` | phone rises from below-left, right-aligned copy, arrow + callout, cursor taps | 1 **portrait** shot |
| 5 | `montage` | 6/5/4/3/2 tiles flying in from staggered directions | ≥2 shots |
| 6 | `proof` | up to 3 stat cards counting real figures up from zero | ≥2 numbers in the beat |
| 7 | `call` | logo tile, centred headline, accent pill + address | — (logo optional) |

The first beat is always `intro`, the last always `call`; the middle beats walk
`tour · detail · mobile · montage · proof` **in order**, skipping any layout the beat cannot
carry. A film may show three of the five middle layouts — never a reshuffle.

## Three laws this pack is built around

**1 · Never draw an empty device frame.** The reference paints a dashed *"DROP IMAGE TO
REPLACE"* placeholder in any unfilled slot. That is right for an editor and wrong for a
delivered film — two designed empty states have already been rejected by QA on this program
(*"large red block dominates frame"*, then *"placeholder number instead of visual media"*). So
chrome is drawn **only** around a real picture: `detail`/`mobile`/`montage` are skipped when
short, `intro`/`tour` fall back to type-only layouts, and the montage **re-lays its grid** to
the number of pictures it actually has. Verified: device frames == picture count at 8, 5, 3
and 0 assets.

**2 · The camera narrows the frame.** `.sc-cam` scales its own layer to 1.03, so 3% of every
edge is off-stage for the whole beat. Every *measured* type run divides by `CAM_SAFE`.

**3 · No line may cross type.** The reference tows each paper plane on a dashed trail. On a
landscape stage those trails cut straight through the headline band, and grid-dispatch already
proved QA reads **any** line through type as a collision — its emphasis bar was removed for
exactly this. The trails are gone; the plane glyphs remain, at 0.55 opacity and *beneath* the
52px grid, so a crossing reads as wallpaper.

## Brand

`showcase` is in `SKIN_AWARE_RENDERERS`. One brand accent lands on the CTA pill, arrows,
callout chips, highlight boxes, the brand badge and the stat figures — **and** derives the four
companion backdrop hues and the highlight mark by hue rotation, so a branded film repaints the
whole wash rather than only its furniture. A pale accent is darkened (`ensureInk`) until it
reads on near-white paper.

## Asset slots and the shapes they want

`SLOT_SHAPES` states each box's aspect: hero 2.06 · tour 1.74 · detail 1.92 · **phone 0.46** ·
montage 1.39–2.70. Slots are filled **breadth before depth** (every scene's first box, in scene
order, before any scene's second), scored on the CD's rank + a scene-id relevance hint + an
own-asset bonus − 3× log-misfit. The heavy misfit weight is what keeps a 1.78:1 desktop capture
out of the 0.46:1 phone screen, where it would be cropped to a vertical sliver.

## Backdrop cost

The blobs are **radial-gradients on two drifting layers**, not five blurred divs. Five
`filter:blur` divs × 7 scenes is 35 heavy-overlay elements, and the renderer's lint flags that
against a field report where ~40 such elements captured **solid black for the first half of the
render** through every capture path. Two gradient layers per scene is 14. Lint: 0 errors.

## Dev harness

```
node scripts/showcase-harness.js <outDir> [W] [H] [#hex,...] [shots:N]
cd <outDir> && npx --yes hyperframes@0.6.120 render --output renders/out.mp4 --quality draft
```

`shots:N` stages N pictures at **real, different** aspect ratios. The count is the point — it
is what exercises the montage's re-layout and the empty-frame law. Staging them all at one
ratio hides every crop bug this pack can have.
