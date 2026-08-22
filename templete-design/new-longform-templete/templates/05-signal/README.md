# 05 — Signal

**Category** Technology / B2B product
**Orientation** 16:9 · 1920 × 1080
**Runtime** 5:00 · 45 scenes · looping
**Tags** `technology` `saas` `data-viz` `infrastructure` `dark` `instrument` `enterprise` `premium`

## Description

A precision-instrument film for a technical product. The world is a measured
one: a parallax coordinate grid, HUD corner brackets, monospaced-feeling readouts
and luminous data visualisation. Everything on screen behaves like an instrument
panel — sparklines draw, gauges sweep, pipelines fill, graphs resolve node by
node. Sophisticated and quiet rather than cyberpunk.

## Recommended use cases

Infrastructure, observability and developer tools · enterprise SaaS and data
platforms · security and compliance products · AI infrastructure · any long-form
narrated explainer where charts and interface carry the argument.

## Design brief

- **Layout system** — an instrument bezel: 150px inset, HUD brackets at the
  corners, content in panels bordered 1px against a dark ground. Charts and
  screenshots get the width; type sits left or beneath.
- **Shape language** — thin and rectilinear: 8–14px radii, 1px borders, hairline
  axes, small dots. Circles appear only as gauge arcs, nodes and status lamps.
- **Typography** — Figtree 700 at 0.3em tracking is the readout voice (labels,
  statuses, section marks); tabular figures carry every number; Caprasimo is
  reserved for statements, chapter titles and the wordmark, which keeps the film
  warm rather than generic.
- **Palette** — near-black warm ground, panel and edge greys, amber accent used
  as a *glow* (box-shadow and text-shadow, not just fill), luminous sage second
  accent for healthy states.

## Animation description

| Layer | Behaviour |
| --- | --- |
| Transitions | Five owned wipes: `scan` (panel with a glowing scan line), `cells` (72 grid cells extinguishing), `shear` (skewed diagonal), `depth` (three layers rushing forward), `aperture` (top/bottom slits closing) |
| Cameras | `dolly` (perspective Z push), `orbit` (rotateY), `glide`, `rack` (blur-to-focus), `liftHUD`, `hold` |
| Signature | `Grid` parallax coordinate field, `Brackets` HUD corners, `Readout` label/value pairs, `Spark` drawing sparklines, `Gauge` sweeping arcs, `Panel` bordered surfaces |
| Data | Live throughput, an anomaly spike with a correlated badge, a five-stage pipeline, three gauges, before/after alert volume, a service-health list, region pulses |
| Screens | `BrowserSlot` chrome for product screenshots; a terminal panel types a command |
| Pacing | Choreography at 12× scene length; charts and gauges continue drawing under the readouts |

## Asset placeholders

| id | Size | Purpose |
| --- | --- | --- |
| `sg-mark` | 26² | Brand mark in the HUD chrome |
| `sg-logo` / `sg-logo-cta` | 130² / 120² rounded | Logo, open and close |
| `sg-ui-1` | 860 × 520 browser | Product screenshot with URL chrome |
| `sg-ui-2` | 860 × 560 | Product screenshot, plain frame |
| `sg-console` | 1440 × 640 browser | Wide console screenshot |
| `sg-eng` | 480 × 600 | Engineer portrait |
| `sg-founder` | 520 × 640 | Founder portrait |
| `sg-team-0…4` | 260 × 300 | Team cards |

Screenshots are the dominant asset type here — the two `BrowserSlot` mounts and
the console are sized so real UI stays legible at 1080p.

## Text placeholders

- **Statement** — `STMT()` Caprasimo 64–140px (Hook, Turn, Free, CTA, section titles)
- **Section number / title / deck** — `Chapter`, five beats
- **Readout label / value** — `READ()` 15–28px at 0.3em over `NUM()` values
- **Number** — `NUM()` 30–360px tabular (stats, MTTR, counters, gauges)
- **Body** — `BODY()` 30–44px at 1.5, 640–900px measure
- **Quote + attribution** — 72–94px with a 20px all-caps credit
- **Panel labels** — one short all-caps line per panel
- **CTA** — 110px two-tone statement, 28px button, 20px URL

## Brand colour tokens

```js
window.OM_TWEAKS = { brandName: "SIGNAL", brand: "#e08b4e", brand2: "#9ec27a" };
```

`brand` is used as light: it drives the scan line, every glow (`glow()` wraps it
in a box/text shadow), chart strokes, the pipeline fill, the accent border on
comparison rows, the plan highlight and the CTA button. `brand2` marks healthy
states (availability, service lamps, compliance tiles, region pulses). The dark
ground, panel greys and grid stay fixed, so an injected brand colour changes the
film's light without changing its instrument identity.

## Files

- `Signal.dc.html` — page: fonts, scene list, playback, brand tokens
- `signal-film.jsx` — palette, transitions, cameras, instrument furniture, 45 scenes
- shared: `../../kit/film-kit.js`, `../../animations-v3.jsx`, `../../image-slot.js`
