---
name: blueprint-atelier
renderer: blueprint
fontFamily: Space Grotesk
colors:
  ground: "#0C2440"
  text: "#EAF3FF"
  muted: "#9DB8D9"
  amber: "#FFB84D"
  cyan: "#8FD8FF"
  red: "#FF5F5F"
---

# Blueprint Atelier

An **engineering-drawing** design system: the film is drafted on a living drafting
table. A deep engineering-blue graph-paper sheet, edge rulers, a slowly rotating
compass rose, a wandering crosshair with a live X/Y readout, and a title block in
the corner. Every idea is rendered as a technical drawing — dimension lines that
draw themselves with a trailing pencil, dashed-box flowcharts, a scanning output
plot with an area fill, red revision strike-throughs, and rubber stamps. A
sheet-wipe covers every scene change.

## Palette
- **Ground** deep engineering blue `#0C2440` → `#123659` (radial drafting-table glow).
- **Ink** `#EAF3FF` (paper white), **faint** `#9DB8D9` (pencil grey-blue).
- **Amber** `#FFB84D` — the primary accent (dimensions, highlights, the CTA).
- **Cyan** `#8FD8FF` — construction lines, leaders, the crosshair.
- **Red** `#FF5F5F` — corrections, strikes, the "point of it all" circle.

## Type
- **Display** Space Grotesk (uppercase, tight) for headlines, figure numbers, stamps.
- **Chrome** IBM Plex Mono for labels, dimensions, the title block and captions.

## Motion
- Draw-on lines (`pathLength` reveals), a trailing pencil, spinning schematic parts,
  count-up numerals, stamp slams, and a sheet-wipe between scenes. 280–660ms,
  staggered, one focal per scene. Deterministic (paused GSAP timeline, seeked frame
  by frame).

## Best for
Technical / engineering / developer / precision products, process explainers, and
"crafted, deliberate, no-improvisation" brand stories.
