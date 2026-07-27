---
name: ai-laboratory
renderer: ai-laboratory
vibe: "A dark neural-research-lab film — a living network of glowing nodes and connections that pulse and fire behind every scene, a slow HUD scanline, corner brackets and a vignette. A model boots, a prompt tokenizes, a neural net fires, frames synthesize, a HUD reads out, screenshots appear as holographic panels, and nodes converge into a logo CTA. Brand color repaints the whole lab. Portrait-native 9:16 for Reels, Shorts & TikTok."
fontFamily: "Space Grotesk"
colors:
  ground: "#05060D"
  panel: "#0B0E1A"
  text: "#EAF1FF"
  muted: "#8A93AD"
  accent: "#00E5C0"
---

# AI Laboratory

A **dark neural-research-lab film**. A persistent, continuously-flowing backdrop — a
**living lattice** of glowing nodes and connecting edges that pulse and fire signal dots,
a slow **HUD scanline**, four **corner brackets** and a **vignette** — runs behind every
scene and **matches across every cut**, so the film reads as one continuous lab session
rather than a slideshow. Portrait-native **9:16** for Reels, Shorts and TikTok (it also
holds up in 1:1 and 16:9 — all geometry is relative to the frame).

## The lab (persistent, theme-colored)
- **Ground** a deep near-black `#05060D` with a soft accent wash near the top; the whole
  backdrop is painted on one canvas as a pure function of time (deterministic, seek-exact),
  so nothing is a flat fill.
- **Lattice** — a seeded field of glowing accent nodes, distance-linked by faint edges,
  each node pulsing on its own phase.
- **Firing signals** — accent dots travel along a subset of the edges, so the network
  reads as *alive*.
- **Scanline** — a thin accent HUD line sweeps slowly down the frame.
- **Corner brackets** — L-shaped HUD brackets frame the composition.
- **Vignette** — darkens the edges back into the ground so the content always owns center.

## Palette — everything is theme-driven
Default signal color: **accent** `#00E5C0`. The single accent derives the lattice glow, the
edges, the node fill, the panel surface and border, the gradient **headline word**, the
button and the CTA. Because the whole system is derived from one accent, a brand color
repaints the ENTIRE lab — the lattice, the nodes, the panels, the synthesis burst and the
CTA — not just the text. Text is `#EAF1FF` with 58%/30% dim/faint tints; panels sit on
`#0B0E1A`.

## Type
- **Display** Space Grotesk (bold, tight) for titles, captions and the wordmark. (Nearest
  bundled face to the template's Sora.)
- **Mono** JetBrains Mono for kickers, HUD labels, the prompt bar, readouts and the URL.
- **Body** Inter (falls to system-ui in the CDN-free render) for subtext and captions.

## Screenshots, uploads & logos (intentional placement)
Real screenshots, product images and user uploads are shown as **holographic lab panels** —
a scanline sheen, an accent glow, a soft **reflection** and a subtle 3D tilt — never a bare
box. The frame aspect adapts to the shot: a **portrait** capture (ratio < 0.9) gets a tall
panel, a **wide** desktop/dashboard capture a shorter one. An **empty** slot renders an
intentional branded placeholder (accent gradient wash + holographic grid + a glowing node),
so a scene without an asset still reads as designed. The user's **logo** (when uploaded) is
reserved for the CTA lockup; otherwise a built hex-ring + play-glyph mark stands in.

## Scene vocabulary (chosen per storyboard scene)
- **boot** — a central model core ignites; a display title rises (last word in accent) and a
  mono status line settles. The opener.
- **input** — a mono input bar types the line behind a `>` prompt with a blinking caret;
  token chips stream down into a latent-space node. For prompts / quotes / manifestos.
- **network** — a fig-labelled headline over a layered neural net whose edges draw in, whose
  nodes light up and along which signal dots fire. The signature "the model" moment.
- **synthesis** — radiating rays and a burst behind a holographic panel that **renders in**
  as a scanline mask retracts; a big gradient tagline lands with a flash. The generation peak;
  holds one screenshot.
- **readout** — a scientific HUD dashboard: a fig-labelled headline, a hero stat number and a
  metric grid drawn from the scene's bullets. The telemetry moment.
- **showcase** — holographic screenshot panels floating in the network under a headline, with
  optional feature labels. Up to three shots.
- **cta** — incoming nodes converge into the mark, the wordmark types in char-by-char, a
  button pulses and a URL settles.

Screenshots are distributed across the display-capable scenes (showcase / synthesis /
network): a scene with 3+ shots becomes a panel row, 1–2 a focused panel, so every usable
screenshot appears and none is stranded on a text-only scene.

## Motion grammar
Everything **ignites and fires** — the core pulses, edges draw, nodes light up, signals
travel, frames render from scanlines, nodes converge. Entrances use `power3.out` /
`back.out`; panels and chips **float** on a gentle finite sine yoyo; the synthesis moment
**bursts** then settles. Deterministic: one paused GSAP timeline, the lab canvas driven
purely by the render's seek time, finite repeats only, hidden = `opacity:0`. Best for AI/ML
products, research launches, developer tools and data platforms.
