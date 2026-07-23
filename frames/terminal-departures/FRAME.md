---
version: alpha
name: Terminal Departures — Frame
description: >
  An airport departures hall for films. Charcoal-black split-flap boards clack
  every headline into place character by character — the Solari board is the
  signature motion — on signal-yellow and ivory with green ON-TIME and red
  FINAL-CALL accents. IBM Plex Mono labels, hanging gate signage that swings in
  on ceiling pivots, ticker bands, boarding-pass paper that prints from a slot,
  and an analog clock that laps the film. Mechanical, punctual and charming;
  motion is clacks, sweeps and conveyor drifts — never blur soup. For launches,
  product tours, countdowns and anything that should depart on time.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script
colors:
  void: "#0A0B0E"
  ground: "#121317"
  board: "#0B0C0F"
  cell: "#101116"
  ivory: "#F2EEE3"
  muted: "#8B8D96"
  yellow: "#FFC61A"
  green: "#35D07F"
  cyan: "#5FD4E6"
  red: "#FF4B3E"
typography:
  body:        { fontFamily: "IBM Plex Mono", cqw: 0.95, weight: 500, lineHeight: 1.5, color: "muted" }
  label:       { fontFamily: "IBM Plex Mono", px: 13, weight: 600, tracking: "0.3em", upper: true }
  flap-xl:     { fontFamily: "Space Grotesk", cqw: 5.4, weight: 700, tracking: "0.02em", upper: true }
  flap-lg:     { fontFamily: "Space Grotesk", cqw: 3.4, weight: 700, tracking: "0.02em", upper: true }
  flap-status: { fontFamily: "IBM Plex Mono", cqw: 1.35, weight: 700, upper: true }
  gate-number: { fontFamily: "Space Grotesk", cqw: 4.0, weight: 700, color: "yellow" }
atoms:
  flap-cell: >
    The signature atom. A dark cell (0.92em × 1.34em, radius 0.09em) with a split
    midline (2px darkened band at 50%), inset top highlight and bottom shadow,
    holding ONE character. Headlines are rows of cells. Characters arrive by
    cycling through 3–6 seeded wrong characters, each swap paired with a scaleY
    0.12 squash through the midline (the "clack"). Spaces are dimmer empty cells.
  chip: >
    Rounded rect (0.4cqw) on board-black with a 1px ivory-alpha border, mono
    uppercase letter-spaced text and a leading status dot (yellow / cyan / red).
  gate-sign: >
    A hanging sign: board-black rounded panel suspended on two thin rods, big
    yellow flap characters, mono caption. Swings in from the ceiling pivot
    (transform-origin above the panel) and settles with a slow pendulum sway.
  ticker: >
    A full-width band on board-black with a 2px yellow top rule; mono uppercase
    text marquees seamlessly (two copies, half-width translate loop).
  boarding-pass: >
    Ivory paper card with notched perforation sides, mono field labels, Space
    Grotesk values and a barcode of repeating stripes. Prints downward out of a
    dark slot bar in tractor-feed steps, then wobbles to rest.
motion:
  clack: "every headline uses textfx enter 'flap' — chars cycle + squash, then land"
  sweep: "panel cut between scenes; light sweeps cross the hall slowly"
  conveyor: "belts/tickers drift linearly; riders share the same px/s as the surface"
  pendulum: "hung elements enter with elastic swing about their ceiling pivot"
never:
  - gradient-clipped text (this board is solid ivory/yellow — no chrome)
  - blur-heavy entrances; motion must read as MECHANICAL, not dreamy
  - more than one red element on screen (red = FINAL CALL, reserve it)
---

# Terminal Departures

The film is a departures hall. Headlines are split-flap boards that clack into
place; stats hang from the ceiling as gate signs; lists are departure tables
with green ON TIME statuses; the CTA is a FINAL CALL in signal red followed by
a gold board. A ticker runs the whole film; an analog clock's second hand laps
the composition exactly N times (rotation is a linear function of the timeline,
so it is deterministic under seeking).

Reference render: `frame-showcase.html` (32s, 1920×1080).
