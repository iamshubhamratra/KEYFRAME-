---
name: living-city
renderer: living-city
vibe: "A living neon skyline at night — a dusk sky, a moon and stars, a glowing horizon, two layers of building silhouettes with twinkling lit windows and drifting traffic light-streaks behind neon-sign titles, holographic billboard screenshots, neon stat numbers and a logo CTA. Brand color repaints the whole city. Portrait-native 9:16 for Reels, Shorts & TikTok."
fontFamily: "Space Grotesk"
colors:
  sky: "#05060F"
  ground: "#04050C"
  text: "#F4F6FF"
  muted: "#8A8FA5"
  accent: "#22D3EE"
  near: "#080912"
---

# Living City

A **living neon skyline at night**. A persistent, continuously-flowing backdrop — a dusk
sky gradient, a moon and a parallax starfield, a glowing horizon, two layers of building
**silhouettes** with **twinkling lit windows**, a road band and drifting **traffic
light-streaks** — runs behind every scene and **matches across every cut**, so the film
reads as one continuous flight over the city rather than a slideshow. Portrait-native
**9:16** for Reels, Shorts and TikTok (it also holds up in 1:1 and 16:9 — all geometry is
relative to the skyline).

## The city (persistent, theme-colored)
- **Sky** a vertical dusk gradient `#05060F → #160A24` with the accent mixed into the mid
  and low sky; the whole backdrop is painted on one canvas as a pure function of time
  (deterministic, seek-exact), so nothing is a flat fill.
- **Moon & stars** — an accent-tinted moon high on the right and a twinkling starfield.
- **Horizon glow** — an accent bloom where the skyline meets the ground.
- **Far & near buildings** — two parallax layers of silhouettes with **accent-edged tops**
  and grids of **lit windows** that flicker (warm windows tinted by the accent).
- **Road band** — an accent-lit street below the skyline.
- **Traffic streaks** — warm and accent light-trails drift along the lanes.
- **Vignette** — darkens the edges back into the night so the content owns the center.

## Palette — everything is theme-driven
Default city neon: **accent** `#22D3EE`. The single accent derives the sky glow, the
building-top edges, the lit windows, the horizon bloom, the traffic streaks, the billboard
**neon border/glow**, the neon **text glow**, the gradient **button** and the accent
**headline word**. Because the whole system is derived from one accent, a brand color
repaints the ENTIRE city — the sky, the lights, the windows, the traffic and the CTA — not
just the text. Text is `#F4F6FF` with 66%/38% dim/faint tints; billboards sit on `#060814`.

## Type
- **Display** Space Grotesk (bold, tight) for neon titles, captions, stats and the wordmark.
- **Mono** JetBrains Mono for kickers, numbered billboard labels and the URL.
- **Body** Inter (falls to system-ui in the CDN-free render) for subtext and captions.

## Screenshots, uploads & logos (intentional placement)
Real screenshots, product images and user uploads are shown as **glowing holographic
billboards** on support poles — a neon border, an inner glow, a top sheen and a scan bar —
never a bare box. The frame aspect adapts to the shot: a **portrait** capture (ratio < 0.9)
gets a tall billboard, a **wide** desktop/dashboard capture a shorter one. An **empty** slot
renders an intentional branded placeholder (accent gradient wash + holo grid + a glowing
node), so a scene without an asset still reads as designed. The user's **logo** (when
uploaded) is reserved for the CTA lockup; otherwise a built play-glyph mark stands in.

## Scene vocabulary (chosen per storyboard scene)
- **open** — the skyline glows; a big neon-sign title and a mono subtitle rise over the city.
- **billboard** — a big holographic billboard on a support pole holds one screenshot (or a
  branded placeholder); a kicker glows above and a neon caption lands below.
- **stats** — big neon numbers light up like a district ticker; up to three stat cells from
  the scene's on-screen text, or one hero number. For stat / metric / countdown scenes.
- **bullets** — a neon headline over a row of holographic feature billboards with numbered
  neon labels (real screenshots when present), or a rising stack of neon feature rows.
- **statement** — a single centered neon statement that breathes. For quotes / manifestos.
- **cta** — the logo mark lights up, the neon wordmark types in char-by-char, a neon button
  pulses and a URL settles.

Screenshots are distributed across the display-capable scenes (billboard / bullets): a
scene with 3+ shots becomes a billboard row, 1–2 a single billboard, so every usable
screenshot appears as a city billboard and none is stranded on a text-only scene.

## Motion grammar
Everything **rises and glows** — neon titles climb, billboards lift on their poles and
**float** on a gentle finite sine yoyo, stat numbers pop in, windows twinkle and traffic
drifts. Entrances use `power3.out` / `back.out`. Deterministic: one paused GSAP timeline,
the city canvas driven purely by the render's seek time, finite repeats only, hidden =
`opacity:0`. Best for launches, app/SaaS showcases and bold after-dark urban brands.
