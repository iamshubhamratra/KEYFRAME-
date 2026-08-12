// GENESIS — the "Living World" flagship composer.
//
// A wholly new cinematic template: instead of text-on-cards, a LIVING WORLD sits
// behind the content — a deep sky with a brand-colored sun, drifting atmospheric
// fog and light motes, a parallax skyline of glass towers with lit windows, birds
// crossing in V-formations, and silhouetted people walking a ground plane. A slow
// camera pushes through it while eight cinematic beats play out over the top:
// world-intro, problem (chaos), discovery (order), product reveal (a floating
// screenshot showroom), feature mini-worlds, social proof (crowd + metrics),
// growth (a graph that builds), and an epic logo climax.
//
// Render contract = the other dedicated composers (bloom/flagship/…):
//   buildComposition({storyboard,dims,framePack,captionCues,assets,brandSkin})
//     -> { indexHtml, metaJson }
// A single paused GSAP timeline is registered on window.__timelines["vid"]; the
// hyperframes renderer seeks it frame by frame. Every loop is a FINITE repeat
// (reps helper) so seeks are deterministic; the ambient canvas is driven by a
// timeline proxy's onUpdate (works under both the seek-render and a live browser).
//
// COLOR: nothing is hardcoded. The whole world (sky, sun, towers, windows, birds,
// people, glass frames, graphs, particles, buttons, glows) is painted from a
// theme derived via scene_kit.deriveTheme(framePack, storyboard, brandSkin) — so
// the Art Director's brand skin, or a user-picked color, re-tints the entire world.

const { deriveTheme } = require("./scene_kit");
const { pickForScene } = require("./scene_match");
const { fontFaceCss } = require("../fonts/pack_fonts");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";

const r = (n) => Math.round((Number(n) || 0) * 100) / 100;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function hexToRgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim()); if (!m) return [124, 124, 124]; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(hex, a) { const [r1, g, b] = hexToRgb(hex); return `rgba(${r1},${g},${b},${a})`; }
function mix(hex, with_, t) { const a = hexToRgb(hex), b = hexToRgb(with_); const c = a.map((v, i) => Math.round(v + (b[i] - v) * t)); return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`; }
function lum(hex) { const [r1, g, b] = hexToRgb(hex); return 0.2126 * r1 + 0.7152 * g + 0.0722 * b; }
function hashSeed(s) { let h = 2166136261; const str = String(s || ""); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 12345; }
// deterministic per-seed PRNG (no runtime Math.random — seeks must replay)
function mulberry(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------------ THEME
// Map scene_kit's derived theme (brand-adaptive, brandSkin-led) onto the Genesis
// color vocabulary the spec asks for: primary/secondary/accent/bg/surface/glow +
// gradients. Dark cinematic ground by default; a light manifest ground still works.
function genesisTheme(framePack, storyboard, brandSkin) {
  const t = deriveTheme(framePack, storyboard, brandSkin);
  const isDark = t.isDark !== false;
  const bg = t.ground;
  const horizon = mix(bg, t.accent, isDark ? 0.16 : 0.1);       // sky warms toward the sun
  const deep = isDark ? mix(bg, "#000000", 0.35) : mix(bg, "#0a0a0a", 0.08);
  const primary = t.accent;
  const secondary = t.accent2 || t.accent;
  const accent = (t.extras && t.extras[0]) || secondary;
  const accent2 = (t.extras && t.extras[1]) || primary;
  const surface = isDark ? rgba("#FFFFFF", 0.055) : rgba("#0B1020", 0.05);
  const surfaceEdge = rgba(primary, isDark ? 0.34 : 0.28);
  const towerFar = isDark ? mix(bg, "#000000", 0.45) : mix(bg, t.ink, 0.14);
  const towerMid = isDark ? mix(bg, "#000000", 0.28) : mix(bg, t.ink, 0.22);
  const towerNear = isDark ? mix(bg, primary, 0.1) : mix(bg, t.ink, 0.34);
  const silhouette = isDark ? mix(bg, "#000000", 0.55) : mix(t.ink, bg, 0.15);
  return {
    isDark, bg, deep, horizon, primary, secondary, accent, accent2,
    ink: t.ink, dim: t.dim, line: t.line, surface, surfaceEdge,
    towerFar, towerMid, towerNear, silhouette,
    glow: primary,
    gradPrimary: `linear-gradient(120deg, ${primary}, ${secondary})`,
    gradText: `linear-gradient(100deg, ${t.ink}, ${t.ink} 55%, ${primary})`,
    displayStack: t.displayStack && /Sora|Outfit/.test(t.displayStack) ? t.displayStack : `'Sora', ${t.fontStack}`,
    headStack: `'Sora', ${t.fontStack}`,
    subStack: `'Outfit', ${t.fontStack}`,
    bodyStack: t.fontStack,
    fontFace: [fontFaceCss("Sora"), fontFaceCss("Outfit")].filter(Boolean).join("\n") + (t.fontFace || ""),
  };
}

// ------------------------------------------------------------- CONTENT HELPERS
function sentence(s) { return String(s || "").trim(); }
function wordSpans(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean)
    .map((w) => `<span class="gx-w"><span class="gx-wi">${esc(w)}</span></span>`).join(" ");
}
function pickNumber(scene) {
  const hay = [scene && scene.headline, ...(Array.isArray(scene && scene.bullets) ? scene.bullets : []), ...(Array.isArray(scene && scene.onScreenText) ? scene.onScreenText : [])].filter(Boolean).join(" · ");
  const m = String(hay).match(/(\$?€?₹?\s?\d[\d,\.]*\s?(?:%|x|X|k|K|M|B|\+|bn|m)?)/);
  return m ? m[1].trim() : null;
}
function bulletsOf(scene, n) {
  const b = Array.isArray(scene && scene.bullets) ? scene.bullets.filter(Boolean) : [];
  const o = Array.isArray(scene && scene.onScreenText) ? scene.onScreenText.filter(Boolean) : [];
  return [...b, ...o].slice(0, n);
}
function plateOk(a) { return a && a.path && (a.type === "image" || /\.(png|jpe?g|webp|gif|svg)$/i.test(String(a.path))); }
function isScreenshot(a) { return a && (a.source === "website" || /screenshot|shot|site_|page_/i.test(String(a.path || "") + String(a.alt || ""))); }

// ------------------------------------------------------------------ WORLD (chrome)
// The persistent living world — one full-duration .clip holding every parallax
// layer as a child. GSAP animates the children + the #gx-cam wrapper (camera).
function worldChrome(theme, dims, D, seed) {
  const W = dims.width, H = dims.height, land = W >= H;
  const rand = mulberry(seed);
  const sunX = Math.round(W * (land ? 0.72 : 0.66)), sunY = Math.round(H * (land ? 0.3 : 0.24));
  const sunR = Math.round(Math.min(W, H) * 0.5);

  // Procedural skyline: rows of towers per parallax band. Deterministic from seed.
  const skyline = (band, count, baseY, minH, maxH, fill, windows) => {
    let g = "";
    let x = -W * 0.05;
    const step = (W * 1.1) / count;
    for (let i = 0; i < count; i++) {
      const bw = step * (0.5 + rand() * 0.42);
      const bh = H * (minH + rand() * (maxH - minH));
      const bx = x, by = baseY - bh;
      g += `<rect x="${bx.toFixed(0)}" y="${by.toFixed(0)}" width="${bw.toFixed(0)}" height="${(bh + H * 0.2).toFixed(0)}" rx="${Math.round(bw * 0.03)}" fill="${fill}"/>`;
      // rooftop antenna on some
      if (rand() > 0.6) g += `<rect x="${(bx + bw * 0.5).toFixed(0)}" y="${(by - H * 0.03).toFixed(0)}" width="2.5" height="${(H * 0.03).toFixed(0)}" fill="${fill}"/>`;
      if (windows) {
        const cols = Math.max(2, Math.floor(bw / (W * 0.016)));
        const rows = Math.max(3, Math.floor(bh / (H * 0.045)));
        const pad = bw * 0.14, cw = (bw - pad * 2) / cols;
        for (let c = 0; c < cols; c++) for (let ro = 0; ro < rows; ro++) {
          if (rand() > 0.52) continue;
          const wx = bx + pad + c * cw + cw * 0.18;
          const wy = by + H * 0.03 + ro * (H * 0.045);
          const lit = rand() > 0.45;
          g += `<rect class="gx-win" x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="${(cw * 0.6).toFixed(0)}" height="${(H * 0.022).toFixed(0)}" rx="1" fill="${lit ? rgba(theme.primary, 0.7) : rgba(theme.ink, 0.06)}" style="--lit:${lit ? 1 : 0};"/>`;
        }
      }
      x += step;
    }
    return `<g id="${band}">${g}</g>`;
  };

  // Birds — small V polylines that cross the sky, wings flapping (scaleY on the V).
  let birds = "";
  const flocks = land ? 3 : 2;
  for (let f = 0; f < flocks; f++) {
    const by = H * (0.14 + rand() * 0.22);
    let flock = "";
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const ox = i * 26 - (i % 2) * 10, oy = (i % 2) * 12 + Math.floor(i / 2) * 8;
      const s = 8 + rand() * 5;
      flock += `<path class="gx-bird" d="M${ox} ${oy} l${s} ${-s * 0.5} l${s} ${s * 0.5}" fill="none" stroke="${theme.silhouette}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    birds += `<g class="gx-flock" data-f="${f}" transform="translate(${(-W * 0.2).toFixed(0)},${by.toFixed(0)})" style="opacity:0;">${flock}</g>`;
  }

  // People — silhouettes walking the ground plane (head + torso), gently bobbing.
  const groundY = Math.round(H * (land ? 0.9 : 0.82));
  let people = "";
  const nPeople = land ? 9 : 6;
  for (let i = 0; i < nPeople; i++) {
    const px = W * (0.04 + rand() * 0.92);
    const ph = H * (0.05 + rand() * 0.04);
    const pw = ph * 0.42;
    const dir = rand() > 0.5 ? 1 : -1;
    people += `<g class="gx-person" data-dir="${dir}" transform="translate(${px.toFixed(0)},${(groundY - ph).toFixed(0)})" style="opacity:0;">` +
      `<circle cx="0" cy="${(ph * 0.16).toFixed(0)}" r="${(pw * 0.5).toFixed(0)}" fill="${theme.silhouette}"/>` +
      `<path d="M${(-pw * 0.5).toFixed(0)} ${ph.toFixed(0)} Q0 ${(ph * 0.42).toFixed(0)} ${(pw * 0.5).toFixed(0)} ${ph.toFixed(0)} Z" fill="${theme.silhouette}"/>` +
      `</g>`;
  }

  const sky = `radial-gradient(120% 80% at ${sunX}px ${sunY}px, ${theme.horizon} 0%, ${theme.bg} 42%, ${theme.deep} 100%)`;

  return `
  <div id="gx-world" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="overflow:hidden;">
    <div id="gx-cam" style="position:absolute;inset:-6%;transform-origin:${sunX}px ${sunY}px;">
      <div id="gx-sky" style="position:absolute;inset:0;background:${sky};"></div>
      <div id="gx-sun" style="position:absolute;left:${sunX - sunR}px;top:${sunY - sunR}px;width:${sunR * 2}px;height:${sunR * 2}px;border-radius:50%;background:radial-gradient(circle, ${rgba(theme.primary, 0.45)} 0%, ${rgba(theme.primary, 0.12)} 35%, transparent 62%);opacity:0;"></div>
      <canvas id="gx-fx" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
      <svg id="gx-far" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="position:absolute;inset:0;width:104%;height:100%;left:-2%;opacity:.55;">${skyline("gx-far-g", land ? 11 : 8, H * 0.92, 0.18, 0.42, theme.towerFar, false)}${birds}</svg>
      <svg id="gx-mid" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="position:absolute;inset:0;width:108%;height:100%;left:-4%;">${skyline("gx-mid-g", land ? 8 : 6, H * 0.95, 0.26, 0.6, theme.towerMid, true)}</svg>
      <svg id="gx-near" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="position:absolute;inset:0;width:112%;height:100%;left:-6%;">
        <rect x="0" y="${groundY}" width="${W}" height="${H - groundY + 10}" fill="${theme.towerNear}"/>
        <rect x="0" y="${groundY}" width="${W}" height="2" fill="${rgba(theme.primary, 0.4)}"/>
        ${people}
      </svg>
      <div id="gx-fog" style="position:absolute;left:0;right:0;top:${Math.round(H * 0.55)}px;height:${Math.round(H * 0.5)}px;background:linear-gradient(180deg, transparent, ${rgba(theme.bg, 0.55)} 60%, ${rgba(theme.deep, 0.85)});"></div>
    </div>
    <div id="gx-vignette" style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 100% at 50% 42%, transparent 55%, ${rgba(theme.deep, 0.6)} 100%);"></div>
    <div id="gx-grain" style="position:absolute;inset:0;pointer-events:none;opacity:.5;mix-blend-mode:overlay;background-image:radial-gradient(${rgba(theme.ink, 0.5)} .5px, transparent .5px);background-size:3px 3px;"></div>
  </div>`;
}

