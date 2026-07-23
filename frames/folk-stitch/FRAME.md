---
version: alpha
name: Folk Stitch — Frame (video / frame layer)
description: >
  An embroidered folk sampler sewn in real time on midnight felt. Scandinavian folk-art
  cross-stitch: bright thread on dark fabric, slab block letters punched in stitch by stitch,
  borders that sew themselves. The atoms — night felt ground, four thread colors (marigold /
  thread red / yarn cream / teal), Alfa Slab One display + Inter body, and decoration that is
  ALWAYS thread (running stitches, cross-stitch X's, zigzag hems, buttons, tassels) — are
  sacred. The surface is flat matte felt: no gradients, no glow, no blur, no shadow. Motion is
  the sewing itself: needle-punch letter entrances, loom-pass weave transitions, thread that
  crawls through the fabric.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: everything is thread · the sampler border frames every scene · numbers come from the script
colors:
  felt: "#232840"
  marigold: "#F0A83C"
  thread-red: "#E15546"
  cream: "#F2E9D8"
  teal: "#5FB0A0"
typography:
  # — reading ramp (Inter, always {colors.cream} on felt) —
  body:           { fontFamily: "Inter", cqw: 1.0,  weight: 400, lineHeight: 1.7, color: "{colors.cream}" }
  body-strong:    { fontFamily: "Inter", cqw: 1.1,  weight: 600, lineHeight: 1.6, color: "{colors.cream}" }
  stitch-label:   { fontFamily: "Inter", px: 12, weight: 700, tracking: "4px", upper: true, note: "eyebrow — marigold or teal thread" }
  patch-caption:  { fontFamily: "Inter", px: 13, weight: 600, tracking: "2px", upper: true, note: "caption inside a patch" }
  # — display ramp (Alfa Slab One — sampler block letters, ALWAYS uppercase) —
  patch-title:    { fontFamily: "Alfa Slab One", cqw: 1.8, weight: 400, lineHeight: 1.15, upper: true }
  motto:          { fontFamily: "Alfa Slab One", cqw: 2.8, weight: 400, lineHeight: 1.15, upper: true }
  sampler-headline: { fontFamily: "Alfa Slab One", cqw: 4.2, weight: 400, lineHeight: 1.1, upper: true }
  hero-motto:     { fontFamily: "Alfa Slab One", cqw: 6.0, weight: 400, lineHeight: 1.05, upper: true }
  stat-numeral:   { fontFamily: "Alfa Slab One", cqw: 5.4, weight: 400, lineHeight: 1.0, upper: true, note: "always in one thread color" }
  # — decorative —
  border-monogram: { fontFamily: "Alfa Slab One", cqw: 1.4, weight: 400, upper: true, color: "{colors.marigold}", note: "tiny initials sewn into a border corner" }
spacing:
  pad-x: "6cqw"        # inside the sampler-frame border
  pad-y: "5cqw"
  border-inset: "2.2cqw"   # sampler-frame distance from the frame edge
  gap-grid: "2cqw"
  patch-pad: "2cqw"
components:
  running-stitch:
    stroke: "0.22cqw, stroke-dasharray ~1.1cqw 0.9cqw, round caps"
    color: "any thread color on {colors.felt}"
    motion: "stroke-dashoffset crawls continuously — thread being pulled through felt"
    description: "The atom of the system — a dashed hand-sewn line. Divider, underline, connector, border."
  cross-stitch-row:
    unit: "an X of two 0.24cqw strokes, ~1.2cqw square, gap ~0.8cqw"
    color: "alternate {colors.thread-red} / {colors.marigold}, or one color"
    motion: "X's pop in one by one, scale 0→1, tiny overshoot"
    description: "A row of cross-stitch X's — border band, emphasis underscore, corner cluster."
  zigzag-hem:
    stroke: "0.26cqw polyline, ~1.6cqw peaks, round joins"
    color: "{colors.teal} or {colors.thread-red}"
    description: "Rick-rack ribbon edge — top/bottom hems, patch trims. A LINE, never a filled ribbon."
  patch:
    backgroundColor: "{colors.felt} (self-colored) or rgba(242,233,216,0.06) tint"
    border: "0.2cqw dashed thread color (the sewn-on seam)"
    rounded: "0.6cqw — a soft fabric corner, no more"
    shadow: "none"
    typography: "{typography.patch-title} + {typography.body} / {typography.stat-numeral}"
    description: "A stitched-on fabric patch card for stats, captions, list items. Chrome = its dashed seam only."
  button:
    shape: "circle, 1.2–2cqw, 0.2cqw solid thread-color ring, 4 holes + thread cross"
    description: "A 4-hole button dot — bullet, timeline node, corner accent. The LARGEST allowed filled shape."
  tassel:
    shape: "a knot dot + 5–7 hanging 0.18cqw strands, ~2.5cqw long"
    motion: "gentle pendulum sway, ±6°"
    description: "Hangs from border midpoints or patch corners. Decoration only, never load-bearing."
  sampler-frame:
    layers: "outer running-stitch rect + inner zigzag-hem or cross-stitch-row band, corner X clusters"
    inset: "{spacing.border-inset}"
    motion: "sews itself on scene entry — masked stroke draw, corners popping last"
    description: "The traditional decorative border around the WHOLE frame. Every scene has one."
---

# Folk Stitch — Frame (video / frame layer)

## Overview

Folk Stitch at frame scale is a **living embroidery sampler**: one dark ground — night felt —
carrying bright thread in four colors, composed with the symmetry of a Scandinavian cross-stitch
motto hanging on a wall. Nothing is drawn, printed, or lit; **everything is sewn**. Rules are
running stitches, borders are zigzag rick-rack and rows of X's, cards are stitched-on patches,
bullets are buttons, and the frame itself always wears its traditional sampler border.

The voice is a two-face hierarchy: **Alfa Slab One** — heavy slab caps, always uppercase, like
block letters counted out on aida cloth — carries every headline, motto, and stat; **Inter**
carries every body line and label in yarn cream. The signature move is the **embroidered emphasis
word**: marigold thread, a dashed running-stitch outline around it, and a row of cross-stitch X's
sewn underneath.

**Key characteristics at frame scale:**
- **One ground** — `{colors.felt}` everywhere. No second surface, no panels of another color.
- **Thread on felt** — `{colors.marigold}`, `{colors.thread-red}`, `{colors.cream}`, `{colors.teal}` as lines, stitches, and type; body text is always yarn cream.
- **Decoration is LINES** — stitches, hems, outlines. No solid filled shape larger than a button.
- **Flat matte fabric** — zero gradient, zero glow, zero blur, zero shadow, zero photographic texture.
- **Sampler symmetry** — a stitched border frames every scene; content sits centered like a motto.
- **Alfa Slab One uppercase** on every display element; Inter on every body line and label.

### Frame Craft Bar
Three eyeball tests gate every frame before any structural check:
- **Squint** — one element dominates at **3–6× its nearest neighbor**: the `hero-motto` or a `stat-numeral`, never two rival headlines.
- **Silence** — the felt reads **45–60% empty**; felt is the fabric, let it breathe. An underfilled frame gets one more border band or a tassel — never more copy.
- **Restraint** — marigold is the emphasis thread and fires **once per frame**; ≤ 2 tassels; buttons stay button-sized; the border never competes with the motto.
- **Reference** — aim at a **framed Scandinavian cross-stitch sampler / folk mitten chart**; failure looks like a neon-glow dark-mode dashboard or a clip-art quilt.

## The Frame

- **Primary:** 1920×1080 (16:9). Display sizes authored in **`cqw`** (`px ÷ 1920 × 100 = cqw`).
- **Vertical:** 1080×1920 (9:16). **Square:** 1080×1080 (1:1).
- **Safe area:** content lives inside the `sampler-frame` border — `{spacing.pad-x}` from the frame edge; only the border itself may approach the edge.

**The container law (load-bearing).** Every frame ground sets `container-type: size`; ALL
frame-relative units are `cqw`/`cqh` resolved against it — **never `vw`.** Stitch strokes,
dash lengths, and X sizes are `cqw` too, so the thread gauge scales with the fabric.

## Colors

Five tokens, one ground. `{colors.felt}` is the only surface — every frame is night felt edge to
edge. The four threads divide labor: **`{colors.cream}`** is the reading thread (body, most
headlines, neutral stitches); **`{colors.marigold}`** is the emphasis thread (the embroidered
word, key stats, border monogram); **`{colors.thread-red}`** and **`{colors.teal}`** are the
pattern threads (X rows, hems, buttons, secondary accents). Headlines: cream or marigold on felt —
never red or teal for long display lines (pattern threads read as decoration, not voice).
Low-emphasis stitching may drop to `rgba` of cream (≥ 25% alpha). There is no light mode, no
second fabric, and no gradient anywhere.

## Typography

Two ramps. The **reading ramp** (Inter body 1.0cqw, body-strong, uppercase px labels) carries
copy, captions, and eyebrows; the **display ramp** (Alfa Slab One, `patch-title` 1.8cqw →
`hero-motto` 6.0cqw, plus `stat-numeral` 5.4cqw) carries every headline and figure like block
letters counted onto cloth.

- **Legibility floor:** any load-bearing line ≥ **1.4cqw**; px labels are chrome only.
- **Fit-to-measure:** cap the display block at **≤ 74cqw**; ≤3 words → `hero-motto`; 4–6 → `sampler-headline`; 7+ → `motto`.
- **Every Alfa Slab One element is UPPERCASE**, tracking 0–2px (slabs are wide already — never negative). **Every Inter label is uppercase, 2–4px tracked.** No italic ever; "underline" means a running-stitch beneath, never `text-decoration`.
- **The embroidered emphasis** (one word per frame): `{colors.marigold}` fill, a 0.18cqw **dashed outline** boxed around it, and a `cross-stitch-row` sewn underneath. Never applied to more than one word, never in red or teal.

## Depth & Surface

Flat matte felt. The only depth cue is **thread over fabric** — a stitch always renders above the
ground, and a patch's dashed seam says "sewn on top". Signals:
- **Stroke, not fill** — decoration is dashed/zigzag/crossed LINES in thread colors.
- **The patch seam** — 0.2cqw dashed border is a patch's entire chrome.
- **Density, not opacity** — de-emphasize by spacing stitches out, or rgba-cream ≥ 25%.

**Ceiling:** no box-shadow, no glow, no blur, no gradient, no photographic texture, no solid
filled region larger than a button (~2cqw circle). A big filled shape reads as printed, not sewn —
it breaks the system.

## Shapes

- **Patches:** near-rectangles, 0.6cqw radius max (fabric corner), dashed seam.
- **Buttons:** true circles with 4 holes and a thread cross.
- **Everything else is a line:** running stitches, zigzags, X's, tassel strands. Stroke gauge
  0.18–0.3cqw, round caps and joins — thread is round, never square-cut.

## Components

- **sampler-frame** — the load-bearing signature; every scene is bordered like a framed sampler.
- **running-stitch** — divider, underline, connector; its dashes crawl whenever it is on screen.
- **cross-stitch-row** — border bands, the emphasis underscore, corner clusters.
- **zigzag-hem** — rick-rack top/bottom hems and patch trims.
- **patch** — the only card; stats, captions, and list items are patches with dashed seams.
- **button** — bullet, timeline node, ornament; the largest permitted filled shape.
- **tassel** — border/patch ornament, gently swaying; max two per frame.

## Frame Treatments

> Recipe per plate: ground · composes · focal · chrome · accent · silence · density.
> Every plate wears the sampler-frame; content centered like a motto unless noted.

### 1 · Sampler Cover  (identity · move: the border sews itself · centered)
**Ground** `{colors.felt}`. **Composes** sampler-frame, hero-motto, stitch-label, cross-stitch-row,
tassel. **Focal** a 1–2 line `hero-motto` in cream with the marigold **embroidered emphasis** word.
**Chrome** a `stitch-label` eyebrow above; `border-monogram` initials in a border corner.
**Accent** marigold emphasis + red/marigold X row. **Silence** ~55%. **Density** sparse.

### 2 · Motto Stat  (anchor · move: scale · centered)
**Ground** felt. **Composes** stat-numeral, stitch-label, running-stitch, cross-stitch-row.
**Focal** one `stat-numeral` in marigold, an X row sewn beneath, a cream `motto` support line.
**Chrome** teal eyebrow; running-stitch rules left and right of the numeral. **Silence** ~60%.
**Density** sparse.

### 3 · Patch Catalog  (catalog · move: density — the dense frame · centered head)
**Ground** felt. **Composes** motto, 3× patch, button. **Focal** a centered `motto` over three
patches (button bullet, `patch-title`, Inter body, one thread-color stat each — red / marigold /
teal in rotation). **Silence** tight — the density exception. **Density** dense-exception.

### 4 · Thread Timeline  (process · move: horizontal running-stitch rail · left)
**Ground** felt. **Composes** sampler-headline, running-stitch, 4–5× button, patch-caption.
**Focal** a long crawling running-stitch with button nodes and uppercase Inter labels; the current
step's button is marigold, the rest cream. **Density** standard.

### 5 · Sampler Quote  (quote · move: patch as frame · centered)
**Ground** felt. **Composes** patch (oversized, zigzag-hem trim), body-strong, cross-stitch-row,
tassel. **Focal** a 2–3 line quote in cream Inter 600 inside one large patch; X row above the
attribution; a tassel from the patch's bottom edge. **Density** sparse.

### 6 · Closing Motto  (closer · move: symmetry · centered)
**Ground** felt. **Composes** sampler-frame (doubled band), sampler-headline, running-stitch,
button. **Focal** a centered sign-off `sampler-headline`, running-stitch rule beneath, two buttons
flanking. The border gains its second band here — the sampler is finished. **Density** sparse.

## Composition Rules

### Do
- Sew the **sampler-frame around every scene** — a frame without its border is unfinished cloth.
- Center content like a **sampler motto**; keep left/right ornament mirror-symmetric.
- Set every display element **Alfa Slab One UPPERCASE**; body and labels in Inter, yarn cream.
- Render every decoration as **thread** — dashed, zigzag, or crossed strokes with round caps.
- Emphasize exactly **one word** per frame: marigold + dashed outline + X-row underneath.
- Rotate red / marigold / teal across pattern elements; keep cream for reading.
- Keep dashes crawling and tassels swaying — the fabric is alive even when the copy holds still.

### Don't
- Don't introduce a second surface, panel, or light background — felt is the only ground.
- Don't fill: no solid shape larger than a button, no filled ribbons, no color-block regions.
- Don't add gradients, glows, shadows, blurs, or photographic/paper texture — matte felt only.
- Don't set display type in red or teal, lowercase, italic, or with CSS `text-decoration`.
- Don't square-cut the thread — no butt caps, no miter joins, no hairlines under 0.18cqw.
- Don't emphasize twice — one embroidered word; a second marigold outline demotes both.

## Motion

Motion **is** the sewing. Every entrance is a needle event, every exit a pass of the loom, and the
fabric never fully rests. All timing below is authored against a 30fps read; eases are punchy-in,
soft-settle (`power4.in` to land, `back.out` ≤ 1.8 to settle) — a needle strikes hard and the
thread relaxes.

- **Needle-punch type (the headline entrance).** Display lines enter **character by character**:
  each letter starts flat against the fabric (`rotationX: -90`, transform-origin bottom, opacity 0)
  and **flips up like a needle punching through**, overshooting ~4° before settling
  (`back.out(1.6)`, ~0.34s per char). The stagger is a **sewing-machine cadence** — a steady
  ~0.07s tick, with a slightly longer breath (~0.2s) between words, like the cloth being fed
  through. Body text never punches; it fades up whole (0.4s) after its headline is sewn.
- **The weave (scene transition).** Scenes never cut or crossfade. A **band of bold thread
  stripes** — 4–6 full-height stripes in marigold / red / cream / teal — **shuttles across the
  frame like a loom pass** (~0.9s, `power3.inOut`), wiping the old scene out as it enters and
  revealing the new scene behind it as it exits. The stripes are the only moment solid fills are
  permitted, because they are the shuttle, not the cloth.
- **Live stitching (ambient).** The background is always being sewn: running-stitch lines
  **crawl** (stroke-dashoffset advancing ~1 dash/s, linear, looping) as thread pulled through
  felt; border **cross-stitch X's pop in one by one** on scene entry and then hold; the
  sampler-frame **draws itself** on the cover (masked stroke draw, ~1.2s) ; an occasional
  **button spins in** (rotation −120°→0, `back.out`) and a **tassel sways** ±6° on a slow sine.
  Ambient motion stays under ~30% cream alpha so it never fights the motto.
- **The embroidered emphasis (the money shot).** The emphasis word punches in with its line, then
  ~0.3s later its **dashed outline sews around it** (stroke draw, one lap, 0.5s) and the
  **X row stitches in underneath** left-to-right (0.06s per X, small overshoot). Reserve it for
  the frame's one marigold word.
- **Exits** are humble: content lifts ~2cqw and fades (0.35s) just before the weave lands — the
  shuttle does the real work.

## Aspect-Ratio Behavior

| Treatment | 16:9 | 9:16 | 1:1 |
|---|---|---|---|
| Sampler Cover | motto centered, wide border | taller border band, motto stacked 2–3 lines | compact border, 2-line motto |
| Motto Stat | numeral + side rules | numeral over support, rules above/below | centered numeral |
| Patch Catalog | head over 3-up | head top, 3 stacked patches | head top, 2+1 |
| Thread Timeline | horizontal rail | vertical rail, buttons left | compact horizontal |
| Sampler Quote | one wide patch | narrower, taller patch | near-square patch |
| Closing Motto | centered, flanking buttons | stacked, buttons above/below | centered |

The sampler-frame inset holds `{spacing.border-inset}` on the short edge; re-step display per
ratio so no load-bearing line drops below the 1.4cqw floor. The weave shuttles **horizontally in
16:9/1:1 and vertically in 9:16** (the loom turns with the cloth).

## Approved Entities

No real customers, logos, or vendors are defined in the source — render any such mark as a
placeholder patch. The system supplies fabric and thread, not brands.

## Numerals & Claims (hard rule)

Never invent figures, stats, dates, or counts at frame scale. Render slots as `— figure —`,
`{metric}`, `N×`. Real numerals appear only when the script supplies them — the motto stat and
patch catalog especially carry placeholders, not fabricated values. Border monograms and ordinal
corner marks (01, 02…) are decorative and may be ordinal.

## Pre-Render Self-Audit

- **Squint** — one focal element dominates at 3–6×; the border never outweighs the motto.
- **Silence** — 45–60% bare felt; only the catalog runs dense.
- **Thread** — every decoration is a stroke (dashed/zigzag/X, round caps); no fill beyond button size; no gradient/glow/shadow/blur.
- **Type** — Alfa Slab One uppercase, cream or marigold only; Inter labels tracked uppercase; ≥ 1.4cqw floor; exactly one embroidered emphasis.
- **Border** — the sampler-frame is present, symmetric, and inset `{spacing.border-inset}`.
- **Motion** — entrances punch, transitions weave, stitches crawl; no crossfade-only scene change.
- **Fabrication** — every numeral traces to the script, else placeholder.

## Known Gaps

- **Alfa Slab One + Inter via Google Fonts.** Alfa Slab One ships a single 400 weight and no CJK —
  CJK scripts need a substitute slab (e.g. ZCOOL KuaiLe) and re-measured line breaks.
- **Stitch geometry is CSS/SVG-only** — dashes, polylines, and stroke masks; no image assets, no
  fabric photo texture. The felt is a flat hex on purpose.
- **9:16 / 1:1 are guidance**, not pixel-locked; verify the legibility floor and vertical weave
  per ratio.
- The sewing-machine cadence is authored prose — renderers should treat the 0.07s tick as a
  target, not a hard sync to any audio.
