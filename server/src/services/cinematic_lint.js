// Cinematic quality gate — the CEILING check that quickCheck + hyperframes lint
// don't do. They enforce a FLAT floor (some vectors, valid tracks); this enforces
// the SHOWCASE doctrine PER SCENE: ≥3 distinct visual layers, a camera move, a
// kinetic word-stagger headline, a reactive beat (counter/draw/sweep), an authored
// ambient layer, and real gradients. A composition failing these is an "animated
// slideshow", not broadcast-grade — so it's bounced for a repair lap toward the
// doctrine. Designed (showcase-quality-uplift) so the flagship/golden passes with
// 0 errors and a fade-only slideshow fails with several.
//
// CRITICAL: every density check runs on enrich-STRIPPED html. The deterministic
// enrichment layer (enrich.js) injects #__kf_bg + #__kf_fx (16 particles, rings,
// draw-lines) on EVERY comp — without stripping it, C4/C5/C6a would pass for free
// and the gate would be inert. Keep this exclusion list in sync with enrich.js.

const KF_IDS = ["__kf_bg", "__kf_fx"];
const KF_SEL = /\b(kfp\d*|kf-ring2?|kf-l\d|__kf_(bg|fx))\b/;

// Remove a balanced <div> subtree identified by id (handles the nested children
// the enrichment layers contain — a non-greedy regex would stop at the first
// inner </div> and leave most of the block behind).
function removeDivById(html, id) {
  const open = html.search(new RegExp(`<div\\s[^>]*\\bid="${id}"`, "i"));
  if (open === -1) return html;
  let i = html.indexOf(">", open);
  if (i === -1) return html;
  i += 1;
  let depth = 1;
  const tagRe = /<\/?div\b/gi;
  tagRe.lastIndex = i;
  let m;
  while ((m = tagRe.exec(html)) != null) {
    if (m[0][1] === "/") {
      depth -= 1;
      if (depth === 0) {
        const end = html.indexOf(">", m.index) + 1;
        return html.slice(0, open) + html.slice(end);
      }
    } else depth += 1;
  }
  return html;
}

// Remove the injected enrichment DOM + its timeline lines so the authored
// composition is judged on its own merits (else the always-injected vector field
// + ground gradient would satisfy C4/C5/C6a for free, making the gate inert).
function stripEnrich(html) {
  let out = removeDivById(String(html), "__kf_bg");
  out = removeDivById(out, "__kf_fx");
  out = out.split("\n").filter((line) => !KF_SEL.test(line)).join("\n");
  return out;
}

// Concatenated text of all INLINE <script> blocks (skip the gsap CDN <script src>).
function scriptOf(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) != null) {
    if (/\bsrc\s*=/.test(m[1])) continue;
    out.push(m[2]);
  }
  return out.join("\n");
}

const EXCLUDE_IDS = new Set([...KF_IDS, "ambient", "captions", "caption", "cap", "bg", "bgGlow", "root", "captionbar"]);

// Identify scene clips and return [{ id, html }] slices (open tag of scene i to
// open tag of scene i+1). `scenes` (storyboard) gives the authoritative id set
// when present; else fall back to id="s<n>" / id="s<Letter>" / id="scene<n>".
function sliceScenes(html, scenes) {
  const ids = [];
  const wanted = Array.isArray(scenes) && scenes.length
    ? scenes.map((s) => s && s.id).filter(Boolean).map(String)
    : null;
  const re = /<[a-zA-Z][\w-]*\b[^>]*\bid="([^"]+)"[^>]*\bdata-start=/g;
  let m;
  while ((m = re.exec(html)) != null) {
    const id = m[1];
    if (EXCLUDE_IDS.has(id)) continue;
    const isScene = wanted ? wanted.includes(id) : /^(s\d+|s[A-Za-z]|scene\d+)$/.test(id);
    if (!isScene) continue;
    // Only count a given scene container once (its bg/scrim/img share the prefix
    // but have suffixes like s2img/s2scrim — keep only the bare container id).
    if (/^(s\d+|s[A-Za-z]|scene\d+)$/.test(id)) ids.push({ id, index: m.index });
  }
  // de-dup by id, keep first occurrence (the container, declared before its tweens)
  const seen = new Set();
  const uniq = ids.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
  uniq.sort((a, b) => a.index - b.index);
  return uniq.map((x, i) => ({
    id: x.id,
    html: html.slice(x.index, i + 1 < uniq.length ? uniq[i + 1].index : html.length),
  }));
}

