// VIDEO EDIT B-ROLL SAFE FETCH — every B-roll media download (thumbnails, chosen assets) goes through here.
//
// WHY THIS EXISTS. Thumbnail and asset URLs are provider data, and Openverse originals live on arbitrary
// third-party hosts (a hostile indexed source controls both the URL and its redirects). A plain
// `fetch(url, { redirect:'follow' })` on the server will happily GET https://127.0.0.1:8443/…, follow a 302 to
// http://169.254.169.254/latest/meta-data, or reach a LAN admin port: a server-side request forgery whose
// magic-byte checks only limit what is KEPT, not what is REQUESTED. So:
//   - https only, no credentials in the URL, default port only;
//   - the host is resolved first and EVERY address must be public (loopback, private, link-local, CGNAT,
//     ULA, multicast, documentation, benchmarking, NAT64/6to4/mapped forms of those, metadata ranges are
//     refused); an IP-literal host is checked directly;
//   - the production transport (node:https) is PINNED to the checked address through its `lookup` hook, so
//     a DNS answer that changes between check and connect (rebinding) cannot swap it; SNI and certificate
//     validation still use the hostname;
//   - redirects are manual, at most 3 hops, each Location re-validated by the same rules.
// An injected `fetch` (tests) is a trusted double: URL, scheme, port, literal-IP and redirect rules still apply,
// and DNS is checked only when a `lookup` is injected too (tests never touch real DNS).
//
// CONTRACT:
//   safeFetch(url, { fetch?, lookup?, signal?, headers?, maxRedirects=3 }) -> Promise<Response>
//     throws EditError BROLL_URL_BLOCKED (input, extra.reason: bad_url | port | credentials | private_address |
//       dns | redirect_limit) · rethrows transport errors (network / abort) unchanged
//   isPublicAddress(ip) -> boolean · checkUrl(url) -> URL (throws BROLL_URL_BLOCKED)

const dns = require("node:dns");
const net = require("node:net");
const https = require("node:https");
const { Readable } = require("node:stream");
const { EditError } = require("../errors");

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function blocked(reason) {
  return new EditError("BROLL_URL_BLOCKED", { status: 422, errorClass: "input", retryable: false, detail: reason, extra: { reason } });
}

const V4_BLOCKS = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];
const v4Int = (ip) => ip.split(".").reduce((a, o) => ((a * 256) + Number(o)) >>> 0, 0);
const V4_MASKS = V4_BLOCKS.map(([base, bits]) => ({ base: v4Int(base), mask: bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0 }));

function isPublicV4(ip) {
  if (net.isIP(ip) !== 4) return false;
  const n = v4Int(ip);
  return !V4_MASKS.some(({ base, mask }) => ((n & mask) >>> 0) === ((base & mask) >>> 0));
}

