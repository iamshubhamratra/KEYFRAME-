---
name: aurora-motion
renderer: aurora-motion
vibe: "An ambient aurora film — flowing ribbons of accent light drift across a dark sky, soft mesh-gradient blooms breathe on lissajous paths and luminous motes rise, all on one canvas that flows unbroken across every cut. Over the light float glass badges, big gradient statements, frosted-glass screen frames holding real screenshots, glass feature cards and a luminous logo CTA. Brand color repaints the whole sky. Portrait-native 9:16 for Reels, Shorts & TikTok."
fontFamily: "Space Grotesk"
colors:
  stage: "#0E0A1E"
  ground: "#080611"
  text: "#F4F2FF"
  muted: "#9A96B8"
  accent: "#8B5CF6"
  accent-2: "#2DD4BF"
---

# Aurora Motion

An **ambient aurora** film — soft, cinematic and dreamy. A persistent,
continuously-flowing backdrop — flowing **ribbons/curtains** of accent light drifting
across a dark sky, soft **mesh-gradient blooms** breathing on lissajous paths and
**luminous motes** rising — runs behind every scene and **matches across every cut**, so
the film reads as one continuous aurora rather than a slideshow. Portrait-native **9:16**
for Reels, Shorts and TikTok (it also holds up in 1:1 and 16:9 — all geometry is relative
to the sky).

## The aurora sky (persistent, theme-colored — the signature)
- **Deep sky** a near-black vertical wash `#0E0A1E → #080611`; the whole backdrop is
  painted on one canvas as a pure function of time (deterministic, seek-exact), so nothing
  is a flat fill.
- **Mesh blooms** — five soft radial gradient blobs in the two accents (and their blend)
  drift on slow lissajous paths under a `lighter` blend, an ambient color wash that breathes.
- **Aurora ribbons** — three flowing luminous curtains of accent light hang and sway across
  the sky, each a wavy band with a bright top edge fading down. This is the star.
- **Luminous motes** — soft white sparks rise through the light and twinkle.
- **Vignette** — darkens the edges back into the sky so the type always owns the center.

## Palette — everything is theme-driven
Default aurora: **primary** `#8B5CF6` (violet) → **secondary** `#2DD4BF` (teal). The two
accents derive the mesh blooms, the ribbons, the background glows, the gradient statements,
the glass tints, the feature-card icons, the button and the CTA glyph. Because the whole
system is derived from the two accents, a brand color repaints the ENTIRE sky — the
ribbons, the blooms, the wash, the glows and the CTA — not just the text. Text is `#F4F2FF`
with 68%/40% dim/faint tints; surfaces are frosted glass (`rgba(255,255,255,0.07)`).

## Type
- **Display** Space Grotesk (soft-geometric) for titles, statements, headlines and the wordmark.
- **Mono** JetBrains Mono for badges, kickers and the URL.
- **Body** Inter (falls to system-ui in the CDN-free render) for subtext and captions.

## Screenshots, uploads & logos (intentional placement)
Real screenshots, product images and user uploads float in **frosted-glass screen frames**
with a soft top sheen and a gentle 3D tilt — never a bare box. The frame aspect adapts to
the shot: a **portrait** capture (ratio < 0.9) gets a tall frame, a **wide** desktop/
dashboard capture a shorter card. An **empty** slot renders an intentional branded
placeholder (aurora gradient wash + a glowing node), so a scene without an asset still
reads as designed. The user's **logo** (when uploaded) is reserved for the CTA lockup;
otherwise a built luminous aurora glyph stands in.

## Scene vocabulary (chosen per storyboard scene)
- **open** — a glass badge floats up, a big display title rises and a subtitle settles. Calm opener.
- **statement** — a single big gradient statement floats up word-by-word and breathes. The
  signature "big type over aurora" (quotes, reveals, stats).
- **showcase** — frosted-glass screen frames (up to three real screenshots) float in the light
  under a headline, drifting on a gentle finite sine. The product moment.
- **bullets** — a headline over a rising stack of frosted-glass feature cards, each with a
  luminous gradient icon and a label.
- **cta** — the logo mark assembles, the wordmark types in char-by-char, a gradient button
  pulses and a URL settles.

Screenshots are distributed across the display-capable scenes (statement / showcase /
bullets): any such scene that receives shots becomes a **showcase** of floating glass
frames, so every usable screenshot appears and none is stranded on a text-only scene.

## Motion grammar
Everything **drifts and floats** — blooms breathe, ribbons sway, frames and cards float on
gentle finite sine yoyos, statements rise and settle. Entrances use `power3.out` /
`back.out`; the aurora is slow and premium. Deterministic: one paused GSAP timeline, the
aurora canvas driven purely by the render's seek time, finite repeats only, hidden =
`opacity:0`. Best for premium brand films, app/SaaS launches and ambient product reveals.
