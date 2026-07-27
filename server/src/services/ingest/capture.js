// Intelligent website CAPTURE — the page-side half of Screenshot Intelligence.
//
// WHY THIS EXISTS (the audit that produced it):
// A 9:16 film for wisprflow.ai shipped three "product screenshots" that each carried
// a full Usercentrics consent banner across the bottom AND showed the whole page
// greyed out by the CMP's dimming scrim. The old dismissOverlays() could not have
// worked on that site for two independent reasons:
//
//   1) SHADOW DOM. Usercentrics (and Cookiebot/Osano/Didomi/…) render their banner
//      inside a closed-off custom element (`<div id="usercentrics-root">` + shadow
//      root). `document.querySelectorAll('[id*="cookie"]')` cannot see into a shadow
//      root, so neither the accept-click nor the hide-by-selector ever matched. The
//      banner was never even a candidate for dismissal.
//   2) THE SCRIM WAS NEVER THE TARGET. Even where a banner WAS hidden, the separate
//      full-viewport dimming layer (and the `body{overflow:hidden;filter:blur()}`
//      scroll-lock a modal installs) survived — which is why every capture came back
//      desaturated. A grey page is not a fixable-later problem: brand-colour
//      extraction, the vision gate and the composer all inherit the wash.
//
// So capture is rebuilt around three principles:
//
//   A) DOM TRUTH OVER PIXEL FORENSICS. We decide whether a capture is clean by
//      asking the live page what is covering it (element geometry + z-order), not by
//      guessing from JPEG bytes afterwards. `assessViewport()` is the authority; the
//      pixel checks in screenshot_intake.js remain as the second, independent net.
//   B) DISMISS, VERIFY, ESCALATE. Every removal pass is followed by a re-assessment.
//      If an obstruction survives, we escalate (click → hide → remove host → nuke by
//      geometry) rather than assuming the first pass worked.
//   C) SECTIONS, NOT SCROLL FRACTIONS. The old code captured at 35% and 70% of page
//      height — arbitrary offsets that sliced cards in half and framed dead bands.
//      We now find real content sections, score them by what a marketing film wants
//      (hero, product UI, pricing, features, testimonials, CTA) and align the
//      viewport to a section's own top edge.
//
// No native deps, no LLM, deterministic, and fail-open at every step: any failure
// degrades to "capture it anyway and let the intake gate judge the pixels".

// ---------------------------------------------------------------------------
// Browser-side source. These run inside page.evaluate, so they must be
// self-contained (no closure over Node scope) and must never throw.
// ---------------------------------------------------------------------------

// Collect matches for `sel` across the document AND every open shadow root.
// This is the single fix that makes consent dismissal work on modern CMPs.
const DEEP_QUERY_FN = `
function __deepAll(sel, root, out, depth) {
  out = out || []; depth = depth || 0;
  if (depth > 8) return out;
  root = root || document;
  try { root.querySelectorAll(sel).forEach(function (e) { out.push(e); }); } catch (e) {}
  try {
    root.querySelectorAll('*').forEach(function (e) {
      if (e.shadowRoot) __deepAll(sel, e.shadowRoot, out, depth + 1);
    });
  } catch (e) {}
  return out;
}
function __deepHosts() {
  var hosts = [];
  try {
    document.querySelectorAll('*').forEach(function (e) { if (e.shadowRoot) hosts.push(e); });
  } catch (e) {}
  return hosts;
}`;

