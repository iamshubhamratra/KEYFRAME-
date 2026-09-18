# AI Video Edit — Spike results (F0 · S1 · S2 · S3 · S4 · S7)

Recorded **2026-09-14**. These results feed the contract in `RENDER.md`, and the edits they caused are listed at the end
("Contract changes"). S5, S6 and S8 have not been run yet.

## Environment
- **CPU / OS:** Intel Core i5-6200U (2 cores / 4 threads), 11.9 GB RAM, Windows 10 Pro 10.0.18362.
- **Tools:** Node v22.20.0; ffmpeg 8.0 (gyan.dev full build) with libass, libfreetype, libfribidi, libharfbuzz, libvpx, libx264 and libsoxr.
  libass uses the DirectWrite font provider (with GDI).
- **Packages:** `hyperframes` 0.6.120 and `gsap` 3.12.5 (from `server/node_modules`).
- **Timings caveat:** every timing below was measured **under concurrent load**. A test workflow ran alongside the spikes on this
  2-core machine, and two identical no-caption encodes differed by 16.8 vs 19.4 s. Treat the timings as upper-bound estimates, not
  benchmarks (S8 still owns throughput).
- **Where the raw material is:** logs, commands and scripts are in the session scratchpad under `spikes/{f0,s1,s2,s3,S4,S7}/log.md`.
  Reusable scripts: `f0/fontname.cjs` (name-table parser), `f0/build.cjs`, `s2/plan.cjs`, `s2/verify.cjs`, `s3/gen.cjs` (ASS generator),
  `s3/an.cjs` (mask/ΔE2000), `s1/abs_P608_inm1.fcs`, `S4/build_card.cjs`, `S4/gates.cjs`, `S4/block_net.cjs`, `S7/clicks.cjs`,
  `S7/avsync.cjs`, `S7/norm16.cjs`.
- **Repo changes:** the only new repo files are `server/assets/fonts/edit/*` (F0). `server/.env` and `server/config.json` were not read.

| Spike | Question (short) | Verdict |
|---|---|---|
| F0 | Bundled static OFL caption fonts | **pass** |
| S1 | Animated zoom technique; crop w/h cannot animate | **pass** (perspective chosen) |
| S2 | Chunk and concat frame exactness; voice samples = frames × 1600 | **pass** (needs ≥ 6-decimal timestamps) |
| S3 | libass fonts, reflow, pop, blob, scripts, colour, cost | **partial** (passes once Style `Encoding = -1` is used) |
| S4 | HyperFrames alpha card: gates, alpha, offline, time | **partial** (passes once GSAP is loaded as a file and every family has a data-URI `@font-face`) |
| S7 | Voice joins, loudness/TP, A/V offset, VOICE_CLEAN | **partial** (TP ≤ −1 dBTP needs a post-pass; the other checks pass) |

---

## F0 — Bundled caption fonts
**Question.** Download static OFL TTFs into `server/assets/fonts/edit/` together with their licence texts: DM Sans Bold, Archivo Black,
Figtree Bold, Anton, Barlow Condensed Bold, Noto Sans Devanagari Bold, Noto Sans Arabic Bold and Noto Sans JP Bold. Verify the files
are real static TrueType, read each name-table family, and write `LICENSES.md` and `manifest.json`. The total must be ≤ 12 MB.

**Verdict: pass.**

**Sources.** Hosts contacted: raw.githubusercontent.com, fonts.google.com (download/list JSON) and fonts.gstatic.com. In google/fonts,
only Archivo Black, Anton and Barlow Condensed exist as statics; the others are variable-only. The remaining files came from:

| File | Bytes | Source |
|---|---|---|
| DMSans-Bold.ttf | 74,476 | googlefonts/dm-fonts @ d0520ba0 (the commit pinned in METADATA.pb) |
| ArchivoBlack-Regular.ttf | 90,988 | google/fonts |
| Figtree-Bold.ttf | 57,672 | erikdkennedy/figtree @ 032dfa7f (pinned commit) |
| Anton-Regular.ttf | 170,812 | google/fonts |
| BarlowCondensed-Bold.ttf | 109,912 | google/fonts |
| NotoSansDevanagari-Bold.ttf | 183,412 | notofonts.github.io, **unhinted** (the hinted file is 250 KB) |
| NotoSansArabic-Bold.ttf | 141,852 | notofonts.github.io, **unhinted** (the hinted file is 261 KB) |
| NotoSansJP-Bold.ttf | 5,468,188 | Google Fonts TrueType static Bold via fonts.gstatic.com v56 (upstream noto-cjk has only a CFF `.otf`) |

