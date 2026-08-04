// Deterministic placeholder imagery for the per-pack dev harnesses.
//
// WHY THIS EXISTS. The harnesses staged a 1x1 transparent PNG for every asset and let the
// declared width/height carry the geometry. That validates FRAMING (which device a ratio
// routes to, how big the slot is, where the scroll tween travels) but renders nothing —
// so a browser mockup came out as empty tint, a logo plate as a blank white box, and no
// frame could ever show whether a capture was cropped, letterboxed, or panned to the
// right place. Every one of those is a real defect class in these packs.
//
// These images are drawn to make exactly those failures visible:
//   • four distinctly-coloured CORNER MARKERS — a missing corner means the slot cropped.
//   • a full-bleed 1px BORDER — a missing edge means the same.
//   • numbered BANDS down the page — the visible number tells you where a scrolling
//     capture is parked, so the in-frame pan can be read off a single frame.
//   • real page/app FURNITURE (nav, hero, rows, footer) so `contain` vs `cover` and the
//     "did it keep the header" question are answerable by eye.
//
// No dependencies and no network: a small PNG encoder over zlib, so a harness stays
// runnable offline and byte-identical between runs (nothing here is random or clocked).

const zlib = require("node:zlib");
const fs = require("node:fs");
const path = require("node:path");

// ---- PNG encoding ------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
// channels: 3 = RGB (colour type 2), 4 = RGBA (colour type 6)
function encodePng(width, height, channels, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;                              // bit depth
  ihdr[9] = channels === 4 ? 6 : 2;         // colour type
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // deflate / adaptive filter / no interlace
  // Each scanline is prefixed with filter byte 0 (None) — these are flat colour blocks,
  // so deflate already collapses them and a smarter filter would buy nothing.
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- tiny raster surface -----------------------------------------------------
const hex = (h) => {
  const s = String(h).replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};

// 5x7 digit bitmaps — enough to number the bands, which is the only text these images
// need. Scaled up as solid blocks, so they stay legible in a thumbnail.
const GLYPHS = {
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
};

function surface(w, h, channels, bg) {
  const px = Buffer.alloc(w * h * channels);
  const put = (x, y, c, a) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * channels;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
    if (channels === 4) px[i + 3] = a == null ? 255 : a;
  };
  const api = {
    w, h,
    rect(x, y, rw, rh, colour, alpha) {
      const c = hex(colour);
      const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
      const x1 = Math.min(w, Math.round(x + rw)), y1 = Math.min(h, Math.round(y + rh));
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) put(xx, yy, c, alpha);
      return api;
    },
    digit(d, x, y, scale, colour) {
      const g = GLYPHS[String(d)];
      if (!g) return api;
      for (let r = 0; r < 7; r++) {
        for (let col = 0; col < 5; col++) {
          if (g[r][col] === "1") api.rect(x + col * scale, y + r * scale, scale, scale, colour);
        }
      }
      return api;
    },
    number(n, x, y, scale, colour) {
      const s = String(n);
      for (let i = 0; i < s.length; i++) api.digit(s[i], x + i * scale * 6, y, scale, colour);
      return api;
    },
    // The crop tell-tales: one distinct square per corner plus a hairline frame. If a
    // rendered slot is missing any of them, that edge was cropped away.
    markers(inset, size, thick) {
      const C = ["#FF0000", "#00A0FF", "#00C853", "#FFD400"];
      api.rect(inset, inset, size, size, C[0]);
      api.rect(w - inset - size, inset, size, size, C[1]);
      api.rect(inset, h - inset - size, size, size, C[2]);
      api.rect(w - inset - size, h - inset - size, size, size, C[3]);
      api.rect(0, 0, w, thick, "#111111");
      api.rect(0, h - thick, w, thick, "#111111");
      api.rect(0, 0, thick, h, "#111111");
      api.rect(w - thick, 0, thick, h, "#111111");
      return api;
    },
    toPng() { return encodePng(w, h, channels, px); },
  };
  if (bg) api.rect(0, 0, w, h, bg);
  return api;
}

const BAND_TINTS = ["#E8EEF7", "#FBE9E4", "#E6F6EE", "#FCF3DC", "#EDE7F8", "#E2F2F7"];

// ---- the four shapes a pack actually has to place -----------------------------

