import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { listLongformFilms } from "../api.js";

// THE TEN LONG-FORM REFERENCE FILMS — a viewing room, deliberately NOT a picker.
//
// Every other card in this product starts a job. These do not, and that difference has to be
// visible before the click rather than discovered after it:
//
//   · nine of the ten still carry their copy hardcoded in the JSX, so a generated job would
//     publish the demo brand's words. Only 01 Pet Story is wired to the content contract.
//   · they are not frame packs. They have no pack.json and no composer the production graph can
//     call, so nothing downstream could render one to MP4 even if it were offered.
//
// So the card opens the film and plays it, and the page says plainly what these are. When 02-10 are
// wired and a composer adapter exists, this screen is where a "use this" action would belong; until
// then offering one would be a lie with a five-minute render attached.
//
// The films are iframed at their authored 1920x1080 and scaled with a transform, never resized: the
// layouts are composed for that frame, the stage measures itself against the viewport it is given,
// and letting the iframe reflow is how you get a film that is subtly not the one in the poster.

const FRAME_W = 1920;
const FRAME_H = 1080;
// The stage sits above a playback bar and shrinks itself to fit its viewport, so the iframe has to
// be taller than the film or the 1920x1080 design renders at 1842x1036. Measured, not guessed.
const FRAME_CHROME = 60;

export default function LongformFilms() {
  const [films, setFilms] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let alive = true;
    listLongformFilms()
      .then((d) => { if (alive) setFilms(d.templates || []); })
      .catch((e) => { if (alive) setError(e.message || String(e)); });
    return () => { alive = false; };
  }, []);

  // Escape closes the viewer. Without this the only way out of a full-bleed film is the browser
  // back button, which leaves the app.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = useCallback(() => setOpen(null), []);

  return (
    <div style={{ padding: "clamp(24px,5vw,64px) clamp(16px,4vw,60px) 90px", maxWidth: 1400, margin: "0 auto" }}>
      <span className="scene-pill" style={{ "--tagc": "#f2a03c" }}>5 MIN · 16:9 · REFERENCE FILMS</span>
      <h1 className="headline" style={{ fontSize: "clamp(34px,5.4vw,72px)", maxWidth: "18ch", marginTop: 14 }}>
        Ten long-form films, running.
      </h1>
      <p style={{ color: "var(--color-dim)", maxWidth: "62ch", marginTop: 16, lineHeight: 1.65 }}>
        Each runs five minutes exactly at 1920&times;1080, on its own palette, transition language and
        camera set. Open one and it plays here at full size. These are reference implementations for
        the design system — they are not yet selectable for generation, because nine of the ten still
        carry their copy in the film rather than taking it from a script.
      </p>

      {error && (
        <div className="state-error" style={{ marginTop: 28 }}>
          Could not load the film library: {error}
        </div>
      )}

      {!films && !error && <div className="state-loading" style={{ marginTop: 28 }}>Loading films…</div>}

      {films && (
        <div style={{ marginTop: 34, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px,1fr))", gap: 20 }}>
          {films.map((f, i) => (
            <FilmCard key={f.id} film={f} index={i} onOpen={() => setOpen(f)} />
          ))}
        </div>
      )}

      {open && <Viewer film={open} onClose={close} />}
    </div>
  );
}

function FilmCard({ film, index, onOpen }) {
  const mins = Math.floor(film.durationSec / 60);
  const secs = String(Math.round(film.durationSec % 60)).padStart(2, "0");
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      className="card card-lift card-button"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: Math.min(index * 0.035, 0.3), ease: [0.16, 1, 0.3, 1] }}
      style={{ textAlign: "left", padding: 0, overflow: "hidden", cursor: "pointer", width: "100%" }}
      aria-label={`Play ${film.title}`}
    >
      <div style={{ aspectRatio: "16 / 9", background: "rgba(23,19,14,.06)", position: "relative", overflow: "hidden" }}>
        {film.posterUrl ? (
          <img src={film.posterUrl} alt="" loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          // A poster is generated media, so a checkout that has not run the script gets this rather
          // than a broken image icon.
          <span className="label-mono" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--color-dim)" }}>
            NO POSTER RENDERED
          </span>
        )}
        <span className="timecode" style={{ position: "absolute", right: 10, bottom: 10, background: "rgba(13,11,7,.78)", color: "#f2ede2", padding: "3px 8px", borderRadius: 6 }}>
          {mins}:{secs}
        </span>
      </div>
      <div style={{ padding: "14px 16px 16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 19, color: "var(--color-ink)" }}>{film.title}</span>
          <span className="label-mono" style={{ color: "var(--color-dim)" }}>{film.sceneCount} SCENES</span>
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {/* The one distinction that changes what a host can do with the film. */}
          {film.hasContent
            ? <span className="chip" style={{ color: "#2c6e52" }}>content contract</span>
            : <span className="chip" style={{ color: "var(--color-dim)" }}>copy hardcoded</span>}
        </div>
      </div>
    </motion.button>
  );
}

function Viewer({ film, onClose }) {
  // Scale to fit BOTH axes of the space actually available, so the film is never cropped and never
  // forces the page to scroll sideways.
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const fit = () => {
      const w = Math.min(window.innerWidth - 48, 1600);
      const h = window.innerHeight - 210;
      setScale(Math.max(0.2, Math.min(w / FRAME_W, h / FRAME_H)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      transition={{ duration: 0.22 }}
      role="dialog" aria-modal="true" aria-label={`${film.title} — playing`}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(13,11,7,.93)", backdropFilter: "blur(6px)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 14, color: "#f2ede2", width: FRAME_W * scale, maxWidth: "100%" }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20 }}>{film.title}</span>
        <span className="label-mono" style={{ color: "rgba(242,237,226,.6)" }}>
          {film.sceneCount} SCENES · {Math.round(film.durationSec)}s · 1920&times;1080
        </span>
        <button onClick={onClose} className="label-mono"
          style={{ marginLeft: "auto", color: "rgba(242,237,226,.75)", cursor: "pointer" }}>CLOSE ✕</button>
      </div>

      {/* Stop the click on the film itself from closing the dialog. */}
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: FRAME_W * scale, height: FRAME_H * scale, maxWidth: "100%", position: "relative",
          boxShadow: "0 30px 90px rgba(0,0,0,.5)", background: "#000", overflow: "hidden" }}>
        <iframe
          key={film.id}
          title={film.title}
          src={film.url}
          style={{ width: FRAME_W, height: FRAME_H + FRAME_CHROME, border: 0, display: "block",
            transform: `scale(${scale})`, transformOrigin: "top left" }}
        />
      </div>

      <p className="label-mono" style={{ marginTop: 14, color: "rgba(242,237,226,.5)", textAlign: "center" }}>
        SPACE TO PLAY · ← → TO SEEK · ESC TO CLOSE
      </p>
    </motion.div>
  );
}
