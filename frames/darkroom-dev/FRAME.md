---
name: darkroom-dev
label: Darkroom Dev
orientation: portrait
fontFamily: Syne
---

# Darkroom Dev

A community film lab under safelight: near-black ground, one red bulb breathing, negatives drying on the line, everything glowing slightly.

## Palette

| Role | Hex | Use |
|---|---|---|
| dark | `#14100e` | warm near-black — Hook/Feature/Stats/App ground |
| safe | `#e2483d` | safelight red — the bulb, glows, full-bleed Statement, CTA button |
| amber | `#e89b3c` | film-frame tint, Feature highlight, tile labels |
| grey | `#cfc9bd` | warm grey type on black |
| paper | `#f4f1ea` | print white — type on the red Statement, button label |

Montage and CTA drop to `#0d0a09`. Desk surround `#0e0b0a`. App-beat card `#1c1512`.

## Type

Display: **Syne** 600–800, wide and geometric with unusual joins — 92–148px, `upper: true` on every beat. Body: **Hanken Grotesk** 400–700. The terminal beat swaps to the kit's mono face on a `#10131a` panel.

## World

Shown on Hook, Feature, Stats, **CTA** and App — this is the only pack in its cohort that keeps the world running under the call to action.
1. **The safelight** — a red disc at `r 40 + sin(t*1.6)*6` inside a 110px halo at 12%, both pulsing together.
2. **The drying line** — a 3px grey rule at 40% strung across the upper frame.
3. **Three film strips** — clipped to the line, each swaying ±5° on `sin(t*0.9 + i*1.2)`, built from a 68px translucent body, five amber-tinted frames at 14%, and eight sprocket-hole rects punched down the edge.
4. **The tray** — an outlined 300×70 rect at the floor where two concentric ellipses expand and fade in safelight red on a `(t * 0.6) % 1` loop.

Card treatment is `glow` (safelight bloom), montage tiles glow, and Stats sets `glowNums`. Ambient clock 1.6.

## Motion

Cams `zoomIn · pushL · pushD · zoomOut · pushR · hopU`, cadence multiplier **7**, offset 3 — cuts often, but the world under it barely moves, which is the point. Magnitudes: rot 0.6, ease-in 0.22. Titles use **machete** (slide in 90px from the left with a −6° skew unwinding on outQuint); items **rise**. Default motion setting: **Lively** (energy 1.0) — not Bouncy.

## Beats

- **Typing `terminal`** — a dark console panel bordered in safelight red, `# prompt`, `$` line typed in mono with a block caret, closing on a green `› OK`.
- **Ring `bar`** — a vertical graduated cylinder with a spout and 25/50/75 marks that fills from the bottom, number and label beside it. Developer chemistry as the chart.
- **Scroll `stack`** — contact-sheet cards flicking off the top of the deck with an n/total counter.
- **Notify `side`** — cards slide in 460px from the right, each with a draining progress bar along its base.

## Best for

Film labs and photography schools, camera and lens brands, dark-mode product UI and developer tools, creative studios, analog-leaning subscription products, anything where slowness is a feature and the screen is the hero.
