// FILM BEATS — the sixteen scene renderers of source/film-kit.js, restated as HTML builders.
//
// Every builder here is a transcription of the matching function in the handoff's
// `film-kit.js`, with three systematic changes and no others:
//
//   1. UNITS. The source writes raw pixels against its authored 1080x1920. Each becomes
//      X()/V()/F() so the composition holds its proportions at any output size.
//   2. ANIMATION. The source recomputes `tM(p,i)` / `iM(p,i)` inline every frame. Here an
//      element carries `data-in="<preset>" data-i="<n>"` and the timeline emits one GSAP
//      fromTo per element with the same curve, the same stagger and the same distance.
//      RESTING STATE IS THE FINISHED FRAME — the "from" values exist only while a tween
//      runs, so a stalled ticker can never capture a blank scene.
//   3. CONTENT. `scene.title/sub/chips/tiles/stats/items/...` came from a hand-authored
//      OM_SCENES deck. Here they come from KEYFRAME's storyboard, through the extractors in
//      film_stage.js, and the dashed "DROP IMAGE TO REPLACE" slot becomes a real asset in a
//      real device frame — a placeholder must never reach a rendered film.
//
// The per-frame INTERACTION state (typed characters, ring sweep, scroll travel, cursor
// path, flipped switches) is NOT baked here. Each builder returns a `mech` descriptor and
// the runtime in film_runtime.js recomputes it from scene-local progress on every seek,
// exactly as the source does per frame — which is what makes those beats seek-exact.

const S = require("./film_stage");
const { X, V, F, rgba, clamp, clamp01, fitLines, fitPx, featureLines, pickStats, shortLabel } = S;
const { esc, r, bullets } = require("./composer_kit");

const PAD = 72;                    // the source's safe margin (cfg.PAD)
const COL = 1080 - PAD * 2;

// Resolve a `look` colour: a palette KEY, or a literal hex the source inlined.
const col = (theme, s) => (typeof s === "string" && s[0] === "#" ? s : (theme.c && theme.c[s]) || theme[s] || s);

// TEXT COLOUR, GUARDED AGAINST ITS ACTUAL GROUND.
//
// The authored `look.<beat>.fg` is honoured whenever it reads — that is the design, and
// keeping it is the whole point of the port. But it can fail to read for two reasons this
// engine has to survive: a ported look can name a dark ink on a dark field (cat-nap rendered
// its opening headline in #332a47 on a #332a47-family ground — present, measured, laid out and
// effectively invisible), and the brand rotation can move a colour and its ground toward each
// other. `theme.typeOn` returns the authored colour at ratio >= 3 and the field's own readable
// ink otherwise, so the design wins by default and legibility wins when it must.
const ink = (theme, s, ground) => theme.typeOn(col(theme, s), ground);
const splitLines = (t) => String(t == null ? "" : t).split("|");

// ---- shared fragments ---------------------------------------------------------
// THE DISPLAY STACK. The source's `Title()`: one <div> per line, each its own animated
// element, and — the FilmKit signature — THE SECOND LINE TAKES THE ACCENT. That single
// detail is most of why these titles read as designed rather than typed, so it is
// preserved exactly (`i === 1 ? hi : fg`).
function title(theme, skin, txt, { size, fg, hi, upper, from = 0, align = "left", maxLines = 4, ground }) {
  const fit = fitLines(txt, { basePx: size, maxLines, colPx: COL, em: skin.em, upper });
  // A tight shadow in the GROUND colour: every pack paints a live world behind the copy and
  // the contrast machinery cannot see it, so the type carries its own separation. Invisible
  // on a clean field; restores the edge wherever a decoration drifts behind a glyph.
  const g = ground ? `text-shadow:0 ${X(2)} ${X(10)} ${rgba(ground, 0.55)}, 0 0 ${X(4)} ${rgba(ground, 0.55)};` : "";
  // DISPLAY WEIGHT. FilmKit's own Title sets none, which is correct for its single-weight
  // display faces (Alfa Slab One, Anton, Bebas Neue) where any weight maps to the one file.
  // The hand-built one-off films use VARIABLE families and specify 700/800 explicitly — left
  // unset those render at 400, which on Baloo 2 or Orbitron is a visibly lighter film than the
  // reference. A skin declares `displayWeight` only when its source does.
  const w = skin.displayWeight ? `font-weight:${skin.displayWeight};` : "";
  return fit.lines.map((ln, i) =>
    `<div data-in="title" data-i="${from + i}" style="font-family:${theme.displayStack};${w}font-size:${F(fit.size)};line-height:${skin.titleLine || 1.04};letter-spacing:${skin.titleSpace || "0"};color:${i === 1 ? hi : fg};${upper ? "text-transform:uppercase;" : ""}text-align:${align};${g}">${esc(ln)}</div>`
  ).join("");
}

// The source's `Kicker` — four variants (pill / outline / tag / bare).
function kicker(theme, skin, k, text) {
  if (!text) return "";
  const v = (k && k.v) || "pill";
  const c = col(theme, (k && k.c) || "ink"), bg = col(theme, (k && k.bg) || "accent");
  const base = `display:inline-block;font-family:${theme.bodyStack};font-weight:800;font-size:${F(24)};letter-spacing:.2em;margin-bottom:${X(38)};`;
  if (v === "outline") return `<div data-in="item" data-i="0" style="${base}padding:${X(12)} ${X(26)};border-radius:${k && k.r != null ? X(k.r) : "999px"};border:${X(2)} solid ${rgba(c, 0.75)};color:${c};">${esc(text)}</div>`;
  if (v === "tag") return `<div data-in="item" data-i="0" style="${base}padding:${X(12)} ${X(26)};border-radius:${X(8)};background:${bg};color:${c};transform:rotate(-2deg);">${esc(text)}</div>`;
  if (v === "bare") return `<div data-in="item" data-i="0" style="${base}color:${c};letter-spacing:.3em;">${esc(text)}</div>`;
  return `<div data-in="item" data-i="0" style="${base}padding:${X(13)} ${X(28)};border-radius:999px;background:${bg};color:${c};">${esc(text)}</div>`;
}

// The source's `chipStyle` — pill / outline / square.
function chipCss(v, c, fill, i) {
  if (v === "outline") return `border:${X(2)} solid ${c};color:${c};border-radius:${X(10)};background:transparent;`;
  if (v === "square") return `background:${c};color:${fill};border-radius:${X(8)};transform:rotate(${(i % 2) * 2 - 1}deg);`;
  return `background:${c};color:${fill};border-radius:999px;`;
}

// The source's `card()` — the media plate's four treatments.
function cardCss(L, theme) {
  const v = (L.card && L.card.v) || "frame";
  const cbg = col(theme, L.card && L.card.bg);
  const rad = L.card && L.card.r != null ? L.card.r : 28;
  const base = `margin:${X(46)} auto ${X(42)};width:${X(936)};height:${X(588)};border-radius:${X(rad)};padding:${X(13)};background:${cbg};`;
  if (v === "tilt") return `${base}transform:rotate(-1.5deg);box-shadow:0 ${X(30)} ${X(62)} rgba(10,10,12,0.4);`;
  if (v === "glow") { const g = col(theme, L.card.glow); return `${base}border:1px solid ${rgba(g, 0.55)};box-shadow:0 0 ${X(44)} ${rgba(g, 0.25)}, 0 ${X(28)} ${X(56)} rgba(0,0,0,0.5);`; }
  if (v === "paper") return `margin:${X(46)} auto ${X(42)};width:${X(936)};height:${X(588)};border-radius:${X(10)};padding:${X(13)};background:#ffffff;box-shadow:0 ${X(26)} ${X(54)} rgba(20,16,10,0.3);`;
  return `${base}box-shadow:0 ${X(30)} ${X(62)} rgba(10,10,12,0.38);`;
}

// THE `world` FLAG IS LOAD-BEARING, NOT DECORATION.
//
// Each beat's `look.<beat>.world` says whether the animated backdrop shows on that beat, and
// 215 of the 474 beats across these 70 templates say NO. The source honours it by painting the
// beat's own ground inside its frame; a port that renders the world everywhere does not merely
// lose that alternation — it breaks the type. Every beat's text colour is authored against its
// OWN field, so cat-nap's feature beat (drawn in #241d2e for a #f6efe4 paper ground) rendered
// dark-on-dark once the night-blue world showed through beneath it.
//
// So a world:false beat paints its ground opaquely on its own clip, which covers the shared
// world layer; a world:true beat stays transparent and lets it through.
const open = (ctx) =>
  `<div class="clip fk-sc" id="${ctx.id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;${ctx.opaque ? `background:${ctx.ground};` : ""}">` +
  `<div class="fk-cam" id="${ctx.id}-cam"><div class="fk-drift" id="${ctx.id}-drift">`;
