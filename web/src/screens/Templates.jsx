import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { listFrames, mediaUrl } from "../api.js";
import { PACK_LORE, PACK_ORDER, loreFor } from "../packlore.js";

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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px,1fr))", gap: 18 }}>
          {list.map((p, i) => (
            <PackCard key={p.name} pack={p} delay={(i % 3) * 0.07} onUse={() => onUseStyle?.(p.name)} />
          ))}
        </div>
      </section>
    </div>
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
  const lore = loreFor(pack.name);
  const vidRef = useRef(null);
  const [hover, setHover] = useState(false);
  const preview = pack.previewUrl ? mediaUrl(pack.previewUrl) : null;
  const poster = pack.posterUrl ? mediaUrl(pack.posterUrl) : null;

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
      <div style={{ aspectRatio: "16/10", position: "relative", overflow: "hidden", background: lore.bg, display: "grid", placeItems: "center" }}>
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
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 4 }} />
        )}
        {/* hover — the pack's motion preview fades in over the poster */}
        {preview && (
          <video ref={vidRef} src={preview} poster={poster || undefined}
            muted loop playsInline preload="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 5, opacity: hover ? 1 : 0, transition: "opacity .35s ease" }} />
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
