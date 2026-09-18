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

// Fit a media plate (screenshot / device frame) inside heroBox, in **cqw** units —
// the unit the native composers lay out in (1cqw = 1% of the container's WIDTH).
//
// WHY THIS EXISTS: composers sized their plates as `w = portrait ? 74 : 56` cqw and
// derived height as `w * someRatioMultiplier`, also in cqw. In portrait that silently
// ignores how much room there actually is: a 9:16 frame is 177.8cqw TALL, so a 74cqw
// plate holding a 16:9 desktop shot came out 44cqw high — 25% of the frame — and the
// remaining three quarters rendered as empty background. That is the "large empty
// spaces / tiny screenshot" defect, and it is arithmetic, not art direction.
//
// Fitting against BOTH caps also fixes the opposite failure: a portrait phone capture
// (ratio ~0.46) at 74cqw wide wanted 160cqw of height and overflowed its band.
//
// Returns { w, h, frameH } in cqw. `frameH` is the container's own height in cqw, so a
// caller can reason about the leftover column it needs to fill with copy.
function mediaBoxCqw(W, H, ratio) {
  const box = heroBox(W, H);
  const frameH = ((H || 16) / (W || 9)) * 100;
  const maxW = box.wFrac * 100;
  const maxH = box.hFrac * frameH;
  const r = Number(ratio) > 0 ? Number(ratio) : 1.6;
  let w = maxW, h = w / r;
  if (h > maxH) { h = maxH; w = h * r; }
  const round = (n) => Math.round(n * 100) / 100;
  return { w: round(w), h: round(h), frameH: round(frameH) };
}

// Fit a plate the composer has ALREADY art-directed a width for, in cqw.
//
// This is the 19-composer sibling of mediaBoxCqw. Those packs each pick their own
// intended width (`const pw = portrait ? "56cqw" : "34cqw"`) and derive height as
// `width * frameHmul(asset)` — width units on both axes, with nothing checking the
// result against how tall the frame actually is. Two failures follow:
//
//   • TOO SMALL in portrait. 9:16 is 177.8cqw tall, so a 56cqw plate holding a 16:9
//     capture comes out ~37cqw high — 21% of the frame, the rest empty background.
//   • OVERFLOW in portrait. The same 56cqw holding a phone capture (ratio ~0.46)
//     wants 121cqw of height and runs past its band.
//
// Rather than restyle nineteen layouts, this takes each pack's own intended width and
// applies three bounds: grow until the plate carries a real share of the column, then
// cap on width, then cap on height. LANDSCAPE IS DELIBERATELY UNTOUCHED — a 16:9 frame
// is only 56.25cqw tall, so a landscape plate already clears minHFrac and falls
// through unchanged, which keeps every pack's desktop art direction byte-identical.
//
// It takes the pack's OWN width and height and scales that pair UNIFORMLY. It does not
// re-derive height from the image's aspect ratio: `frameHmul` is a deliberate
// art-direction bucket (0.62 / 1.0 / 1.5), because the plate is a browser-mockup or
// card FRAME with the image `object-fit:cover` inside it — the frame's proportions are
// the pack's design, not the screenshot's. Scaling preserves that design exactly and
// changes only the SIZE, which is the actual defect.
//
// LANDSCAPE RETURNS UNCHANGED. A 16:9 frame is 56.25cqw tall and those layouts were
// tuned against it; the bug is specific to a 177.8cqw-tall portrait column that nobody
// measured against. Passing landscape through untouched keeps every existing desktop
// render byte-identical.
//
// `wIn`/`hIn` accept numbers or "56cqw" strings, since the composers hold them both ways.
function plateBox(W, H, wIn, hIn, opts = {}) {
  const { minHFrac = 0.34, maxWFrac = 0.9, maxHFrac = 0.52 } = opts;
  const num = (v) => (typeof v === "string" ? parseFloat(v) : Number(v));
  const w0 = num(wIn), h0 = num(hIn);
  const frameH = ((H || 16) / (W || 9)) * 100;
  const round = (n) => Math.round(n * 100) / 100;
  if (!Number.isFinite(w0) || !Number.isFinite(h0) || w0 <= 0 || h0 <= 0) {
    return { w: round(w0) || 56, h: round(h0) || 56, frameH: round(frameH), scaled: 1 };
  }
  // Portrait only — see above.
  if (aspectMode(W, H) !== "portrait") return { w: round(w0), h: round(h0), frameH: round(frameH), scaled: 1 };

  const minH = minHFrac * frameH, maxW = maxWFrac * 100, maxH = maxHFrac * frameH;
  let scale = 1;
  if (h0 * scale < minH) scale = minH / h0;              // too small for the column — grow
  if (w0 * scale > maxW) scale = maxW / w0;              // never wider than the safe column
  if (h0 * scale > maxH) scale = Math.min(scale, maxH / h0); // never taller than its band
  return { w: round(w0 * scale), h: round(h0 * scale), frameH: round(frameH), scaled: round(scale) };
}

// Fit a media plate to the ASSET'S OWN aspect ratio inside a caller-supplied box, in cqw.
//
// The third sibling of mediaBoxCqw / plateBox, and the one that fixes a defect neither can:
//
//   • mediaBoxCqw fits to the ratio correctly but only ever against ONE box — the single
//     heroBox — so a composer that lays out a hero, a side-by-side pair and a scatter has
//     no way to ask for the pair's or the scatter's bounds.
//   • plateBox deliberately preserves the PACK's frame proportions and ignores the ratio,
//     which is right for a browser-mockup frame with object-fit:cover inside it, and wrong
//     for a plate that must not crop.
//
// The failure this exists to stop: a composer sizes width from one base (a percentage of a
// stage) and height from another (a scaled custom property), so the two scale independently
// and the plate's aspect silently drifts away from the art direction — measured at 2.22 →
// 1.32 on kinetic-universe, a 68% distortion that then re-cropped the screenshot underneath.
// Returning BOTH numbers from ONE ratio makes that class of drift unrepresentable.
//
// `maxWFrac` is a fraction of the frame's WIDTH, `maxHFrac` a fraction of its HEIGHT, so a
// caller states its bounds in the terms it actually reasons about. `chromeHCqw` is device
// furniture (a browser bar, a phone bezel) that must fit INSIDE the height budget rather
// than push the plate past it. Returns { w, h, mediaH, frameH, ratio } in cqw.
function fitMediaCqw(W, H, ratio, { maxWFrac = 0.86, maxHFrac = 0.52, chromeHCqw = 0 } = {}) {
  const frameH = ((H || 16) / (W || 9)) * 100;
  const round = (n) => Math.round(n * 100) / 100;
  // An unknown ratio is a real case (assets reach composers without width/height). 1.6 is a
  // neutral landscape guess AND the plate renders object-fit:contain, so a wrong guess
  // letterboxes — it never crops. Guessing is safe; cropping would not be.
  const rr = Number(ratio) > 0 ? Number(ratio) : 1.6;
  const maxW = Math.max(1, maxWFrac * 100);
  const maxH = Math.max(1, maxHFrac * frameH);
  const chrome = Math.max(0, Number(chromeHCqw) || 0);
  let w = maxW, mediaH = w / rr;
  if (mediaH + chrome > maxH) { mediaH = Math.max(1, maxH - chrome); w = mediaH * rr; }
  return { w: round(w), h: round(mediaH + chrome), mediaH: round(mediaH), frameH: round(frameH), ratio: round(rr) };
}

module.exports = { aspectMode, isPortrait, isSquare, typeScale, safeArea, heroBox, headlineCh, mediaBoxCqw, plateBox, fitMediaCqw };
