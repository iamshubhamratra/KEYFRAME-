import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { listFrames, mediaUrl } from "../api.js";
import { PACK_LORE, PACK_ORDER, loreFor, loreForPack } from "../packlore.js";

// Template categories by aspect ratio. Portrait 9:16 leads (the imported vertical packs).
const CATEGORIES = [
  ["portrait", "9:16 · VERTICAL", "Reels, Shorts & TikTok", "#e832a8"],
  ["horizontal", "16:9 · LANDSCAPE", "YouTube, web & keynote", "#23c8e0"],
  ["square", "1:1 · SQUARE", "Feed posts", "#b9f24a"],
];
// A pack's aspect category — from the server manifest `orientation`, with a lore-tag fallback
// (a "9:16" in the pack's tag) so a portrait pack still lands right if orientation is absent.
function catOf(pack) {
  const o = String(pack.orientation || "").toLowerCase();
  if (o === "portrait" || o === "vertical") return "portrait";
  if (o === "square") return "square";
  if (o === "horizontal" || o === "landscape") return "horizontal";
  const tag = String(loreFor(pack.name).tag || "");
  if (/9:16/.test(tag)) return "portrait";
  if (/1:1/.test(tag)) return "square";
  return "horizontal";
}

// The thumbnail frame per aspect category. A pack's preview.mp4/poster.jpg is rendered at
// its OWN aspect (9:16 portrait packs ship 540x960 / 648x1152), so showing every card in
// one 16/10 box cropped a vertical preview down to a horizontal sliver — the headline and
// the whole lower composition fell outside the frame. Match the frame to the pack.
//
// THE FRAME MUST MATCH THE POSTER EXACTLY, NOT APPROXIMATELY.
//
// `horizontal` was 16/10 while every landscape pack renders its poster at 1280x720 — 16/9.
// With `object-fit: cover` a 1.778 image covering a 1.6 box is scaled by height, so its width
// overflows by 1.778/1.6 = 11.1% and gets cropped: 5.6% off EACH side. On a ~355px card that
// is ~20px a side, which is exactly one capital letter of a left-aligned headline.
//
// The picker was quietly beheading its own type. Measured across the gallery screenshots:
// "One clear view" -> "ne clear view", "Everything in one place" -> "verything in one place",
// "NORTHWIND" -> "IORTHWIND", and bauhaus-riot's stat panel cut on both edges. Every landscape
// pack, every card, every time — a template picker whose whole job is to show what a pack
// looks like.
const THUMB_ASPECT = { portrait: "9 / 16", square: "1 / 1", horizontal: "16 / 9" };
// The CreateScreen picker puts every aspect in ONE grid, so its frame cannot be pack-true
// without ragged rows. It stays uniform and letterboxes instead (see `fit` below) — a
// contained poster on the pack's own ground reads as a designed thumbnail; a poster cropped
// to a sliver reads as a bug.
const COMPACT_ASPECT = "16 / 10";