// Ambient canvas painter (drifting fog bands, floating light motes, god-rays).
// Emitted as a JS body driven by a timeline proxy (seek-safe + browser-safe).
function worldFxScript(theme, dims, seed) {
  const W = dims.width, H = dims.height;
  const P = rgba(theme.primary, 1).replace(",1)", ",%A%)");
  const S = rgba(theme.secondary, 1).replace(",1)", ",%A%)");
  const col = (t, a) => t.replace("%A%", a);
  return `(function(){var cv=document.getElementById("gx-fx");if(!cv||!cv.getContext)return;var cx=cv.getContext("2d");if(!cx)return;
  var W=${W},H=${H},sd=${seed >>> 0};function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  var MO=[];for(var i=0;i<${Math.round((W * H) / 90000)};i++)MO.push({x:rnd()*W,y:rnd()*H,r:.6+rnd()*2.2,sp:4+rnd()*10,p:rnd()*6.28,c:i%2});
  var sunx=${Math.round(W * 0.72)},suny=${Math.round(H * 0.3)};
  window.__gxDraw=function(t){cx.clearRect(0,0,W,H);
    // god-rays from the sun
    cx.save();cx.translate(sunx,suny);cx.globalCompositeOperation="lighter";
    for(var k=0;k<7;k++){var a=(-1.1+k*0.32)+Math.sin(t*0.05+k)*0.05;cx.save();cx.rotate(a);var g=cx.createLinearGradient(0,0,0,H*1.4);g.addColorStop(0,${JSON.stringify(col(P, ".05"))});g.addColorStop(1,"rgba(0,0,0,0)");cx.fillStyle=g;cx.beginPath();cx.moveTo(0,0);cx.lineTo(-W*0.05,H*1.4);cx.lineTo(W*0.05,H*1.4);cx.closePath();cx.fill();cx.restore();}
    cx.restore();
    // floating light motes rising, twinkling
    cx.globalCompositeOperation="lighter";
    for(var i=0;i<MO.length;i++){var m=MO[i];var y=((m.y-t*m.sp)%(H+30)+H+30)%(H+30)-15;var x=m.x+Math.sin(t*0.4+m.p)*16;cx.globalAlpha=(.15+.5*Math.abs(Math.sin(t*0.8+m.p)));var gr=cx.createRadialGradient(x,y,0,x,y,m.r*3);gr.addColorStop(0,${JSON.stringify(col(P, ".9"))});gr.addColorStop(1,"rgba(0,0,0,0)");cx.fillStyle=m.c?gr:${JSON.stringify(col(S, ".8"))};cx.beginPath();cx.arc(x,y,m.r,0,6.283);cx.fill();}
    cx.globalAlpha=1;cx.globalCompositeOperation="source-over";
  };window.__gxDraw(0);})();`;
}

