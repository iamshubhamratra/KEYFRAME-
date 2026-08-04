// Website Asset Intelligence — the harvester (M1: homepage-only).
//
// Chrome already LOADS a site's own logos / SVG icons / hero images during ingest,
// then throws the bytes away (only screenshot pixels + text survive). This module
// KEEPS them: it walks the already-loaded, overlay-cleaned homepage DOM for the
// site's own asset URLs, downloads them through a hardened SSRF-safe fetcher, and
// hands back on-disk files for the integration layer to classify/dedup/pin.
//
// It runs INSIDE understandWebsite's existing page session (no 2nd navigation, no
// 2nd Chrome). It is DETERMINISTIC (no LLM/vision), fully FAIL-OPEN (never throws
// out of understandWebsite; harvesting to zero is a supported outcome), and hard
// bounded by a single wall-clock deadline.
//
// SECURITY (the URL is user-supplied — treat every discovered URL as hostile):
//   • guardedFetch ONLY — never asset_sources util.download (which follows redirects
//     blindly, an SSRF hole). Every URL + every redirect hop is assertPublicUrl'd.
//   • assertPublicUrl resolves the host, rejects any private/loopback/link-local/
//     ULA/CGNAT/NAT64/benchmark/cloud-metadata address (BigInt CIDR checks that
//     normalize IPv4-mapped IPv6 + numeric/octal host encodings), and PINS the
//     validated IP into the connection so the socket can't rebind to a bad address.
//   • Content-Type allowlist + magic-byte sniff on save + per-type byte caps.
//   • Harvested SVG is SANITIZED (script/foreignObject/on*/external-ref stripped)
//     before it ever touches disk.

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const dns = require("node:dns");
const crypto = require("node:crypto");
const config = require("../../config");
const { ffprobeImage, pixFmtHasAlpha, UA, reencodeForHyperframes } = require("../asset_sources/util");
const { probeDurationSec } = require("../media");

// ---------------------------------------------------------------- SSRF guard

// Private / reserved IPv4 ranges to REFUSE, as [network, prefixLen].
const V4_BLOCKS = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4], ["255.255.255.255", 32],
];
// Private / reserved IPv6 ranges to REFUSE, as [network, prefixLen].
const V6_BLOCKS = [
  ["::1", 128], ["::", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
  ["2001:db8::", 32], ["100::", 64],
];

function v4ToBig(s) {
  const parts = String(s).split(".");
  if (parts.length !== 4) return null;
  let n = 0n;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const o = Number(p);
    if (o > 255) return null;
    n = (n << 8n) | BigInt(o);
  }
  return n;
}

// Expand any (compressed / IPv4-embedded) IPv6 literal to a 128-bit BigInt.
function v6ToBig(addr) {
  let s = String(addr).split("%")[0]; // drop zone id
  // Rewrite a trailing embedded IPv4 dotted-quad (e.g. ::ffff:127.0.0.1) as two
  // hextets so the ':'-group logic below is uniform. The colon before the quad is
  // retained by the slice, so `::ffff:127.0.0.1` → `::ffff:7f00:1`.
  const m = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (m) {
    const v4 = v4ToBig(m[1]); if (v4 == null) return null;
    const head = s.slice(0, s.length - m[1].length); // still ends with ':'
    const hi = (v4 >> 16n) & 0xffffn, lo = v4 & 0xffffn;
    s = head + hi.toString(16) + ":" + lo.toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const toGroups = (g) => (g ? g.split(":").filter((x) => x !== "") : []);
  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  const missing = 8 - (head.length + tail.length);
  if (missing < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = halves.length === 2
    ? [...head, ...Array(missing).fill("0"), ...tail]
    : head;
  if (groups.length !== 8) return null;
  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    n = (n << 16n) | BigInt(parseInt(g, 16));
  }
  return n;
}

function inBlock(big, netStr, prefix, bits) {
  const netBig = bits === 32 ? v4ToBig(netStr) : v6ToBig(netStr);
  if (netBig == null || big == null) return false;
  const shift = BigInt(bits - prefix);
  return (big >> shift) === (netBig >> shift);
}

// True if a resolved address is one we must never connect to.
function isBlockedAddress(address, family) {
  if (family === 4 || net.isIPv4(address)) {
    const b = v4ToBig(address);
    if (b == null) return true; // unparseable → refuse
    return V4_BLOCKS.some(([n, p]) => inBlock(b, n, p, 32));
  }
  // IPv6 (may embed an IPv4 via ::ffff: or 64:ff9b:: — check BOTH views).
  const b6 = v6ToBig(address);
  if (b6 == null) return true;
  if (V6_BLOCKS.some(([n, p]) => inBlock(b6, n, p, 128))) return true;
  // IPv4-mapped (::ffff:0:0/96) and NAT64 (64:ff9b::/96): validate the embedded v4.
  const isMapped = (b6 >> 32n) === (v6ToBig("::ffff:0:0") >> 32n);
  const isNat64 = (b6 >> 32n) === (v6ToBig("64:ff9b::") >> 32n);
  if (isMapped || isNat64) {
    const v4 = b6 & 0xffffffffn;
    return V4_BLOCKS.some(([n, p]) => inBlock(v4, n, p, 32));
  }
  // IPv4-compatible ::/96 (deprecated, e.g. ::127.0.0.1 / ::169.254.169.254): top 96
  // bits zero → the low 32 are an embedded v4. (::/::1 are already blocked above.)
  if ((b6 >> 32n) === 0n) {
    const v4 = b6 & 0xffffffffn;
    return V4_BLOCKS.some(([n, p]) => inBlock(v4, n, p, 32));
  }
  // 6to4 2002::/16 (e.g. 2002:a9fe:a9fe::): embedded v4 in bits 16..48.
  if ((b6 >> 112n) === 0x2002n) {
    const v4 = (b6 >> 80n) & 0xffffffffn;
    return V4_BLOCKS.some(([n, p]) => inBlock(v4, n, p, 32));
  }
  return false;
}

function dnsLookupAll(host) {
  return new Promise((resolve, reject) => {
    dns.lookup(host, { all: true, verbatim: true }, (err, addrs) => {
      if (err) return reject(err);
      resolve(Array.isArray(addrs) ? addrs : []);
    });
  });
}

// Resolve + validate a URL for public fetch. Throws on anything unsafe. Returns the
// parsed URL plus the PINNED address to connect to (so the socket cannot rebind).
async function assertPublicUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { throw new Error("unparseable URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`blocked scheme ${u.protocol}`);
  if (u.username || u.password) throw new Error("credentialed URL refused");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error(`blocked host ${host}`);

  // If the host is already a literal IP, validate it directly; otherwise resolve.
  let addrs;
  if (net.isIP(host)) {
    addrs = [{ address: host, family: net.isIPv6(host) ? 6 : 4 }];
  } else {
    addrs = await dnsLookupAll(host); // getaddrinfo also normalizes numeric/octal hosts
    if (!addrs.length) throw new Error(`no address for ${host}`);
  }
  for (const a of addrs) {
    if (isBlockedAddress(a.address, a.family)) throw new Error(`blocked address ${a.address}`);
  }
  // ADDRESS ORDER. Every resolved address is validated above, so any of them is safe
  // to pin — but only some of them are REACHABLE. `dns.lookup(verbatim: true)` returns
  // the resolver's order, which for a Cloudflare-fronted CDN puts AAAA first; pinning
  // that on a host without working IPv6 makes every fetch fail at connect time. The
  // harvester lost all 24 of its queued assets this way, reported as "fetch" failures
  // indistinguishable from a hostile CDN — while an unpinned request to the same URL
  // returned 200, because Node's own resolution falls back to IPv4.
  //
  // We keep the pin (it is what defeats DNS-rebind TOCTOU) and make it survive the
  // real network: prefer IPv4, and hand the caller the remaining validated addresses
  // to fall back through on a connection error.
  const ordered = [...addrs].sort((a, b) => (a.family === 4 ? 0 : 1) - (b.family === 4 ? 0 : 1));
  const pin = ordered[0];
  return {
    url: u,
    pinnedIp: pin.address,
    family: pin.family,
    alternates: ordered.slice(1).map((a) => ({ address: a.address, family: a.family })),
  };
}

// ---------------------------------------------------------------- guarded fetch

const IMG_MIME = /^image\/(png|jpe?g|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon|avif|bmp)$/i;
const SVG_MIME = /svg\+xml|xml/i;

// Magic-byte sniff → canonical extension, or null if it isn't an image we accept.
function sniffImage(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "gif";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) return "ico";
  // SVG: require the body to START with <?xml or <svg (after whitespace/BOM), NOT
  // merely contain "<svg" — else an HTML page with an inline <svg> sniffs as an image
  // (the Content-Type allowlist is skipped when the header is absent).
  const head = buf.toString("utf8", 0, Math.min(buf.length, 512)).replace(/^﻿/, "").trim().toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg") || head.startsWith("<!--")) {
    return head.includes("<svg") ? "svg" : null;
  }
  return null;
}

