---
name: paper-craft
renderer: paper-craft
vibe: "A warm handcrafted cut-paper film — construction-paper shapes drift with soft drop-shadows on a cream ground while paper sheets pop up and fold in, screenshots are pasted onto taped photo-cards, stats pop on paper discs, features are paper chips and a paper-button CTA closes. Brand color repaints the whole collage. Portrait-native 9:16 for Reels, Shorts & TikTok."
fontFamily: "Bricolage Grotesque"
colors:
  cream: "#f1e7d3"
  paper: "#f0e4cd"
  photo: "#fbf6ec"
  text: "#40352a"
  muted: "#8a7a63"
  accent: "#E07A3F"
---

# Paper Craft

A **warm, handcrafted cut-paper / papercraft film**. A persistent, continuously-flowing
backdrop — a **cream paper ground** carrying a few **soft drifting construction-paper
shapes** with soft drop-shadows, a fine **paper grain** and a **soft top light** — runs
behind every scene and **matches across every cut**, so the film reads as one continuous
piece of paper rather than a slideshow. Portrait-native **9:16** for Reels, Shorts and
TikTok (it also holds up in 1:1 and 16:9 — all geometry is relative to the page).

## The paper (persistent, theme-colored)
- **Ground** a warm cream `#f1e7d3`; the whole backdrop is painted on one canvas as a pure
  function of time (deterministic, seek-exact), so nothing is a flat fill.
- **Cut-paper shapes** — soft-edged organic paper blobs in the accent-tinted paper hues
  drift and rotate gently, each with a soft drop-shadow, like loose collage pieces.
- **Paper grain** — a sparse speckle plus a top-layer multiply grain gives the page tooth.
- **Soft top light** — a warm highlight falls from above so the paper always feels lit.
- **Vignette** — a very subtle warm darkening at the edges (a LIGHT ground, so it's gentle).

## Palette — everything is theme-driven
Default paper accent: **`#E07A3F`** (warm terracotta). The single accent derives the three
**paper tints** (`paper1/paper2/paperDeep`), the **accent ink** (emphasis words, kickers,
labels), the **highlight** sheet, the pasted-photo **wash**, the accent **word chips**, the
**stat disc**, the chip **dots** and the CTA **button**. Because the whole system is derived
from one accent, a brand color repaints the ENTIRE collage — every paper layer, the ink, the
photo wash and the button — not just the text. Ink is a warm `#40352a` with 60%/34% soft/faint
tints; photo-cards sit on `#fbf6ec`. The paper is a warm **LIGHT** ground, so the brand accent
is nudged for contrast on cream (never onto a dark stage).

## Type
- **Display** Bricolage Grotesque (friendly, rounded, bold) for titles, pop words and the wordmark.
- **Serif** Fraunces (italic) as the "handwritten" accent — kickers, photo captions, taglines.
- **Mono** IBM Plex Mono for the URL.
- **Body** Inter (falls to system-ui in the CDN-free render) for captions.

## Screenshots, uploads & logos (intentional placement)
Real screenshots, product images and user uploads are **pasted onto warm paper photo-cards**
with a soft **shadow**, a strip of **tape** and a slight **rotation** — never a bare box. The
card aspect adapts to the shot: a **portrait** capture (ratio < 0.9) gets a taller card, a
**wide** desktop/dashboard capture a shorter one. One shot becomes a big taped card; 2–3
become a **scrapbook row** with numbered handwritten labels. An **empty** slot renders an
intentional branded placeholder (accent paper wash + a glowing node), so a scene without an
asset still reads as designed. The user's **logo** (when uploaded) is reserved for the CTA
lockup; otherwise a built paper play-glyph stands in.

## Scene vocabulary (chosen per storyboard scene)
- **open** — a big paper title card folds up under the light; a serif kicker rises and a
  handwritten subtitle settles. The last word of the title carries the accent ink.
- **popup** — a stat POPS off the page: a big numeral on a paper disc (when the scene carries
  a number), else the headline words each fold up on their own paper chips (last on the accent).
- **showcase** — screenshots pasted onto paper photo-cards (a taped card or a scrapbook row)
  under a headline. The product moment; holds up to three shots.
- **bullets** — a headline over a rising stack of paper chips (paper tags with an accent dot).
- **statement** — a single centered statement on an accent paper banner that breathes. For quotes.
- **cta** — a paper wordmark/logo card folds in, a handwritten tagline settles, an accent paper
  button wobbles and a URL lands.

Screenshots are distributed across the display-capable scenes (showcase / popup): a scene with
several shots becomes a scrapbook row, so every usable screenshot appears and none is stranded
on a text-only scene.

## Motion grammar
Everything **pops and folds** — sheets unfold on a `rotateX` hinge, chips and photo-cards fold
up on a tactile `back.out` bounce, the stat disc pops off the page, the CTA button wobbles.
Elements then **float** on a gentle finite sine yoyo. Deterministic: one paused GSAP timeline,
the paper canvas driven purely by the render's seek time, finite repeats only, hidden =
`opacity:0`, GSAP animates the outer wrapper while the static paper rotation lives on an inner
wrapper it never touches. Best for warm, playful, premium-craft brands and storybook product tours.
