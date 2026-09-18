# AI Video Edit — Render contract (composition · FFmpeg · captions · effects · cards · audio · cache)

Edit Plan → `render/compose.js buildComposition` → Composition JSON → FFmpeg renderer (A-roll chunks → base → composite with
B-roll/cards/ASS/logo) → voice stem + `audio_mix.mix` → outputs → QA (`ENGINE.md` §7). Preview and export are built from the same
composition; only output size, encoder presets, ASS PlayRes and conform sizes differ. Every render is stamped with `compositionHash`.
Companion docs: `EDIT_PLAN.md`, `ENGINE.md`, `ANALYSIS.md`.

Modules (`server/src/video_edit/`): `render/{profiles,compose,exprs,aroll,composite,cache,render,layout}.js` ·
`captions/{styles,group,place,ass,translate,export,fontname}.js` · `broll/conform.js` · `audio/{voice,music,sfx,mix}.js` ·
`cards/{render,templates/*}.js` · `brand/brand.js`. Assets: `server/assets/fonts/edit/*.ttf` (OFL), `server/assets/masks/pip_*.png`.

## 1. Profiles (`render/profiles.js`)
| Profile | Output (9:16 / 16:9 / 1:1) | A-roll intermediate | Composite final | Conform | Cards |
|---|---|---|---|---|---|
| `preview540` | 540×960 / 960×540 / 540×540 | libx264 ultrafast crf 20 | ultrafast crf 30 | at preview size | ASS fallback until real cards exist, then downscaled export card |
| `export720` | 720×1280 / 1280×720 / 720×720 | ultrafast crf 14 | veryfast crf 21 | at export size | HyperFrames |
| `export1080` | 1080×1920 / 1920×1080 / 1080×1080 | ultrafast crf 12 | veryfast crf 20 | at export size | HyperFrames |
All: `-pix_fmt yuv420p -r 30 -video_track_timescale 30000 -bf 0 -threads 3 -movflags +faststart -colorspace bt709 -color_primaries bt709
-color_trc bt709 -color_range tv` (colour tags: spike S3). Audio: the final mix is AAC 160 k **44.1 kHz** stereo, because `audio_mix.mix`
hardcodes 44.1 kHz (S7). The voice stem and audio intermediates stay at 48 kHz.
Crop rectangles are in mezzanine pixels and shared by all profiles.

## 2. Composition JSON (`render/compose.js buildComposition(plan, ctx, profileName) → Composition`, pure)
```ts
Composition = {
  version:1, compositionHash, profile:{ name, W, H, fps:30, inter:{ preset, crf }, final:{ preset, crf } },
  durationFrames,
  base:{ pieces:[{ id, srcInF, srcOutF, outInF, kind:'play'|'hold'|'speed', rate, holdF,
                   framing:{ mode:'static'|'pan'|'zoomAnim', w, h, x, y, xExpr?, yExpr?, zoom?:{ z0, z1, frames, ease } },
                   layout:'FACE'|'SPLIT_BOTTOM'|'SPLIT_RIGHT', background:'none'|'blur', splitBroll?:{ assetPath, trimInSec, focus } }],
         chunks:[{ key, pieceIds:string[], srcStartF, srcEndF }] },
  overlays:[{ id, kind:'broll'|'pip'|'card'|'dip'|'logo', input:{ path, codec:'h264'|'vp9a'|'prores4444'|'png', loop:boolean },
              conformKey, outInF, outOutF, geom:{ x, y, w, h }, mask?:string, fadeInF, fadeOutF, z }],
  captions:{ assPath, assHash, fontsDir:'fonts', fontFiles:string[] } | null,
  audio:{ voice:{ key, pieces:[{ srcInS, srcOutS, fadeMs:6, rate, padS }], chain:{ highpassHz:80, notchesHz:number[],
                  afftdn?:{ nf, nr }, dynaudnorm:boolean, deesser:boolean, targetLufs:-16 } },
          music:{ path, volume, envelope:[{ atSec, volume }], startOffsetSec, fadeInSec, fadeOutSec } | null,
          sfx:[{ path, startSec, volume }] },
  layout:{ elements:[{ id, kind, outIn, outOut, box:{ x, y, w, h } }], crops:[{ pieceId, outIn, outOut, x, y, w, h, faceBox? }] },
  outputs:{ mp4, srt, vtt, poster, credits } }
```
`compositionHash = sha256(canonical composition without outputs)`; chunk keys exclude `outInF` so toggling an early cut keeps later
chunks cached.