**Checks.**
- **File format:** all 8 files have magic `0x00010000` and no `fvar` table, and each has OFL-1.1 text in its licence file.
- **Family names:** the Windows name ID 1 families are DM Sans, Archivo Black, Figtree, Anton, Barlow Condensed, Noto Sans Devanagari,
  Noto Sans Arabic and Noto Sans JP.
- **Weights:** OS/2 `usWeightClass` is **700** for every file except Archivo Black and Anton, which are **400**.
- **Script coverage (cmap probes):** the Latin fonts cover Latn and JP covers Latn + Jpan. **Noto Sans Devanagari and Noto Sans Arabic
  have digits but no Basic Latin letters and no ASCII punctuation.**
- **Size:** fonts total 6,297,312 B (6.30 MB / 6.01 MiB); the whole directory including licences and manifest is 6,341,954 B.
- **Integrity:** sha256 prefixes are DMSans 6e8da8e9, ArchivoBlack dd9a89a0, Figtree 71a35e2b, Anton a4ba3a92,
  BarlowCondensed e476562e, NotoDeva ff2f76a2, NotoArabic f4cb79f8, NotoJP c5b7b9d6.
- **Shipped files:** `manifest.json` entries are `{file, family (name ID 1), weight (usWeightClass), scripts (ISO 15924), sha256, bytes}`,
  alongside `LICENSES.md` and `OFL-<Family>.txt`.
- **Parser:** `fontname.cjs` has no dependencies and reads the sfnt table directory, Windows name ID 1/4, OS/2 weight/fsSelection and
  cmap format 4/12. It is the reference for `captions/fontname.js`.
- **libass cross-check (S3):** libass's `fontselect:` lines resolve all 8 families by these exact ID-1 names.

---

## S1 — Animated zoom (ZOOM_EMPHASIS)
**Question.** Confirm that crop w/h cannot animate. Compare `perspective` against 2× oversampled `zoompan` for smoothness and fps.
Give exact filter strings for a 1.0→1.12 smoothstep zoom over 0.9 s on a 608×1080 crop scaled to 1080×1920.

**Verdict: pass. Use `perspective`; zoompan is not recommended.**

**Crop w/h (4 s testsrc2 1920×1080).**
- `crop=w='iw/(1+0.2*t/4)'` fails at init with `Error when evaluating the expression ih/(1+0.2*t/4)`, because `t` is NAN at config time.
- With `n` instead of `t`, w/h are evaluated once at n=0. The output stays 1920×1080 for all 120 frames, and PSNR against the source is
  ≥ 55.7 dB on every frame, so the field of view never changes.

**Smoothness.** Test setup: a 40 px / 2 px grid, crop 608×1080 at x=900, 27 frames. 13 line centroids were tracked on output row 960,
with a least-squares scale/translation fit per frame. All variants are monotonic.

| Variant | Max zoom err | Max centre drift | Edge step err max / rms | Accel jitter max / rms | fps (300 fr, 1080p H.264 decode, `-f null`) |
|---|---|---|---|---|---|
| Static crop + lanczos (reference) | — | — | — | — | 253 |
| **P608: crop → perspective(linear) → lanczos scale** (contract order) | 0.135 px | 0.111 px | 0.123 / 0.053 px | 0.18 / 0.086 px | **113** |
| P1080: crop → lanczos scale → perspective | 0.065 px | 0.065 px | 0.104 / 0.035 px | 0.207 / 0.061 px | 47 |
| Z2x: `scale=2*iw:-2` + zoompan | 0.416 px | 0.989 px | 0.786 / 0.395 px | 1.229 / 0.66 px | 89 |
| Z1x: zoompan, no oversampling | 0.934 px | 3.947 px | 2.803 / 1.301 px | 4.09 / 2.113 px | 229 |

zoompan rounds its crop to whole pixels, which causes about 1 px of centre wobble at 2× oversampling and about 4 px at 1×.

**Frame index.** Each frame was fitted against a static crop+scale render.
- **`perspective`'s `in` is 1-based.** Using `z(in)` puts frame 0 already at b=1.00036, where the best fit is z(n+1); plain `z(n)` is off
  by 3.7 px. Using `z(in-1)` puts frame 0 at b=1.00000 and fits `z(n)` within 0.144 px (P608) / 0.081 px (P1080).
- `zoompan`'s `in` is 0-based (fits `z(n)` within 0.442 px).

