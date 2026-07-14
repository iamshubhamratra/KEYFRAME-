---
version: alpha
name: Neon Premiere — Frame
description: >
  A film premiere for software. An indigo-black cinema night lit by a scrolling
  neon perspective-grid floor and a low horizon glow, wrapped in a film-set HUD
  (REC dot, live timecode, corner brackets) with editorial SCENE numbering. The
  hero word is a cyan → violet → magenta gradient clipped onto Space Grotesk 700
  that glows; glass stat tiles, an aperture wordmark and a single magenta premiere
  CTA finish the reel. Cinematic and premium — neon is light, never soup. For
  launches, trailers, brand reveals and hype reels.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script
colors:
  void: "#05060E"
  ground: "#0A0D1F"
  cyan: "#6EE7FF"
  violet: "#8B7CF6"
  magenta: "#FF4FD8"
  amber: "#FFC24B"
  text: "#F2F5FF"
  muted: "#8B93B8"
typography:
  body:        { fontFamily: "Inter", cqw: 0.95, weight: 500, lineHeight: 1.45, color: "muted" }
  label:       { fontFamily: "Space Grotesk", px: 12, weight: 700, tracking: "0.3em", upper: true }
  scene-no:    { fontFamily: "Space Grotesk", px: 13, weight: 600, tracking: "0.4em", upper: true }
  heading-md:  { fontFamily: "Space Grotesk", cqw: 3.2, weight: 700, lineHeight: 1.06, tracking: "-0.015em" }
  heading-lg:  { fontFamily: "Space Grotesk", cqw: 5.4, weight: 700, lineHeight: 1.02, tracking: "-0.02em" }
  heading-xl:  { fontFamily: "Space Grotesk", cqw: 8.0, weight: 700, lineHeight: 0.96, tracking: "-0.03em" }
  stat-number: { fontFamily: "Space Grotesk", cqw: 5.6, weight: 700, lineHeight: 1.0, tracking: "-0.03em" }
  mono:        { fontFamily: "Space Grotesk", cqw: 1.15, weight: 600, tracking: "0.22em", upper: true }
spacing:
  slide-pad: "8cqw"
  gap-md: "2.4cqw"
components:
  night-ground:
    background: "radial {colors.ground} (top-center) → {colors.void} (edges) — a deep indigo cinema night"
    description: "THE surface — a vertical indigo-black night. One radial gradient over two ink tokens, never a flat black."
  grid-floor:
    rule: "1px {colors.cyan} (near) → {colors.violet} (far) perspective grid on the lower band, CSS-3D, fading to void at the horizon"
    sweep: "animate background-position toward camera (a conveyor), FINITE — the scroll never loops forever"
    description: "The signature floor: a vanishing-point neon grid below the horizon line. ONE per frame, lower half only."
  neon-horizon:
    background: "a thin {colors.cyan} → {colors.magenta} gradient bar with soft blur, sitting on the horizon line"
    description: "The glowing seam where the grid meets the night. One per frame; supports the floor, never headlines."
  film-hud:
    parts: "four corner brackets · a REC dot ({colors.magenta}) + label · a live TC 00:00:00:00 timecode · a REEL slug · a thin signature-gradient progress bar"
    typography: "{typography.mono} in {colors.text}/{colors.muted}"
    description: "The film-set overlay — a persistent, dim HUD framing the whole reel. Structure and diegesis, never the focus."
  scene-number:
    composition: "SCENE <b>NN</b> — <label>, {typography.scene-no}, the number in {colors.amber}"
    description: "Editorial act numbering that opens a region. The ONE amber moment; caps, wide-tracked, muted."
  aperture-mark:
    rule: "a 6-blade camera-aperture ring in the signature gradient beside the wordmark"
    description: "The brand device on the reveal frame. One per video; pairs with the wordmark, never floats alone."
  gradient-headline:
    fill: "gradient-clip text {colors.cyan} → {colors.violet} → {colors.magenta} on Space Grotesk 700"
    glow: "soft 0 0 30px {colors.violet}"
    description: "The hero word — the signature neon gradient clipped onto the display face. The ONE gradient moment per frame."
  neon-chip:
    border: "1px {colors.line} on a 5% white glass fill"
    dot: "a small {colors.magenta} glow dot"
    typography: "{typography.label} in {colors.cyan}"
    description: "The eyebrow/badge — a wide-tracked caps pill with a magenta dot. Opens a scene; never plain text."
  glass-panel:
    background: "linear glass {colors.cyan}@10% → {colors.ground}@62%, 1px hairline, 14px backdrop blur, soft drop"
    description: "The one panel material — a dark frosted card for stat tiles and pipeline cards. Blur is the only depth."
  stat-tile:
    composition: "{typography.stat-number} in gradient-clip + a caption + a corner progress arc in one accent"
    description: "A square glass tile holding one figure that counts up, with a single neon arc. Numbers come from the script."
  strike-line:
    rule: "a {colors.magenta} glow bar that wipes across a struck line (left → right)"
    description: "The editorial negation — strikes an old-way line before the payoff. Left-aligned scenes only."
  cta-button:
    background: "gradient {colors.amber} → {colors.magenta} → {colors.violet}"
    textColor: "{colors.void}"
    rounded: "999px"
    glow: "0 0 40px {colors.magenta}@38% + a diagonal sheen sweep"
    typography: "Space Grotesk 700"
    description: "The ONE filled neon element — one per video, in the closer. A pill with a light sheen; never repeated."
