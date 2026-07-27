---
name: editorial-motion
renderer: editorial-motion
vibe: "A luxury print-magazine kinetic-typography film on living paper — oversized serif headlines that reveal word-by-word, hairline rules that draw, mono issue labels, editorial pull-quotes and ruled figure plates for screenshots, with a persistent running-head + folio chrome. Brand color repaints the rules, kickers, highlights & CTA. Portrait-native 9:16 for Reels, Shorts & TikTok."
fontFamily: "Fraunces"
colors:
  paper: "#faf9f6"
  ink: "#17150f"
  muted: "#7a756a"
  accent: "#B4302A"
  plate: "#efece4"
---

# Editorial Motion

A **luxury print-magazine kinetic-typography** film set on **living paper**. A persistent,
continuously-flowing backdrop — a warm cream ground with a faint drifting column grid,
floating paper grain and a soft warm edge-vignette — runs behind every scene and **matches
across every cut**, so the film reads as one magazine leafing forward rather than a
slideshow. A persistent **running-head + folio chrome** (KeyFrame · the issue label at the
top, Vol. 01 · keyframe.ai at the bottom, on hairline rules) is the through-line on every
page. Portrait-native **9:16** for Reels, Shorts and TikTok (it also holds up in 1:1 and
16:9 — all geometry is relative to the page).

## The paper (persistent, theme-tinted)
- **Ground** warm cream `#faf9f6`. Nothing is a flat fill: the whole backdrop is painted
  on one canvas as a pure function of time (deterministic, seek-exact).
- **Column grid** — a faint editorial six-column guide drifts slowly; the center guide is
  tinted the accent.
- **Baseline sweep** — a single accent hairline drifts up and down the page.
- **Paper grain** — floating ink specks rise slowly for a printed-stock texture.
- **Edge-vignette** — darkens the paper margins back down so content owns the column.
- **Chrome** — running head + folio with hairline rules that take the accent.

## Palette — everything is theme-driven
Default spot accent: **vermilion** `#B4302A` on cream paper. The accent derives the
**accent-text** (kickers, highlighted italic words, folio mixed toward ink so a pale brand
still reads on cream), the **drawn rules** (masthead, feature, colophon and the persistent
chrome hairlines), the **pull-quote mark**, the **statement/CTA arrow** and the **caption
underline**. Because the whole accent family is derived from one color, a brand color
repaints the ENTIRE issue — rules, kickers, highlight italics, quote mark, chrome and CTA —
not just the text. The **paper**, **ink** (`#17150f`) and hairline structure are the pack's
identity and stay put. Body copy uses a 62%/34% ink dim scale.

## Type
- **Display / headlines / pull-quotes** Fraunces 900 (a high-contrast serif), tight
  (`-0.02em`); the last word of a headline is set in **accent italic** (the editorial
  highlight); pull-quotes are fully italic behind a giant accent quotation mark.
- **Section / issue labels & running head** Space Grotesk (a grotesque), wide-tracked
  uppercase, in accent-text.
- **Folio / captions / numerals / url** JetBrains Mono, wide-tracked uppercase.
- **Body / decks** Inter, dimmed.

## Motion grammar
- **Reveal** ease-out — serif headline words rise into place one after another (line-by-line
  feel); pull-quote words fade from faint to full.
- **Draw** ease-in-out — hairline rules scale in from the left margin.
- **Paper-wipe** ease-in-out — a paper cover retracts to the right to uncover a figure plate.
- **Drift** sine — a quiet float on plates and the CTA button.
Every scene fades from and back to pure paper at its edges (opacity 0 at the boundary), so
cuts frame-match on the same living page behind the persistent chrome.

## Screenshots & images (intentional slots)
Real screenshots ride in ruled editorial **figure plates**: an ink-bordered box uncovered
by a paper-wipe, with a thin rule and a **mono caption**.
- **Figure** — a single large plate under a section label, with a serif headline below.
- **Gallery** — an asymmetric grid of 2–4 plates, each with its own caption, that reveal in
  sequence.
- With **no** screenshot, a plate shows an intentional branded placeholder (paper wash +
  faint accent tint + a ruled crop-mark), never a blank box.
- An uploaded **logo** is reserved for the colophon mark (never a figure plate).

## Scene types (chosen per storyboard scene)
`masthead` (opener: issue kicker + drawn rule + oversized serif title), `headline` (big
serif reveal + rule + deck), `pullquote` (giant quote mark + italic statement, for
quotes/manifestos), `figure` (a single screenshot plate + caption + headline), `gallery`
(asymmetric plate grid), `index` (a serif headline + numbered feature rows on hairline
rules, the bullet/contents default), `colophon` (logo mark + serif call + solid ink CTA
button + mono url). Any scene count and duration works; the paper and chrome are constant.

## Do
- Let the page breathe — keep content left-aligned inside the column, clear of the chrome.
- Use the accent for the highlighted last word, the rules, the quote mark and the CTA arrow;
  keep body copy in the ink dim scale.
- Give real screenshots the ruled figure plate; keep the logo for the colophon mark.

## Don't
- Don't add a second full-frame background — the one canvas paper is the world.
- Don't hard-code a hex; take every accent from the derived theme so brand color carries.
- Don't overfill a portrait column — a few words per serif headline, ≤4 index rows, ≤4
  gallery plates.
