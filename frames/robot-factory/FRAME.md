---
name: robot-factory
label: Robot Factory
orientation: portrait
fontFamily: Chakra Petch
---

# Robot Factory

A working production line: dark floor, safety orange, a conveyor that never stops and an arm that never gets bored.

## Palette

| Role | Hex |
|---|---|
| floor | #23262b |
| orange (safety) | #ff7a1a |
| steel | #9aa4b2 |
| warn | #ffd23c |
| paper | #f0f0ec |
| ink | #141518 |

Floor and safety colour are tweakable (floor → blue-grey #1d2430 or rust #262020; orange → red #ff4f5e or cyan #4fd8ff).

## Type

Chakra Petch 400–700 — squared, technical — sets every headline **in caps**, 92px on montage to 140px on the statement, tracked +0.02em. IBM Plex Sans handles kickers, chips, tile labels and stat captions. Kicker is a solid warning-yellow tag on ink.

## World

A conveyor deck: a 90px ink band at H−420 with eight steel roller rings (r26, 7px stroke, no fill) travelling right at 120px/s and wrapping. Three orange crates (88×78, radius 6, 90% opacity, scored with a black cross rule) ride the same belt 380px apart. Bolted at the right, a steel arm — a 60×60 base and a 240px boom — swings from −40° on `sin(1.1t)*26`, carrying a paper-coloured gripper with a chevron. At the top left a 14px beacon **hard-blinks** on `sin(4t)>0`: full warn yellow to 20%, a square wave with no fade. Across the bottom, a 10px dashed warn rule (50/34) marches left at 60px/s. Ambient clock 1.9, the busiest here. World shows on hook, feature, stats and app beats.

## Motion

Cams pushL, zoomIn, pushD, pushR, spin, pushU (mul 7, offset 3) with `skew 4, rot 0.8, inn 0.18` — the only pack in this set with meaningful shear, so the frame shoves rather than glides. Titles **slam**; items **pop**.

## Beats

- **Code (diff)** — a code diff with added/removed lines, for firmware and automation routines.
- **DragDrop (assemble)** — parts dragged into place and locked together, not just moved.
- **Toggle (dial)** — a rotary dial turning through positions (start-up sequence, handover).
- **Ring (gauge)** — an arc gauge for line efficiency and order progress.
- Feature and montage hold screenshots in an ink frame card (radius 12, steel hairline) with square orange/warn/steel chips; stats sit on the floor colour with a rule and 148px numerals; the CTA is the only beat that floods full orange, with an ink block button.

## Best for

Manufacturing and industrial robotics, hardware and prototyping, warehouse and fulfilment, CI/CD and build tooling, fleet and equipment SaaS, safety and compliance training, energy and infrastructure — anything with a shift, a line and a throughput number.