// Frame packs in the v2 voice: paper page, scene pill, white cards with a
// color spine per pack. Hovering fades the pack's real motion preview in.
export default function Templates({ onUseStyle }) {
  const [packs, setPacks] = useState(null);

  useEffect(() => {
    listFrames()
      .then((f) => setPacks(orderPacks(f.packs || [])))
      .catch(() => setPacks(orderPacks([])));
  }, []);

  const list = packs || orderPacks([]);
  // Group once: the jump bar and the sections below must agree on which aspects
  // exist and how many packs each holds.
  const groups = CATEGORIES.map((cat) => [cat, list.filter((p) => catOf(p) === cat[0])]).filter(([, g]) => g.length);

  return (
    <div>
      <section style={{ padding: "clamp(20px,4vw,50px) clamp(16px,4vw,60px) clamp(24px,3vw,40px)", maxWidth: 1200, margin: "0 auto" }}>
        <span className="scene-pill" style={{ "--tagc": "#e832a8" }}>FRAME PACKS · {list.length} STYLES</span>
        <h1 className="headline" style={{ fontSize: "clamp(38px,6vw,84px)", maxWidth: "14ch" }}>
          Pick the <span style={{ color: "var(--color-mag)" }}>look.</span><br />We art-direct the film.
        </h1>
        <p style={{ color: "var(--color-dim)", maxWidth: 560, margin: "20px 0 0", lineHeight: 1.6, fontSize: 16 }}>
          Each pack is a complete design system — colors, type and motion are sacred;
          composition is free. Hover any card to preview its motion language.
        </p>

        {/* Jump to an aspect. Portrait leads the gallery, so landscape and square
            sat below a long scroll — these put every aspect one click from the top. */}
        <nav aria-label="Jump to an aspect ratio" style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "26px 0 0" }}>
          {groups.map(([[key, title, sub, accent], group]) => (
            <AspectJump key={key} target={key} title={title} sub={sub} accent={accent} count={group.length} />
          ))}
        </nav>
      </section>

      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 clamp(16px,4vw,60px) clamp(70px,10vw,120px)" }}>
        {groups.map(([[key, title, sub, accent], group]) => {
          return (
            <div key={key} id={`packs-${key}`} style={{ marginBottom: "clamp(40px,6vw,72px)", scrollMarginTop: 24 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", margin: "0 0 20px" }}>
                <span className="scene-pill" style={{ "--tagc": accent }}>{title}</span>
                <span style={{ color: "var(--color-dim)", fontSize: 13.5 }}>{sub}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", color: "var(--color-dim)", marginLeft: "auto" }}>{group.length} STYLES</span>
              </div>
              {/* A 9:16 card is ~1.8x as tall as it is wide, so a portrait row uses a
                  narrower column — at the 310px landscape width these would tower over
                  the page. Each group is single-aspect, so rows stay even. */}
              <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${key === "portrait" ? 230 : key === "square" ? 270 : 310}px,1fr))`, gap: 18 }}>
                {group.map((p, i) => (
                  <PackCard key={p.name} pack={p} delay={(i % 3) * 0.07} onUse={() => onUseStyle?.(p.name)} />
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

// One aspect-ratio jump button. Scrolls the matching group into view rather than
// navigating, so the gallery keeps its scroll position and its in-view card
// animations. Honors prefers-reduced-motion — an instant jump is the accessible
// answer there, not a slow one.
function AspectJump({ target, title, sub, accent, count }) {
  const [hot, setHot] = useState(false);
  const go = () => {
    const el = document.getElementById(`packs-${target}`);
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  return (
    <button
      type="button"
      onClick={go}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
      title={`${title} — ${sub}`}
      className="scene-pill"
      style={{
        "--tagc": accent,
        gap: 8,
        cursor: "pointer",
        background: hot ? `color-mix(in srgb, ${accent} 12%, transparent)` : "transparent",
        transition: "background .2s ease, transform .2s ease",
        transform: hot ? "translateY(-1px)" : "none",
        font: "inherit",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.3em",
        textTransform: "uppercase",
      }}
    >
      {title}
      <span style={{ letterSpacing: "0.14em", opacity: 0.65 }}>{count}</span>
    </button>
  );
}

// Merge server packs with the design lore, in the design's order.
function orderPacks(serverPacks) {
  const byName = Object.fromEntries(serverPacks.map((p) => [p.name, p]));
  const known = PACK_ORDER.map((name) => ({ name, ...(byName[name] || {}) }));
  const extras = serverPacks.filter((p) => !PACK_LORE[p.name]);
  return [...known, ...extras];
}

// One pack card — v2 anatomy: white card, color spine, scanlined preview.
export function PackCard({ pack, delay = 0, onUse, compact = false }) {
  const lore = loreForPack(pack);
  const vidRef = useRef(null);
  const [hover, setHover] = useState(false);
  const preview = pack.previewUrl ? mediaUrl(pack.previewUrl) : null;
  const poster = pack.posterUrl ? mediaUrl(pack.posterUrl) : null;
  // The gallery groups packs by aspect, so a pack-true frame keeps rows even AND shows every
  // preview whole — with the frame now matching the poster exactly, `cover` crops nothing.
  // `compact` is the CreateScreen picker, where every aspect shares ONE grid: it keeps a
  // uniform frame and CONTAINS the poster instead, so a 9:16 pack is letterboxed on its own
  // ground rather than reduced to a horizontal sliver of itself.
  const aspect = compact ? COMPACT_ASPECT : (THUMB_ASPECT[catOf(pack)] || THUMB_ASPECT.horizontal);
  const fit = compact ? "contain" : "cover";

  const enter = () => {
    setHover(true);
    const v = vidRef.current;
    if (v) v.play().catch(() => {});
  };
  const leave = () => {
    setHover(false);
    const v = vidRef.current;
    if (v) { v.pause(); v.currentTime = 0; }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay }}
      className="card card-lift"
      style={{ overflow: "hidden", cursor: "pointer" }}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onClick={onUse}
    >
      <span className="spine" style={{ "--spine": lore.accent, zIndex: 5 }} />

      {/* thumbnail — the pack's REAL rendered look (its poster frame). The synthetic
          bg / gradient / chips / demo-type below is only a FALLBACK for a pack that
          has no poster; when a poster exists it fully covers them (zIndex 4). */}
      <div style={{ aspectRatio: aspect, position: "relative", overflow: "hidden", background: lore.bg, display: "grid", placeItems: "center" }}>
        <div style={{ position: "absolute", inset: 0, background: lore.grad, opacity: 0.9 }} />
        <div className="film-scan" style={{ opacity: 0.5 }} />
        <div style={{ position: "absolute", top: 12, left: 17, display: "flex", gap: 5, zIndex: 3 }}>
          {lore.chips.map((c, i) => (
            <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c, boxShadow: "0 1px 4px rgba(0,0,0,.25)", animation: `kf-bob 3s ease-in-out ${i * 0.2}s infinite` }} />
          ))}
        </div>
        <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "0 18px" }}>
          <div style={{ fontFamily: lore.font, fontWeight: 800, fontSize: compact ? "clamp(17px,2vw,24px)" : "clamp(22px,2.6vw,32px)", lineHeight: 0.92, color: lore.ink, letterSpacing: lore.tracking }}>
            {lore.demo}
          </div>
        </div>
        {/* real template look — static poster frame is the DEFAULT thumbnail */}
        {poster && (
          <img src={poster} alt={`${lore.name || pack.label || pack.name} preview`} loading="lazy" draggable={false}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit, zIndex: 4 }} />
        )}
        {/* hover — the pack's motion preview fades in over the poster */}
        {preview && (
          <video ref={vidRef} src={preview} poster={poster || undefined}
            muted loop playsInline preload="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit, zIndex: 5, opacity: hover ? 1 : 0, transition: "opacity .35s ease" }} />
        )}
      </div>

      {/* body */}
      <div style={{ padding: compact ? "14px 16px 16px 21px" : "20px 20px 22px 25px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: compact ? 16 : 19, margin: 0, color: "var(--color-ink)", letterSpacing: "-.01em" }}>
            {lore.name || pack.label || pack.name}
          </h3>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", color: lore.accent, whiteSpace: "nowrap" }}>{lore.tag}</span>
        </div>
        {!compact && (
          // CLAMPED TO THREE LINES so every card in a row is the same height. The vibe copy
          // is free-form and runs from one line ("Type is the hero — words fly, stack and
          // snap.") to five, and a CSS grid sizes each row to its tallest card — so one long
          // description left a visible step in the row and a band of dead white under every
          // other card beside it. Three lines is the length most of the copy already is.
          <p
            title={lore.vibe || pack.vibe}
            style={{
              color: "var(--color-dim)", fontSize: 13.5, lineHeight: 1.55, margin: "10px 0 16px",
              display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
              overflow: "hidden", minHeight: "calc(3 * 1.55em)",
            }}
          >
            {lore.vibe || pack.vibe}
          </p>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: compact ? 10 : 0 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {lore.chips.map((c, i) => (
              <span key={i} style={{ width: 16, height: 16, borderRadius: 5, background: c, border: "1px solid rgba(23,19,14,.12)" }} />
            ))}
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--color-ink)", textTransform: "uppercase" }}>
            USE STYLE →
          </span>
        </div>
      </div>
    </motion.div>
  );
}