// The consent-management platforms worth knowing by name. Each entry is the
// container we remove outright once we've tried its accept control — removing the
// HOST kills the banner, its scrim and its scroll-lock in one move, which selector
// hiding never did.
const CMP_HOSTS = [
  "#usercentrics-root", "#usercentrics-cmp-ui", "[id^='usercentrics']",
  "#onetrust-consent-sdk", "#onetrust-banner-sdk", ".onetrust-pc-dark-filter",
  "#CybotCookiebotDialog", "#CybotCookiebotDialogBodyUnderlay",
  ".osano-cm-window", ".osano-cm-dialog",
  "#truste-consent-track", "#consent_blackbar",
  ".qc-cmp2-container", ".qc-cmp-cleanslate",
  "#didomi-host", ".didomi-popup-open",
  ".klaro", ".cookie-modal",
  "#cookie-law-info-bar", "#cookie-law-info-again",
  ".cmplz-cookiebanner", ".cmplz-blocked-content-notice",
  "#termly-code-snippet-support",
  "#iubenda-cs-banner", ".iubenda-cs-container",
  "#cookiescript_injected", "#cookiescript_injected_wrapper",
  "#hs-eu-cookie-confirmation",
  "#gdpr-cookie-message", "#cc-window", ".cc-window", ".cc-banner",
  "#sp_message_container_1", "[id^='sp_message_container']",
  "#axeptio_overlay", "#axeptio_main_button",
];

// Accept/reject labels. Deliberately anchored (full-string) so they can never match
// a product CTA like "Accept invitation" or a login control.
const ACCEPT_RX = "^(accept all|accept all cookies|accept cookies|accept|allow all|allow cookies|allow|agree|i agree|i accept|got it|understood|ok|okay|continue|continue to site)$";
const REJECT_RX = "^(reject all|reject|decline all|decline|deny|refuse|only necessary|necessary only|essential only|use necessary cookies only|save preferences|dismiss|close|no thanks|not now|maybe later)$";

/**
 * Remove consent banners, modals, chat widgets, promo bars — AND the dimming
 * scrim + scroll-lock they install. Escalates: click → hide → remove host →
 * geometric nuke. Returns a report; never throws.
 */
