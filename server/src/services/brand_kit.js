// Shared BRAND-KIT resolver for every composer — the one place that answers "which
// colors may this pack borrow from the product's brand, and which are not the
// brand's to touch".
//
// IDENTITY = LUMINANCE + MOTION + TYPOGRAPHY + LAYOUT + SEMANTICS. BRAND = HUE.
// A pack's ground, ink, fonts, motion, layout and SEMANTIC colors (terminal's
// green=ON-TIME / red=DELAYED, blueprint's cyan dimension lines) are the template's
// identity; only accents/emphasis/glow are the brand's to steer. That rule is
// enforced by the SHAPE of what resolveBrand returns, not by discipline: there is
// no ground/ink/font/motion key to read, so a composer CANNOT brand-tint its ground
// even by accident, and a role a pack locks is simply ABSENT from `slots` — locking
// by absence, so forgetting to check is not a way to violate the contract.
//
// It also settles a real disagreement. SIX luminance functions currently drive live
// color decisions and they do not agree: contrast_check (:199), composer (:41),
// flagship_composer (:47) and art_director (:64, dead) linearize sRGB per WCAG,
// while scene_kit (:83) and three_composer (:47) apply WCAG's coefficients to RAW
// 0-255 with no gamma step (~2x off through the midtones) and enrich (:34) uses
// Rec.601 NTSC coefficients entirely. So the kit that PICKS accents and the audit
// that JUDGES them measure different worlds. relLum/ratio below are the
// gamma-correct pair lifted VERBATIM from contrast_check's probeFrames — where it
// is trapped inside a function body serialized into the browser, hence
// un-importable — so what we choose is what the audit measures.
//
// FAIL-OPEN, like every director (art_director.js:14): resolveBrand(null, …)
// returns the PACK'S OWN resolution and writes no slots, so a composer can adopt
// this API BEFORE any brand skin is threaded to it and still render byte-identically
// to today. Pure functions: no LLM, no I/O, no DOM. Nothing here can block a render.