// A full-page DESKTOP capture: what headless Chrome hands the pipeline. Deliberately
// tall, so the in-frame scroll has somewhere to travel and the numbered bands report
// where it is parked.
// `debug` draws the affordances that make CROP failures visible — corner markers, a full-bleed
// border, and a numeral per band telling you where a scrolling capture is parked. They exist
// for the dev harnesses. The GALLERY previews pass debug:false: a customer-facing thumbnail
// showing numbered debug bands reads as broken output, not as a design.
function sitePage(w, h, { debug = true } = {}) {
  const s = surface(w, h, 3, "#FFFFFF");
  const u = w / 100;
  s.rect(0, 0, w, u * 7, "#12100E");                       // top nav
  for (let i = 0; i < 3; i++) s.rect(u * 3 + i * u * 2.6, u * 2.6, u * 1.6, u * 1.6, ["#FF5F57", "#FEBC2E", "#28C840"][i]);
  s.rect(u * 14, u * 2.4, u * 16, u * 2.2, "#FFFFFF");     // wordmark
  for (let i = 0; i < 4; i++) s.rect(w - u * (36 - i * 9), u * 2.6, u * 6.5, u * 1.8, "#7A7A7A");
  s.rect(0, u * 7, w, u * 26, "#1B4DFF");                  // hero
  s.rect(u * 8, u * 14, w * 0.52, u * 5.5, "#FFFFFF");
  s.rect(u * 8, u * 21, w * 0.38, u * 2.6, "#BBD0FF");
  s.rect(u * 8, u * 26, u * 22, u * 5, "#FFD23F");         // hero button
  const bandTop = u * 33, bandH = (h - bandTop - u * 10) / 6;
  for (let i = 0; i < 6; i++) {                            // numbered sections
    const y = bandTop + i * bandH;
    s.rect(0, y, w, bandH - u * 1.2, BAND_TINTS[i % BAND_TINTS.length]);
    if (debug) s.number(i + 1, u * 8, y + bandH * 0.28, Math.max(3, Math.round(u * 2.6)), "#12100E");
    else s.rect(u * 8, y + bandH * 0.28, u * 7, u * 7, "#1B4DFF");   // an icon, not an index
    s.rect(u * 30, y + bandH * 0.30, w * 0.45, u * 2.4, "#12100E");
    s.rect(u * 30, y + bandH * 0.30 + u * 4, w * 0.32, u * 1.8, "#8A8A8A");
    for (let c = 0; c < 3; c++) s.rect(u * 30 + c * (w * 0.16 + u * 2), y + bandH * 0.52, w * 0.16, bandH * 0.30, "#FFFFFF");
  }
  s.rect(0, h - u * 10, w, u * 10, "#12100E");             // footer
  if (debug) s.markers(Math.round(u * 1.4), Math.round(u * 4), Math.max(2, Math.round(u * 0.5)));
  return s.toPng();
}

// A PHONE screen capture: narrow, tall, with app furniture rather than page furniture.
function mobileApp(w, h, { debug = true } = {}) {
  const s = surface(w, h, 3, "#FFFFFF");
  const u = w / 100;
  s.rect(0, 0, w, u * 8, "#12100E");                       // status bar
  s.rect(u * 6, u * 3, u * 14, u * 2, "#FFFFFF");
  s.rect(w - u * 20, u * 3, u * 14, u * 2, "#FFFFFF");
  s.rect(0, u * 8, w, u * 16, "#14C98E");                  // app header
  s.rect(u * 6, u * 13, w * 0.55, u * 4.5, "#FFFFFF");
  const rowTop = u * 26, rowH = (h - rowTop - u * 16) / 7;
  for (let i = 0; i < 7; i++) {                            // numbered list rows
    const y = rowTop + i * rowH;
    // avatar | index digit | two copy bars — laid out left to right off measured widths
    // so the digit never lands on the bars (a narrow 430px page leaves no slack).
    const digitScale = Math.max(3, Math.round(u * 2.6));
    const avatarX = u * 8, avatarW = rowH * 0.42;
    const digitX = avatarX + avatarW + u * 4;
    const copyX = digitX + digitScale * 6 + u * 4;
    s.rect(u * 4, y, w - u * 8, rowH - u * 2.5, BAND_TINTS[i % BAND_TINTS.length]);
    s.rect(avatarX, y + rowH * 0.22, avatarW, avatarW, "#1B4DFF");
    if (debug) s.number(i + 1, digitX, y + rowH * 0.26, digitScale, "#12100E");
    s.rect(copyX, y + rowH * 0.28, w - copyX - u * 8, u * 3, "#12100E");
    s.rect(copyX, y + rowH * 0.28 + u * 5, (w - copyX - u * 8) * 0.7, u * 2.2, "#8A8A8A");
  }
  s.rect(0, h - u * 16, w, u * 16, "#F2F2F2");             // tab bar
  for (let i = 0; i < 4; i++) s.rect(u * (9 + i * 24), h - u * 11, u * 9, u * 6, i === 0 ? "#1B4DFF" : "#B8B8B8");
  if (debug) s.markers(Math.round(u * 2), Math.round(u * 6), Math.max(2, Math.round(u * 0.8)));
  return s.toPng();
}