async function clearOverlays(page, { isAuthWall = false, aggressive = false } = {}) {
  const empty = { clicked: null, removedHosts: [], scrims: 0, geometric: 0, unlocked: false };
  try {
    const report = await page.evaluate(
      // eslint-disable-next-line no-new-func
      new Function("authWall", "cmpHosts", "acceptRx", "rejectRx", "aggressive", `
        ${DEEP_QUERY_FN}
        var out = { clicked: null, removedHosts: [], scrims: 0, geometric: 0, unlocked: false };
        var vw = window.innerWidth, vh = window.innerHeight;
        var rxA = new RegExp(acceptRx, "i"), rxR = new RegExp(rejectRx, "i");

        // ---- 1) Consent CLICK, shadow-DOM aware. -----------------------------
        // Prefer a REJECT/necessary-only control: it dismisses the banner without
        // opting the capture session into third-party trackers we don't want
        // loading anyway (fewer late network requests = a more stable page).
        if (!authWall) {
          var clickable = __deepAll('button,[role="button"],a[href="#"],a:not([href]),input[type="button"],input[type="submit"]');
          var pick = function (rx) {
            for (var i = 0; i < clickable.length; i++) {
              var el = clickable[i];
              var t = "";
              try { t = (el.innerText || el.value || el.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim(); } catch (e) {}
              if (!t || t.length > 40) continue;
              if (!rx.test(t)) continue;
              // Must be visible and reasonably sized — never click a 0x0 shim.
              var r = null; try { r = el.getBoundingClientRect(); } catch (e) {}
              if (!r || r.width < 20 || r.height < 12) continue;
              return { el: el, text: t };
            }
            return null;
          };
          var hit = pick(rxR) || pick(rxA);
          if (hit) { try { hit.el.click(); out.clicked = hit.text; } catch (e) {} }
        }

        // ---- 2) Remove known CMP HOSTS outright. -----------------------------
        // Removing the host element takes the banner, its backdrop and its
        // body-lock with it. Selector-hiding only ever got the banner.
        cmpHosts.forEach(function (sel) {
          var found = [];
          try { found = __deepAll(sel); } catch (e) {}
          found.forEach(function (el) {
            try {
              if (!el || !el.parentNode) return;
              el.parentNode.removeChild(el);
              out.removedHosts.push(sel);
            } catch (e) {}
          });
        });

        // ---- 3) Generic overlay family (shadow-aware, positioned-only). ------
        var sel = [
          '[id*="cookie" i]','[class*="cookie" i]','[id*="consent" i]','[class*="consent" i]',
          '[id*="gdpr" i]','[class*="gdpr" i]','[aria-label*="cookie" i]',
          '[id*="newsletter" i]','[class*="newsletter" i]','[class*="subscribe" i]','[id*="subscribe" i]',
          '[class*="signup-modal" i]','[class*="email-capture" i]','[class*="popup" i]','[id*="popup" i]',
          '[class*="announcement" i]','[class*="promo-bar" i]','[class*="smart-banner" i]','[class*="app-banner" i]',
          '[class*="exit-intent" i]','[class*="interstitial" i]',
          '.intercom-lightweight-app','.intercom-app','#intercom-container','[class*="intercom" i]',
          '#drift-widget','.drift-widget','[id*="drift" i]',
          '#hubspot-messages-iframe-container','[id*="hubspot" i][class*="chat" i]',
          '[id*="zendesk" i]','#launcher','.zEWidget-launcher','[data-testid="chat-widget"]',
          '.crisp-client','#crisp-chatbox','[class*="crisp" i]',
          '#tawkchat-container','.tawk-min-container','[id*="tawk" i]',
          '[class*="chat-widget" i]','[id*="chat-widget" i]','[class*="livechat" i]'
        ].join(",");
        __deepAll(sel).forEach(function (el) {
          try {
            var st = getComputedStyle(el);
            if (st.position === "fixed" || st.position === "sticky" || st.position === "absolute") {
              el.style.setProperty("display", "none", "important");
            }
          } catch (e) {}
        });

        // ---- 4) SCRIMS + high-z geometric overlays. --------------------------
        // A fixed/absolute element that covers a large share of the viewport and
        // sits above the page is an overlay by construction, whatever it is called.
        // This is what finally kills the un-named dimming layer that greyed every
        // previous capture.
        var all = [];
        try { all = __deepAll('div,section,aside,dialog,ins,iframe'); } catch (e) {}
        all.forEach(function (el) {
          try {
            if (!el || !el.getBoundingClientRect) return;
            var st = getComputedStyle(el);
            if (st.position !== "fixed" && st.position !== "absolute") return;
            if (st.display === "none" || st.visibility === "hidden") return;
            var r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return;
            var coverW = r.width / vw, coverH = r.height / vh;
            var z = parseInt(st.zIndex, 10) || 0;
            var area = coverW * coverH;
            // A scrim: near-full-viewport, translucent or dark, above the fold.
            var isScrim = coverW >= 0.9 && coverH >= 0.9 && r.top <= 4 && (z >= 1 || st.backgroundColor !== "rgba(0, 0, 0, 0)");
            // A banner: full-width strip pinned to an edge, tall enough to matter.
            var atBottom = r.bottom >= vh - 8, atTop = r.top <= 8;
            var isBanner = coverW >= 0.75 && coverH >= 0.06 && coverH <= 0.6 && (atBottom || atTop) && z >= 5;
            // A modal: big, centred, high z.
            var isModal = area >= 0.25 && z >= 900;
            if (isScrim || isBanner || isModal) {
              el.style.setProperty("display", "none", "important");
              out.scrims += isScrim ? 1 : 0;
              out.geometric += 1;
            }
          } catch (e) {}
        });

        // ---- 5) Release the page the modal locked. ---------------------------
        // A CMP typically sets body{overflow:hidden}, sometimes position:fixed, and
        // (the grey-capture culprit on some stacks) filter:blur/brightness or a
        // reduced opacity on the app root. Undo all of it, on both body and the
        // usual app roots.
        var roots = [document.documentElement, document.body];
        ["#__next", "#root", "#app", "main", "[data-reactroot]"].forEach(function (s) {
          try { var e = document.querySelector(s); if (e) roots.push(e); } catch (er) {}
        });
        roots.forEach(function (el) {
          if (!el) return;
          try {
            var st = getComputedStyle(el);
            if (st.overflow === "hidden" || st.overflowY === "hidden") { el.style.setProperty("overflow", "visible", "important"); out.unlocked = true; }
            if (st.position === "fixed") { el.style.setProperty("position", "static", "important"); out.unlocked = true; }
            if (st.filter && st.filter !== "none") { el.style.setProperty("filter", "none", "important"); out.unlocked = true; }
            if (st.opacity && parseFloat(st.opacity) < 0.99) { el.style.setProperty("opacity", "1", "important"); out.unlocked = true; }
            if (st.pointerEvents === "none") { el.style.setProperty("pointer-events", "auto", "important"); }
          } catch (e) {}
          try { el.removeAttribute("aria-hidden"); } catch (e) {}
          try {
            // Class-based locks (…-open / no-scroll / modal-open) are extremely common.
            var cls = (el.className && el.className.baseVal !== undefined) ? el.className.baseVal : el.className;
            if (typeof cls === "string" && /(^|\\s)(\\S*(modal|popup|overlay|menu|nav|dialog|consent)\\S*-open|no-scroll|noscroll|scroll-lock|overflow-hidden|lock-scroll)(\\s|$)/i.test(cls)) {
              el.className = cls.replace(/(^|\\s)(\\S*(modal|popup|overlay|menu|nav|dialog|consent)\\S*-open|no-scroll|noscroll|scroll-lock|overflow-hidden|lock-scroll)(?=\\s|$)/gi, " ").replace(/\\s{2,}/g, " ").trim();
              out.unlocked = true;
            }
          } catch (e) {}
        });

        // ---- 6) Aggressive pass — only when an obstruction SURVIVED. ---------
        // Lower the bar: anything fixed above the fold with a real z-index that is
        // not the site's own header. Used as the last escalation, never by default,
        // because a sticky nav is legitimate page furniture.
        if (aggressive) {
          all.forEach(function (el) {
            try {
              var st = getComputedStyle(el);
              if (st.position !== "fixed") return;
              if (st.display === "none") return;
              var r = el.getBoundingClientRect();
              if (r.width < vw * 0.5) return;
              var z = parseInt(st.zIndex, 10) || 0;
              if (z < 100) return;
              // Keep a plausible site header: thin, at the very top, low-ish z.
              if (r.top <= 2 && r.height <= vh * 0.14 && z < 1000) return;
              el.style.setProperty("display", "none", "important");
              out.geometric += 1;
            } catch (e) {}
          });
        }
        return out;
      `),
      isAuthWall, CMP_HOSTS, ACCEPT_RX, REJECT_RX, aggressive
    );
    // ESC for well-behaved dialogs, then let removals settle/animate out.
    try { await page.keyboard.press("Escape"); } catch { /* noop */ }
    await sleep(320);
    return { ...empty, ...report };
  } catch {
    return empty; // best-effort: never blocks a capture
  }
}

