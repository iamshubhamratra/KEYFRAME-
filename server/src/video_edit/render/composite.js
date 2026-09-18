// VIDEO EDIT COMPOSITE — base + B-roll/PIP + dips + cards + captions + logo in ONE ffmpeg pass (RENDER.md §5).
//
// WHY THIS EXISTS. Every visual layer the plan asks for lands on the A-roll base here, in a fixed z-order: base →
// B-roll / PIP → transitions (dips) → motion-graphic cards → captions (libass) → logo. One pass means one generation
// loss and one place where the traps measured on this ffmpeg are handled: the base is colour-tagged BT.709 first so
// RGB overlays convert with the right matrix (S3, ΔE ≈ 4.8 otherwise); VP9-alpha cards need `-c:v libvpx-vp9` BEFORE
// their `-i` or transparency composites as a black box (S4); overlays enter with `-itsoffset` and frame-based alpha
// fades on clips that were conformed to exactly their box, fps and frame count. The composite key covers every input,
// so a caption edit re-runs this pass (and the mix) but never the A-roll.
//
// CONTRACT:
//   compositeKey(comp) -> sha1 hex
//   buildCompositeGraph(comp, { baseRel, clips:{ [overlayId]: { rel, headFrames } }, assRel, cardAssRels:[rel], fontsRel })
//     -> { script, inputs:[InputSpec] }  (pure; inputs after the base, in index order)
//   renderComposite({ comp, projectDir, baseRel, clips, runId, signal, pidFile, threads=3, onProgress, preset })
//     -> Promise<{ path, relPath, key, cached }>
//     writes the caption / card-fallback ASS files and copies their fonts into <project>/fonts first.

const fs = require("node:fs");
const path = require("node:path");
const proc = require("../engine/proc");
const X = require("./exprs");
const P = require("./profiles");
const cache = require("./cache");
const TR = require("./transitions");
const { copyFontsForAss, writeAssFile, assRelPathFor, burnInArgs } = require("../captions/ass");
const { EditError } = require("../errors");

const FPS = 30;
const fmt6 = (x) => (Math.round(Number(x) * 1e6) / 1e6).toFixed(6);

function compositeKey(comp) {
  return cache.keyOf({
    v: 1, base: comp.base.key, profile: { W: comp.profile.W, H: comp.profile.H, final: comp.profile.final },
    overlays: comp.overlays.map((o) => ({ ...o, source: o.source ? { ...o.source, path: o.source.sha || o.source.path } : null, logo: o.logo ? { ...o.logo, path: o.logo.sha || o.logo.path } : null })),
    ass: comp.captions ? comp.captions.assHash : null, cardAss: comp.cardAss.map((c) => c.hash), frames: comp.durationFrames,
    // absent on compositions built before transitions / looks existed, so their keys are unchanged
    ...(comp.transitions && comp.transitions.length ? { transitions: comp.transitions } : {}),
    ...(comp.look ? { look: comp.look } : {}),
  });
}