// A PHOTO-like asset: no UI furniture, strong diagonal blocks so a centre-crop is
// obvious, plus a large index digit.
function photo(w, h, index, { debug = true } = {}) {
  const s = surface(w, h, 3, "#20304A");
  const step = Math.max(w, h) / 7;
  const cols = ["#FF4D2E", "#1B4DFF", "#FFD23F", "#14C98E", "#8B5CF6", "#FF8A3D"];
  for (let i = 0; i < 12; i++) {
    const c = cols[(i + index) % cols.length];
    for (let y = 0; y < h; y += 4) {
      const x = i * step - y * 0.55;
      s.rect(x, y, step * 0.62, 4, c);
    }
  }
  if (debug) {
    const cx = Math.round(w / 2 - w * 0.09), cy = Math.round(h / 2 - h * 0.14);
    s.rect(cx - w * 0.03, cy - h * 0.04, w * 0.24, h * 0.36, "#FFFFFF");
    s.number(index, cx, cy, Math.max(4, Math.round(Math.min(w, h) / 26)), "#12100E");
    s.markers(Math.round(Math.min(w, h) * 0.02), Math.round(Math.min(w, h) * 0.06), 3);
  }
  return s.toPng();
}

// A LOGO: RGBA with a genuinely transparent field, so logo_render's recolour filter and
// the "is the plate empty?" question are both answerable from a rendered frame.
function logo(size, colour) {
  const s = surface(size, size, 4, null);
  const u = size / 100;
  const cx = size / 2, cy = size / 2, r = size * 0.32;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r && d >= r * 0.56) s.rect(x, y, 1, 1, colour, 255);
    }
  }
  s.rect(cx - u * 9, cy - u * 9, u * 18, u * 18, colour, 255);
  s.rect(u * 8, cy - u * 3, u * 12, u * 6, colour, 255);
  s.rect(size - u * 20, cy - u * 3, u * 12, u * 6, colour, 255);
  return s.toPng();
}

/**
 * Stage a realistic asset set into `<outDir>/assets/images/` and return records shaped
 * the way the Creative Director hands them to a composer (path, ratio, cdScore, sceneId).
 * The declared width/height MATCH the real pixels, so aspect routing and scroll geometry
 * are exercised against imagery that actually renders.
 */
function stageAssets(outDir, { sceneIds = [], debug = true } = {}) {
  const dir = path.join(outDir, "assets", "images");
  fs.mkdirSync(dir, { recursive: true });
  const put = (name, buf) => { fs.writeFileSync(path.join(dir, name), buf); return `assets/images/${name}`; };
  const sid = (i) => (sceneIds[i] != null ? sceneIds[i] : undefined);
  const o = { debug };
  return [
    { path: put("site_desktop.png", sitePage(1440, 2600, o)), type: "image", source: "website", visionOk: true,
      cdScore: 96, sceneId: sid(0), width: 1440, height: 2600, ratio: 1440 / 2600,
      alt: "pricing page", sourceUrl: "https://northwind.example.com/pricing" },
    { path: put("site_mobile.png", mobileApp(430, 1400, o)), type: "image", source: "website", visionOk: true,
      cdScore: 92, sceneId: sid(1), width: 430, height: 1400, ratio: 430 / 1400,
      alt: "mobile app", sourceUrl: "https://northwind.example.com" },
    { path: put("photo_wide.png", photo(1600, 1200, 3, o)), type: "image", source: "upload", visionOk: true,
      cdScore: 88, sceneId: sid(2), width: 1600, height: 1200, ratio: 4 / 3, alt: "team workspace" },
    { path: put("photo_square.png", photo(1200, 1200, 4, o)), type: "image", source: "upload", visionOk: true,
      cdScore: 84, width: 1200, height: 1200, ratio: 1, alt: "product detail" },
    { path: put("logo.png", logo(512, "#12100E")), type: "image", source: "upload", role: "logo",
      assetType: "logo", width: 512, height: 512, ratio: 1, alt: "Northwind logo" },
  ];
}

module.exports = { stageAssets, sitePage, mobileApp, photo, logo, encodePng };