---

# Neon Premiere — Frame

## Overview

Neon Premiere is a **film premiere for software** — a movie-house reveal rendered from a
prompt. The frame is an **indigo-black cinema night**: a deep radial sky over a glowing
neon perspective-grid floor that recedes to a vanishing point, seamed by a thin horizon
glow. A dim **film-set HUD** rings the whole reel — corner brackets, a pulsing REC dot,
a live timecode, a reel slug and a signature progress bar — and each act opens with
**editorial SCENE numbering**. The hero word is the ONE chrome-neon moment: a
cyan → violet → magenta gradient clipped onto **Space Grotesk 700**, ringed in soft violet
glow. Cyan and magenta are the neon leads; violet bridges; amber is reserved for the scene
number and the closing CTA. The feeling is **premium, kinetic, cinematic** — a red-carpet
premiere for a product. Failure looks garish: rainbow soup, neon on every element, a grid
that fills the frame, or hard chrome bevels.

## Colors

`{colors.void}` (edges) and `{colors.ground}` (top-center) form the night radial — the
universal ground; never a flat fill, never pure black. Text is `{colors.text}` (display +
body-bright); `{colors.muted}` carries secondary body. **The accent law:** neon = cyan +
magenta, and only one leads per frame (the other supports). `{colors.violet}` is the
gradient bridge and glow connective tissue — it links cyan to magenta, it never headlines
alone. `{colors.amber}` is reserved for the **scene number** and the closing **CTA** only.
Forbidden: greens, true reds, more than two competing neons in one focal area, neon as a
large flat fill (it belongs in glow, 1px lines, and gradient-clip).

**Text color law:** all body and display text is `{colors.text}`/`{colors.muted}` (the hero
word may wear the one signature gradient-clip; labels only may be `{colors.cyan}`) — neon is
never paragraph or multi-line text. Any text over an image sits on a `{colors.void}` scrim or
inside a `glass-panel`, never raw on a busy image.

## Typography

- **Display:** Space Grotesk 700 only, tight (line-height 0.96–1.06), tracking −0.015 to
  −0.03em — fit-to-measure: ≤3 words → `heading-xl`; 4–6 → `heading-lg`; 7+ → `heading-md`.
  The hero gets the signature gradient-clip; secondary display stays solid `{colors.text}`.
- **Body:** Inter 500 in `{colors.muted}` (bright lines in `{colors.text}`). **Labels &
  HUD:** Space Grotesk 600–700 caps, 0.22–0.4em tracking, in `{colors.cyan}`/`{colors.muted}`.
- **Legibility floor:** load-bearing lines ≥ 1.4cqw. Banned: italics, more than one
  gradient-clip headline per frame, neon body text, bevel/emboss effects.