/**
 * What is actually covering the viewport right now, and is there anything worth
 * photographing? This is the capture-time quality authority — DOM truth, not a
 * guess from pixels. Returns coverage of the largest obstruction, total obstructed
 * area, and a content read (visible text, media, headings).
 */
async function assessViewport(page) {
  const fallback = { obstructions: [], maxCoveragePct: 0, obstructedPct: 0, textChars: 0, headings: 0, media: 0, contentScore: 0, scrolledY: 0 };
  try {
    return await page.evaluate(
      // eslint-disable-next-line no-new-func
      new Function(`
        ${DEEP_QUERY_FN}
        var vw = window.innerWidth, vh = window.innerHeight, va = vw * vh;
        var obstructions = [], obstructedArea = 0;
        var nodes = [];
        try { nodes = __deepAll('div,section,aside,dialog,iframe,ins'); } catch (e) {}
        nodes.forEach(function (el) {
          try {
            var st = getComputedStyle(el);
            if (st.position !== "fixed" && st.position !== "absolute") return;
            if (st.display === "none" || st.visibility === "hidden") return;
            if (parseFloat(st.opacity || "1") < 0.05) return;
            var r = el.getBoundingClientRect();
            // Only the part inside the viewport counts.
            var x0 = Math.max(0, r.left), y0 = Math.max(0, r.top);
            var x1 = Math.min(vw, r.right), y1 = Math.min(vh, r.bottom);
            if (x1 <= x0 || y1 <= y0) return;
            var area = (x1 - x0) * (y1 - y0);
            if (area / va < 0.04) return;             // ignore small furniture
            var z = parseInt(st.zIndex, 10) || 0;
            if (z < 5) return;                         // in-flow-ish, not an overlay
            // A site header pinned at the top is legitimate; don't call it an obstruction.
            if (r.top <= 2 && (y1 - y0) <= vh * 0.14) return;
            var id = "";
            try { id = (el.id || (typeof el.className === "string" ? el.className : "") || el.tagName).toString().slice(0, 60); } catch (e) {}
            var kind = /cookie|consent|gdpr|privacy|usercentrics|onetrust|cookiebot|osano|didomi/i.test(id) ? "cookie"
                     : /newsletter|subscribe|email|signup/i.test(id) ? "newsletter"
                     : /chat|intercom|drift|crisp|tawk|zendesk/i.test(id) ? "chat"
                     : /modal|dialog|popup|overlay|backdrop|scrim/i.test(id) ? "modal"
                     : "unknown";
            obstructions.push({ kind: kind, id: id, pct: Math.round((area / va) * 100), z: z });
            obstructedArea += area;
          } catch (e) {}
        });
        obstructions.sort(function (a, b) { return b.pct - a.pct; });

        // Content read — is this viewport worth photographing at all?
        var textChars = 0, headings = 0, media = 0;
        try {
          var inView = function (el) {
            var r = el.getBoundingClientRect();
            return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw && r.width > 0 && r.height > 0;
          };
          document.querySelectorAll("h1,h2,h3").forEach(function (h) { if (inView(h)) headings++; });
          document.querySelectorAll("p,li,h1,h2,h3,h4,span,a,button").forEach(function (t) {
            if (!inView(t)) return;
            if (t.children && t.children.length) return;           // leaf text only, no double count
            var s = (t.innerText || "").trim();
            if (s) textChars += Math.min(s.length, 300);
          });
          document.querySelectorAll("img,video,canvas,svg,picture,[style*='background-image']").forEach(function (m) {
            if (!inView(m)) return;
            var r = m.getBoundingClientRect();
            if (r.width * r.height >= va * 0.02) media++;
          });
        } catch (e) {}
        var contentScore = Math.min(100, Math.round(headings * 14 + Math.min(textChars, 1400) / 28 + Math.min(media, 6) * 6));
        return {
          obstructions: obstructions.slice(0, 6),
          maxCoveragePct: obstructions.length ? obstructions[0].pct : 0,
          obstructedPct: Math.round((obstructedArea / va) * 100),
          textChars: textChars, headings: headings, media: media,
          contentScore: contentScore,
          scrolledY: Math.round(window.scrollY || 0)
        };
      `)
    );
  } catch {
    return fallback;
  }
}