const VID_MIME = /^video\/(mp4|webm|quicktime|x-m4v|ogg)$/i;

// Magic-byte sniff for the video containers we accept → canonical extension, or null.
// MP4/MOV/M4V carry an 'ftyp' box at offset 4; WebM/Matroska open with EBML 1A45DFA3.
function sniffVideo(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf.toString("ascii", 4, 8) === "ftyp") return "mp4";
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "webm";
  return null;
}

// Byte caps per type. The video cap is deliberately SMALL — a short hero clip, never a
// full film — to bound the fetch bandwidth (and SSRF exposure) of a user-supplied URL.
const TYPE_BYTE_CAP = { svg: 1 * 1024 * 1024, image: 8 * 1024 * 1024, video: 16 * 1024 * 1024 };

// GET a public URL with the validated IP pinned into the socket, following at most
// `maxRedirects` hops (each re-validated), buffering up to a byte cap. Returns a
// Buffer + mime, or null on any failure/violation. Never throws.
// Brand assets normally live on a CDN with hotlink protection, which answers a bare
// programmatic request with 403. Webflow's cdn.prod.website-files.com — where a large
// share of marketing sites host their logo — refuses every one of them: the audited
// harvest discovered 80 assets, queued 24 and lost all 24 to "fetch", so the pipeline
// had no logo to use even with the harvester switched on.
//
// The request the CDN will serve is the one a browser makes for an <img> on that page:
// the site's own origin as Referer, plus the Sec-Fetch/Accept-Language headers every
// real image request carries. This is not evasion — it is the same request the user's
// browser already makes when they load the page we are analysing on their behalf. The
// SSRF guard is untouched: assertPublicUrl still re-resolves and IP-pins the target.
function assetHeaders(referer) {
  const h = {
    "User-Agent": UA,
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": "cross-site",
  };
  if (referer) {
    h.Referer = referer;
    try { h.Origin = new URL(referer).origin; } catch { /* referer already validated upstream */ }
  }
  return h;
}

