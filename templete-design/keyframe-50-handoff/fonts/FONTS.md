# FONTS

**No render-time fetching.** The design-side wrappers in `templates/` load Google
Fonts by `<link>` — correct for review, **wrong for the renderer**. Replace each
`<link>` with the self-hosted `@fontsource` faces before integrating.

## No new packages are required

All 50 display faces, all body faces and IBM Plex Mono / Space Mono are already
marked `"status": "bundled"` in `src/fonts/_film_font_plan.json`. That inventory
was checked against the plan before any pack was designed — the font plan was
built *from* the bundled set precisely so this step would be a swap, not a
procurement.

## Per-pack pairing, weights, licence, fallback

See each `manifests/<slug>.pack.json` → `fonts`:

```json
"fonts": {
  "display": "Space Grotesk",
  "body": "IBM Plex Sans",
  "mono": "IBM Plex Mono",
  "scaleRatio": 1.25,
  "bundled": true,
  "fallback": { "devanagari": "Noto Sans Devanagari" }
}
```

**Weights used:** display 500–700, body 400/600/700, mono 400/600. Nothing else
is referenced, so subsetting to those weights is safe.

**Licence:** every family is SIL OFL or Apache 2.0 — embedding and commercial use
permitted. No family in this set requires clearance.

## CSS fallback stacks

| Role | Stack |
|---|---|
| Display (sans packs) | `"<Family>", "Helvetica Neue", system-ui, sans-serif` |
| Display (serif packs) | `"<Family>", Georgia, "Times New Roman", serif` |
| Body (sans) | `"<Family>", system-ui, -apple-system, sans-serif` |
| Body (serif) | `"<Family>", Georgia, serif` |
| Mono | `"IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace` |

## Non-Latin fallback

Per pack, declared in the manifest:

- **Noto Serif Devanagari** — the 22 packs whose display face is a serif or slab.
- **Noto Sans Devanagari** — the other 28 (sans, mono, script, display).

Both need bundling; they are the only two additions in the whole set. All text is
DOM/SVG — there is no canvas or WebGL text anywhere — so a Devanagari string
reflows rather than breaking.