/**
 * Wait until the page is genuinely ready to photograph: fonts loaded, in-view
 * images decoded, no pending layout shift. The old code slept a flat 1200ms and
 * shot whatever was there, which is how a half-rendered section became an asset.
 */
async function waitForStable(page, { timeoutMs = 6000 } = {}) {
  try {
    await page.evaluate(
      // eslint-disable-next-line no-new-func
      new Function("budget", `
        return new Promise(function (resolve) {
          var done = false;
          var finish = function () { if (!done) { done = true; resolve(true); } };
          setTimeout(finish, budget);
          var tasks = [];
          try { if (document.fonts && document.fonts.ready) tasks.push(document.fonts.ready); } catch (e) {}
          try {
            var vh = window.innerHeight, vw = window.innerWidth;
            var imgs = [].slice.call(document.images || []).filter(function (im) {
              try {
                var r = im.getBoundingClientRect();
                return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw && r.width > 8 && r.height > 8;
              } catch (e) { return false; }
            }).slice(0, 40);
            imgs.forEach(function (im) {
              if (im.complete) return;
              tasks.push(new Promise(function (res) {
                im.addEventListener("load", res, { once: true });
                im.addEventListener("error", res, { once: true });
              }));
            });
          } catch (e) {}
          Promise.all(tasks).then(function () {
            // Two settled animation frames = layout has stopped moving.
            requestAnimationFrame(function () { requestAnimationFrame(finish); });
          }).catch(finish);
        });
      `),
      timeoutMs
    );
  } catch { /* fail-open */ }
  await sleep(220);
}