## 3. A-roll base (`render/aroll.js`)
- Pieces grouped into ~8 s chunks (6–10 s), split only at hard-cut joints; no effect crosses a chunk.
- One ffmpeg per chunk (cwd = project dir, relative paths, `-protocol_whitelist file`):
  `ffmpeg -y -ss <chunkSrcStart> -to <chunkSrcEnd> -i file:work/mezz.mp4 -/filter_complex render/cache/aroll/<key>.fcs -map "[v]" -an`
  `-c:v libx264 -preset ultrafast -crf <inter> -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -r 30 -video_track_timescale 30000 -bf 0 -g 60 -threads 3 render/cache/aroll/<key>.mp4.tmp.<runId>.mp4`
  fcs: `[0:v]trim=start=<t0>:end=<t1>,setpts=PTS-STARTPTS,<framing>[p0];…;[p0][p1]…concat=n=N:v=1:a=0,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv[v]`
  (mezz GOP 1 s). `-/filter_complex <file>` replaces the deprecated `-filter_complex_script`; on ffmpeg 8 the output is bit-identical (S7).
- **Timestamps (spike S2).** Compute every seconds value from frame indices and print it with ≥ 6 decimals. With 3 decimals, 2 of 3
  chunks lost a frame.
  - Guarded form: `<chunkSrcStart>` = `max(0,(chunkSrcStartF−0.5)/30)`, `<chunkSrcEnd>` = `chunkSrcEndF/30`,
    `t0 = (inF−chunkSrcStartF)/30`, `t1 = (outF−chunkSrcStartF)/30` (relative to the seek).
  - When `chunkSrcStartF = 0`, use `t0 = (inF−0.5)/30` and `t1 = (outF−0.5)/30`. This keeps the same half-frame margin; the S=0 form
    is untested, and the unguarded form passed.
- Base: `ffmpeg -f concat -safe 1 -i render/cache/base/<baseKey>.txt -c copy render/cache/base/<baseKey>.mp4` (generated relative list).
- Verified by spike S2 (`SPIKES.md`), provided every chunk uses identical codec params, timebase and pix_fmt:
  - frame count = Σ pieces
  - constant pts steps of 1000/30000, with dts = pts
  - an IDR at every chunk start
  - concat demuxer `-c copy`

## 4. Effects & framing (`render/exprs.js`)
Crop geometry (mezz W×H, output aspect `A = outW/outH`): `bw = min(W, H·A)`, `bh = bw/A`; at zoom z: `w = even(bw/z)`,
`h = even(bh/z)`, `x = clamp(cx·W − w/2, 0, W − w)`, `y = clamp(cy·H − faceYTarget·h, 0, H − h)` (faceYTarget .38 / .40 / .42).