// =================================================================== BEATS
// Each beat returns { html, s:[gsap lines] }. The .clip wrapper is added by the
// caller. Headlines use masked word spans (.gx-w overflow-hidden / .gx-wi inner)
// for the signature cinematic rise-reveal. Every beat degrades gracefully with
// no assets. `at` = scene start T; `L` = scene length; content windows out via a
// boundary hard-kill added by the caller.

// kicker + masked headline + subtext, positioned. Returns html + reveal script.
function headBlock(id, scene, ctx, opt) {
  const { theme, dims, land } = ctx;
  const align = opt.align || "center";
  const big = Math.round((land ? 0.072 : 0.078) * dims.height * (align === "center" ? 1 : 1));
  const kicker = opt.kicker !== false ? (scene.kicker || scene.emphasis || opt.kickerText || "") : "";
  const sub = sentence(scene.subtext);
  const pos = align === "center"
    ? `left:8%;right:8%;top:${opt.top || 50}%;transform:translateY(-50%);text-align:center;align-items:center;`
    : align === "right"
      ? `right:6%;left:${land ? 46 : 8}%;top:${opt.top || 50}%;transform:translateY(-50%);text-align:right;align-items:flex-end;`
      : `left:6%;right:${land ? 46 : 8}%;top:${opt.top || 50}%;transform:translateY(-50%);text-align:left;align-items:flex-start;`;
  const html = `<div class="gx-head" id="${id}h" style="position:absolute;${pos}display:flex;flex-direction:column;gap:${Math.round(dims.height * 0.02)}px;">
    ${kicker ? `<div class="gx-kick" id="${id}k" style="opacity:0;">${esc(String(kicker).toUpperCase())}</div>` : ""}
    <h2 class="gx-h" style="font:800 ${big}px/1.02 ${theme.headStack};max-width:${align === "center" ? "17ch" : "15ch"};">${wordSpans(scene.headline)}</h2>
    ${sub ? `<p class="gx-sub" id="${id}s" style="opacity:0;font:500 ${Math.round(big * 0.33)}px/1.5 ${theme.subStack};color:${theme.dim};max-width:40ch;">${esc(sub)}</p>` : ""}
  </div>`;
  const s = [];
  if (kicker) s.push(`tl.fromTo("#${id}k",{opacity:0,y:14,letterSpacing:"0.5em"},{opacity:1,y:0,letterSpacing:"0.28em",duration:.7,ease:"power3.out"},${r(ctx.T + 0.25)});`);
  s.push(`tl.fromTo("#${id}h .gx-wi",{yPercent:120,opacity:0},{yPercent:0,opacity:1,duration:.95,ease:"expo.out",stagger:.09},${r(ctx.T + 0.4)});`);
  if (sub) s.push(`tl.fromTo("#${id}s",{opacity:0,y:18},{opacity:1,y:0,duration:.7,ease:"power2.out"},${r(ctx.T + 0.9)});`);
  return { html, s };
}

// A floating screenshot showroom — a glass browser (or phone) frame on a glowing
// reflective pedestal, entering with a perspective tilt and floating forever.
function showroom(idb, asset, ctx, opt) {
  const { theme, dims, land } = ctx;
  const phone = !!(opt && opt.phone);
  const fw = Math.round((land ? (phone ? 0.2 : 0.46) : (phone ? 0.42 : 0.82)) * dims.width);
  const fh = Math.round(phone ? fw * 1.9 : fw * 0.62);
  const cx = opt && opt.cx != null ? opt.cx : (land ? Math.round(dims.width * 0.72) : Math.round(dims.width * 0.5));
  const cy = opt && opt.cy != null ? opt.cy : (land ? Math.round(dims.height * 0.5) : Math.round(dims.height * 0.62));
  const bar = phone ? 0 : Math.round(fh * 0.11);
  const img = asset
    ? `<img src="${esc(asset.path)}" alt="" style="position:absolute;left:0;top:${bar}px;width:100%;height:${fh - bar}px;object-fit:cover;object-position:top center;">`
    : `<div style="position:absolute;left:0;top:${bar}px;width:100%;height:${fh - bar}px;background:${theme.gradPrimary};opacity:.85;"></div>`;
  const chrome = phone ? "" :
    `<div style="position:absolute;left:0;top:0;width:100%;height:${bar}px;background:${rgba(theme.ink, 0.08)};display:flex;align-items:center;gap:6px;padding:0 ${Math.round(bar * 0.5)}px;">
      <span style="width:${Math.round(bar * 0.22)}px;height:${Math.round(bar * 0.22)}px;border-radius:50%;background:${rgba(theme.primary, 0.8)};"></span>
      <span style="width:${Math.round(bar * 0.22)}px;height:${Math.round(bar * 0.22)}px;border-radius:50%;background:${rgba(theme.secondary, 0.7)};"></span>
      <span style="width:${Math.round(bar * 0.22)}px;height:${Math.round(bar * 0.22)}px;border-radius:50%;background:${rgba(theme.accent, 0.7)};"></span>
      <span style="margin-left:${Math.round(bar * 0.4)}px;flex:1;height:${Math.round(bar * 0.4)}px;border-radius:${bar}px;background:${rgba(theme.ink, 0.06)};"></span>
    </div>`;
  const html = `<div class="gx-showroom" id="${idb}" style="position:absolute;left:${cx - fw / 2}px;top:${cy - fh / 2}px;width:${fw}px;height:${fh}px;perspective:1400px;opacity:0;">
    <div id="${idb}p" style="position:absolute;left:-6%;top:100%;width:112%;height:${Math.round(fh * 0.4)}px;background:radial-gradient(60% 100% at 50% 0%, ${rgba(theme.primary, 0.28)}, transparent 70%);filter:blur(6px);"></div>
    <div id="${idb}f" style="position:absolute;inset:0;border-radius:${Math.round(fw * (phone ? 0.09 : 0.02))}px;overflow:hidden;background:${theme.surface};border:1px solid ${theme.surfaceEdge};box-shadow:0 30px 80px ${rgba(theme.deep, 0.6)}, 0 0 60px ${rgba(theme.primary, 0.22)};backdrop-filter:blur(4px);transform-style:preserve-3d;">
      ${chrome}${img}
      <div style="position:absolute;inset:0;background:linear-gradient(120deg, ${rgba("#FFFFFF", 0.14)}, transparent 40%);pointer-events:none;"></div>
    </div>
  </div>`;
  const s = [
    `tl.fromTo("#${idb}",{opacity:0},{opacity:1,duration:.5},${r(ctx.T + 0.5)});`,
    `tl.fromTo("#${idb}f",{rotationY:${land ? -22 : 0},rotationX:8,y:60,scale:.9},{rotationY:${land ? -8 : 0},rotationX:2,y:0,scale:1,duration:1.2,ease:"expo.out"},${r(ctx.T + 0.5)});`,
    `tl.to("#${idb}f",{y:"-=18",duration:3.2,ease:"sine.inOut",yoyo:true,repeat:reps(${r(ctx.L)},3.2)},${r(ctx.T + 1.7)});`,
    `tl.to("#${idb}p",{opacity:.7,duration:3.2,ease:"sine.inOut",yoyo:true,repeat:reps(${r(ctx.L)},3.2)},${r(ctx.T + 1.7)});`,
  ];
  return { html, s };
}

