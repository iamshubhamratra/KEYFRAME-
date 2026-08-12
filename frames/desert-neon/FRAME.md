---
name: desert-neon
label: Desert Neon
orientation: portrait
fontFamily: Monoton
---

# Desert Neon

# Desert Neon

A 9:16 desert-dusk film lit by two working neon fixtures — a green cactus tube that buzzes and a pink VACANCY box that blinks out of phase with its own bulb.

## Palette

| role | hex |
|---|---|
| dusk | `#241a33` |
| cactus | `#59e07a` |
| motel | `#ff7ac2` |
| sand | `#e8c98f` |
| paper | `#f6eefc` |
| ink | `#170f22` |

Ground alternates `dusk` (hook, feature, stats) and `ink` (statement, montage, CTA); type always `paper`. Highlights rotate cactus green → motel pink → sand. Tweakables expose the night tone and the neon colour.

## Type

Display **Monoton** (hollow, multi-line, an actual neon-sign face) · body **Outfit**.
All beats uppercase with `0.05em` tracking and `1.24` leading — Monoton's inline strokes need the air, so sizes run smaller than the rest of the batch: hook 96px, statement 104px, feature 76px, CTA 84px.

## World

Runs at 1.8× film time on the hook, feature and stats beats:

- Sixteen stars in the upper 40% of the frame, each twinkling on `sin(t * 1.3 + i)` between 30% and 70% white.
- A `sand` dune ridge at 22% alpha filling the bottom third, drawn as a smooth quadratic horizon.
- A saguaro at the right built from three `cactus` tubes — a 12px stroke plus a 30px 25%-alpha halo behind it — with the entire group dropping to 35% opacity whenever `sin(t * 11)` falls below −0.85. That is the buzz.
- A tumbleweed: two dashed `sand` rings (r 44 and 26) rolling across the frame at 120px/s while spinning at 160°/s.
- A motel sign at the top-left — a 300×92 `motel`-pink outlined box blinking on `sin(t * 5)` with a pink bulb blinking one radian out of phase.

## Motion

Camera set `pushR · zoomIn · pushU · pushL · spin · drop`, stepped `i × 7 + 4`.
Magnitudes: skew `5`, rotation `1.1`.
Title entrance **slam** (scales in from 2.2× with a −4° rotate on outExpo), item entrance **pop**. Cut `push`, drift 1.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta. This pack owns:

- **Cursor (`click`)** — a drawn pointer travels to a button, clicks it with an expanding ripple and a label change, then travels on and flips a toggle.
- **Typing (`caret`)** — a line types out against a 10px highlight rule with a blinking caret, closing on a boxed stamp rotated −3°.
- **Swipe (`flip`)** — a single card scaleX-flips like a rolodex through three faces, with dot indicators that widen on the active one.
- **Notify (`pop`)** — pill toasts scaling in at staggered offsets and rotations.

Cards are `glow` with a cactus-green line and glow; stat numerals glow.

## Best for

Road trips and motels, bars and late-night services, retro Americana and diners, tour dates, travel brands that trade on night rather than sunshine.

