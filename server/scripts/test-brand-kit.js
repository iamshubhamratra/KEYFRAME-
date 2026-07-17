// Unit tests for the brand_kit resolver — the color math that decides what the
// brand is allowed to touch. Pure functions, so this needs no browser, no Chromium
// and no job dir: it just runs.
//
// Usage:
//   node server/scripts/test-brand-kit.js [--verbose]
//
// Exit code is 1 if any assertion fails (so it can gate CI), 0 otherwise — same
// contract as scripts/audit-contrast.js.

const {
  relLum, ratio, passesAA, nudgeToRatio, resolveBrand, cssVarBlock, DEFAULT_CONTRACT,
} = require("../src/services/brand_kit");

const verbose = process.argv.includes("--verbose") || process.argv.includes("-v");
let failed = 0, passed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    if (verbose) console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${String((e && e.message) || e)}`);
  }
}
function ok(cond, msg) { if (!cond) throw new Error(msg || "expected truthy"); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || "not equal"}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
function near(a, b, tol, msg) { if (Math.abs(a - b) > tol) throw new Error(`${msg || "not near"}: got ${a}, want ${b}±${tol}`); }
function section(s) { console.log(`\n▐ ${s}`); }

const DARK = "#0b1020", LIGHT = "#fffdf5";
const PACK = ["#7CC4FF", "#FF7DB4", "#FFC878"];

// ---------------------------------------------------------------- luminance
section("relLum / ratio / passesAA — the WCAG pairs the audit measures");

check("relLum: black=0, white=1", () => {
  eq(relLum("#000000"), 0, "black");
  eq(relLum("#ffffff"), 1, "white");
});
check("relLum: mid gray #808080 is ~0.216, NOT 0.5 (this is the gamma step the wrong impls skip)", () => {
  near(relLum("#808080"), 0.2158, 0.001, "#808080");
});
check("relLum: known channel primaries", () => {
  near(relLum("#ff0000"), 0.2126, 0.0005, "red");
  near(relLum("#00ff00"), 0.7152, 0.0005, "green");
  near(relLum("#0000ff"), 0.0722, 0.0005, "blue");
});
check("relLum: fails open on garbage (reads as black, never throws)", () => {
  eq(relLum(null), 0, "null");
  eq(relLum("nonsense"), 0, "nonsense");
  eq(relLum(undefined), 0, "undefined");
});
check("ratio: #000/#fff = 21:1 exactly, and is symmetric", () => {
  near(ratio("#000000", "#ffffff"), 21, 1e-9, "black on white");
  near(ratio("#ffffff", "#000000"), 21, 1e-9, "white on black");
});
check("ratio: a color against itself is 1:1", () => {
  near(ratio("#7cc4ff", "#7cc4ff"), 1, 1e-9, "self");
});
check("ratio: known WCAG pairs", () => {
  // #767676 on white is the canonical AA-boundary gray (4.54:1).
  near(ratio("#767676", "#ffffff"), 4.54, 0.02, "#767676 on white");
  // #ffffff on #0b1020 (the kit's default dark ground).
  near(ratio("#ffffff", DARK), 18.93, 0.01, "white on the dark ground");
});
check("passesAA: 4.5 floor for body, 3.0 for large", () => {
  ok(passesAA("#767676", "#ffffff"), "#767676 on white should pass body AA");
  ok(!passesAA("#8a8a8a", "#ffffff"), "#8a8a8a on white should fail body AA");
  ok(passesAA("#8a8a8a", "#ffffff", true), "#8a8a8a on white should pass large AA");
  ok(!passesAA("#aaaaaa", "#ffffff", true), "#aaaaaa on white should fail large AA");
});

// ---------------------------------------------------------------- nudgeToRatio
section("nudgeToRatio — one hue-preserving fix replacing neonize/ensureBright/ensureReadableOnLight");

check("already passing: no-op, hex === fg, adjusted false", () => {
  const n = nudgeToRatio("#ffffff", DARK, 4.5);
  eq(n.hex, "#ffffff", "hex");
  eq(n.adjusted, false, "adjusted");
  eq(n.from, "#ffffff", "from");
  eq(n.to, "#ffffff", "to");
  ok(n.ratio >= 4.5, "ratio should already clear");
});
check("dark ground: a deep navy is LIFTED until it clears (neonize's job)", () => {
  const n = nudgeToRatio("#1b2a6b", DARK, 3.0);
  eq(n.adjusted, true, "should have been adjusted");
  ok(n.ratio >= 3.0, `should clear 3:1, got ${n.ratio}`);
  ok(relLum(n.hex) > relLum("#1b2a6b"), "should have been lifted, not darkened");
});
check("light ground: a bright accent is DARKENED until it reads (ensureReadableOnLight's job)", () => {
  const n = nudgeToRatio("#ffd400", LIGHT, 4.5);
  eq(n.adjusted, true, "should have been adjusted");
  ok(n.ratio >= 4.5, `should clear 4.5:1, got ${n.ratio}`);
  ok(relLum(n.hex) < relLum("#ffd400"), "should have been darkened, not lifted");
});
check("hue is PRESERVED within hueDriftMax across many colors, grounds and targets", () => {
  const hueOf = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return null;
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h / 6) * 360;
  };
  const drift = 40;
  for (const hex of ["#1b2a6b", "#ffd400", "#8b0000", "#004d40", "#ff5a3c", "#8b7cf6", "#2b5bff", "#d4a94e"]) {
    for (const ground of [DARK, LIGHT, "#ffffff", "#000000", "#2b2b2b"]) {
      for (const target of [3, 4.5, 7]) {
        const n = nudgeToRatio(hex, ground, target, drift);
        const [h0, h1] = [hueOf(hex), hueOf(n.hex)];
        if (h0 == null || h1 == null) continue;
        let d = Math.abs(h0 - h1) % 360; if (d > 180) d = 360 - d;
        ok(d <= drift, `${hex} -> ${n.hex} on ${ground}@${target}: hue drifted ${d.toFixed(1)}° (max ${drift}°)`);
      }
    }
  }
});
check("hueDriftMax = 0 still returns a color (never drops, never throws)", () => {
  const n = nudgeToRatio("#1b2a6b", DARK, 7, 0);
  ok(typeof n.hex === "string" && /^#[0-9a-f]{6}$/.test(n.hex), `expected a hex, got ${n.hex}`);
});
check("unreachable target: returns the BEST candidate with the real ratio — the caller decides", () => {
  // Nothing clears 21:1 on a mid gray. It must not throw and must not lie.
  const n = nudgeToRatio("#ff5a3c", "#808080", 21);
  ok(n.ratio < 21, "ratio must report the truth, not the target");
  ok(n.ratio > 1, "should still have improved on the original");
  ok(/^#[0-9a-f]{6}$/.test(n.hex), "still a real color");
});
check("garbage input passes through untouched (fail-open)", () => {
  const n = nudgeToRatio("not-a-color", DARK, 4.5);
  eq(n.hex, "not-a-color", "hex");
  eq(n.adjusted, false, "adjusted");
});

// ---------------------------------------------------------------- no-op law
section("resolveBrand(null, …) — the no-op law: today's output must be byte-identical");

check("null brandSkin is an EXACT passthrough of packAccents (order, case, count)", () => {
  const s = resolveBrand(null, { ground: DARK, isDark: true, packAccents: PACK });
  eq(s.accents.length, PACK.length, "count");
  PACK.forEach((a, i) => eq(s.accents[i], a, `accents[${i}]`));
  eq(s.accent, PACK[0], "accent");
  eq(s.accent2, PACK[1], "accent2");
  eq(s.accent3, PACK[2], "accent3");
});
check("null brandSkin: tier off, applied false, nothing adjusted, nothing dropped", () => {
  const s = resolveBrand(null, { ground: DARK, isDark: true, packAccents: PACK });
  eq(s.tier, "off", "tier");
  eq(s.applied, false, "applied");
  eq(s.adjusted.length, 0, "adjusted");
  eq(s.dropped.length, 0, "dropped");
  eq(s.atmosphere, null, "atmosphere");
});
check("null brandSkin: slots is EMPTY, so every composer literal stands", () => {
  const s = resolveBrand(null, { ground: DARK, isDark: true, packAccents: PACK, contract: { slots: ["chip", "border"] } });
  eq(Object.keys(s.slots).length, 0, "slots must stay empty with no brand applied");
});
check("null brandSkin: a low-contrast pack accent is NOT filtered — the pack owns its accents", () => {
  const muddy = ["#12141f", "#7CC4FF"];   // #12141f is nearly the dark ground
  const s = resolveBrand(null, { ground: DARK, isDark: true, packAccents: muddy });
  eq(s.accents[0], "#12141f", "the pack's own color must survive untouched");
});
check("resolveBrand never throws on absent/garbage options (fail-open)", () => {
  for (const opts of [undefined, {}, { ground: null, packAccents: null }, { ground: "zzz", packAccents: ["nope"], contract: "bogus" }]) {
    const s = resolveBrand(null, opts);
    ok(s && typeof s.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(s.accent), `expected a usable accent, got ${s && s.accent}`);
    ok(Array.isArray(s.chart) && s.chart.length >= 3, "chart must always be usable");
  }
  ok(resolveBrand(undefined, { packAccents: PACK }).applied === false, "undefined skin is off");
  ok(resolveBrand({ accents: "not-an-array" }, { packAccents: PACK }).applied === false, "malformed skin is off");
});

// ---------------------------------------------------------------- shape is the contract
section("the SHAPE is the contract — identity keys must not exist to be read");

check("no ground / ink / font / motion / layout key exists on the PackSkin", () => {
  const s = resolveBrand({ accents: ["#ff9900"] }, { ground: DARK, isDark: true, packAccents: PACK });
  for (const forbidden of ["ground", "ink", "font", "fonts", "fontStack", "motion", "layout", "background", "surface", "text"]) {
    ok(!(forbidden in s), `PackSkin must not expose "${forbidden}" — a composer could brand-tint its identity with it`);
  }
});
check("cssVarBlock emits accent-family vars only — no --kf-ground, no --kf-ink", () => {
  const s = resolveBrand({ accents: ["#ff9900"] }, { ground: DARK, isDark: true, packAccents: PACK });
  const css = cssVarBlock(s);
  ok(css.includes("--kf-accent:#ff9900;"), `expected the brand accent, got ${css}`);
  ok(/--kf-glow:rgba\(/.test(css), "expected a --kf-glow rgba");
  ok(!/--kf-(ground|ink|font|bg)\b/.test(css), `must not emit an identity var: ${css}`);
  ok(css.trim().endsWith(";"), "vars are `;`-terminated so they drop straight into a :root block");
});
check("cssVarBlock fails open on a null/empty skin", () => {
  eq(cssVarBlock(null), "", "null");
  eq(cssVarBlock({}), "", "empty");
});

// ---------------------------------------------------------------- nudge, don't drop
section("brand accents — NUDGED onto the ground, not dropped");

check("a brand color too close to the ground is NUDGED and DISCLOSED in adjusted[]", () => {
  const nearGround = "#141a33";   // a hair off #0b1020 — invisible as an accent
  const s = resolveBrand({ accents: [nearGround] }, { ground: DARK, isDark: true, packAccents: PACK });
  eq(s.applied, true, "the brand must still apply — nudge, don't drop");
  eq(s.dropped.length, 0, `must not drop a salvageable color: ${JSON.stringify(s.dropped)}`);
  eq(s.adjusted.length, 1, `expected exactly one disclosed correction: ${JSON.stringify(s.adjusted)}`);
  eq(s.adjusted[0].from, nearGround, "adjusted[].from is the brand's original color");
  ok(s.adjusted[0].to !== nearGround, "adjusted[].to must be the corrected color");
  ok(s.adjusted[0].reason && s.adjusted[0].reason.length > 0, "a correction must say WHY");
  eq(s.accent, s.adjusted[0].to, "the corrected color leads the accent list");
  ok(ratio(s.accent, DARK) >= DEFAULT_CONTRACT.contrastFloor, "the corrected accent clears the floor");
});
check("a legible brand color is applied UNTOUCHED (nothing to disclose)", () => {
  const s = resolveBrand({ accents: ["#ff9900"] }, { ground: DARK, isDark: true, packAccents: PACK });
  eq(s.applied, true, "applied");
  eq(s.tier, "accents", "tier");
  eq(s.accent, "#ff9900", "the brand color leads, unmodified");
  eq(s.adjusted.length, 0, "an already-legible color must not be touched");
});
check("brand accents LEAD, pack accents follow and survive", () => {
  const s = resolveBrand({ accents: ["#ff9900"] }, { ground: DARK, isDark: true, packAccents: PACK });
  eq(s.accents[0], "#ff9900", "brand leads");
  ok(s.accents.includes("#7CC4FF"), "the pack's accents are kept behind the brand's");
});
check("a gray on a mid gray ground is still NUDGED, not dropped (no hue to lose)", () => {
  // Worth pinning: the obvious "same luminance as the ground" case is NOT a drop.
  // #808080 has 5.32:1 of headroom toward black, so #838383 darkens into legibility.
  const s = resolveBrand({ accents: ["#838383"] }, { ground: "#808080", isDark: false, packAccents: PACK, contract: { contrastFloor: 4.5 } });
  eq(s.applied, true, "salvageable — nudge, don't drop");
  eq(s.dropped.length, 0, `must not drop: ${JSON.stringify(s.dropped)}`);
  ok(ratio(s.accent, "#808080") >= 4.5, "and the result clears the floor");
});
check("a floor beyond the ground's headroom is unsalvageable -> dropped with a reason", () => {
  // #808080 offers at most 5.32:1 (to black) and 3.95:1 (to white). A 7:1 floor is
  // unreachable in EITHER direction, at any hue — that, and only that, is a drop.
  const s = resolveBrand({ accents: ["#ff5a3c"] }, { ground: "#808080", isDark: false, packAccents: PACK, contract: { contrastFloor: 7 } });
  eq(s.applied, false, "nothing usable survived");
  eq(s.tier, "off", "tier falls back to off");
  eq(s.dropped.length, 1, `expected one drop: ${JSON.stringify(s.dropped)}`);
  eq(s.dropped[0].hex, "#ff5a3c", "dropped[].hex");
  ok(s.dropped[0].reason && /unsalvageable/.test(s.dropped[0].reason), "a drop must say WHY");
  eq(s.accents[0], PACK[0], "and the pack's own accents stand");
});
check("hueDriftMax GATES the drop: the same color is saved at 40° and dropped at 0°", () => {
  const near = { accents: ["#141a33"] };   // a near-ground navy: needs a real lift
  const opts = { ground: DARK, isDark: true, packAccents: PACK };
  const saved = resolveBrand(near, { ...opts, contract: { hueDriftMax: 40 } });
  eq(saved.applied, true, "40° of budget is enough to lift it into legibility");
  eq(saved.dropped.length, 0, "not dropped");
  // 0° forbids even the sub-degree hue error of 8-bit rounding, so the walk cannot
  // move and the color never reaches the floor.
  const lost = resolveBrand(near, { ...opts, contract: { hueDriftMax: 0 } });
  eq(lost.applied, false, "0° of budget means the color cannot be moved at all");
  eq(lost.dropped.length, 1, `expected the drop: ${JSON.stringify(lost.dropped)}`);
  ok(/0°/.test(lost.dropped[0].reason), `the reason must name the budget: ${lost.dropped[0].reason}`);
});
check("a non-hex brand color is dropped, and the rest still apply", () => {
  const s = resolveBrand({ accents: ["rgb(255,0,0)", "#ff9900"] }, { ground: DARK, isDark: true, packAccents: PACK });
  eq(s.applied, true, "the valid color still applies");
  eq(s.accent, "#ff9900", "accent");
  eq(s.dropped.length, 1, "the garbage is dropped");
  eq(s.dropped[0].hex, "rgb(255,0,0)", "dropped[].hex reports what was rejected");
});
check("maxAccents caps how many brand colors may lead", () => {
  const skin = { accents: ["#ff9900", "#00b3ff", "#e91e63", "#8bc34a"] };
  const s = resolveBrand(skin, { ground: DARK, isDark: true, packAccents: PACK, contract: { maxAccents: 2 } });
  eq(s.accents[0], "#ff9900", "first brand accent");
  eq(s.accents[1], "#00b3ff", "second brand accent");
  eq(s.accents[2], PACK[0], "the third slot returns to the pack");
});

// ---------------------------------------------------------------- tiers
section("tiers — a pack's contract decides how far the brand reaches");

check('mode "off": the brand is ignored entirely', () => {
  const s = resolveBrand({ accents: ["#ff9900"] }, { ground: DARK, isDark: true, packAccents: PACK, contract: { mode: "off" } });
  eq(s.tier, "off", "tier");
  eq(s.applied, false, "applied");
  eq(s.accent, PACK[0], "the pack's accent stands");
});
check('mode "accent": exactly ONE brand color leads', () => {
  const s = resolveBrand({ accents: ["#ff9900", "#00b3ff"] }, { ground: DARK, isDark: true, packAccents: PACK, contract: { mode: "accent" } });
  eq(s.tier, "accent", "tier");
  eq(s.accents[0], "#ff9900", "the one brand accent");
  eq(s.accents[1], PACK[0], "everything after it is the pack's");
});
check('mode "atmosphere": exposes a HUE + mix, never a ground color', () => {
  const s = resolveBrand({ accents: ["#ff9900"] }, { ground: DARK, isDark: true, packAccents: PACK, contract: { mode: "atmosphere" } });
  eq(s.tier, "atmosphere", "tier");
  ok(s.atmosphere && typeof s.atmosphere.hue === "number", "atmosphere.hue");
  ok(s.atmosphere.hue >= 0 && s.atmosphere.hue <= 360, `hue in range, got ${s.atmosphere.hue}`);
  ok(s.atmosphere.mix > 0 && s.atmosphere.mix < 0.5, `mix must stay a TINT, got ${s.atmosphere.mix}`);
  eq(typeof s.atmosphere.hue, "number", "a hue is a number — there is no hex to paint a ground with");
});
check("atmosphere is null for every other tier", () => {
  for (const mode of ["off", "accent", "accents"]) {
    const s = resolveBrand({ accents: ["#ff9900"] }, { ground: DARK, isDark: true, packAccents: PACK, contract: { mode } });
    eq(s.atmosphere, null, `mode ${mode}`);
  }
});
check("an unknown mode falls back to the default contract (never throws)", () => {
  const s = resolveBrand({ accents: ["#ff9900"] }, { ground: DARK, isDark: true, packAccents: PACK, contract: { mode: "take-over-everything" } });
  eq(s.tier, DEFAULT_CONTRACT.mode, "tier");
});
check("gradients.background is a transparent WASH, carrying no ground color", () => {
  const s = resolveBrand({ accents: ["#ff9900"] }, { ground: DARK, isDark: true, packAccents: PACK });
  ok(/rgba\(255,153,0,0\)/.test(s.gradients.background), `must fade to fully transparent: ${s.gradients.background}`);
  ok(!s.gradients.background.includes(DARK), "must not bake the ground into itself");
});

// ---------------------------------------------------------------- locking by absence
section("slots — locking by absence");

check("a locked role is ABSENT from slots (not null, not a literal — absent)", () => {
  const s = resolveBrand({ accents: ["#ff9900"] }, {
    ground: DARK, isDark: true, packAccents: PACK,
    contract: { slots: ["chip"] },   // "chip" is writable; every other role is locked
  });
  ok("chip" in s.slots, "a declared role must be present");
  ok(!("statusOk" in s.slots), "an undeclared role must be ABSENT, so `?? literal` wins");
  ok(!("ground" in s.slots), "ground is never writable");
  ok(s.slots.statusOk === undefined, "absence is the lock: reading it gives undefined");
  eq(Object.keys(s.slots).length, 1, "ONLY the declared role is present");
});
check("a writable role resolves to a ground-legible color", () => {
  const s = resolveBrand({ accents: ["#141a33"] }, {
    ground: DARK, isDark: true, packAccents: PACK, contract: { slots: ["chip", "rule"] },
  });
  for (const role of ["chip", "rule"]) {
    ok(/^#[0-9a-f]{6}$/.test(s.slots[role]), `slots.${role} must be a hex, got ${s.slots[role]}`);
    ok(ratio(s.slots[role], DARK) >= DEFAULT_CONTRACT.contrastFloor, `slots.${role} must clear the floor on the ground`);
  }
});
check("a slot may name its source and its own floor", () => {
  const s = resolveBrand({ accents: ["#ff9900", "#00b3ff"] }, {
    ground: DARK, isDark: true, packAccents: PACK,
    contract: { slots: [{ role: "cta", from: "accent2" }, { role: "rule", from: "accent", minRatio: 7 }] },
  });
  eq(s.slots.cta, "#00b3ff", "cta follows accent2");
  ok(ratio(s.slots.rule, DARK) >= 7, "rule honors its own stricter floor");
});
check("a malformed slot entry is skipped, not fatal", () => {
  const s = resolveBrand({ accents: ["#ff9900"] }, {
    ground: DARK, isDark: true, packAccents: PACK, contract: { slots: [null, 42, {}, "chip"] },
  });
  eq(Object.keys(s.slots).length, 1, "only the one real role");
  ok("chip" in s.slots, "chip");
});

// ---------------------------------------------------------------- derived values
section("chart / three / ui — derived render values");

check("chart: >=3 entries, pairwise distinct, each clearing 3:1 — across many grounds and skins", () => {
  const grounds = [DARK, LIGHT, "#ffffff", "#000000", "#0A0B16", "#FFFDF5", "#2b2b2b", "#808080"];
  const skins = [null, { accents: ["#ff9900"] }, { accents: ["#141a33"] }, { accents: ["#ffffff"] }, { accents: ["#ff9900", "#ffa412", "#ffb020"] }];
  for (const ground of grounds) {
    for (const skin of skins) {
      const s = resolveBrand(skin, { ground, packAccents: PACK });
      ok(s.chart.length >= 3, `${ground}: expected >=3 chart colors, got ${s.chart.length}`);
      for (const c of s.chart) {
        ok(/^#[0-9a-f]{6}$/.test(c), `${ground}: chart entry must be a hex, got ${c}`);
        ok(ratio(c, ground) >= 3, `${ground}: chart ${c} is ${ratio(c, ground).toFixed(2)}:1 — below the 3:1 floor`);
      }
      for (let i = 0; i < s.chart.length; i++) {
        for (let j = i + 1; j < s.chart.length; j++) {
          ok(s.chart[i] !== s.chart[j], `${ground}: chart[${i}] and chart[${j}] are the same color (${s.chart[i]})`);
        }
      }
    }
  }
});
check("chart: near-identical candidates do not both make it in (tellable apart, not merely !==)", () => {
  const s = resolveBrand({ accents: ["#ff9900", "#ff9a01", "#ff9b02"] }, { ground: DARK, isDark: true, packAccents: PACK });
  const [a, b] = s.chart;
  const d = (x, y) => { const p = parseInt(x.slice(1), 16), q = parseInt(y.slice(1), 16); return Math.abs(((p >> 16) & 255) - ((q >> 16) & 255)) + Math.abs(((p >> 8) & 255) - ((q >> 8) & 255)) + Math.abs((p & 255) - (q & 255)); };
  ok(d(a, b) >= 30, `chart[0] ${a} and chart[1] ${b} are indistinguishable`);
});
check("three: 0x ints, ground-corrected against the (dark) 3D stage", () => {
  const stage = "#05060e";
  const s = resolveBrand({ accents: ["#1b2a6b"] }, { ground: stage, isDark: true, packAccents: PACK });
  for (const k of ["A", "B", "C", "glow", "particle", "lightKey", "lightFill"]) {
    ok(typeof s.three[k] === "number", `three.${k} must be a number, got ${typeof s.three[k]}`);
    ok(s.three[k] >= 0 && s.three[k] <= 0xffffff, `three.${k} out of range: ${s.three[k]}`);
  }
  const hex = `#${s.three.A.toString(16).padStart(6, "0")}`;
  ok(ratio(hex, stage) >= DEFAULT_CONTRACT.contrastFloor, `three.A (${hex}) must not collapse into the stage`);
});
check("ui.onAccent is the ink that actually reads on the accent", () => {
  const light = resolveBrand({ accents: ["#ffd400"] }, { ground: DARK, isDark: true, packAccents: PACK });
  eq(light.ui.onAccent, "#14130e", "dark ink on a bright yellow");
  const deep = resolveBrand(null, { ground: LIGHT, isDark: false, packAccents: ["#1b2a6b"] });
  eq(deep.ui.onAccent, "#ffffff", "white ink on a deep navy");
});
check("ui: every key present and non-empty", () => {
  const s = resolveBrand({ accents: ["#ff9900"] }, { ground: DARK, isDark: true, packAccents: PACK });
  for (const k of ["border", "chip", "indicator", "progress", "buttonBg", "onAccent", "hover", "active", "glow", "shadow", "tintWeak", "tintStrong"]) {
    ok(s.ui[k] && String(s.ui[k]).length > 0, `ui.${k} is missing`);
  }
});
check("emphasisCss keeps the live gradient order + angle (scene_kit:912) so adoption is a no-op", () => {
  const s = resolveBrand(null, { ground: DARK, isDark: true, packAccents: PACK });
  eq(s.emphasis[0], PACK[0], "emphasis A is accent");
  eq(s.emphasis[1], PACK[1], "emphasis B is accent2");
  eq(s.emphasisCss, `linear-gradient(100deg,${PACK[0]},${PACK[1]})`, "emphasisCss");
});
check("brandSkin.emphasis leads the emphasis pair when supplied", () => {
  const s = resolveBrand({ accents: ["#ff9900"], emphasis: ["#ff9900", "#00b3ff"] }, { ground: DARK, isDark: true, packAccents: PACK });
  eq(s.emphasis[0], "#ff9900", "emphasis A");
  eq(s.emphasis[1], "#00b3ff", "emphasis B");
});