// Count distinct CONTENT-LAYER categories present in a scene slice.
function layerCategories(sceneHtml) {
  const cats = {
    text: /<h[12]\b|class="[^"]*\b(h1|h2|headline|h-?xl|h-?lg|h-?md|title|stat|cta)\b/i.test(sceneHtml),
    glow: /class="[^"]*\b(glow|blob|orb|bokeh|aura|halo)\b/i.test(sceneHtml) || /filter:\s*blur\([^)]*\)[^"]*(border-radius:\s*50%|radial-gradient)/i.test(sceneHtml),
    panel: /class="[^"]*\b(glass|card|panel|stat|browser|tile|cat|cardf)\b/i.test(sceneHtml),
    media: /<img\b|<video\b/i.test(sceneHtml),
    svg: /<svg\b/i.test(sceneHtml),
    grad: /class="[^"]*\bgrad\b/i.test(sceneHtml),
    sticker: /class="[^"]*\b(chip|badge|sticker|callout|pill|kicker)\b/i.test(sceneHtml),
  };
  return Object.values(cats).filter(Boolean).length;
}

// Does the script camera-move this scene (scale/position, not opacity-only)?
// NOTE: use [^;]* (not [^)]*) so values containing parens — blur(10px),
// back.out(2) — don't truncate the match before the camera prop. Credit a tween
// on the scene container OR any id-prefixed child (#sNimg / #sNbg / #sNstage /
// #sNbrowser / #sNglow) OR an inner stage/asset class.
function sceneHasCamera(script, id) {
  const props = "scale|xPercent|yPercent|rotationX|rotationY|rotateX|rotateY|rotation|backgroundPosition";
  if (new RegExp(`tl\\.(?:to|fromTo)\\(\\s*["'']#${id}[\\w-]*\\b[^;]*\\b(?:${props})\\b`).test(script)) return true;
  const cls = "stage|shot|browser|safe|stat|card|cam|backdrop|inner|device|mock";
  return new RegExp(`tl\\.(?:to|fromTo)\\(\\s*["''][.](?:${cls})\\b[^;]*\\b(?:${props})\\b`).test(script);
}

