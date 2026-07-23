import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { API_BASE, mediaUrl } from "../api.js";
import { GALLERY_FILTERS, WALL_SEEDS, loreFor, fmtDur } from "../packlore.js";

const CHIP_COLORS = ["#f2ede2", "#e832a8", "#23c8e0", "#ffb03a", "#b9f24a", "#2b5bff", "#ff7aa8", "#ff6a3c"];

// The v2 video wall, as the app's gallery: dark stage, scene pill,
// "Fresh off the render farm." — real films render as wall cards
// (hover-scrub video, click → premiere); v2's seed wall fills in
// while none exist.
export default function Gallery({ onOpen, onUseStyle }) {
  const [projects, setProjects] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    // limit=100 (server default is 30): with lots of test/failed generations in
    // between, a real finished film can rank outside the top 30 by recency even
    // though it's one of the few that actually has a video — cast a wider net so
    // every playable film surfaces here, not just the most recent handful.
    fetch(`${API_BASE}/api/projects?limit=100`)
      .then((r) => r.json())
      .then((d) => setProjects((d.projects || []).filter((p) => p.videoUrl)))
      .catch(() => setProjects([]));
  }, []);

  const films = useMemo(() => {
    const real = (projects || []).map((p) => {
      const lore = loreFor(p.framePack);
      return {
        key: p.jobId, real: true, title: p.title || "Untitled film",
        pack: p.framePack || "auto", cat: (lore.tag || "FILM"),
        dur: fmtDur(p.duration), views: null, drift: "8s",
        grad: lore.filmGrad, videoUrl: p.videoUrl, orientation: p.orientation,
        onClick: () => onOpen?.(p.jobId),
      };
    });
    const seeds = WALL_SEEDS.map((f, i) => ({
      key: `seed-${i}`, real: false, ...f,
      onClick: () => onUseStyle?.(f.pack),
    }));
    const all = real.length ? real : seeds;
    return filter === "all" ? all : all.filter((f) => f.pack === filter);
  }, [projects, filter, onOpen, onUseStyle]);

  return (
    <div style={{ background: "var(--color-dark-2)", marginTop: -90, paddingTop: 90 }}>
      <section style={{ maxWidth: 1400, margin: "0 auto", padding: "clamp(30px,5vw,70px) clamp(12px,2vw,28px) clamp(60px,9vw,110px)" }}>
        <div style={{ padding: "0 clamp(4px,2vw,32px)", display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
          <div>
            <span className="scene-pill" style={{ "--tagc": "#23c8e0" }}>THE GALLERY · TONIGHT'S PREMIERES</span>
            <h1 className="headline on-dark" style={{ fontSize: "clamp(34px,5.4vw,72px)" }}>
              Fresh off the <span style={{ color: "var(--color-mag)" }}>render farm.</span>
            </h1>
          </div>
        </div>

        {/* filters — v2 colored mono chips */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 26, padding: "0 clamp(4px,2vw,32px)" }}>
          {GALLERY_FILTERS.map(([key, label], i) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`chip-c ${filter === key ? "is-active" : ""}`}
              style={{ "--chipc": CHIP_COLORS[i % CHIP_COLORS.length] }}>
              {label}
            </button>
          ))}
        </div>

        {films.length === 0 ? (
          <p style={{ marginTop: 40, padding: "0 clamp(4px,2vw,32px)", fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.1em", color: "var(--color-dark-dim)" }}>
            NOTHING IN THIS STYLE YET — PICK IT ON THE TEMPLATES PAGE AND ROLL ONE.
          </p>
        ) : (
          <div style={{ marginTop: 36, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(330px,100%), 1fr))", gap: 14, alignItems: "start" }}>
            {films.map((f, i) => <WallCard key={f.key} film={f} delay={(i % 3) * 0.06} />)}
          </div>
        )}
      </section>
    </div>
  );
}

// One wall card — the exact v2 SCENE 05 anatomy.
function WallCard({ film, delay = 0 }) {
  const vidRef = useRef(null);
  // A rendered film's .mp4 can be reaped by the janitor after the DB row still
  // advertises it. If the <video> fails to load, degrade to the pack gradient
  // (same visual as a seed card) instead of a black box + repeated 404 errors.
  const [videoDead, setVideoDead] = useState(false);
  const showVideo = film.real && film.videoUrl && !videoDead;
  // Each card takes its film's real shape so 9:16 and 1:1 films aren't cropped
  // into a 16:9 slot (grid uses align-items:start, so mixed shapes sit cleanly).
  const cardAspect = film.orientation === "vertical" ? "9 / 16"
    : film.orientation === "square" ? "1 / 1"
    : "16 / 9.4";

  return (
    <motion.div
      initial={{ opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay }}
      whileHover={{ scale: 1.025, zIndex: 2, boxShadow: "0 26px 60px rgba(0,0,0,.6), 0 0 0 1px rgba(242,237,226,.2)" }}
      onClick={film.onClick}
      onMouseEnter={() => { const v = vidRef.current; if (v) v.play().catch(() => {}); }}
      onMouseLeave={() => { const v = vidRef.current; if (v) { v.pause(); v.currentTime = 0; } }}
      style={{ position: "relative", borderRadius: 16, overflow: "hidden", aspectRatio: cardAspect, cursor: "pointer", background: "#17130e" }}
    >
      {showVideo ? (
        <video ref={vidRef} src={mediaUrl(film.videoUrl)}
          poster={mediaUrl(String(film.videoUrl).replace(/\.mp4$/, ".jpg"))}
          muted loop playsInline preload="metadata"
          onError={() => setVideoDead(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, background: film.grad, backgroundSize: "190% 190%", animation: `kf2-drift ${film.drift || "8s"} linear infinite` }} />
      )}
      <div className="film-scan" />
      <div className="wall-shade" />
      <div className="cat-chip" style={{ position: "absolute", top: 12, left: 14 }}>{film.cat}</div>
      <div style={{ position: "absolute", top: 12, right: 14, fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(255,255,255,.85)" }}>{film.dur}</div>
      <div className="play-glass" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)" }} />
      <div style={{ position: "absolute", left: 14, right: 14, bottom: 12, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(16px,1.6vw,20px)", color: "#fff", margin: 0, lineHeight: 1.15, letterSpacing: "-.01em" }}>
          {film.title}
        </h3>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(255,255,255,.8)", whiteSpace: "nowrap" }}>
          {film.views ? `▶ ${film.views}` : `▶ ${loreFor(film.pack).name || film.pack}`}
        </span>
      </div>
    </motion.div>
  );
}
