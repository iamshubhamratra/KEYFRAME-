// A FILM WITH NO WEBSITE MUST NOT CLOSE ON A BRAND CARD.
//
// Every template ends on a sign-off: a logo lockup, the brand's name, a
// "GET <BRAND>" button and the URL. It is right for a film made FROM a website
// and wrong for one made from a bare prompt, where all four are invented. Before
// services/sign_off.js, a prompt-only 30s film titled "How compound interest
// quietly builds wealth" closed on:
//
//   omelette          the CTA shape, a generated "COM" monogram, "GET COMPOUND"
//   the 8 families    the endcard, printed "how.com" — `${brand}.com`, a real
//                     domain belonging to someone else
//   momentum          "howcompoundinter.app"
//   showcase          "howcompoundinter.com"
//
// Two things kept trying to put the card back while that was being fixed, which
// is why they are asserted here and not just the happy path:
//
//   1. the engine's LRU/anti-repeat rungs, which reach into family.SCENES and
//      cast the closer MID-FILM once it stops being a reserved type;
//   2. the Template Director, which does not ask the router at all — it forces
//      the last scene to the closer outright (template_director.js:444).
//
//   node scripts/sign_off.test.cjs

const assert = require("node:assert");
const { filmUrl, signsOff, ownHost } = require("../src/services/sign_off");
const omelette = require("../src/services/omelette_adapter");

const DIMS = { width: 1920, height: 1080, fps: 30 };
const OM_PACKS = ["reel", "stomp-office", "showcase-vertical"];
const FAMILIES = [
  ["family_cinema", "premiere-night", "endcard"],
  ["family_editorial", "field-notes", "colophon"],
  ["family_poster", "type-riot", "stamp"],
  ["family_bright", "teampulse", "signoff"],
  ["family_story", "birdsong-field", "signoff"],
  ["family_darkpremium", "cadence-premium", "glowcta"],
  ["family_charged", "voltage", "launchcta"],
  ["family_terminal", "keystroke", "execute"],
];

function storyboard(extra = {}) {
  return {
    title: "How compound interest quietly builds wealth",
    durationSec: 30,
    scenes: [
      { id: "s1", start: 0, duration: 5, kind: "hook", purpose: "hook", headline: "Small money, long time." },
      { id: "s2", start: 5, duration: 5, kind: "text", purpose: "context", headline: "Interest earns interest." },
      { id: "s3", start: 10, duration: 5, kind: "stat", purpose: "proof", headline: "Eight percent doubles in nine.", stats: [{ value: "8", label: "percent a year" }] },
      { id: "s4", start: 15, duration: 5, kind: "text", purpose: "how", headline: "Start now, not more." },
      { id: "s5", start: 20, duration: 5, kind: "text", purpose: "feature", headline: "Time is the multiplier." },
      { id: "s6", start: 25, duration: 5, kind: "cta", purpose: "cta", headline: "Begin this month.", emphasis: "START NOW" },
    ],
    ...extra,
  };
}

const SITE = [{ path: "a.jpg", source: "website", sourceUrl: "https://teampulse.io/pricing", kind: "screenshot", width: 1200, height: 700, sceneId: "s3" }];
const BLOG = [{ path: "a.jpg", source: "blog", sourceUrl: "https://acme.dev/p/post", kind: "photo", width: 1200, height: 700, sceneId: "s3" }];
const LOGO = [{ path: "l.png", source: "upload", role: "logo", kind: "logo", width: 400, height: 120, sceneId: "s6" }];
// Captures of OTHER products' reference sites. They are NOT this film's home.
const TOPIC = [{ path: "t.jpg", source: "topic-screenshot", sourceUrl: "https://notion.so", kind: "screenshot", width: 1200, height: 700, sceneId: "s3" }];

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log(`  ok    ${name}`); pass += 1; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail += 1; }
}

// ---- the predicate ----------------------------------------------------------
console.log("\nsign_off predicate");
check("a bare prompt has no url and no sign-off", () => {
  assert.strictEqual(filmUrl({}, []), "");
  assert.strictEqual(signsOff({ url: "", assets: [] }), false);
});
check("a website film keeps its own host", () => {
  assert.strictEqual(ownHost(SITE), "teampulse.io");
  assert.strictEqual(signsOff({ url: filmUrl({}, SITE), assets: SITE }), true);
});
check("a blog film keeps its own host", () => assert.strictEqual(ownHost(BLOG), "acme.dev"));
check("a topic screenshot is NOT the film's home", () => {
  assert.strictEqual(ownHost(TOPIC), "");
  assert.strictEqual(signsOff({ url: "", assets: TOPIC }), false);
});
check("an uploaded logo earns a sign-off with no url", () => assert.strictEqual(signsOff({ url: "", assets: LOGO }), true));
check("the storyboard can opt in explicitly (the pack previews do)", () => {
  assert.strictEqual(signsOff({ url: "", storyboard: { signOff: true }, assets: [] }), true);
  assert.strictEqual(signsOff({ url: "x.com", storyboard: { signOff: false }, assets: [] }), false);
});