## Depth & Surface

- **Depth is glow + perspective + one glass blur**, never bevel or hard drop shadow. Light
  comes from the grid, the horizon seam and neon edges; the CSS-3D grid supplies real spatial
  recession on the floor; `glass-panel` blur lifts tiles off the night.
- **Layer stack:** night-ground → 3D depth field (drifting points) → grid-floor + horizon
  (lower band) → content → gradient-headline + neon glow → film-HUD + captions on top.
- **Surface law:** content lives in the open night above the horizon; the grid owns the lower
  band. **Ceiling:** one glass material, zero opaque panels, zero chrome bevels, one gradient
  headline — neon stays in glow, lines and clip.

## Shapes

Radii are soft: pills (999px) for chips and the CTA, ~1.5cqw for glass tiles. The aperture
ring and stat arcs are the only circles; the grid is the only hard geometry. Diamonds may
sparkle around the closer. No sharp 0-radius corners; no skeuomorphic chrome plates.

## Frame Treatments

> Recipe per frame: night radial · film-HUD frame · ONE grid-floor (lower band) + horizon
> seam · open night above for content · ONE gradient or neon focal device · cyan/magenta neon,
> amber only in scene-no/CTA.

1. **Cold open / Cover** — Deep night, grid receding to a centered vanishing point; a
   `neon-chip` eyebrow over a 2–3 word `gradient-headline` (the one clip moment) with a
   char-pop entrance; a slow camera push. ~55% open.
2. **Feature / Pipeline** — A `scene-number` opens; 2–3 `glass-panel` cards or a labeled rail
   sit in the night, the lead card's step in the leading neon; grid anchors the lower band.
3. **Stat** — One to three `stat-tile`s: big gradient-clip numbers counting up, each with a
   single neon arc; grid pulls the eye to the vanishing point. Numbers from the script.
4. **Differentiator** — Left-aligned `heading-lg` lines, each wiped by a magenta `strike-line`,
   resolving into one solid `{colors.text}` payoff with a gradient underline.
5. **Closing / Premiere** — Centered wordmark + `aperture-mark`, then the ONE `cta-button`
   (amber→magenta→violet, glowing, sheen) over a brighter grid; diamonds sparkle; HUD reels out.

## Composition Rules

### Do
- Build every frame on the night radial with the film-HUD frame, exactly ONE grid-floor and
  ONE horizon seam on the lower band.
- Reserve the signature gradient-clip for a single hero word per frame; keep secondary display
  solid `{colors.text}`.
- Let ONE neon lead (cyan or magenta) and the other support; bridge with violet glow.
- Open scenes with a `scene-number` or a glowing `neon-chip`; keep glow soft (≤40%) so it reads
  premium.
- Keep content in the open night above the horizon; let the grid own the lower band; count real
  figures up in `stat-tile`s.

### Don't
- Don't fill the frame with the grid, raise the horizon past mid-frame, or use more than one
  grid/horizon.
- Don't stack two gradient-clip headlines, set neon body text, or use chrome bevels / hard drop
  shadows / a second glass tone.
- Don't introduce greens or true reds; don't let amber escape the scene-number and CTA; don't run
  three+ neons in one focal area.
- Don't go garish — no rainbow gradients, no neon on every element, no max-strength glow everywhere.

## Pre-Render Self-Audit

- Night radial ground (two ink tokens, not flat); film-HUD frame present; exactly ONE grid-floor
  (lower band) + ONE horizon seam.
- Exactly one signature gradient-clip headline; all other display solid `{colors.text}`; floor ≥ 1.4cqw.
- One leading neon (cyan or magenta), the other supporting; violet only as bridge/glow; amber only
  in the scene-number and CTA.
- Depth is glow + 3D perspective + one glass blur only — zero drop shadows, zero chrome bevels.
- Content lives in the open night above the horizon; ~50%+ of the frame breathes; CTA appears once
  (closer only).
- Every numeral traces to the script, else a `— figure —` / `{metric}` placeholder.
