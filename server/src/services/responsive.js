// Shared RESPONSIVE helpers for all composers. Classifies the canvas by aspect and
// provides aspect-aware type scale, safe-area insets and hero-visual bounds so a
// portrait (9:16 / 4:5) or square (1:1) render is laid out NATIVELY — a vertical stack
// with correctly-sized type and screenshots that never overflow — rather than a shrunk
// 16:9 desktop layout.
//
// Orientations the pipeline emits: horizontal(16:9), vertical(9:16), square(1:1). The
// composer receives dims {width, height}; W<H ⇒ portrait.

// landscape | square | portrait — the layout MODE a composer should switch on.
function aspectMode(W, H) {
  const r = (W || 1) / (H || 1);
  if (r >= 1.2) return "landscape";
  if (r <= 0.86) return "portrait";   // 9:16 (0.5625), 4:5 (0.8)
  return "square";                     // ~1:1
}
const isPortrait = (W, H) => aspectMode(W, H) === "portrait";
const isSquare = (W, H) => aspectMode(W, H) === "square";

// Type scale keyed on the SHORT side (the constraining dimension), NOT height — a tall
// portrait canvas must NOT make text huge. 720 short-side = 1.0. This is the single most
// important responsive fix (composers that used `height/720` blow up type in portrait).
function typeScale(W, H) { return Math.max(0.55, Math.min(W || 1, H || 1) / 720); }

// Safe-area insets as fractions of the canvas. Portrait reserves more top/bottom for
// platform chrome (Reels/TikTok/Shorts overlays). Returns {top,bottom,side} in 0..1.
function safeArea(W, H) {
  const m = aspectMode(W, H);
  if (m === "portrait") return { top: 0.10, bottom: 0.13, side: 0.05 };
  if (m === "square") return { top: 0.08, bottom: 0.10, side: 0.06 };
  return { top: 0.06, bottom: 0.08, side: 0.06 };
}

// Max on-screen bounds for the HERO visual (screenshot / device plate), as fractions of
// the canvas — never overflow. Portrait: wide but short (a vertical stack gives the
// screenshot the mid-band); landscape: the classic side panel.
function heroBox(W, H) {
  const m = aspectMode(W, H);
  if (m === "portrait") return { wFrac: 0.90, hFrac: 0.50 };
  if (m === "square") return { wFrac: 0.78, hFrac: 0.56 };
  return { wFrac: 0.56, hFrac: 0.64 };
}

// Headline max line-length (ch) for the given mode — a full-width portrait column wraps
// wider than a landscape left-column, but still caps to keep ~3 lines.
function headlineCh(W, H, centered) {
  const m = aspectMode(W, H);
  if (m === "portrait") return centered ? "15ch" : "16ch";
  if (m === "square") return centered ? "16ch" : "14ch";
  return centered ? "20ch" : "11ch";
}

module.exports = { aspectMode, isPortrait, isSquare, typeScale, safeArea, heroBox, headlineCh };
