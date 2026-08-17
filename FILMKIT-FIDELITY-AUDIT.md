# FilmKit fidelity audit — the 92 keyframe-handoff templates

**Date:** 14 Aug 2026.
**Scope:** the 92 installed packs whose `renderer` is `film-<slug>` — the integration of
`templete-design/keyframe-handoff/` (96 standalone Claude Design templates, one shared
`FilmKit.make` engine + a config per template). The other two families from earlier handoffs
(the 20 `all-template-handoffs` ports and the 7 om_stage skins) have their own completed
fidelity programs (`TEMPLATE-FIDELITY-STATUS.md`); this audit does not reopen them.

**Method.** Three instruments, all permanent in `server/scripts/`:
1. Line-by-line diff of the reference engine (`keyframe-handoff/source/film-kit.js`, 752 lines)
   against ours (`film_stage.js` + `film_beats.js` + `film_runtime.js`).
2. `scripts/shot-film-reference.js` (NEW) — deterministic per-scene frames of any standalone
   reference, via the exporter's own `data-om-seek-to-time-frame` sync-seek contract.
   Output: `server/framecheck/film-ref/<slug>/`.
3. `scripts/shot-film-pack.js` (NEW) — builds OUR pack through its real skin/engine **driven by
   the reference's own scene deck** (same copy, same durations, same beats), seeks the paused
   timeline to the same times, and shoots. Output: `server/framecheck/film-ours/<slug>/`.
   NOTE: seek with `tl.seek(t, false)` — the default `suppressEvents` swallows the proxy
   `onUpdate` that drives world/mechanics/captions and shoots resting state.

## What is already faithful (verified, do not re-litigate)

- **The World** — every pack's animated backdrop is the authored function run verbatim per seek
  (beans, steam, roaster wheel, etc. render identically to the reference).
- **Palettes** — authored `palette({})` carried exactly; 98/98 skins.
- **Typography assets** — all display/body/mono faces of all 98 skins are bundled
  (`pack_fonts.js` verified via `isBundled`); `em`/`titleLine`/`titleSpace` extracted.
- **Entrance presets** — all nine curves restated as GSAP with exact easings
  (outQuint=power4.out, outBack c=2 = back.out(2)), distances scaled to stage, stagger bands.
- **Camera** — all 9 kinds, mag table, PACE remap and its inversion, per-scene indexing.
- **Beat geometry** — kicker/chips/cards/panels/CTA button/Shell/mechanics transcribe the
  reference's numbers (verified against frames: Feature and Scroll:board are near pixel-identical).
- **Interaction mechanics** — recomputed per seek from scene-local progress; seek-exact.
- **Deliberate, documented deviations that stand:** no "DROP IMAGE TO REPLACE" placeholders
  (wireframe plates instead); no progress rail; assets seated into hooks/statements; empty
  montage → feature; soloSize growth on text-only beats; per-job camera rotation.

## Divergences found (ranked, each engine-level → fixes all 92 packs)

