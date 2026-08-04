---
name: prisma-bloc
renderer: dom-prisma
vibe: "A designed poster in motion — flat saturated colour fields that hard-cut on block wipes, Archivo Black mega type crossing a travelling seam, outlined sticker chips with hard offset shadows and a halftone dot rain. Screenshots ride browser and phone mockups that scroll like a real product demo. Brand colour rotates the whole palette, grounds included. Portrait-native 9:16."
fontFamily: "Archivo Black"
colors:
  ground: "#F4EFE6"
  text: "#14110F"
  muted: "#48413D"
  a1: "#D95A3A"
  a2: "#2438C8"
  a3: "#EFC24A"
  a4: "#1BB184"
---

# Prisma Bloc

A **designed poster in motion**, authored portrait-first for 9:16. Where
`flagship` and `brightlife` are *atmospheric* (glass, bloom, mesh), Prisma Bloc is
deliberately **graphic**: flat saturated colour fields that hard-cut per scene,
Archivo Black mega type crossing a travelling seam, sticker chips with 4px ink
outlines and hard offset shadows, a halftone dot rain and a live grain plate. It
is built to survive being watched **muted, at 40% screen size, on a phone**.

## Palette (NO gradients, glows or blur as mood)
- **Paper** `#F4EFE6`, **ink** `#14110F`, **muted** `#48413D`.
- **Blocks** — a1 terracotta `#D95A3A`, a2 cobalt `#2438C8`, a3 gold `#EFC24A`,
  a4 emerald `#1BB184` — used FLAT, as full grounds, cards, chips and the seam.
  Grounds alternate paper → saturated so no two adjacent scenes share a field, so
  **a saturated full-frame ground is correct, not a defect** — the pack is not a
  light-ground system.
- They are **deliberately not full-chroma** (68–84%, not 100%). At chip scale a
  100%-saturation accent is fluorescent and as a full-frame ground it is harsh;
  every ground here instead clears **AA body contrast** with its own best text
  colour — a1 ink 4.90:1, a2 paper 7.41:1, a3 ink 11.18:1, a4 ink 6.87:1.
- The four sit on a deliberate **value ladder** (a2 .074 < a1 .224 < a4 .333 <
  a3 .574). The layout was drawn against that spacing and the brand mapper assigns
  slots by luminance, so the ladder is load-bearing, not decorative.
- A scene commits to its ground plus **ONE lead accent**; everything else is paper,
  ink, or a *tone of the ground*. Decoration is always a tone of the field it sits
  on, never a fixed colour dropped onto whatever ground is there.
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
- A **continuity seam** carries the film: it re-anchors and re-angles per scene,
  travelling *through* the cut so the scenes read as one film. It is absent from the
  **hook** and arrives with the first block wipe — the opener is pure mega type filling
  the frame, so there is often no clear band for the seam there, and the first cut gains
  something to deliver. Once in, it never leaves.
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
