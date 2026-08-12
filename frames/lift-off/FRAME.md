---
name: lift-off
label: Lift Off
orientation: portrait
fontFamily: Chonburi
---

# Lift Off

Dawn-flight pack: warm peach paper, burnt-orange accent, and a balloon that climbs with the scene.

## Palette

| Role | Hex | Used for |
|---|---|---|
| dawn | `#f6d8c3` | primary ground (hook, feature, stats, app) |
| balloon | `#d95d39` | highlight, envelope, CTA ground |
| basket | `#7a5230` | wicker, ropes, hill wash, secondary stat |
| sky | `#9fc4d8` | statement ground, chip fill |
| ink | `#33232a` | copy, card fill, CTA button |

## Type

Display: **Chonburi** (rounded decorative serif) — line-height 1.10, titles 92–146px. Body: **Prompt** 400–700. Hook title sits at top 330; statements drop to 630 and scale to 146.

## World

Shown on hook, feature, stats and app; hidden on statement, montage and CTA so those read as flat colour fields. A balloon at right rises 260px across the first half of the scene while bobbing on `sin(t*0.9)` and swaying on `sin(t*0.5)`: ellipse envelope in the balloon colour, five white gore curves, two rope legs into a rounded wicker basket, and a burner flame circle whose radius pulses on a 5Hz beat. Three white two-lobe clouds scroll left→right at 26/38/50 px-s with falling opacity. A translucent brown hill silhouette closes the bottom, with three small bird ticks above it. Ambient clock 1.6.

## Motion

Cameras: pushU → zoomOut → hopU → pushL → drop → pushR, multiplier 5, offset 3. Magnitude rot 0.6, driftY 11, driftZ 0.05. Titles and items both enter on **rise** — the whole pack moves upward. Default motion preset is Calm.

## Beats

- **Ring / bar** — horizontal progress bars fill to show climb, capacity or season progress.
- **Toggle / switch** — a pre-flight list where switches flick to on, one per item.
- **Morph / fade** — a single word crossfades through a series (destinations, dates, routes).
- **Cursor / slider** — a cursor drags a slider to demonstrate a control (the deck uses the burner valve).

## Best for

Balloon and small-aircraft operators, sunrise tours, resorts and lodges, wellness retreats, seasonal outdoor experiences, and any early-morning ritual brand.