/**
 * Find real content SECTIONS worth capturing, scored for a marketing film.
 * Replaces "scroll to 35% and 70% of the page and hope".
 *
 * Each candidate is an in-flow block at least ~45% of the viewport tall. It is
 * scored on what the brief actually wants to show: product UI, pricing, features,
 * testimonials, integrations, CTA — with a strong bonus for real media (a product
 * screenshot inside the section) and a penalty for footers/navs/legal.
 */
async function findSections(page) {
  try {
    return await page.evaluate(
      // eslint-disable-next-line no-new-func
      new Function(`
        var vh = window.innerHeight, vw = window.innerWidth;
        var docTop = window.scrollY || document.documentElement.scrollTop || 0;
        var out = [];
        var KIND = [
          { k: "product",     rx: /dashboard|product|app-?screen|screenshot|interface|preview|demo|in-action|showcase|workspace|editor|console/i, w: 30 },
          { k: "features",    rx: /feature|capabilit|what-?you|benefit|how-?it-?works|use-?case|solutions|tools/i, w: 24 },
          { k: "pricing",     rx: /pricing|plans|tiers|subscription|cost|price/i, w: 26 },
          { k: "testimonial", rx: /testimonial|review|customer|quote|loved|trusted-?by|story|stories|wall-?of/i, w: 22 },
          { k: "integration", rx: /integrat|works-?with|compatib|platform|ecosystem|partners/i, w: 16 },
          { k: "cta",         rx: /get-?started|download|sign-?up|try-?free|cta|start-?now|join/i, w: 14 },
          { k: "stats",       rx: /stat|metric|numbers|results|impact|proof/i, w: 18 }
        ];
        var SKIP = /footer|cookie|consent|nav|menu|breadcrumb|legal|privacy|terms|sitemap|subscribe|newsletter/i;

        var nodes = [];
        try { nodes = [].slice.call(document.querySelectorAll("section,main > div,article,[class*='section' i],[data-section]")); } catch (e) {}
        nodes.forEach(function (el) {
          try {
            var st = getComputedStyle(el);
            if (st.display === "none" || st.visibility === "hidden") return;
            var r = el.getBoundingClientRect();
            var h = r.height, w = r.width;
            if (h < vh * 0.45) return;              // too short to be its own frame
            if (w < vw * 0.6) return;               // a sidebar, not a section
            if (h > vh * 6) return;                 // a wrapper of everything, not a section

            var idcls = "";
            try { idcls = ((el.id || "") + " " + (typeof el.className === "string" ? el.className : "")).slice(0, 200); } catch (e) {}
            if (SKIP.test(idcls)) return;
            if (el.closest && el.closest("footer,nav,header")) return;

            var text = "";
            try { text = (el.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 600); } catch (e) {}
            if (text.length < 25) return;           // an empty spacer band

            var heading = "";
            try {
              var hEl = el.querySelector("h1,h2,h3");
              if (hEl) heading = (hEl.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 120);
            } catch (e) {}

            // Real media inside the section — the thing that makes a shot worth having.
            var mediaArea = 0, mediaCount = 0;
            try {
              el.querySelectorAll("img,video,canvas,picture,svg").forEach(function (m) {
                var mr = m.getBoundingClientRect();
                var a = mr.width * mr.height;
                if (a >= (vw * vh) * 0.03) { mediaArea += a; mediaCount++; }
              });
            } catch (e) {}

            var haystack = (idcls + " " + heading + " " + text.slice(0, 220));
            var kind = "content", kindScore = 0;
            KIND.forEach(function (K) {
              if (K.rx.test(haystack) && K.w > kindScore) { kind = K.k; kindScore = K.w; }
            });

            var score = kindScore
              + Math.min(28, Math.round(mediaArea / (vw * vh) * 34))
              + Math.min(12, mediaCount * 4)
              + (heading ? 10 : 0)
              + Math.min(10, Math.round(text.length / 60));

            out.push({
              top: Math.round(r.top + docTop),
              height: Math.round(h),
              kind: kind,
              heading: heading,
              score: score,
              media: mediaCount
            });
          } catch (e) {}
        });

        // De-dup nested/overlapping sections, keeping the better-scoring one.
        out.sort(function (a, b) { return b.score - a.score; });
        var picked = [];
        out.forEach(function (s) {
          var clash = picked.some(function (p) {
            var overlap = Math.min(p.top + p.height, s.top + s.height) - Math.max(p.top, s.top);
            return overlap > Math.min(p.height, s.height) * 0.5;
          });
          if (!clash) picked.push(s);
        });
        return picked.slice(0, 8);
      `)
    );
  } catch {
    return [];
  }
}

