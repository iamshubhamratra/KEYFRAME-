---
version: alpha
name: Blueprint Atelier — Frame
description: >
  An engineering drawing of a film. A cyanotype-blue drafting sheet with
  minor/major grids, tick-mark edge rulers, corner registration marks and a
  live title block (PROJECT / SHEET / SCALE / DRAWN BY). White technical
  linework draws itself — schematics, dash-dot centre lines, dimension lines
  with counting measurements, dashed flowcharts with checkmark gates, plotted
  curves with area fills — amber for highlights, marker-red for stamps and
  strikes. A crosshair cursor with a live X/Y readout glides to each scene's
  focus. Smart, technical, trustworthy. For dev tools, SaaS and engineering.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script
colors:
  sheet: "#123659"
  deep: "#0C2440"
  ink: "#EAF3FF"
  faint: "#9DB8D9"
  amber: "#FFB84D"
  cyan: "#8FD8FF"
  red: "#FF5F5F"
typography:
  body:       { fontFamily: "IBM Plex Mono", cqw: 0.95, weight: 500, lineHeight: 1.55 }
  fig-label:  { fontFamily: "IBM Plex Mono", px: 14, weight: 500, tracking: "0.22em", upper: true }
  heading-lg: { fontFamily: "Space Grotesk", cqw: 5.6, weight: 700, upper: true, tracking: "0.01em" }
  dim-label:  { fontFamily: "IBM Plex Mono", px: 13, tracking: "0.12em", color: "cyan" }
atoms:
  sheet-chrome: >
    Grids (1.25cqw minor / 6.25cqw major), edge rulers on all four sides,
    corner registration L-marks, bottom-right title block with live fields.
  draw-on: >
    THE signature. Every figure draws itself: pathLength=100 stroke dashoffset,
    staggered; dimension lines extend with arrowheads while their measurement
    counts up; leader lines annotate with mono labels.
  rubber-stamp: >
    Rounded-rect border stamp (red or amber) that slams in at scale 2.4 with
    power4.in, then micro-shakes; used for verdicts (JUST WORDS, APPROVED).
  scan: >
    An amber highlight bar or cyan beam that sweeps rows/plots linearly,
    lighting elements as it passes.
motion:
  plot: "curves/axes draw with power1.inOut; a scan line tracks the draw"
  measure: "dimensions extend and COUNT — numbers come from the script"
  sheet-wipe: "scene cuts ride a light-blue panel sweep, GSAP-owned transform"
never:
  - decorative gradients or glow soup; light is linework, not bloom
  - unstamped reds — red appears only as marker strikes/stamps/circles
---

# Blueprint Atelier

Reference render: `frame-showcase.html` (30s, 1920×1080).