// Main static gate. Returns { errors:[], warnings:[] }.
function cinematicCheck(html, { duration, scenes, assets } = {}) {
  const errors = [], warnings = [];
  const stripped = stripEnrich(String(html || ""));
  const script = scriptOf(stripped);
  const sceneSlices = sliceScenes(stripped, scenes);
  const n = sceneSlices.length || 1;
  const ceilHalf = Math.ceil(n / 2);

  // C1 — per-scene layer density
  let thin = 0;
  for (const sc of sceneSlices) {
    const cats = layerCategories(sc.html);
    if (cats < 3) errors.push(`Scene #${sc.id} has only ${cats} distinct visual layer(s) — premium scenes layer ≥4. Add a blurred radial glow div, a gradient-text emphasis word, and an inline <svg> accent group OR a glass card to THIS scene, each animated by the timeline.`);
    else if (cats === 3) thin++;
  }
  if (thin) warnings.push(`${thin} scene(s) sit at exactly 3 layers — aim for 4–5 (glow + focal + headline/sub + SVG accent).`);

  // C2 — per-scene camera
  if (sceneSlices.length) {
    const withCam = sceneSlices.filter((sc) => sceneHasCamera(script, sc.id)).length;
    const ratio = withCam / sceneSlices.length;
    if (ratio < 0.6) errors.push(`${withCam}/${sceneSlices.length} scenes have a camera move; premium video camera-explores EVERY scene. Add a tween on #sN or its inner .stage — Ken-Burns scale 1.0→1.08, or spotlight scale 1.04→1.16 + xPercent (ease:none). Opacity in/out alone is NOT a camera move.`);
    else if (ratio < 1.0) warnings.push(`${withCam}/${sceneSlices.length} scenes camera-explore — give EVERY scene a backdrop push.`);
  }

  // C3 — kinetic word-span typography (film-level: split spans + a staggered reveal)
  const hasWordSpans = (String(stripped).match(/class="[^"]*\b(word|char|line)\b/gi) || []).length >= 2;
  const hasWordStagger = /tl\.(?:from|fromTo)\([^;]*\.(?:word|char|line)\b[^;]*stagger/.test(script);
  // WARNING not error: word-stagger is the strongest reveal, but a film can be
  // cinematic with other techniques (char-splits, slide/clip reveals — the
  // amazon-premium reference uses no .word spans yet is premium). Don't bounce on it.
  if (!(hasWordSpans && hasWordStagger)) {
    warnings.push(`No kinetic word-span typography. Strongly prefer splitting ≥1 headline per scene into <span class="word">…</span> and revealing with a stagger (yPercent+blur). A flat headline block is an amateur tell.`);
  }

  // C4 — reactive beat (counter / draw-on / sweep), excluding enrichment
  const countUp = /onUpdate[\s\S]{0,200}(textContent|innerText)/.test(script);
  const drawOn = /strokeDashoffset\s*:\s*0\b/.test(script) || /\{\s*strokeDashoffset\s*:\s*\d/.test(script);
  const sweep = /backgroundPosition/.test(script);
  if (!(countUp || drawOn || sweep)) {
    errors.push(`No reactive beat (a value that resolves mid-scene). Add ≥1: a count-up ({v:0} proxy with snap + onUpdate writing textContent), a drawing connector (strokeDashoffset→0 on an AUTHORED line/path), an arc fill, or a gradient sweep (backgroundPosition). Pure fade is not reactive.`);
  } else {
    const beats = (countUp ? 1 : 0) + (drawOn ? 1 : 0) + (sweep ? 1 : 0);
    if (beats < ceilHalf && countUp + drawOn + sweep < 2) warnings.push("Only one reactive-beat idiom across the film — vary it (counter, connector draw, arc, sweep) per scene.");
  }

  // C5 — authored ambient layer (svg primitives OR blurred decorative divs), excluding enrich
  const svgPrims = (stripped.match(/<(?:circle|ellipse|path|rect|polygon|polyline|line)\b/gi) || []).length;
  const blurDivs = (stripped.match(/class="[^"]*\b(blob|glow|orb|bokeh|aura|halo)\b/gi) || []).length
    + (stripped.match(/filter:\s*blur\([^)]*\)[^"]*(border-radius:\s*50%|radial-gradient)/gi) || []).length;
  if (svgPrims + blurDivs < 3) {
    errors.push(`No authored ambient layer (excluding deterministic enrichment). Add an inline <svg> bokeh field (6–12 drifting <circle>) OR ≥2 large blurred radial-gradient glow/blob divs, each drifting on a finite-repeat tween.`);
  }

  // C6a — gradient presence (≥2), excluding enrich → error
  const gradients = (stripped.match(/\b(?:linear|radial|conic)-gradient\(/gi) || []).length;
  if (gradients < 2) {
    errors.push(`Backgrounds/headlines are flat. Add a design-system ground gradient and a gradient emphasis — using ONLY the active design system's palette tokens (HARD PALETTE LAW).`);
  }
  // C6b — gradient-text headline → warning (some packs forbid gradient text)
  const hasGradText = /(?:-webkit-)?background-clip:\s*text[\s\S]{0,160}?-gradient\(|(?:linear|radial|conic)-gradient\([\s\S]{0,160}?(?:-webkit-)?background-clip:\s*text/i.test(stripped);
  if (!hasGradText) warnings.push("No gradient-text emphasis word — a single .grad accent word lifts the headline (skip only if the design system forbids gradient text).");

  // C7 — real screenshot must be in a device/browser frame (conditional on a screenshot asset)
  const shots = (assets || []).filter((a) => a && a.path && (a.source === "website" || /screenshot/i.test(a.alt || "")));
  for (const a of shots) {
    const imgRe = new RegExp(`<img\\b[^>]*\\bsrc="${a.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "i");
    const im = imgRe.exec(stripped);
    if (!im) continue; // missing-screenshot is quickCheck's job, not ours
    const around = stripped.slice(Math.max(0, im.index - 700), im.index + 200);
    const inFrame = /class="[^"]*\b(browser|device|frame|mockup|window|chrome)\b/i.test(around)
      && (/class="[^"]*\b(bar|browser-bar)\b/i.test(around) || /border-radius:\s*50%[\s\S]{0,120}border-radius:\s*50%/i.test(around));
    const hasKenBurns = new RegExp(`tl\\.(?:to|fromTo)\\([^)]*${a.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(script)
      || /tl\.(?:to|fromTo)\(\s*["''][#.][^"']*(?:shot|screen)\b[^)]*\b(scale|yPercent|y)\b/.test(script);
    if (!inFrame && !hasKenBurns) {
      errors.push(`The real screenshot ${a.path} is not in a device/browser frame and isn't camera-explored. Wrap it in a .browser with a .browser-bar (3 dots + URL pill) at ≥58% canvas, with a Ken-Burns push and 1–2 callout chips. A bare screenshot reads as a slide.`);
    } else if (!inFrame) {
      warnings.push(`Screenshot ${a.path} is camera-explored but not in a browser frame — a chrome frame reads more credible.`);
    }
  }

  return { errors, warnings, sceneCount: sceneSlices.length };
}

module.exports = { cinematicCheck, stripEnrich, scriptOf, sliceScenes };