// ---- omelette: 197 packs ----------------------------------------------------
function omLast(pack, assets, extra) {
  const built = omelette.buildComposition({ storyboard: storyboard(extra), dims: DIMS, framePack: pack, assets, captionCues: null });
  const blk = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(built.indexHtml);
  const page = JSON.parse(blk[1]);
  const scenes = JSON.parse(JSON.parse(/window\.OM_SCENES\s*=\s*("(?:[^"\\]|\\.)*")\s*;/.exec(page)[1]));
  const t = /window\.OM_TWEAKS\s*=\s*("(?:[^"\\]|\\.)*")\s*;/.exec(page);
  const e = /window\.OM_TWEAKS\s*=\s*\/\*EDITMODE-BEGIN\*\/([\s\S]*?)\/\*EDITMODE-END\*\//.exec(page);
  let tweaks = {};
  try { tweaks = t ? JSON.parse(JSON.parse(t[1])) : (e ? JSON.parse(e[1]) : {}); } catch { /* shape varies by template */ }
  return { last: scenes[scenes.length - 1], scenes, tweaks };
}
const CLOSER_SHAPE = /cta|join|outro|close|end/i;

console.log("\nomelette");
for (const pack of OM_PACKS) {
  check(`${pack}: a prompt-only film draws no sign-off shape`, () => {
    const { last, scenes, tweaks } = omLast(pack, []);
    assert.ok(!CLOSER_SHAPE.test(String(last.name)), `last beat is "${last.name}"`);
    assert.strictEqual(String(tweaks.url || ""), "", "chrome still carries a url");
    // WITHHOLDING THE CARD MUST NOT COST A BEAT. Dropping the closing scene
    // instead of re-casting it would leave its narration playing over the
    // previous frame, so the film keeps exactly as many beats as it would with
    // the sign-off in place — only the last one's SHAPE changes.
    assert.strictEqual(scenes.length, omLast(pack, SITE).scenes.length, "a beat was lost with the sign-off");
  });
  check(`${pack}: a website film still signs off`, () => {
    const { last, tweaks } = omLast(pack, SITE);
    assert.ok(CLOSER_SHAPE.test(String(last.name)), `last beat is "${last.name}"`);
    assert.strictEqual(tweaks.url, "teampulse.io");
  });
}
check("no film is ever told to GET a product that does not exist", () => {
  for (const pack of OM_PACKS) {
    for (const assets of [[], TOPIC, LOGO]) {
      const { scenes } = omLast(pack, assets);
      for (const s of scenes) {
        const cta = String(s.cta || "");
        assert.ok(!/^GET (?!STARTED)/i.test(cta), `${pack} printed "${cta}" with no domain to back it`);
      }
    }
  }
});
check("segment bookends still suppress the closer on a website film", () => {
  const built = omelette.buildComposition({ storyboard: storyboard(), dims: DIMS, framePack: "reel", assets: SITE, captionCues: null, bookends: { intro: true, outro: false } });
  const page = JSON.parse(/<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(built.indexHtml)[1]);
  const scenes = JSON.parse(JSON.parse(/window\.OM_SCENES\s*=\s*("(?:[^"\\]|\\.)*")\s*;/.exec(page)[1]));
  assert.ok(!CLOSER_SHAPE.test(String(scenes[scenes.length - 1].name)));
});

// ---- the 8 template_engine families ----------------------------------------
console.log("\nfamilies");
function lastType(mod, pack, assets, extra, templatePlan) {
  const P = require(`../src/services/${mod}`).planMedia({ storyboard: storyboard(extra), dims: DIMS, framePack: pack, assets, templatePlan });
  return { types: (P.plan || []).map((x) => (x && (x.type || x.name)) || "?"), url: P.url };
}
for (const [mod, pack, closer] of FAMILIES) {
  check(`${mod}: prompt-only draws "${closer}" nowhere, and invents no domain`, () => {
    const { types, url } = lastType(mod, pack, []);
    assert.strictEqual(url, "", `fabricated "${url}"`);
    assert.ok(!types.includes(closer), `"${closer}" cast at beat ${types.indexOf(closer) + 1} of ${types.length}`);
  });
  check(`${mod}: a website film still ends on "${closer}"`, () => {
    const { types, url } = lastType(mod, pack, SITE);
    assert.strictEqual(url, "teampulse.io");
    assert.strictEqual(types[types.length - 1], closer);
  });
  check(`${mod}: a director cast cannot reinstate "${closer}"`, () => {
    // The Template Director forces the closer onto the last scene without asking
    // the router (template_director.js:444) — the engine has to drop it.
    const plan = { byScene: { s6: { type: closer, slots: {} } } };
    const { types } = lastType(mod, pack, [], {}, plan);
    assert.ok(!types.includes(closer), `cast slipped "${closer}" back in: ${JSON.stringify(types)}`);
  });
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