**Working filter strings** (x=900, N=27 frames, so N−1 = 26). Substitute `K` literally into all 8 corner expressions; the full strings
are in `s1/abs_P608_inm1.fcs` and `s1/abs_P1080_inm1.fcs`.
```
K = ((1-1/(1+0.12*(3*pow(min(max((in-1),0)/26,1),2)-2*pow(min(max((in-1),0)/26,1),3))))/2)

P608 (chosen):
crop=608:1080:900:0,perspective=x0='W*K':y0='H*K':x1='W-W*K':y1='H*K':x2='W*K':y2='H-H*K':x3='W-W*K':y3='H-H*K':interpolation=linear:sense=source:eval=frame,scale=1080:1920:flags=lanczos,setsar=1

zoompan (inferior, reference only):
crop=608:1080:900:0,scale=2*iw:-2:flags=lanczos,zoompan=z='(1+0.12*(3*pow(min(in/26,1),2)-2*pow(min(in/26,1),3)))':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=30,setsar=1
```
**Caveats.**
- The photo check used `server/asset_cache/files/b39be8ef19d52406.jpg`, a 1280 px source upscaled; no ≥ 1920 px JPEG was cached.
  Because the source is soft, the variants look the same in stills, so the smoothness verdict rests on the grid measurement.
- fps figures were measured under concurrent load.

---

## S2 — A-roll chunk exactness and voice stem samples
**Question.** Chunks are rendered with `-ss/-to`, then trim/setpts/crop/scale/concat scripts (`-bf 0 -video_track_timescale 30000 -r 30`),
and joined with the concat demuxer (`-c copy`). Do they give exactly Σ planned frames with constant 1/30 s pts steps? Does the voice
stem built with `atrim start_sample/end_sample` + 6 ms afades + concat have exactly frames × 1600 samples?

**Verdict: pass, provided timestamps are written with ≥ 6 decimals.**

**Test material.**
- **Mezz:** testsrc2 1920×1080 with frame numbers, 20 s, normalized with ENGINE.md params (`-fps_mode cfr`, libx264 veryfast crf 18,
  `-g 30`, AAC 48 kHz). That gives 600 frames, IDR every 30 frames, B-frames present, timebase 1/15360.
- **Audio:** `voice48k.wav` is a sample-index ramp of 960,000 samples.
- **Plan:** 7 pieces in 3 chunks (c0 src 0–240, c1 255–480, c2 497–600), output 1080×1920. Chunk starts 255 and 497 are not keyframes.
  The chunks include a smoothstep pan and a 552×982 zoom crop. Expected frames: 219 + 208 + 94 = **521**.

**Encode settings (§3 as written).** ultrafast crf 12, `-r 30`, `-video_track_timescale 30000`, `-bf 0`, `-g 60`, `-threads 3`. Chunks
were joined with `-f concat -safe 1 -c copy`.

| Variant | Seconds formatting | Frames c0/c1/c2 → base | Content vs full-decode reference |
|---|---|---|---|
| naive3 | `F/30` with 3 decimals | 219/207/93 → **519/521 (FAIL)** | 226 frames < 35 dB |
| naive6 | `F/30` with 6 decimals | 219/208/94 → **521/521** | pass |
| guard | `-ss (S−0.5)/30`, `trim (F−S)/30`, 6 dp | 219/208/94 → **521/521** | pass |

**Packets (naive6 and guard `base.mp4`).**
- Timebase 1/30000, 521 packets, first pts 0.
- **Every pts delta is 1000** (= 1/30 s), every duration is 1000, and dts == pts.
- IDRs are at output frames 0, 219 and 427, i.e. at every chunk join.

**Content check.**
- Per-frame PSNR against a reference built from the full mezz decode (`trim=start_frame/end_frame`, no seek): min 54.62 dB, avg 59.80 dB.
- Control: against a reference shifted by +1 frame, 520 of 521 frames fall below 35 dB, so an off-by-one is detected.
- Also passes on a stream-copied mezz with a 1 ms timescale (pts 0, 33, 67, …): 521 frames, min 54.62 dB.

**Guarded timestamps (recommended).**
```
-ss max(0,(chunkSrcStartF-0.5)/30)  -to chunkSrcEndF/30          (seconds printed with >= 6 decimals, e.g. toFixed(6))
trim=start=(inF-chunkSrcStartF)/30:end=(outF-chunkSrcStartF)/30
```
For a chunk that starts at 0, use `trim=start=(inF-0.5)/30:end=(outF-0.5)/30` for the same half-frame margin. This S=0 form was **not
separately tested**; the unguarded form passed at S=0.

