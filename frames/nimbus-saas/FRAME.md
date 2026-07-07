---
version: alpha
name: Inter — Frame (video / frame layer)
description: >
  a bright modern SaaS system: near-white ground, soft brand gradients, friendly rounded type and one vivid gradient accent — for SaaS explainers, product tours and launches
  Grounds are light (#FAFAFD); display type is Space Grotesk, body is Inter.
  One accent (#6366F1) marks a single focal device per frame; #EC4899 is the secondary.
  Atoms are sacred · composition is free · numbers come from the script.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script

colors:
  paper: "#FAFAFD"
  mist: "#F0F0F8"
  ink: "#171525"
  indigo: "#6366F1"
  pink: "#EC4899"
  sky: "#38BDF8"

typography:
  body:      { fontFamily: "Inter", cqw: 0.95, weight: 400, lineHeight: 1.55, color: "ink" }
  label:     { fontFamily: "Inter", px: 12, weight: 600, tracking: "0.2em", upper: true, color: "accent" }
  card-title:{ fontFamily: "Space Grotesk", cqw: 1.3, weight: 700, lineHeight: 1.2, color: "ink" }
  heading-lg:{ fontFamily: "Space Grotesk", cqw: 3.4, weight: 700, lineHeight: 1.05, color: "ink" }
  heading-xl:{ fontFamily: "Space Grotesk", cqw: 4.8, weight: 700, lineHeight: 1.0, color: "ink" }
  stat-number:{ fontFamily: "Space Grotesk", cqw: 4.2, weight: 700, lineHeight: 1.0, color: "accent" }
---

# Inter — Frame (video / frame layer)

## Overview

Inter is a bright modern SaaS system: near-white ground, soft brand gradients, friendly rounded type and one vivid gradient accent — for SaaS explainers, product tours and launches. Bright modern SaaS — near-white ground, a soft indigo→pink brand gradient, friendly type. The ground is light (#FAFAFD); text is
ink #171525 on it. Exactly **one accent
device** (#6366F1) per frame marks the single focal point; #EC4899 is a supporting hue. Restraint carries
the identity — a clear type hierarchy, generous space, and one saturated moment beat a busy frame.

## Colors

Ground `#FAFAFD`. Text is high-contrast ink. `#6366F1` is the one saturated device per frame
(a rule, dot, underline, or the single CTA fill); `#EC4899` supports it. No third saturated hue in a
single frame; never a gradient on body text.

## Typography

- **Display:** Space Grotesk, fit-to-measure (≤3 words → heading-xl; 4–6 → heading-lg; 7+ → card-title).
- **Body:** Inter 400–500; **labels/data:** Inter caps, 0.2em tracking.
- Legibility floor ≥ 1.3cqw; the display face is the pack's voice — never swap it for a generic sans.

## Frame Treatments

> Recipe: light ground + flow texture · one accent device · clear Space Grotesk display moment · generous space.

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
- Set display in Space Grotesk, fit-to-measure; body in Inter; labels in Inter caps.
- Keep frames open and aligned; let the single saturated moment lead the eye.

### Don't
- No second saturated hue in one frame; no gradient on text; no generic-sans display swap.
- Don't crowd the frame or tilt/blur the structure.

## Numerals & Claims

Never invent figures. Stat blocks carry `{metric}` / `±N%` placeholders until the script supplies
values. No real third-party logos or customer marks — render any as a neutral placeholder.

## Known Gaps

- **Space Grotesk** + **Inter** are self-hosted/bundled; the composer keys off the manifest.
- 9:16 / 1:1 are guidance — preserve the whitespace ratio and the display floor.
