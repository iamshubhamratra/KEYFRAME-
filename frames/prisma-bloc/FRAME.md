---
name: prisma-bloc
renderer: dom-prisma
vibe: "A designed poster in motion — flat saturated colour fields that hard-cut on block wipes, Archivo Black mega type crossing a travelling seam, outlined sticker chips with hard offset shadows and a halftone dot rain. Screenshots ride browser and phone mockups that scroll like a real product demo. Brand colour rotates the whole palette, grounds included. Portrait-native 9:16."
fontFamily: "Archivo Black"
colors:
  ground: "#FFF6EA"
  text: "#12100E"
  muted: "#4A4741"
  a1: "#FF4D2E"
  a2: "#1B4DFF"
  a3: "#FFD23F"
  a4: "#14C98E"
---

# Prisma Bloc

A **designed poster in motion**, authored portrait-first for 9:16. Where
`flagship` and `brightlife` are *atmospheric* (glass, bloom, mesh), Prisma Bloc is
deliberately **graphic**: flat saturated colour fields that hard-cut per scene,
Archivo Black mega type crossing a travelling seam, sticker chips with 4px ink
outlines and hard offset shadows, a halftone dot rain and a live grain plate. It
is built to survive being watched **muted, at 40% screen size, on a phone**.

## Palette (NO gradients, glows or blur as mood)
- **Paper** `#FFF6EA`, **ink** `#12100E`.
- **Blocks** — a1 vermilion `#FF4D2E`, a2 ultramarine `#1B4DFF`, a3 solar
  `#FFD23F`, a4 jade `#14C98E` — used FLAT, as full grounds, cards, chips and the
  seam. Grounds alternate paper → saturated so no two adjacent scenes share a field.
- Under a brand skin the **whole palette rotates together onto the brand hue**,
  each colour pinned to its authored luminance — so blocks, grounds, chips,
  outlines, seam, waveform, progress rule and CTA all become the brand's, at
  exactly the designed brightness. Luminance and layout stay ours; hue is yours.

## Type
- **Display** Archivo Black — uppercase, tight (`-0.035em`), line-height `0.86`.
  Headlines are wrapped and auto-sized so any script length fits the safe column.
- **Sub-display** Space Grotesk for card titles and the CTA.
- **Chrome** JetBrains Mono for kickers, the pack label and frame labels.
- **Body** Inter.

## Motion
- **Block wipe** cuts: a panel in the next scene's colour drives in from a
  rotating edge (bottom → left → top → right, order seeded per job), covers the
  frame, and exits the opposite side. The ground swaps while it is covered, so
  the colour change is never seen as a jerk. Never a dissolve.
- **Three beats per scene**: entrance batch (50ms stagger), a mid-scene punch at
  46% where chips and cards kick and settle, then the wipe out. Nothing goes more
  than ~1.5s without new motion.
- Six entrance primitives — `mask` (clip-path wipe), `up` (y + blur rise), `pop`
  (scale + back-ease), `slide` (x with skew), `draw` (scaleX from an edge), `bar`
  (scaleY from base) — plus a numeral count-up.
- A **continuity seam** never leaves: it re-anchors and re-angles per scene,
  travelling *through* the cut so the scenes read as one film.
- A continuous **camera drift** (alternating push-in / pull-back) runs the whole
  scene, with a per-scene focal point.

## Screenshots
Presentation is **aspect-routed from the asset's real pixels**, never from the
scene: ratio ≥ 1.2 → a **browser mockup** (chrome bar + pill address) whose
capture **scrolls** inside the window; ratio ≤ 0.7 → a **phone mockup** (notch,
inner radius) that scrolls its screen; between → an outlined paper card. Slots are
fixed boxes with `object-fit: contain` over a tinted matte, so a tall dashboard
letterboxes rather than losing its header. Two shots stack 60/40 with a tilt;
three or more become the gallery row or the 2×2 grid. Off-edge bleed is reserved
for decorative blocks and the seam — a container holding a user screenshot always
stays inside the safe margin.

## Captions
The bottom 13% is a reserved band; no scene places content in it. Captions are
**karaoke** — word-by-word highlight on the accent, clocked off each cue — on an
ink pill that reads on any brand ground.

## Best for
Bold, graphic, product-led brands — launches, app demos, SaaS features, DTC,
creator tools, and anything that wants to look art-directed rather than generated.
