// Deterministic contrast fixer — the "fix" half of the legibility gate.
//
// contrast_check.js DETECTS unreadable text (WCAG AA) but nothing repaired it:
// the pre-render gate only logged (warn mode) and the post-render QA "repair"
// re-invoked the LLM composer, which is slow and unreliable at surgically fixing
// one label's contrast. This module closes the loop WITHOUT an LLM: given the
// checker's per-element failures (which now carry the measured fg/bg + whether the
// glyph is gradient-clipped), it rewrites the offending element's color to the
// nearest READABLE, on-palette token — or, when no solid color can reach the
// needed ratio against the local backdrop, drops a solid scrim chip behind it.
//
// It edits ONLY inline `style` / `-webkit-*` on existing elements (never clips,
// tracks, or timing attributes), so the hyperframes lint/overlap gates cannot
// regress, and it uses the SAME WCAG math as the checker so a fix it accepts is a
// fix the checker will pass. Idempotent via a `data-cc-fixed` marker.
//
// Pure string+regex (no DOM parser — none is a dependency), mirroring the house
// style of normalize.js / enrich.js.

// ---- WCAG math (ported byte-for-byte from contrast_check.js probeFrames) -----
function relLum([r, g, b]) {
  const ch = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}
function ratioOf(a, b) {
  const la = relLum(a), lb = relLum(b);
  const [L1, L2] = la > lb ? [la, lb] : [lb, la];
  return (L1 + 0.05) / (L2 + 0.05);
}

