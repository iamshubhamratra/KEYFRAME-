---
version: alpha
name: IBM Plex Mono — Frame (video / frame layer)
description: >
  a chart-first analyst system: near-monochrome ground, a faint data grid, mono labels and ONE signal accent reserved for the data — for dashboards, analytics, data and ML products
  Grounds are dark (#0B0E14); display type is IBM Plex Mono, body is Inter.
  One accent (#39D0FF) marks a single focal device per frame; #FFC24D is the secondary.
  Atoms are sacred · composition is free · numbers come from the script.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script

colors:
  base: "#0B0E14"
  panel: "#12161F"
  grid: "#1B2130"
  ink: "#E6ECF5"
  cyan: "#39D0FF"
  amber: "#FFC24D"

typography:
  body:      { fontFamily: "Inter", cqw: 0.95, weight: 400, lineHeight: 1.55, color: "ink" }
  label:     { fontFamily: "IBM Plex Mono", px: 12, weight: 600, tracking: "0.2em", upper: true, color: "accent" }
  card-title:{ fontFamily: "IBM Plex Mono", cqw: 1.3, weight: 700, lineHeight: 1.2, color: "ink" }
  heading-lg:{ fontFamily: "IBM Plex Mono", cqw: 3.4, weight: 700, lineHeight: 1.05, color: "ink" }
  heading-xl:{ fontFamily: "IBM Plex Mono", cqw: 4.8, weight: 700, lineHeight: 1.0, color: "ink" }
  stat-number:{ fontFamily: "IBM Plex Mono", cqw: 4.2, weight: 700, lineHeight: 1.0, color: "accent" }
---

# IBM Plex Mono — Frame (video / frame layer)

## Overview

IBM Plex Mono is a chart-first analyst system: near-monochrome ground, a faint data grid, mono labels and ONE signal accent reserved for the data — for dashboards, analytics, data and ML products. An analyst's dark canvas — a faint data grid and ONE cyan signal reserved for the numbers. The ground is dark (#0B0E14); text is
ink #E6ECF5 on it. Exactly **one accent
device** (#39D0FF) per frame marks the single focal point; #FFC24D is a supporting hue. Restraint carries
the identity — a clear type hierarchy, generous space, and one saturated moment beat a busy frame.

## Colors

Ground `#0B0E14`. Text is high-contrast ink. `#39D0FF` is the one saturated device per frame
(a rule, dot, underline, or the single CTA fill); `#FFC24D` supports it. No third saturated hue in a
single frame; never a gradient on body text.

## Typography

- **Display:** IBM Plex Mono, fit-to-measure (≤3 words → heading-xl; 4–6 → heading-lg; 7+ → card-title).
- **Body:** Inter 400–500; **labels/data:** IBM Plex Mono caps, 0.2em tracking.
- Legibility floor ≥ 1.3cqw; the display face is the pack's voice — never swap it for a generic sans.

## Frame Treatments

> Recipe: dark ground + constellation texture · one accent device · clear IBM Plex Mono display moment · generous space.

### 1 · Title
A mono caps label over a tight heading on the faint grid; one accent tick marks the key term. Reads like the cover of a data report.

### 2 · Series
Two or three mono legend rows, each a colored tick + label + value; the primary series owns the accent, the rest stay muted.

### 3 · Figure
A dominant figure over a minimal bar/line motif that draws in; the trend line is the only saturated element.

### 4 · Takeaway
A one-line conclusion over the grid with a single accent underline and a mono action label.

## Composition Rules

### Do
- One accent device per frame; everything else in ink/muted on the ground.
- Set display in IBM Plex Mono, fit-to-measure; body in Inter; labels in IBM Plex Mono caps.
- Keep frames open and aligned; let the single saturated moment lead the eye.

### Don't
- No second saturated hue in one frame; no gradient on text; no generic-sans display swap.
- Don't crowd the frame or tilt/blur the structure.

## Numerals & Claims

Never invent figures. Stat blocks carry `{metric}` / `±N%` placeholders until the script supplies
values. No real third-party logos or customer marks — render any as a neutral placeholder.

## Known Gaps

- **IBM Plex Mono** + **Inter** are self-hosted/bundled; the composer keys off the manifest.
- 9:16 / 1:1 are guidance — preserve the whitespace ratio and the display floor.