**Voice stem.** `voice.fcs`, one line per piece:
```
[0:a]atrim=start_sample=<F*1600>:end_sample=<G*1600>,asetpts=PTS-STARTPTS,afade=t=in:d=0.006,afade=t=out:st=<len-0.006>:d=0.006[aN];
… [a0]…[a6]concat=n=7:v=0:a=1[a]   → pcm_s16le
```
- **Sample count:** 833,600 = 521 × 1600 exactly.
- **Sample exactness:** every sample outside the 288-sample fades equals the source sample (0 mismatches over 7 pieces).
- **Fade ends:** piece-edge samples are ≤ 34/32768, so the fades land at about 0.
- **Graph shape:** referencing `[0:v]` / `[0:a]` once per piece works without `split`/`asplit`.

**Timing (under load).** 9 chunk renders (1080×1920 ultrafast) plus 3 concats took 21.6 s wall.

---

## S3 — libass captions
**Question.** With a fontsdir holding only the bundled fonts, do ASS files built per RENDER.md §6 give: (a) name-table family matching,
(b) no reflow with per-word colour events, (c) a correct pop entry, (d) a blob behind only the active word, (e) correct
Devanagari/Arabic/Japanese shaping, (f) brand colour within ΔE ≈ 3 (TV.709 vs None), and (g) acceptable cost for a 30 s 1080×1920
burn with 60 cues?

**Verdict: partial.** Every check passes once all Style lines use `Encoding = -1`; as originally written, the contract scrambles Arabic
word order whenever a per-word highlight is present. Filter used: `ass=…:fontsdir=fonts:shaping=complex`.

**(a) Font matching.**
- **Resolves:** `Archivo Black` gives `(Archivo Black, 400|700, 0) -> ArchivoBlack-Regular`. The full name `Archivo Black Regular`,
  `Figtree`, `Figtree Bold`, `DM Sans`, `Anton`, `Barlow Condensed` and the three `Noto Sans …` names also resolve.
- **Silently falls back to ArialMT:** the PostScript name `ArchivoBlack-Regular`, and near-misses such as `ArchivoBlack`.
- **Bold field:** `Bold=-1` on a 400-weight file synthesises bold (ink 19,326 vs 17,801 px, height 66 vs 63 px). On Figtree 700,
  `Bold=-1` and `Bold=0` render identically (11,709 px).
- **Latin inside Noto Deva/Arab styles:** a Latin `O` logs `Glyph 0x4F not found` and falls back to Arial-BoldMT.

**(b) No reflow.** Method: ink-mask XOR in the text band on chroma green.
- **bold_pop emphasis cue:** 0 px.
- **WATCH/THIS/QUICK/TIP cue:** 0–42 px (≤ 0.14 % of about 31k ink px) with identical bboxes; these are antialias pixels at glyph corners.
- **Negative control:** `\fscx112` on one word gives 8,034 px and a changed bbox, so real reflow is detected.
- **`brand_bar` `\u1` cue:** about 97 % of the XOR sits in the underline rows.

**(c) Pop entry.**
- Frames 0–4 have glyph-width ratios 0.850/0.890/0.933/0.976/1.000, against expected 0.850/0.892/0.933/0.975/1.0.
- The bottom stays at 1376–1377 px and centre x at 538.5, so scaling is anchored at `\an2`.

**(d) Blob.** Layer 1 sits above layer 0, and the exact layer-1 text is:
```
{\an2\pos(x,y)\shad0\alpha&HFF&}inactive {\alpha&H00&\3c&H<brand BBGGRR>&\bord14\blur2}active{\alpha&HFF&} inactive…
```
- The result is a white word on a soft brand pill. Brand pixels stay within the active word bbox ±14 px, and neighbouring words stay intact.
- The invisible `\bord14\blur2` carried by later words changes layout by only 34 px XOR, with the same bbox.
- The generator **must** set `\alpha&H00&` on the active word and `\alpha&HFF&` after it. The previous §6 wording never restored alpha.
- With the blob on layer 0 (below) instead, the bboxes are the same, but the black outline stays on top of the pink.

**(e) Scripts.**
- **Devanagari** needs `shaping=complex`. With `simple`, halants show (स्ते, क्ष) and ि is misordered.
- **Japanese:** no tofu.
- **Arabic, plain text:** joined and RTL.
- **Arabic with `Encoding=1` (or 0):** any `\c` override reorders the words. Override-split runs are laid out left to right (x of red
  379 < yellow 465 < blue 567 < cyan 622), and highlight frames differ from the plain line by 3,785–4,787 px of 8,420 ink px.