// ---- small color helpers -----------------------------------------------------
function parseHex(hex) {
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function colorDist(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

const WHITE = [255, 255, 255];
const NEAR_BLACK = [20, 19, 14]; // scene-kit's own light-ground ink (#14130E)
const RATIO_MARGIN = 0.4;        // accept a fix only if it clears `needed` + this

// Build the legal color candidate list for this pack: accents + ink first (most
// on-brand), then all declared tokens. Neutrals are appended by the caller as the
// guaranteed fallback so a fix always exists for a solid backdrop.
function paletteCandidates({ theme, packTokens }) {
  const out = [];
  const push = (hex) => { const rgb = parseHex(hex); if (rgb) out.push({ hex: "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase(), rgb }); };
  if (theme) {
    (theme.accents || []).forEach(push);
    if (theme.ink) push(theme.ink);
  }
  if (packTokens && packTokens.colors) Object.values(packTokens.colors).forEach(push);
  // de-dup by hex
  const seen = new Set();
  return out.filter((c) => (seen.has(c.hex) ? false : (seen.add(c.hex), true)));
}

// Nearest on-palette color that clears `needed` against the measured backdrop,
// tie-broken by least visual change from the original fg (colorDist).
function pickReadable(fg, bg, needed, candidates) {
  const passing = candidates
    .map((c) => ({ ...c, ratio: ratioOf(c.rgb, bg), dist: fg ? colorDist(c.rgb, fg) : 0 }))
    .filter((c) => c.ratio >= needed + RATIO_MARGIN)
    .sort((a, b) => a.dist - b.dist);
  return passing[0] || null;
}

// The always-available max-contrast neutral vs a backdrop (white or near-black,
// whichever reads better). Returns { hex, rgb, ratio }.
function bestNeutral(bg) {
  const rW = ratioOf(WHITE, bg), rB = ratioOf(NEAR_BLACK, bg);
  return rW >= rB ? { hex: "#FFFFFF", rgb: WHITE, ratio: rW } : { hex: "#14130E", rgb: NEAR_BLACK, ratio: rB };
}

// ---- HTML element location (string walk, mirrors contrast_check selectorOf) ---
const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&rsquo;": "'", "&lsquo;": "'", "&nbsp;": " ", "&mdash;": "—", "&ndash;": "–" };
function decodeEntities(s) { return s.replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m); }
function normText(s) { return decodeEntities(String(s || "")).replace(/\s+/g, " ").trim().toLowerCase(); }

function parseSelector(selector) {
  const sel = String(selector || "").trim();
  if (sel.startsWith("#")) return { kind: "id", id: sel.slice(1) };
  const parts = sel.split(".");
  const tag = parts[0] || "";
  const classes = parts.slice(1).filter(Boolean);
  if (classes.length) return { kind: "class", tag, classes };
  return { kind: "tag", tag };
}

function attrValue(attrs, name) {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"|${name}\\s*=\\s*'([^']*)'`, "i"));
  return m ? (m[1] ?? m[2] ?? "") : null;
}

// From the index just past an element's opening `>`, return its inner HTML by
// walking to the matching close tag (nesting-aware). Heuristic but only used to
// read the element's text for disambiguation, so approximate is fine.
function innerHtmlAfter(html, startIdx, tag) {
  const lower = html.toLowerCase();
  const t = tag.toLowerCase();
  let depth = 1, pos = startIdx;
  const isBoundary = (ch) => ch === undefined || /[\s/>]/.test(ch);
  while (pos < html.length) {
    const nOpen = lower.indexOf("<" + t, pos);
    const nClose = lower.indexOf("</" + t, pos);
    if (nClose === -1) break;
    if (nOpen !== -1 && nOpen < nClose && isBoundary(lower[nOpen + t.length + 1])) {
      depth++; pos = nOpen + t.length + 1;
    } else {
      if (isBoundary(lower[nClose + t.length + 2])) {
        depth--;
        if (depth === 0) return html.slice(startIdx, nClose);
      }
      pos = nClose + t.length + 2;
    }
  }
  return html.slice(startIdx, Math.min(html.length, startIdx + 400));
}

function innerText(inner) {
  return normText(inner.replace(/<[^>]*>/g, " "));
}

// Find every opening tag that matches the selector AND (when text is given) whose
// element text starts with the failure's text. Returns [{ openTag, tag, attrs, hasFixed }].
function locate(html, selector, text) {
  const parsed = parseSelector(selector);
  const wantText = normText(text);
  const re = /<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g;
  const hits = [];
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    const attrs = m[2] || "";
    if (m[0].endsWith("/>")) continue; // void/self-closing: no text
    // selector filter
    if (parsed.kind === "id") {
      if (attrValue(attrs, "id") !== parsed.id) continue;
    } else if (parsed.kind === "class") {
      if (tag !== parsed.tag) continue;
      const cls = (attrValue(attrs, "class") || "").split(/\s+/);
      if (!parsed.classes.every((c) => cls.includes(c))) continue;
    } else {
      if (tag !== parsed.tag) continue;
    }
    // text filter (prefix — failure.text is sliced to 60 chars)
    if (wantText) {
      const inner = innerText(innerHtmlAfter(html, re.lastIndex, tag));
      if (!inner) continue;
      // `wantText.startsWith(inner)` is here for the reverse truncation —
      // innerHtmlAfter gives up after 400 chars, so a long element reads back as a
      // prefix of its own text. It must not double as "any element whose text is
      // the target's first word": measured on a shipped comp, 17 of 24 text nodes
      // under 12 chars were matched by an unrelated longer target that merely
      // starts the same way ("One-Stop" pulled in by "One-Stop Destination for…"),
      // and a fixer that edits a node it never measured is worse than one that
      // edits nothing. Only lengths that can actually discriminate qualify.
      if (!(inner === wantText || inner.startsWith(wantText) || (inner.length >= 12 && wantText.startsWith(inner)))) continue;
    }
    hits.push({ openTag: m[0], tag, attrs, hasFixed: /\bdata-cc-fixed\s*=/.test(attrs) });
  }
  // de-dup identical opening tags (a repeated CTA) — one edit covers all copies.
  const seen = new Set();
  return hits.filter((h) => (seen.has(h.openTag) ? false : (seen.add(h.openTag), true)));
}

// ---- build the corrected opening tag ----------------------------------------
// decls: array of "prop:value !important" strings (no trailing ;). We append them
// to the element's inline style so, being inline + !important + last, they win.
function withDecls(openTag, decls) {
  const declStr = decls.join(";");
  let tag = openTag;
  // ensure idempotency marker
  if (!/\bdata-cc-fixed\s*=/.test(tag)) {
    tag = tag.replace(/\s*\/?>$/, (end) => ` data-cc-fixed="1"${end}`);
  }
  if (/style\s*=\s*"/.test(tag)) {
    return tag.replace(/style\s*=\s*"([^"]*)"/i, (_, v) => `style="${v.replace(/;\s*$/, "")};${declStr}"`);
  }
  if (/style\s*=\s*'/.test(tag)) {
    // single-quoted attribute — our decls contain no single quotes, so safe.
    return tag.replace(/style\s*=\s*'([^']*)'/i, (_, v) => `style='${v.replace(/;\s*$/, "")};${declStr}'`);
  }
  return tag.replace(/\s*\/?>$/, (end) => ` style="${declStr}"${end}`);
}

function colorDecls(hex) {
  return [`color:${hex} !important`, `-webkit-text-fill-color:${hex} !important`];
}
function unclipDecls() {
  return [
    "background:none !important",
    "background-image:none !important",
    "-webkit-background-clip:border-box !important",
    "background-clip:border-box !important",
  ];
}
function scrimDecls(chipBg, textHex) {
  return [
    ...unclipDecls(),
    `background-color:${chipBg} !important`,
    ...colorDecls(textHex),
    "padding:0.06em 0.30em",
    "border-radius:0.14em",
    "box-decoration-break:clone",
    "-webkit-box-decoration-break:clone",
  ];
}

// ---- main --------------------------------------------------------------------
// html      : composed index.html string
// failures  : contrast_check persistentFailures — each { selector, text, needed,
//             bestRatio, bestFg:[r,g,b], bestBg:[r,g,b], transparentFill }
// opts      : { theme (deriveTheme output), packTokens (getPackTokens output), isDark }
// returns   : { html, changed:[str], fixed:[{selector,text,strategy,predictedRatio}],
//               unfixable:[{selector,text,reason}] }
function contrastFix(html, failures, opts = {}) {
  const { theme = {}, packTokens = null } = opts;
  const isDark = opts.isDark != null ? opts.isDark : !!theme.isDark;
  const candidates = paletteCandidates({ theme, packTokens });
  // Universal scrim chip: a solid dark chip + white text reads as a "boxed"
  // emphasis and clears AA on any ground; on a genuinely dark set use a bright
  // palette/white chip with near-black text instead.
  const darkChip = (candidates.find((c) => relLum(c.rgb) < 0.06) || { hex: "#14130E", rgb: NEAR_BLACK });
  const lightChip = (candidates.slice().sort((a, b) => relLum(b.rgb) - relLum(a.rgb))[0] || { hex: "#FFFFFF", rgb: WHITE });
  const chipBg = isDark ? lightChip : darkChip;
  const chipText = isDark ? "#14130E" : "#FFFFFF";
  const chipRatio = ratioOf(parseHex(chipText), chipBg.rgb);

  const changed = [];
  const fixed = [];
  const unfixable = [];
  const done = new Set(); // opening tags already edited (avoid double edits)

  for (const f of failures || []) {
    const selector = f.selector;
    const text = f.text;
    const needed = Number(f.needed) || 4.5;
    const bg = Array.isArray(f.bestBg) ? f.bestBg : parseHex(theme.ground) || NEAR_BLACK;
    const fg = Array.isArray(f.bestFg) ? f.bestFg : null;

    const hits = locate(html, selector, text);
    if (!hits.length) { unfixable.push({ selector, text, reason: "element not located" }); continue; }
    if (hits.length > 8) { unfixable.push({ selector, text, reason: "ambiguous match (>8 elements)" }); continue; }

    // Decide the strategy ONCE for this failure and apply it to every matched copy.
    let strategy, decls, predictedRatio;
    const alreadyTried = hits.some((h) => h.hasFixed); // a prior recolor didn't stick → escalate
    const readable = alreadyTried ? null : pickReadable(fg, bg, needed, candidates);
    const neutral = bestNeutral(bg);

    if (f.transparentFill) {
      // Gradient-clipped emphasis: glyphs are painted BY the element's background,
      // so recolor alone does nothing — un-clip to a solid color.
      const pick = readable || (neutral.ratio >= needed + RATIO_MARGIN ? neutral : null);
      if (pick) {
        strategy = "unclip-gradient";
        decls = [...unclipDecls(), ...colorDecls(pick.hex)];
        predictedRatio = +ratioOf(pick.rgb, bg).toFixed(2);
      } else {
        strategy = "scrim";
        decls = scrimDecls(chipBg.hex, chipText);
        predictedRatio = +chipRatio.toFixed(2);
      }
    } else if (readable) {
      strategy = "recolor";
      decls = colorDecls(readable.hex);
      predictedRatio = +readable.ratio.toFixed(2);
    } else if (!alreadyTried && neutral.ratio >= needed + RATIO_MARGIN) {
      strategy = "recolor-neutral";
      decls = colorDecls(neutral.hex);
      predictedRatio = +neutral.ratio.toFixed(2);
    } else {
      // No solid text color reaches `needed` against this local backdrop (mixed /
      // mid-tone photo), or a prior recolor already failed → give it its own solid
      // backdrop so the re-check measures the chip, not the busy image.
      strategy = "scrim";
      decls = scrimDecls(chipBg.hex, chipText);
      predictedRatio = +chipRatio.toFixed(2);
    }

    let applied = 0;
    for (const h of hits) {
      if (done.has(h.openTag)) continue;
      const newTag = withDecls(h.openTag, decls);
      if (newTag === h.openTag) continue;
      html = html.split(h.openTag).join(newTag);
      done.add(h.openTag);
      applied++;
    }
    if (applied) {
      changed.push(`${strategy}: ${selector} "${String(text).slice(0, 40)}" ${f.bestRatio}:1→~${predictedRatio}:1 (need ${needed})`);
      fixed.push({ selector, text, strategy, predictedRatio });
    } else {
      unfixable.push({ selector, text, reason: "already fixed / no-op" });
    }
  }

  return { html, changed, fixed, unfixable };
}

module.exports = { contrastFix, relLum, ratioOf, parseHex, pickReadable, locate, withDecls, scrimDecls };
