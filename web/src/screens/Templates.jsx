import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { listFrames, mediaUrl } from "../api.js";
import { PACK_LORE, PACK_ORDER, loreFor, loreForPack, orderPacks, isNewPack } from "../packlore.js";

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

  // THE BADGE SHOULD NOT REPEAT WHAT THE SECTION HEADING ALREADY SAYS. The gallery groups
  // packs by aspect under a heading that reads "9:16 · VERTICAL — Reels, Shorts & TikTok",
  // and then every card underneath it repeated "· 9:16" in its badge. That duplication is
  // not free: it is ~6 characters of a `nowrap` element competing with the pack name for a
  // ~240px row, and it is what pushed names onto a second line. Dropped here, so a badge
  // reads "COLOUR BLOCK" under a heading that already established the shape.
  //
  // The COMPACT picker keeps it: that grid deliberately mixes every aspect together (see
  // the aspect/fit note above), so there is no heading to inherit the shape from and the
  // badge is the only thing telling you a pack is vertical.
  const displayTag = compact
    ? lore.tag
    : String(lore.tag || "").replace(/\s*[·|]\s*(9\s*:\s*16|16\s*:\s*9|1\s*:\s*1)\s*$/i, "").trim() || lore.tag;

  // A NAME, NOT A NAME PLUS ITS TAGLINE. A few packs carry their whole pitch in `label` —
  // "Flagship — Cinematic Three.js launch film (the benchmark)" is 526px of h3 in a 267px
  // row — so the card showed a sentence trailing into an ellipsis where every other card
  // showed a name. The tagline is not lost: the vibe copy directly underneath is the same
  // description at greater length. Split on an em/en dash only, so hyphenated names
  // ("Rind & Wheel", "Front-and-Isobar") are untouched.
  const rawName = lore.name || pack.label || pack.name;
  const displayName = String(rawName).split(/\s+[—–]\s+/)[0].trim() || rawName;

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
          bg / gradient / demo-type below is only a FALLBACK for a pack that has no poster.

          THAT USED TO BE A LIE IN THE PICKER, and it is what made every Studio card look
          broken. The old comment reasoned "when a poster exists it fully covers them
          (zIndex 4)" — true for `cover`, false for `contain`, and the compact picker is
          deliberately `contain` (see the aspect/fit note above) so a 9:16 pack is
          letterboxed rather than cropped to a sliver. Letterboxed means the poster covers
          the MIDDLE of the frame and nothing else, so the fallback layer stayed visible down
          both sides — and since loreForPack falls back to `demo: pack.label || pack.name`
          (packlore.js:305), the text showing through was the pack's OWN NAME, bisected by
          its own poster: "Pu—— k", "Hiv——ney", "O——ve".

          So the fallback now renders only when it is genuinely a fallback. */}
      <div style={{ aspectRatio: aspect, position: "relative", overflow: "hidden", background: lore.bg, display: "grid", placeItems: "center" }}>
        {/* LETTERBOX GROUND. With `contain` the poster cannot fill the frame, so something
            has to sit behind it. A blurred, over-scaled copy of the poster itself beats the
            synthetic gradient: the surround is drawn from the template's real colours, so a
            9:16 pack reads as presented-in-frame rather than pasted onto an unrelated field.
            Falls back to the lore gradient when there is no poster to blur. */}
        {poster && fit === "contain" ? (
          <div aria-hidden="true" style={{
            position: "absolute", inset: 0, zIndex: 1,
            backgroundImage: `url(${poster})`, backgroundSize: "cover", backgroundPosition: "center",
            filter: "blur(22px) saturate(1.25) brightness(0.82)",
            // Over-scale so the blur's soft edges never reveal the card behind it.
            transform: "scale(1.18)",
          }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: lore.grad, opacity: 0.9 }} />
        )}
        <div className="film-scan" style={{ opacity: 0.5 }} />
        <div style={{ position: "absolute", top: 12, left: 17, display: "flex", gap: 5, zIndex: 3 }}>
          {lore.chips.map((c, i) => (
            <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c, boxShadow: "0 1px 4px rgba(0,0,0,.25)", animation: `kf-bob 3s ease-in-out ${i * 0.2}s infinite` }} />
          ))}
        </div>
        {/* The synthetic wordmark — ONLY when no real artwork exists to show instead. */}
        {!poster && !preview && (
          <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "0 18px" }}>
            <div style={{ fontFamily: lore.font, fontWeight: 800, fontSize: compact ? "clamp(17px,2vw,24px)" : "clamp(22px,2.6vw,32px)", lineHeight: 0.92, color: lore.ink, letterSpacing: lore.tracking }}>
              {lore.demo}
            </div>
          </div>
        )}
        {/* real template look — static poster frame is the DEFAULT thumbnail */}
        {poster && (
          <img src={poster} alt={`${lore.name || pack.label || pack.name} preview`} loading="lazy" draggable={false}
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit, zIndex: 4,
              // A contained poster is a picture sitting on a ground, so give it an edge —
              // without it the blurred backdrop bleeds into the artwork and both look soft.
              ...(fit === "contain" ? { filter: "drop-shadow(0 2px 10px rgba(0,0,0,.34))" } : null),
            }} />
        )}
        {/* hover — the pack's motion preview fades in over the poster. It shares the poster's
            fit and drop-shadow so the card does not visibly change shape on hover: the video
            simply replaces the still inside the same letterbox. */}
        {preview && (
          <video ref={vidRef} src={preview} poster={poster || undefined}
            muted loop playsInline preload="none"
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit, zIndex: 5,
              opacity: hover ? 1 : 0, transition: "opacity .35s ease",
              ...(fit === "contain" ? { filter: "drop-shadow(0 2px 10px rgba(0,0,0,.34))" } : null),
            }} />
        )}
      </div>

      {/* body */}
      <div style={{ padding: compact ? "14px 16px 16px 21px" : "20px 20px 22px 25px" }}>
        {/* TITLE ROW — the name owns the line; the badge takes what is left.
            It used to be a plain space-between flex with a `nowrap` badge and an
            unconstrained h3, which meant the BADGE won every width contest and the name
            wrapped to a second line. Whether it wrapped depended on the two strings adding
            up, not on the name's own length, so the grid came out ragged in a way that
            looked arbitrary: "Slab Stage" (10 chars) sat on one line while "Hype Wave"
            (9) broke in half, purely because ELECTRIC is a character longer than KINETIC.
            A wrapped name also pushed that card's vibe copy out of alignment with its
            neighbours, which is the whole reason the copy below is line-clamped. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h3
            title={rawName}
            style={{
              fontFamily: "var(--font-display)", fontWeight: 700, fontSize: compact ? 16 : 19,
              margin: 0, color: "var(--color-ink)", letterSpacing: "-.01em",
              // Takes the free space and keeps one line. minWidth:0 is what actually lets a
              // flex child shrink far enough to ellipsis instead of forcing the row wider.
              // flexShrink 1 against the badge's 6 means the BADGE gives up width first —
              // several names missed by two to twenty pixels, and truncating "Rind & Wheel"
              // to save 2px is worse than the wrap this replaced.
              flex: "1 1 auto", minWidth: 0, flexShrink: 1,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
          >
            {displayName}
          </h3>
          <span
            title={displayTag !== lore.tag ? lore.tag : undefined}
            style={{
              fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em",
              color: lore.accent, whiteSpace: "nowrap",
              // Yields to the name, but never vanishes entirely.
              flex: "0 1 auto", flexShrink: 6, minWidth: "3.5em",
              overflow: "hidden", textOverflow: "ellipsis",
            }}
          >{displayTag}</span>
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
