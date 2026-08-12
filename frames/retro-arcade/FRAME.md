---
name: retro-arcade
label: Retro Arcade
orientation: portrait
fontFamily: Press Start 2P
---

# Retro Arcade

An attract-mode screen that never breaks the pixel grid — invaders march, a scanline sweeps, the cannon fires, and the camera only ever shuttles left and right.

## Palette
| Role | Hex |
|---|---|
| void | #14122b |
| green | #6ef06e |
| magenta | #ff4fd8 |
| cyan | #4fd8ff |
| paper | #f2f2f2 |
| ink | #0c0b1c |
| desk | #0a0918 |

## Type
Press Start 2P sets all titles in forced uppercase at 64–110px with line-height 1.3 — sizes are small because each glyph is enormous, and the `slam` preset drops lines in with no easing softness. VT323 handles body, terminal output and tile labels (34px). Statement beats are phosphor green on near-black with magenta highlights.

## World
A CRT game field, drawn on hook, feature and stats. Twenty-two 5×5 square stars whose x is floored per frame, so they step in discrete pixel jumps at five different rates instead of gliding. Five invader sprites, each a hand-authored pixel path that alternates between two frames on `floor(t·1.6) % 2` and shifts 30px sideways on `floor(t·0.8) % 4` — a real two-frame march — scaled 3.2× and coloured green/magenta/cyan in rotation. A translucent paper band 130 tall sweeps top-to-bottom at 260 units per second as a scanline. A green player cannon (three stacked rects) slides ±260 on sin(t·0.9) at the base, and two shots — paper-white and magenta, offset in time — climb 700 units away from wherever it was. Ambient clock 2.0, the busiest in the set.

## Motion
Roll and skew are explicitly **zero**; slide 0.34 and inner-push 0.16 carry all the motion, with tiny 3/3/0.03 drift. The camera list is pushL, pushD, zoomIn, pushR, pushU, spin — but stride 3 from offset 0 means only indices 0 and 3 ever fire, so the film shuttles strictly pushL ↔ pushR, matching the invader march. Titles `slam`, items `pop`.

## Beats
- **Code (terminal)** — a green-on-black terminal typing cheat codes and boss logic.
- **Cursor (keys)** — keycaps depressing in sequence, for controls and combos.
- **Swipe (flip)** — level and ship select flipping card by card.
- **Ring (bar)** — a segmented power/1-UP meter rather than a smooth arc.
- Feature cards are `glow` with a green rule at radius 8 (a CRT bezel); montage tiles are cyan-ruled with a magenta bloom and zero tilt.

## Best for
Indie and retro games, game studios and jams, dev tools and CLIs that want personality, esports and streaming, product launches with a nostalgia angle, and anything that can carry "INSERT COIN".

