# Flagship 2.0 — Bright Product-Showcase Redesign

> Complete audit + redesign of the Flagship video template, from a dark-cinematic
> Three.js film into a **bright, luminous, product-showcase** launch film in the Apple
> keynote / Linear / Stripe / Vercel / Framer / Raycast register. Implemented in
> `server/src/services/flagship_composer.js` (v3) + `frames/flagship/pack.json`.
> Positioning chosen with the user: **product/screenshot-showcase cinematic**, distinct
> from `brightlife` (which owns the abstract graphical-motion niche).

---

## 1. Audit of the previous flagship (v2, dark)

| Area | Finding (grounded in code) |
|---|---|
| Background | Dark by construction — ground `#07080F`, `FogExp2`, indigo aurora shader, dark `GridHelper`. Everything downstream (bloom, glass, contrast) depended on the near-black stage. |
| Bloom | **Selective `UnrealBloomPass`** (strength 0.9) via a 2-composer darken/restore trick — only meaningful *because* the ground is black. Costly (two render targets/frame). |
| Typography | Slate-on-dark; heavy dark text-shadows; emphasis gradient *lightened toward white* (only works on dark). Readable but muddy in places. |
| Screenshots | Existed as **dark glass plates** (`makePlate`), modest size, competing with bloom/particles for attention. Generated dark UI fallback (`uiTexture`). |
| Three.js | `aurora + grid + 200 bokeh + light-streaks` — ambient **decoration**, disconnected from the product story. |
| Camera | Real dolly/parallax/orbit rig, but gentle; low motion density between beats. |
| Net | A competent *dark SaaS demo*, not a bright premium launch experience. |

**Verdict:** the darkness was structural, not a color tweak — bright required removing bloom and rebuilding glow/lift from shadows + matte gradients (the lesson proven on the `brightlife` redesign).

---

## 2. New design system (Flagship 2.0)

### Color
| Token | Value | Use |
|---|---|---|
| ground | `#FFFFFF` | stage |
| ground-2 | `#FAFBFF` | panels/secondary |
| surface | `#F5F7FF` | luminous edge-vignette |
| ink | `#0F172A` | headlines |
| body | `#475569` | subtext |
| dim | `#64748B` | supporting/chrome |
| hair | `#E2E8F0` | borders/dividers |
| accents | `#6366F1` indigo · `#06B6D4` cyan · `#8B5CF6` violet · `#10B981` emerald | graphics/data-viz |

**Contrast law:** accent **text** is auto-darkened until it clears a luminance ceiling on white (`ensureReadableOnLight`), so emphasis never blends into the stage. Emphasis headline words use a saturated `indigo→violet` gradient fill (both stops dark enough to read on white). Graphics keep the raw saturated accents.

### Typography
**Reality check:** the brief's Clash Display / Cabinet Grotesk / General Sans / Satoshi / Plus Jakarta Sans are **not bundled**, can't load in the offline headless renderer, and *naming* them in CSS fails the `font_family_without_font_face` lint gate. So type becomes a "visual element" through **weight/scale/tracking/gradient** on the bundled faces: **Space Grotesk** display (700/800), **Inter** body, **JetBrains Mono** chrome. Hero headlines up to ~150px @720p, `-0.03em` tracking, an editorial wallpaper numeral behind interior scenes.

### Motion layers (every scene)
1. **Hero** — the product panel (screenshot / bright UI) reveal + parallax bob.
2. **Supporting** — the growth graph-line drawing on + pulsing data dots; kinetic headline reveal.
3. **Ambient** — soft orb sprites drifting; feature-panel counter-parallax.
4. **Background** — the mesh-gradient environment drifting + data-waves flowing + camera always in motion (handheld micro-motion guarantees nothing is ever perfectly still).

