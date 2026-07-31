// Media coverage — reading back, from the COMPOSED HTML, how many image cards a
// film declared and how many actually carry an asset.
//
// Why this needs to exist at all: an unfilled media slot does not render as a
// missing <img>. Every composer draws a styled placeholder <div> in its place,
// which is why `normalize.js` stripMissingAssets, `cinematic_lint.js` and the
// post-render vision QA all sail straight past it — to them the frame looks
// deliberately designed. The only way to count holes is for the composer to say
// so, which `template_engine.buildFilm` now does via per-clip stamps
// (data-media-demand / data-media-filled) and per-box `data-media-slot` tags.
//
// This module is a PURE string parse: no DOM, no browser, no I/O. It is the
// independent check on `planMedia()` — if the two disagree, something in the
// render path re-implemented slot filling and drifted.

// One clip's coverage, plus film totals.
//   scenes[] = { clipId, sceneType, demand, filled, kinds[], imgs, emptyBoxes, plateBoxes }
//   totals   = { demand, filled, empty, imgs, emptyBoxes, plateBoxes, scenes }
function scanCoverage(html) {
  const src = String(html || "");
  const scenes = [];
  // Each scene clip is emitted as a single <div class="clip <name>-scene" ...>
  // with its media stamps in the opening tag ("tpl-scene" from template_engine,
  // "mom-scene" from momentum's hand-rolled builders).
  const clipRe = /<div class="clip [a-z]+-scene"([^>]*)>/g;
  let m;
  const opens = [];
  while ((m = clipRe.exec(src))) opens.push({ attrs: m[1], start: m.index, end: clipRe.lastIndex });

  for (let i = 0; i < opens.length; i++) {
    const { attrs } = opens[i];
    // Body = up to the next clip (or end). Good enough to attribute <img> and
    // slot boxes to a scene: clips are siblings, never nested.
    const bodyStart = opens[i].end;
    const bodyEnd = i + 1 < opens.length ? opens[i + 1].start : src.length;
    const body = src.slice(bodyStart, bodyEnd);
    const at = (name) => { const g = attrs.match(new RegExp(`${name}="([^"]*)"`)); return g ? g[1] : null; };
    const demand = Number(at("data-media-demand"));
    const kindsRaw = at("data-media-kinds") || "";
    scenes.push({
      clipId: at("id"),
      sceneType: at("data-scene-type"),
      demand: Number.isFinite(demand) ? demand : 0,
      filled: Number(at("data-media-filled")) || 0,
      kinds: kindsRaw ? kindsRaw.split(",").filter(Boolean) : [],
      imgs: countMatches(body, /<img\b/g),
      emptyBoxes: countMatches(body, /data-media-slot="empty"/g),
      plateBoxes: countMatches(body, /data-media-slot="plate"/g),
    });
  }

  const totals = scenes.reduce((t, s) => {
    t.demand += s.demand; t.filled += s.filled;
    t.imgs += s.imgs; t.emptyBoxes += s.emptyBoxes; t.plateBoxes += s.plateBoxes;
    return t;
  }, { demand: 0, filled: 0, empty: 0, imgs: 0, emptyBoxes: 0, plateBoxes: 0, scenes: scenes.length });
  totals.empty = Math.max(0, totals.demand - totals.filled);
  return { scenes, totals };
}

function countMatches(s, re) { const m = s.match(re); return m ? m.length : 0; }

module.exports = { scanCoverage };