const close = () => `</div></div></div>`;

// The app SHELL the ten interaction beats sit inside — the source's `Shell`.
function shell(ctx, titleTxt, inner, extra) {
  const { theme, skin } = ctx;
  const L = ctx.look.app;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground);
  return `${open(ctx)}
    <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(180)};bottom:${V(140)};display:flex;flex-direction:column;justify-content:center;">
      ${title(theme, skin, titleTxt, { size: 92, fg, hi, upper: L.upper, from: 0, ground: ctx.ground })}
      <div style="margin-top:${X(48)};">${inner}</div>
    </div>
    ${extra || ""}
  ${close()}`;
}
// The source's `panel()` — the card every interaction beat draws on.
function panelCss(ctx, h, extra) {
  const { theme } = ctx;
  const L = ctx.look.app;
  const rad = ctx.panelR;
  return `background:${col(theme, L.cardBg)};border-radius:${X(rad)};padding:${X(30)};${h ? `height:${X(h)};` : ""}border:1px solid ${rgba(col(theme, L.line), 0.2)};box-shadow:0 ${X(26)} ${X(56)} rgba(8,8,10,0.35);position:relative;overflow:hidden;${extra || ""}`;
}
// The source's `Pointer` — a hand cursor drawn as one path.
const pointer = (id, fg) =>
  `<g id="${id}" transform="translate(140,620)"><path d="M0 0 L0 30 L8 24 L14 38 L20 35 L14 22 L24 21 Z" fill="${fg}" stroke="rgba(0,0,0,0.4)" stroke-width="1.5"/></g>`;

// ================================ THE SIX CORE BEATS ================================

