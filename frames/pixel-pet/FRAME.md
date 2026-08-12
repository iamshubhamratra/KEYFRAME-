---
name: pixel-pet
label: Pixel Pet
orientation: portrait
fontFamily: Silkscreen
---

# Pixel Pet

A Game Boy screen with a creature living in it: mint LCD, four-colour pixels, and motion that refuses to interpolate.

## Palette

| Role | Hex |
|---|---|
| mint (screen) | #cfe8b8 |
| shade | #a8c890 |
| dark (pixels) | #274029 |
| accent | #e07a3f |
| paper | #f2f8e8 |
| ink | #1c2e1e |

Screen and pixel colours are tweakable (mint → ice #c8e0e8 or sand #e8d8c0; dark → navy #2a3550 or plum #4a2e35).

## Type

Silkscreen — a true bitmap face — sets every headline, **uppercased on every single beat**, 64px on montage to 92px on the statement, line-height 1.30 so the blocky glyphs get air. IBM Plex Mono runs kickers, chips, tile labels (30px) and stat captions. Kicker is an outline tag with radius 0.

## World

A 10×6 grid of 8px squares at 12% dark — the dot matrix behind the image. Centre stage: a pixel-art creature drawn as a single path, scaled ×6, hopping `|sin(3t)|*40` while gliding `sin(0.5t)*220` across the frame, with two mint eye pixels. Above it a pixel heart emits on a 1.25s loop, rising 160px while scaling 3→2 and fading out, in accent orange. Three shade-coloured 14px ground blocks jitter 8px on `floor(t*2)%2` — a hard 2Hz step, no easing anywhere. A 90px white band at 6% opacity sweeps top-to-bottom at 200px/s: the LCD refresh. Ambient clock 1.9, the busiest in its family.

## Motion

Cams pushD, pushL, zoomIn, pushU, pushR, spin at mul 7 — fast index churn — but magnitudes are `rot 0, skew 0, drift 2/2`: pure axis translation. Nothing rotates, because rotation would smear the pixel grid. Titles **slam**; items **pop**.

## Beats

- **Cursor (keys)** — a D-pad/keycap press drives the pointer instead of a mouse.
- **Ring (bar)** — a segmented meter filling block by block (happiness, evolution progress).
- **Notify (side)** — alerts sliding in from the edge, stacked.
- **DragDrop (drag)** — an object dragged onto a target (serve dinner, redecorate).
- Feature and montage hold screenshots inside a dark frame card (radius 6, mint hairline) and mint-glowing tiles on ink; the CTA is the only fully dark beat, with a solid orange block button.

## Best for

Indie games and game studios, virtual-pet and habit apps, kids' and family products, dev-hardware and gadget launches, retro-flavoured brand mascots, anything that wants to look playable rather than polished.
