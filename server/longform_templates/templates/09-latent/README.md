# 09 — Latent

**Category** AI / Technology product
**Orientation** 16:9 · 1920 × 1080
**Runtime** 5:00 · 36 scenes · looping
**Tags** `ai` `ml` `explainability` `dark` `generative` `data-viz` `enterprise` `product-launch`

## Description

A generative-computation film for an AI product. The world is a living node
lattice whose edges pulse with activation; embedding clouds reorganise from
scatter into clusters; token and logit streams cross the frame; attention heat
grids fill column by column. Type resolves out of character noise rather than
fading in — the template's most distinctive device. Transitions are
computational: quantise, converge, sample, mask, dither.

Distinct from template 05 (Signal), which is an instrument panel with HUD
brackets and gauges: this one is a latent space — organic, probabilistic, and
built around reorganisation rather than measurement.

## Recommended use cases

AI and ML products · model governance, explainability and evaluation tooling ·
data platforms and vector databases · fintech and healthtech where compliance is
the story · research labs and technical product launches.

## Design brief

- **Layout system** — content floats over the lattice: 150–170px gutters, single
  columns or a copy/panel split. Data lives in 1px-bordered panels; nothing is
  filled heavily.
- **Shape language** — small and circular. 3–12px radii, 9px nodes, 3–5px heat
  cells. The lattice supplies the structure that borders would otherwise carry.
- **Typography** — Figtree 700 at 0.24em is the token/label voice; tabular figures
  carry every metric; Caprasimo delivers statements and section titles, and is the
  face that resolves out of noise.
- **Palette** — cool near-black grounds (`ink`, `bg`, `panel`) with a warm clay
  accent and olive second accent — the warmth is what keeps it from reading as
  generic AI-dark.

## Animation description

| Layer | Behaviour |
| --- | --- |
| Transitions | Five owned wipes: `quantise` (144 cells), `converge` (four concentric rings collapsing), `sample` (12 rows scaling from alternating edges), `maskIn` (centre inset), `dither` (336-cell probabilistic dissolve) |
| Cameras | `traverse` (perspective Z + yaw), `settle`, `resolve` (blur-in), `panR`, `panL`, `float` |
| Signature | `Resolve` — type that resolves character by character out of block noise; `Lattice` — fixed topology, animated edge activation; `Embedding` — scatter-to-cluster reorganisation; `Tokens` — labelled token/logit streams; `Attention` — heat grid |
| Data | Feature contributions (signed, centre-out), latency breakdown, five eval suites, accuracy drift, model lineage, guardrail lamps, counterfactual and auditor query panels |
| Pacing | Choreography at 12× scene length; the lattice pulse and embedding jitter never stop, so held frames stay computational |

The lattice topology and node positions are computed once at module load — only
edge activation and node radius animate — so DOM capture, thumbnails and frame
export stay in budget.

## Asset placeholders

| id | Size | Purpose |
| --- | --- | --- |
| `lt-mark` | 26² circle | Brand mark in the chrome |
| `lt-logo` / `lt-logo-cta` | 124² / 116² circle | Logo, open and close |
| `lt-console` | 1420 × 620 browser | Trace-explorer screenshot |
| `lt-eng` | 500 × 620 | Research-lead portrait |
| `lt-human` | 780 × 620 | Human-in-the-loop image |
| `lt-team-0…4` | 260 × 300 | Team cards |
| `lt-founder` | 520 × 640 | Founder portrait |

## Text placeholders

- **Statement** — `STMT()` Caprasimo 70–140px (Hook, Turn, CTA, section titles)
- **Resolving headline** — `Resolve` (Open, Noise, Turn, Open2, End)
- **Section label / title / deck** — `Chapter`, four sections
- **Token / label** — `TOK()` 14–24px at 0.24em
- **Number** — `NUM()` 26–180px tabular
- **Body** — `BODY()` 28–44px at 1.52
- **Panel labels** — one short all-caps line per panel
- **CTA** — 104px two-tone statement, 24px lit button, 17px URL

## Brand colour tokens

```js
window.OM_TWEAKS = { brandName: "LATENT", brand: "#d5763c", brand2: "#8fa86b" };
```

`brand` drives lattice highlights, positive contributions, drift lines, guardrail
blocks, the plan highlight, glows and the CTA; `brand2` marks healthy states
(passing evals, permitted rules, answered queries) and the second embedding
cluster. The `warm` tone is a derived third cluster colour. Grounds and the
lattice geometry are fixed, so an injected brand colour re-tints the computation
without changing the world.

## Files

- `Latent.dc.html` — page: fonts, scene list, playback, brand tokens
- `latent-film.jsx` — palette, transitions, cameras, computational furniture, 36 scenes
- shared: `../../kit/film-kit.js`, `../../animations-v3.jsx`, `../../image-slot.js`