// -> 8 hextets, or null
function expandV6(ip) {
  let s = String(ip).replace(/^\[|\]$/g, "").split("%")[0];
  if (net.isIP(s) !== 6) return null;
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const n = v4Int(v4[1]);
    s = `${s.slice(0, v4.index)}${((n >>> 16) & 0xffff).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, tail] = s.includes("::") ? s.split("::") : [s, null];
  const h = head ? head.split(":").filter((x) => x !== "") : [];
  const t = tail ? tail.split(":").filter((x) => x !== "") : [];
  const fill = tail === null ? [] : new Array(8 - h.length - t.length).fill("0");
  const parts = [...h, ...fill, ...t].map((x) => parseInt(x, 16));
  return parts.length === 8 && parts.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? parts : null;
}

const v4Of = (hi, lo) => [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");

function isPublicAddress(ip) {
  const fam = net.isIP(String(ip).replace(/^\[|\]$/g, "").split("%")[0]);
  if (fam === 4) return isPublicV4(String(ip));
  if (fam !== 6) return false;
  const h = expandV6(ip);
  if (!h) return false;
  const zeros = (from, to) => h.slice(from, to).every((x) => x === 0);
  if (zeros(0, 8)) return false;                                            // ::
  if (zeros(0, 7) && h[7] === 1) return false;                              // ::1
  if (zeros(0, 5) && h[5] === 0xffff) return isPublicV4(v4Of(h[6], h[7]));  // ::ffff:a.b.c.d
  if (zeros(0, 6)) return false;                                            // ::a.b.c.d (deprecated compat)
  if (h[0] === 0x64 && h[1] === 0xff9b && zeros(2, 6)) return isPublicV4(v4Of(h[6], h[7])); // NAT64
  if (h[0] === 0x2002) return isPublicV4(v4Of(h[1], h[2]));                 // 6to4
  if (h[0] === 0x2001 && h[1] === 0) return false;                          // Teredo
  if (h[0] === 0x2001 && h[1] === 0x0db8) return false;                     // documentation
  if ((h[0] & 0xfe00) === 0xfc00) return false;                             // ULA fc00::/7
  if ((h[0] & 0xffc0) === 0xfe80 || (h[0] & 0xffc0) === 0xfec0) return false; // link-local / site-local
  if ((h[0] & 0xff00) === 0xff00) return false;                             // multicast
  return true;
}

function checkUrl(url) {
  let u;
  try { u = new URL(String(url)); } catch { throw blocked("bad_url"); }
  if (u.protocol !== "https:" || String(url).length > 2048) throw blocked("bad_url");
  if (u.username || u.password) throw blocked("credentials");
  if (u.port !== "") throw blocked("port");
  return u;
}

async function resolveHost(host, lookup) {
  const bare = host.replace(/^\[|\]$/g, "");
  const fam = net.isIP(bare);
  if (fam) {
    if (!isPublicAddress(bare)) throw blocked("private_address");
    return { address: bare, family: fam };
  }
  if (typeof lookup !== "function") return null;
  let list;
  try { list = await lookup(bare, { all: true, verbatim: true }); } catch { throw blocked("dns"); }
  list = (Array.isArray(list) ? list : [list]).filter((x) => x && typeof x.address === "string");
  if (!list.length) throw blocked("dns");
  if (list.some((x) => !isPublicAddress(x.address))) throw blocked("private_address");
  return { address: list[0].address, family: list[0].family === 6 ? 6 : 4 };
}

// node:https pinned to `addr`; the result is a WHATWG Response streaming the body.
function pinnedRequest(u, addr, { headers = {}, signal = null }) {
  return new Promise((resolve, reject) => {
    const lookup = (_host, opts, cb) => {
      if (opts && opts.all) cb(null, [{ address: addr.address, family: addr.family }]);
      else cb(null, addr.address, addr.family);
    };
    const hostname = u.hostname.replace(/^\[|\]$/g, "");
    const req = https.request({
      protocol: "https:", host: hostname, port: 443, path: `${u.pathname}${u.search}`, method: "GET",
      headers: { "accept-encoding": "identity", ...headers }, lookup, signal: signal || undefined, agent: false,
      servername: net.isIP(hostname) ? undefined : hostname,
    }, (res) => {
      const h = new Headers();
      for (const [k, v] of Object.entries(res.headers)) {
        if (v == null) continue;
        for (const one of Array.isArray(v) ? v : [v]) { try { h.append(k, String(one)); } catch { /* skip invalid */ } }
      }
      const status = Number(res.statusCode) || 0;
      if (status < 200 || status > 599) { res.destroy(); reject(new Error(`bad status ${status}`)); return; }
      const noBody = status === 204 || status === 304;
      if (noBody) res.resume();
      resolve(new Response(noBody ? null : Readable.toWeb(res), { status, statusText: res.statusMessage || "", headers: h }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function safeFetch(url, { fetch: fetchImpl = null, lookup = null, signal = null, headers = {}, maxRedirects = 3 } = {}) {
  const injected = typeof fetchImpl === "function";
  const doLookup = typeof lookup === "function" ? lookup : (injected ? null : dns.promises.lookup);
  let current = String(url);
  for (let hop = 0; ; hop++) {
    const u = checkUrl(current);
    const addr = await resolveHost(u.hostname, doLookup);
    const res = injected
      ? await fetchImpl(u.toString(), { method: "GET", signal: signal || undefined, redirect: "manual", headers })
      : await pinnedRequest(u, addr, { headers, signal });
    if (!res || !REDIRECTS.has(Number(res.status))) return res;
    const loc = res.headers && typeof res.headers.get === "function" ? res.headers.get("location") : null;
    try { if (res.body && typeof res.body.cancel === "function") await res.body.cancel(); } catch { /* noop */ }
    if (!loc) return res;
    if (hop >= maxRedirects) throw blocked("redirect_limit");
    try { current = new URL(loc, u).toString(); } catch { throw blocked("bad_url"); }
  }
}

module.exports = { safeFetch, isPublicAddress, checkUrl, expandV6 };