// A fan/arc of floating glass asset cards (2-4) or a drifting content-wall (5+).
function gallery(idb, assets, ctx, opt) {
  const { theme, dims, land } = ctx;
  const list = assets.slice(0, 12);
  if (!list.length) return { html: "", s: [] };
  const cx = (opt && opt.cx) || Math.round(dims.width * (land ? 0.72 : 0.5));
  const cy = (opt && opt.cy) || Math.round(dims.height * (land ? 0.52 : 0.62));
  let html = "", s = [];
  if (list.length <= 4) {
    const cw = Math.round((land ? 0.2 : 0.32) * dims.width);
    const ch = Math.round(cw * 0.72);
    const spread = list.length === 1 ? 0 : (land ? cw * 0.62 : cw * 0.5);
    const totalW = spread * (list.length - 1);
    list.forEach((a, i) => {
      const x = cx - totalW / 2 + i * spread - cw / 2;
      const y = cy - ch / 2 + (Math.abs(i - (list.length - 1) / 2)) * ch * 0.12;
      const rot = (i - (list.length - 1) / 2) * 6;
      const src = plateOk(a) ? `<img src="${esc(a.path)}" alt="" style="width:100%;height:100%;object-fit:cover;">` : `<div style="width:100%;height:100%;background:${theme.gradPrimary};"></div>`;
      html += `<div class="gx-card" id="${idb}${i}" style="position:absolute;left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;width:${cw}px;height:${ch}px;border-radius:${Math.round(cw * 0.05)}px;overflow:hidden;background:${theme.surface};border:1px solid ${theme.surfaceEdge};box-shadow:0 20px 50px ${rgba(theme.deep, 0.5)};transform:rotate(${rot}deg);opacity:0;">${src}<div style="position:absolute;inset:0;background:linear-gradient(120deg,${rgba("#FFFFFF", 0.12)},transparent 45%);"></div></div>`;
      s.push(`tl.fromTo("#${idb}${i}",{opacity:0,y:90,rotation:${rot + (i % 2 ? 14 : -14)},scale:.8},{opacity:1,y:0,rotation:${rot},scale:1,duration:1,ease:"expo.out"},${r(ctx.T + 0.6 + i * 0.14)});`);
      s.push(`tl.to("#${idb}${i}",{y:"-=${12 + i * 3}",duration:${r(2.6 + i * 0.3)},ease:"sine.inOut",yoyo:true,repeat:reps(${r(ctx.L)},${r(2.6 + i * 0.3)})},${r(ctx.T + 1.8)});`);
    });
  } else {
    // content wall — two rows drifting opposite ways
    const rows = 2, per = Math.ceil(list.length / rows);
    const cw = Math.round((land ? 0.16 : 0.28) * dims.width), ch = Math.round(cw * 0.66), gap = Math.round(cw * 0.14);
    for (let rI = 0; rI < rows; rI++) {
      const rowAssets = list.slice(rI * per, rI * per + per);
      const rowW = rowAssets.length * (cw + gap);
      const y = cy - ch - gap / 2 + rI * (ch + gap);
      let inner = "";
      rowAssets.forEach((a, i) => {
        const src = plateOk(a) ? `<img src="${esc(a.path)}" alt="" style="width:100%;height:100%;object-fit:cover;">` : `<div style="width:100%;height:100%;background:${theme.gradPrimary};"></div>`;
        inner += `<div style="width:${cw}px;height:${ch}px;flex:none;border-radius:${Math.round(cw * 0.06)}px;overflow:hidden;background:${theme.surface};border:1px solid ${theme.surfaceEdge};margin-right:${gap}px;">${src}</div>`;
      });
      html += `<div class="gx-wallrow" id="${idb}r${rI}" style="position:absolute;left:0;top:${y}px;display:flex;width:${rowW}px;opacity:0;">${inner}</div>`;
      s.push(`tl.fromTo("#${idb}r${rI}",{opacity:0},{opacity:1,duration:.8},${r(ctx.T + 0.5 + rI * 0.2)});`);
      s.push(`tl.fromTo("#${idb}r${rI}",{x:${rI % 2 ? -rowW * 0.2 : dims.width * 0.1}},{x:${rI % 2 ? dims.width * 0.05 : -rowW * 0.25},duration:${r(Math.max(6, ctx.L))},ease:"none"},${r(ctx.T + 0.5)});`);
    }
  }
  return { html, s };
}

// ---- individual beats ------------------------------------------------------
function beatIntro(scene, ctx) {
  const h = headBlock("i", scene, ctx, { align: "center", top: 46, kickerText: "A NEW WORLD" });
  const { theme, dims } = ctx;
  const html = h.html + `<div id="i-line" style="position:absolute;left:50%;top:${Math.round(dims.height * 0.6)}px;width:${Math.round(dims.width * 0.3)}px;height:2px;transform:translateX(-50%) scaleX(0);background:linear-gradient(90deg,transparent,${theme.primary},transparent);"></div>`;
  const s = [...h.s,
    `tl.fromTo("#i-line",{scaleX:0},{scaleX:1,duration:1.1,ease:"power2.inOut"},${r(ctx.T + 0.9)});`,
  ];
  return { html, s };
}

function beatProblem(scene, ctx, assets) {
  const h = headBlock("p", scene, ctx, { align: "left", top: 42, kickerText: "THE OLD WAY" });
  const { theme, dims, seed } = ctx;
  const rand = mulberry(seed + 11);
  const n = 6;
  const zoneX = dims.width * (ctx.land ? 0.58 : 0.1), zoneW = dims.width * (ctx.land ? 0.38 : 0.8), zoneY = dims.height * (ctx.land ? 0.16 : 0.5), zoneH = dims.height * (ctx.land ? 0.68 : 0.42);
  let html = h.html, s = [...h.s];
  const gl = ["◈", "▤", "◵", "✶", "▧", "◊"];
  for (let i = 0; i < n; i++) {
    const sz = Math.round(dims.width * (0.07 + rand() * 0.05));
    const x = zoneX + rand() * (zoneW - sz), y = zoneY + rand() * (zoneH - sz);
    const rot = (rand() - 0.5) * 40;
    const a = assets[i];
    const face = a && plateOk(a) ? `<img src="${esc(a.path)}" style="width:100%;height:100%;object-fit:cover;filter:grayscale(.7) brightness(.6);">` : `<div style="width:100%;height:100%;display:grid;place-items:center;font-size:${Math.round(sz * 0.4)}px;color:${rgba(theme.ink, 0.4)};">${gl[i % gl.length]}</div>`;
    html += `<div class="gx-chaos" id="p-c${i}" style="position:absolute;left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;width:${sz}px;height:${sz}px;border-radius:8px;overflow:hidden;background:${rgba(theme.ink, 0.06)};border:1px solid ${rgba(theme.accent2, 0.4)};transform:rotate(${rot.toFixed(1)}deg);opacity:0;">${face}</div>`;
    s.push(`tl.fromTo("#p-c${i}",{opacity:0,scale:.5},{opacity:1,scale:1,duration:.5,ease:"back.out(1.6)"},${r(ctx.T + 0.5 + i * 0.08)});`);
    s.push(`tl.to("#p-c${i}",{x:"+=${(rand() - 0.5) * 30 | 0}",y:"+=${(rand() - 0.5) * 24 | 0}",rotation:"+=${(rand() - 0.5) * 18 | 0}",duration:${r(0.5 + rand())},ease:"sine.inOut",yoyo:true,repeat:reps(${r(ctx.L)},${r(0.5 + rand())})},${r(ctx.T + 1)});`);
  }
  return { html, s };
}

