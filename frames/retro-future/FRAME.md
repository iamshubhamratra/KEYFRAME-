---
name: retro-future
renderer: retro-future
vibe: "An 80s synthwave / outrun film — a gradient sunset sky, a banded neon sun on the horizon, an infinite neon perspective grid rushing to the vanishing point, a starfield and CRT scanlines run behind chrome/neon italic headlines, screenshots inside neon CRT cabinets, a light-burst climax and a blinking 'Press Start' CTA. Brand color repaints the whole neon world. Portrait-native 9:16 for Reels, Shorts & TikTok."
fontFamily: "Anton"
colors:
  sky: "#0A0420"
  ground: "#080316"
  text: "#FDF4FF"
  muted: "#8E82A6"
  accent: "#FF2E97"
  accent-2: "#22D3EE"
---

# Retro Future

An **80s synthwave / outrun** film. A persistent, continuously-scrolling neon world runs
behind every scene and **matches across every cut**, so the film reads as one continuous
ride down the grid rather than a slideshow. Portrait-native **9:16** for Reels, Shorts and
TikTok (it also holds up in 1:1 and 16:9 — all geometry is relative to the frame).

## The world (persistent, theme-colored)
- **Outrun sky** a deep-purple zenith tinting down through a **secondary**-washed mid to a
  **primary**-washed horizon; painted on one canvas as a pure function of time (deterministic,
  seek-exact), so nothing is a flat fill.
- **Starfield** — soft white stars twinkle in the upper sky.
- **Banded neon sun** — a `secondary → primary` gradient disc sits on the horizon, carved by
  horizontal bands (thicker gaps lower) for the signature retro sun.
- **Neon perspective grid** — an infinite floor of glowing grid lines rushing toward the
  vanishing point, scrolling continuously.
- **Horizon glow line** — a bright secondary line with a primary glow where sky meets grid.
- **CRT scanlines** — subtle horizontal scanlines over everything.
- **Vignette** — darkens the edges back into the ground so the type always owns the center.

## Palette — everything is theme-driven
Default neons: **primary** `#FF2E97` (magenta) and **secondary** `#22D3EE` (cyan). The two
neons derive the sky tint, the grid, the sun, the horizon glow, the CRT borders/glow, the
**chrome** headline gradient (white → icy → secondary → primary), the neon words, the chips
and the CTA button. Because the whole system is derived from the two accents, a brand color
repaints the ENTIRE world — the sky, grid, sun, cabinets and CTA — not just the text. Text is
`#FDF4FF` with 62%/34% dim/faint tints; screens sit on `#0C0620`.

## Type
- **Display** Anton (heavy, condensed, italic) for chrome headlines, the wordmark and neon
  labels — the reflective outrun headline face.
- **Mono** JetBrains Mono for chip labels, cabinet labels and the URL.
- **Body** Inter (falls to system-ui in the CDN-free render) for subtext and captions.

## Screenshots, uploads & logos (intentional placement)
Real screenshots, product images and user uploads ride inside **neon-bordered CRT / arcade
cabinets** with **scanlines**, a neon **glow** and a slight perspective tilt — never a bare
box. The frame aspect adapts to the shot: a **portrait** capture (ratio < 0.9) gets a tall
cabinet, a **wide** desktop/dashboard capture a shorter one. An **empty** slot renders an
intentional branded placeholder (neon wash + a faint scan grid + a glowing node), so a scene
without an asset still reads as designed. The user's **logo** (when uploaded) is reserved for
the CTA lockup; otherwise a built play-glyph mark stands in.

## Scene vocabulary (chosen per storyboard scene)
- **open** — a chrome headline blooms over the world with a neon subtitle under it. Opener energy.
- **reveal** — a neon headline lands word-by-word behind a radiating light-burst and a white
  flash (the dramatic peak / statement / climax); can hold one screenshot behind it.
- **showcase** — 1–3 neon CRT cabinets (real screenshots) rise on a perspective wall under a
  neon "select mode" headline. The product moment.
- **stats** — a giant chrome/neon number ignites over the grid with a label under it. For proof.
- **bullets** — a neon headline plus a rising stack of arcade feature chips. "Direct every detail."
- **cta** — the logo mark assembles, a chrome wordmark types in char-by-char, a blinking neon
  "Press Start" button pulses and a mono URL settles.

Screenshots are distributed across the display-capable scenes (showcase / reveal / bullets):
a scene with 3+ shots becomes a CRT cabinet row, 1–2 a focused cabinet, so every usable
screenshot appears and none is stranded on a text-only scene.

## Motion grammar
Everything **rises and ignites** — headlines pop with `back.out`, cabinets lift and **float**
on a gentle finite sine yoyo, neon words stagger in, the climax **bursts** then settles, the
"Press Start" button **blinks** like an arcade attract screen. Deterministic: one paused GSAP
timeline, the synthwave canvas driven purely by the render's seek time, finite repeats only,
hidden = `opacity:0`. Best for bold, nostalgic, electric launches, gaming/creator/AI products
and hype reels.
