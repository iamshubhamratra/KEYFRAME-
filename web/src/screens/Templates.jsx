import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { listFrames, mediaUrl } from "../api.js";
import { catOf, loreForPack, orderPacks } from "../packlore.js";

// Template categories by aspect ratio. Portrait 9:16 leads (the imported vertical packs).
const CATEGORIES = [
  ["portrait", "9:16 · VERTICAL", "Reels, Shorts & TikTok", "#e832a8"],
  ["horizontal", "16:9 · LANDSCAPE", "YouTube, web & keynote", "#23c8e0"],
  ["square", "1:1 · SQUARE", "Feed posts", "#b9f24a"],
  // LONG-FORM IS ITS OWN SECTION, NOT A ROW IN THE LANDSCAPE ONE.
  //
  // These are 16:9 too, so by aspect they belong above — and that is exactly the problem. A
  // five-minute template and a thirty-second one look identical on a card, and the difference is
  // the single thing a user most needs to know before picking. Merged into one scrolling list,
  // the only way to find out would be to start a job.
  ["longform", "5 MIN · LONG-FORM", "Explainers, docs & deep dives", "#f2a03c"],
];
// catOf now lives in packlore.js — the Studio picker groups by the same rule, and two copies of
// it is how one pack ends up filed under different aspects on two different pages.

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
// `longform` renders at 1920x1080 like any landscape pack, so it takes the same 16/9 frame. It
// is a separate GROUP, not a separate geometry — and the note above about matching the poster
// exactly rather than approximately applies to it identically.
const THUMB_ASPECT = { portrait: "9 / 16", square: "1 / 1", horizontal: "16 / 9", longform: "16 / 9" };
// There was a COMPACT_ASPECT = "16 / 10" here: one uniform frame for the CreateScreen picker,
// which needed it while that picker mixed every aspect in a single grid. It groups by aspect
// now, so the uniform frame has no job and a 9:16 pack is no longer shown as a strip inside a
// wide box.

