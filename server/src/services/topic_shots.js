// Topic screenshots — real, live website captures for films that have NO website.
//
// screenshot_director.js only fires when the JOB carries a websiteUrl (a website
// or blog job). A plain topic prompt therefore got zero screenshots, ever — it
// returns [] on its first line. That is the single biggest asset gap for
// technical subjects, because stock photography is actively bad at them:
// measured live, Pixabay's best answers for "Kubernetes operator observability"
// were fairy lights, flowers, and a car interior matched on the word "dashboard",
// and the Creative Director correctly rejected 8 of 11.
//
// A real screenshot of a real, on-topic product site beats every one of those.
//
// Flow:
//   1. NAME      one LLM call -> real public sites that illustrate the topic,
//                each assigned to the scene it fits.
//   2. PREFLIGHT every URL live (reuses screenshot_director.preflight): 200, not
//                a redirect-to-homepage, no auth/legal path, no login form. A
//                hallucinated domain dies here — this is what makes "the model
//                named it" safe to act on.
//   3. CAPTURE   the survivors on PeekShot (throttled there to 4 in flight).
//
// Captures are labelled `source: "topic-screenshot"` — NOT "website"/"owner
// content", which downstream code reads as "this is the film subject's own
// product". These are third-party sites shown as industry examples, and the alt
// text says exactly that so no scene can present one as the subject's product.
// The label still matches isScreenshot()'s /screenshot/ test, so shape and trust
// gates treat it as the real screenshot it is.

const path = require("node:path");
const openrouter = require("./openrouter");
const peekshot = require("./peekshot");
const { extractFirstJsonObject } = require("./json_lenient");
const { preflight } = require("./screenshot_director");

const SYSTEM = `You are the Screenshot Director of an automated video studio. A short promo/explainer film is being made about a TOPIC. There is no single product website, so you choose REAL, WELL-KNOWN, PUBLICLY ACCESSIBLE websites whose pages illustrate the topic, and assign each to the scene it fits.

Pick sites a knowledgeable viewer would recognise as genuinely on-topic — the leading products, platforms, standards bodies, or documentation sites in that field.

Hard rules:
- REAL domains only, ones you are confident exist. A guessed or invented URL is worse than no pick; every URL is fetched and verified before use, and wrong ones are simply discarded.
- The page must be PUBLIC: no login, paywall, signup, checkout, legal or pricing-gated pages. Marketing homepages, product pages and public documentation are ideal.
- Prefer variety: do not send six pages of the same company.
- At most one page per scene, one scene per page.
- Pick only where the site genuinely illustrates that scene. A weak match is worse than none, and zero picks is a valid answer.

Reply with ONLY JSON:
{"picks":[{"sceneId":<id>,"url":"https://...","label":"<2-3 words, e.g. Grafana dashboards>","why":"<short reason>"}]}`;

function scenesDigest(script) {
  return (script.scenes || []).map((s) => {
    const bits = [s.headline, s.subtext, s.visualDirection].filter(Boolean).join(" — ");
    return `- id ${s.id} (${s.kind || s.purpose || "scene"}): ${String(bits).slice(0, 180)}`;
  }).join("\n");
}

const slug = (s) => String(s || "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "site";

function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } }

async function nameSites({ script, topic, max, tracker, signal }) {
  const { text, tokensIn, tokensOut, costUsd } = await openrouter.chat({
    system: SYSTEM,
    user: `FILM TOPIC: ${topic}\n\nSCENES:\n${scenesDigest(script)}\n\nPick up to ${max} sites.`,
    jsonMode: true, temperature: 0.2, stage: "screenshot_director", signal,
  });
  if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "screenshot_director", costUsd });
  let parsed;
  try { parsed = extractFirstJsonObject(text) || {}; } catch { return []; }
  const sceneIds = new Set((script.scenes || []).map((s) => String(s.id)));
  const seenHost = new Set();
  const picks = [];
  for (const p of (Array.isArray(parsed.picks) ? parsed.picks : [])) {
    if (!p || !p.url || !sceneIds.has(String(p.sceneId))) continue;
    let url;
    try { url = new URL(/^https?:\/\//i.test(p.url) ? p.url : `https://${p.url}`).toString(); } catch { continue; }
    const host = hostOf(url);
    if (!host || seenHost.has(host)) continue;      // one page per company
    seenHost.add(host);
    picks.push({ sceneId: String(p.sceneId), url, label: String(p.label || host).slice(0, 40), why: String(p.why || "").slice(0, 120) });
    if (picks.length >= max) break;
  }
  return picks;
}

/**
 * Capture real on-topic website screenshots for a film with no website of its own.
 * Never throws — any failure returns [] and the film proceeds on its other assets.
 *
 * @returns {Promise<Array>} pinned screenshot assets (possibly [])
 */
async function captureTopicSiteShots({ script, jobDir, topic, tracker, signal, max = 6 }) {
  try {
    if (!topic || !script || !Array.isArray(script.scenes) || !script.scenes.length) return [];
    if (!peekshot.enabled()) { console.log("[topic-shots] PeekShot key missing — skipped"); return []; }

    const picks = await nameSites({ script, topic, max, tracker, signal });
    if (!picks.length) { console.log("[topic-shots] model named no on-topic sites"); return []; }
    console.log(`[topic-shots] named ${picks.length}: ${picks.map((p) => hostOf(p.url)).join(", ")}`);

    // VERIFY every URL live. This is what makes acting on model-named domains
    // safe: a hallucinated host fails DNS, a moved page 404s, a gated one shows a
    // login form — all discarded here, before a single capture is paid for.
    const flights = await Promise.all(picks.map((p) => preflight(p.url, { guessed: true })));
    const live = picks.filter((p, i) => {
      if (!flights[i].ok) console.warn(`[topic-shots] drop ${hostOf(p.url)}: ${flights[i].why}`);
      return flights[i].ok;
    });
    if (!live.length) { console.log("[topic-shots] no named site survived verification"); return []; }

    const sceneById = new Map(script.scenes.map((s) => [String(s.id), s]));
    const vp = peekshot.VIEWPORTS.desktop;
    const settled = await Promise.allSettled(live.map((p, i) => {
      const relPath = `assets/images/topic_${i}_${slug(p.label)}.png`;
      return peekshot.capture({
        url: p.url, outPath: path.join(jobDir, relPath),
        width: vp.width, height: vp.height, retina: true, delay: 3, timeoutMs: 75_000, signal,
      }).then((cap) => {
        const scene = sceneById.get(p.sceneId);
        return {
          path: relPath, type: "image",
          sceneId: scene.id, startSec: scene.start, durationSec: scene.duration,
          style: "inset",
          width: cap.width || 0, height: cap.height || 0, ratio: cap.ratio || 0,
          // Says what it IS: a real capture of a named third-party site shown as
          // an industry example. Never "the product" — nothing downstream may
          // present someone else's site as the film subject's own.
          alt: `Real screenshot of ${hostOf(p.url)} — ${p.label}, an industry example illustrating this scene — present in a styled browser frame`,
          license: "third-party website screenshot",
          sourceUrl: p.url,
          source: "topic-screenshot",
          fromCache: false,
          visionOk: true,
        };
      });
    }));

    const shots = [];
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") shots.push(r.value);
      else console.warn(`[topic-shots] capture failed ${hostOf(live[i].url)}: ${String(r.reason && r.reason.message || r.reason).slice(0, 120)}`);
    });
    if (shots.length) console.log(`[topic-shots] captured ${shots.length}: ${shots.map((s) => hostOf(s.sourceUrl)).join(", ")}`);
    return shots;
  } catch (e) {
    console.warn(`[topic-shots] failed soft: ${String(e && e.message || e).slice(0, 160)}`);
    return [];
  }
}

module.exports = { captureTopicSiteShots, nameSites };