/**
 * Scroll so a section is framed properly rather than sliced.
 * The viewport is aligned to the section's own top edge (minus a small breathing
 * margin) — and when the section is taller than the viewport, to the band that
 * carries its media, so a tall "product" section frames the product, not its
 * padding.
 */
async function frameSection(page, section, viewH) {
  const margin = Math.round(viewH * 0.06);
  let y = Math.max(0, section.top - margin);
  // Section taller than the viewport: bias toward its visual centre of mass.
  if (section.height > viewH * 1.25) {
    y = Math.max(0, section.top + Math.round((section.height - viewH) * 0.28) - margin);
  }
  try {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
  } catch { /* noop */ }
  return y;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Capture one viewport, with the dismiss→verify→escalate loop.
 * Returns { path, assessment, clean, attempts } or null on hard failure.
 *
 * `clean` is the contract downstream code relies on: false means "we could not
 * clear what was covering this page" — the shot is still returned (so brand-colour
 * extraction has something) but it is flagged so the intake gate REJECTS it as a
 * product visual instead of quietly demoting it into the film.
 */
async function captureViewport(page, { outPath, isAuthWall = false, maxPasses = 3 } = {}) {
  // ALWAYS clear before assessing, every capture. A consent platform loads
  // asynchronously and is frequently NOT in the DOM yet when the page first settles —
  // measured on wisprflow.ai, `#usercentrics-root` does not exist at
  // domcontentloaded+stable, so a dismissal pass at that moment finds nothing, an
  // assessment finds nothing, and the capture is marked clean seconds before the
  // banner appears in the very next frame. Assessing first and only dismissing "if
  // something is there" cannot win that race; dismissing unconditionally can, and
  // costs one cheap in-page pass.
  await clearOverlays(page, { isAuthWall });
  let assessment = await assessViewport(page);
  let attempts = 1;
  // Escalate while ANYTHING meaningful still covers the page — try hard to clear it.
  while (attempts < maxPasses && assessment.maxCoveragePct >= DISMISS_PCT) {
    await clearOverlays(page, { isAuthWall, aggressive: attempts >= 1 });
    await sleep(260);
    assessment = await assessViewport(page);
    attempts++;
  }
  try {
    await page.screenshot({ path: outPath, fullPage: false });
  } catch {
    return null;
  }
  // POST-SHOT VERIFY. The window between the assessment and the shutter is small but
  // it is exactly when a late CMP lands. If something appeared, clear it and re-take
  // the frame rather than shipping a capture our own verdict now disagrees with.
  const after = await assessViewport(page);
  if (after.maxCoveragePct >= DISMISS_PCT && assessment.maxCoveragePct < DISMISS_PCT) {
    await clearOverlays(page, { isAuthWall, aggressive: true });
    await sleep(260);
    assessment = await assessViewport(page);
    attempts++;
    try { await page.screenshot({ path: outPath, fullPage: false }); } catch { /* keep the first frame */ }
  } else {
    assessment = after.maxCoveragePct > assessment.maxCoveragePct ? after : assessment;
  }
  return {
    path: outPath,
    assessment,
    clean: assessment.maxCoveragePct < OBSTRUCTION_PCT,
    attempts,
  };
}