async function fetchGuarded(rawUrl, { timeoutMs = 8000, maxBytes = TYPE_BYTE_CAP.image, maxRedirects = 3, signal, allowMime = IMG_MIME, referer = null } = {}) {
  let target;
  try { target = await assertPublicUrl(rawUrl); } catch { return null; }
  const { url } = target;
  const client = url.protocol === "https:" ? https : http;

  // One attempt against ONE validated, pinned address. Resolves the body, or
  // { __transport: true } when the socket itself failed — the caller distinguishes
  // "this address is unreachable" (try the next) from "the server said no" (stop).
  const attempt = (addr) => new Promise((resolve) => {
    let settled = false;
    let onAbort = null;
    const done = (v) => {
      if (settled) return;
      settled = true;
      // Detach the abort listener so they don't accumulate on the SHARED signal
      // across every asset fetch (Node's MaxListenersExceededWarning otherwise).
      if (signal && onAbort) { try { signal.removeEventListener("abort", onAbort); } catch { /* noop */ } }
      resolve(v);
    };
    const req = client.get(url, {
      timeout: timeoutMs,
      headers: assetHeaders(referer),
      // Pin the exact address we validated — defeats DNS-rebind TOCTOU.
      //
      // The callback MUST honour the `all` option Node passes in. Since Node 20,
      // net.connect defaults to autoSelectFamily=true and therefore calls a custom
      // lookup with { all: true }, expecting an ARRAY of {address, family}. Handing
      // it the classic (err, address, family) triple in that mode fails the whole
      // connection with ERR_INVALID_IP_ADDRESS — which is what every guarded fetch
      // in this module had been doing: the harvester's 0-of-24 "fetch" failures were
      // never the CDN refusing us, they were the socket never opening. Supporting
      // both shapes keeps the pin intact on old and new Node alike.
      lookup: (_h, opts, cb) => (opts && opts.all)
        ? cb(null, [{ address: addr.address, family: addr.family }])
        : cb(null, addr.address, addr.family),
      servername: url.hostname,
    }, (res) => {
      const status = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
        res.destroy();
        if (maxRedirects <= 0) return done(null);
        let next;
        try { next = new URL(res.headers.location, url).href; } catch { return done(null); }
        return done(fetchGuarded(next, { timeoutMs, maxBytes, maxRedirects: maxRedirects - 1, signal, allowMime, referer }));
      }
      if (status !== 200) { res.destroy(); return done(null); }
      const ct = String(res.headers["content-type"] || "").split(";")[0].trim();
      if (ct && !allowMime.test(ct)) { res.destroy(); return done(null); }
      const len = Number(res.headers["content-length"]);
      if (Number.isFinite(len) && len > maxBytes) { res.destroy(); return done(null); }
      const chunks = [];
      let total = 0;
      res.on("data", (c) => {
        total += c.length;
        if (total > maxBytes) { res.destroy(); return done(null); }
        chunks.push(c);
      });
      res.on("end", () => done({ buf: Buffer.concat(chunks), mime: ct }));
      res.on("error", () => done(null));
    });
    req.on("error", () => done({ __transport: true }));
    req.on("timeout", () => { try { req.destroy(); } catch { /* noop */ } done({ __transport: true }); });
    if (signal) {
      if (signal.aborted) { try { req.destroy(); } catch { /* noop */ } done(null); }
      else { onAbort = () => { try { req.destroy(); } catch { /* noop */ } done(null); }; signal.addEventListener("abort", onAbort, { once: true }); }
    }
  });

  // Walk the validated addresses (IPv4 first — see assertPublicUrl) until one
  // actually connects. Every address here already passed the SSRF checks, so this
  // widens reachability without widening what we are willing to talk to.
  const addrs = [{ address: target.pinnedIp, family: target.family }, ...(target.alternates || [])];
  for (const addr of addrs) {
    if (signal && signal.aborted) return null;
    const r = await attempt(addr);
    if (r && r.__transport) continue;   // unreachable address — try the next
    return r;
  }
  return null;
}

// ---------------------------------------------------------------- SVG sanitize

