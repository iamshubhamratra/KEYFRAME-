import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { listFrames, mediaUrl } from "../api.js";
import { PACK_LORE, PACK_ORDER, loreFor } from "../packlore.js";

// Frame packs in the v2 voice: paper page, scene pill, white cards with a
// color spine per pack. Hovering fades the pack's real motion preview in.
// The two orientation groups, presented as side-by-side TABS rather than two
// stacked sections. Stacking buried the 9:16 packs under ~56 widescreen cards, and
// true side-by-side COLUMNS would be worse: the split is heavily lopsided, so one
// column would run for pages while the other sat nearly empty. Tabs put the two
// options next to each other while each grid still gets the full page width.
// Exported so the Create screen can present the SAME split — a merged grid there
// mixed 9:16 packs into a widescreen brief and vice versa.
export const ORIENTATIONS = [
  {
    key: "horizontal", tagc: "#e832a8", label: "Horizontal", ratio: "16:9",
    title: "Widescreen", blurb: "Landscape films for sites, product demos, YouTube and ads.",
    min: 310,
  },
  {
    key: "vertical", tagc: "#7a5cff", label: "Vertical", ratio: "9:16",
    title: "Reels & Stories", blurb: "Portrait-native packs built for Reels, Shorts, TikTok and Stories.",
    min: 230,
  },
  {
    key: "longform", tagc: "#b9f24a", label: "Long Form Video", ratio: "16:9",
    title: "Long Form", blurb: "Packs authored for 2–5 minute films — dozens of distinct beats, built to hold attention past the 30-second mark.",
    min: 310,
  },
];

// Split a pack list by NATIVE aspect. A pack belongs to Vertical only when its
// own art is 9:16 (`portrait`, derived in /api/frames from the poster's
// dimensions). Every pack can RENDER 9:16, but listing them all as vertical puts
// landscape art inside portrait cards — the exact mixed-aspect problem the split
// exists to fix. A pack becomes vertical by shipping vertical art.
// LONG FORM is its own shelf, not an aspect: a 50-beat pack listed inside the
// Horizontal grid reads as just another 30s template, underselling exactly what
// it is for — so long-form packs leave the aspect groups entirely.
export function splitByOrientation(list) {
  return {
    horizontal: list.filter((p) => !p.portrait && !p.longForm),
    vertical: list.filter((p) => p.portrait && !p.longForm),
    longform: list.filter((p) => !!p.longForm),
  };
}