/**
 * Give an async consent platform a bounded chance to APPEAR before we start
 * capturing. Polls for a known CMP host (including inside shadow roots) and returns
 * as soon as one shows up, or when the budget runs out.
 *
 * Without this the pipeline is at the mercy of network timing: the same site cleared
 * cleanly on one run and shipped a banner on the next, purely because the consent
 * script won or lost a race against our first screenshot.
 */
async function waitForConsent(page, { timeoutMs = 4000, pollMs = 300 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let found = false;
    try {
      found = await page.evaluate(
        // eslint-disable-next-line no-new-func
        new Function("cmpHosts", `
          ${DEEP_QUERY_FN}
          if (__deepAll(cmpHosts.join(",")).length) return true;
          // Any shadow-root host whose name smells of consent also counts — CMPs that
          // are not in the known list still overwhelmingly use a custom element.
          var hosts = __deepHosts();
          for (var i = 0; i < hosts.length; i++) {
            var n = ((hosts[i].id || "") + " " + (hosts[i].tagName || "")).toLowerCase();
            if (/consent|cookie|privacy|gdpr|cmp/.test(n)) return true;
          }
          return false;
        `),
        CMP_HOSTS
      );
    } catch { /* navigation in flight — keep waiting */ }
    if (found) return true;
    await sleep(pollMs);
  }
  return false;
}

// ESCALATE AGGRESSIVELY, REJECT CONSERVATIVELY — two thresholds, deliberately.
//
// DISMISS_PCT is when we keep TRYING to clear something: cheap, in-page, no downside
// to another pass. OBSTRUCTION_PCT is when a survivor makes the capture unusable, and
// that bar has to be higher, because the two failures are not symmetric. The defect
// this system exists to stop was a consent banner over ~85% of the frame. A 5% sticky
// "Download for free" bar at the foot of a mobile page is the site's OWN furniture —
// throwing away a good product screenshot over it would trade one defect for another
// (a film with no screenshots at all).
const DISMISS_PCT = 4;
const OBSTRUCTION_PCT = 12;

// A viewport with less content than this is a spacer band, not a section worth
// showing (the audited film shipped a near-empty grey band as a "screenshot").
const MIN_CONTENT_SCORE = 22;

module.exports = {
  clearOverlays,
  assessViewport,
  waitForStable,
  findSections,
  frameSection,
  captureViewport,
  waitForConsent,
  OBSTRUCTION_PCT,
  DISMISS_PCT,
  MIN_CONTENT_SCORE,
};