// Conservative, defense-in-depth SVG cleaner. Harvested SVGs are ALSO only ever
// embedded via <img src=file.svg> downstream (which disables scripting), but we
// still neutralize the bytes on disk: strip scripts, foreignObject, event handlers,
// external references (href/xlink:href/url() pointing off-file), and any DOCTYPE.
function sanitizeSvg(markup) {
  let s = String(markup || "");
  if (s.length > 262144) s = s.slice(0, 262144);
  s = s.replace(/<!DOCTYPE[^>]*>/gi, "");
  s = s.replace(/<\?xml[^>]*\?>/gi, "");
  // Closed script/foreignObject/style blocks…
  s = s.replace(/<script\b[\s\S]*?<\/script\s*>/gi, "");
  s = s.replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, "");
  s = s.replace(/<style\b[\s\S]*?<\/style\s*>/gi, "");
  // …and UNCLOSED ones (no closing tag): strip to EOF (a clean logo never needs these).
  s = s.replace(/<script\b[\s\S]*$/gi, "");
  s = s.replace(/<foreignObject\b[\s\S]*$/gi, "");
  s = s.replace(/<style\b[\s\S]*$/gi, "");
  // SMIL animation can set href/attributes to javascript: — drop it wholesale.
  s = s.replace(/<(?:set|animate|animateTransform|animateMotion)\b[\s\S]*?(?:\/>|<\/(?:set|animate|animateTransform|animateMotion)\s*>)/gi, "");
  s = s.replace(/<(?:set|animate|animateTransform|animateMotion)\b[\s\S]*$/gi, "");
  // Event handlers.
  s = s.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  s = s.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  s = s.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  // External refs: href/xlink:href pointing at http(s)/data/javascript. Keep #internal.
  s = s.replace(/\s(?:xlink:href|href)\s*=\s*"(?:https?:|data:|javascript:|\/\/)[^"]*"/gi, "");
  s = s.replace(/\s(?:xlink:href|href)\s*=\s*'(?:https?:|data:|javascript:|\/\/)[^']*'/gi, "");
  // url(http…) and CSS @import inside any surviving style/attributes.
  s = s.replace(/url\(\s*['"]?\s*(?:https?:|\/\/|data:)[^)]*\)/gi, "none");
  s = s.replace(/@import\b[^;]*;?/gi, "");
  // A SAFE svg can still be an UNLOADABLE or INVISIBLE one. Both normalizations run from
  // this one choke point so the inline and fetched write paths cannot drift.
  return ensureSvgNamespace(unhideSvgRoot(s));
}

// THE NAMESPACE — the defect that actually reached a delivered film.
//
// An inline `<svg>` in an HTML document needs no `xmlns`: the HTML parser puts it in the SVG
// namespace implicitly. Harvesting captures `svg.outerHTML`, which does NOT add the missing
// declaration, and we then write those bytes to a standalone `.svg`. A standalone SVG loaded
// through `<img src>` is parsed as **XML**, where the namespace is mandatory — so the browser
// cannot parse it, the image fails to load, and the composer's `alt` string renders on screen
// in place of the brand mark. Observed in job 9e0fq1724n (prisma-bloc hook), whose logo came
// from linear.app as `<svg width="13" height="13" viewBox="0 0 100 100" fill="#E2E4E6" …>`:
// well-formed, drawable, and unloadable.
//
// It is invisible to every existing gate: the file EXISTS (so preflight's `invalidPaths` is
// happy), the path IS in the HTML (so the render audit counts it as rendered), and vectors
// skip `validateImage` entirely. Measured across the harvest cache: **26 of 201** SVGs.
function ensureSvgNamespace(markup) {
  const s = String(markup || "");
  const m = /<svg\b[^>]*>/i.exec(s);
  if (!m) return s;
  let tag = m[0];
  if (!/\sxmlns\s*=/i.test(tag)) {
    tag = tag.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  // An undeclared `xlink:` prefix is the same class of XML parse error.
  if (/\sxlink:[a-z]+\s*=/i.test(s) && !/\sxmlns:xlink\s*=/i.test(tag)) {
    tag = tag.replace(/^<svg\b/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  }
  return s.slice(0, m.index) + tag + s.slice(m.index + m[0].length);
}

// VISUAL normalization — deliberately separate in intent from the security pass above.
//
// Sites routinely ship their logo inline with the ROOT hidden: a sprite, or a mark revealed
// later by CSS/script. `svg.outerHTML` captures that state verbatim, so the harvested file
// opens `<svg … style="visibility: hidden;">` (real example:
// harvest_cache/10c8fa41703d5b6a/a1.svg). Loaded as an <img> it paints NOTHING, and the
// composer's alt text lands on screen where the brand mark should be — observed in a
// delivered film (job 9e0fq1724n, the prisma-bloc hook). Nothing downstream catches it:
// preflight's `invalidPaths` only asks whether the FILE EXISTS.
//
// ROOT ONLY, deliberately. Logos commonly pack several variants into one file with all but
// one hidden (light/dark, wordmark/monogram); un-hiding those would stack every variant on
// top of each other. The root element's own hidden state is the only one that is
// unambiguously wrong — nothing can see the mark at all.
function unhideSvgRoot(markup) {
  const s = String(markup || "");
  const m = /<svg\b[^>]*>/i.exec(s);
  if (!m) return s;
  let tag = m[0];
  // Presentation attributes.
  tag = tag.replace(/\svisibility\s*=\s*(["'])\s*(?:hidden|collapse)\s*\1/gi, "");
  tag = tag.replace(/\sdisplay\s*=\s*(["'])\s*none\s*\1/gi, "");
  tag = tag.replace(/\sopacity\s*=\s*(["'])\s*0*(?:\.0+)?\s*\1/gi, "");
  // The same three, as declarations inside the root's style attribute.
  tag = tag.replace(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/i, (_full, q, css) => {
    const kept = String(css).split(";")
      .filter((d) => d.trim() && !/^\s*(?:visibility\s*:\s*(?:hidden|collapse)|display\s*:\s*none|opacity\s*:\s*0*(?:\.0+)?)\s*$/i.test(d))
      .join(";");
    return kept.trim() ? ` style=${q}${kept}${q}` : "";
  });
  return s.slice(0, m.index) + tag + s.slice(m.index + m[0].length);
}

// Does this markup draw anything at all? A vector with no drawable element renders as an
// empty box — which, in an <img>, is indistinguishable from a broken one. Cheap and
// structural; a TRUE paint check would need rasterisation (Chromium/resvg), which is far
// more than this is worth. `<use>` counts: internal `#` references survive sanitizing.
const SVG_DRAWABLE = /<(?:path|rect|circle|ellipse|polygon|polyline|line|text|image|use)\b/i;
function svgPaintsSomething(markup) { return SVG_DRAWABLE.test(String(markup || "")); }

// ---------------------------------------------------------------- discovery

// One page.evaluate DOM walk on the already-loaded, overlay-cleaned homepage.
// Returns absolute-resolved candidate descriptors; nothing is fetched here.
async function discoverAssetsInPage(page) {
  return page.evaluate(() => {
    const abs = (u) => { try { return new URL(u, document.baseURI).href; } catch { return null; } };
    const out = [];
    const seen = new Set();
    const push = (o) => {
      const k = o.url || (o.inlineSvg ? o.inlineSvg.slice(0, 96) : null);
      if (!k || seen.has(k)) return;
      seen.add(k); out.push(o);
    };
    const banners = [...document.querySelectorAll("header,[role=banner],nav")];
    const nearHeader = (el) => {
      try { if (banners.some((h) => h.contains(el))) return true; return el.getBoundingClientRect().top < 220; }
      catch { return false; }
    };
    const bestSrc = (img) => {
      try {
        if (img.currentSrc) return img.currentSrc;
        const ss = img.getAttribute("srcset");
        if (ss) {
          const cands = ss.split(",").map((p) => {
            const [u, d] = p.trim().split(/\s+/);
            const w = d && d.endsWith("w") ? parseInt(d) : (d && d.endsWith("x") ? parseFloat(d) * 1000 : 0);
            return { u, w: w || 0 };
          }).filter((c) => c.u);
          if (cands.length) return cands.sort((a, b) => b.w - a.w)[0].u;
        }
      } catch { /* noop */ }
      return img.getAttribute("src") || img.src;
    };
    // <img>
    for (const img of document.querySelectorAll("img")) {
      const u = abs(bestSrc(img)); if (!u || u.startsWith("data:")) continue;
      push({
        url: u, discovery: "img", isSvg: /\.svg(\?|$)/i.test(u), nearHeader: nearHeader(img),
        alt: (img.getAttribute("alt") || "").slice(0, 160),
        cls: `${img.className || ""} ${img.id || ""}`.slice(0, 200),
        w: img.naturalWidth || 0, h: img.naturalHeight || 0,
      });
    }
    // inline <svg> — also capture COMPUTED colours (resolves currentColor / CSS
    // fills that never appear as inline hex, so a monochrome CSS-styled logo still
    // yields a brand colour). ffmpeg can't rasterize SVG, so this is the reliable
    // colour source for inline marks.
    for (const svg of document.querySelectorAll("svg")) {
      let bb; try { bb = svg.getBoundingClientRect(); } catch { bb = { width: 0, height: 0 }; }
      if (bb.width < 12 && bb.height < 12) continue;
      const html = svg.outerHTML || "";
      if (!html || html.length > 262144) continue;
      const styleColors = [];
      try {
        const cs = getComputedStyle(svg);
        styleColors.push(cs.color, cs.fill, cs.stroke);
        let n = 0;
        for (const el of svg.querySelectorAll("path,rect,circle,polygon,ellipse,stop")) {
          if (n++ > 24) break;
          const s = getComputedStyle(el);
          styleColors.push(s.fill, s.stopColor || "", s.stroke);
        }
      } catch { /* noop */ }
      push({
        inlineSvg: html, discovery: "svg-inline", isSvg: true, nearHeader: nearHeader(svg),
        alt: (svg.getAttribute("aria-label") || "").slice(0, 160),
        cls: `${svg.getAttribute("class") || ""} ${svg.id || ""}`.slice(0, 200),
        w: Math.round(bb.width) || 0, h: Math.round(bb.height) || 0,
        styleColors: styleColors.filter(Boolean).slice(0, 40),
      });
    }
    // link icons
    for (const l of document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"],link[rel="mask-icon"]')) {
      const u = abs(l.getAttribute("href")); if (!u || u.startsWith("data:")) continue;
      push({ url: u, discovery: "link-icon", isSvg: /\.svg(\?|$)/i.test(u), nearHeader: true, alt: "favicon", cls: "favicon icon", w: 0, h: 0 });
    }
    // og:image / twitter:image
    for (const [sel, tag] of [['meta[property="og:image"]', "og"], ['meta[name="twitter:image"]', "twitter"], ['meta[property="og:image:secure_url"]', "og"]]) {
      const c = document.querySelector(sel)?.content; const u = c && abs(c);
      if (u && !u.startsWith("data:")) push({ url: u, discovery: tag, isSvg: false, nearHeader: false, alt: "social share image", cls: "hero", w: 0, h: 0 });
    }
    // <video> / <video><source> — DIRECT product/hero clips ONLY (NOT youtube/vimeo
    // iframes, which aren't harvestable as files); og:video only if it's a direct file.
    for (const v of document.querySelectorAll("video")) {
      const cand = v.getAttribute("src") || (v.querySelector("source[src]") && v.querySelector("source[src]").getAttribute("src"));
      const u = cand && abs(cand);
      if (!u || /^(data|blob):/.test(u)) continue;
      let bb; try { bb = v.getBoundingClientRect(); } catch { bb = { width: 0, height: 0 }; }
      push({ url: u, discovery: "video", isVideo: true, isSvg: false, nearHeader: nearHeader(v), alt: (v.getAttribute("aria-label") || "").slice(0, 160), cls: `${v.className || ""} ${v.id || ""}`.slice(0, 200), w: Math.round(bb.width) || 0, h: Math.round(bb.height) || 0 });
    }
    for (const sel of ['meta[property="og:video"]', 'meta[property="og:video:secure_url"]', 'meta[property="og:video:url"]']) {
      const c = document.querySelector(sel)?.content; const u = c && abs(c);
      if (u && !/^(data|blob):/.test(u) && /\.(mp4|webm|mov)(\?|$)/i.test(u)) push({ url: u, discovery: "og-video", isVideo: true, isSvg: false, nearHeader: false, alt: "share video", cls: "hero", w: 0, h: 0 });
    }
    // JSON-LD Organization.logo / image
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      let j; try { j = JSON.parse(s.textContent); } catch { continue; }
      const arr = Array.isArray(j) ? j : [j];
      for (const o of arr) {
        if (!o || typeof o !== "object") continue;
        const cand = (o.logo && (o.logo.url || o.logo)) || (o.image && (o.image.url || o.image));
        if (typeof cand === "string") { const u = abs(cand); if (u && !u.startsWith("data:")) push({ url: u, discovery: "jsonld-logo", isSvg: /\.svg(\?|$)/i.test(u), nearHeader: true, alt: "organization logo", cls: "logo brand", w: 0, h: 0 }); }
      }
    }
    return out.slice(0, 80);
  });
}

// ---------------------------------------------------------------- brand signals

// One page.evaluate reading the site's TYPOGRAPHY (computed heading/body font-family +
// @font-face families) and a COMPUTED brand palette (primary button backgrounds, link
// colours, heading colour). Computed CSS colours are far cleaner than quantizing hero
// screenshot pixels (which caught marketing-gradient noise), so this is the better
// "extracted" brand palette. Returns raw strings; the integration layer filters/ranks.
async function discoverBrandSignals(page) {
  return page.evaluate(() => {
    const out = { fonts: { heading: null, body: null }, fontFaces: [], rawColors: [] };
    const famOf = (el) => { try { return getComputedStyle(el).fontFamily || null; } catch { return null; } };
    const firstFamily = (stack) => { const t = String(stack || "").split(",")[0].replace(/['"]/g, "").trim(); return t || null; };
    const h = document.querySelector("h1, h2, h3");
    const b = document.body;
    if (h) { const st = famOf(h); if (st) out.fonts.heading = { family: firstFamily(st), stack: st.slice(0, 200) }; }
    if (b) { const st = famOf(b); if (st) out.fonts.body = { family: firstFamily(st), stack: st.slice(0, 200) }; }
    // @font-face families (same-origin sheets only; cross-origin cssRules throws → caught).
    // Break out once the 8-face cap is reachable so a giant stylesheet isn't fully walked.
    const faces = new Set();
    outer: for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      if (!rules) continue;
      for (const r of rules) {
        try { if (r.type === CSSRule.FONT_FACE_RULE) { const f = (r.style.getPropertyValue("font-family") || "").replace(/['"]/g, "").trim(); if (f) faces.add(f); } } catch { /* noop */ }
        if (faces.size >= 8) break outer;
      }
    }
    out.fontFaces = [...faces].slice(0, 8);
    // Convert ANY computed CSS colour to rgb via a canvas — the browser does the
    // colour-space math, so modern oklch()/oklab()/color(srgb ...)/hsl()/named values
    // (e.g. Tailwind v4's oklch palette, which a raw rgb/hex regex silently drops) all
    // resolve, and a fully-transparent value paints nothing → returns null → skipped.
    let cctx = null;
    try { const cv = document.createElement("canvas"); cv.width = cv.height = 1; cctx = cv.getContext("2d", { willReadFrequently: true }); } catch { /* noop */ }
    const toRgb = (c) => {
      if (!c) return null;
      if (!cctx) return c; // no canvas → fall back to the raw string (regex handles rgb/hex)
      try {
        cctx.clearRect(0, 0, 1, 1);
        cctx.fillStyle = "#000000";
        cctx.fillStyle = c;            // invalid/unsupported → stays #000000 → filtered later
        cctx.fillRect(0, 0, 1, 1);
        const d = cctx.getImageData(0, 0, 1, 1).data;
        if (d[3] === 0) return null;   // fully transparent → not a painted brand colour
        return `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
      } catch { return c; }
    };

    // Computed brand colours, GROUPED by trust so the primary CTA accent leads over
    // link/heading noise (paletteFromCssList ranks by frequency, and a page can have
    // dozens of link-blue links but one brand CTA). EXCLUDE social/danger/secondary/
    // outline controls — their colour is semantic or third-party, not the brand accent.
    const noise = /\b(social|facebook|twitter|linkedin|youtube|instagram|discord|github|danger|error|delete|destructive|warning|secondary|ghost|outline|link|text-only|muted)\b/i;
    const isNoise = (el) => noise.test(`${el.className || ""} ${el.getAttribute("aria-label") || ""}`);
    const cta = [], accent = [];
    for (const el of [...document.querySelectorAll('button,[class*="btn" i],[class*="button" i],[class*="cta" i],a[role="button"]')].slice(0, 40)) {
      if (isNoise(el)) continue;
      try { cta.push(toRgb(getComputedStyle(el).backgroundColor)); } catch { /* noop */ }
      if (cta.filter(Boolean).length >= 24) break;
    }
    for (const el of [...document.querySelectorAll("a")].slice(0, 24)) { if (isNoise(el)) continue; try { accent.push(toRgb(getComputedStyle(el).color)); } catch { /* noop */ } }
    if (h) { try { accent.push(toRgb(getComputedStyle(h).color)); } catch { /* noop */ } }
    out.ctaColors = cta.filter(Boolean).slice(0, 40);
    out.accentColors = accent.filter(Boolean).slice(0, 40);
    out.rawColors = [...out.ctaColors, ...out.accentColors].slice(0, 80); // back-compat/disclosure
    return out;
  });
}

// ---------------------------------------------------------------- per-domain cache

// A repeat job for the same origin can reuse the already-downloaded assets + brand
// signals instead of re-crawling the site (faster + politer). Keyed by origin, TTL'd,
// entirely fail-open — any cache error falls back to a live harvest.
function harvestCacheDir() { return path.join(config.paths.jobsDir, "..", "harvest_cache"); }
function originKeyFor(baseUrl) {
  try { return crypto.createHash("sha1").update(new URL(baseUrl).origin).digest("hex").slice(0, 16); }
  catch { return null; }
}
function loadHarvestCache(baseUrl, outDir) {
  const key = originKeyFor(baseUrl); if (!key) return null;
  const dir = path.join(harvestCacheDir(), key);
  let manifest; try { manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")); } catch { return null; }
  const ttlMs = (Number(config.harvester && config.harvester.cacheTtlHours) || 168) * 3600 * 1000;
  if (!manifest.fetchedAt || (Date.now() - manifest.fetchedAt) > ttlMs) return null; // stale → re-harvest
  const files = [];
  for (const e of (manifest.files || [])) {
    // Reject any file field that isn't a plain basename (path-traversal belt-and-braces
    // for trusted-but-persistent on-disk state).
    if (!e || !e.file || e.file !== path.basename(e.file) || path.isAbsolute(e.file)) continue;
    const src = path.join(dir, e.file);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(outDir, e.file);
    try { fs.copyFileSync(src, dst); } catch { continue; }
    const { file, ...meta } = e;
    files.push({ ...meta, absPath: dst });
  }
  // A hit is valid with zero files IF brand signals were cached (a fonts/colours-only
  // harvest) — otherwise the entry is unservable and we re-harvest.
  if (!files.length && !manifest.brandSignals) return null;
  return { files, brandSignals: manifest.brandSignals || null };
}
function saveHarvestCache(baseUrl, files, brandSignals) {
  const key = originKeyFor(baseUrl); if (!key) return;
  const dir = path.join(harvestCacheDir(), key);
  try { fs.mkdirSync(dir, { recursive: true }); } catch { return; }
  const entries = [];
  for (const f of files) {
    if (!f || !f.absPath) continue;
    const base = path.basename(f.absPath);
    try { fs.copyFileSync(f.absPath, path.join(dir, base)); } catch { continue; }
    const { absPath, ...meta } = f;
    entries.push({ ...meta, file: base });
  }
  let origin = null; try { origin = new URL(baseUrl).origin; } catch { /* noop */ }
  try { fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ origin, fetchedAt: Date.now(), brandSignals: brandSignals || null, files: entries }), "utf8"); }
  catch { /* best-effort */ }
}

// ---------------------------------------------------------------- harvest

let seq = 0; // per-process, only for temp filenames

// Harvest the site's own asset files off the already-loaded homepage. Returns
// on-disk file records (no classification/dedup — the integration layer does that).
// FAIL-OPEN: never throws; harvesting to zero assets is fine.
async function harvestSiteAssets({ page, baseUrl, workDir, isAuthWall = false } = {}) {
  const h = config.harvester || {};
  const review = { discovered: 0, downloaded: 0, dropped: [], notes: [] };
  // Brand signals (fonts + computed palette) are DOM-derived, not files — capture them
  // even on an auth wall (the login chrome still carries the brand's type + colours).
  let brandSignals = null;
  try { brandSignals = await discoverBrandSignals(page); } catch { brandSignals = null; }
  if (isAuthWall) { review.notes.push("auth wall — brand-asset harvest skipped"); return { files: [], review, brandSignals }; }

  const outDir = path.join(workDir, "brand_assets");
  try { fs.mkdirSync(outDir, { recursive: true }); } catch { /* noop */ }

  // Per-domain cache hit: reuse a recent harvest for this origin (copy files + reuse
  // brand signals), skipping discovery + all network fetches. Fail-open.
  if (h.cache && !isAuthWall) {
    try {
      const cached = loadHarvestCache(baseUrl, outDir);
      // An EMPTY cache entry is never served. A harvest that yielded no files is far
      // more likely to be a transient failure (the page hadn't hydrated, the fetch
      // budget expired, the run pre-dated a fix) than a real finding about the domain
      // — and caching that verdict for a week means every later film for that brand
      // silently ships with no logo, with a "served from cache" note explaining why
      // nothing was even attempted. Observed exactly this on wisprflow.ai: 80 assets
      // discoverable on the live page, 0 served from a stale entry.
      //
      // Re-crawling costs one bounded, budgeted pass; a week of logo-less films does
      // not have a bound. Brand signals are still adopted from the entry if present.
      if (cached && cached.files.length) {
        review.discovered = cached.files.length;
        review.downloaded = cached.files.length;
        review.notes.push("served from per-domain cache (skipped re-crawl)");
        return { files: cached.files, review, brandSignals: cached.brandSignals || brandSignals };
      }
      if (cached && !cached.files.length) {
        review.notes.push("ignored an empty cache entry — re-harvesting");
        if (!brandSignals && cached.brandSignals) brandSignals = cached.brandSignals;
      }
    } catch { /* cache miss → live harvest */ }
  }

  let candidates = [];
  try { candidates = await discoverAssetsInPage(page); } catch (e) { review.notes.push(`discovery failed: ${String(e.message).slice(0, 80)}`); return { files: [], review, brandSignals }; }
  review.discovered = candidates.length;

  const maxAssets = Number.isFinite(h.maxAssets) ? h.maxAssets : 24;
  const budgetMs = Number.isFinite(h.budgetMs) ? h.budgetMs : 15000;
  const concurrency = Number.isFinite(h.fetchConcurrency) ? h.fetchConcurrency : 6;
  const perAssetMs = 8000;
  const deadline = Date.now() + budgetMs;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), budgetMs);

  // Rank so the caps bite junk first: logos/hero/JSON-LD before generic imgs; larger first.
  const weight = (c) => (c.isVideo ? 3 : c.discovery === "jsonld-logo" ? 5 : /logo|brand|wordmark/i.test(c.cls + " " + c.alt) ? 4 : c.discovery === "og" || c.discovery === "twitter" ? 3 : c.isSvg ? 2 : 1);
  candidates.sort((a, b) => (weight(b) - weight(a)) || ((b.w * b.h) - (a.w * a.h)));
  const queue = candidates.slice(0, maxAssets);

  const files = [];
  // Harvested VIDEOS: capped low (a single hero clip) — videos are heavy and the render
  // pipeline itself allows only 1-2 concurrent. SSRF-bounded by the 16MB cap + VID_MIME
  // allowlist on top of the assertPublicUrl/IP-pinning fetchGuarded already enforces.
  let videoCount = 0;
  const MAX_VIDEOS = Number.isFinite(h.maxVideos) ? h.maxVideos : 1;
  const materializeVideo = async (c) => {
    if (videoCount >= MAX_VIDEOS) { review.dropped.push({ url: c.url, reason: "video-cap" }); return; }
    if (deadline - Date.now() <= 0) { review.dropped.push({ url: c.url, reason: "deadline" }); return; }
    const got = await fetchGuarded(c.url, { timeoutMs: 15000, maxBytes: TYPE_BYTE_CAP.video, allowMime: VID_MIME, signal: ac.signal, referer: baseUrl });
    if (!got || !got.buf || !got.buf.length) { review.dropped.push({ url: c.url, reason: "fetch" }); return; }
    const ext = sniffVideo(got.buf);
    if (!ext) { review.dropped.push({ url: c.url, reason: "not-a-video" }); return; }
    const abs = path.join(outDir, `v${seq++}.${ext}`);
    try { fs.writeFileSync(abs, got.buf); } catch { review.dropped.push({ url: c.url, reason: "write-fail" }); return; }
    // Validate a REAL, SHORT video: a video stream WITH dims + a 1-60s duration (a hero
    // clip, not a movie or an audio-only file). Both probes required — audio-only has a
    // duration but no width, so the width check is what proves it's actually video.
    const [probe, dur] = await Promise.all([ffprobeImage(abs).catch(() => null), probeDurationSec(abs).catch(() => null)]);
    if (!probe || !probe.width || !probe.height || dur == null || dur < 1 || dur > 60) {
      review.dropped.push({ url: c.url, reason: dur != null && dur > 60 ? "video-too-long" : "not-a-video" });
      try { fs.unlinkSync(abs); } catch { /* noop */ }
      return;
    }
    // Re-encode to keyframe-dense H.264 (in place) so HyperFrames seeks it frame-accurately,
    // exactly as the stock-video path does. A ~16MB clip re-encodes in seconds.
    try { await reencodeForHyperframes(abs); } catch { /* keep original — still plays, seeks coarser */ }
    videoCount++;
    files.push({ absPath: abs, url: c.url, discovery: c.discovery, isVideo: true, isSvg: false, nearHeader: !!c.nearHeader, alt: c.alt || "product video", cls: c.cls || "", width: probe.width, height: probe.height, hasAlpha: false, mime: got.mime || `video/${ext}`, bytes: got.buf.length, assetType: "video", kindHint: "video", durationSec: Math.round(dur * 10) / 10 });
  };
  const materialize = async (c) => {
    if (Date.now() > deadline) { review.dropped.push({ url: c.url || "inline-svg", reason: "deadline" }); return; }
    if (c.isVideo) { await materializeVideo(c); return; }
    // Inline SVG: sanitize + write directly, no network.
    if (c.inlineSvg) {
      try {
        const clean = sanitizeSvg(c.inlineSvg);
        // A vector that paints nothing is worse than no vector: as an <img> it renders an
        // empty box, and the composer's alt text shows in its place.
        if (!svgPaintsSomething(clean)) { review.dropped.push({ url: "inline-svg", reason: "blank-svg" }); return; }
        const abs = path.join(outDir, `a${seq++}.svg`);
        fs.writeFileSync(abs, clean, "utf8");
        files.push({ absPath: abs, url: null, discovery: c.discovery, isSvg: true, nearHeader: !!c.nearHeader, alt: c.alt || "", cls: c.cls || "", width: c.w || 0, height: c.h || 0, hasAlpha: true, mime: "image/svg+xml", bytes: Buffer.byteLength(clean), styleColors: Array.isArray(c.styleColors) ? c.styleColors : [] });
      } catch { review.dropped.push({ url: "inline-svg", reason: "write-fail" }); }
      return;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) { review.dropped.push({ url: c.url, reason: "deadline" }); return; }
    const isSvg = c.isSvg;
    const cap = isSvg ? TYPE_BYTE_CAP.svg : TYPE_BYTE_CAP.image;
    const got = await fetchGuarded(c.url, { timeoutMs: Math.min(perAssetMs, remaining), maxBytes: cap, signal: ac.signal, referer: baseUrl });
    if (!got || !got.buf || !got.buf.length) { review.dropped.push({ url: c.url, reason: "fetch" }); return; }
    let ext = sniffImage(got.buf);
    if (!ext) { review.dropped.push({ url: c.url, reason: "not-an-image" }); return; }
    try {
      let abs = path.join(outDir, `a${seq++}.${ext}`);
      if (ext === "svg") {
        const clean = sanitizeSvg(got.buf.toString("utf8"));
        if (!svgPaintsSomething(clean)) { review.dropped.push({ url: c.url, reason: "blank-svg" }); return; }
        fs.writeFileSync(abs, clean, "utf8");
      }
      else { fs.writeFileSync(abs, got.buf); }
      let width = c.w || 0, height = c.h || 0, hasAlpha = ext === "png" || ext === "webp" || ext === "gif";
      // Skip the probe once the budget is spent — fall back to the DOM natural w/h so a
      // late-completing fetch can't extend the stage by another ffprobe timeout.
      if (ext !== "svg" && Date.now() <= deadline) {
        const probe = await ffprobeImage(abs).catch(() => null);
        if (probe) { width = probe.width || width; height = probe.height || height; hasAlpha = pixFmtHasAlpha(probe.pixFmt); }
      }
      files.push({ absPath: abs, url: c.url, discovery: c.discovery, isSvg: ext === "svg", nearHeader: !!c.nearHeader, alt: c.alt || "", cls: c.cls || "", width, height, hasAlpha, mime: got.mime || `image/${ext}`, bytes: got.buf.length });
    } catch { review.dropped.push({ url: c.url, reason: "write-fail" }); }
  };

  // Bounded-concurrency pool.
  let idx = 0;
  const worker = async () => { while (idx < queue.length && Date.now() <= deadline) { const c = queue[idx++]; await materialize(c); } };
  try { await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, worker)); }
  finally { clearTimeout(timer); }

  // BOUNDED SAME-ORIGIN CRAWL (config.harvester.crawl, DEFAULT OFF) — extension point.
  // Homepage discovery already yields the logo/colours/fonts + hero/product imagery, so a
  // multi-page crawl is the roadmap's lowest-lift item and ships OFF: each extra page is a
  // new browser.newPage()+goto that MUST be assertPublicUrl-guarded (redirect SSRF) and
  // adds ~6s latency. When enabled, pickFrontier(navHrefs, origin).slice(0, crawlMaxPages)
  // would open each page, dismissOverlays, discoverAssetsInPage, and merge candidates
  // (deduped) before the fetch loop above. Deliberately not wired in v1.
  review.downloaded = files.length;
  if (candidates.length > queue.length) review.notes.push(`capped at ${queue.length} of ${candidates.length} discovered`);
  // Persist to the per-domain cache for the next job on this origin (best-effort).
  if (h.cache && (files.length || brandSignals)) { try { saveHarvestCache(baseUrl, files, brandSignals); } catch { /* noop */ } }
  return { files, review, brandSignals };
}

module.exports = {
  harvestSiteAssets, discoverAssetsInPage, discoverBrandSignals,
  // exported for unit tests / reuse
  assertPublicUrl, fetchGuarded, sanitizeSvg, unhideSvgRoot, ensureSvgNamespace, svgPaintsSomething, sniffImage,
  _internal: { isBlockedAddress, v4ToBig, v6ToBig, inBlock },
};
