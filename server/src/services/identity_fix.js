// Deterministic template-identity fixer (phase 2 sibling of contrast_fix.js).
//
// The identity GATE (pipeline.js identityGate) already detects when an LLM-composed
// film drifts off the selected pack's palette — a saturated hex more than 40° of
// hue from every pack token (a foreign teal on a coral pack). But, like the old
// contrast gate, it only warned or fed an LLM repair lap. This fixes it
// deterministically: snap each off-palette color to the nearest pack token that
// keeps the hue, and global-replace it in the composed HTML. No LLM, no re-roll.
//
// Reuses the exact hue math from identityGate so what this fixes is what that gate
// measures. Pure string+regex; fail-soft; only touches color hexes.

function toRgb(h) {
  const s = h.replace(/^#/, "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
function toHueSat([r, g, b]) {
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, d = mx - mn;
  let h = 0;
  if (d) {
    const [R, G, B] = [r / 255, g / 255, b / 255];
    h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, sat: mx ? d / mx : 0 };
}
function hueDist(a, b) { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
function colorDist(a, b) { return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2; }

// html: composed index.html string. packTokens: { colors:{tok:"#HEX"}, fonts:[] }.
// Returns { html, changed:[], remapped:[{from,to,count}], unfixable:[] }.
function identityFix(html, packTokens) {
  const tokens = packTokens && packTokens.colors ? Object.values(packTokens.colors).filter((t) => /^#[0-9a-fA-F]{6}$/.test(t)) : [];
  if (!tokens.length) return { html, changed: [], remapped: [], unfixable: [] };
  const tokenRgb = tokens.map((t) => ({ hex: t.toUpperCase(), rgb: toRgb(t), hs: toHueSat(toRgb(t)) }));
  const packHues = tokenRgb.filter((t) => t.hs.sat > 0.18).map((t) => t.hs.h);
  if (!packHues.length) return { html, changed: [], remapped: [], unfixable: [] }; // monochrome pack — no hue policing

  // Count every saturated hex in the comp (same rule as the gate).
  const counts = new Map();
  for (const m of html.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const hex = "#" + m[1].toUpperCase();
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  const remapped = [];
  const changed = [];
  let out = html;
  const tokenSet = new Set(tokenRgb.map((t) => t.hex));
  for (const [hex, n] of counts) {
    if (tokenSet.has(hex)) continue; // already a pack token
    const rgb = toRgb(hex);
    const { h, sat } = toHueSat(rgb);
    if (sat < 0.28) continue; // neutral / washed tint (scrims, ink, shadows) — allowed
    // Near-black / near-white are perceptually neutral even when their tiny RGB
    // spread pushes `sat` over the bar — their hue is noise, so remapping a near-
    // black ink (#14130E) to a pack's near-black is pointless churn and risks
    // tinting text. Leave them alone; only police genuinely colored mid-tones.
    if (Math.max(...rgb) < 45 || Math.min(...rgb) > 210) continue;
    if (!packHues.every((ph) => hueDist(h, ph) > 40)) continue; // within a pack hue → legitimate derivation
    // Off-palette: snap to the nearest pack token, preferring same-hue tokens so a
    // shade/tint maps to its family, else the nearest color overall.
    const sameHue = tokenRgb.filter((t) => hueDist(t.hs.h, h) <= 40);
    const pool = sameHue.length ? sameHue : tokenRgb;
    const best = pool.slice().sort((a, b) => colorDist(a.rgb, rgb) - colorDist(b.rgb, rgb))[0];
    if (!best) continue;
    // Global case-insensitive replace of this exact hex.
    const re = new RegExp(hex.replace("#", "#"), "gi");
    out = out.replace(re, best.hex);
    remapped.push({ from: hex, to: best.hex, count: n });
    changed.push(`identity: ${hex} (×${n}) → ${best.hex}`);
  }
  return { html: out, changed, remapped, unfixable: [] };
}

module.exports = { identityFix };