const HEX = /^#?([0-9a-fA-F]{6})$/;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function normHex(v) { const m = HEX.exec(String(v == null ? "" : v).trim()); return m ? `#${m[1].toLowerCase()}` : null; }
function hexToRgb(hex) { const h = normHex(hex); if (!h) return null; const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex([r, g, b]) { const f = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0"); return `#${f(r)}${f(g)}${f(b)}`; }
function hexInt(hex) { const h = normHex(hex); return h ? parseInt(h.slice(1), 16) : 0x7cc4ff; }
function rgba(hex, a) { const c = hexToRgb(hex) || [124, 196, 255]; return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
// h in DEGREES (0..360) — the unit hue drift is budgeted in.
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s, l];
}
function hslToRgb(h, s, l) {
  if (!s) return [l * 255, l * 255, l * 255];
  const t = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const ch = (x) => { if (x < 0) x += 1; if (x > 1) x -= 1; if (x < 1 / 6) return p + (q - p) * 6 * x; if (x < 1 / 2) return q; if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6; return p; };
  return [ch(t + 1 / 3) * 255, ch(t) * 255, ch(t - 1 / 3) * 255];
}

// ---- the ONE luminance ------------------------------------------------------
// LIFTED VERBATIM from contrast_check.js:199 (gamma-correct sRGB linearization,
// WCAG 2.x). Do NOT "simplify" it into a weighted sum over raw 0-255 channels —
// scene_kit and three_composer do exactly that and misjudge every midtone.
function relLum(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;   // unparseable reads as black: a fail-open floor, never a throw
  const ch = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(rgb[0]) + 0.7152 * ch(rgb[1]) + 0.0722 * ch(rgb[2]);
}
function ratio(fgHex, bgHex) {
  const la = relLum(fgHex), lb = relLum(bgHex);
  const [L1, L2] = la > lb ? [la, lb] : [lb, la];
  return (L1 + 0.05) / (L2 + 0.05);
}
function passesAA(fg, bg, large = false) { return ratio(fg, bg) >= (large ? 3 : 4.5); }

// Circular hue distance in degrees. An ACHROMATIC result is not "hue 0" — it is a
// color whose hue died, so it scores the maximum drift and the walk refuses it.
// This is the only place a lightness walk can destroy a brand hue (the white/black
// poles), which is exactly what hueDriftMax exists to prevent.
function hueDelta(a, b) {
  const [ha, sa] = rgbToHsl(hexToRgb(a) || [0, 0, 0]);
  const [hb, sb] = rgbToHsl(hexToRgb(b) || [0, 0, 0]);
  if ((sa < 0.02) !== (sb < 0.02)) return 180;
  if (sa < 0.02) return 0;
  const d = Math.abs(ha - hb) % 360;
  return d > 180 ? 360 - d : d;
}

// The ONE ratio-targeted fix, generalizing three's neonize (:51 — lift L 26 steps
// until an accent clears a dark ground), flagship's ensureBright (:55) and
// ensureReadableOnLight (:53 — darken until an accent clears white). Those three
// each hard-code a direction, a step size and a luminance FLOOR; this walks L in
// HSL toward a CONTRAST RATIO — the thing the audit actually measures — in whichever
// direction reaches it with the least displacement from the brand's own color, and
// refuses any step whose hue no longer reads as the original.
//
// It NEVER drops: a color it cannot save comes back as the best hue-true candidate
// it found, with the real ratio attached, and the CALLER decides. That split matters
// — dropping is a policy decision (resolveBrand's), not a color-math one.
const L_STEP = 0.01, L_MIN = 0.02, L_MAX = 0.98;
function nudgeToRatio(fg, bg, target = 3, hueDriftMax = 40) {
  const from = normHex(fg), ground = normHex(bg);
  if (!from || !ground) return { hex: fg, adjusted: false, from: fg, to: fg, ratio: 0 };
  const round = (r) => Math.round(r * 100) / 100;
  const r0 = ratio(from, ground);
  if (r0 >= target) return { hex: from, adjusted: false, from, to: from, ratio: round(r0) };
  const [h, s, l0] = rgbToHsl(hexToRgb(from));
  let best = from, bestR = r0;
  // Step OUTWARD from the color's own lightness, testing both directions at each
  // distance, so the first hit is the smallest change that clears the target. Ties
  // go to lighter — which is what neonize/ensureBright do on the dark grounds where
  // ties actually happen.
  for (let k = 1; k <= Math.ceil(1 / L_STEP); k++) {
    for (const dir of [1, -1]) {
      const l = l0 + dir * k * L_STEP;
      if (l < L_MIN || l > L_MAX) continue;
      const cand = rgbToHex(hslToRgb(h, s, l));
      if (hueDelta(from, cand) > hueDriftMax) continue;
      const r = ratio(cand, ground);
      if (r > bestR) { best = cand; bestR = r; }
      if (r >= target) return { hex: cand, adjusted: true, from, to: cand, ratio: round(r) };
    }
  }
  return { hex: best, adjusted: best !== from, from, to: best, ratio: round(bestR) };
}

// ---- the pack's brand CONTRACT ----------------------------------------------
// What a pack permits the brand to do. Phase 1 ships NO manifest changes, so
// manifest.brand is absent everywhere and EVERY pack resolves on these defaults:
// mode "accents" (the brand leads the accent list — precisely what scene_kit:153
// already does, so this is a refactor, not a behavior change) and slots [] (no role
// is writable, so every composer's `?? "#LITERAL"` still stands).
const DEFAULT_CONTRACT = { mode: "accents", slots: [], maxAccents: 3, contrastFloor: 3.0, hueDriftMax: 40 };
const MODES = new Set(["off", "accent", "accents", "atmosphere"]);
function normContract(c) {
  const src = c && typeof c === "object" ? c : {};
  const num = (v, d, lo, hi) => (Number.isFinite(v) ? clamp(v, lo, hi) : d);
  return {
    mode: MODES.has(src.mode) ? src.mode : DEFAULT_CONTRACT.mode,
    slots: Array.isArray(src.slots) ? src.slots : [],
    maxAccents: num(src.maxAccents, DEFAULT_CONTRACT.maxAccents, 0, 6),
    contrastFloor: num(src.contrastFloor, DEFAULT_CONTRACT.contrastFloor, 1, 21),
    hueDriftMax: num(src.hueDriftMax, DEFAULT_CONTRACT.hueDriftMax, 0, 180),
  };
}

// Backfill brights, kept identical to scene_kit:132 so a pack with no usable accents
// resolves to the same colors it already resolves to today.
const SAFE_BRIGHT = {
  dark: ["#7CC4FF", "#FF7DB4", "#FFC878", "#8BE0A4"],
  light: ["#3B5BFF", "#E2563C", "#1E9E5A", "#C9A227"],
};
// Toward white (amt>0) / toward black (amt<0) — flagship's lighten/darken (:49-50)
// as one signed knob. Hue-neutral by construction; used only for derived states.
function shift(hex, amt) {
  const c = hexToRgb(hex); if (!c) return hex;
  return rgbToHex(c.map((v) => (amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
}
const rotate = (hex, deg) => { const [h, s, l] = rgbToHsl(hexToRgb(hex) || [124, 196, 255]); return rgbToHex(hslToRgb(h + deg, Math.max(s, 0.45), l)); };
// Two chart series must be tellable apart at a glance, not merely !==.
function nearlySame(a, b) {
  const x = hexToRgb(a), y = hexToRgb(b);
  if (!x || !y) return a === b;
  return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) < 30;
}

// ---- which brand color ARRIVES on this ground -------------------------------
// Chroma — max-minus-min over normalized RGB, the same quantity HSL spells
// s*(1-|2l-1|). This, and NOT HSL's `s`, is what "vivid" means to an eye: #bbd5ea
// carries s=0.53 yet reads as a pale grey-blue, because its chroma is 0.18. Both
// lightness poles destroy chroma while leaving `s` untouched, so `s` cannot see the
// one kind of damage a lightness walk actually does.
function chroma(hex) {
  const c = hexToRgb(hex);
  if (!c) return 0;
  return (Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2])) / 255;
}
// Legibility on a fixed 3:1..21:1 log scale, anchored at 3:1 — deliberately NOT at
// contract.contrastFloor. The floor decides who is DROPPED; letting it also anchor
// this scale would make a strict pack rank its survivors differently from a lax one
// for no reason an eye could see. 3:1 is where large text — which an emphasis word
// is — begins to read at all, so the zero point means something.
//
// It is not clamped below: NEGATIVE is the whole point. A color at 2.1:1 did not
// merely fail to be excellent, it failed to READ, and flattening that to 0 would
// throw away the exact signal that says "this ground punishes this color".
const LOG3 = Math.log2(3), LEG_SPAN = Math.log2(21) - LOG3;
const legible = (r) => Math.min((Math.log2(Math.max(r, 1)) - LOG3) / LEG_SPAN, 1);

// How strongly a brand color lands on a ground once fit() has done what it must.
// Four terms, because "it clears the floor" is precisely the test that passed while
// the film got visibly worse: a mid-dark blue dragged up the L axis to clear a
// near-black ground satisfies every ratio check and still arrives as a washed grey.
//
// Ground-relative by construction — every term is measured against the ground the
// composer actually paints on, so the SAME pair leads orange on flagship's #0A0B16
// and blue on brightlife's #FFFFFF. A rule that just preferred the vivid one, or
// always the primary, would pick orange on white: the same bug wearing a mirror.
//
// The weights are a ranking, not a physical quantity. What is load-bearing is the
// ORDER they impose, pinned in both directions in scripts/test-brand-kit.js.
function arrival(rawHex, fitHex, ground) {
  const lRaw = rgbToHsl(hexToRgb(rawHex) || [0, 0, 0])[2];
  const lFit = rgbToHsl(hexToRgb(fitHex) || [0, 0, 0])[2];
  return 0.45 * legible(ratio(fitHex, ground))   // does the RESULT read here
    + 0.25 * legible(ratio(rawHex, ground))      // did it read here UNAIDED — health, not rescue
    + 0.30 * chroma(fitHex)                      // is the RESULT still a color, or a grey
    - 0.40 * Math.abs(lFit - lRaw);              // every step of the walk that got it here is damage
}
// A near-tie is not a mandate to overrule the person who picked the palette. list[0]
// is the color they named as their lead, so a challenger must BEAT it by a margin no
// eye would call marginal — not merely out-score it — or an explicit pick dies to
// rounding. Returns an index into `list`; 0 whenever there is nothing to rank.
const EMPHASIS_MARGIN = 0.15;
function leadByArrival(list, ground) {
  if (!list.length) return 0;
  const scores = list.map((c) => arrival(c.raw, c.hex, ground));
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  return scores[best] - scores[0] > EMPHASIS_MARGIN ? best : 0;
}

// ---------------------------------------------------------------- main
// resolveBrand(brandSkin, { ground, isDark, packAccents, contract }) -> PackSkin
// brandSkin is the Art Director's ACCENT-ONLY skin ({accents, emphasis, …}) or null.
function resolveBrand(brandSkin, opts = {}) {
  const o = opts || {};
  const ground = normHex(o.ground) || "#0b1020";
  // 0.18 is where black and white ink tie at 4.5:1 — the only non-arbitrary
  // dark/light pivot there is. deriveTheme owns ground authority and already knows,
  // so an explicit isDark always wins.
  const dark = typeof o.isDark === "boolean" ? o.isDark : relLum(ground) < 0.18;
  const contract = normContract(o.contract);
  const adjusted = [], dropped = [];

  // Pack accents pass through UNTOUCHED — original strings, not re-cased, not
  // re-ordered, not contrast-filtered. With no brand skin this function must be a
  // mirror, or "adopt the API first, thread the brand later" stops being safe.
  const packAccents = [], seen = new Set();
  for (const a of Array.isArray(o.packAccents) ? o.packAccents : []) {
    const k = normHex(a);
    if (!k || seen.has(k)) continue;
    seen.add(k); packAccents.push(String(a).trim());
  }
  const fallback = dark ? SAFE_BRIGHT.dark : SAFE_BRIGHT.light;
  const base = packAccents.length ? packAccents : fallback.slice(0, 3);

  // Fit a BRAND color to the ground and DISCLOSE the correction — a silently
  // altered brand color is how a palette becomes a mystery to whoever picked it.
  // Returns null only when the color cannot clear the floor while still reading as
  // its own hue; that, and only that, is a drop.
  const fit = (raw) => {
    const hex = normHex(raw);
    if (!hex) { if (raw != null) dropped.push({ hex: String(raw), reason: "not a #RRGGBB color" }); return null; }
    const n = nudgeToRatio(hex, ground, contract.contrastFloor, contract.hueDriftMax);
    if (n.ratio < contract.contrastFloor) {
      dropped.push({ hex, reason: `unsalvageable on ${ground}: best ${n.ratio}:1 within ${contract.hueDriftMax}° of its hue, floor is ${contract.contrastFloor}:1` });
      return null;
    }
    if (n.adjusted) adjusted.push({ from: n.from, to: n.to, reason: `${Math.round(ratio(n.from, ground) * 100) / 100}:1 on ${ground} — lifted to ${n.ratio}:1 (floor ${contract.contrastFloor}:1), hue held` });
    return n.hex;
  };
  // Derived RENDER values (3D ints, chart series) get the same correction silently:
  // adjusted[] discloses what we did to the BRAND's palette, and a pack accent
  // lifted for a WebGL stage is not that.
  const lift = (hex, floor) => nudgeToRatio(hex, ground, floor, contract.hueDriftMax).hex;

  const brand = [];
  if (contract.mode !== "off" && brandSkin && Array.isArray(brandSkin.accents)) {
    const cap = contract.mode === "accent" ? Math.min(1, contract.maxAccents) : contract.maxAccents;
    for (const raw of brandSkin.accents) {
      if (brand.length >= cap) break;
      const hex = fit(raw);
      if (hex && !brand.includes(hex)) brand.push(hex);
    }
  }
  const applied = brand.length > 0;
  const tier = applied ? contract.mode : "off";
  const accents = applied ? [...brand, ...base.filter((a) => !brand.includes(normHex(a)))] : base;
  const accent = accents[0] || fallback[0];
  const accent2 = accents[1] || accent;
  const accent3 = accents[2] || accent2;

  // The emphasis pair is ordered by ARRIVAL on THIS ground, never by the order the
  // brand happened to be typed in. Emphasis is the most brand-visible ink in the film
  // — the hero stat, the highlighted word — and input order knows nothing about
  // whether a color survives the ground it lands on. Amazon's #146eb4 is a perfectly
  // good blue that reads at 3.66:1 on flagship's near-black stage while #ff9900 reads
  // at 9.15:1; whichever the user typed first, the orange is the one that ARRIVES.
  // Invert the ground and the answer inverts with it.
  //
  // Ordering stops at this pair, ON PURPOSE. `accents` above stays brand-lead-first:
  // the accent roles are the brand's own sequence to keep, and coupling the two would
  // let a ground quietly resequence a palette the user ordered by hand.
  const emph = applied && Array.isArray(brandSkin.emphasis)
    ? brandSkin.emphasis.map((raw) => { const hex = fit(raw); return hex ? { raw: normHex(raw), hex } : null; }).filter(Boolean)
    : [];
  const lead = leadByArrival(emph, ground);
  const ranked = emph.filter((_, i) => i !== lead);
  if (emph[lead]) ranked.unshift(emph[lead]);
  // With no brand skin `emph` is empty and this is [accent, accent2] — the no-op law:
  // there is nothing to rank, so nothing is ranked and today's pixels stand.
  const emphasis = [ranked[0] ? ranked[0].hex : accent, ranked[1] ? ranked[1].hex : accent2];
  // Order and angle match the live emphasis gradient (scene_kit:912 paints
  // `linear-gradient(100deg, accent, accent2)`), so a composer swapping its literal
  // for this string renders the identical pixels when no brand skin applies.
  const emphasisCss = `linear-gradient(100deg,${emphasis[0]},${emphasis[1]})`;

  const gradients = {
    primary: `linear-gradient(100deg,${accent},${accent2})`,
    secondary: `linear-gradient(100deg,${accent2},${accent3})`,
    accent: `linear-gradient(180deg,${accent},${shift(accent, dark ? 0.22 : -0.22)})`,
    // A WASH, not a ground: transparent at both ends and carrying no ground color of
    // its own, so it can only be painted OVER the pack's ground, never instead of it.
    background: `radial-gradient(120% 90% at 50% 0%, ${rgba(accent, dark ? 0.16 : 0.1)}, ${rgba(accent, 0)} 70%)`,
  };
  const ui = {
    border: rgba(accent, 0.38),
    chip: rgba(accent, dark ? 0.16 : 0.12),
    indicator: accent,
    progress: accent,
    buttonBg: accent,
    // Whichever ink actually reads ON the accent — a brand color's own luminance
    // decides this, so it can't be hard-coded per pack.
    onAccent: ratio("#ffffff", accent) >= ratio("#14130e", accent) ? "#ffffff" : "#14130e",
    hover: shift(accent, dark ? 0.14 : -0.12),
    active: shift(accent, dark ? -0.1 : 0.14),
    glow: rgba(accent, 0.45),
    shadow: rgba(shift(accent, -0.55), 0.38),
    tintWeak: rgba(accent, 0.06),
    tintStrong: rgba(accent, 0.18),
  };
  // 0x ints for the WebGL paths, ground-corrected: deriveTheme picks accents against
  // the PACK's ground (often light), while a 3D stage is always dark — so an
  // uncorrected navy collapses into it (three_composer:38 has this exact note).
  const t3 = (hex) => hexInt(lift(hex, contract.contrastFloor));
  const three = {
    A: t3(accent), B: t3(accent2), C: t3(accent3),
    glow: hexInt(shift(lift(accent, contract.contrastFloor), 0.25)),
    particle: t3(accent2),
    lightKey: t3(accent),
    lightFill: t3(accent3),
  };
  // >=3 pairwise-distinct series, each clearing 3:1 on the ground (a chart series is
  // a graphic, so 3:1 is its floor). Candidates run brand/pack first, then the safe
  // brights, then hue rotations of the lead — a chart with two colors nobody can
  // tell apart is a broken chart, so distinctness outranks brand fidelity here.
  const chart = [];
  for (const c of [...accents, ...fallback, rotate(accent, 120), rotate(accent, 240), dark ? "#ffffff" : "#101010"]) {
    if (chart.length >= 3) break;
    const hex = lift(normHex(c) || accent, Math.max(3, contract.contrastFloor));
    if (ratio(hex, ground) < 3 || chart.some((x) => nearlySame(x, hex))) continue;
    chart.push(hex);
  }

  // Only the roles the pack DECLARED writable get a color; a locked role is absent
  // and its composer's literal stands. Phase 1: no pack ships a contract, so this is
  // empty for every pack.
  const slots = {};
  if (applied) {
    const pool = { accent, accent2, accent3, emphasisA: emphasis[0], emphasisB: emphasis[1], glow: accent };
    contract.slots.forEach((s, i) => {
      const role = typeof s === "string" ? s : (s && s.role);
      if (!role) return;
      const src = (s && s.from && pool[s.from]) || accents[i % accents.length] || accent;
      const floor = Number.isFinite(s && s.minRatio) ? s.minRatio : contract.contrastFloor;
      slots[role] = lift(normHex(src) || accent, floor);
    });
  }

  return {
    tier, applied,
    accents, accent, accent2, accent3,
    emphasis, emphasisCss,
    gradients, ui, three, chart, slots,
    // A hue and a weight — never a color to paint the ground with. The pack's ground
    // stays the base; the brand only tints the air above it.
    atmosphere: applied && contract.mode === "atmosphere"
      ? { hue: Math.round(rgbToHsl(hexToRgb(accent))[0]), mix: dark ? 0.14 : 0.09 }
      : null,
    adjusted: adjusted.filter((a, i) => adjusted.findIndex((b) => b.from === a.from && b.to === a.to) === i),
    dropped: dropped.filter((d, i) => dropped.findIndex((e) => e.hex === d.hex) === i),
  };
}

// Flatten a PackSkin into the custom properties a composition drops into :root.
// Accent-family ONLY — there is deliberately no --kf-ground and no --kf-ink, for the
// same reason the PackSkin has no such key.
function cssVarBlock(packSkin) {
  const s = packSkin || {};
  if (!s.accent) return "";
  const vars = {
    "--kf-accent": s.accent, "--kf-accent2": s.accent2, "--kf-accent3": s.accent3,
    "--kf-emph-a": s.emphasis && s.emphasis[0], "--kf-emph-b": s.emphasis && s.emphasis[1],
    "--kf-border": s.ui && s.ui.border, "--kf-chip": s.ui && s.ui.chip,
    "--kf-on-accent": s.ui && s.ui.onAccent, "--kf-glow": s.ui && s.ui.glow,
    "--kf-shadow": s.ui && s.ui.shadow, "--kf-tint-weak": s.ui && s.ui.tintWeak,
    "--kf-tint-strong": s.ui && s.ui.tintStrong,
  };
  return Object.entries(vars).filter(([, v]) => v).map(([k, v]) => `${k}:${v};`).join("");
}

module.exports = {
  relLum, ratio, passesAA, nudgeToRatio, resolveBrand, cssVarBlock,
  DEFAULT_CONTRACT,
};