// HOOK — kicker, the big title stack, a sub line, and (when a capture landed here) an
// inline device frame. The opener.
function bHook(scene, ctx, sceneAssets, logo) {
  const { theme, skin, Str } = ctx;
  const L = ctx.look.hook;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground);
  // A `media:false` pack is authored as pure typography — its Feature draws underlined lines
  // and its Montage draws label blocks, and the source's Hook has no image slot at all. Such
  // a pack shows NO imagery anywhere, and its manifest says so, so nothing collects assets it
  // would only discard.
  const asset = (skin.media === false ? null : (sceneAssets && sceneAssets[0])) || null;
  const sub = String(scene.subtext || "").slice(0, 120);
  const scrollId = `${ctx.id}-scroll`;
  let frame = "", plan = { frac: 0, natH: 0 };
  if (asset) {
    const device = S.deviceFor(asset);
    const boxW = device === "phone" ? 380 : COL - 24, boxH = device === "phone" ? 680 : 460;
    plan = S.scrollPlan(boxW, boxH, asset);
    frame = `<div data-in="item" data-i="3" style="position:absolute;left:${X(device === "phone" ? 350 : PAD)};right:${X(device === "phone" ? 350 : PAD)};top:${V(1080)};${device === "phone" ? `height:${X(730)};` : ""}">
      ${S.frameHtml(theme, skin, { device, asset, boxH, tint: hi, scrollId: plan.frac ? scrollId : null, natH: plan.natH, address: ctx.address, cardV: (L.card && L.card.v) || "frame", radius: (L.card && L.card.r) })}
    </div>`;
  }
  const mark = logo && logo.path
    ? `<img data-in="item" data-i="0" src="${esc(logo.path)}" alt="${esc(logo.alt || "logo")}" style="height:${X(64)};width:auto;max-width:${X(280)};object-fit:contain;object-position:left center;display:block;margin-bottom:${X(22)};">`
    : "";
  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(asset ? Math.min(L.top || 320, 300) : (L.top || 320))};text-align:${L.align || "left"};">
      ${mark}${kicker(theme, skin, L.kicker, scene.kicker || Str.hookKicker)}
      ${title(theme, skin, scene.headline || scene.title || ctx.title, { size: L.size || 126, fg, hi, upper: L.upper, from: 1, align: L.align || "left", maxLines: asset ? 3 : 4, ground: ctx.ground })}
      ${sub ? `<div data-in="rise" data-i="5" style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(fitPx(sub, 35, 90))};color:${rgba(fg, 0.74)};margin-top:${X(36)};max-width:${X(740)};line-height:1.45;${L.align === "center" ? "margin-left:auto;margin-right:auto;" : ""}">${esc(sub)}</div>` : ""}
    </div>
    ${frame}
  ${close()}`;
  return { html, scroll: plan.frac ? { id: scrollId, frac: plan.frac } : null };
}

// STATEMENT — the big statement in the display face and a supporting line. The problem /
// quote beat. Text-safe: needs no imagery at all.
function bStatement(scene, ctx, sceneAssets) {
  const { theme, skin } = ctx;
  const L = ctx.look.statement;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground);
  const asset = (skin.media === false ? null : (sceneAssets && sceneAssets[0])) || null;
  const sub = String(scene.subtext || "").slice(0, 140);
  const attribution = bullets(scene, 1)[0] || "";
  const frame = asset
    ? `<div data-in="item" data-i="3" style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(1180)};height:${X(430)};">
        ${S.frameHtml(theme, skin, { device: "card", asset, tint: hi, cardV: "frame", radius: 24 })}
      </div>`
    : "";
  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(asset ? Math.min(L.top || 630, 420) : (L.top || 630))};text-align:${L.align || "left"};">
      ${title(theme, skin, scene.headline || scene.title || "", { size: L.size || 160, fg, hi, upper: L.upper, from: 0, align: L.align || "left", maxLines: asset ? 3 : 4, ground: ctx.ground })}
      ${sub ? `<div data-in="rise" data-i="4" style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(fitPx(sub, 35, 100))};color:${rgba(fg, 0.7)};margin-top:${X(42)};max-width:${X(700)};line-height:1.45;${L.align === "center" ? "margin-left:auto;margin-right:auto;" : ""}">${esc(sub)}</div>` : ""}
      ${attribution && !sub ? `<div data-in="rise" data-i="4" style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(34)};color:${hi};margin-top:${X(32)};">${esc(attribution)}</div>` : ""}
    </div>
    ${frame}
  ${close()}`;
  return { html };
}

// FEATURE — the hero media card plus a row of chips. `cfg.media === false` turns it into
// the source's typographic variant: three big underlined lines instead of a picture.
function bFeature(scene, ctx, sceneAssets) {
  const { theme, skin, Str } = ctx;
  const L = ctx.look.feature;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground);
  const chips = featureLines(scene, 3);
  const chipCols = (L.chips.colors || ["accent"]).map((k) => col(theme, k));
  const fill = col(theme, L.chips.text);
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const scrollId = `${ctx.id}-scroll`;
  const head = title(theme, skin, scene.headline || scene.title || Str.featureKicker, { size: L.size || 104, fg, hi, upper: L.upper, from: 0, maxLines: 2, ground: ctx.ground });

  if (skin.media === false) {
    const lines = chips.length ? chips : [Str.featureKicker];
    return {
      html: `${open(ctx)}
      <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(L.top || 250)};">
        ${head}
        <div style="margin:${X(52)} 0 ${X(10)};display:flex;flex-direction:column;gap:${X(30)};">
          ${lines.map((c, i) => `<div data-in="item" data-i="${i + 2}" style="font-family:${theme.displayStack};font-size:${F(74)};line-height:1.05;color:${i === 1 ? hi : fg};border-bottom:${X(3)} solid ${rgba(i === 1 ? hi : fg, 0.5)};padding-bottom:${X(22)};">${esc(c)}</div>`).join("")}
        </div>
      </div>
    ${close()}`,
    };
  }
  const rad = L.card && L.card.r != null ? L.card.r : 28;
  const plan = S.scrollPlan(936, 588, asset);
  const media = `<div data-in="item" data-i="2" style="${cardCss(L, theme)}">
      <div style="position:relative;width:100%;height:100%;border-radius:${X(Math.max(6, rad - 10))};overflow:hidden;background:${rgba(hi, 0.14)};">
        ${S.plate(theme, { asset, scrollId: plan.frac ? scrollId : null, natH: plan.natH, tint: hi })}
      </div>
    </div>`;
  return {
    html: `${open(ctx)}
      <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(L.top || 250)};">
        ${head}
        ${media}
        <div style="display:flex;flex-wrap:wrap;gap:${X(16)};justify-content:${L.chips.center ? "center" : "flex-start"};">
          ${chips.map((c, i) => `<span data-in="item" data-i="${i + 4}" style="padding:${X(14)} ${X(27)};font-family:${theme.bodyStack};font-weight:800;font-size:${F(27)};white-space:nowrap;max-width:${X(820)};overflow:hidden;text-overflow:ellipsis;${chipCss(L.chips.v, chipCols[i % chipCols.length], fill, i)}">${esc(c)}</span>`).join("")}
        </div>
      </div>
    ${close()}`,
    scroll: plan.frac ? { id: scrollId, frac: plan.frac } : null,
  };
}

// MONTAGE — the 2x2 tile wall, each tile rotated by the pack's own tilt list. Short walls
// degrade to the pack's colour blocks rather than empty holes.
function bMontage(scene, ctx, sceneAssets) {
  const { theme, skin, Str } = ctx;
  const L = ctx.look.montage;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground);
  const tilts = L.tilts || [-3, 2.5, 2, -2.5];
  const tbg = col(theme, L.tile.bg), tlabel = col(theme, L.tile.label);
  const rad = L.tile.r == null ? 22 : L.tile.r;
  const shots = (sceneAssets || []).slice(0, 4);
  const labels = featureLines(scene, 4);
  const tiles = (labels.length >= 2 ? labels : (Str.tiles || ["Home", "Detail", "Mobile", "Dashboard"])).slice(0, 4);
  const n = Math.max(shots.length, Math.min(tiles.length, 4)) || 4;
  const glow = L.tile.glow ? col(theme, L.tile.glow) : null;

  if (skin.media === false) {
    return {
      html: `${open(ctx)}
      <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(L.top || 258)};">
        ${title(theme, skin, scene.headline || scene.title || "", { size: L.size || 102, fg, hi, upper: L.upper, maxLines: 2, ground: ctx.ground })}
        <div style="margin-top:${X(54)};display:grid;grid-template-columns:1fr 1fr;gap:${X(26)};">
          ${tiles.slice(0, 4).map((label, i) => `<div data-in="item" data-i="${i + 2}" style="transform:rotate(${tilts[i % tilts.length]}deg);"><div style="height:${X(250)};border-radius:${X(rad)};background:${tbg};display:flex;align-items:center;justify-content:center;font-family:${theme.displayStack};font-size:${F(52)};color:${tlabel};${L.upper ? "text-transform:uppercase;" : ""}padding:${X(16)};text-align:center;line-height:1.05;">${esc(shortLabel(label, 22))}</div></div>`).join("")}
        </div>
      </div>
    ${close()}`,
    };
  }
  // A single column when there are only one or two tiles — a 2x2 grid half-empty reads as a
  // bug, a taller single column reads as a choice.
  const single = n <= 2;
  return {
    html: `${open(ctx)}
      <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(L.top || 258)};">
        ${title(theme, skin, scene.headline || scene.title || "", { size: L.size || 102, fg, hi, upper: L.upper, maxLines: 2, ground: ctx.ground })}
        <div style="margin-top:${X(54)};display:grid;grid-template-columns:${single ? "1fr" : "1fr 1fr"};gap:${X(26)};">
          ${Array.from({ length: n }).map((_, i) => {
            const a = shots[i] || null;
            const label = shortLabel(tiles[i] || (Str.tiles || [])[i] || "", 22);
            return `<div data-in="item" data-i="${i + 2}" style="transform:rotate(${tilts[i % tilts.length]}deg);">
              <div style="height:${X(single ? 380 : 292)};border-radius:${X(rad)};background:${tbg};padding:${X(11)};${glow ? `border:1px solid ${rgba(glow, 0.55)};box-shadow:0 0 ${X(26)} ${rgba(glow, 0.2)};` : `box-shadow:0 ${X(20)} ${X(44)} rgba(10,10,12,0.3);`}">
                <div style="position:relative;width:100%;height:100%;border-radius:${X(Math.max(4, rad - 9))};overflow:hidden;background:${rgba(hi, 0.16)};">
                  ${a ? S.plate(theme, { asset: a, tint: hi }) : `<div style="position:absolute;inset:0;background:${rgba(hi, i % 2 ? 0.55 : 0.3)};"></div>`}
                </div>
              </div>
              ${label ? `<div style="font-family:${theme.displayStack};font-size:${F(L.tile.labelSize || 28)};color:${tlabel};margin-top:${X(13)};text-align:center;${L.upper ? "text-transform:uppercase;" : ""}">${esc(label)}</div>` : ""}
            </div>`;
          }).join("")}
        </div>
      </div>
    ${close()}`,
  };
}

// STATS — up to three counting figures with labels, optionally ruled and glowing. The
// counters are a scrubbed numeric proxy so a seek to any time shows the right number, and
// the element's RESTING text is already the final value.
function bStats(scene, ctx, sceneAssets) {
  const { theme, skin, Str } = ctx;
  const L = ctx.look.stats;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground);
  const cols = (L.cols || ["accent"]).map((k) => col(theme, k));
  const stats = pickStats(scene, 3, Str);
  const asset = (skin.media === false ? null : (sceneAssets && sceneAssets[0])) || null;
  const num = L.num || 156;
  const rows = (stats.length ? stats : [{ pre: "", target: 100, suf: "%", label: Str.metric }]).map((st, i) => {
    const c = cols[i % cols.length];
    return `<div data-in="rise" data-i="${i + 2}" style="display:flex;align-items:baseline;gap:${X(30)};${L.rule ? `border-bottom:${X(4)} solid ${c};padding-bottom:${X(24)};` : ""}">
      <div style="font-family:${theme.displayStack};font-size:${F(num)};line-height:0.9;color:${c};font-variant-numeric:tabular-nums;${L.glowNums ? `text-shadow:0 0 ${X(36)} ${rgba(c, 0.5)};` : ""}white-space:nowrap;"><span data-count="${st.target}" data-suffix="${esc(st.suf || "")}">${esc(st.pre)}${st.target}${esc(st.suf || "")}</span></div>
      <div style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(33)};color:${rgba(fg, 0.76)};max-width:${X(440)};line-height:1.35;">${esc(st.label)}</div>
    </div>`;
  }).join("");
  // A proof beat the director assigned a capture to should SHOW it — dimmed, behind the
  // counters, the way a proof scene is shot in any real product film.
  const backing = asset ? S.backingPlate(asset, V(700), X(900)) : "";
  return {
    html: `${open(ctx)}
      ${backing}
      <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(L.top || 410)};">
        ${title(theme, skin, scene.headline || scene.title || Str.statsKicker, { size: L.size || 102, fg, hi, upper: L.upper, maxLines: 2, ground: ctx.ground })}
        <div style="margin-top:${X(62)};display:flex;flex-direction:column;gap:${X(L.rule ? 42 : 52)};">${rows}</div>
      </div>
    ${close()}`,
  };
}

// CTA — the logo lockup, the closing line, the button and the address.
function bCta(scene, ctx, _sceneAssets, logo) {
  const { theme, skin, Str } = ctx;
  const L = ctx.look.cta;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground);
  const bbg = col(theme, L.btn.bg), bc = col(theme, L.btn.c);
  const center = (L.align || "center") === "center";
  const btnV = L.btn.v === "block" ? `border-radius:${X(10)};`
    : L.btn.v === "glow" ? `border-radius:${X(12)};box-shadow:0 0 ${X(52)} ${rgba(bbg, 0.55)};`
      : `border-radius:999px;box-shadow:0 ${X(22)} ${X(54)} rgba(10,10,12,0.35);`;
  const shape = L.logoShape === "rounded" ? X(20) : "999px";
  // NEVER DRAW AN EMPTY CONTAINER: with no logo the lockup disc is dropped entirely rather
  // than drawn around nothing.
  const lock = logo && logo.path
    ? `<div data-in="item" data-i="0" style="width:${X(148)};height:${X(148)};border-radius:${shape};overflow:hidden;background:${rgba(fg, 0.08)};margin:${center ? `0 auto ${X(42)}` : `0 0 ${X(42)}`};display:flex;align-items:center;justify-content:center;">
         <img src="${esc(logo.path)}" alt="${esc(logo.alt || "logo")}" style="width:100%;height:100%;object-fit:contain;display:block;">
       </div>`
    : "";
  const cta = String(scene.cta || Str.ctaButton);
  const url = ctx.address;
  return {
    html: `${open(ctx)}
      <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(L.top || 470)};text-align:${center ? "center" : "left"};">
        ${lock}
        ${title(theme, skin, scene.headline || scene.title || Str.ctaTagline, { size: L.size || 126, fg, hi, upper: L.upper, from: 1, align: center ? "center" : "left", maxLines: 3, ground: ctx.ground })}
        <div data-in="item" data-i="4" style="display:inline-flex;align-items:center;gap:${X(15)};margin-top:${X(52)};padding:${X(26)} ${X(54)};font-family:${theme.displayStack};font-size:${F(43)};background:${bbg};color:${bc};${btnV}">
          ${esc(cta)}
          <svg width="${X(34)}" height="${X(34)}" viewBox="0 0 24 24" fill="none" stroke="${bc}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
        </div>
        ${url ? `<div data-in="rise" data-i="5" style="font-family:${theme.bodyStack};font-weight:800;font-size:${F(35)};color:${fg};margin-top:${X(42)};">${esc(url)}</div>` : ""}
      </div>
    ${close()}`,
  };
}

// ============================ THE TEN INTERACTION BEATS ============================
// Each returns a `mech` descriptor; film_runtime recomputes its state on every seek.

// TYPING — caret / terminal / typewriter / hand.
function bTyping(scene, ctx, _a, _logo, variant) {
  const { theme, skin, Str } = ctx;
  const L = ctx.look.app;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground), line = col(theme, L.line);
  const v = variant || "caret";
  const text = String(scene.subtext || featureLines(scene, 1)[0] || scene.headline || "").slice(0, 120);
  const prompt = scene.kicker || Str.featureKicker;
  const stamp = Str.stamp;
  const id = ctx.id;
  const mech = { kind: "typing", id, v, lines: [text], total: text.length, a: 0.1, b: 0.78 };

  if (v === "terminal") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2" style="${panelCss(ctx, 480, `background:#10131a;border:1px solid ${rgba(hi, 0.4)};padding:${X(40)};`)}">
          ${prompt ? `<div style="font-family:${theme.monoStack};font-size:${F(24)};color:rgba(154,164,178,0.7);margin-bottom:${X(26)};">${esc("# " + prompt)}</div>` : ""}
          <div style="font-family:${theme.monoStack};font-size:${F(34)};line-height:1.6;color:#e6edf3;word-break:break-word;">
            <span style="color:${hi};">$ </span><span id="${id}-l0">${esc(text)}</span><span id="${id}-c0" style="color:${hi};">█</span>
          </div>
          <div id="${id}-out" style="font-family:${theme.monoStack};font-size:${F(30)};color:#27c93f;margin-top:${X(30)};opacity:1;">${esc("› " + stamp)}</div>
        </div>`),
      mech,
    };
  }
  if (v === "typewriter") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2">
          ${prompt ? `<div style="font-family:${theme.bodyStack};font-weight:800;font-size:${F(24)};letter-spacing:.2em;color:${rgba(fg, 0.55)};margin-bottom:${X(34)};">${esc(prompt)}</div>` : ""}
          <div style="font-family:${theme.displayStack};font-size:${F(76)};line-height:1.3;color:${fg};min-height:${X(400)};word-break:break-word;"><span id="${id}-l0">${esc(text)}</span><span id="${id}-c0" style="color:${hi};">_</span></div>
          <div id="${id}-out" style="display:inline-block;padding:${X(12)} ${X(28)};border:${X(4)} double ${hi};color:${hi};font-family:${theme.displayStack};font-size:${F(36)};transform:rotate(-2deg);margin-top:${X(24)};opacity:1;">${esc(stamp)}</div>
        </div>`),
      mech,
    };
  }
  if (v === "hand") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2">
          ${prompt ? `<div style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(25)};letter-spacing:.14em;color:${rgba(fg, 0.55)};margin-bottom:${X(34)};">${esc(prompt)}</div>` : ""}
          <div style="display:flex;flex-wrap:wrap;gap:${X(10)} ${X(22)};min-height:${X(380)};align-content:flex-start;">
            ${text.split(/\s+/).filter(Boolean).map((w, i) => `<span data-in="item" data-i="${i + 3}" style="font-family:${theme.displayStack};font-size:${F(82)};line-height:1.15;color:${i % 4 === 2 ? hi : fg};display:inline-block;transform:rotate(${i % 2 ? 2 : -2.6}deg);">${esc(w)}</span>`).join("")}
          </div>
          <div id="${id}-out" style="display:inline-block;margin-top:${X(26)};font-family:${theme.displayStack};font-size:${F(40)};color:${hi};border-bottom:${X(6)} solid ${hi};padding-bottom:${X(6)};transform:rotate(-1.5deg);opacity:1;">${esc(stamp)}</div>
        </div>`),
      // The hand variant reveals whole WORDS as staggered elements, not characters, so it
      // needs no per-frame budget — the entrance stagger is the mechanic.
      mech: null,
    };
  }
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div data-in="item" data-i="2">
        ${prompt ? `<div style="font-family:${theme.bodyStack};font-weight:800;font-size:${F(25)};letter-spacing:.18em;color:${rgba(fg, 0.55)};margin-bottom:${X(30)};">${esc(prompt)}</div>` : ""}
        <div style="font-family:${theme.displayStack};font-size:${F(84)};line-height:1.14;color:${fg};min-height:${X(420)};border-left:${X(10)} solid ${hi};padding-left:${X(40)};word-break:break-word;"><span id="${id}-l0">${esc(text)}</span><span id="${id}-c0" style="color:${hi};">|</span></div>
        <div id="${id}-out" style="display:inline-block;margin-top:${X(40)};padding:${X(14)} ${X(30)};border:${X(4)} solid ${hi};border-radius:${X(12)};color:${hi};font-family:${theme.displayStack};font-size:${F(38)};transform:rotate(-3deg);opacity:1;">${esc(stamp)}</div>
      </div>`),
    mech,
  };
}

