---
version: alpha
name: Street Food Launch 2 — Frame (video / frame layer)
description: >
  Retro CRT terminal announcing street food — sizzling grill phosphor glow, bustling vendor stalls, building to CTA.
  Grounds are dark (#06110a); display type is JetBrains Mono, body is Inter.
  One accent (#ff9f1c) marks a single focal device per frame; #3df07e is the secondary.
  Atoms are sacred · composition is free · numbers come from the script.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script

colors:
  void: "#06110a"
  panel: "#0b1c12"
  grid: "#12331f"
  ink: "#c8f7d4"
  phosphor: "#3df07e"
  grill: "#ff9f1c"

typography:
  body:      { fontFamily: "Inter", cqw: 0.95, weight: 400, lineHeight: 1.55, color: "ink" }
  label:     { fontFamily: "JetBrains Mono", px: 12, weight: 600, tracking: "0.2em", upper: true, color: "accent" }
  card-title:{ fontFamily: "JetBrains Mono", cqw: 1.3, weight: 700, lineHeight: 1.2, color: "ink" }
  heading-lg:{ fontFamily: "JetBrains Mono", cqw: 3.4, weight: 700, lineHeight: 1.05, color: "ink" }
  heading-xl:{ fontFamily: "JetBrains Mono", cqw: 4.8, weight: 700, lineHeight: 1.0, color: "ink" }
  stat-number:{ fontFamily: "JetBrains Mono", cqw: 4.2, weight: 700, lineHeight: 1.0, color: "accent" }
---

# Street Food Launch 2 — Frame (video / frame layer)

## Overview

Street Food Launch 2 is a retro-computer terminal: monospace type glowing on a dark CRT ground, scanline grid, one phosphor accent — for dev tools, CLIs, AI agents, hacker-grade launches. Retro CRT terminal announcing street food — sizzling grill phosphor glow, bustling vendor stalls, building to CTA. The ground is dark (#06110a); text is
ink #c8f7d4 on it. Exactly **one accent
device** (#ff9f1c) per frame marks the single focal point; #3df07e is a supporting hue. Restraint carries
the identity — a clear type hierarchy, generous space, and one saturated moment beat a busy frame.

## Colors

Ground `#06110a`. Text is high-contrast ink. `#ff9f1c` is the one saturated device per frame
(a rule, dot, underline, or the single CTA fill); `#3df07e` supports it. No third saturated hue in a
single frame; never a gradient on body text.

## Typography

- **Display:** JetBrains Mono, fit-to-measure (≤3 words → heading-xl; 4–6 → heading-lg; 7+ → card-title).
- **Body:** Inter 400–500; **labels/data:** JetBrains Mono caps, 0.2em tracking.
- Legibility floor ≥ 1.3cqw; the display face is the pack's voice — never swap it for a generic sans.

## Frame Treatments

> Recipe: dark ground + grid texture · one accent device · clear JetBrains Mono display moment · generous space.

### 1 · Boot
A blinking cursor and a mono wordmark on the dark ground; the headline types in like a command. One phosphor rule underlines the key token.

### 2 · Readout
Two or three mono `> key: value` rows on faint grid, each row drawing in; the featured row glows in the accent.

### 3 · Metric
A huge mono figure counts up in the accent over the grid; a caps caption sits beneath a hairline.

### 4 · Prompt
A centered `$ run` prompt: the sign-off headline over a blinking cursor and one filled-accent action key.

## Composition Rules

### Do
- One accent device per frame; everything else in ink/muted on the ground.
- Set display in JetBrains Mono, fit-to-measure; body in Inter; labels in JetBrains Mono caps.
- Keep frames open and aligned; let the single saturated moment lead the eye.

### Don't
- No second saturated hue in one frame; no gradient on text; no generic-sans display swap.
- Don't crowd the frame or tilt/blur the structure.

## Numerals & Claims

Never invent figures. Stat blocks carry `{metric}` / `±N%` placeholders until the script supplies
values. No real third-party logos or customer marks — render any as a neutral placeholder.

## Known Gaps

- **JetBrains Mono** + **Inter** are self-hosted/bundled; the composer keys off the manifest.
- 9:16 / 1:1 are guidance — preserve the whitespace ratio and the display floor.
