---
name: neo-dashboard
renderer: neo-dashboard
vibe: "A dark SaaS analytics dashboard coming alive — a tinted data surface with an ambient dot-grid, a drifting accent glow, a scan line and a vignette behind live KPI cards that count up, drawn line/area charts, growing bars, a browser-chrome device-frame holding real dashboard screenshots and a logo CTA. Brand color repaints the whole interface. Portrait-native 9:16 for Reels, Shorts & TikTok."
fontFamily: "Space Grotesk"
colors:
  bg: "#0A0D16"
  ground: "#070912"
  panel: "#10131F"
  text: "#EEF2FB"
  muted: "#8A8FA5"
  accent: "#6366F1"
  positive: "#37E6A4"
---

# Neo Dashboard

A **dark SaaS analytics dashboard** coming alive. A persistent, continuously-flowing
**data shell** — a tinted near-black surface, an ambient **dot-grid**, a drifting accent
**glow**, a slow **scan line** and a **vignette** — runs behind every scene and **matches
across every cut**, so the film reads as one live interface rather than a slideshow.
Portrait-native **9:16** for Reels, Shorts and TikTok (it also holds up in 1:1 and 16:9 —
all geometry is relative to the surface).

## The shell (persistent, theme-colored)
- **Surface** a tinted vertical gradient `#0A0D16 → #070912`; the whole backdrop is painted
  on one canvas as a pure function of time (deterministic, seek-exact), so nothing is a flat fill.
- **Dot-grid** — an ambient field of accent dots scrolls slowly upward and gently pulses.
- **Glow** — a large soft accent radial drifts across the upper surface.
- **Scan line** — a faint accent highlight band sweeps slowly down the surface.
- **Vignette** — darkens the edges back into the ground so content always owns the center.

## Palette — everything is theme-driven
Default series accent: **`#6366F1`** (indigo). The single accent derives the surface tint,
the panel / panel-top fills, the border, the grid, the glow, **every chart series**, the KPI
value colors, the placeholder washes and the gradient CTA. Because the whole system is
derived from one accent, a brand color repaints the ENTIRE interface — not just the text. A
fixed **positive** green `#37E6A4` marks "up / live" indicators. Text is `#EEF2FB` with
60%/32% dim/faint tints; panels sit on `#10131F`.

## Type
- **Display** Space Grotesk (bold, tight) for titles, KPI values, deltas and the wordmark.
- **Mono** JetBrains Mono for kickers, KPI labels, feature chips and the URL.
- **Body** Inter (falls to system-ui in the CDN-free render) for subtext and captions.

## Screenshots, uploads & logos (intentional placement)
Real screenshots, app captures and user uploads are shown inside a **browser-chrome
device-frame** (title-bar dots + address pill) — never a bare box. Because dashboards are
**wide**, the frame is a **shorter card**; a **portrait** capture (ratio < 0.9) gets a taller
frame instead. An **empty** slot renders an intentional branded placeholder (accent wash +
faint dot-grid + a drawn mock chart line), so a scene without an asset still reads as a live
dashboard. The user's **logo** (when uploaded) is reserved for the CTA lockup; otherwise a
built bar-chart glyph mark stands in.

## Scene vocabulary (chosen per storyboard scene)
- **open** — the dashboard boots; a mono kicker, a big display title (last word in accent)
  and a subtitle rise center.
- **metrics** — a grid of live **KPI cards**: a mono label, a **counting** stat value and a
  drawn sparkline. Every value comes from the storyboard's bullets.
- **chart** — a full-width **line/area chart** draws itself in behind a headline and an accent
  delta pill, with a growing **bar row** beneath. The "watch it climb" beat.
- **showcase** — a single **browser-chrome frame** holds a real dashboard screenshot (or a
  branded placeholder), with a headline and feature chips.
- **gallery** — a row of browser frames (up to three real screenshots), each a slight tilt.
- **cta** — the logo mark assembles, the wordmark types in char-by-char, a gradient button
  pulses and a URL settles.

Screenshots are distributed across the display-capable scenes (metrics / showcase / gallery):
a scene with 2+ shots becomes a gallery, 1 a focused showcase, so every usable screenshot
appears and none is stranded on a text-only or chart scene.

## Motion grammar
Everything **rises and draws** — cards climb in, stat values **count up**, charts **draw**
themselves via stroke-dashoffset, bars **grow** from the baseline, frames **float** on a
gentle finite sine yoyo. Entrances use `power3.out` / `back.out`; the chart and counters
scrub deterministically off the timeline. Deterministic: one paused GSAP timeline, the shell
canvas driven purely by the render's seek time, finite repeats only, hidden = `opacity:0`.
Best for SaaS, analytics products, dashboards and metrics-driven launches.