// CODE — editor / terminal / diff. The lines are the scene's own bullet copy rendered as
// code, so the beat is about THIS film rather than a lorem snippet.
function bCode(scene, ctx, _a, _logo, variant) {
  const { theme, Str } = ctx;
  const L = ctx.look.app;
  const hi = ink(theme, L.hi, ctx.ground);
  const v = variant || "editor";
  const id = ctx.id;
  const raw = featureLines(scene, 4);
  const lines = (raw.length ? raw : [String(scene.subtext || scene.headline || "").slice(0, 48)]).map((s) => shortLabel(s, 42));
  const total = lines.reduce((a, l) => a + l.length, 0) || 1;
  const out = Str.stamp;
  const mech = { kind: "code", id, v, lines, total, a: 0.08, b: v === "editor" ? 0.72 : 0.7 };

  if (v === "diff") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2" style="${panelCss(ctx, 700, `background:#10131a;border:1px solid ${rgba(hi, 0.4)};`)}">
          <div style="font-family:${theme.monoStack};font-size:${F(22)};color:rgba(154,164,178,0.6);margin-bottom:${X(22)};">${esc(`● changes (${lines.length})`)}</div>
          ${lines.map((ln, i) => {
            const add = i % 2 === 0;
            const c = add ? "#3fb950" : "#e6edf3";
            const bg = add ? "rgba(63,185,80,0.12)" : "transparent";
            return `<div data-in="machete" data-i="${i}" style="font-family:${theme.monoStack};font-size:${F(29)};line-height:1.8;color:${c};background:${bg};padding:${X(2)} ${X(14)};border-radius:${X(6)};white-space:pre-wrap;word-break:break-word;">${esc((add ? "+ " : "  ") + ln)}</div>`;
          }).join("")}
          <div id="${id}-out" style="display:inline-block;margin-top:${X(28)};padding:${X(12)} ${X(26)};border-radius:${X(8)};background:${rgba(hi, 0.16)};border:1px solid ${hi};color:${hi};font-family:${theme.monoStack};font-size:${F(27)};opacity:1;">${esc(out)}</div>
        </div>`),
      mech: null,       // the diff reveals whole rows on a stagger, not per character
    };
  }
  if (v === "terminal") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2" style="${panelCss(ctx, 700, `background:#0c0f14;border:1px solid ${rgba(hi, 0.45)};padding:${X(40)};`)}">
          ${lines.map((ln, i) => `<div style="font-family:${theme.monoStack};font-size:${F(31)};line-height:1.9;color:#d8e2ec;white-space:pre-wrap;word-break:break-word;"><span style="color:${hi};">$ </span><span id="${id}-l${i}">${esc(ln)}</span><span id="${id}-c${i}" style="color:${hi};">█</span></div>`).join("")}
          <div id="${id}-out" style="font-family:${theme.monoStack};font-size:${F(31)};color:#27c93f;margin-top:${X(16)};opacity:1;">${esc("✔ " + out)}</div>
        </div>`),
      mech,
    };
  }
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div data-in="item" data-i="2" style="${panelCss(ctx, 700, `background:#10131a;border:1px solid ${rgba(hi, 0.4)};`)}">
        <div style="display:flex;gap:${X(10)};margin-bottom:${X(26)};">
          <span style="width:${X(16)};height:${X(16)};border-radius:999px;background:#ff5f56;"></span>
          <span style="width:${X(16)};height:${X(16)};border-radius:999px;background:#ffbd2e;"></span>
          <span style="width:${X(16)};height:${X(16)};border-radius:999px;background:#27c93f;"></span>
        </div>
        ${lines.map((ln, i) => `<div style="font-family:${theme.monoStack};font-size:${F(30)};line-height:1.75;color:#e6edf3;white-space:pre-wrap;word-break:break-word;"><span style="color:rgba(154,164,178,0.4);margin-right:${X(26)};">${String(i + 1).padStart(2, " ")}</span><span id="${id}-l${i}">${esc(ln)}</span><span id="${id}-c${i}" style="color:${hi};">█</span></div>`).join("")}
        <div id="${id}-out" style="display:inline-block;margin-top:${X(30)};padding:${X(12)} ${X(26)};border-radius:${X(8)};background:${rgba(hi, 0.16)};border:1px solid ${hi};color:${hi};font-family:${theme.monoStack};font-size:${F(27)};opacity:1;">${esc(out)}</div>
      </div>`),
    mech,
  };
}

// SCROLL — feed / board / ticker / stack.
function bScroll(scene, ctx, _a, _logo, variant) {
  const { theme, Str } = ctx;
  const L = ctx.look.app;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground), line = col(theme, L.line);
  const v = variant || "feed";
  const id = ctx.id;
  const src = featureLines(scene, 7);
  const items = (src.length ? src : [Str.metric]).map((t) => shortLabel(t, 34));

  if (v === "board") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2" style="${panelCss(ctx, null, `padding:${X(26)} ${X(34)};`)}">
          ${items.slice(0, 7).map((t, i) => `<div id="${id}-r${i}" style="display:flex;align-items:center;gap:${X(22)};padding:${X(17)} 0;border-bottom:1px solid ${rgba(line, 0.12)};transform-origin:top;">
            <span style="font-family:${theme.monoStack};font-size:${F(26)};color:${hi};background:${rgba(hi, 0.12)};padding:${X(5)} ${X(12)};border-radius:${X(6)};flex:none;">${String(i + 1).padStart(2, "0")}</span>
            <span style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(31)};color:${line};min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(t)}</span>
            <span style="flex:1;border-bottom:${X(3)} dotted ${rgba(line, 0.3)};margin:0 ${X(6)};height:1px;"></span>
          </div>`).join("")}
        </div>`),
      mech: { kind: "board", id, n: Math.min(items.length, 7) },
    };
  }
  if (v === "ticker") {
    const row = items.join("   •   ");
    const rep = `${row}   •   ${row}   •   ${row}`;
    const cols = [fg, hi, rgba(fg, 0.5)];
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div style="margin-top:${X(20)};display:flex;flex-direction:column;gap:${X(40)};overflow:hidden;">
          ${[0, 1, 2].map((k) => `<div id="${id}-t${k}" style="white-space:nowrap;font-family:${theme.displayStack};font-size:${F(66 - k * 8)};line-height:1.2;color:${cols[k]};">${esc(rep)}</div>`).join("")}
          <div data-in="rise" data-i="5" style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(30)};color:${rgba(fg, 0.65)};margin-top:${X(20)};">${esc(`${items.length} entries · live`)}</div>
        </div>`),
      mech: { kind: "ticker", id },
    };
  }
  if (v === "stack") {
    const n = Math.min(items.length, 5);
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2" style="position:relative;height:${X(470)};">
          ${Array.from({ length: n }).map((_, i) => `<div id="${id}-card${i}" style="${panelCss(ctx, 360, `padding:${X(44)};`)}position:absolute;left:0;right:0;top:0;">
            <div style="font-family:${theme.displayStack};font-size:${F(56)};line-height:1.12;color:${line};">${esc(items[i])}</div>
          </div>`).join("")}
          <div id="${id}-count" style="position:absolute;bottom:0;left:0;font-family:${theme.monoStack};font-size:${F(26)};color:${rgba(fg, 0.6)};">1 / ${n}</div>
        </div>`),
      mech: { kind: "stack", id, n },
    };
  }
  const rowH = 118, viewH = 840;
  const inner = items.length * rowH;
  const travel = Math.max(0, inner - (viewH - 60));
  const thumb = Math.max(14, ((viewH - 60) / Math.max(inner, 1)) * 100);
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div data-in="item" data-i="2" style="${panelCss(ctx, viewH)}">
        <div style="position:absolute;top:${X(30)};bottom:${X(30)};left:${X(30)};right:${X(60)};overflow:hidden;">
          <div id="${id}-inner" style="will-change:transform;">
            ${items.map((t, i) => `<div style="height:${X(rowH)};display:flex;align-items:center;gap:${X(26)};border-bottom:1px solid ${rgba(line, 0.14)};">
              <span style="font-family:${theme.displayStack};font-size:${F(30)};color:${hi};width:${X(66)};flex:none;">${String(i + 1).padStart(2, "0")}</span>
              <span style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(32)};color:${line};flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(t)}</span>
            </div>`).join("")}
          </div>
        </div>
        <div style="position:absolute;top:${X(30)};bottom:${X(30)};right:${X(22)};width:${X(10)};border-radius:999px;background:${rgba(line, 0.12)};">
          <div id="${id}-thumb" style="position:absolute;left:0;right:0;border-radius:999px;background:${hi};height:${r(thumb)}%;top:0;"></div>
        </div>
      </div>`),
    mech: { kind: "scroll", id, travel: Math.round(travel), thumb: r(thumb) },
  };
}

// RING — ring / gauge / bar. One eased sweep to a target read out of the scene's own copy.
function bRing(scene, ctx, _a, _logo, variant) {
  const { theme, Str } = ctx;
  const L = ctx.look.app;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground);
  const v = variant || "ring";
  const id = ctx.id;
  const picked = S.pickNumber(scene);
  const to = picked ? clamp(picked.target, 1, 100) : 100;
  const unit = picked && picked.suf ? picked.suf : "%";
  const label = shortLabel(scene.subtext || scene.emphasis || Str.metric, 26);
  const sub = String(scene.subtext || "").slice(0, 110);
  const numHtml = `<div style="font-family:${theme.displayStack};font-size:${F(130)};color:${fg};font-variant-numeric:tabular-nums;line-height:1;"><span id="${id}-n">${to}</span><span style="font-size:${F(64)};color:${hi};">${esc(unit)}</span></div>`;

  if (v === "gauge") {
    const arcLen = Math.PI * 220;
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2" style="display:flex;flex-direction:column;align-items:center;margin-top:${X(30)};">
          <div style="position:relative;width:${X(560)};height:${X(340)};">
            <svg width="100%" height="100%" viewBox="0 0 560 340" style="position:absolute;inset:0;">
              <path d="M 60 300 A 220 220 0 0 1 500 300" fill="none" stroke="${rgba(fg, 0.15)}" stroke-width="30" stroke-linecap="round"/>
              <path id="${id}-arc" d="M 60 300 A 220 220 0 0 1 500 300" fill="none" stroke="${hi}" stroke-width="30" stroke-linecap="round" stroke-dasharray="${r(arcLen)}" stroke-dashoffset="0"/>
              <g id="${id}-needle" transform="rotate(${r(-90 + (to / 100) * 180)} 280 300)">
                <line x1="280" y1="300" x2="280" y2="118" stroke="${fg}" stroke-width="8" stroke-linecap="round"/>
                <circle cx="280" cy="300" r="20" fill="${fg}"/>
              </g>
              <circle cx="280" cy="300" r="9" fill="${hi}"/>
            </svg>
          </div>
          <div style="margin-top:${X(20)};text-align:center;">${numHtml}
            <div style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(30)};color:${rgba(fg, 0.65)};margin-top:${X(14)};">${esc(label)}</div></div>
          ${sub ? `<div data-in="rise" data-i="5" style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(33)};color:${rgba(fg, 0.72)};text-align:center;max-width:${X(720)};line-height:1.45;margin-top:${X(24)};">${esc(sub)}</div>` : ""}
        </div>`),
      mech: { kind: "ring", id, v, to, len: r(arcLen) },
    };
  }
  if (v === "bar") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2" style="display:flex;align-items:center;gap:${X(56)};margin-top:${X(30)};">
          <div style="position:relative;width:${X(210)};height:${X(500)};flex:none;">
            <div style="position:absolute;top:${X(-22)};left:${X(65)};width:${X(80)};height:${X(22)};border-radius:${X(8)} ${X(8)} 0 0;background:${rgba(fg, 0.3)};"></div>
            <div style="position:absolute;inset:0;border:${X(5)} solid ${rgba(fg, 0.35)};border-radius:${X(28)};overflow:hidden;">
              <div id="${id}-bar" style="position:absolute;left:${X(8)};right:${X(8)};bottom:${X(8)};height:calc(${to}% - 8px);min-height:${X(8)};border-radius:${X(18)};background:${hi};"></div>
            </div>
          </div>
          <div>${numHtml}
            <div style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(30)};color:${rgba(fg, 0.65)};margin-top:${X(16)};">${esc(label)}</div>
            ${sub ? `<div style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(31)};color:${rgba(fg, 0.72)};max-width:${X(520)};line-height:1.45;margin-top:${X(20)};">${esc(sub)}</div>` : ""}
          </div>
        </div>`),
      mech: { kind: "ring", id, v, to, len: 0 },
    };
  }
  const rr = 240, C = 2 * Math.PI * rr;
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div data-in="item" data-i="2" style="display:flex;flex-direction:column;align-items:center;margin-top:${X(30)};gap:${X(30)};">
        <div style="position:relative;width:${X(560)};height:${X(560)};">
          <svg width="100%" height="100%" viewBox="0 0 560 560" style="position:absolute;inset:0;">
            ${Array.from({ length: 12 }).map((_, i) => {
              const a = (i * Math.PI) / 6;
              return `<line x1="${r(280 + Math.cos(a) * 268)}" y1="${r(280 + Math.sin(a) * 268)}" x2="${r(280 + Math.cos(a) * 254)}" y2="${r(280 + Math.sin(a) * 254)}" stroke="${rgba(fg, 0.3)}" stroke-width="4"/>`;
            }).join("")}
            <circle cx="280" cy="280" r="${rr}" fill="none" stroke="${rgba(fg, 0.14)}" stroke-width="30"/>
            <circle id="${id}-arc" cx="280" cy="280" r="${rr}" fill="none" stroke="${hi}" stroke-width="30" stroke-linecap="round" stroke-dasharray="${r(C)}" stroke-dashoffset="0" transform="rotate(-90 280 280)"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">${numHtml}
            <div style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(30)};color:${rgba(fg, 0.65)};margin-top:${X(14)};">${esc(label)}</div></div>
        </div>
        ${sub ? `<div data-in="rise" data-i="5" style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(33)};color:${rgba(fg, 0.72)};text-align:center;max-width:${X(720)};line-height:1.45;">${esc(sub)}</div>` : ""}
      </div>`),
    mech: { kind: "ring", id, v, to, len: r(C) },
  };
}

// TOGGLE — switch / check / dial.
function bToggle(scene, ctx, _a, _logo, variant) {
  const { theme, Str } = ctx;
  const L = ctx.look.app;
  const hi = ink(theme, L.hi, ctx.ground), line = col(theme, L.line), cardBg = col(theme, L.cardBg);
  const v = variant || "switch";
  const id = ctx.id;
  const src = featureLines(scene, 4);
  const items = (src.length ? src : [Str.metric]).slice(0, 4).map((t) => shortLabel(t, 30));
  const mech = { kind: "toggle", id, v, n: items.length, on: hi, off: rgba(line, 0.22), onInk: line, offInk: rgba(line, 0.55) };

  if (v === "check") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div style="display:flex;flex-direction:column;gap:${X(24)};">
          ${items.map((label, i) => `<div data-in="item" data-i="${i + 2}" style="${panelCss(ctx, 116, `padding:0 ${X(34)};display:flex;align-items:center;gap:${X(28)};`)}">
            <div id="${id}-t${i}" style="width:${X(52)};height:${X(52)};border-radius:${X(12)};flex:none;border:${X(3)} solid ${hi};background:${hi};display:flex;align-items:center;justify-content:center;">
              <svg id="${id}-k${i}" width="60%" height="60%" viewBox="0 0 24 24" fill="none" stroke="${cardBg}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>
            </div>
            <span id="${id}-lb${i}" style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(33)};color:${line};min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(label)}</span>
          </div>`).join("")}
        </div>`),
      mech: { ...mech, off: hi },
    };
  }
  if (v === "dial") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:${X(26)};">
          ${items.map((label, i) => `<div data-in="item" data-i="${i + 2}" style="${panelCss(ctx, 250, `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${X(18)};`)}">
            <div style="width:${X(104)};height:${X(104)};border-radius:999px;border:${X(6)} solid ${rgba(line, 0.25)};position:relative;background:${rgba(line, 0.05)};">
              <div id="${id}-k${i}" style="position:absolute;left:${X(43)};top:${X(6)};width:${X(6)};height:${X(34)};border-radius:${X(4)};background:${hi};transform-origin:${X(3)} ${X(40)};transform:rotate(${r(-120 + (150 + (i % 3) * 35))}deg);"></div>
            </div>
            <span style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(26)};color:${line};text-align:center;">${esc(label)}</span>
          </div>`).join("")}
        </div>`),
      mech,
    };
  }
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div style="display:flex;flex-direction:column;gap:${X(24)};">
        ${items.map((label, i) => `<div data-in="item" data-i="${i + 2}" style="${panelCss(ctx, 118, `padding:0 ${X(36)};display:flex;align-items:center;justify-content:space-between;gap:${X(20)};`)}">
          <span id="${id}-lb${i}" style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(33)};color:${line};min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(label)}</span>
          <div id="${id}-t${i}" style="width:${X(104)};height:${X(56)};border-radius:999px;background:${hi};position:relative;flex:none;">
            <div id="${id}-k${i}" style="position:absolute;top:${X(7)};left:${X(7)};width:${X(42)};height:${X(42)};border-radius:999px;background:#fff;box-shadow:0 ${X(3)} ${X(8)} rgba(0,0,0,0.3);transform:translateX(${X(48)});"></div>
          </div>
        </div>`).join("")}
      </div>`),
    mech,
  };
}