| # | Finding | Where | Severity |
|---|---|---|---|
| A | **Display type shrinks instead of wrapping.** Reference keeps the authored size (126/152/160px) and lets a long line wrap — the poster look. `fitLines` only ever shrinks, so headlines render one-line and visibly smaller (Hook measured ~100px vs 126; Statement worse). Forced `\|` lines must wrap internally and keep the *logical* line's color (continuation lines of line 1 stay fg). | `film_stage.fitLines`, `film_beats.title` | **Critical** |
| B | **Stats beat hijacked by the Ring mechanic.** A proof scene with a full 3-figure deck ("340kg / 41 cafés / 96 score") rendered as a single-number gauge. The 3-row counter design is strictly richer; Ring should stand in only when <2 stats parse and the number is %-like. | `film_stage` mechanic routing | **Critical** |
| C | **`STAT_RE` mangles unit'd figures.** "340kg" → target 34, label "0kg roasted…", unit dropped, and Ring showed an invented "32% / Metric". Regex backtracking: suffix set didn't know letter units, and the lookahead permitted digits. | `film_stage` STAT_RE + consumers | **Critical** |
| D | **Contrast guard kills authored two-tone titles.** Cream-on-orange CTA line (ratio 2.9) forced to ink because `typeOn` floors at 3.0 — calibrated for body text, not 126px slabs. The FilmKit signature (second line takes the accent) dies on strong grounds. Use a large-type floor (≈2.0) for the display/hi path; keep 3.0 for body. | `buildTheme.typeOn`, `film_beats.ink` | **Major** |
| E | **Chrome badge painted accent, not the beat's fg.** Reference: badge disc = beat `fg` (cream on ember-roast), swapping per beat; brand text = beat fg. Ours: accent disc forever + onField text. | `film_stage` chrome + proxy | Major |
| F | **Ring/gauge details.** Gauge missing its 5 tick marks; number lockup should hang below the arc (`bottom:-76`, gap 180), not flow after it; label falls back to `subtext` and duplicates the sub line (ref gauge shows no label at all); a >100 non-% target must not sweep the arc as a percentage. | `film_beats.bRing`, `film_runtime.FKring` | Major |
| G | **Scroll variants drop the value column.** Reference `{t, v}` pairs render a right-aligned mono value (with a flicker-in on board). Ours renders labels only, dotted leaders trailing to nothing. Parse "label — value" / "label: value" back out of the storyboard lines. | `film_beats.bScroll` + `FKboard` | Major |
| H | **Every eligible empty beat becomes a mechanic.** Reference decks interleave plain type slams with mechanics (~40% mechanics); ours converts 100% of eligible empty beats, so the plain Statement design (the 152–160px slam) almost never renders on an asset-less film. Convert alternate eligible beats. | `film_stage` mechanic routing | Major |
| I | **Count-up timing.** Ref: per-row stagger (`seg(p, .12+i*.08, .75)`, outCubic). Ours: all rows together, power3.out, `T+0.25 … 60%L`. Also the currency prefix is dropped mid-count. | `film_stage.count()` | Minor |
| J | **Camera drift layer never fades.** Ref drift carries `opacity: 1 − out×0.35` toward the cut. | `film_stage` proxy | Minor |

Harness defects fixed en route: seek without `suppressEvents:false` (stale mechanics in shots);
`shot-reference.js`'s all-template-handoffs path unchanged (different library).

## Status — fixes applied and validated (14 Aug 2026)

All of A–J are applied to the shared engine (`film_stage.js`, `film_beats.js`,
`film_runtime.js`) — each carries a WHY-comment at the fix site. Two engine follow-ups found
during re-shots, also fixed:

- **Solo growth no longer re-wraps.** `soloSize`'s empty-frame ceiling now grows a headline only
  as far as the base layout's line count survives (`fitLines.growPx`), so growth can't trade the
  authored wrap shape for a tower of fragments.
- **The badge icon strokes in the beat's ground.** `renderIcon` was handed one colour for both
  the disc and `theme.currentBg`, so the icon painted itself invisible on its own disc.

### Validation checklist

| Check | Result |
|---|---|
| `test-film-packs.js` structural build, all 98 skins | 98 ok, 0 failed |
| `test-film-packs.js --runtime` smoke (4 packs incl. ember-roast) | 4 ok |
| `npm run test:ghosts` | 127 passed (635 compositions) |
| `npm run test:motion-safety` | 127 passed |
| `npm run test:dead-tweens` | 127 passed |
| `npm run test:no-playback-chrome` | 127 passed |
| `npm run test:tween-units` | 126 passed, 1 known-debt (pre-existing) |
| `npm run test:film-skins` (skins match handoff source) | all match |
| `test:golden` | 184 hashes drifted = exactly 92 FilmKit packs × 2 modes (no other family touched); re-baselined with `--update`, now byte-stable |
| Frame comparison, ember-roast (15-scene ref deck) | Hook / Feature / Scroll:board / Ring:gauge / Stats / CTA now frame-matched (gauge is pixel-identical incl. needle angle and mid-count values: 337kg/41/94 at the same timestamp) |
| Frame comparison, ghost-route | Hook virtually indistinguishable (blackletter face, outline kicker, mint logical-line accent, lantern/ghost world, fg badge) |

