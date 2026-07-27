---
name: motion-canvas
renderer: motion-canvas
vibe: "An abstract motion-graphics reel on a cream canvas — bold geometric shapes drift on a dot grid while kinetic type snaps, screenshots mask into bold shape frames, stat bars grow and chips rise. Brand color repaints every shape. Portrait-native 9:16 for Reels, Shorts & TikTok."
fontFamily: "Archivo Black"
colors:
  ground: "#F2EDE3"
  ink: "#17130F"
  paper: "#FFFFFF"
  muted: "#7A736A"
  vermilion: "#FF5A3C"
  cobalt: "#2C6BED"
---

# Motion Canvas

An **abstract motion-graphics reel** on a warm **cream canvas**. A persistent,
continuously-flowing backdrop — a drifting dot grid and big bold geometric shapes (a
ringed circle, a spun square, a triangle and a tilted block) — runs behind every scene
and **matches across every cut**, so the film reads as one confident designer reel
rather than a slideshow. Portrait-native **9:16** for Reels, Shorts and TikTok (it also
holds up in 1:1 and 16:9 — all geometry is relative to the stage).

## The shape field (persistent, theme-colored)
- **Ground** warm cream `#F2EDE3`. Nothing is a flat fill: the whole backdrop is painted
  on one canvas as a pure function of time (deterministic, seek-exact).
- **Dot grid** — a soft ink dot grid drifts slowly.
- **Big shapes** — a ringed circle, a spun square, a triangle and a tilted block drift,
  breathe and rotate in the two accent hues at the frame edges.

## Palette — everything is theme-driven
Default accents: **vermilion** `#FF5A3C` (Shape A) → **cobalt** `#2C6BED` (Shape B).
The two accents color every shape, stroke and fill, the **frame shadows** (a hard offset
color drop), the **stat bars**, the **chip dots**, the accent **type** and the **CTA
button** — so a brand color repaints the ENTIRE reel, not just the text. The cream
canvas and dark ink are the template's identity **luminance** (not the brand's to touch
— the brand steers hue, the ground steers luminance). Text is ink `#17130F` with a
60%/38% dim scale for supporting copy.

## Type
- **Display** Archivo Black — punchy poster grotesque for the kinetic headlines and the
  wordmark; the last word of a kinetic sweep carries the accent.
- **Chrome / labels** JetBrains Mono (kickers, the studio label, the CTA URL).
- **Body** Inter, dimmed.

## Motion grammar (three curves)
- **Snap** back-out — shapes and words snap in with overshoot.
- **Sweep** power-in-out — an accent bar wipes off the title; kinetic words sweep up.
- **Drift** sine — ambient float on shapes, screens and chips.
Every scene fades from and back to the pure shape field at its edges (opacity 0 at the
boundary), so cuts frame-match. Signature beats: shapes **assemble** around the title
while a mono label **types** in and an accent bar **wipes** it clear; an accent ring
**expands** behind a big **type sweep**; stat **bars grow** left-to-right; the logo
**assembles** and the wordmark **types** in on the CTA.

## Screenshots & images (intentional slots)
Real screenshots are **masked into bold shape frames** (`.mc-screen`): a white paper
card with a thick ink border and a hard offset accent drop-shadow, varied per panel
(circle / blob / rounded).
- **Showcase** — a hero screen (or a 2–3 panel row of shape masks) with the headline and
  feature chips. Portrait screenshots (ratio < 0.9) get a tall frame; wider shots get a
  landscape card.
- With **no** screenshot, a frame shows an intentional branded placeholder (accent wash +
  a ringed shape), never a blank box.
- An uploaded **logo** is reserved for the CTA mark (never a shape panel).

## Scene types (chosen per storyboard scene)
`open` (shapes assemble around the title + typed label + wipe), `showcase` (screenshots
masked into bold shape frames + chips), `kinetic` (an expanding ring behind a big type
sweep, for hooks/quotes/statements), `stats` (animated bars growing in alternating
accents, for numbers/proof), `bullets` (a headline over rising feature chips), `cta`
(logo reveal + typed wordmark + accent button). Any scene count and duration works; the
shape field is constant.

## Do
- Let the field flow — keep scene content centered inside the safe area (Reels chrome).
- Use the accent for the last word of a sweep, the bars, the chip dots and the CTA.
- Give real screenshots the bold shape frame; keep the logo for the CTA mark.

## Don't
- Don't add a second full-frame background — the one canvas shape field is the world.
- Don't hard-code a hex; take every color from the derived theme so brand color carries.
- Don't overfill a portrait frame — a few words per headline, ≤5 chips, ≤3 shape frames.