// NOTIFY — drop / side / pop.
function bNotify(scene, ctx, _a, _logo, variant) {
  const { theme, Str } = ctx;
  const L = ctx.look.app;
  const hi = ink(theme, L.hi, ctx.ground), line = col(theme, L.line), cardBg = col(theme, L.cardBg);
  const v = variant || "drop";
  const id = ctx.id;
  const src = featureLines(scene, 3);
  const notes = (src.length ? src : [Str.metric]).slice(0, 3).map((t) => {
    const parts = String(t).split(/\s+[—–-]\s+|:\s+/);
    return parts.length > 1 ? [shortLabel(parts[0], 24), shortLabel(parts.slice(1).join(" "), 34)] : [shortLabel(t, 24), ""];
  });
  const rots = [-3, 2.5, -1.5];
  const mech = { kind: "notify", id, v, n: notes.length, rot: rots };

  if (v === "side") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div style="display:flex;flex-direction:column;gap:${X(26)};">
          ${notes.map((nt, i) => `<div id="${id}-n${i}" style="${panelCss(ctx, 158, `padding:${X(24)} ${X(32)} ${X(18)};`)}">
            <div style="font-family:${theme.bodyStack};font-weight:800;font-size:${F(29)};color:${line};">${esc(nt[0])}</div>
            ${nt[1] ? `<div style="font-family:${theme.bodyStack};font-weight:500;font-size:${F(25)};color:${rgba(line, 0.65)};margin-top:${X(5)};">${esc(nt[1])}</div>` : ""}
            <div id="${id}-life${i}" style="position:absolute;left:0;bottom:0;height:${X(6)};width:100%;background:${hi};border-radius:${X(3)};"></div>
          </div>`).join("")}
        </div>`),
      mech,
    };
  }
  if (v === "pop") {
    const offs = [0, 110, 30];
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div style="display:flex;flex-direction:column;gap:${X(34)};margin-top:${X(10)};">
          ${notes.map((nt, i) => `<div id="${id}-n${i}" style="align-self:flex-start;margin-left:${X(offs[i])};${panelCss(ctx, null, `padding:${X(22)} ${X(34)};border-radius:999px;display:flex;align-items:center;gap:${X(20)};border:${X(2)} solid ${rgba(hi, 0.6)};`)}">
            <span style="width:${X(16)};height:${X(16)};border-radius:999px;background:${hi};flex:none;"></span>
            <span style="font-family:${theme.bodyStack};font-weight:800;font-size:${F(29)};color:${line};">${esc(nt[0])}</span>
            ${nt[1] ? `<span style="font-family:${theme.bodyStack};font-weight:500;font-size:${F(24)};color:${rgba(line, 0.6)};">${esc(nt[1])}</span>` : ""}
          </div>`).join("")}
        </div>`),
      mech,
    };
  }
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div style="display:flex;flex-direction:column;gap:${X(26)};">
        ${notes.map((nt, i) => `<div id="${id}-n${i}" style="${panelCss(ctx, 150, `padding:${X(26)} ${X(32)};display:flex;gap:${X(24)};align-items:center;`)}">
          <div style="width:${X(66)};height:${X(66)};border-radius:${X(18)};background:${hi};color:${cardBg};display:flex;align-items:center;justify-content:center;font-family:${theme.displayStack};font-size:${F(34)};flex:none;">${esc(String(theme.brand || "A")[0])}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-family:${theme.bodyStack};font-weight:800;font-size:${F(29)};color:${line};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(nt[0])}</div>
            ${nt[1] ? `<div style="font-family:${theme.bodyStack};font-weight:500;font-size:${F(25)};color:${rgba(line, 0.65)};margin-top:${X(4)};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(nt[1])}</div>` : ""}
          </div>
          <span style="font-family:${theme.bodyStack};font-size:${F(22)};color:${rgba(line, 0.45)};flex:none;">now</span>
        </div>`).join("")}
      </div>`),
    mech,
  };
}

