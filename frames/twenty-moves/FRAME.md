---
name: twenty-moves
label: Twenty Moves
orientation: portrait
fontFamily: Russo One
---

# Twenty Moves

A speedcubing club night: charcoal mat, sticker-bright accents, a cube scrambling itself in the backdrop, and the hardest camera in the library.

## Palette

| Role | Hex |
| --- | --- |
| mat (primary dark ground) | `#1e2024` |
| cube (accent, flood) | `#ffcb2e` |
| blue (second accent, CTA ground) | `#3d7bff` |
| white (type) | `#f4f4f6` |
| ink (deepest ground, tiles) | `#141518` |
| desk (stage surround) | `#17181c` |

Hook / Feature / Stats / App on mat with white type and cube highlights. Statement flashes a **full yellow ground** with ink type — a hard flare between dark beats. Montage drops to ink with mat tiles and cube labels. CTA floods **blue** with white type and an ink block button.

## Type

**Russo One** for titles, 0.02em tracking, **uppercase on every beat** — squared, technical letterforms. **Geologica** 400–700 for captions, chips, stat labels and body. Stats carries a rule; the app card ground is `#282b31`.

## World

Runs on Hook, Feature, Stats and App; the yellow Statement, ink Montage and blue CTA go clean.

- An isometric 3×3 cube at the right: a top face of nine rhombus tiles (52px, 4px ink stroke) and a left face of nine `skewY(28)` squares.
- Each tile re-picks from a six-sticker palette — cube yellow, blue, `#3fbf5a`, `#e8402e`, white, `#ff8a3d` — on `floor(t·1.4)` for the top face and `floor(t·1.1)` for the left, so the cube scrambles continuously and never repeats the same face pair.
- A large ghosted timer in Russo One at 88px, 16% white, counting 6.xx–8.xx.
- Five move notations `R U' F2 D L'` along the bottom, the active one switching to cube yellow on a 2.5Hz step, the rest at 30% white.
- A blue 6px progress bar underneath breathing between 30% and 100% width.

## Motion

Cams `pushL, zoomIn, spin, pushR, pushU, drop` at multiplier **7**, offset 1. Magnitudes: 4° skew, 1.2° roll, 0.16 inner. **Both** titles and items use **slam** (outExpo from 2.2× scale, -4°) — the only pack here that slams its list items too. Default energy **Bouncy** (1.35). Ambient world clock **2.0**, the busiest in this group.

## Beats

- **Cursor → keys** — keycaps press in sequence, bottom border collapsing 8px → 2px as each lands, then a result badge pops. The timer ritual.
- **Ring → ring** — full 240px circular dial with twelve tick marks, number centred. Ao5 progress.
- **Scroll → ticker** — three marquee rails at 66/58/50px scrolling in alternating directions at 70/115/160px per second. The club leaderboard.
- **Toggle → dial** — a 2×2 grid of rotary dials whose needles swing from -120° to their set angle and gain a ring when locked. Cube setup.
- Plus Hook (yellow tag kicker), Statement, Feature (ink frame card, square chips), Montage, Stats with a rule, Morph and CTA.

## Best for

Competitive hobby clubs, esports and gaming, developer tools and dashboards, fitness and time-trial products, technical SaaS — the one pack here whose dark card grounds genuinely hold a product screenshot.