- **Arabic with `Encoding=-1`:**
  - Highlight XOR is 30–56 px with the same bbox, and colours run right to left (627 > 525 > 468 > 376).
  - A mid-word colour override is 30 px XOR and keeps joining.
  - Mixed `مرحبا OK 42 بالعالم` comes out in Unicode Bidi (UBA) order.
- **`Encoding=-1` for other scripts:** Latin plain text is identical under -1 and 1 (0 px XOR). Latin and Devanagari highlight XOR under
  -1 is 12 and 32 px.

**(f) Colour.** Test: a flat `\p1` rect in #E832A8, yuv420p, libx264 veryfast crf 20.

| ASS `YCbCr Matrix` / input | Decoded as BT.709 | Decoded as BT.601 |
|---|---|---|
| **TV.709** | RGB 230,48,167, **ΔE2000 0.56** | 5.56 |
| None / TV.601 / header missing, untagged input | RGB 246,72,169, ΔE2000 5.03 (ΔE76 8.88) | 0.38 |
| None, input tagged bt709 via `setparams` | 0.56 | — |

- White and #808080 come out exact in every case. Outputs are untagged unless the input is tagged.
- **PNG (RGB) overlay onto yuv420p:**
  - Untagged base: ΔE2000 4.80 as BT.709, because ffmpeg converts with BT.601.
  - Base tagged bt709: 0.85.
  - `scale=out_color_matrix=bt709` alone: still 4.36.

**(g) Cost (under load).** Base clip: 30 s 1080×1920 (900 frames); `g_timing.ass` has 60 cues / 240 Dialogue events with pop.
- **veryfast crf 20 encode:** 16.8 / 19.4 s without ASS vs 17.9 s with it, so the ASS cost is inside run-to-run noise.
- **Decode → null:** 1.54 s without ASS vs 2.31 s with it, which is **≈ 0.85 ms per frame**.
- **Init:** 48 ms with 1 font in fontsdir vs 52–56 ms with all 7 (including the 5.47 MB JP file).

---

## S4 — HyperFrames transparent lower-third card
**Question.** Can a region-sized card (1080×560, 2.5 s, 30 fps) built per §7:
- pass `validate()` + `runtimeCheck()`,
- render with alpha to webm (VP9) and mov (ProRes 4444),
- keep that alpha when composited (only with `-c:v libvpx-vp9` before `-i`),
- and render with no network?

How long does it take?

**Verdict: partial.** The gate fails as written (inlined GSAP). It passes when GSAP is loaded as a file. Alpha, offline rendering and
timings pass. Font note: `server/assets/fonts/edit/` did not exist when S4 ran, so the card used `font-family:'Montserrat'`, plus a
variant with an explicit base64 **woff2** `@font-face`.

**Gates.**
- **As written, the gate fails.** With GSAP 3.12.5 inlined verbatim, `validate()` returns `ok:false` with 2 × `non_deterministic_code`
  ("Script contains `Math.random()`" and "`Date.now()`"). Both hits are inside the GSAP library text (lint rule cli.js:25425, which has
  no vendor exemption). `runtimeCheck` passed (8–9 s). There is also 1 warning, `gsap_studio_edit_blocked`.
- **Fix (a), adopted:** copy `gsap.min.js` into the card dir and load it with `<script src="gsap.min.js"></script>`. Lint does not scan
  external script content. Result: 0 errors, the same 1 warning, runtimeCheck ok in 8.9–12.8 s.
- **Fix (b):** keep GSAP inline but rewrite `Math.random(` → `Math["random"](` (3 occurrences) and `Date.now(` → `Date["now"](` (1).
  Result: 0 errors, and frames bit-identical to (a) (RGBA MD5 e4d958b2…).

**Renders** (§7 command, cwd = card dir; under load).

| Run | Wall | Output |
|---|---|---|
| webm, first/cold | **64.26 s** (page.goto 11.0 s, capture 59.3 s) | 106,313 B, vp9 Profile 0, `ALPHA_MODE=1`, 75 frames |
| webm, warm | **13.70 s** | same frames |
| webm, offline | 13.1–14.35 s | frames bit-identical to online |
| mov | 14.86 s | ProRes 4444 `yuva444p12le`, 75 frames, 8,373,676 B (**79×** the webm) |

The probed webm stream duration is `N/A`; the format duration is 2.5 s.

