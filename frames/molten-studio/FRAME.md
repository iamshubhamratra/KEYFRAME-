---
name: molten-studio
label: Molten Studio
orientation: portrait
fontFamily: Comfortaa
---

# Molten Studio

A glassblowing hot shop: one furnace that never cools, one pipe turning, and finished pieces catching the light on the shelf.

## Palette

| Role | Hex | Where it lands |
|---|---|---|
| shop | #1c1512 | primary ground — hook, feature, stats, app |
| molten | #ff9633 | the gather, furnace core, highlight, glow, CTA button |
| aqua | #6fd8d0 | kicker outline, chips, montage highlight, tile labels |
| sand | #e8dcc4 | all type, blowpipe, shelf line, card keylines |
| ink | #14100c | statement / montage / CTA ground, card fill |

App cards lift to `#2a1f18`; desk `#120e0a`. The furnace core uses a separate `#ffd9a0`; the gather highlight `#ffe0b0`.

## Type

**Comfortaa** 500–700 sets titles at 90–142px on a 1.1 line — a rounded geometric display whose soft terminals echo the molten blobs and the 18–22px card radii. **Livvic** 400–700 carries batch notes, gauge labels, shop-board notices and stat captions. No forced uppercase; stat numbers run at 148px with `glowNums`.

## World

Right of frame, the glory hole: a 240×300 ink rounded-rect box with a faint 25% sand outline; inside it a molten ellipse (rx74/ry90) whose opacity breathes `0.85 ± 0.12` on `sin(3t)`, wrapped around a hotter `#ffd9a0` core (rx44/ry56). Three heat plumes — wavy 10px molten paths at 0.30 → 0.16 opacity — rise from its mouth and loop every 140px at 70px/s. A blowpipe enters from the left at 18°: a 360px sand rod at 55% opacity with a molten gather ball at the tip pulsing ±12% on `sin(2.2t)`, plus a bright `#ffe0b0` hot spot. Above, a cooling shelf — a 6px sand rule at y320 — carries three finished vessels drawn as outlined circles in aqua, molten and sand, filled at 14%, each with a white specular dot that jumps from 0.25 to 0.8 opacity as a 120px/s shine sweep passes within 60px. World shows on hook, feature, stats, CTA and app.

## Motion

Camera set: `zoomIn, pushU, drop, pushL, zoomOut, pushR` at multiplier 5, offset 2. Magnitudes 0.5° roll, 8px **vertical** drift (heat rising, not lateral pan), 0.26 inner ease. Titles **drowse**; items **pop**. Ambient 1.7, tweak default motion `Calm` — the fire is in the colour, not the camera.

## Beats

- **Ring / gauge** — furnace climb to working temperature as a dial.
- **Typing / hand** — chalkboard batch notes written in a hand style and signed off.
- **Notify / drop** — shop-board and kiln-watch alerts drop in from the top (this pack runs Notify twice).
- **Morph / fade** — the commission list crossfading BOWL → VASE → ORB → SOMETHING NEW.
- Cards are `glow` at r22 with a molten bloom; montage tiles tilt ±2° at r18 with the same glow; CTA glows molten on ink with a circular logo lockup.

## Best for

Glass, ceramics, forges and metalwork; candle, fragrance and small-batch homeware; studio classes and workshop experiences; any maker brand where the process is warm, slow and worth watching.
