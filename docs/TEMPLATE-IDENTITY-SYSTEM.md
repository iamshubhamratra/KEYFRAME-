# Template Identity Preservation System

**Date:** 2026-07-15 · **Status:** Phase 1 implemented + verified · **Gates:** `npm run audit:identity`, `npm run check:packs`

## 1. The problem

Users select a template expecting its visual style, motion language, layout system and creative direction — and many finished videos looked similar regardless of the selection. Baseline measurement (same storyboard built through every scene-kit pack, structural-token similarity):

| Metric | Before (2026-07-15 am) | After Phase 1 |
| --- | --- | --- |
| Avg pairwise structural similarity (41 packs) | **77.9%** | **50.1%** |
| Pairs ≥ 93% similar | **45** | **0** |
| Identical pairs (differ only in hex/copy) | 2 (cartesian~coral, ledger-noir~mono-corporate at 100%) | 0 |
| Manifest values silently dropped by scene_kit | 7 (6 packs) | 0 |
| Worst remaining pair | — | longshot-cinema ~ vapor-chrome 87.8% |

## 2. Where identity lives (architecture)

```
pack.json (manifest, ONE source of truth)   FRAME.md (prose design system)
        │                                          │
        ▼                                          ▼
  deriveTheme() ─────────► scene_kit.buildComposition   (default path, ~41 packs)
        │                     ├─ textfx (enter/emphasis/case/align)
        │                     ├─ theme.layout switches (kicker/underline/propFill/stat/assetStyle)
        │                     ├─ motionFor → cut grammar + drift
        │                     ├─ buildCanvasFx (12 painter modes) + buildThreeFx
        │                     ├─ buildSkinOrnaments (bespoke per pack ×41)
        │                     └─ buildCaptions (theme-derived chrome)
        ├────────► PACK_RENDERERS (pack.json "renderer") → dedicated composers ×5
        ├────────► LLM remix path (opt-in) → FRAME.md in prompt + identityGate
        └────────► render3d → flagship/brightlife (pack accents lead)
```

**The rule:** identity enters ONLY through the manifest + FRAME.md; every render path must either consume it deterministically (scene-kit, dedicated renderers) or be verified against it after the fact (LLM remix → identityGate).

## 3. Audit findings and fixes (Phase 1, all verified)

### 3.1 Routing erasers — the pack never reached the renderer faithfully

| # | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| R1 | `/api/generate` ignored the user's explicit pick: with default `USE_LLM_COMPOSER=on`, every job — pinned or not — went to the drifting LLM composer. `frame_pack_user` was read nowhere on this route (graph.js had the pin; runJob didn't). | `pipeline.js` (runJob remix decision) vs `graph.js:602-610` | runJob now reads `db.getRaw(jobId).frame_pack_user` and forces the deterministic composer for explicit picks — same `packPinned` rule as the graph. |
| R2 | Remix path had **zero** identity enforcement: FRAME.md + palette law go into the prompt, but lint/runtime/inspect/contrast never check palette or fonts. | `composer.js:316-558`, `pipeline.js gateComposition` | New **identityGate** (deterministic, no browser): every saturated hex must sit within 40° hue of a pack token (lighten/darken passes; foreign hues don't) + one declared pack font must appear. `IDENTITY_GATE=off/warn/repair`, default warn (same latency rationale as `CONTRAST_GATE`). Violations feed the existing repair-lap machinery. Unit-verified. |
| R3 | `render3d` + any light pack → ONE fixed indigo/violet world (`brightlife_composer` hardcoded its palette; pack colors discarded entirely). | `brightlife_composer.js brightTheme` | brightTheme now leads with the pack's own accents (incl. the emphasis-word gradient) when a non-brightlife pack routes in; the house palette remains for the brightlife pack itself / accent-poor packs. |
| R4 | "Auto" traffic converged on one pack: an unresolvable brief suggestion always fell back to `defaultPack()` (= blockframe). | `brief.js:112`, `config.json:112` | Rotation-aware fallback: deterministic pick from installed packs excluding `recentFramePacks`, seeded by prompt. |
| R5 | Graph-path storyboards were pack-blind (`generateStoryboard` called without `framePack`), losing the per-scene archetype/motif bias the pack is supposed to exert. | `graph.js:120` vs `storyboard.js:33-40` | framePack now passed (frame_selector runs before storyboard in the graph). |

### 3.2 Contract erasers — declared identity silently dropped

| # | Finding | Fix |
| --- | --- | --- |
| C1 | **Six packs declared cut styles that didn't exist** (`cut:"cut"` ×5, `"fade"` ×1) → all silently fell to the default glow crossfade AND got no scene-entrance branch. Nothing validated manifest values against implementations. | Implemented both grammars in `buildCutLayer` + `sceneMotion`: **"cut"** = ink-shutter hard cut (~0.2 s square blink, 0.22 s hard arrival, hold exit — print grammar); **"fade"** = pure opacity dissolve (no overlay; the only cut whose scenes cross on opacity). |
| C2 | `fx.canvas:"none"` (bold-poster, broadside — deliberate still-page identity) fell through to the bokeh painter. | `buildCanvasFx` honors `"none"` (returns null; callers guard). |
| C3 | No contract validation existed, so C1/C2 were invisible. | scene_kit now **exports the implemented sets** (`CUT_STYLES`, `TEXT_ENTERS`, `EMPHASIS_STYLES`, `CANVAS_MODES`); `audit-identity.js` §B0 fails (exit 1, no flag needed) on any manifest value outside them. Extend the set in the same change that implements a new style. |

### 3.3 Shared-chassis erasers — furniture identical across packs

| # | Finding | Fix |
| --- | --- | --- |
| S1 | **15 packs shared the generic corner-bracket ornament fallback** (bold-poster, broadside, capsule, care-lavender, care-mint, cartesian, cobalt-grid, coral, creative-mode, flux-analytics, ledger-noir, mint-launch, nimbus-saas, signal-mono, vault-gold) — the audit's entire look-alike tail, incl. both 100% twins. Worse: poster packs opted OUT of shared furniture (`layout` switches) without getting anything back → 12 KB near-empty comps vs 39-62 KB for ornamented packs. | New `scene_kit_editorial_ornaments.js`: a bespoke, DNA-true motif family per pack (folio numerals, masthead+column rules, capsule pills, petal arcs, heartbeat pulse, plotted axes, grid crosshairs+cell sweep, halftone dot matrix, washi tape+marker scribble, sparkline+candles, gold ledger rules, trajectory arc, panel echoes+status dots, equalizer+scanline, vault tick-dial+filigree). All 15 lint-clean (0 errors); coral + vault-gold render-verified frame-by-frame. |
| S2 | Caption cards were globally styled: one near-black pill, white text, every pack. | `buildCaptions` now derives chrome from the theme: flat packs = paper chip (solid ground, ink border, accent offset-shadow); dark = ground-tinted glass + accent hairline; light = white glass + ink hairline. |
| S3 | Ink was force-flattened: every dark pack got `#FFFFFF`, every light pack `#14130E` (`deriveTheme`). | Manifest `surface.ink` (new schema field) is honored when it clears a hard legibility bar (|lum Δ| ≥ 105 vs ground); else the max-contrast fallback stands. |

### 3.4 Known-good (no action needed)

- `enrich.js`'s vector/motion floor does NOT homogenize scene-kit packs — every scene-kit comp carries `id="kffx"` so the `richFx` guard skips it; it only decorates bare LLM comps. (Flat packs on the LLM path could still get gradient enrichment — see Phase 2.)
- Dedicated-renderer packs (flagship, brightlife, blueprint-atelier, bloom-fable, bauhaus-riot) are identity-total by construction.
- Explicit picks on the graph path were already pinned to scene-kit (`packPinned`).

## 4. The enforcement system (what keeps this fixed)

Three independent gates, all deterministic:

1. **`npm run check:packs`** (`check-pack-identity.js`, existing) — per-pack floor: authored ground renders, display face renders, enrich passthrough, non-empty comp. *Guards each pack against the pipeline.*
2. **`npm run audit:identity`** (`audit-identity.js`, new) — cross-pack divergence: §A declared-identity matrix + coverage; §B0 manifest-vs-implemented contract validation (**always fatal**); §B identical-fingerprint clusters (**always fatal**); §C structural similarity of built comps (top pairs + per-pack distinctiveness; `--strict` fails pairs ≥ `IDENTITY_MAX_SIM`, default 0.93). *Guards packs against each other.*
3. **identityGate** (in-pipeline, LLM remix only) — palette-hue + pack-font conformance on the composed HTML, feeding repair laps. *Guards the one path that can freestyle.*

CI recommendation: `check:packs && audit:identity --strict` on every PR that touches `frames/`, `scene_kit*`, `frame_manifest`, `enrich`, or a composer.

## 5. Roadmap (not yet implemented)

- **Phase 2 — remaining look-alike tail:** longshot-cinema~vapor-chrome (87.8%), ledger-noir~mono-corporate (87.2%) — both have bespoke ornaments but share entrance/fx families; differentiate via textfx/canvas reassignment or richer ornament beats. Flat-pack guard for enrich on the LLM path.
- **Phase 3 — timing personas:** easings/staggers/durations are global literals; add a per-pack `motion.ease` persona (mechanical / organic / snappy / stately) consumed by `textIn` + archetypes.
- **Phase 4 — layout coverage:** only 12/41 packs author `layout`; 15 packs still share the full default `kupsd` skeleton (kicker+underline+propFill+hero-stat). Author per-pack layout + a second `assetStyle` (e.g. "chrome"/"matte") so montage/screenshot furniture forks by pack family.
- **Phase 5 — identity QA on `/api/generate`:** the QA vision agent (`packIdentityExpectations`) runs only on the graph path; wire a lightweight variant into runJob. Stale-pack explicit picks (graph.js:106-108) should surface a warning instead of silently swapping.
- **Phase 6 — pixel-level gate:** screenshot 2 timestamps per pack via the contrast_check puppeteer harness; hue-histogram + edge-density divergence as a render-truth complement to the structural tokens.

## 6. Baseline artifacts

- Before/after audit JSON: scratchpad `identity-before.json` / `identity-after.json` (per-pack rows, all pairs).
- Render proofs: `server/jobs/_id_coral/renders/out.mp4`, `server/jobs/_id_vault-gold/renders/out.mp4` (+ built comps for signal-mono, care-mint, cartesian, broadside in `server/jobs/_id_*`).