### Three.js architecture (purposeful, not decorative)
- **Mesh-gradient environment** — a shader plane starting from white, mixing pastel (white-lifted) accent blobs at low strength + a soft `surface` edge-vignette. Airy, luminous, always drifting.
- **Data-waves** — 3 stacked pastel gradient ribbons (traveling sum-of-sines vertex + flow highlight), upper-back — read as flowing product data.
- **Growth graph-line** — ONE crisp saturated line (`TubeGeometry` + `setDrawRange`) that **rises and draws on during solution/benefits**, with a soft area fill + pulsing data dots. The product's "up-and-to-the-right" — the signature purposeful graphic.
- **Soft orb sprites** — bright radial-gradient glow via `NormalBlending` (you can't add light to white, so glow = sprites + shadows, not bloom).
- **NO bloom / EffectComposer** — a single `renderer.render(scene,cam)` per frame (≈2× faster than v2).

### Screenshot showcase system
The hero. `makePlate` builds a **bright floating dashboard panel**: a soft real drop-shadow sprite (sells the lift on white) → a white **device frame** CanvasTexture (rounded card + light border + header bar with traffic lights + url pill) → the **content** (real screenshot via `TextureLoader`, or a generated **bright** UI: dashboard / donut / kanban / activity / table / bars). Panels are **big** (`w` 6.4 hero / 3.2 feature / 3.8 side) so screenshots occupy ~40–60% of frame, tilt in perspective, and the hero adds a **small floating accent card** in front for layered-screen depth.

---

## 3. Scene-by-scene (6-act grammar)

| Scene | Treatment | Build |
|---|---|---|
| 1 | **hook** | Pure big type over the mesh-gradient; camera dollies in from 13.5→8.4; waves + graph intro carry motion. Capture in <2s. |
| 2 | **problem** | Two small **fragmented** cards (tilted, offset) visualize silos/friction; camera pans across; "scattered" emphasis. |
| 3 | **solution** | **Hero product reveal** — one big bright dashboard panel + floating accent card; camera **dolly-in** (11→6.6) with a focus feel; the graph-line draws on. The memorable moment. |
| 4 | **features** | Three bright feature panels fanned in perspective (donut/kanban/activity); camera **orbits** across the row. |
| 5 | **benefits** | Huge gradient **counter metric** (e.g. `10x`) + a bars panel + the graph-line held at full; camera eases in. |
| 6 | **cta** | Emotional close — brand headline, CTA, camera **pulls back** (5.4→12) as the film resolves. |

## 4. Camera choreography
Per-treatment rig (`cameraFor`): **hook** push-in · **problem** lateral pan · **solution** dolly-in on the hero · **features** orbit-across · **benefits** ease-in · **cta** pull-back — all layered over seeded handheld micro-motion (pure fn of time). `expoOut` on the signature push/pull moves.

## 5. Asset-placement rules
`assignPlates`: solution→1 hero (big) · features→3 (real screenshots first, generated bright UI fills the rest) · benefits→1 side + graph · problem→2 fragments · cta→1 if spare. Real website/curated/vision-approved screenshots rank first; a scene never renders an empty panel (generated bright UI backstops).

## 6. Quality-scoring framework (reject rules, from the brief)
A scene fails if it: reads dark · has low type contrast (< the readable-on-light floor) · shows a static screenshot (panels must reveal + parallax) · has a static beat (the continuous-motion layer must be present) · leaves large empty space (every scene carries hero+supporting+ambient+bg layers) · uses a generic fade-only transition · reads like a slide. The composer is built so these are structurally satisfied.

---

## 7. Engineering / determinism
Same envelope (`buildComposition -> {indexHtml, metaJson}`), single paused GSAP timeline on `window.__timelines["vid"]`, `render3d(tl.time())` per frame. Seeded `mulberry32`; every per-frame value a pure fn of time; **build-time values inject via `${...}` only** (never `"+var+"`, which ships a literal and blanks the render). QA/repair is skipped for it (native deterministic composer, per `graph.js`).

**Verified 2026-07-15:** 1280×720 draft, **0 lint errors** (only the benign `studio_missing_editable_id` / `gsap_studio_edit_blocked` / `composition_file_too_large` warnings). Renders ~32s (12s film) / ~56s (18s film). Contact sheets confirm: bright airy stage, slate type popping on white with violet gradient emphasis, big bright dashboard panels (generated UI **and** verified real-screenshot loading), fragmented-card problem scene, perspective feature fan, `10x` counter, pull-back CTA. No dark, no voids.

## 8. Roadmap (further polish)
- **P1** — make the growth graph-line more prominent during solution/benefits (thicker/brighter draw-on); add a subtle animated cursor/tooltip on the hero panel.
- **P1** — per-scene mesh-gradient tint (cooler on problem, warmer on cta) for emotional pacing.
- **P2** — device-mockup variants (phone frame for portrait screenshots; laptop lid for hero).
- **P2** — a light-sweep specular pass across panels on reveal (bright equivalent of a shine).
- **P3** — data-driven graph-line (derive the curve from the scene's real metric when present).

*Generated 2026-07-15 on branch `Rohit`. Implementation: `flagship_composer.js` v3 + `frames/flagship/pack.json`.*
