# 10 — Workspace

**Category** Software / SaaS product demo
**Orientation** 16:9 · 1920 × 1080
**Runtime** 5:00 · 40 scenes · looping
**Tags** `saas` `productivity` `product-demo` `ui` `screenshots` `light` `developer-tools` `app`

## Description

A product-demo film set on a real desktop. Window chrome opens, stacks and tiles;
a cursor drives the demos; panes split and swap; a command palette accepts typed
queries; toasts stack in the corner; keycaps depress. It is the lightest template
in the collection and the most screenshot-led — built so a real product's UI is
the hero rather than an accent.

Distinct from templates 05 and 09, which are dark instrument and latent-space
worlds: this one is a bright, restrained screen recording.

## Recommended use cases

SaaS and productivity products · apps and developer tools · AI products with an
interface · onboarding and feature-launch films · anything whose proof is the
product working on screen.

## Design brief

- **Layout system** — a desktop. Windows are the primary container (title bar,
  traffic lights, body); content scenes use a 140–150px gutter with either one
  centred window or a copy/screenshot split.
- **Shape language** — soft-rectangular UI: 8–14px radii on windows and panels,
  999px only on chips. Everything sits on 1px `line` borders rather than shadows
  alone.
- **Typography** — Figtree 600/700 as the interface voice (UI labels, rows, tabs,
  toasts, shortcuts) with tabular figures; Caprasimo for statements and chapter
  titles, which keeps it from reading as a generic product page.
- **Palette** — the only light-ground template: bone and desk greys, white window
  bodies, near-black ink for the dark plan card and CLI panel, clay accent and
  sage second accent.

## Animation description

| Layer | Behaviour |
| --- | --- |
| Transitions | Five owned wipes: `pane` (three panes sliding alternately), `sheet` (a rounded sheet dropping from the top), `tile` (six desktop tiles scaling), `minimise` (collapse toward the dock), `fade` |
| Cameras | `lift`, `zoomUI`, `nudgeL`, `nudgeR`, `still`, `settle` — the most restrained set in the collection, like a screen recording |
| Signature | `Win` — window chrome with active/inactive states; `Palette` — command bar with typed query and results; `Tabs`; `Rows` — list views; `Toast` — stacking notifications; `Keycaps`; `Cursor` |
| Interaction | The cursor travels and clicks to open the command palette; keycaps depress on ⌘K; toasts arrive in sequence |
| Data | Context-switch figure, stack audit, tool-count before/after, six-week adoption, import progress, audit log, permissions, retired-tool chips |
| Screens | `BrowserSlot` (dark screen fill so the drop prompt reads), `LaptopSlot`, plus in-window `Fill` slots and three phone slots |
| Pacing | Choreography at 12× scene length; palette results, import bars and toasts read raw scene progress so they play out across the beat |

## Asset placeholders

| id | Size | Purpose |
| --- | --- | --- |
| `ws-mark` | 26² | Brand mark in the chrome |
| `ws-logo` / `ws-logo-cta` | 124² / 116² rounded | Logo, open and close |
| `ws-stack-0…3` | 900 × 420 in-window | Stacked window screenshots |
| `ws-split-1` / `ws-split-2` | 740 × 520 in-window | Split-pane screenshots |
| `ws-ui-1` | 860 × 500 browser | Feature screenshot with URL chrome |
| `ws-ui-2` | 880 × 520 | Feature screenshot, plain frame |
| `ws-laptop` | 1180 wide | Laptop shell screenshot |
| `ws-mob-0…2` | 340 × 600–680 | Phone screenshots |
| `ws-team-0…4` | 260 × 300 | Team cards |
| `ws-eng` | 500 × 620 | Operations portrait |
| `ws-founder` | 520 × 640 | Founder portrait |

Fourteen screenshot-capable slots — the highest count in the collection, since
this template exists to show a product.

## Text placeholders

- **Statement** — `SET()` Caprasimo 70–150px (Hook, Turn, Free, CTA, chapter titles)
- **Headline** — `HEAD()` 78–88px (feature titles, data scenes)
- **Chapter label / title / deck** — `Chapter`, four chapters
- **UI text** — `UI()` 19–34px semibold (tabs, rows, window titles, toasts, palette)
- **Number** — `NUM()` 30–320px tabular
- **Body** — `BODY()` 30–44px at 1.5
- **Label** — `CAPS()` 16–22px at 0.16em
- **CTA** — 102px statement, 22px button, 18px URL

## Brand colour tokens

```js
window.OM_TWEAKS = { brandName: "WORKSPACE", brand: "#c1663a", brand2: "#6d8a5c" };
```

`brand` drives the active tab indicator, palette highlight, cursor, primary
button, key badges, accent-ground scenes and the comparison outline; `brand2`
marks success states (deploys, permissions, offline, adoption). The light desk
grounds, white window bodies and 1px line colour are fixed, so an injected brand
colour re-tints the interface without breaking the desktop metaphor.

## Files

- `Workspace.dc.html` — page: fonts, scene list, playback, brand tokens
- `workspace-film.jsx` — palette, transitions, cameras, desktop furniture, 40 scenes
- shared: `../../kit/film-kit.js`, `../../animations-v3.jsx`, `../../image-slot.js`
