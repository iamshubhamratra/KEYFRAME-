---
name: product-showcase
renderer: product-showcase
vibe: "A commercial product-ad film on a lit studio stage — a back-wall spotlight, a reflective floor, drifting beams and light dust behind a hero product that rises on a turntable in a rim-lit device-frame, feature callout leaders, a light-burst climax and a logo CTA. Brand color repaints the whole studio. Portrait-native 9:16 for Reels, Shorts & TikTok."
fontFamily: "Space Grotesk"
colors:
  stage: "#0B0C12"
  ground: "#08090F"
  text: "#F3F5FB"
  muted: "#8A8FA5"
  accent: "#FF6A3D"
  product: "#171923"
---

# Product Showcase Pro

A **commercial product-ad film** shot on a **lit studio stage**. A persistent,
continuously-flowing backdrop — a back-wall spotlight, a reflective floor, a glowing
horizon line, a floor spotlight pool, two drifting light beams and floating light dust —
runs behind every scene and **matches across every cut**, so the film reads as one
continuous studio take rather than a slideshow. Portrait-native **9:16** for Reels,
Shorts and TikTok (it also holds up in 1:1 and 16:9 — all geometry is relative to the stage).

## The studio (persistent, theme-colored)
- **Stage** a near-black vertical gradient `#0B0C12 → #141620` above a darker **floor**;
  the whole backdrop is painted on one canvas as a pure function of time (deterministic,
  seek-exact), so nothing is a flat fill.
- **Back-wall spotlight** — a large soft radial glow in the accent hue drifts slowly on the wall.
- **Horizon line** — a thin accent glow where the wall meets the floor.
- **Spotlight pool** — an elliptical accent pool on the floor that breathes.
- **Light beams** — two angled accent beams sway down from above the frame.
- **Light dust** — accent motes rise through the beams and twinkle.
- **Vignette** — darkens the edges back into the ground so the product always owns the center.

## Palette — everything is theme-driven
Default studio light: **accent** `#FF6A3D`. The single accent derives the stage glow, the
spotlight pool, the product **rim light**, the frame **glow shadow**, the callout **leader
lines**, the gradient **button** and the gradient/accent **headline word**. Because the
whole system is derived from one accent, a brand color repaints the ENTIRE studio — the
spotlights, the rim light, the leaders, the burst and the CTA — not just the text. Text is
`#F3F5FB` with 66%/36% dim/faint tints; the product frame sits on `#171923`.

## Type
- **Display** Space Grotesk (bold, tight) for titles, captions and the wordmark.
- **Mono** JetBrains Mono for kickers, numbered callout labels, the brief bar and the URL.
- **Body** Inter (falls to system-ui in the CDN-free render) for subtext and captions.

## Screenshots, uploads & logos (intentional placement)
Real screenshots, product images and user uploads are shown in **rim-lit studio
device-frames** with a soft **reflection** and a 3D **turntable tilt** — never a bare box.
The frame aspect adapts to the shot: a **portrait** capture (ratio < 0.9) gets a tall phone
frame, a **wide** desktop/dashboard capture a shorter card. An **empty** slot renders an
intentional branded placeholder (accent gradient wash + a glowing node), so a scene without
an asset still reads as designed. The user's **logo** (when uploaded) is reserved for the
CTA lockup; otherwise a built play-glyph mark stands in.

## Scene vocabulary (chosen per storyboard scene)
- **open** — the stage lights up; kicker + big display title + subtitle rise under the spotlight.
- **brief** — a mono "brief" bar types the line behind an accent rule (for quotes / manifestos).
- **hero** — the product rises on its turntable with rim-light + reflection; a caption headline
  lands with the last word in accent. Holds one screenshot.
- **callouts** — the product sits center while feature leader-lines draw out to numbered labels
  on alternating sides. One screenshot + bullets.
- **gallery** — a row of angle-views (up to three screenshots) under a headline. "Every angle."
- **climax** — radiating accent light-rays fan out behind the product, a burst blooms and a big
  gradient tagline lands with a flash. The dramatic peak; holds one screenshot.
- **cta** — the logo mark assembles, the wordmark types in char-by-char, a gradient button
  pulses and a URL settles.

Screenshots are distributed across the display-capable scenes (hero / callouts / gallery /
climax): a scene with 3+ shots becomes a gallery, 1–2 a hero or callouts, so every usable
screenshot appears and none is stranded on a text-only scene.

## Motion grammar
Everything **rises** — products lift on their turntable, headlines climb, callout lines
sweep out, dust floats. Entrances use `power3.out` / `back.out`; the product and chips
**float** on a gentle finite sine yoyo; the climax **bursts** then settles. Deterministic:
one paused GSAP timeline, the studio canvas driven purely by the render's seek time, finite
repeats only, hidden = `opacity:0`. Best for launches, app/SaaS showcases and e-commerce.
