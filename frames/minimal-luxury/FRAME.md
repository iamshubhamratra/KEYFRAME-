---
name: minimal-luxury
renderer: minimal-luxury
vibe: "A minimalist-luxury keynote film — vast negative space, one elegant serif headline with fine letter-spacing, thin hairline rules, wide-tracked small-cap labels and one restrained gold accent, over a warm ivory ground with a single slowly drifting glow. Understated, premium, fashion/watch-brand feel. Brand color recolors the hairlines, highlight word, CTA and glow. Portrait-native 9:16 for Reels, Shorts & TikTok."
fontFamily: "Fraunces"
colors:
  ground: "#F4F1EA"
  ink: "#1A1712"
  muted: "#7A756B"
  gold: "#9A7B3D"
  frame: "#FFFFFF"
---

# Minimal Luxury

A **minimalist-luxury keynote** film built on **vast negative space** and **quiet,
tasteful motion**. A persistent, continuously-flowing ambient backdrop — a warm ivory
ground, ONE slowly drifting soft accent glow, a slow soft light sweep, a whisper of fine
grain and a barely-there vignette — runs behind every scene and **matches across every
cut**, so the film reads as one calm, unbroken breath rather than a slideshow. Restraint
is the point: the backdrop breathes, it never performs. Portrait-native **9:16** for
Reels, Shorts and TikTok (it also holds up in 1:1 and 16:9 — all geometry is relative to
the stage).

## The ambient (persistent, theme-colored)
- **Ground** warm ivory `#F4F1EA`. Painted on one canvas as a pure function of time
  (deterministic, seek-exact) — nothing is a flat fill.
- **One accent glow** — a single large, soft radial glow in the accent hue drifts slowly
  across the field. Just one. Never a crowd.
- **Light sweep** — a warm-white highlight drifts gently across the top, like a studio
  light passing.
- **Fine grain** — a whisper of seeded motes drifts up, plus a top-layer film grain, both
  barely there.
- **Vignette** — the edges settle softly back into a deeper ivory so content always owns
  the center.

## Type & rules — quiet, elegant, expensive
- **Display**: an elegant **serif** (Fraunces, with Instrument Serif as its bundled
  fallback) at light weights with fine negative letter-spacing. Headlines reveal
  word-by-word; the **last word carries the accent**.
- **Labels**: a **wide-tracked, small-cap** mono label (IBM Plex Mono) — `0.42em`
  tracking, uppercase — sets each scene without shouting.
- **Hairlines**: thin `1px`/`0.16cqw` rules separate list items and underline titles; the
  accent hairline is the brand's to recolor.
- **Body**: Inter (system-ui fallback), used sparingly for taglines and captions.

## Palette — everything is theme-driven
Default accent: a **refined gold** `#9A7B3D` on ivory. The accent recolors the **accent
hairlines**, the **highlight word**, the **CTA outline**, the **frame border tint** and
the **ambient glow** — so a brand color repaints the WHOLE film, not just the text. Ink
is `#1A1712` with 56% / 30% dim/faint steps. Because the accent is fit to the ivory ground
by the shared brand-kit (`isDark:false`), a brand color that is too light to read is
darkened to hold contrast and the correction is disclosed; a null brand renders the exact
default gold byte-for-byte.

## Scenes (archetypes, chosen from the storyboard)
- **open** — a centered serif title over whitespace, an accent hairline drawing beneath
  it, a wide-tracked small-cap label settling.
- **statement** — a single elegant serif line (quotes, manifestos, stats) that fades in
  with a slow ken-burns breathe; the last word in accent.
- **hero** — a single thin-framed screenshot rising and floating with generous margin, a
  serif caption beneath.
- **detail** — a thin-framed screenshot with a slow push-in, over a hairline-separated
  feature list that arrives line by line behind accent dots.
- **index** — a headline over a spaced, hairline-separated list of essentials — no frame,
  all negative space and wide tracking.
- **gallery** — a headline over a row of thin-framed pieces, each under a wide-tracked
  small-cap label.
- **cta** — the logo (or a built serif monogram), a wordmark that types in, a **minimal
  outline button** that pulses softly, and a url.

## Assets
Real screenshots are distributed across the display-capable scenes (**hero**, **index →
detail**, **gallery**); the Creative Director's per-asset `sceneId` is honored when the
scene can show an image, else the shot is redistributed to the least-loaded display scene,
so every usable screenshot appears in a thin-bordered white frame with a soft shadow and
generous margin (or an intentional branded placeholder when a slot has none). The **logo
is reserved for the CTA** monogram — never a display plate.

## Engineering
Native **GSAP + canvas** composition (no framework runtime, GSAP the only CDN dependency):
one paused timeline on `window.__timelines["vid"]`; direct-child `.clip` scenes on unique
tracks; a boundary `opacity:0` hard-kill per scene (the ambient persists behind them); ONE
seek-safe caption node (`#cap-text`) driven by a single `onUpdate` proxy; the ambient
canvas is repainted purely from the renderer's `hf-seek` time (`window.KF_LUX`); `cqw`
units + `container-type:size`. Deterministic and capture-safe.
