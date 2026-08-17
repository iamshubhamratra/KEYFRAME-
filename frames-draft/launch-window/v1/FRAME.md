---
version: alpha
name: Launch Window — Frame (video / frame layer)
description: >
  a bright modern SaaS system: near-white ground, soft brand gradients, friendly rounded type and one vivid gradient accent — for SaaS explainers, product tours and launches
  Grounds are light (#f9fafd); display type is Sora, body is Inter.
  One accent (#7c3aed) marks a single focal device per frame; #ff5a1f is the secondary.
  Atoms are sacred · composition is free · numbers come from the script.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script

colors:
  paper: "#f9fafd"
  mist: "#eef0f8"
  ink: "#0d1220"
  violet: "#7c3aed"
  ember: "#ff5a1f"
  haze: "#c9b6fa"

typography:
  body:      { fontFamily: "Inter", cqw: 0.95, weight: 400, lineHeight: 1.55, color: "ink" }
  label:     { fontFamily: "IBM Plex Mono", px: 12, weight: 600, tracking: "0.2em", upper: true, color: "accent" }
  card-title:{ fontFamily: "Sora", cqw: 1.3, weight: 700, lineHeight: 1.2, color: "ink" }
  heading-lg:{ fontFamily: "Sora", cqw: 3.4, weight: 700, lineHeight: 1.05, color: "ink" }
  heading-xl:{ fontFamily: "Sora", cqw: 4.8, weight: 700, lineHeight: 1.0, color: "ink" }
  stat-number:{ fontFamily: "Sora", cqw: 4.2, weight: 700, lineHeight: 1.0, color: "accent" }
---

# Launch Window — Frame (video / frame layer)

## Overview

Launch Window is a bright modern SaaS system: near-white ground, soft brand gradients, friendly rounded type and one vivid gradient accent — for SaaS explainers, product tours and launches. A bold launch pack for feature announcements — near-white ground, violet-to-ember gradient, counting numerals and motion that builds to the reveal. The ground is light (#f9fafd); text is
ink #0d1220 on it. Exactly **one accent
device** (#7c3aed) per frame marks the single focal point; #ff5a1f is a supporting hue. Restraint carries
the identity — a clear type hierarchy, generous space, and one saturated moment beat a busy frame.

## Colors

Ground `#f9fafd`. Text is high-contrast ink. `#7c3aed` is the one saturated device per frame
(a rule, dot, underline, or the single CTA fill); `#ff5a1f` supports it. No third saturated hue in a
single frame; never a gradient on body text.

## Typography

- **Display:** Sora, fit-to-measure (≤3 words → heading-xl; 4–6 → heading-lg; 7+ → card-title).
- **Body:** Inter 400–500; **labels/data:** IBM Plex Mono caps, 0.2em tracking.
- Legibility floor ≥ 1.3cqw; the display face is the pack's voice — never swap it for a generic sans.

## Frame Treatments

> Recipe: light ground + flow texture · one accent device · clear Sora display moment · generous space.

### 1 · Hero
A near-white ground with a soft corner gradient; a pill label over a bold friendly heading, the key phrase in a gradient clip, one underline.

### 2 · Features
Three light cards with a duotone icon, a title and a line of body; the middle card lifts on the brand gradient.

### 3 · Proof
A big figure in the gradient accent with a caption and a soft rising motif.

### 4 · CTA
A centered sign-off with one gradient-filled pill button on the bright ground.

## Composition Rules

### Do
- One accent device per frame; everything else in ink/muted on the ground.
- Set display in Sora, fit-to-measure; body in Inter; labels in IBM Plex Mono caps.
- Keep frames open and aligned; let the single saturated moment lead the eye.

### Don't
- No second saturated hue in one frame; no gradient on text; no generic-sans display swap.
- Don't crowd the frame or tilt/blur the structure.

## Numerals & Claims

Never invent figures. Stat blocks carry `{metric}` / `±N%` placeholders until the script supplies
values. No real third-party logos or customer marks — render any as a neutral placeholder.

## Known Gaps

- **Sora** + **Inter** are self-hosted/bundled; the composer keys off the manifest.
- 9:16 / 1:1 are guidance — preserve the whitespace ratio and the display floor.