function buildCompositeGraph(comp, { baseRel, clips = {}, assRel = null, cardAssRels = [], fontsRel = "fonts" } = {}) {
  const out = { w: comp.profile.W, h: comp.profile.H };
  const lines = [`[0:v]${X.COLOR_TAG_FILTER},format=yuv420p[L0]`];
  const inputs = [];
  let cur = "L0";
  let idx = 1;
  let n = 0;
  const next = () => `L${++n}`;
  // Picture transitions at the A-roll joints, on the base alone: B-roll, cards and captions are laid on top of the
  // finished transitions, so text never cross-fades or slides with the picture.
  if (comp.transitions && comp.transitions.length) {
    const L = next();
    const g = TR.xfadeGraph({ inLabel: cur, outLabel: L, transitions: comp.transitions, durationFrames: comp.durationFrames, out });
    if (g) { lines.push(g); cur = L; }
  }
  for (const o of comp.overlays) {
    if (o.kind === "broll" || o.kind === "pip") {
      const c = clips[o.id];
      if (!c) continue;
      const clipPath = c.rel;
      if (o.kind === "broll") {
        const frag = X.fullBrollOverlay({ baseLabel: cur, outLabel: next(), clip: { path: clipPath }, outInF: o.outInF, outOutF: o.outOutF, fadeInF: o.fadeInF, fadeOutF: o.fadeOutF, x: o.geom.x, y: o.geom.y, inputIndex: idx });
        lines.push(frag.graph); inputs.push(...frag.inputs); idx = frag.nextInputIndex; cur = frag.outLabel;
      } else {
        const mask = X.pipMaskFiles({ box: o.geom, radius: 24 });
        const frag = X.pipOverlay({ baseLabel: cur, outLabel: next(), clip: { path: clipPath }, box: o.geom, radius: 24, outInF: o.outInF, outOutF: o.outOutF, fadeInF: o.fadeInF, fadeOutF: o.fadeOutF, inputIndex: idx, maskPath: mask.mask, shadowPath: mask.shadow });
        lines.push(frag.graph); inputs.push(...frag.inputs); idx = frag.nextInputIndex; cur = frag.outLabel;
      }
    } else if (o.kind === "dip") {
      const frag = X.dipOverlay({ baseLabel: cur, outLabel: next(), out, jointF: o.dip.jointF, halfFrames: o.dip.halfFrames, kind: o.dip.kind });
      lines.push(frag.graph); cur = frag.outLabel;
    }
  }
  // The colour look grades the whole picture (speaker AND cut-aways, so they match) but not the text and logo.
  if (comp.look && comp.look.filter) {
    const L = next();
    lines.push(`[${cur}]${comp.look.filter},format=yuv420p[${L}]`);
    cur = L;
  }
  for (const o of comp.overlays) {
    if (o.kind !== "card" || !o.card || !o.card.path) continue;
    const n0 = o.outOutF - o.outInF;
    const L = next();
    // libvpx-vp9 decoder BEFORE -i keeps the alpha plane (S4); the webm duration comes from the container.
    inputs.push({ role: "card", path: o.card.path, format: "matroska", options: ["-c:v", "libvpx-vp9", ...(o.outInF > 0 ? ["-itsoffset", fmt6(o.outInF / FPS)] : [])] });
    lines.push(`[${idx}:v]format=yuva420p,trim=end_frame=${n0}[${L}c]`);
    lines.push(`[${cur}][${L}c]overlay=${o.geom.x}:${o.geom.y}:eof_action=pass[${L}]`);
    idx++; cur = L;
  }
  for (const rel of cardAssRels) {
    const L = next();
    lines.push(`[${cur}]${burnInArgs({ assRelPath: rel, fontsDirRel: fontsRel })}[${L}]`);
    cur = L;
  }
  if (assRel) {
    const L = next();
    lines.push(`[${cur}]${burnInArgs({ assRelPath: assRel, fontsDirRel: fontsRel })}[${L}]`);
    cur = L;
  }
  const logo = comp.overlays.find((o) => o.kind === "logo");
  if (logo) {
    const frag = X.logoOverlay({ baseLabel: cur, outLabel: next(), logo: { path: logo.logo.path }, box: { x: logo.geom.x, y: logo.geom.y, w: logo.geom.w }, opacity: logo.logo.opacity, show: logo.logo.show, totalFrames: comp.durationFrames, inputIndex: idx });
    lines.push(frag.graph); inputs.push(...frag.inputs); idx = frag.nextInputIndex; cur = frag.outLabel;
  }
  lines.push(`[${cur}]trim=end_frame=${comp.durationFrames},format=yuv420p,setsar=1[out]`);
  void baseRel;
  return { script: lines.join(";\n"), inputs };
}

async function renderComposite({ comp, projectDir, baseRel, clips = {}, runId, signal, pidFile, threads = 3, onProgress, preset = null }) {
  const key = compositeKey(comp);
  return cache.getOrMake({
    projectDir, level: "composite", key, ext: "mp4", runId,
    make: async (tmpAbs) => {
      let assRel = null;
      const fonts = new Set();
      if (comp.captions) {
        assRel = assRelPathFor(comp.captions.assHash);
        writeAssFile(projectDir, assRel, comp.captions.ass);
        for (const f of comp.captions.fonts || []) fonts.add(f);
      }
      const cardAssRels = [];
      for (const c of comp.cardAss || []) {
        const rel = assRelPathFor(c.hash.slice(0, 40));
        writeAssFile(projectDir, rel, c.text);
        cardAssRels.push(rel);
        for (const f of c.fonts || []) fonts.add(f);
      }
      if (fonts.size) copyFontsForAss(projectDir, [...fonts]);
      else fs.mkdirSync(path.join(projectDir, "fonts"), { recursive: true });
      const { script, inputs } = buildCompositeGraph(comp, { baseRel, clips, assRel, cardAssRels });
      const scriptRel = `render/cache/composite/${key}.fcs`;
      fs.mkdirSync(path.join(projectDir, "render/cache/composite"), { recursive: true });
      fs.writeFileSync(path.join(projectDir, scriptRel), script);
      const enc = preset || comp.profile.final;
      const args = [
        "-y", ...X.inputArgs({ path: baseRel, format: "mov", options: [] }),
        ...inputs.flatMap((inp) => X.inputArgs(inp)),
        "-/filter_complex", scriptRel, "-map", "[out]", "-an",
        "-c:v", "libx264", "-preset", enc.preset, "-crf", String(enc.crf), ...P.ENCODE_COMMON, "-g", "60",
        "-threads", String(threads), "-movflags", "+faststart", path.relative(projectDir, tmpAbs).split(path.sep).join("/"),
      ];
      await proc.ffmpeg(args, {
        cwd: projectDir, signal, pidFile, label: "composite", stage: "RENDERING",
        timeoutMs: Math.max(180000, comp.durationFrames * 2000), expectedDurationSec: comp.durationFrames / FPS,
        onProgress: typeof onProgress === "function" ? (pct) => onProgress(pct) : undefined,
      });
    },
  }).then((r) => ({ ...r, key }));
}

module.exports = { compositeKey, buildCompositeGraph, renderComposite };
void EditError;