function beatDiscovery(scene, ctx, assets) {
  const h = headBlock("d", scene, ctx, { align: "left", top: 40, kickerText: "IT ALL CONNECTS" });
  const { theme, dims } = ctx;
  const cols = 3, rows = 2, n = cols * rows;
  const gw = dims.width * (ctx.land ? 0.4 : 0.84), gh = dims.height * (ctx.land ? 0.56 : 0.4);
  const ox = dims.width * (ctx.land ? 0.56 : 0.08), oy = dims.height * (ctx.land ? 0.24 : 0.52);
  const cw = (gw - (cols - 1) * gw * 0.06) / cols, ch = (gh - (rows - 1) * gh * 0.1) / rows;
  let html = h.html, s = [...h.s];
  const centers = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols, rI = Math.floor(i / cols);
    const x = ox + c * (cw + gw * 0.06), y = oy + rI * (ch + gh * 0.1);
    centers.push([x + cw / 2, y + ch / 2]);
    const a = assets[i];
    const face = a && plateOk(a) ? `<img src="${esc(a.path)}" style="width:100%;height:100%;object-fit:cover;">` : `<div style="width:100%;height:100%;background:${i % 2 ? rgba(theme.primary, 0.16) : rgba(theme.secondary, 0.14)};display:grid;place-items:center;"><span style="width:34%;height:34%;border-radius:8px;background:${theme.gradPrimary};opacity:.7;"></span></div>`;
    html += `<div class="gx-tile" id="d-t${i}" style="position:absolute;left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;width:${cw.toFixed(0)}px;height:${ch.toFixed(0)}px;border-radius:12px;overflow:hidden;background:${theme.surface};border:1px solid ${theme.surfaceEdge};opacity:0;">${face}</div>`;
    s.push(`tl.fromTo("#d-t${i}",{opacity:0,x:${(ox - x - 120) | 0},rotation:-8,scale:.7},{opacity:1,x:0,rotation:0,scale:1,duration:.9,ease:"expo.out"},${r(ctx.T + 0.6 + i * 0.09)});`);
  }
  // connecting flow lines drawn between tile centers
  let paths = "";
  for (let i = 0; i < centers.length - 1; i++) {
    const [x1, y1] = centers[i], [x2, y2] = centers[i + 1];
    const mx = (x1 + x2) / 2;
    paths += `<path class="gx-flow" d="M${x1.toFixed(0)} ${y1.toFixed(0)} Q ${mx.toFixed(0)} ${((y1 + y2) / 2 - 40).toFixed(0)} ${x2.toFixed(0)} ${y2.toFixed(0)}" fill="none" stroke="${rgba(theme.primary, 0.6)}" stroke-width="2" stroke-dasharray="1000" stroke-dashoffset="1000"/>`;
  }
  html += `<svg id="d-flow" viewBox="0 0 ${dims.width} ${dims.height}" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">${paths}</svg>`;
  s.push(`tl.to("#d-flow .gx-flow",{strokeDashoffset:0,duration:1,stagger:.1,ease:"power2.out"},${r(ctx.T + 1.4)});`);
  return { html, s };
}

function beatReveal(scene, ctx, asset) {
  const h = headBlock("r", scene, ctx, { align: ctx.land ? "left" : "center", top: ctx.land ? 42 : 22, kickerText: scene.kicker || "INTRODUCING" });
  const sh = showroom("r-sh", asset, ctx, { phone: false, cx: ctx.land ? Math.round(ctx.dims.width * 0.72) : Math.round(ctx.dims.width * 0.5), cy: ctx.land ? Math.round(ctx.dims.height * 0.52) : Math.round(ctx.dims.height * 0.66) });
  const { theme, dims } = ctx;
  // converging rays behind the product
  const rx = sh ? (ctx.land ? Math.round(dims.width * 0.72) : Math.round(dims.width * 0.5)) : dims.width / 2;
  const ry = ctx.land ? Math.round(dims.height * 0.52) : Math.round(dims.height * 0.66);
  let rays = "";
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; rays += `<line class="gx-ray" x1="${rx}" y1="${ry}" x2="${(rx + Math.cos(a) * dims.width).toFixed(0)}" y2="${(ry + Math.sin(a) * dims.width).toFixed(0)}" stroke="${rgba(theme.primary, 0.12)}" stroke-width="2"/>`; }
  const html = `<svg id="r-rays" viewBox="0 0 ${dims.width} ${dims.height}" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0;">${rays}</svg>` + h.html + sh.html;
  const s = [...h.s, ...sh.s,
    `tl.fromTo("#r-rays",{opacity:0,scale:.6,transformOrigin:"${rx}px ${ry}px"},{opacity:1,scale:1,duration:1.4,ease:"power2.out"},${r(ctx.T + 0.6)});`,
    `tl.to("#r-rays",{rotation:18,transformOrigin:"${rx}px ${ry}px",duration:${r(Math.max(6, ctx.L))},ease:"none"},${r(ctx.T + 0.6)});`,
  ];
  return { html, s };
}