| Effect | FFmpeg technique |
|---|---|
| Static framing, PUNCH_IN, PUNCH_OUT, JUMP_ZOOM | `crop=w:h:x:y,scale=OW:OH:flags=lanczos,setsar=1`; punches are hard cuts at a word start (piece split) |
| Follow / reframe pan | `crop=w=W0:h=H0:x='<expr>':y='<expr>'` with piecewise smoothstep over `t` (relative to piece start): `if(lt(t,t1),x0,if(lt(t,t2),x0+(x1-x0)*(3*p*p-2*p*p*p),x1))`, `p=(t-t1)/(t2-t1)`; moves ≥ 0.4 s; written in the `-/filter_complex` script with single-quoted expressions. Never animate crop w/h: S1 found they are evaluated once at init, and `t` errors |
| ZOOM_EMPHASIS | Isolated 0.6–1.2 s sub-piece of N frames: `crop=bw:bh:bx:by,perspective=x0='W*k':y0='H*k':x1='W-W*k':y1='H*k':x2='W*k':y2='H-H*k':x3='W-W*k':y3='H-H*k':interpolation=linear:sense=source:eval=frame,scale=OW:OH:flags=lanczos,setsar=1`. **Expression:** `k=(1-1/z)/2`, `z=z0+(z1-z0)*(3*p^2-2*p^3)`, `p=min(max((in-1),0)/(N-1),1)`. perspective's `in` is **1-based**, which is why the formula uses `in-1`. Write `k` out literally in all 8 single-quoted expressions; for 1.0→1.12 with N=27, `k` = `((1-1/(1+0.12*(3*pow(min(max((in-1),0)/26,1),2)-2*pow(min(max((in-1),0)/26,1),3))))/2)`. **Spike S1:** ≤ 0.18 px jitter at 113 fps (under load). `crop → scale → perspective` is allowed for export (≤ 0.21 px, 2.4× slower). **No zoompan:** its integer crop rounding causes ~1 px centre wobble at 2× oversampling and ~4 px at 1× |
| FREEZE | `tpad=stop_mode=clone:stop_duration=<hold>` at piece end; voice stem `apad=pad_dur=<hold>` at the same joint; music continues |
| SPEED (non-speech A-roll / B-roll) | `setpts=(PTS-STARTPTS)/R,fps=30`; A-roll audio `atempo=R` (chain for R>2) |
| Blurred background fill | `split[a][b];[a]scale=OW/8:-2,boxblur=10:1,scale=OW:OH:force_original_aspect_ratio=increase,crop=OW:OH[bg];[b]scale=-2:OH[fg];[bg][fg]overlay=(W-w)/2:0` |
| SPLIT (9:16) | face re-crop to 1080:960 bottom half + B-roll cover-crop 1080×960 top half → `vstack` (A-roll level; chunk key includes the split) |
| FULL B-roll | conformed clip `-itsoffset <outIn> -i broll.mp4` → `format=yuva420p,fade=t=in:st=<outIn>:d=0.12:alpha=1,fade=t=out:st=<outOut-0.12>:d=0.12:alpha=1` → `overlay=0:0:eof_action=pass` |
| PIP | clip pre-scaled to the box → `alphamerge` with rounded-corner mask PNG over a pre-rendered shadow PNG → `overlay=x:y:eof_action=pass` (no `geq`) |
| Stills (Ken Burns) | `-loop 1 -framerate 30 -t D -i img.jpg -vf "scale=<2·coverW>:-2,zoompan=z='z0+(z1-z0)*on/(D*30)':x='(iw-iw/zoom)*fx':y='(ih-ih/zoom)*fy':d=1:s=WxH:fps=30,format=yuv420p"`; zoom 1→1.08 subtle / 1→1.15 dynamic toward the edge-energy focus (`crop_engine.analyzeImage`), alternating direction |
| DIP_BLACK / DIP_WHITE / FLASH | `color=c=black|white:s=OWxOH:r=30:d=2T,format=yuva420p,fade=t=in:d=T:alpha=1,fade=t=out:st=T:d=T:alpha=1` (FLASH adds `colorchannelmixer=aa=0.7`) overlaid at `joint−T`; duration unchanged |
| CROSSFADE (topic boundaries only) | both neighbour pieces re-encoded as one joined piece with `xfade=transition=fade:duration=d:offset=durA−d` + `acrossfade=d=d`; same size/fps/timebase/pix_fmt; time map records a −d overlap piece |
| Logo | `-loop 1 -i assets/logo.png` → `scale=Lw:-1,format=rgba,colorchannelmixer=aa=<opacity>` → `overlay=x:y:shortest=1:enable='<show>'`; SVG rasterized first (puppeteer-core + `runtime_check.findChromium`) |
Hard cuts for every jump cut and every B-roll edge on speech; soft transitions only at topic boundaries with a kept pause ≥ 0.3 s.

## 5. Composite (`render/composite.js`)
One pass: `ffmpeg -y -i render/cache/base/<k>.mp4 [-itsoffset o -i <conformed broll>]… [-c:v libvpx-vp9 -itsoffset o -i render/cards/<h>/out.webm]… [-loop 1 -i assets/logo.png] -/filter_complex render/cache/composite/<k>.fcs -map "[out]" -an -c:v libx264 -preset <final> -crf <final> -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -movflags +faststart -threads 3 render/cache/composite/<k>.mp4`.
z-order: base (`[0:v]setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv`, so the RGB logo/card overlays convert
with BT.709; untagged frames convert with BT.601, ΔE2000 ≈ 4.8, S3) → B-roll/PIP → dips → cards → `ass=f=render/cache/ass/<h>.ass:fontsdir=fonts:shaping=complex` → logo.
**`-c:v libvpx-vp9` must precede `-i` for VP9-alpha cards.** Spike S4: the native vp9 decoder returns `yuv420p`, so transparent areas
composite as a black box.
- **Card format:** cards stay webm (VP9 `yuva420p`, ~106 KB per 2.5 s card). ProRes 4444 `.mov` (`yuva444p12le`, exact colours, ~79× the
  size) is a fallback only.
