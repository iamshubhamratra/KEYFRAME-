---
name: grid-dispatch
renderer: grid-dispatch
vibe: "A Swiss-modernist dispatch sheet in motion — flat paper, near-black ink, one saturated accent, a visible six-column grid, self-drawing 2px rules and hard-edged mask reveals. Screenshots ride technical asset panels with a spec header bar. A camera pushes in and settles before every cut. Portrait-native 9:16."
fontFamily: "Archivo"
colors:
  ground: "#F3F2F2"
  text: "#201E1D"
  muted: "#6B6866"
  accent: "#EC3013"
  paper: "#FFFFFF"
---

# Grid Dispatch

A **Swiss-modernist dispatch sheet in motion**. Where most of the library reaches for
depth, glow and atmosphere, this pack does the opposite: it is **flat, architectural and
printed**. Nothing floats and nothing is decorated — alignment, the strength of the
dividers, and one saturated accent do all the organising. Portrait-native **9:16**.

## The system

- **Ground** off-white paper `#F3F2F2`; **ink** near-black `#201E1D`; **one** accent
  (`#EC3013` by default, replaced wholesale by the brand colour). This is a *mono* scheme
  on purpose — a second accent would break the discipline that gives it authority.
- **Six-column grid**, 64px margins on a 1080-wide stage. Every element starts on a column
  edge. The grid is *visible*: faint column rules sit under the composition.
- **Zero corner radius. 2px rules.** No shadows, no gradients, no blur as decoration.
- **Archivo** throughout — 800 for headlines, 600 for labels and spec text, 400 for body.
  Labels are uppercase and letterspaced; headlines are tight (-0.035em) and flush left.

## Motion

Three primitives, and everything is built from them:

- **enter** — arrive and settle (`easeOutCubic`). Copy, panels, chips.
- **draw** — rules, wipes, masks, accent fields (`easeInOutCubic`). Anything that *extends*.
- **pop** — stamps, counters, registration marks (a back-ease). Anything that *lands*.

Headlines rise out of **hard-edged masks** (`overflow:hidden`), never fades. Accent poster
fields **wipe** across the grid on `scaleX` from the left. Rules **draw** themselves from
their origin edge. A **camera** pushes into each composition and settles back to rest
*before* the cut, so every transition lands on a square, settled frame.

## Transitions

The cut vocabulary is architectural rather than atmospheric — column shutters, rule
sweeps, accent block pushes, register shifts, mask slides and camera push-throughs. A
sequencer deals them so no move repeats within three cuts.

## Assets

Screenshots and photography ride **asset panels**: a bordered rectangle with a **spec
header bar** stating the slot and the aspect ratio (`ASSET 01 — FEATURE` / `16:9`). The
panel is sized from the asset's own ratio, so nothing stretches. Per the design system,
*stock* photography prints in **pure black and white**; the user's own material —
website captures, uploads and the logo — keeps **full colour**, because that is their
brand and not decoration.

## Best for

Engineering, developer tools, fintech, research, B2B and editorial brands — anywhere
authority and precision read better than spectacle.