function beatFeatures(scene, ctx) {
  const h = headBlock("f", scene, ctx, { align: "center", top: 20, kickerText: "BUILT FOR THIS" });
  const { theme, dims, land } = ctx;
  const feats = bulletsOf(scene, 3);
  while (feats.length < 3) feats.push(["Fast by default", "Made to scale", "Yours to shape"][feats.length]);
  const n = feats.length;
  const cw = Math.round((land ? 0.24 : 0.82) * dims.width), ch = Math.round(land ? dims.height * 0.42 : dims.height * 0.16);
  const gap = Math.round(dims.width * 0.02);
  const totalW = land ? n * cw + (n - 1) * gap : cw;
  const startX = land ? (dims.width - totalW) / 2 : (dims.width - cw) / 2;
  const startY = land ? Math.round(dims.height * 0.42) : Math.round(dims.height * 0.36);
  let html = h.html, s = [...h.s];
  const motifs = [
    (c) => `<circle cx="24" cy="24" r="14" fill="none" stroke="${c}" stroke-width="3"/><circle class="gx-orbit" cx="38" cy="24" r="4" fill="${c}"/>`,
    (c) => `<rect x="10" y="26" width="7" height="12" rx="2" fill="${c}"/><rect x="20" y="18" width="7" height="20" rx="2" fill="${c}"/><rect x="30" y="10" width="7" height="28" rx="2" fill="${c}"/>`,
    (c) => `<path d="M8 30 L20 18 L28 26 L40 12" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  ];
  feats.forEach((ftxt, i) => {
    const x = land ? startX + i * (cw + gap) : startX;
    const y = land ? startY : startY + i * (ch + gap);
    const col = [theme.primary, theme.secondary, theme.accent][i % 3];
    html += `<div class="gx-feat" id="f-c${i}" style="position:absolute;left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;width:${cw}px;height:${ch}px;border-radius:${Math.round(cw * 0.06)}px;background:${theme.surface};border:1px solid ${theme.surfaceEdge};box-shadow:0 20px 50px ${rgba(theme.deep, 0.45)}, inset 0 0 40px ${rgba(col, 0.06)};opacity:0;overflow:hidden;padding:${Math.round(cw * 0.09)}px;display:flex;flex-direction:column;justify-content:space-between;">
      <div style="width:${Math.round(cw * 0.18)}px;height:${Math.round(cw * 0.18)}px;border-radius:14px;background:${rgba(col, 0.14)};border:1px solid ${rgba(col, 0.4)};display:grid;place-items:center;"><svg width="48" height="48" viewBox="0 0 48 48" style="width:60%;height:60%;">${motifs[i % 3](col)}</svg></div>
      <div style="font:700 ${Math.round(cw * 0.09)}px/1.2 ${theme.headStack};color:${theme.ink};">${esc(ftxt)}</div>
      <div style="height:3px;width:40%;border-radius:2px;background:${theme.gradPrimary};"></div>
    </div>`;
    s.push(`tl.fromTo("#f-c${i}",{opacity:0,y:80,rotationX:14,transformOrigin:"50% 100%"},{opacity:1,y:0,rotationX:0,duration:1,ease:"expo.out"},${r(ctx.T + 0.6 + i * 0.16)});`);
    s.push(`tl.to("#f-c${i}",{y:"-=14",duration:${r(2.8 + i * 0.3)},ease:"sine.inOut",yoyo:true,repeat:reps(${r(ctx.L)},${r(2.8 + i * 0.3)})},${r(ctx.T + 1.8 + i * 0.1)});`);
    s.push(`tl.to("#f-c${i} .gx-orbit",{rotation:360,transformOrigin:"24px 24px",duration:4,ease:"none",repeat:reps(${r(ctx.L)},4)},${r(ctx.T + 1)});`);
  });
  return { html, s };
}

function beatProof(scene, ctx, assets) {
  const h = headBlock("q", scene, ctx, { align: "center", top: 20, kickerText: "LOVED WORLDWIDE" });
  const { theme, dims, land, seed } = ctx;
  const stats = bulletsOf(scene, 3).map((b) => ({ n: (String(b).match(/(\$?\d[\d,\.]*\s?[%xkKMB+]*)/) || [b])[0], label: String(b).replace(/(\$?\d[\d,\.]*\s?[%xkKMB+]*)/, "").trim() }));
  while (stats.length < 3) { const d = [["12k+", "teams"], ["4.9", "rating"], ["98%", "retention"]][stats.length]; stats.push({ n: d[0], label: d[1] }); }
  let html = h.html, s = [...h.s];
  const rand = mulberry(seed + 7);
  const rowY = Math.round(dims.height * (land ? 0.5 : 0.46));
  const cw = Math.round((land ? 0.22 : 0.3) * dims.width), gap = Math.round(dims.width * 0.03);
  const total = stats.length * cw + (stats.length - 1) * gap, sx = (dims.width - total) / 2;
  stats.forEach((st, i) => {
    const x = sx + i * (cw + gap);
    const raw = String(st.n);
    const decimal = /\d\.\d/.test(raw);       // "4.9" — count() would drop the dot
    const num = raw.replace(/[^\d]/g, "") || "0";
    const pre = (raw.match(/^[^\d]+/) || [""])[0], suf = (raw.match(/[^\d]+$/) || [""])[0];
    html += `<div class="gx-stat" id="q-s${i}" style="position:absolute;left:${x.toFixed(0)}px;top:${rowY}px;width:${cw}px;text-align:center;opacity:0;">
      <div style="font:800 ${Math.round(dims.height * 0.1)}px/1 ${theme.headStack};background:${theme.gradPrimary};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;"><span id="q-n${i}">${decimal ? esc(raw) : "0"}</span></div>
      <div style="margin-top:6px;font:600 ${Math.round(dims.height * 0.026)}px ${theme.subStack};color:${theme.dim};letter-spacing:.04em;">${esc(st.label)}</div>
    </div>`;
    s.push(`tl.fromTo("#q-s${i}",{opacity:0,y:40},{opacity:1,y:0,duration:.7,ease:"power3.out"},${r(ctx.T + 0.6 + i * 0.15)});`);
    if (!decimal) s.push(`count("#q-n${i}",${Number(num) || 0},${r(ctx.T + 0.8 + i * 0.15)},1.4,${JSON.stringify(pre)},${JSON.stringify(suf)});`);
  });
  // avatar chips floating in the UPPER CORNERS (clear of the centered headline
  // and the stat row) — two clusters drifting up.
  const chipY = Math.round(dims.height * (land ? 0.34 : 0.66));
  const zones = land ? [0.06, 0.12, 0.18, 0.82, 0.88, 0.94] : [0.08, 0.24, 0.76, 0.92];
  for (let i = 0; i < zones.length; i++) {
    const cxp = dims.width * zones[i], sz = Math.round(dims.width * 0.03);
    const a = assets[i];
    const face = a && plateOk(a) ? `<img src="${esc(a.path)}" style="width:100%;height:100%;object-fit:cover;">` : `<div style="width:100%;height:100%;background:${[theme.primary, theme.secondary, theme.accent][i % 3]};"></div>`;
    html += `<div class="gx-chip" id="q-a${i}" style="position:absolute;left:${cxp.toFixed(0)}px;top:${chipY}px;width:${sz}px;height:${sz}px;border-radius:50%;overflow:hidden;border:2px solid ${rgba(theme.primary, 0.6)};box-shadow:0 6px 18px ${rgba(theme.deep, 0.5)};opacity:0;">${face}</div>`;
    s.push(`tl.fromTo("#q-a${i}",{opacity:0,scale:0},{opacity:1,scale:1,duration:.5,ease:"back.out(2)"},${r(ctx.T + 0.9 + i * 0.1)});`);
    s.push(`tl.to("#q-a${i}",{y:"-=${10 + (i % 3) * 4}",duration:${r(2 + rand())},ease:"sine.inOut",yoyo:true,repeat:reps(${r(ctx.L)},${r(2 + rand())})},${r(ctx.T + 1.4)});`);
  }
  return { html, s };
}

function beatGrowth(scene, ctx) {
  const h = headBlock("g", scene, ctx, { align: "left", top: 24, kickerText: "ONLY GOING UP" });
  const { theme, dims, land, seed } = ctx;
  const rand = mulberry(seed + 3);
  const gx = dims.width * (land ? 0.5 : 0.08), gw = dims.width * (land ? 0.44 : 0.84);
  const gy = dims.height * (land ? 0.78 : 0.86), gh = dims.height * (land ? 0.46 : 0.36);
  const pts = 7; let d = "", area = `M${gx} ${gy}`, dotsHtml = "";
  let prev = 0.25;
  for (let i = 0; i < pts; i++) {
    const x = gx + (gw * i) / (pts - 1);
    prev = clamp(prev + (rand() - 0.35) * 0.22, 0.12, 0.95);
    const y = gy - gh * prev;
    d += (i ? " L" : "M") + `${x.toFixed(0)} ${y.toFixed(0)}`;
    area += ` L${x.toFixed(0)} ${y.toFixed(0)}`;
    dotsHtml += `<circle class="gx-gd" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="5" fill="${theme.primary}" opacity="0"/>`;
    // rising bar under each point
    const bw = gw / pts * 0.42;
    dotsHtml += `<rect class="gx-gb" x="${(x - bw / 2).toFixed(0)}" y="${gy.toFixed(0)}" width="${bw.toFixed(0)}" height="${(gy - y).toFixed(0)}" rx="3" fill="${rgba(theme.primary, 0.14)}" style="transform-box:fill-box;transform-origin:50% 100%;transform:scaleY(0);"/>`;
  }
  area += ` L${(gx + gw).toFixed(0)} ${gy.toFixed(0)} Z`;
  const alen = Math.round(gw * 1.4);
  const html = h.html + `<svg id="g-graph" viewBox="0 0 ${dims.width} ${dims.height}" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">
    <defs><linearGradient id="g-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${rgba(theme.primary, 0.3)}"/><stop offset="1" stop-color="${rgba(theme.primary, 0)}"/></linearGradient></defs>
    ${[0, 1, 2, 3].map((i) => `<line x1="${gx}" y1="${(gy - gh * i / 3).toFixed(0)}" x2="${gx + gw}" y2="${(gy - gh * i / 3).toFixed(0)}" stroke="${theme.line}" stroke-width="1"/>`).join("")}
    ${dotsHtml}
    <path id="g-area" d="${area}" fill="url(#g-fill)" opacity="0"/>
    <path id="g-line" d="${d}" fill="none" stroke="${theme.primary}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${alen}" stroke-dashoffset="${alen}" style="filter:drop-shadow(0 0 8px ${rgba(theme.primary, 0.6)});"/>
  </svg>`;
  const s = [...h.s,
    `tl.to("#g-graph .gx-gb",{scaleY:1,duration:.7,stagger:.08,ease:"power2.out"},${r(ctx.T + 0.7)});`,
    `tl.to("#g-line",{strokeDashoffset:0,duration:1.6,ease:"power2.inOut"},${r(ctx.T + 0.9)});`,
    `tl.to("#g-area",{opacity:1,duration:1,ease:"power2.out"},${r(ctx.T + 1.4)});`,
    `tl.fromTo("#g-graph .gx-gd",{opacity:0,scale:0,transformBox:"fill-box",transformOrigin:"50% 50%"},{opacity:1,scale:1,duration:.4,stagger:.12,ease:"back.out(2)"},${r(ctx.T + 1.2)});`,
  ];
  return { html, s };
}

function beatCta(scene, ctx, title) {
  const { theme, dims } = ctx;
  const big = Math.round(dims.height * 0.13);
  const cta = sentence(scene.subtext) || "Start creating today";
  // Solid ink + primary glow (NOT background-clip:text — the reveal transforms the
  // per-word inline-block children, and clip-to-text doesn't reach transformed
  // children, so a clipped wordmark renders invisible). A glowing white/ink
  // wordmark reads as the epic logo climax and stays legible on any brand.
  const html = `<div id="c-wrap" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(dims.height * 0.03)}px;text-align:center;">
    <div id="c-logo" style="font:800 ${big}px/1 ${theme.headStack};color:${theme.ink};opacity:0;letter-spacing:-.02em;text-shadow:0 0 ${Math.round(big * 0.5)}px ${rgba(theme.primary, 0.55)}, 0 0 ${Math.round(big * 0.15)}px ${rgba(theme.primary, 0.4)};">${wordSpans(scene.headline || title)}</div>
    <div id="c-btn" style="opacity:0;margin-top:${Math.round(dims.height * 0.02)}px;padding:${Math.round(dims.height * 0.02)}px ${Math.round(dims.height * 0.05)}px;border-radius:999px;background:${theme.gradPrimary};color:${theme.isDark ? "#0a0a0a" : "#ffffff"};font:700 ${Math.round(dims.height * 0.032)}px ${theme.subStack};box-shadow:0 20px 60px ${rgba(theme.primary, 0.5)};">${esc(cta)} →</div>
  </div>
  <div id="c-burst" style="position:absolute;left:50%;top:50%;width:${Math.round(dims.width * 1.2)}px;height:${Math.round(dims.width * 1.2)}px;transform:translate(-50%,-50%) scale(0);border-radius:50%;background:radial-gradient(circle,${rgba(theme.primary, 0.35)},transparent 60%);opacity:0;pointer-events:none;"></div>`;
  const s = [
    `tl.fromTo("#c-burst",{opacity:0,scale:0},{opacity:1,scale:1,duration:1.2,ease:"power2.out"},${r(ctx.T + 0.3)});`,
    `tl.to("#c-burst",{opacity:.5,scale:1.15,duration:2.4,ease:"sine.inOut",yoyo:true,repeat:reps(${r(ctx.L)},2.4)},${r(ctx.T + 1.5)});`,
    `tl.fromTo("#c-logo",{opacity:0},{opacity:1,duration:.5},${r(ctx.T + 0.5)});`,
    `tl.fromTo("#c-logo .gx-wi",{yPercent:120,rotationX:40,opacity:0,transformOrigin:"50% 100%"},{yPercent:0,rotationX:0,opacity:1,duration:1.1,ease:"expo.out",stagger:.1},${r(ctx.T + 0.5)});`,
    `tl.fromTo("#c-btn",{opacity:0,scale:.7,y:30},{opacity:1,scale:1,y:0,duration:.8,ease:"back.out(1.7)"},${r(ctx.T + 1.3)});`,
    `tl.to("#c-btn",{scale:1.05,duration:1.3,ease:"sine.inOut",yoyo:true,repeat:reps(${r(ctx.L)},1.3)},${r(ctx.T + 2.1)});`,
  ];
  return { html, s };
}

// route a scene to a beat, considering content + assets
function routeBeat(scene, i, total, hasAsset) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  const blob = k + " " + p;
  const bl = bulletsOf(scene, 3).length;
  if (i === 0 || k === "hook" || k === "title") return "intro";
  if (i === total - 1 || k === "cta") return "cta";
  if (/problem|pain|chaos|challenge|struggle|before/.test(blob)) return "problem";
  if (/proof|testimonial|quote|social|trust|review|loved|customer/.test(blob)) return "proof";
  if (/growth|scale|data|metric|result|graph|chart|revenue|roi/.test(blob) || (k === "stat" && !hasAsset)) return "growth";
  if (/discover|solution|order|connect|how|workflow|integrat/.test(blob)) return "discovery";
  if (hasAsset) return "reveal";
  if (bl >= 2 || /feature|benefit/.test(blob)) return "features";
  return "reveal";
}

// ------------------------------------------------------------------- STYLE
function styleBlock(theme, dims) {
  return `${theme.fontFace}
*{margin:0;box-sizing:border-box;}
#root{position:relative;overflow:hidden;background:${theme.bg};color:${theme.ink};font-family:${theme.bodyStack};}
.clip{position:absolute;inset:0;}
.gx-kick{font:700 ${Math.round(dims.height * 0.02)}px ${theme.subStack};letter-spacing:.28em;color:${theme.primary};text-transform:uppercase;}
.gx-h{color:${theme.ink};letter-spacing:-.02em;}
.gx-h .gx-w{display:inline-block;overflow:hidden;padding:0 .04em;}
.gx-h .gx-wi{display:inline-block;}
#c-logo .gx-w{display:inline-block;overflow:hidden;padding:0 .04em;}
#c-logo .gx-wi{display:inline-block;}
.gx-win{transition:none;}`;
}

// --------------------------------------------------------------- ASSEMBLY
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin } = {}) {
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1920, H = (dims && dims.height) || 1080;
  const D0 = { width: W, height: H, fps: (dims && dims.fps) || 30 };
  const land = W >= H;
  const theme = genesisTheme(framePack || "genesis", sb, brandSkin);
  const seed = hashSeed((sb.title || "genesis") + "|" + W + "x" + H);

  const scenes = Array.isArray(sb.scenes) && sb.scenes.length ? sb.scenes.slice(0, 14)
    : [{ id: "s1", start: 0, duration: 6, kind: "hook", headline: sb.title || "Genesis" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);
  const title = sb.title || (scenes[scenes.length - 1] && scenes[scenes.length - 1].headline) || "Genesis";

  // asset distribution: pinned (sceneId) claim their scene; the rest pool.
  const imgs = (Array.isArray(assets) ? assets : []).filter(plateOk);
  // A pin whose scene is not in THIS film (the planner numbers against the whole
  // storyboard; the slice above keeps 14) used to claim a key nothing looks up, and the
  // asset was simply lost — measured on the dedicated-composer fixture, that was the
  // job's best capture (hero section, cdScore 91) on a 7-scene film. Pins to scenes
  // that exist are untouched and still outrank the pool.
  const liveIds = new Set(scenes.map((s, i) => (s && s.id != null ? String(s.id) : `s${i + 1}`)));
  const byScene = new Map(); const pool = [];
  for (const a of imgs) { const sid = a.sceneId != null ? String(a.sceneId) : null; if (sid && liveIds.has(sid) && !byScene.has(sid)) byScene.set(sid, a); else pool.push(a); }
  // The cursor into that pool only moved forward, so the showroom on a beat got the
  // next capture rather than the right one — and on a website job the pool arrives in
  // capture order (site_0…site_5, boilerplate alt, nothing to break the tie), which is
  // why the "AI-native canvas" reveal was showing the footer. nextAsset now asks
  // scene_match which REMAINING asset is about the beat's own words; calling it n
  // times for one beat therefore fills a grid in descending relevance. Nothing on
  // topic (null) falls back to the head of the pool — the old behaviour — so a beat
  // is never handed an empty frame it used to fill.
  const nextAsset = (scene) => {
    if (!pool.length) return null;
    const match = pickForScene(pool, scene);
    return pool.splice(match ? pool.indexOf(match) : 0, 1)[0];
  };

  const scriptStart = (i) => scenes.slice(0, i).reduce((a, s) => a + (Number(s.duration) || 4), 0);
  const bodyParts = []; const sceneScripts = []; const usedBeats = [];

  scenes.forEach((scene, i) => {
    const T = r(scene.start != null ? scene.start : scriptStart(i));
    const L = r(scene.duration || 5);
    const sid = scene.id != null ? String(scene.id) : `s${i + 1}`;
    const pinned = byScene.get(sid) || null;
    const ctx = { id: `gs${i + 1}`, T, L, E: r(T + L), isLast: i === scenes.length - 1, track: 3 + i, dims: D0, land, theme, seed: seed + i * 101 };
    let beat = routeBeat(scene, i, scenes.length, !!pinned || pool.length > 0);
    let built;
    if (beat === "intro") built = beatIntro(scene, ctx);
    else if (beat === "cta") built = beatCta(scene, ctx, title);
    else if (beat === "problem") built = beatProblem(scene, ctx, [pinned, ...pool.slice(0, 6)].filter(Boolean));
    else if (beat === "discovery") built = beatDiscovery(scene, ctx, (() => { const a = []; for (let k = 0; k < 6; k++) a.push(nextAsset(scene)); return a; })());
    else if (beat === "proof") built = beatProof(scene, ctx, (() => { const a = []; for (let k = 0; k < 6; k++) a.push(nextAsset(scene)); return a; })());
    else if (beat === "growth") built = beatGrowth(scene, ctx);
    else if (beat === "features") built = beatFeatures(scene, ctx);
    else built = beatReveal(scene, ctx, pinned || nextAsset(scene));
    usedBeats.push(beat);

    bodyParts.push(`<div class="clip gx-scene" id="${ctx.id}" data-start="${T}" data-duration="${L}" data-track-index="${ctx.track}" style="opacity:0;">${built.html}</div>`);
    sceneScripts.push(built.s.join("\n  "));
    sceneScripts.push(`tl.fromTo("#${ctx.id}",{opacity:0},{opacity:1,duration:.35},${T});`);
    if (!ctx.isLast) sceneScripts.push(`kill("#${ctx.id}",${r(T + L)});`);
  });

  const chrome = worldChrome(theme, D0, D, seed);
  const fxScript = worldFxScript(theme, D0, seed);

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  // camera + world drift (finite repeats → seek-safe). Layers drift at depth rates.
  const worldScript = `
  tl.fromTo("#gx-sun",{opacity:0},{opacity:1,duration:2,ease:"power2.out"},0.2);
  tl.to("#gx-cam",{scale:1.14,duration:${D},ease:"none"},0);
  tl.to("#gx-far",{x:${Math.round(W * 0.03)},duration:${D},ease:"none"},0);
  tl.to("#gx-mid",{x:${-Math.round(W * 0.05)},duration:${D},ease:"none"},0);
  tl.to("#gx-near",{x:${-Math.round(W * 0.09)},duration:${D},ease:"none"},0);
  tl.to(".gx-flock",{x:"+=${Math.round(W * 1.3)}",duration:${r(Math.max(10, D))},ease:"none",stagger:${r(D / 6)}},0);
  tl.fromTo(".gx-flock",{opacity:0},{opacity:.8,duration:1.2,stagger:${r(D / 6)}},0.5);
  tl.to(".gx-bird",{scaleY:.4,transformOrigin:"center center",duration:.32,ease:"sine.inOut",yoyo:true,repeat:reps(${D},.32)},0);
  tl.fromTo(".gx-person",{opacity:0},{opacity:.9,duration:1,stagger:.06},0.6);
  ${[...Array(land ? 9 : 6).keys()].map((i) => `tl.to(".gx-person:nth-of-type(${i + 1})",{x:"+=${(i % 2 ? 1 : -1) * Math.round(W * (0.12 + (i % 3) * 0.05))}",duration:${r(Math.max(8, D))},ease:"none"},0);`).join("\n  ")}
  tl.to(".gx-person",{y:"-=6",duration:.5,ease:"sine.inOut",yoyo:true,repeat:reps(${D},.5),stagger:.05},0);
  tl.to(".gx-win",{opacity:"+=0",duration:.01},0);
  tl.fromTo("#gx-grain",{opacity:.55},{opacity:.32,duration:4,ease:"sine.inOut",yoyo:true,repeat:reps(${D},4)},0);`;

  const script = `(function(){
  var D=${D};
  var tl=gsap.timeline({paused:true});
  var $=function(s){return document.querySelector(s);};
  function reps(t,c){return Math.max(0,Math.floor(t/c)-1);}
  function kill(id,t){tl.set(id,{opacity:0},t);}
  function count(sel,to,at,dur,pre,suf){var o={v:0};tl.to(o,{v:to,duration:dur,ease:"power2.out",snap:{v:1},onUpdate:function(){var e=$(sel);if(e)e.textContent=(pre||"")+Math.round(o.v)+(suf||"");}},at);}
  ${worldScript}
  ${sceneScripts.join("\n  ")}
  var cues=${JSON.stringify(cues)};
  var proxy={t:0};
  tl.to(proxy,{t:D,duration:D,ease:"none",onUpdate:function(){
    if(window.__gxDraw)window.__gxDraw(proxy.t);
    var cap=$("#gx-cap"),txt=$("#gx-captext");if(cap&&txt){var a=null;for(var k=0;k<cues.length;k++){if(proxy.t>=cues[k][0]&&proxy.t<cues[k][1]){a=cues[k];break;}}if(a){if(txt.textContent!==a[2])txt.textContent=a[2];cap.style.opacity="1";}else cap.style.opacity="0";}
  }},0);
  ${fxScript}
  window.__timelines=window.__timelines||{};
  window.__timelines["vid"]=tl;
  if(typeof navigator==="undefined"||!navigator.webdriver){tl.play(0);tl.eventCallback("onComplete",function(){tl.restart();});}
})();`;

  const capHtml = `<div id="gx-cap" class="clip" data-start="0" data-duration="${D}" data-track-index="40" style="pointer-events:none;"><div style="position:absolute;left:50%;bottom:5.5%;transform:translateX(-50%);max-width:74%;padding:10px 22px;border-radius:12px;background:${rgba(theme.deep, 0.66)};border:1px solid ${theme.surfaceEdge};backdrop-filter:blur(8px);opacity:0;" id="gx-cap-inner"><div id="gx-captext" style="font:600 ${Math.round(H * 0.03)}px/1.35 ${theme.subStack};color:${theme.ink};text-align:center;"></div></div></div>`;

  const indexHtml = [
    `<!DOCTYPE html>`, `<html lang="en">`, `<head>`, `<meta charset="utf-8">`, `<title>vid</title>`,
    `<script src="${GSAP_CDN}"></script>`,
    `<style>`, styleBlock(theme, D0), `</style>`, `</head>`, `<body>`,
    `<div id="root" class="composition" data-composition-id="vid" data-width="${W}" data-height="${H}" data-start="0" data-duration="${D}" style="width:${W}px;height:${H}px;">`,
    chrome, bodyParts.join("\n"), capHtml, `</div>`,
    `<script>`, script.replace(/#gx-cap"/g, "#gx-cap-inner\""), `</script>`, `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: D0.fps, duration: D });
  return { indexHtml, metaJson };
}

module.exports = { buildComposition, genesisTheme };

