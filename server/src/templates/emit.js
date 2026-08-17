// EMIT — compile a validated TemplateSpec into the three artifacts a KEYFRAME template is:
//
//   1. server/src/services/film_skins/<slug>.js   the composer module (registered by directory scan)
//   2. <root>/<slug>/pack.json                    the machine-readable manifest every render path reads
//   3. <root>/<slug>/FRAME.md                     the discovery gate + human label
//
// THIS MODULE IS THE SAFETY BOUNDARY. templates/spec.js proved the design is well-formed DATA;
// everything executable in the emitted module is generated HERE, by code in this repo, from
// that data. The design model's strings only ever reach the output as (a) JSON values, (b)
// escaped text inside a string literal, or (c) markdown prose. No model output is eval'd,
// required, concatenated into an executable position, or passed to a template that could make
// it one. That is what lets an AI author a renderable template without the render browser ever
// executing AI-authored code.
//
// WHY THE SKIN IS A FILE OF ITS OWN AND NOT A ROW IN A TABLE: services/pipeline.js registers
// composers from a hand-written literal map, with exactly one exception — filmSkinComposers()
// directory-scans src/services/film_skins/*.js and registers each as `film-<slug>`. That scan is
// the only zero-code-edit registration hook in the repo, it already carries 89 of the 135
// installed packs, and the entire downstream chain (media contract, audio profile, poster and
// preview, all 23 pack-sweeping test guards) is proven against it.

const fs = require("node:fs");
const path = require("node:path");
const paths = require("./paths");
const { validateSpec } = require("./spec");

// ---------------------------------------------------------------- helpers

// Numbers in generated source: fixed to 2dp so the output is compact and, more importantly,
// byte-stable — a regeneration from the same spec must produce the same file, or the
// composition hash in media.json churns and `npm run test:pack-media` reports false staleness.
const n2 = (v) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return "0";
  return String(Math.round(x * 100) / 100);
};

// A JS string literal. Everything model-authored that lands inside generated source goes
// through here or through JSON.stringify — never through raw interpolation.
const lit = (s) => JSON.stringify(String(s == null ? "" : s));