- **Card duration:** read it from the container format, because the webm stream duration is `N/A`.

`broll/conform.js`: `conformClip(asset, {w, h, durationSec, trimInSec, focus, rate}, profile)` — cover-scale + crop around focus, `fps=30`,
trim with handles, `setsar=1`, `format=yuv420p`, `-an`, cached by `sha1(assetId, geometry, duration, trim, profile)`; stills via Ken Burns.

## 6. Captions (`captions/*`) — libass
- **Why libass:** one pass, frame-exact, ~0.3 s start, cheap re-burn per edit. Verified on this ffmpeg: FriBidi + HarfBuzz; woff2 not
  loadable; a large system-size fontsdir is ~6× slower (the bundled set is cheap: S3 measured 48 ms init with 1 font, 52–56 ms with 7);
  missing glyphs fall back silently. → Bundled OFL static TTFs in `server/assets/fonts/edit/`:
  DM Sans Bold, Archivo Black, Figtree Bold, Anton, Barlow Condensed Bold, Noto Sans Devanagari Bold, Noto Sans Arabic Bold,
  Noto Sans JP Bold (6.30 MB total; NotoSansJP-Bold alone is 5.47 MB). The directory also ships (spike F0):
  - `manifest.json`: `[{file, family (Windows name ID 1), weight (OS/2 usWeightClass), scripts (ISO 15924), sha256, bytes}]`
  - `LICENSES.md`
  - `OFL-<Family>.txt` for each family

  Only the 2–4 needed files are copied into `<project>/fonts/`.

  **Cards** embed the same TTF for font parity. Every family a card uses gets its own
  `@font-face{font-family:<family>;src:url(data:font/ttf;base64,…)}`.
  - A family without its own `@font-face` makes the CLI fetch Google Fonts at render time (S4), even for families the CLI bundles.
  - HyperFrames aliases system names like "Arial Black" → Montserrat, so never rely on system fonts.
- **Grouping** (`group.js buildCues(outWords, style, output, lang)`): words on the output timeline (removed fillers/hidden words
  dropped, insertions included); width measured per language (`caption_lang.js` `charWidth`; `server/src/fonts/font_metrics.js`
  when the family is present); limits per style: max lines, `maxWordsPerLine`, `maxCharsPerLine[aspect]`, `maxCueSec` 2.5 (words
  mode); breaks prefer punctuation, pauses > 250 ms, sentence ends, and never split name/number pairs; min cue 0.5 s (extend into
  following gap); reading speed ≤ 20 chars/s (≤ 15 hi/ar, ≤ 8 ja) else split.
- **Placement** (`place.js`): safe band per aspect (9:16: bottom caption baseline at 72 % of height, never below 80 %, top 12 %
  reserved; 16:9: bottom 8–15 %; 1:1: bottom 12–20 %); avoid the smoothed face box (move to top band when the box intersects the
  caption box > 10 % of cue); during FULL B-roll default position; during SPLIT sit on the seam (y = 0.50); hysteresis ≤ one position
  change per 4 s unless forced; per-cue `yOverride` wins inside the safe band.
- **Styles** (`styles.js`, fields `{id, font:{family, ttf, bold, sizePx:{'9:16','16:9','1:1'}, spacing, uppercase}, colors:{primary,
  highlight, emphasis, outline, shadow, box}, outlinePx, shadowPx, box:{enabled, alpha}, maxLines, maxCharsPerLine, entry, entryMs,
  highlight, emphasisScale}`):