// MORPH — roll / fade / flap. One word transforming through a list of steps.
function bMorph(scene, ctx, _a, _logo, variant) {
  const { theme, skin, Str } = ctx;
  const L = ctx.look.app;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground);
  const v = variant || "roll";
  const id = ctx.id;
  const src = featureLines(scene, 4).map((t) => shortLabel(t, 14).replace(/…$/, ""));
  const steps = (src.length >= 2 ? src : [String(scene.emphasis || scene.headline || Str.metric).split(/\s+/)[0] || "ONE", "TWO", "THREE"]).slice(0, 4);
  const upper = ctx.look.app.upper;
  const words = steps.map((s) => (upper ? String(s).toUpperCase() : String(s)));
  const prefix = scene.kicker || "";
  const sub = String(scene.subtext || "").slice(0, 110);
  const maxLen = Math.max(...words.map((w) => w.length));
  // THE MORPH WORD IS SET nowrap, SO IT HAS TO BE FITTED. The source hardcodes 150px because
  // its authored steps are short ("LIGHT", "MEDIUM", "DARK"); KEYFRAME derives the steps from
  // the scene's own copy, and a 14-character word at 150px in a wide display face measured
  // 1571px against a 936px column — half the word off-frame. Same arithmetic as fitLines:
  // the column divided by the longest step's advance, and it only ever shrinks.
  const morphPx = Math.min(150, Math.floor((COL * 0.97) / Math.max(1, maxLen * skin.em)));

  let wordHtml;
  if (v === "flap") {
    const cw = Math.max(44, Math.min(92, Math.floor(830 / Math.max(maxLen, 1)) - 9));
    wordHtml = `<div style="display:flex;flex-wrap:nowrap;">${Array.from({ length: maxLen }).map((_, i) =>
      `<span id="${id}-ch${i}" style="display:inline-flex;align-items:center;justify-content:center;width:${X(cw)};height:${X(Math.round(cw * 1.62))};margin:0 ${X(4)};background:${rgba(fg, 0.1)};border:1px solid ${rgba(fg, 0.2)};border-radius:${X(Math.max(6, Math.round(cw * 0.13)))};font-family:${theme.displayStack};font-size:${F(Math.round(cw * 1.1))};color:${hi};white-space:pre;">${esc(words[0][i] || " ")}</span>`).join("")}</div>`;
  } else if (v === "fade") {
    wordHtml = `<div style="position:relative;height:${X(190)};">
      <div id="${id}-a" style="position:absolute;font-family:${theme.displayStack};font-size:${F(morphPx)};line-height:${X(190)};color:${hi};transform-origin:left center;white-space:nowrap;">${esc(words[0])}</div>
      <div id="${id}-b" style="position:absolute;font-family:${theme.displayStack};font-size:${F(morphPx)};line-height:${X(190)};color:${hi};transform-origin:left center;white-space:nowrap;">${esc(words[1] || words[0])}</div>
    </div>`;
  } else {
    wordHtml = `<div style="height:${X(190)};overflow:hidden;position:relative;">
      <div id="${id}-roll">
        <div id="${id}-a" style="font-family:${theme.displayStack};font-size:${F(morphPx)};line-height:${X(190)};color:${hi};white-space:nowrap;">${esc(words[0])}</div>
        <div id="${id}-b" style="font-family:${theme.displayStack};font-size:${F(morphPx)};line-height:${X(190)};color:${hi};white-space:nowrap;">${esc(words[1] || words[0])}</div>
      </div>
    </div>`;
  }
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div data-in="item" data-i="2" style="margin-top:${X(40)};">
        ${prefix ? `<div style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(40)};color:${rgba(fg, 0.6)};margin-bottom:${X(24)};">${esc(prefix)}</div>` : ""}
        ${wordHtml}
        <div style="width:${X(320)};height:${X(10)};border-radius:999px;background:${rgba(fg, 0.15)};margin-top:${X(30)};position:relative;">
          <div id="${id}-bar" style="height:${X(10)};border-radius:999px;background:${hi};width:${X(320)};"></div>
        </div>
        ${sub ? `<div style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(34)};color:${rgba(fg, 0.7)};margin-top:${X(44)};max-width:${X(700)};line-height:1.45;">${esc(sub)}</div>` : ""}
      </div>`),
    mech: { kind: "morph", id, v, n: words.length, steps: words, maxLen },
  };
}

// SWIPE — swipe (a thrown deck) / flip (a card turning on its Y axis).
function bSwipe(scene, ctx, sceneAssets, _logo, variant) {
  const { theme, Str } = ctx;
  const L = ctx.look.app;
  const hi = ink(theme, L.hi, ctx.ground), line = col(theme, L.line), fg = ink(theme, L.fg, ctx.ground);
  const v = variant || "swipe";
  const id = ctx.id;
  const src = featureLines(scene, 3);
  const cards = (src.length ? src : [scene.headline || Str.metric]).slice(0, 3).map((t) => {
    const parts = String(t).split(/\s+[—–-]\s+|:\s+/);
    return { t: shortLabel(parts[0], 30), s: parts.length > 1 ? shortLabel(parts.slice(1).join(" "), 60) : "" };
  });
  const n = cards.length;
  const stamp = Str.stamp;

  if (v === "flip") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2">
          <div id="${id}-flip" style="${panelCss(ctx, 560, `padding:${X(48)};`)}">
            ${cards.map((c, i) => `<div id="${id}-f${i}" style="position:absolute;left:${X(48)};right:${X(48)};top:${X(48)};">
              <div style="font-family:${theme.displayStack};font-size:${F(62)};line-height:1.1;color:${line};">${esc(c.t)}</div>
              ${c.s ? `<div style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(30)};color:${rgba(line, 0.65)};margin-top:${X(24)};line-height:1.45;">${esc(c.s)}</div>` : ""}
            </div>`).join("")}
            <div style="position:absolute;bottom:${X(36)};left:${X(48)};font-family:${theme.displayStack};font-size:${F(30)};color:${hi};">${esc(stamp)}</div>
          </div>
          <div style="display:flex;gap:${X(14)};justify-content:center;margin-top:${X(34)};">
            ${cards.map((_, i) => `<span id="${id}-dot${i}" style="width:${i === 0 ? "44px" : "14px"};height:${X(14)};border-radius:999px;background:${i === 0 ? hi : rgba(line, 0.3)};"></span>`).join("")}
          </div>
        </div>`),
      mech: { kind: "swipe", id, v, n, on: hi, off: rgba(line, 0.3) },
    };
  }
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div style="position:relative;height:${X(700)};margin-top:${X(20)};">
        ${cards.map((c, i) => `<div id="${id}-c${i}" style="${panelCss(ctx, 620, `padding:${X(44)};`)}position:absolute;left:${X(60)};right:${X(60)};top:0;z-index:${3 - i};">
          <div style="font-family:${theme.displayStack};font-size:${F(64)};color:${line};line-height:1.08;">${esc(c.t)}</div>
          ${c.s ? `<div style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(30)};color:${rgba(line, 0.65)};margin-top:${X(22)};line-height:1.45;">${esc(c.s)}</div>` : ""}
          ${i === 0 ? `<div id="${id}-stamp" style="position:absolute;top:${X(44)};right:${X(44)};padding:${X(12)} ${X(26)};border:${X(5)} solid ${hi};border-radius:${X(12)};color:${hi};font-family:${theme.displayStack};font-size:${F(40)};transform:rotate(12deg);">${esc(stamp)}</div>` : ""}
        </div>`).join("")}
      </div>`),
    mech: { kind: "swipe", id, v, n, on: hi, off: rgba(line, 0.3) },
  };
}