// Frame packs in the v2 voice: paper page, scene pill, white cards with a
// color spine per pack. Hovering fades the pack's real motion preview in.
export default function Templates({ onUseStyle }) {
  const [packs, setPacks] = useState(null);   // null = still loading
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");

  // Settling happens in the promise callbacks, never synchronously in the effect body — the
  // latter is a cascading-render smell the linter rightly rejects.
  const load = useCallback(() => {
    listFrames()
      .then((f) => { setPacks(orderPacks(f.packs || [])); setError(null); })
      // WAS `.catch(() => setPacks(orderPacks([])))`. orderPacks([]) does not return an empty
      // list — it returns one fabricated object per name in PACK_ORDER, so a failed fetch painted
      // a full wall of nameplate-only cards with no poster, no preview and no orientation, and
      // left them there. A user could not tell a dead API from a slow one from a real catalogue.
      .catch((e) => { setPacks([]); setError(e.message || "could not reach the template library"); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const loading = packs === null;
  const all = packs || [];

  // SEARCH. 132 packs arrived in a library whose picker was designed around ~28, and the only
  // way to find one was to scroll roughly 19,000px looking at pictures. Name, label, category
  // and tags are all already on the manifest rows, so this needs no new endpoint.
  const needle = q.trim().toLowerCase();
  const list = !needle ? all : all.filter((p) => {
    const hay = [p.name, p.label, p.category, p.vibe, ...(p.tags || [])].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(needle);
  });

  // Group once: the jump bar and the sections below must agree on which aspects
  // exist and how many packs each holds.
  const groups = CATEGORIES.map((cat) => [cat, list.filter((p) => catOf(p) === cat[0])]).filter(([, g]) => g.length);

  // WHICH GROUP AM I LOOKING AT. The jump buttons were fire-and-forget: they scrolled, and then
  // told you nothing. With 132 packs across three long sections, "which aspect is this?" is the
  // question you have while scrolling, so the button for the section on screen lights up.
  const [inView, setInView] = useState(null);
  const groupKeys = groups.map(([[key]]) => key).join(",");
  useEffect(() => {
    const keys = groupKeys ? groupKeys.split(",") : [];
    if (!keys.length) return undefined;
    const obs = new IntersectionObserver((entries) => {
      const top = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setInView(top.target.id.replace("packs-", ""));
    }, { rootMargin: "-25% 0px -60% 0px" });
    for (const k of keys) {
      const el = document.getElementById(`packs-${k}`);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [groupKeys]);

  return (
    <div>
      <section style={{ padding: "clamp(20px,4vw,50px) clamp(16px,4vw,60px) clamp(24px,3vw,40px)", maxWidth: 1200, margin: "0 auto" }}>
        <span className="scene-pill" style={{ "--tagc": "#e832a8" }}>
          FRAME PACKS{loading ? "" : ` · ${all.length} STYLES`}
        </span>
        <h1 className="headline" style={{ fontSize: "clamp(38px,6vw,84px)", maxWidth: "14ch" }}>
          Pick the <span style={{ color: "var(--color-mag)" }}>look.</span><br />We art-direct the film.
        </h1>
        <p style={{ color: "var(--color-dim)", maxWidth: 560, margin: "20px 0 0", lineHeight: 1.6, fontSize: "var(--text-lg)" }}>
          Each pack is a complete design system — colors, type and motion are sacred;
          composition is free. Open any card to preview its motion language.
        </p>

        {!loading && !error && all.length > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: 10, margin: "26px 0 0", maxWidth: 560 }}>
            <span className="label-mono">SEARCH</span>
            {/* Placeholder kept short enough to actually fit the field — the longer version was
                clipped mid-word at every width below about 700px. */}
            <input value={q} onChange={(e) => setQ(e.target.value)} type="search"
              placeholder="name, category or tag"
              className="field" aria-label="Search template packs by name, category or tag"
              style={{ flex: 1, minWidth: 0, padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }} />
          </label>
        )}

        {/* Jump to a section. Portrait leads the gallery, so landscape, square and long-form all
            sit below a long scroll — these put every section one click from the top. The bar is
            built from CATEGORIES, so a new group gets its button here with no edit: adding
            long-form to that list is what put a LONG-FORM button at the top of this page. */}
        {groups.length > 1 && (
          <nav aria-label="Jump to a template section" style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "20px 0 0" }}>
            {groups.map(([[key, title, sub, accent], group]) => (
              <AspectJump key={key} target={key} title={title} sub={sub} accent={accent} count={group.length}
                // Before the observer has said anything, the first group is the one on screen.
                active={(inView ?? groups[0][0][0]) === key} />
            ))}
          </nav>
        )}

        {loading && (
          <p className="state-loading" style={{ marginTop: 26 }} role="status" aria-live="polite">LOADING THE TEMPLATE LIBRARY…</p>
        )}
        {error && (
          <div style={{ marginTop: 26 }} role="alert">
            <p className="state-error">COULD NOT LOAD THE TEMPLATE LIBRARY</p>
            <p className="break-long" style={{ color: "var(--color-dim)", margin: "8px 0 14px", fontSize: "var(--text-sm)", lineHeight: 1.55 }}>{error}</p>
            <button className="btn-chip" onClick={load}>Try again</button>
          </div>
        )}
        {!loading && !error && all.length > 0 && list.length === 0 && (
          <p className="state-empty" style={{ marginTop: 26 }}>
            Nothing matches “{q}”. <button className="link-mono" onClick={() => setQ("")}>CLEAR SEARCH</button>
          </p>
        )}
      </section>

      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 clamp(16px,4vw,60px) clamp(70px,10vw,120px)" }}>
        {groups.map(([[key, title, sub, accent], group]) => {
          return (
            <div key={key} id={`packs-${key}`} style={{ marginBottom: "clamp(40px,6vw,72px)", scrollMarginTop: 24 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", margin: "0 0 20px" }}>
                <span className="scene-pill" style={{ "--tagc": accent }}>{title}</span>
                <span style={{ color: "var(--color-dim)", fontSize: "var(--text-sm)" }}>{sub}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono)", letterSpacing: "0.14em", color: "var(--color-dim)", marginLeft: "auto" }}>{group.length} STYLES</span>
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
// THESE ARE THE PAGE'S PRIMARY FILTER, so they are built to look like it.
//
// They used to render as `.scene-pill` with an inline `background: "transparent"` that overrode
// the pill's own tint, an 11px label in 0.3em tracking and a count at 0.65 opacity — a pale
// outline that read as a caption, not a control, and gave no indication of which aspect you were
// actually looking at. Now: a solid, filled state for the group in view, a legible outline for
// the others, and the count as a real part of the label.
function AspectJump({ target, title, sub, accent, count, active }) {
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
      aria-current={active ? "true" : undefined}
      style={{
        display: "inline-flex", alignItems: "center", gap: 10,
        padding: "10px 16px", borderRadius: 999, cursor: "pointer",
        fontFamily: "var(--font-mono)", fontSize: "var(--text-mono)",
        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 500,
        // Filled when this is the group on screen — the accent is a background here, never small
        // text, so the bright dark-doc colours are used the way they were actually drawn.
        background: active ? accent : hot ? `color-mix(in srgb, ${accent} 16%, transparent)` : "transparent",
        color: active ? "#17130e" : `color-mix(in srgb, ${accent} 38%, #17130e)`,
        border: `1.5px solid ${active ? accent : `color-mix(in srgb, ${accent} 55%, transparent)`}`,
        boxShadow: active ? `0 6px 18px color-mix(in srgb, ${accent} 45%, transparent)` : "none",
        transition: "background .2s ease, transform .2s ease, box-shadow .2s ease, color .2s ease",
        transform: hot && !active ? "translateY(-1px)" : "none",
      }}
    >
      {title}
      <span style={{
        letterSpacing: "0.1em",
        padding: "2px 7px", borderRadius: 999,
        background: active ? "rgba(23,19,14,.16)" : `color-mix(in srgb, ${accent} 20%, transparent)`,
      }}>{count}</span>
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
  // BOTH pickers now group by aspect, so both can use a pack-true frame: rows stay even because
  // every card in a group is the same shape, and the preview is shown whole.
  //
  // `compact` (the Studio picker) used to force one uniform 16:10 frame because it put every
  // aspect in ONE grid — with the grid mixed, a pack-true frame would have made ragged rows, so
  // it letterboxed instead and every 9:16 pack appeared as a narrow strip floating in a wide
  // box. The Studio picker groups now, so that trade-off is gone.
  //
  // It keeps `contain` rather than `cover`: a group is single-aspect by construction, but the
  // aspect comes from pack METADATA, and a pack whose poster disagrees with its declared
  // orientation should be letterboxed, never cropped. Cropping is what beheaded the headlines.
  const aspect = THUMB_ASPECT[catOf(pack)] || THUMB_ASPECT.horizontal;
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
      // EVERY CARD WAS A DIV WITH onClick, so the entire picker — the primary way to choose a
      // look — could not be reached, focused or activated from a keyboard, and a screen reader
      // was told nothing was interactive. Focus also drives the motion preview now, so the
      // "hover to see it move" affordance is not mouse-only.
      role="button"
      tabIndex={0}
      aria-label={`Use the ${lore.name || pack.label || pack.name} template`}
      onFocus={enter}
      onBlur={leave}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); onUse?.(); }
      }}
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
        {/* The scanlines and these colour dots live at z-index 3, under the poster at z-index 4,
            so on any pack that HAS artwork nobody has ever seen them — while three dots per card
            kept running a 3s infinite keyframe animation each. Across 132 cards that was ~400
            invisible animations on the main thread. They belong to the no-artwork fallback, and
            now that is the only time they are mounted. */}
        {!poster && !preview && (
          <div style={{ position: "absolute", top: 12, left: 17, display: "flex", gap: 5, zIndex: 3 }}>
            {lore.chips.map((c, i) => (
              <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c, boxShadow: "0 1px 4px rgba(0,0,0,.25)", animation: `kf-bob 3s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </div>
        )}
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

        {/* RUNTIME — shown only where it is news.
            A pack's length has never varied before, so putting "0:30" on all 132 short cards
            would be noise on 132 cards to inform you about 27. It appears when a pack declares
            long form, which is exactly when the number changes what you would pick. */}
        {pack.form === "longform" && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8,
            padding: "3px 9px", borderRadius: 999,
            background: "rgba(242,160,60,0.14)", border: "1px solid rgba(242,160,60,0.45)",
          }}>
            <span aria-hidden="true" style={{
              width: 5, height: 5, borderRadius: 999, background: "#f2a03c", flex: "none",
            }} />
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.14em",
              color: "#c97a1e", whiteSpace: "nowrap", textTransform: "uppercase",
            }}>
              {pack.runtimeSec ? `${Math.round(pack.runtimeSec / 60)} MIN` : "LONG-FORM"}
              {pack.sceneCount ? ` · ${pack.sceneCount} SCENES` : ""}
            </span>
          </div>
        )}
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