| id | Font | 9:16 size | Lines | Highlight | Entry |
|---|---|---|---|---|---|
| `bold_pop` (default) | Archivo Black, uppercase | 76 | 1 (≤ 3–4 words) | color = brand accent | pop 85→100 % over 120 ms |
| `clean` | DM Sans Bold | 60 | 2 | none | fade 80 ms |
| `karaoke_blob` | Figtree Bold | 68 | 2 | blob (active word brand outline `\bord14\blur2`) | fade |
| `single_word` | Anton, uppercase | 110 | 1 word | emphasis ×1.15 | pop 70→100 % over 90 ms |
| `minimal_lower` | DM Sans Bold, sentence case | 44 | 2 | none, 55 % black box | fade |
| `brand_bar` | Barlow Condensed Bold | 64 | 2 | `\u1` underline on active word, brand box | fade |
  Highlight/box colours from `brand_kit.resolveBrand` (`services/brand_kit.js:244`) pushed to ≥ 3:1 against outline/box with
  `nudgeToRatio` (`:99`). Script fonts: hi → Noto Sans Devanagari Bold, ar → Noto Sans Arabic Bold (RTL), ja → Noto Sans JP Bold.
  Noto Sans Devanagari and Noto Sans Arabic have digits but no Basic Latin letters or ASCII punctuation (F0). So Latin-letter and
  ASCII-punctuation runs inside hi/ar cues are wrapped in `{\fn<bundled Latin family>}…{\fn<script family>}`, and that Latin TTF is also
  copied into `<project>/fonts/`.