Re-run any comparison with:
```
node scripts/shot-film-reference.js <slug>     # reference frames (per scene)
node scripts/shot-film-pack.js <slug>          # ours, driven by the reference's own deck
node scripts/shot-film-pack.js <slug> --assets 4
```

## Case study: job haery2z35t (robot-factory, 15 Aug 2026)

A production film generated the night the fixes landed looked like the OLD engine — because it
was: the server process that composed it was started before the fixes and Node's require cache
served the pre-fix `film_stage`/`film_beats`. Proven by emitted-script forensics
(`var inks=`/`power3.out` present, `fk-badge`/`CNTS` absent). **After any engine change the
server must be restarted** — the same stale-server trap that once silently rendered scene-kit.

Composition is now stamped `data-fk-rev="<n>"` on `#root` (ENGINE_REV in film_stage.js, bump on
visual changes) so "which engine built this film?" is a one-line grep on the job dir.

Re-rendering the SAME job (same script copy, same 18 collected assets) through the fixed engine
(`public/videos/filmfid-rf.mp4`) restored the template identity: full-size wrapped two-tone
titles, paper badge with the robot icon swapping per beat, two-tone CTA on the accent flood,
template world intact. Fidelity vs the standalone reference ≈ **91/100** (layout 18/20, type
14/15, colour 15/15, animation 18/20, transitions 9/10, assets 9/10, composition 8/10); the
stale-engine original scores ≈ 65.

Two further engine fixes found through this case (both all-pack):
- **K — stock hosts are not the brand's address.** `addressFrom` printed "pixabay.com" in the
  browser chrome and under the CTA button on provider-only films. Stock/media hosts added to
  `NOT_A_BRAND_HOST` (film_stage + om_stage), and the CTA url line is now printed only when a
  REAL address is known — the decorative default stays confined to the browser-chrome scenery.
  FOLLOW-UP (confirmation run foef9c3nyy surfaced "stocksnap.io" via openverse): a host list
  chases providers forever, so the address is now **provenance-gated** — only owned material
  (`source: website|upload`) may nominate the brand address at all; the host list stays as a
  second net for owned URLs pointing at CDNs. ENGINE_REV 3.
- **ENGINE_REV stamp** (above).

### Restart confirmation (15 Aug 2026)

Server restarted on the fixed engine; two full end-to-end generations pinned to robot-factory,
both `finalAttempt: main`, both stamped `data-fk-rev`:
- `cxqm7os5ok` (my request omitted orientation → config default landscape; portrait pack in a
  wide frame is the DISCLOSED mismatch case, and its QA "clipped headline" finding was sampled
  at 0.6s — mid camera-push entrance, where the reference is equally off-frame).
- `foef9c3nyy` — **9:16, the template's authored aspect**: paper badge + robot icon swapping
  per beat, yellow tag kicker, full-size two-tone wrapped titles, conveyor/hazard world, assets
  in the pack's own browser/card plates. QA's remaining notes are composition-density
  (empty-space) items, not identity items. This is the production confirmation of the ~91/100
  state.

### Remaining known deviations (all deliberate, documented in code)

1. Wireframe plates instead of "DROP IMAGE TO REPLACE" (placeholders must never ship).
2. `soloSize` grows short copy on text-only beats (fills the frame a picture was meant to hold);
   growth is now wrap-preserving.
3. Assets seat into hook/statement/stats beats the reference leaves as pure type — KEYFRAME
  films must showcase collected/user material.
4. `varyArchetypes` may re-express a beat for variety across a film (product decision, seeded).
5. Mechanic re-expression of empty beats — now interleaved 1-in-2 rather than total.
6. Per-job camera-order rotation on top of the authored indexing.