// CURSOR — click / keys / slider. A pointer walking the interface.
function bCursor(scene, ctx, _a, _logo, variant) {
  const { theme, Str } = ctx;
  const L = ctx.look.app;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground), line = col(theme, L.line), cardBg = col(theme, L.cardBg);
  const v = variant || "click";
  const id = ctx.id;
  const lines = featureLines(scene, 3);
  const caption = shortLabel(scene.subtext || lines[0] || "", 40);
  const btn = shortLabel(lines[0] || Str.ctaButton, 16);
  const after = shortLabel(lines[1] || Str.done, 16);
  const toggleLabel = shortLabel(lines[2] || lines[1] || Str.metric, 26);

  if (v === "slider") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2" style="${panelCss(ctx, 560)}">
          ${caption ? `<div style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(26)};color:${rgba(line, 0.6)};">${esc(caption)}</div>` : ""}
          <div style="font-family:${theme.displayStack};font-size:${F(120)};color:${hi};margin-top:${X(40)};font-variant-numeric:tabular-nums;"><span id="${id}-val">90</span><span style="font-size:${F(54)};color:${rgba(line, 0.6)};">%</span></div>
          <div style="position:relative;height:${X(60)};margin-top:${X(40)};">
            <div style="position:absolute;top:${X(24)};left:${X(40)};width:${X(600)};height:${X(14)};border-radius:999px;background:${rgba(line, 0.15)};"></div>
            <div id="${id}-fill" style="position:absolute;top:${X(24)};left:${X(40)};width:${X(600)};height:${X(14)};border-radius:999px;background:${hi};"></div>
            <div id="${id}-knob" style="position:absolute;top:${X(4)};left:${X(574)};width:${X(52)};height:${X(52)};border-radius:999px;background:#fff;box-shadow:0 ${X(4)} ${X(12)} rgba(0,0,0,0.4);"></div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:${X(20)};margin:${X(50)} ${X(20)} 0;padding:${X(22)} ${X(30)};border-radius:${X(16)};background:${rgba(line, 0.08)};">
            <span style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(28)};color:${line};min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(toggleLabel)}</span>
            <div id="${id}-tg" style="width:${X(92)};height:${X(50)};border-radius:999px;background:${hi};position:relative;flex:none;">
              <div id="${id}-tk" style="position:absolute;top:${X(6)};left:${X(48)};width:${X(38)};height:${X(38)};border-radius:999px;background:#fff;"></div>
            </div>
          </div>
          <svg viewBox="0 0 940 560" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">${pointer(`${id}-ptr`, fg)}</svg>
        </div>`),
      mech: { kind: "cursor", id, v, on: hi, off: rgba(line, 0.25) },
    };
  }
  if (v === "keys") {
    const keys = [btn.slice(0, 6), "+", after.slice(0, 6)];
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2" style="${panelCss(ctx, 560)}">
          ${caption ? `<div style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(26)};color:${rgba(line, 0.6)};margin-bottom:${X(46)};">${esc(caption)}</div>` : ""}
          <div style="display:flex;gap:${X(26)};justify-content:center;">
            ${keys.map((k, i) => `<div id="${id}-k${i}" style="min-width:${X(170)};padding:${X(34)} ${X(20)};text-align:center;border-radius:${X(18)};background:${rgba(hi, 0.18)};border:${X(2)} solid ${hi};border-bottom-width:${X(8)};font-family:${theme.displayStack};font-size:${F(40)};color:${hi};">${esc(k)}</div>`).join("")}
          </div>
          <div id="${id}-after" style="text-align:center;margin-top:${X(52)};font-family:${theme.displayStack};font-size:${F(52)};color:${hi};">${esc(after || Str.done)}</div>
        </div>`),
      mech: { kind: "cursor", id, v, n: keys.length, on: hi, off: rgba(line, 0.25), ink: line, hitBg: rgba(hi, 0.18), idleBg: rgba(line, 0.08) },
    };
  }
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div data-in="item" data-i="2" style="${panelCss(ctx, 620)}">
        ${caption ? `<div style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(26)};color:${rgba(line, 0.6)};margin-bottom:${X(34)};">${esc(caption)}</div>` : ""}
        <div style="display:flex;justify-content:center;margin-top:${X(40)};">
          <div id="${id}-btn" style="padding:${X(26)} ${X(60)};border-radius:999px;background:${hi};color:${cardBg};font-family:${theme.displayStack};font-size:${F(42)};"><span id="${id}-btnlabel">${esc(after)}</span></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:${X(20)};margin:${X(70)} ${X(40)} 0;padding:${X(26)} ${X(34)};border-radius:${X(18)};background:${rgba(line, 0.08)};">
          <span style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(30)};color:${line};min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(toggleLabel)}</span>
          <div id="${id}-tg" style="width:${X(96)};height:${X(52)};border-radius:999px;background:${hi};position:relative;flex:none;">
            <div id="${id}-tk" style="position:absolute;top:${X(6)};left:${X(50)};width:${X(40)};height:${X(40)};border-radius:999px;background:#fff;"></div>
          </div>
        </div>
        <svg viewBox="0 0 940 620" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">
          <circle id="${id}-ring" cx="450" cy="300" r="20" fill="none" stroke="${hi}" stroke-width="4" style="opacity:0;"/>
          ${pointer(`${id}-ptr`, fg)}
        </svg>
      </div>`),
    mech: { kind: "cursor", id, v, on: hi, off: rgba(line, 0.14), ink: line, onInk: cardBg, before: btn, after },
  };
}

// DRAGDROP — drag / assemble. A chip carried to a slot and locked in.
function bDrag(scene, ctx, _a, _logo, variant) {
  const { theme, Str } = ctx;
  const L = ctx.look.app;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground), line = col(theme, L.line), cardBg = col(theme, L.cardBg);
  const v = variant || "drag";
  const id = ctx.id;
  const lines = featureLines(scene, 3);
  const caption = shortLabel(scene.subtext || lines[1] || "", 40);
  const item = shortLabel(lines[0] || scene.emphasis || Str.metric, 18);
  const slot = shortLabel(lines[1] || Str.slot, 14).toUpperCase();
  const assemble = v === "assemble";
  const h = assemble ? 620 : 660;
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div data-in="item" data-i="2" style="${panelCss(ctx, h)}">
        ${caption ? `<div style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(26)};color:${rgba(line, 0.6)};">${esc(caption)}</div>` : ""}
        <div id="${id}-slot" style="position:absolute;left:${X(assemble ? 300 : 560)};top:${X(assemble ? 280 : 480)};width:${X(assemble ? 340 : 330)};height:${X(assemble ? 150 : 130)};border-radius:${X(assemble ? 22 : 20)};border:${X(4)} dashed ${rgba(line, 0.4)};display:flex;align-items:center;justify-content:center;">
          <span id="${id}-slotlabel" style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(24)};color:${rgba(line, 0.5)};letter-spacing:.12em;">${esc(slot)}</span>
        </div>
        <div id="${id}-chip" style="position:absolute;left:${X(assemble ? 330 : 585)};top:${X(assemble ? 315 : 505)};max-width:${X(assemble ? 330 : 300)};padding:${X(assemble ? 24 : 22)} ${X(assemble ? 42 : 40)};border-radius:${X(16)};background:${hi};color:${cardBg};font-family:${theme.displayStack};font-size:${F(assemble ? 36 : 34)};box-shadow:0 ${X(6)} ${X(14)} rgba(0,0,0,0.25);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;">${esc(item)}</div>
        <div id="${id}-tick" style="position:absolute;left:${X(assemble ? 660 : 910)};top:${X(assemble ? 322 : 514)};width:${X(assemble ? 64 : 60)};height:${X(assemble ? 64 : 60)};border-radius:999px;background:${hi};display:flex;align-items:center;justify-content:center;">
          <svg width="55%" height="55%" viewBox="0 0 24 24" fill="none" stroke="${cardBg}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>
        </div>
        <div id="${id}-note" style="position:absolute;left:${X(40)};bottom:${X(40)};font-family:${theme.bodyStack};font-weight:700;font-size:${F(28)};color:${rgba(line, 0.75)};">${esc(slot + " · locked in")}</div>
        <svg viewBox="0 0 940 ${h}" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">${pointer(`${id}-ptr`, fg)}</svg>
      </div>`),
    mech: { kind: "drag", id, v, on: hi, off: rgba(line, 0.4), tint: rgba(hi, 0.1) },
  };
}

const BUILDERS = {
  hook: bHook, statement: bStatement, feature: bFeature, montage: bMontage, stats: bStats, cta: bCta,
  Typing: bTyping, Code: bCode, Scroll: bScroll, Ring: bRing, Toggle: bToggle,
  Notify: bNotify, Morph: bMorph, Swipe: bSwipe, Cursor: bCursor, DragDrop: bDrag,
};

module.exports = { BUILDERS, PAD, COL, col, title, kicker, open, close, shell, panelCss };