**Alpha** (composite over red 1080×1920, card at y=1200).
- **With `-c:v libvpx-vp9` before `-i`:** decodes as `yuva420p`. Alpha plane average is 0 at frame 0, 73.96 at frame 36 and 0 at frame 74.
  Composite pixels:
  - transparent area [253 0 0] (the red background)
  - panel [22 18 12] (#17130E)
  - accent [229 49 165] (#E832A8)
  - shadow [209 0 0] (partial alpha)
- **Native vp9 decoder:** `yuv420p`; `alphaextract` fails with "Requested planes not available". Transparent areas and the shadow
  composite as black, so a solid black 1080×560 box appears behind the card.
- **mov:** exact colours [23 19 14] / [232 50 168] and correct transparency. webm vs mov PSNR: alpha 33.5 dB, RGB 35.1 dB.
- **§5 form** (`-c:v libvpx-vp9 -itsoffset 1.0 -i out.webm`, `overlay=0:1200:eof_action=pass` → libx264 yuv420p):
  - frame 29: background only, before the card
  - frame 66: card correct
  - frames 104/110: background again after EOF
  - native decoder instead: black box on frames 31–104
- **Motion:** slide/fade in, hold and out confirmed visually.

**Fonts and offline.** Network was blocked with a `NODE_OPTIONS --require` preload that refuses non-loopback DNS lookups, sockets and
fetch, plus an empty `HYPERFRAMES_FONT_CACHE_DIR`.
- **A family used without its own `@font-face`** (Montserrat, even though the CLI bundles it) makes the CLI fetch Google Fonts at render
  time: `[Compiler] Fetched 55 font face(s) for Montserrat` (cli.js:91987).
  - Offline, the fetch is blocked and the render still succeeds with bit-identical frames, so the failure mode is silent.
  - That online run also cached faces to `~/.cache/hyperframes/fonts/montserrat`, outside the repo.
- **Explicit base64 `@font-face`:** the compiler skips font injection (cli.js:92174).
- **Telemetry:** every render POSTs to `https://us.i.posthog.com/batch/` unless `HYPERFRAMES_NO_TELEMETRY=1` is set. With it set, and a
  data-URI face, a blocked network and an empty cache: 0 blocked attempts and identical frames (MD5 cc485709…).
- **Transparency:** the CLI forces `html, body, [data-composition-id]` transparent (cli.js:33142).

**Caveats.**
- A **TTF** data-URI `@font-face` (the form §6/§7 require) was not tested; only woff2 was.
- `block_net.cjs` covers only the CLI's Node processes, not Chrome's network stack. The card HTML references no external URL, and font
  resolution happens in Node.
- The cold time includes Chrome's first launch on a loaded machine.

---

## S7 — Voice stem joins, loudness, A/V offset, VOICE_CLEAN
**Question.**
- Are voice-stem joints click-free?
- Does `audio_mix.mix()` deliver −14 ± 1.5 LUFS with TP ≤ −1 dBTP and an A/V offset ≤ 1 frame?
- Does VOICE_CLEAN over-compress?
- What happens with a stem pre-normalized to −16 LUFS?

**Verdict: partial.** Cuts, clicks, A/V offset and over-compression pass. **TP ≤ −1 dBTP was never met** by `mix()` alone.

**Test material.** `probe/speech.wav` (app KIE TTS, 16 kHz) resampled with soxr to 48 kHz. It was cut into 5 pieces at frame-aligned
sample boundaries, deliberately mid-word: 19200–163200, 288000–432000, 552000–782400, 864000–1190400 and 1296000–1411200.

**Cut: pass.**
- The contract form (reusing `[0:a]` for every piece) works on ffmpeg 8.
- `voice.wav` `duration_ts` = 960,000 = 600 × 1600.
- ffmpeg 8 prints `-filter_complex_script is deprecated, use -/filter_complex`. `-/filter_complex <file>` gives an **identical MD5**.

**Clicks: pass** (joints at 3.0 / 6.0 / 10.8 / 17.6 s).

| Measure | With 6 ms fades | No-fade control |
|---|---|---|
| max \|Δx\| within ±1 ms, vs local speech p99 | 0.03–0.17× | 5.5–9.1× |
| >9 kHz joint peak vs file HF p99.9 | −30.7…−42.7 dB | +12.5…+18.3 dB |
| astats HF peak in 20 ms joint window | −68.7…−80.8 dBFS (neighbours −51…−78) | −19.8…−25.5 dBFS |

**Mix loudness.** Setup: `voice.wav` −15.8 LUFS, music a 30 s sine-chord bed at volume 0.11; ebur128 on the output MP4.

| Case | Measured I / TP | `mix()` report |
|---|---|---|
| voice + music | −13.7 LUFS / −0.5 dBTP, LRA 5.7 | −13.73 / −0.49, gainAppliedDb 0 |
| voice only | −13.7 / −0.5 | — |
| stem via contract chain (−15.4 LUFS, TP 0.0) | −13.5 / −0.4 (voice only 0.0) | gainAppliedDb 0 |
| stem with `level=disabled:latency=1` (−16.0 LUFS) | −13.9 / −0.2 | gainAppliedDb 0 |
| quiet −25.8 LUFS stem | −13.5 / **0.0** | +8.5 dB applied; report says I −14, TP −8.85 (**stale, pre-gain**) |

**Findings.**
- **The limiter default re-normalizes the stem.** The contract stem chain (`highpass 80` + 2-pass static gain + `alimiter=limit=0.94`)
  produces −15.4 LUFS / sample peak 0.00 dBFS / TP 0.0 instead of −16.0. The cause is alimiter's default `level=true` auto-leveling
  (confirmed with `ffmpeg -h filter=alimiter`). With `alimiter=limit=0.94:level=disabled:latency=1` the stem measures −16.0 LUFS with a
  peak of −0.54 dBFS.
- **mix()'s gain step does not fire for a −16 LUFS stem.** VOICE_CLEAN adds about +2 LU, which lands inside mix()'s ±1 dB dead-band.
- **TP post-pass candidate** (video copy): `-map 0:v -map 0:a -c:v copy -af alimiter=limit=0.841:attack=5:release=50:level=disabled:latency=1 -c:a aac -b:a 160k`
  gives **I −13.7 LUFS, TP −1.4 dBTP** with no added lag. `limit=0.794` gives TP −2.0.
- **The final output is AAC 44.1 kHz,** because `audio_mix` hardcodes it; it is not 48 kHz.

**A/V offset: pass.** Envelope cross-correlation (10 ms window, 1 ms hop, r = 0.989) and sample-level correlation agree, and container
`start_time` is 0 for both audio and video.

| Case | Audio late by |
|---|---|
| Normal mix (master alimiter 5 ms lookahead) | +4.83 ms (232 samples) |
| Gain step fires | +9.79 ms |
| Contract stem alimiter (attack 3 ms) | +2.83 ms |
| Stem alimiter with `latency=1` | −0.15 ms |
| **Worst case** | ≈ 12.6 ms, under 1 frame (33.3 ms) |

**VOICE_CLEAN over-compression: no.** Median active-speech crest factor (400 ms windows):
- **Mix path:** voice.wav 13.34 dB → VOICE_CLEAN direct 13.49 → voice-only mix without normalize 13.54 → with normalize 13.54 dB.
- **dynaudnorm-processed −16 LUFS stem:** 13.74 → mix 13.58 (−0.16 dB).
- **Overall:** crest 15.57 → 16.31 dB, LRA 5.1 → 5.7. The only visible effect is active RMS spread 8.69 → 7.24 dB.
- The crest change (−0.16…+0.20 dB) is far below the 3 dB concern. **Decision: no `voiceChain` opt-in parameter.**

**Timings (under load).**
- Stem cut 0.21 s; 2-pass −16 LUFS 0.84–1.3 s.
- `mix()` 2.6–2.8 s, or 4.2 s when the gain step runs.
- The TP post-pass re-encode was not timed separately.

**Caveat on the click detector.** The >9 kHz reference is not truly empty: sibilance leaks through the filter skirt (p99.9 about
−38 dBFS). Decisions therefore rest on relative measures, which the no-fade control separates cleanly.

---

## Contract changes
Changes applied to `RENDER.md`, by section:
1. **§1** — All encodes add `-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv`. The final audio becomes
   AAC 160 k **44.1 kHz** stereo (from `audio_mix.mix`), and the voice stem/intermediates stay 48 kHz. (S3, S7)
2. **§3, §4, §5** — `-filter_complex_script <file>` → `-/filter_complex <file>` (ffmpeg 8 deprecation; bit-identical output). (S7)
3. **§3** — Seconds are formatted with ≥ 6 decimals from frame indices. Use the guarded seek `-ss max(0,(S−0.5)/30)`, `-to E/30`,
   `trim=start=(inF−S)/30:end=(outF−S)/30`, and at S=0 `(inF−0.5)/30`. Each chunk fcs ends with
   `setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv`. The S2 requirements line now states the verified results.
   (S2, S3)
4. **§4 ZOOM_EMPHASIS** — `perspective` is chosen and zoompan is dropped (not recommended). The row gives the exact expression with a
   1-based `in`: `p = min(max(in-1,0)/(N-1),1)`, with `k` substituted literally. The order stays crop → perspective(linear) →
   `scale=OW:OH:flags=lanczos,setsar=1`, with crop → scale → perspective optional for export. The "never animate crop w/h" rule is
   confirmed. (S1)
5. **§5** — The composite command uses `-/filter_complex` and the §1 colour tags. The fcs re-tags `[0:v]` with `setparams` bt709, so
   logo/card RGB overlays convert with BT.709. The VP9-alpha rule is now proven (a native decode composites a black box). The webm stays the default card format and the
   mov is a fallback only (exact colours, 79× larger). Card duration comes from the container format duration. (S4)
6. **§6 Why libass** — Font size is 6.30 MB (NotoSansJP 5.47 MB). The fontsdir cost is measured (48 → 52–56 ms init). The directory
   ships manifest/LICENSES/OFL files. Cards declare a data-URI `@font-face` for every family they use. (F0, S3, S4)
7. **§6 Styles / ASS** — Every Style uses `Encoding = -1`. `Fontname` = Windows name ID 1 (never the PostScript name). `Bold` comes from
   the manifest weight (−1 only for 700). hi/ar cues wrap Latin runs in `{\fn<Latin family>}` and copy that TTF. The TV.709 evidence is
   recorded. The blob layer-1 text is exact. The Arabic rule is replaced. A `fontselect:` QA check is added. (F0, S3)
8. **§7** — GSAP is copied into the card dir as a file, not inlined. The no-random/now rule covers vendored inline scripts too. The GSAP
   version joins `cardHash`. The gate is on errors only (1 expected warning). The render env sets `HYPERFRAMES_NO_TELEMETRY=1`. (S4)
9. **§8** — The stem limiter becomes `alimiter=limit=0.94:level=disabled:latency=1`, and `[0:a]` reuse plus click-free fades are
   recorded. The VOICE_CLEAN `voiceChain` conditional is removed (no over-compression). The mix gains a TP post-pass and re-measured
   `audio-report.json` values, and the A/V delay is documented. (S2, S7)
10. **§11** — Cards: ~14 s per card warm (≈ 30 s for 2), ~80 s cold for 2. Voice stem + mix: ~4 s (~6 s with the gain step) plus the
    post-pass. New ASS burn-in row: ≈ 0.85 ms/frame. (S3, S4, S7)
11. **§12** — Status line with each verdict and a pointer to this file.

**Changes needed in other docs (not edited here; this run was limited to RENDER.md and SPIKES.md):**
- `ENGINE.md` §7 QA: any frame extraction used to judge colour (vision QA frames, poster) must decode as BT.709; §7 has no
  explicit colour check today. The true-peak check (TP ≤ −1 dBTP via `ebur128=peak=true`, line 251) relies on the RENDER.md §8 post-pass.
- `ENGINE.md` normalize line 164: `-filter_complex_script` → `-/filter_complex`.
- `EDIT_PLAN.md` "Time: seconds, ms precision": the renderer must derive seek/trim seconds from frame indices with ≥ 6 decimals, never
  from the 3-decimal values.
- `ARCHITECTURE.md` lines 273–274 (ZOOM_EMPHASIS "fallback 2× zoompan; decided by S1") and line 303 (`voiceChain` conditional) are now
  settled: perspective only, no `voiceChain`.

## Open risks
- **Colour tagging not verified end to end.** S3 measured the tagged-base overlay (ΔE 0.85) and the `setparams` ASS case in isolation.
  The full chunk → concat `-c copy` → composite (with the `[0:v]` re-tag) → mix path, with logo and cards, has not been measured.
  Card colours in particular depend on the matrix HyperFrames used when encoding the webm (S4 accent [229 49 165] vs #E832A8).
- **TTF data-URI `@font-face` in cards is untested** (only woff2 was tested). The compiler skip at cli.js:92174 must still fire for
  `font/ttf`.
- **Cold card render is close to the watchdog.** It took 64 s against `max(90 s, dur × 30 s)` = 90 s for a 2.5 s card, under load.
- **The TP post-pass adds a second AAC encode.** Generation loss and its time were not measured. The alternative is an opt-in
  `truePeakCeilingDb` in the shared `audio_mix.mix`, which would need review.
- **`mix()` gives a stale report when its gain step fires.** QA must use the re-measured values.
- **The guarded S=0 trim form and the 60 s column timings were not measured.** S8 (throughput, HDR tonemap cost) is still pending.
- **Latin fallback inside hi/ar cues depends on the generator.** A missed `\fn` switch falls back silently to a system Arial.
- **HyperFrames still reaches the network if a card omits a family's `@font-face`,** and populates `~/.cache/hyperframes/fonts`.