// Deterministic PRNG, seeded from the slug. Used at EMIT time only, so the generated world
// carries literal numbers and the render page runs no RNG at all — which is what makes the
// backdrop seek-exact (film_stage re-evaluates World on every seek; a Math.random in there
// would make every frame different and the video flicker).
function mulberry(seedStr) {
  let h = 2166136261;
  const s = String(seedStr || "kf");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = (h >>> 0) || 7;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A palette role -> the expression that reads it off the live theme at render time.
// ALWAYS a theme lookup, never a baked hex: film_stage.buildTheme rotates the entire authored
// palette onto the brand's lead hue before it builds, so a world that reads `theme.lamp`
// re-tints with the customer's brand and a world that baked "#f0b45c" does not. That single
// choice is the difference between supportsBrandColors being true and being a claim.
const role = (r) => `theme.${r}`;

// ---------------------------------------------------------------- world compiler

// Each generator returns SOURCE for one layer. They are pure functions of (theme, t) and the
// literal geometry baked in at emit time. `R` and `rgba` are provided by film_stage's SVG shim
// in the scope the stringified World runs in (film_stage.js:1069-1096).
const LAYER_EMITTERS = {
  // A BLOOM, NOT A DISC.
  //
  // This drew two flat circles, and the first real generation showed exactly what that looks
  // like: a hard-edged teal disc sitting on the ground like a sticker, which reads as a mistake
  // rather than as light. A glow needs a falloff. The engine's SVG shim builds elements one at a
  // time and gradients would mean emitting a <defs>/<radialGradient>/<stop> tree per layer, so
  // the falloff is approximated with concentric rings whose alpha decays quadratically — visually
  // indistinguishable from a radial gradient at these opacities, and it cannot break the shim.
  glow(L, rnd) {
    const c = role(L.color);
    const cx = n2(L.cx), cy = n2(L.cy), sp = n2(L.speed);
    const RINGS = 7;
    const parts = [];
    for (let i = 0; i < RINGS; i++) {
      const f = 1 - i / RINGS;                 // 1 -> outermost, 1/RINGS -> innermost
      const radius = n2(L.r * f);
      // Quadratic decay outward, normalised so the stack sums near the requested opacity
      // instead of multiplying it seven times over.
      const alpha = n2((L.opacity * Math.pow(1 - f, 1.6) * 0.55) + (i === RINGS - 1 ? L.opacity * 0.22 : 0));
      if (Number(alpha) <= 0.004) continue;
      parts.push(`    R("circle",{cx:W*${cx},cy:H*${cy},r:W*${radius}*(1+${n2(0.06 - i * 0.006)}*Math.sin(t*${sp}+${n2(i * 0.4)})),fill:rgba(${c},${alpha})})`);
    }
    return parts.join(",\n");
  },
  stars(L, rnd) {
    const c = role(L.color);
    const pts = Array.from({ length: L.count }, () => ({ x: n2(rnd()), y: n2(rnd()), ph: n2(rnd() * 6.283), r: n2(1.6 + rnd() * 2.6) }));
    const body = pts.map((p) => `{x:${p.x},y:${p.y},ph:${p.ph},r:${p.r}}`).join(",");
    return `    R("g",null,[${body}].map(function(s,i){return R("circle",{key:i,cx:W*s.x,cy:H*s.y,r:s.r,fill:rgba(${c},${n2(L.opacity)}*(0.45+0.55*Math.abs(Math.sin(t*${n2(L.speed)}+s.ph))))});}))`;
  },
  motes(L, rnd) {
    const c = role(L.color);
    const pts = Array.from({ length: L.count }, () => ({ x: n2(rnd()), y: n2(rnd()), ph: n2(rnd() * 6.283), r: n2(2 + rnd() * 4) }));
    const body = pts.map((p) => `{x:${p.x},y:${p.y},ph:${p.ph},r:${p.r}}`).join(",");
    return `    R("g",null,[${body}].map(function(m,i){return R("circle",{key:i,cx:W*m.x+Math.sin(t*${n2(L.speed * 0.4)}+m.ph)*W*${n2(L.amp)},cy:(H*m.y+((t*${n2(20 * L.speed)}+i*90)%(H*0.6)))%H,r:m.r,fill:rgba(${c},${n2(L.opacity)})});}))`;
  },
  grid(L) {
    const c = role(L.color);
    const cols = Math.max(2, Math.min(L.count, 24));
    return `    R("g",null,Array.from({length:${cols}}).map(function(_,i){return R("line",{key:"v"+i,x1:W*i/${cols},y1:0,x2:W*i/${cols},y2:H,stroke:rgba(${c},${n2(L.opacity)}),strokeWidth:W*${n2(L.width)}});}).concat(Array.from({length:${Math.round(cols * 1.7)}}).map(function(_,i){return R("line",{key:"h"+i,x1:0,y1:H*i/${Math.round(cols * 1.7)},x2:W,y2:H*i/${Math.round(cols * 1.7)},stroke:rgba(${c},${n2(L.opacity * 0.7)}),strokeWidth:W*${n2(L.width)}});})))`;
  },
  wave(L) {
    const c = role(L.color);
    const count = Math.max(1, Math.min(L.count, 6));
    return `    R("g",null,Array.from({length:${count}}).map(function(_,i){
      var y=H*${n2(L.cy)}+i*H*0.06, d="M0 "+y, k;
      for(k=0;k<=12;k++){ d+=" L"+(W*k/12)+" "+(y+Math.sin(t*${n2(L.speed)}+k*0.7+i*0.9)*H*${n2(L.amp * 0.5)}); }
      return R("path",{key:i,d:d,stroke:rgba(${c},${n2(L.opacity)}*(1-i*0.15)),strokeWidth:W*${n2(L.width)},fill:"none",strokeLinecap:"round"});
    }))`;
  },
  rings(L) {
    const c = role(L.color);
    const count = Math.max(1, Math.min(L.count, 8));
    return `    R("g",null,Array.from({length:${count}}).map(function(_,i){return R("circle",{key:i,cx:W*${n2(L.cx)},cy:H*${n2(L.cy)},r:W*${n2(L.r)}*(0.35+i*0.16)+Math.sin(t*${n2(L.speed)}+i)*W*0.012,stroke:rgba(${c},${n2(L.opacity)}*(1-i/${count + 1})),strokeWidth:W*${n2(L.width)},fill:"none"});}))`;
  },
  stripes(L) {
    const c = role(L.color);
    const count = Math.max(2, Math.min(L.count, 20));
    return `    R("g",{transform:"rotate(${n2(L.angle)} "+(W/2)+" "+(H/2)+")"},Array.from({length:${count}}).map(function(_,i){return R("rect",{key:i,x:-W*0.5+ (W*2*i/${count}) + Math.sin(t*${n2(L.speed * 0.3)})*W*0.02,y:-H*0.5,width:W*${n2(L.width)},height:H*2,fill:rgba(${c},${n2(L.opacity)})});}))`;
  },
  // Same falloff reasoning as `glow`, at fewer steps: an orb is meant to read as a soft mass
  // drifting behind the copy, and a flat disc reads as a shape sitting on top of it.
  orb(L) {
    const c = role(L.color);
    const x = `W*${n2(L.cx)}+Math.sin(t*${n2(L.speed * 0.3)})*W*${n2(L.amp)}`;
    const y = `H*${n2(L.cy)}+Math.cos(t*${n2(L.speed * 0.24)})*H*${n2(L.amp * 0.5)}`;
    return [0, 1, 2, 3].map((i) => {
      const f = 1 - i * 0.24;
      const alpha = n2(L.opacity * (i === 3 ? 0.55 : 0.16 * (i + 1)));
      return `    R("circle",{cx:${x},cy:${y},r:W*${n2(L.r * f)},fill:rgba(${c},${alpha})})`;
    }).join(",\n");
  },
  arcs(L) {
    const c = role(L.color);
    const count = Math.max(1, Math.min(L.count, 8));
    return `    R("g",null,Array.from({length:${count}}).map(function(_,i){
      var rr=W*${n2(L.r)}*(0.5+i*0.18), a0=t*${n2(L.speed * 0.5)}+i*1.1, a1=a0+1.7;
      var x0=W*${n2(L.cx)}+Math.cos(a0)*rr, y0=H*${n2(L.cy)}+Math.sin(a0)*rr;
      var x1=W*${n2(L.cx)}+Math.cos(a1)*rr, y1=H*${n2(L.cy)}+Math.sin(a1)*rr;
      return R("path",{key:i,d:"M"+x0+" "+y0+" A"+rr+" "+rr+" 0 0 1 "+x1+" "+y1,stroke:rgba(${c},${n2(L.opacity)}),strokeWidth:W*${n2(L.width)},fill:"none",strokeLinecap:"round"});
    }))`;
  },
  beam(L) {
    const c = role(L.color);
    return `    R("g",{transform:"rotate("+(${n2(L.angle)}+Math.sin(t*${n2(L.speed * 0.2)})*6)+" "+(W*${n2(L.cx)})+" "+(H*${n2(L.cy)})+")"},
      R("rect",{x:W*${n2(L.cx)}-W*${n2(L.width)}/2,y:-H*0.2,width:W*${n2(L.width)},height:H*1.5,fill:rgba(${c},${n2(L.opacity)})}))`;
  },
};

function emitWorld(spec, slug) {
  const rnd = mulberry(`${slug}|world`);
  const layers = spec.world.layers.map((L) => LAYER_EMITTERS[L.kind](L, rnd)).filter(Boolean);
  return `(theme, t, p, u) => {
    var W = u.W, H = u.H;
    return R("g", null,
${layers.join(",\n")}
    );
  }`;
}

// The chrome mark. Drawn with the engine's R2 helper (film_stage.renderIcon calls
// skin.icon(theme, fg, R2) at build time and inlines the result), from a closed set of
// geometric primitives — a generated mark that tried to be figurative would read as a mistake
// at the 47px it is rendered at.
const ICON_PATHS = {
  circle: () => `R2("circle",{cx:12,cy:12,r:7})`,
  ring: () => `R2("circle",{cx:12,cy:12,r:7,fill:"none"})`,
  square: () => `R2("rect",{x:5,y:5,width:14,height:14,rx:3})`,
  diamond: () => `R2("path",{d:"M12 4 L20 12 L12 20 L4 12 Z"})`,
  triangle: () => `R2("path",{d:"M12 4 L20 19 L4 19 Z"})`,
  bolt: () => `R2("path",{d:"M13 3 L6 13 L11 13 L10 21 L18 10 L13 10 Z"})`,
  star: () => `R2("path",{d:"M12 3 L14.2 9.4 L21 9.6 L15.6 13.7 L17.5 20.3 L12 16.4 L6.5 20.3 L8.4 13.7 L3 9.6 L9.8 9.4 Z"})`,
  arrow: () => `R2("path",{d:"M4 12 L18 12 M12 6 L18 12 L12 18"})`,
  bars: () => `R2("path",{d:"M6 18 L6 11 M12 18 L12 5 M18 18 L18 8"})`,
  cross: () => `R2("path",{d:"M12 5 L12 19 M5 12 L19 12"})`,
};

function emitIcon(spec) {
  const draw = ICON_PATHS[spec.icon.shape]();
  // `theme.currentBg` is the field the badge is drawn on, which is what the mark must contrast
  // against — film_stage passes it in (film_stage.js:1174).
  return spec.icon.stroke
    ? `(theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" },
    ${draw})`
    : `(theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: theme.currentBg, stroke: "none" },
    ${draw})`;
}

// The ground treatment. Returns null for a flat fill (the engine then paints the beat's own bg,
// which is the default and correct behaviour for most packs).
function emitGroundCss(spec) {
  const g = spec.ground;
  if (!g || g.kind === "flat") return null;
  if (g.kind === "radial") {
    return `(theme, bg) => "radial-gradient(120% 90% at 50% 12%, " + ${role(g.to || g.from)} + " 0%, " + bg + " 62%)"`;
  }
  return `(theme, bg) => "linear-gradient(${n2(g.angle)}deg, " + ${role(g.from)} + " 0%, " + bg + " 58%, " + ${role(g.to || g.from)} + " 100%)"`;
}

// ---------------------------------------------------------------- the skin module

function emitSkinModule(spec, slug) {
  const paletteBody = Object.entries(spec.palette)
    .map(([k, v]) => `${k}: t.${k} || ${lit(v)}`)
    .join(", ");

  // The look table is pure data — emitted as JSON so nothing model-authored can reach an
  // executable position through it.
  const lookJson = JSON.stringify(spec.look, null, 2).split("\n").map((l, i) => (i === 0 ? l : "  " + l)).join("\n");
  const groundCss = emitGroundCss(spec);

  return `// ${spec.label.toUpperCase()} — skin for the shared FilmKit stage (services/film_stage.js).
//
// GENERATED by the KEYFRAME admin template generator (src/templates/emit.js) from a validated
// TemplateSpec. Do not hand-edit: regenerating the template overwrites this file. To change the
// design, edit the spec on the template record and regenerate.
//
// Every executable line below was written by emit.js, not by the design model — the model
// supplied only the data (palette, per-beat look, camera set, world layer list). See the
// comment at the top of src/templates/emit.js for why that boundary exists.
//
//   slug        ${slug}
//   renderer    ${paths.rendererIdFor(slug)}
//   stage       ${spec.stage || "portrait"} (${spec.stage === "landscape" ? "1920x1080" : "1080x1920"})
//   display     ${spec.display} / body ${spec.body}
//   ground      ${spec.palette[spec.groundKey]} (${spec.groundKey}), ${spec.dark ? "dark" : "light"}
//   world       ${spec.world.layers.map((l) => l.kind).join(", ")}

const stage = require("../film_stage");

const SKIN = {
  id: ${lit(slug)},
  label: ${lit(spec.label)},

  // The AUTHORED stage. film_stage.build() adopts it before emitting any geometry, so every
  // number below is in pixels of this frame and film_beats picks the matching layout family.
  stage: ${lit(spec.stage || "portrait")},
${spec.boxes ? `
  // This template's own picture boxes, as fractions of the stage. film_beats.boxOf reads them when
  // it draws, and scripts/gen-film-packs derives the pack.json media contract from the same
  // numbers — so the manifest can never promise a box the film does not draw.
  boxes: ${JSON.stringify(spec.boxes)},
` : ""}

  // ---- type ----
  display: ${lit(spec.display)}, displayFallback: ${lit(spec.displayFallback)},
  body: ${lit(spec.body)}, bodyFallback: ${lit(spec.bodyFallback)},
  mono: ${spec.mono ? lit(spec.mono) : "null"},
  em: ${n2(spec.em)},
  titleLine: ${n2(spec.titleLine)}, titleSpace: ${lit(spec.titleSpace)},
  titlePreset: ${lit(spec.titlePreset)}, itemPreset: ${lit(spec.itemPreset)},

  // ---- palette ----
  // Called with {} for the authored defaults. film_stage.buildTheme then hue-maps the brand's
  // accents onto \`accents\` slot by slot at their authored luminance and rotates every other
  // stop onto the brand's lead hue — so a customer's brand recolours the whole design, not just
  // the headline. That is why every colour below is a ROLE the theme resolves, and why the
  // world and ground read \`theme.<role>\` rather than baking hexes.
  palette: (t) => ({ ${paletteBody} }),
  accents: ${JSON.stringify(spec.accents)},
  groundKey: ${lit(spec.groundKey)}, inkKey: ${lit(spec.inkKey)}, paperKey: ${lit(spec.paperKey)},
  dark: ${spec.dark},

  // ---- per-beat look ----
  // \`world\` is load-bearing, not decoration: each beat's copy colour is authored against its
  // OWN field, so a beat that says false is drawn on its flat bg and a beat that says true is
  // drawn over the animated backdrop.
  look: ${lookJson},

  // ---- camera + motion ----
  // Indexed (sceneIndex * camMul + camOff) % 6 by film_stage, so adjacent scenes take different
  // camera moves rather than the whole film sharing one.
  cams: ${JSON.stringify(spec.cams)}, camMul: ${spec.camMul}, camOff: ${spec.camOff},
  mag: ${JSON.stringify(spec.mag)},
  ambient: ${n2(spec.ambient)},
  energy: ${n2(spec.energy)},
  badge: ${lit(spec.badge)},

  // ---- the mechanics this pack owns ----
  // A beat that ends up holding no picture is expressed as one of these instead of shipping a
  // bare text slide. A pack that declares none renders only the six authored acts.
  variants: ${JSON.stringify(Object.fromEntries(Object.entries(spec.variants || {}).filter(([, v]) => v)))},

  strings: ${JSON.stringify(spec.strings)},

  // The chrome mark, rendered once at build time.
  icon: ${emitIcon(spec)},
${groundCss ? `\n  // The ground treatment, resolved against the live (possibly re-hued) theme.\n  groundCss: ${groundCss},\n` : ""}
  // ---- the world ----
  // The animated backdrop. Pure in (theme, t, progress, utils) — no Math.random and no Date,
  // which is what lets film_stage re-evaluate it deterministically on every seek. All geometry
  // was resolved at generation time from the spec's layer list, so the numbers below are
  // literals and the render page runs no RNG at all.
  World: ${emitWorld(spec, slug)},
};

module.exports = {
  buildComposition: (opts) => stage.build(SKIN, opts),
  STRINGS: { ...stage.BASE_STRINGS, ...SKIN.strings },
  SKIN,
};
`;
}

// ---------------------------------------------------------------- pack.json + FRAME.md

// Derived by the SAME function that derives the 89 shipped FilmKit packs
// (scripts/gen-film-packs.js packFor/frameMd), so a generated template's manifest is identical
// in shape and provenance to a hand-authored one — including the media slot contract, which is
// measured from the real boxes film_beats draws and must not be re-guessed here.
function derivePackFiles(spec, slug) {
  const gen = require("../../scripts/gen-film-packs.js");
  const meta = {
    vibe: spec.vibe,
    category: spec.category,
    tags: spec.tags,
    audio: spec.audio,
    assets: spec.assets,
    frameMd: spec.frameMdBody,
  };
  const m = { slug, module: paths.skinFileName(slug), label: spec.label };
  const pack = gen.packFor(m, meta);
  const frame = gen.frameMd(m, pack, meta);
  return { pack, frame };
}

// ---------------------------------------------------------------- emit

// Write all three artifacts. `rootKind` decides which frames root the pack lands in — a
// generation always writes to "draft", and publishing later MOVES the directory (see
// templates/paths.movePackDir). Nothing here can write into the published root by accident:
// paths.safeWrite asserts the destination is one of the four allowlisted roots, and the caller
// passes the root kind explicitly.
function emitTemplate({ spec: rawSpec, slug, rootKind = "draft" }) {
  paths.assertSlug(slug);
  const { ok, spec, errors } = validateSpec(rawSpec);
  if (!ok) {
    const e = new Error(`template spec is invalid:\n- ${errors.join("\n- ")}`);
    e.code = "BAD_SPEC";
    e.status = 400;
    e.errors = errors;
    throw e;
  }

  // The skin module must exist on disk BEFORE the manifest is derived: derivePackFiles
  // require()s it to read the resolved palette and the real slot geometry off the skin, exactly
  // as gen-film-packs does for the shipped packs.
  const skinPath = paths.skinPath(slug);
  paths.safeWrite(skinPath, emitSkinModule(spec, slug));
  // Drop any cached copy so a regeneration is read fresh rather than served from require's
  // module cache — the defect this repo already documents at pipeline.js:162-171, where a
  // rebuilt composer kept rendering its pre-rebuild film because the process had it cached.
  try { delete require.cache[require.resolve(skinPath)]; } catch { /* not cached yet */ }

  let pack, frame;
  try {
    ({ pack, frame } = derivePackFiles(spec, slug));
  } catch (err) {
    // A skin that cannot be required is a generation failure, not a half-installed template.
    try { fs.rmSync(skinPath, { force: true }); } catch { /* best effort */ }
    const e = new Error(`generated skin could not be loaded: ${err.message}`);
    e.code = "BAD_SKIN";
    e.status = 500;
    throw e;
  }

  // VALIDATE THE MANIFEST WE ARE ABOUT TO WRITE, against the schema the RENDER PATH will read
  // it with.
  //
  // This is not belt-and-braces. getManifest() is fail-soft by design: an invalid pack.json
  // logs one line and returns null, and every consumer then quietly falls back to its legacy
  // defaults. Measured on a real generation: the design model returned an audio field whose
  // value this module's own schema allowed but PackManifestSchema did not, gen-film-packs
  // copied it through, and the resulting pack was unreadable — so the composer received no
  // manifest, emitted nothing, and the template surfaced as "0 stills" with the actual cause
  // buried in a truncated console warning. Failing here turns that into an explicit,
  // attributable generation error.
  //
  // The two cross-validators are the same ones validateAll() runs at boot, and they catch what
  // zod structurally cannot: an sfxPalette naming a cue the library cannot produce, and a media
  // block that does not satisfy template_media's own contract.
  const frameManifest = require("../services/frame_manifest");
  const parsed = frameManifest.PackManifestSchema.safeParse(pack);
  if (!parsed.success) {
    try { fs.rmSync(skinPath, { force: true }); } catch { /* best effort */ }
    const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    const e = new Error(`the generated pack.json does not satisfy PackManifestSchema:\n- ${detail.join("\n- ")}`);
    e.code = "BAD_MANIFEST";
    e.status = 500;
    e.errors = detail;
    throw e;
  }
  const crossErrors = [
    ...(frameManifest.audioPaletteErrors ? frameManifest.audioPaletteErrors(pack.audio) : []),
    ...(frameManifest.mediaErrors ? [frameManifest.mediaErrors(pack)].filter(Boolean) : []),
  ];
  if (crossErrors.length) {
    try { fs.rmSync(skinPath, { force: true }); } catch { /* best effort */ }
    const e = new Error(`the generated pack.json failed cross-validation:\n- ${crossErrors.join("\n- ")}`);
    e.code = "BAD_MANIFEST";
    e.status = 500;
    e.errors = crossErrors;
    throw e;
  }

  if (rootKind === "draft") paths.ensureDraftRoot();
  const dir = paths.dirForRootKind(slug, rootKind);
  paths.safeWrite(path.join(dir, "pack.json"), JSON.stringify(pack, null, 2) + "\n");
  paths.safeWrite(path.join(dir, "FRAME.md"), frame);

  return { slug, dir, skinPath, pack, frame, spec };
}

// What the template can do, derived from what it ACTUALLY declares rather than from what the
// admin hoped. Every field is read off the emitted manifest, so the capability panel cannot
// claim something the template does not do. (The one genuinely measured capability —
// supportsBrandColors — is re-proven by templates/qa.js, which builds the composition twice and
// diffs the HTML; this is the declaration, that is the evidence.)
function capabilitiesOf(pack) {
  const media = pack.media || {};
  const req = media.requiredAssets || {};
  const slots = media.slotsByRole || {};
  const kinds = new Set(Object.values(slots).map((s) => s && s.kind).filter(Boolean));
  return {
    supportsBrandColors: Array.isArray(pack.skin && pack.skin.accents) && pack.skin.accents.length > 0,
    supportsLogo: Number(req.logos || 0) > 0 || kinds.has("logos"),
    supportsImages: Number(req.productImages || 0) > 0 || kinds.has("productImages"),
    supportsScreenshots: Number(req.screenshots || 0) > 0 || kinds.has("screenshots"),
    // This engine family draws <img> only — a <video> asset handed to a slot is discarded, which
    // is exactly why pack.json declares acceptsVectors:false for the same reason.
    supportsVideo: false,
    supportsText: true,
    // Voice, captions, music and SFX are pipeline-level and available to every pack; the audio
    // block only tunes them. Reported honestly rather than as pack-specific features.
    supportsVoiceover: true,
    supportsCaptions: true,
    supportsBackgroundMusic: Array.isArray(pack.audio && pack.audio.musicKeywords) && pack.audio.musicKeywords.length > 0,
    supportsSoundEffects: !!(pack.audio && pack.audio.sfxPalette && Object.keys(pack.audio.sfxPalette).length > 0),
  };
}

// The asset-requirement view the admin detail page renders. Reuses the pack's OWN media block
// (the model that already drives collection budget, crop aspects, placement priority and the
// pre-render gate) rather than introducing a second asset schema.
function assetRequirementsOf(pack) {
  const media = pack.media || {};
  const slots = media.slotsByRole || {};
  const placeholders = Object.entries(slots).map(([role, s]) => ({
    id: role,
    role,
    type: s.kind || "productImages",
    count: Number(s.count) || 1,
    width: Number(s.width) || 0,
    height: Number(s.height) || 0,
    aspect: s.width && s.height ? Math.round((s.width / s.height) * 100) / 100 : null,
    priority: s.priority || "medium",
    objectFit: s.objectFit || "cover",
    note: s.note || "",
  }));
  const required = Object.values(media.requiredAssets || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const preferred = Math.round(required * (Number(media.oversample) || 1));
  return {
    requiredAssetCount: required,
    preferredAssetCount: preferred,
    assetTypes: [...new Set(placeholders.map((p) => p.type))],
    placeholders,
    // The frame the pixel sizes above are measured against. Without it those numbers are
    // meaningless — the same box scores wildly different coverage at a different resolution or
    // aspect, which is a defect this repo has already been bitten by.
    stage: media.stage || { width: 1080, height: 1920 },
    addressing: media.addressing || "scene",
    oversample: Number(media.oversample) || 1,
  };
}

// ---------------------------------------------------------------- clone
//
// COPY A VERSION'S SOURCE INTO A NEW VERSION'S SLUG.
//
// The one operation that makes "fix a published template" safe: the live version's files are
// READ and the copies are written only under the NEW slug, so a fix can never touch what users
// are rendering with. Everything that names the template is rewritten to the new slug — the pack
// directory, `name`, `renderer`, and the composer module's own `id`/renderer — because a clone
// that kept the parent's renderer id would register two packs against one composer module and
// the newer one would silently render as the older.
//
// Returns false (rather than throwing) when the source has no files to copy, which is the case
// for a version whose generation never finished; the caller then leaves the row in DRAFT.
function clonePack({ fromSlug, fromRootKind = "published", toSlug }) {
  paths.assertSlug(fromSlug);
  paths.assertSlug(toSlug);
  const src = paths.dirForRootKind(fromSlug, fromRootKind);
  const srcSkin = paths.skinPath(fromSlug);
  if (!fs.existsSync(path.join(src, "pack.json")) || !fs.existsSync(srcSkin)) return false;

  const dstDir = paths.draftDir(toSlug);           // a clone is ALWAYS a draft, never published
  if (fs.existsSync(dstDir)) {
    const e = new Error(`${toSlug} already has a template directory`);
    e.code = "SLUG_TAKEN";
    e.status = 409;
    throw e;
  }

  const pack = JSON.parse(fs.readFileSync(path.join(src, "pack.json"), "utf8"));
  pack.name = toSlug;
  pack.renderer = paths.rendererIdFor(toSlug);
  const frame = fs.readFileSync(path.join(src, "FRAME.md"), "utf8");

  // The composer module is data + generated functions, and the only occurrences of the old slug
  // in it are the pack id and the scroll/element id prefixes. Replacing the id keeps those
  // unique per version, which matters because both versions can be loaded at once.
  const skin = fs.readFileSync(srcSkin, "utf8").split(`"${fromSlug}"`).join(`"${toSlug}"`);

  paths.ensureDraftRoot();
  fs.mkdirSync(dstDir, { recursive: true });
  paths.safeWrite(path.join(dstDir, "pack.json"), `${JSON.stringify(pack, null, 2)}\n`);
  paths.safeWrite(path.join(dstDir, "FRAME.md"), frame);
  paths.safeWrite(paths.skinPath(toSlug), skin);
  try { delete require.cache[require.resolve(paths.skinPath(toSlug))]; } catch { /* not cached */ }

  // The manifest must still validate under the new name — a clone that produces an invalid
  // pack.json would be discovered at render time, on a user's job.
  const frameManifest = require("../services/frame_manifest");
  const parsed = frameManifest.PackManifestSchema.safeParse(pack);
  if (!parsed.success) {
    try { paths.safeRmDir(dstDir); } catch { /* best effort */ }
    try { fs.rmSync(paths.skinPath(toSlug), { force: true }); } catch { /* best effort */ }
    const e = new Error(`the cloned manifest is invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    e.code = "BAD_CLONE";
    throw e;
  }
  return true;
}

module.exports = {
  emitTemplate, emitSkinModule, derivePackFiles, clonePack,
  capabilitiesOf, assetRequirementsOf,
  emitWorld, emitIcon, emitGroundCss,
};