export default function Templates({ onUseStyle }) {
  const [packs, setPacks] = useState(null);
  const [tab, setTab] = useState("horizontal");

  useEffect(() => {
    listFrames()
      .then((f) => setPacks(orderPacks(f.packs || [])))
      .catch(() => setPacks(orderPacks([])));
  }, []);

  const list = packs || orderPacks([]);
  const groups = splitByOrientation(list);
  // Never strand the user on an empty tab (e.g. a deploy with no portrait packs).
  const activeKey = groups[tab]?.length ? tab : "horizontal";
  const active = ORIENTATIONS.find((o) => o.key === activeKey) || ORIENTATIONS[0];
  const shown = groups[activeKey] || [];

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
      </section>

      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 clamp(16px,4vw,60px) clamp(70px,10vw,120px)" }}>
        <div role="tablist" aria-label="Template orientation"
          style={{ display: "flex", gap: 10, flexWrap: "wrap", borderTop: "1px solid rgba(23,19,14,.10)", paddingTop: 22, margin: "0 0 20px" }}>
          {ORIENTATIONS.map((o) => (
            <OrientationTab key={o.key} o={o} count={groups[o.key].length}
              selected={o.key === activeKey} onSelect={() => setTab(o.key)} />
          ))}
        </div>

        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(24px,3.4vw,40px)", margin: "0", color: "var(--color-ink)", letterSpacing: "-.02em" }}>
          {active.title}
        </h2>
        <p style={{ color: "var(--color-dim)", maxWidth: 520, margin: "8px 0 22px", lineHeight: 1.55, fontSize: 14.5 }}>{active.blurb}</p>

        {/* keyed on the tab so switching re-runs the card entrance animation */}
        <motion.div key={activeKey}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: "easeOut" }}
          id={`panel-${activeKey}`} role="tabpanel" aria-labelledby={`tab-${activeKey}`}
          style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${active.min}px,1fr))`, gap: 18 }}>
          {shown.map((p, i) => (
            <PackCard key={p.name} pack={p} portrait={activeKey === "vertical"}
              delay={(i % 3) * 0.07} onUse={() => onUseStyle?.(p.name)} />
          ))}
        </motion.div>
      </section>
    </div>
  );
}

// One orientation tab: the pack's scene-pill voice, filled when selected. Carries
// its own count so the choice is informed before switching.
export function OrientationTab({ o, count, selected, onSelect }) {
  return (
    <button type="button" role="tab" id={`tab-${o.key}`}
      aria-selected={selected} aria-controls={`panel-${o.key}`}
      onClick={onSelect}
      style={{
        cursor: "pointer", font: "inherit", display: "inline-flex", alignItems: "center", gap: 10,
        padding: "10px 16px", borderRadius: 999,
        border: `1px solid ${selected ? o.tagc : "rgba(23,19,14,.16)"}`,
        background: selected ? o.tagc : "transparent",
        color: selected ? "#fff" : "var(--color-ink)",
        transition: "background .18s ease, border-color .18s ease, color .18s ease",
      }}>
      {/* a literal aspect swatch, so the shape reads before the words do */}
      <span aria-hidden="true" style={{
        display: "block", width: o.key === "vertical" ? 9 : 16, height: o.key === "vertical" ? 16 : 9,
        borderRadius: 2, border: `1.5px solid ${selected ? "#fff" : o.tagc}`, flex: "none",
      }} />
      <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: ".01em" }}>{o.label}</span>
      <span style={{ fontSize: 12.5, opacity: selected ? 0.85 : 0.55, letterSpacing: ".06em" }}>{o.ratio} · {count}</span>
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
export function PackCard({ pack, delay = 0, onUse, compact = false, portrait = false }) {
  const lore = loreFor(pack.name);
  const vidRef = useRef(null);
  const [hover, setHover] = useState(false);
  const [posterOk, setPosterOk] = useState(true);
  const preview = pack.previewUrl ? mediaUrl(pack.previewUrl) : null;
  // The pack's real first frame. Shown AT REST (not just as the hidden video's
  // poster attribute) — the card used to sit on a synthetic gradient + fake
  // headline until you happened to hover it, so the grid read as "no previews".
  const poster = posterOk && pack.posterUrl ? mediaUrl(pack.posterUrl) : null;

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

      {/* preview — the pack's own poster frame at rest, its clip on hover.
          Aspect follows the pack's native clip: 16/9 for widescreen packs
          (matches the clip exactly — the old 16/10 box cropped ~11% off the
          sides, hiding corner furniture), 9/16 for the portrait reel/story
          packs so their tall clips play uncropped. Packs with no rendered
          poster fall back to the designed synthetic card (gradient + chip dots
          + demo type), so a card is never blank. */}
      <div style={{ aspectRatio: portrait ? "9/16" : "16/9", position: "relative", overflow: "hidden", background: lore.bg, display: "grid", placeItems: "center" }}>
        {poster ? (
          <>
            <img src={poster} alt="" aria-hidden="true" loading="lazy" decoding="async"
              onError={() => setPosterOk(false)}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 1 }} />
            <div className="film-scan" style={{ opacity: 0.28, zIndex: 2 }} />
          </>
        ) : (
          <>
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
          </>
        )}
        {preview && (
          /* preload="metadata" (not "none") keeps the first frames warm so the
             hover fade-in starts playing immediately instead of buffering. */
          <video ref={vidRef} src={preview} poster={poster || undefined}
            muted loop playsInline preload="metadata"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 4, opacity: hover ? 1 : 0, transition: "opacity .35s ease" }} />
        )}
        {/* PLAY affordance — the clip is hover-only, so say so on the card
            instead of leaving the motion preview undiscoverable. */}
        {preview && (
          <span aria-hidden="true"
            style={{
              position: "absolute", right: 10, bottom: 10, zIndex: 6, display: "inline-flex", alignItems: "center", gap: 5,
              padding: "4px 8px", borderRadius: 999, background: "rgba(9,7,5,.62)", backdropFilter: "blur(4px)",
              fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: ".14em", color: "#f2ede2",
              opacity: hover ? 0 : 1, transition: "opacity .25s ease", pointerEvents: "none",
            }}>
            <span style={{ width: 0, height: 0, borderLeft: "5px solid #f2ede2", borderTop: "3.5px solid transparent", borderBottom: "3.5px solid transparent" }} />
            HOVER
          </span>
        )}
      </div>

      {/* body */}
      <div style={{ padding: compact ? "14px 16px 16px 21px" : "20px 20px 22px 25px" }}>
        {/* minWidth:0 + ellipsis on the tag: portrait cards are narrow, and a
            long pack name used to push the tag past the card's right edge. */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: compact ? 16 : 19, margin: 0, minWidth: 0, color: "var(--color-ink)", letterSpacing: "-.01em" }}>
            {lore.name || pack.label || pack.name}
          </h3>
          <span title={lore.tag} style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", color: lore.accent, whiteSpace: "nowrap", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{lore.tag}</span>
        </div>
        {!compact && (
          <p style={{ color: "var(--color-dim)", fontSize: 13.5, lineHeight: 1.55, margin: "10px 0 16px" }}>
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