// ---------------------------------------------------------------- emphasis arrival
// The regression these pin: a real Amazon render put #146eb4 in the emphasis slot on
// flagship's near-black stage purely because the user typed it second. It cleared
// every ratio check and the film still came out visually WEAKER than the stock one,
// because emphasis is the most brand-visible ink there is. Ground survival, not input
// order, decides the lead.
section("emphasis ARRIVAL — the lead is whoever survives THIS ground, in both directions");

const FLAGSHIP = "#0A0B16";           // flagship_composer.js:72 — the deep stage
const BRIGHTLIFE = "#FFFFFF";         // brightlife_composer.js:67 — the airy canvas
const AMZ_ORANGE = "#ff9900", AMZ_BLUE = "#146eb4";

check("dark ground: the vivid orange LEADS the mid-dark blue, whichever order it was typed in", () => {
  // 9.15:1 vs 3.66:1 on #0A0B16, and chroma 1.0 vs 0.63. Both clear the 3:1 floor, so
  // "it passes" was never the question — which one ARRIVES is.
  for (const order of [[AMZ_ORANGE, AMZ_BLUE], [AMZ_BLUE, AMZ_ORANGE]]) {
    const s = resolveBrand({ accents: order, emphasis: order }, { ground: FLAGSHIP, isDark: true, packAccents: PACK });
    eq(s.emphasis[0], AMZ_ORANGE, `typed ${order.join(",")}: the orange must lead on the dark stage`);
    eq(s.emphasis[1], AMZ_BLUE, `typed ${order.join(",")}: the blue is the second stop`);
  }
});
check("light ground: the SAME pair inverts — the blue leads, whichever order it was typed in", () => {
  // The mirror image, and the whole point: on white the orange is the weak one
  // (2.14:1, below the floor, needs correction) and the blue is comfortable (5.36:1).
  // A rule that just said "prefer the vivid one" or "prefer primary" would pick orange
  // here — the same defect wearing a mirror.
  for (const order of [[AMZ_ORANGE, AMZ_BLUE], [AMZ_BLUE, AMZ_ORANGE]]) {
    const s = resolveBrand({ accents: order, emphasis: order }, { ground: BRIGHTLIFE, isDark: false, packAccents: PACK });
    eq(s.emphasis[0], AMZ_BLUE, `typed ${order.join(",")}: the blue must lead on white`);
  }
});
check("the SAME palette resolves to DIFFERENT leads on the two grounds — it is ground-relative, not a fixed rule", () => {
  const skin = { accents: [AMZ_ORANGE, AMZ_BLUE], emphasis: [AMZ_ORANGE, AMZ_BLUE] };
  const dark = resolveBrand(skin, { ground: FLAGSHIP, isDark: true, packAccents: PACK });
  const light = resolveBrand(skin, { ground: BRIGHTLIFE, isDark: false, packAccents: PACK });
  ok(dark.emphasis[0] !== light.emphasis[0], `one palette, two grounds, two leads — got ${dark.emphasis[0]} on both`);
  eq(dark.emphasis[0], AMZ_ORANGE, "dark stage");
  eq(light.emphasis[0], AMZ_BLUE, "white canvas");
});
check("the emphasis lead is never a washed-out grey — the RESULT stays a color", () => {
  // #bbd5ea (chroma 0.18) is what a pale grey-blue looks like as a number. Whatever
  // leads must still be chromatic after the ground got its say.
  const chromaOf = (hex) => { const n = parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; return (Math.max(...c) - Math.min(...c)) / 255; };
  for (const ground of [FLAGSHIP, BRIGHTLIFE, DARK, LIGHT]) {
    const s = resolveBrand({ accents: [AMZ_ORANGE, AMZ_BLUE], emphasis: [AMZ_ORANGE, AMZ_BLUE] }, { ground, packAccents: PACK });
    ok(chromaOf(s.emphasis[0]) >= 0.4, `${ground}: emphasis lead ${s.emphasis[0]} has chroma ${chromaOf(s.emphasis[0]).toFixed(2)} — a grey, not a brand color`);
  }
});
check("PRIMARY wins ties: two colors that arrive equally well leave the user's pick leading", () => {
  // A real tie, not an eyeballed one: #ff9933 (9.19:1, chroma 0.80) and #66ccff
  // (10.86:1, chroma 0.60) score within 0.0001 of each other on the stage — the blue's
  // extra contrast and the orange's extra chroma cancel exactly. Two obviously
  // different colors that ARRIVE identically, so the ranking has no basis to reorder
  // and the person who chose the order keeps it. (Note WCAG luminance is hue-dependent:
  // matching S and L does NOT make a tie, which is why this pair had to be searched for.)
  for (const order of [["#ff9933", "#66ccff"], ["#66ccff", "#ff9933"]]) {
    const s = resolveBrand({ accents: order, emphasis: order }, { ground: FLAGSHIP, isDark: true, packAccents: PACK });
    eq(s.emphasis[0], order[0], `typed ${order.join(",")}: a tie must leave the primary leading`);
  }
});
check("PRIMARY wins NEAR-ties: a marginal scoring edge must not silently overrule an explicit pick", () => {
  // #ff9900 (9.15:1) vs #ffb020 (11.4:1) on the stage — the second is measurably
  // stronger, but not by enough that anyone would SEE the difference. The user's
  // lead stands.
  const s = resolveBrand({ accents: [AMZ_ORANGE, "#ffb020"], emphasis: [AMZ_ORANGE, "#ffb020"] }, { ground: FLAGSHIP, isDark: true, packAccents: PACK });
  eq(s.emphasis[0], AMZ_ORANGE, "a near-tie is not a mandate to reorder");
});
check("a demotion requires a REAL punishment, and then it happens", () => {
  // The floor of the thing: a near-ground navy that has to be dragged into legibility
  // loses to a color that was already there, even though the navy was typed first.
  const s = resolveBrand({ accents: ["#141a33", AMZ_ORANGE], emphasis: ["#141a33", AMZ_ORANGE] }, { ground: FLAGSHIP, isDark: true, packAccents: PACK });
  eq(s.emphasis[0], AMZ_ORANGE, "the color that arrived intact leads the one that had to be rescued");
});
check("accents[] order is NOT coupled to the emphasis ranking — the brand's sequence survives", () => {
  // Emphasis is ordered by ground survival; the ACCENT roles are the brand's own
  // sequence and stay brand-lead-first. Reordering one must never reorder the other.
  const s = resolveBrand({ accents: [AMZ_BLUE, AMZ_ORANGE], emphasis: [AMZ_BLUE, AMZ_ORANGE] }, { ground: FLAGSHIP, isDark: true, packAccents: PACK });
  eq(s.accents[0], AMZ_BLUE, "accents[0] stays the brand's own lead");
  eq(s.accents[1], AMZ_ORANGE, "accents[1] stays the brand's own second");
  eq(s.accent, AMZ_BLUE, "accent follows accents[0], untouched by the emphasis ranking");
  eq(s.emphasis[0], AMZ_ORANGE, "while the emphasis pair DID reorder by arrival");
});
check("emphasisCss keeps the A-then-B direction after ranking (still gradient(emphasis[0], emphasis[1]))", () => {
  const s = resolveBrand({ accents: [AMZ_BLUE, AMZ_ORANGE], emphasis: [AMZ_BLUE, AMZ_ORANGE] }, { ground: FLAGSHIP, isDark: true, packAccents: PACK });
  eq(s.emphasisCss, `linear-gradient(100deg,${s.emphasis[0]},${s.emphasis[1]})`, "emphasisCss must stay A-then-B over the RANKED pair");
});
check("ranking is fail-open: a single emphasis color, a dropped one, and garbage all still resolve", () => {
  const one = resolveBrand({ accents: [AMZ_ORANGE], emphasis: [AMZ_ORANGE] }, { ground: FLAGSHIP, isDark: true, packAccents: PACK });
  eq(one.emphasis[0], AMZ_ORANGE, "a pair of one ranks to itself");
  // Case-insensitive on purpose: a fallback to accent2 hands back the PACK's own hex,
  // which passes through untouched and un-recased — that is the no-op law, not a bug.
  eq(one.emphasis[1], PACK[0], "and the second stop falls back to accent2, the pack's own string");
  const junk = resolveBrand({ accents: [AMZ_ORANGE], emphasis: ["rgb(1,2,3)", AMZ_ORANGE] }, { ground: FLAGSHIP, isDark: true, packAccents: PACK });
  eq(junk.emphasis[0], AMZ_ORANGE, "an unrankable entry is dropped before ranking, not fatal");
  for (const emphasis of [[], null, "nope", [null, undefined]]) {
    const s = resolveBrand({ accents: [AMZ_ORANGE], emphasis }, { ground: FLAGSHIP, isDark: true, packAccents: PACK });
    ok(/^#[0-9a-f]{6}$/i.test(s.emphasis[0]) && /^#[0-9a-f]{6}$/i.test(s.emphasis[1]), `emphasis ${JSON.stringify(emphasis)} must still yield two colors, got ${JSON.stringify(s.emphasis)}`);
  }
});

// ---------------------------------------------------------------- no-op, again
// The ranking runs ONLY inside `applied`, so it must be invisible with no skin. This
// re-asserts the no-op law specifically across the code path the ranking added.
section("emphasis ranking — the NO-OP law still holds where the new code lives");

check("null brandSkin: emphasis is EXACTLY [accent, accent2] on every ground, ranking never runs", () => {
  for (const ground of [FLAGSHIP, BRIGHTLIFE, DARK, LIGHT, "#808080", "#000000"]) {
    const s = resolveBrand(null, { ground, packAccents: PACK });
    eq(s.emphasis[0], PACK[0], `${ground}: emphasis A must be the pack's accent, unranked`);
    eq(s.emphasis[1], PACK[1], `${ground}: emphasis B must be the pack's accent2, unranked`);
    eq(s.emphasisCss, `linear-gradient(100deg,${PACK[0]},${PACK[1]})`, `${ground}: emphasisCss`);
  }
});
check("null brandSkin: a pack whose OWN accents would rank differently is still not reordered", () => {
  // The pack's cyan arrives far stronger than its navy on a dark ground. With no brand
  // skin that is none of the resolver's business — the pack owns its accents.
  const packed = ["#1b2a6b", "#4ED7FF"];
  const s = resolveBrand(null, { ground: FLAGSHIP, isDark: true, packAccents: packed });
  eq(s.emphasis[0], "#1b2a6b", "the pack's own order stands, however weak its lead");
  eq(s.emphasis[1], "#4ED7FF", "emphasis B");
});
check('mode "off" with a brand skin: emphasis stays the pack\'s, ranking never runs', () => {
  const s = resolveBrand({ accents: [AMZ_BLUE, AMZ_ORANGE], emphasis: [AMZ_BLUE, AMZ_ORANGE] }, {
    ground: FLAGSHIP, isDark: true, packAccents: PACK, contract: { mode: "off" },
  });
  eq(s.emphasis[0], PACK[0], "emphasis A");
  eq(s.emphasis[1], PACK[1], "emphasis B");
});

console.log("");
console.log(failed
  ? `✗ ${failed} failed, ${passed} passed`
  : `✓ all ${passed} brand_kit assertions pass`);
console.log("");
process.exit(failed ? 1 : 0);