- **ASS** (`ass.js buildAss({cues, style, output, lang})`): `[Script Info] ScriptType: v4.00+ · PlayResX/PlayResY = output size ·
  WrapStyle: 2 · ScaledBorderAndShadow: yes · YCbCr Matrix: TV.709` (S3: brand ΔE2000 0.56 when decoded as BT.709; None, TV.601 or a missing
  header gives BT.601, ΔE2000 5.0); colours `#RRGGBB` → `&H00BBGGRR` (alpha byte inverted).
  - **`Fontname`:** the Windows-platform name ID 1 family (en-US), read by `fontname.js`. The ID 4 full name also matches. Never use the
    PostScript name; it silently falls back to ArialMT.
  - **Style `Bold`:** taken from the manifest weight. Use `-1` only for 700-weight files (DM Sans, Figtree, Barlow Condensed, Noto \*) and
    `0` for Archivo Black and Anton, which are 400-weight; `-1` on those synthesises bold.
  - **Style `Encoding`:** every Style uses `-1` (auto base direction). With 0 or 1, libass lays out override-split runs left to right, so
    any per-word highlight scrambles Arabic word order. `-1` is verified harmless for Latin, Devanagari and Japanese (S3).

  Escaping: `\`→`\\`, `{`→`\{`, `}`→`\}`, newline `\N`, edge
  spaces `\h`. **Per-word highlight without jitter:** one Dialogue per active-word interval `[w_k.outStart, w_{k+1}.outStart)`, every
  event with identical `{\an2\pos(x,y)}` and the full cue text; only the active word changes via `{\c&H<hl>&}word{\c&H<primary>&}`
  (colour/underline/border don't change advance). Emphasis `\fscx112\fscy112` identical in all events of a cue. Pop
  `{\fscx85\fscy85\t(0,E,\fscx100\fscy100)}` on the first event only (`E = min(entryMs, firstInterval)`). Blob: layer 1 (above layer 0)
  repeats the text exactly as `{\an2\pos(x,y)\shad0\alpha&HFF&}inactive {\alpha&H00&\3c&H<brand>&\bord14\blur2}active{\alpha&HFF&} inactive…`.
  The active word must set `\alpha&H00&`, and the text after it must restore `\alpha&HFF&`. S3 result: a white word on a brand pill,
  brand pixels within the word bbox ±14 px, no reflow. `sweep`: one event with
  `\kf<cs>` per word. `single_word`: one event per word at `\an5\pos(cx,cy)`. Arabic: Style `Encoding -1` is required. Placing overrides at word
  boundaries is recommended, although colour-only mid-word overrides keep joining under -1 (S3).
  Cues with `timingMode:'proportional'` (approx timing, conf < .5, translations) get whole-cue fade/pop, no highlight.
  Burn-in filter: `ass=f=render/cache/ass/<hash>.ass:fontsdir=fonts:shaping=complex` (cwd = project dir). `shaping=complex` is
  required for Devanagari (S3).
  Render QA: with `-loglevel verbose`, every `fontselect:` line must resolve to the expected bundled file, because font fallbacks are silent.
- **Translation** (`translate.js`): per source sentence via `services/translate.js translateLines({lines:[{id:sentenceId, text}],
  targetLang, sourceLang, context})` batched ≤ 60 sentences; each translated sentence re-grouped inside that sentence's kept output
  span (may be discontinuous), time split proportional to `chars × charWidth` respecting readability; cached by sentence hash.
- **Export** (`export.js`): `services/captions.js toSrt/toVtt` on output-timeline cues (`lines.join("\n")`) → `render/out/<rid>.srt|.vtt`.

## 7. HyperFrames cards (`cards/*`)
- Templates `hook_title`, `keyword`, `stat`, `lower_third`, `cta`, `logo_outro`: `build(vars, brand, fontTtfB64, {w, h, dur}) →
  {indexHtml, metaJson}`; **region-sized** (e.g. 1080×560), not full frame.
- Contract: root `<div id="root" data-composition-id="vid" data-width data-height data-start="0" data-duration>`; timed children
  `class="clip"` with `id`, `data-start`, `data-duration`, `data-track-index` (disjoint per track; hidden state `opacity:0` only);
  backgrounds on child elements (transparent render forces html/body/root transparent); GSAP is copied from
  `server/node_modules/gsap/dist/gsap.min.js` into the card dir as `gsap.min.js` and loaded via `<script src="gsap.min.js"></script>`.
  Copy it before `validate()`, which writes only index.html + meta.json. Do not inline it: GSAP itself contains
  `Math.random`/`Date.now`, so an inlined copy fails lint `non_deterministic_code` (spike S4). The timeline is paused and registered
  synchronously as `window.__timelines['vid'] = tl`. Forbidden:
  - `Math.random` and `Date.now` in any inline script, vendored code included
  - `repeat:-1`
  - network fonts (every family gets a data-URI `@font-face`, §6)
  - registry blocks

  Also required: `meta.json {compositionId:'vid', width, height, fps:30, duration}`.
- Gates: `services/validator.js validate(dir, {indexHtml, metaJson})` (0 lint errors; gate on errors only, since 1 warning `gsap_studio_edit_blocked` is expected, S4) → `services/runtime_check.js runtimeCheck(dir)`.
- Render: `const {cmd, args} = services/hyperframes_cli.cliFor('render', ['--format','webm','--output','out.webm','--fps','30','--workers','1','--quality','standard','.'])`
  → `spawnCompat(cmd, args, {cwd: cardDir, env: {...process.env, HYPERFRAMES_NO_TELEMETRY: '1'}})`. Without that env var, every
  render POSTs telemetry to us.i.posthog.com (S4). Run it with a watchdog of `max(90 s, dur × 30 s)` + killTree, one retry on NTSTATUS crash
  (pattern `services/renderer.js:56-63`). **Never** `renderer.render` (publishes to public/videos). Card dirs isolated (lint scans the dir).
- `cardHash = sha1(templateId@version, vars, palette, font sha1, GSAP version, w, h, fps, dur)`; output `render/cards/<hash>/out.webm`.
- Fallback on any gate/render failure or timeout: the same text as ASS events (`\fad(120,120)` + `\t` scale) with `render.status='fallback'`.
  Preview always uses the ASS fallback immediately while real cards render in the background; export waits for them.

## 8. Audio (`audio/*`)
- **Voice stem** (`voice.js buildVoiceStem(comp.audio.voice, ctx)`): one ffmpeg run on `work/voice48k.wav`:
  per piece `atrim=start_sample=A:end_sample=B,asetpts=PTS-STARTPTS,afade=t=in:d=0.006,afade=t=out:st=<len-0.006>:d=0.006`
  (`apad` for holds, `atempo` for speed) → `concat=n=N:v=0:a=1` → `highpass=f=80` [+ `equalizer` notches for hum] [+ `afftdn=nf=<floor>:nr=<10|18>:tn=1`
  when SNR < 22 / < 14 dB] [+ `dynaudnorm=f=200:g=11` when level stdev > 4 dB] [+ `deesser=i=0.4` when sibilance > .35] →
  `render/cache/voice/<key>.wav` (pcm_s16le); then 2-pass static-gain loudnorm to −16 LUFS (TP −2) +
  `alimiter=limit=0.94:level=disabled:latency=1`. This copies the private pattern `services/tts.js:500-546` except for the limiter flags
  (spike S7):
  - The ffmpeg default `level=true` re-normalizes peaks to 0 dBFS. Measured −15.4 LUFS / TP 0.0 instead of −16.0 / −0.5.
  - `latency=1` removes a 2.8 ms lag.

  Sample boundaries = frame boundaries × 1600. Verified (S2, S7):
  - `[0:a]` may be referenced once per piece without `asplit`.
  - Samples = frames × 1600 exactly, with sample-exact offsets.
  - The 6 ms afades are click-free.
- **Music** (`music.js`): candidates via `services/pixabay_bridge.firstAudioUrl(query, 'music', {index:0..2})` → `downloadToFile`,
  fallback `services/audio_sources.fetchMusic({query, outputPath, durationSec, seed: projectId})` (synth pad last); query = energy word
  first + mood (+ pacing term); every file validated with `services/media.probeDurationSec`; envelope from plan anchors → absolute
  `atSec` points (≤ 12).
- **SFX** (`sfx.js`): local `server/assets/sfx/<services/sfx_library.resolveCue(name)>.mp3` copied into `assets/sfx/` (never
  `getSfx`, which hits the bridge first); CC-BY attributions recorded for credits.
- **Mix** (`mix.js mixFinal`): `services/audio_mix.mix({videoPath: composite, outputPath: render/out/<rid>.mp4, durationSec:
  durationFrames/30, ttsPath: voice.wav, musicPath, musicVolume, musicEnvelope, sfx:[{path, startSec, volume, kind:'sfx'}],
  normalize:true, targetLufs:-14})` — video stream-copied, so music/SFX changes re-run only this step. Always pass the voice stem
  (mix discards the input video's audio when any layer exists).
  - **No `voiceChain` parameter.** Spike S7 found no `VOICE_CLEAN` over-compression (median crest change −0.16…+0.20 dB).
  - **Gain step:** a −16 LUFS stem lands at ≈ −13.9 LUFS after `VOICE_CLEAN`, inside `mix()`'s ±1 dB dead-band, so the static gain step
    does not fire.
  - **A/V delay:** `mix()` delays audio by +4.8 ms (+9.8 ms when the gain step fires), less than 1 frame.
- **True-peak post-pass.** `mix()` alone measured TP −0.5…0.0 dBTP in S7. `mix.js` re-measures the output with `ebur128=peak=true`.
  If TP > −1.0 dBTP, it runs this pass on the `mix()` output, writes to `*.tmp.<runId>.mp4` and renames the result over it:
  `ffmpeg -y -i <mix> -map 0:v -map 0:a -c:v copy -af alimiter=limit=0.841:attack=5:release=50:level=disabled:latency=1 -c:a aac -b:a 160k -movflags +faststart <tmp>`.
  S7 result: I −13.7 LUFS, TP −1.4 dBTP, no added lag.
- **Audio report.** Write the final re-measured I/TP/LRA and a `postPass` flag, together with `mix()`'s report, to
  `render/out/<rid>.audio-report.json`. Never use `mix()`'s I/TP alone: its report is stale after the gain step (reported −14 / −8.85,
  measured −13.5 / 0.0).

## 9. Cache and invalidation (`render/cache.js`, `plan/revisions.js diffLevels`)
| Level | Key |
|---|---|
| A-roll chunk | `sha1(mezz sha1, piece specs incl. framing/layout/split asset, profile)` |
| Base | `sha1(chunk keys in order)` |
| Voice stem | `sha1(voice pieces + chain + mezz audio sha1)` |
| ASS | `sha1(cues + style + placement + output size)` |
| Conform | `sha1(assetId, geometry, duration, trim, profile)` |
| Card | `cardHash` (§7) |
| Composite | `sha1(base key, overlays (conform keys + geometry + fades + z), ASS hash, card hashes, logo sha1 + placement, profile)` |
| Final mix | `sha1(composite key, voice key, music path sha1 + volume + envelope, sfx list)` |
`getOrMake(projectId, level, key, make)` returns the cached path or builds it under `*.tmp.<runId>.*` then renames.

| Change | Re-renders |
|---|---|
| caption text/style/position/emphasis | ASS → composite → mix |
| caption language | translate (AI) → ASS → composite → mix |
| B-roll replace/remove/add, PIP ↔ FULL | download + conform → composite → mix |
| SPLIT on/off, effect toggle, crop/framing | affected chunks → base → composite → mix |
| cut toggle, filler/silence/jump-cut settings | re-derive map → changed chunks only → base concat → voice → re-time ASS/overlays/SFX → composite → mix |
| music change/remove/volume, SFX edits | mix only (`-c:v copy`) |
| logo, brand colours | ASS + cards → composite → mix |
| aspect change | all chunks + cards + ASS + conform → composite → mix (no re-analysis) |
| B-roll intensity / effects level | rhythm re-select (no LLM) → retrieval for newly selected items only → affected levels |

## 10. Render orchestration (`render/render.js renderRevision(projectId, {revision, profile, signal, runId}) → RenderRecord`)
PREPARING_RENDER: load plan revision → `resolvePlan` → ensure assets (download/conform chosen B-roll, logo, fonts copy, music/SFX files)
→ cards (export profile: HyperFrames in the heavy lane; preview: ASS fallback) → `buildComposition`. RENDERING: chunks (heavy slot,
cached) → base → composite. POST_PROCESSING: voice stem → `mixFinal` → SRT/VTT/credits → poster (brightest of 7 frames with face
visible and no overlay) → `render/layout/<rid>.json`. QUALITY_CHECK: `ENGINE.md` §7. Progress: chunk-level + ffmpeg `-progress`.
Failure ladder: chunk retry with `-threads 1 -preset ultrafast` → drop overlays (base + captions only, notice) → render failed
(plan and previous export untouched). Export files are immutable per renderId.

## 11. Performance targets (i5-6200U, 4 threads; confirm with spike S8)
| Step | 20 s source | 60 s source |
|---|---|---|
| Normalize (mezz + proxy + wavs) | 20–30 s | 60–90 s |
| Base export 1080p (ultrafast, ~45 fps) | ~15 s | ~40 s |
| Composite export (veryfast, ~22 fps) | ~27 s | ~80 s |
| ASS burn-in share of composite (S3, under load: ≈ 0.85 ms per 1080×1920 frame, 240 events) | ~0.5 s | ~1.5 s |
| Preview 540p base + composite | ~8 s | ~20 s |
| Cards (2 × 2.5 s, 1 worker incl. Chrome start). S4, under load: ~14 s per card warm, ~65 s for the first cold Chrome launch | ~30 s warm / ~80 s cold | ~30 s warm / ~80 s cold |
| Voice stem + mix + loudnorm. S7, under load: ~4 s, ~6 s when the gain step fires, plus the TP post-pass (not timed) | ~4–6 s + post-pass | ~10 s |
| Edit: music change / caption edit (preview) / filler toggle (preview) | ~5 s / ~8 s / ~15 s | ~10 s / ~20 s / ~25 s |

## 12. Spikes (run before Phase 6–7, results recorded in `docs/ai-video-edit/SPIKES.md`)
S1 animated zoom (`perspective` vs 2× `zoompan`; confirm crop w/h can't animate) · S2 chunk exactness through concat demuxer (frame
count = Σ pieces, constant pts steps, voice samples = frames × 1600) · S3 libass (fontsdir family match via `-loglevel verbose`
`fontselect:` lines, no reflow with per-word colour events, blob, pop, ar/hi/ja shaping, brand colour pixel accuracy, `YCbCr Matrix`)
· S4 HyperFrames transparent card (webm alpha only with `-c:v libvpx-vp9` before `-i`; mov alternative; wall time; offline fonts)
· S7 voice-stem joins click-free, A/V offset ≤ 1 frame, −14 ± 1.5 LUFS through `audio_mix.mix`, VOICE_CLEAN over-compression check
· S8 throughput (crop+lanczos ultrafast, composite veryfast with 2 overlays + ASS + logo, HDR tonemap chain cost).

Status 2026-09-14 (full results in `SPIKES.md`):

| Spike | Verdict |
|---|---|
| F0 | pass (fonts shipped) |
| S1 | pass (perspective) |
| S2 | pass (needs ≥ 6-decimal timestamps) |
| S3 | partial → pass with Style `Encoding -1` |
| S4 | partial → pass with GSAP loaded as a file and a data-URI `@font-face` per family |
| S7 | partial → pass with the TP post-pass |
| S8 | pending |
