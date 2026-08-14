// Acceptance harness for the Website Asset Intelligence Engine (M1).
// Standalone (repo has no test runner): generates real image fixtures with ffmpeg
// and exercises the security units + the classify → quality-gate → dedup → logo-
// colour path end to end. Run: node scripts/test-website-assets.js
//
// Exits non-zero on any failure so it can gate CI.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ap = require("../src/services/asset_priority");
const harvester = require("../src/services/ingest/website_assets");
const { prepareWebsiteAssets, classify, extractSvgColors } = require("../src/services/website_assets");
const { makeImageDeduper } = require("../src/services/asset_sources/util");

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log(`  *** FAIL: ${label}`); } };
const section = (s) => console.log(`\n=== ${s} ===`);

function ff(args) { const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]); return r.status === 0; }

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wai-test-"));
  const jobDir = path.join(dir, "job");
  const ba = path.join(jobDir, "ingest", "brand_assets");
  fs.mkdirSync(ba, { recursive: true });

  // ---- fixtures ----
  const logoSvg = path.join(ba, "logo.svg");
  fs.writeFileSync(logoSvg, '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="64"><rect width="240" height="64" fill="#0FB5A6"/><circle cx="32" cy="32" r="20" fill="#122B39"/><text fill="#0FB5A6">Acme</text></svg>');
  const hero = path.join(ba, "hero.png");
  const heroDup = path.join(ba, "hero2.png");
  const blank = path.join(ba, "blank.png");
  const tiny = path.join(ba, "tiny.png");
  ff(["-f", "lavfi", "-i", "testsrc=size=800x600:rate=1", "-frames:v", "1", hero]);
  fs.copyFileSync(hero, heroDup);
  ff(["-f", "lavfi", "-i", "color=c=0x808080:size=200x200", "-frames:v", "1", blank]);
  ff(["-f", "lavfi", "-i", "testsrc=size=40x40:rate=1", "-frames:v", "1", tiny]);

  const mkFile = (absPath, over) => Object.assign({
    absPath, url: `http://acme.example/${path.basename(absPath)}`, discovery: "img",
    isSvg: false, nearHeader: false, alt: "", cls: "", width: 0, height: 0, hasAlpha: false,
    mime: "image/png", bytes: fs.statSync(absPath).size,
  }, over);

  const files = [
    mkFile(logoSvg, { discovery: "svg-inline", isSvg: true, nearHeader: true, alt: "Acme logo", cls: "site-logo brand", hasAlpha: true, width: 240, height: 64, mime: "image/svg+xml" }),
    mkFile(hero, { discovery: "og", alt: "product hero", cls: "hero", width: 800, height: 600 }),
    mkFile(heroDup, { discovery: "img", alt: "same hero again", cls: "", width: 800, height: 600 }),
    mkFile(blank, { discovery: "img", width: 200, height: 200 }),
    mkFile(tiny, { discovery: "link-icon", alt: "favicon", cls: "favicon", width: 40, height: 40 }),
  ];

  // ---- (A) tier law ----
  section("Tier law + constants");
  ok(ap.tierFor({ source: ap.WEBSITE_BRAND_SOURCE }) === 90, "website-brand → 90");
  ok(ap.tierFor({ source: ap.WEBSITE_ASSET_SOURCE }) === 70, "website-asset → 70");
  ok(ap.rankKey({ source: "upload" }, 0) > ap.rankKey({ source: ap.WEBSITE_BRAND_SOURCE }, 999), "upload outranks website-brand");
  ok(ap.rankKey({ source: ap.WEBSITE_BRAND_SOURCE }, 0) > ap.rankKey({ source: "website" }, 999), "website-brand outranks screenshot");
  ok(ap.isTrustedProminent({ source: ap.WEBSITE_BRAND_SOURCE }) === true, "website-brand trusted-prominent");
  ok(ap.isTrustedProminent({ source: ap.WEBSITE_ASSET_SOURCE }) === false, "website-asset NOT prominent without vision");
  ok(ap.isTrustedProminent({ source: ap.WEBSITE_ASSET_SOURCE, visionOk: true }) === true, "website-asset prominent WITH vision");
  ok(ap.isOwned({ source: ap.WEBSITE_ASSET_SOURCE }) === false, "website-asset NOT owner (CD-deletable)");

  // ---- (B) classification ----
  section("Classification");
  ok(classify(files[0]).assetType === "logo" && classify(files[0]).brandCritical, "svg near-header logo → logo/brandCritical");
  ok(classify(files[0]).source === undefined, "classify returns type only (source stamped in prepare)");
  ok(["hero", "product", "image"].includes(classify(files[1]).assetType) && classify(files[1]).kindHint === "photo", "og large image → photo (hero/product)");
  ok(extractSvgColors(fs.readFileSync(logoSvg, "utf8")).includes("#0FB5A6"), "SVG palette extracts teal fill");

  // ---- (C) full prepare pipeline ----
  section("prepareWebsiteAssets: gate + dedup + logo colour");
  const deduper = makeImageDeduper();
  const { records, brandColors, review } = await prepareWebsiteAssets({
    job: { user_assets: [] }, jobDir, harvest: { files: files.map((f) => ({ ...f })), review: { discovered: 5, downloaded: 5, dropped: [], notes: [] } }, deduper,
  });
  const kinds = records.map((r) => r.assetType).sort();
  ok(records.length === 2, `kept 2 (logo+hero), got ${records.length} [${kinds}]`);
  ok(records.some((r) => r.assetType === "logo" && r.source === ap.WEBSITE_BRAND_SOURCE && r.role === "logo"), "logo → website-brand tier + role:logo");
  ok(records.some((r) => r.assetType !== "logo" && r.source === ap.WEBSITE_ASSET_SOURCE && r.kindHint === "photo"), "harvested photo → website-asset tier");
  ok(review.dropped.some((d) => d.reason === "blank"), "blank solid image dropped");
  ok(review.dropped.some((d) => d.reason === "too-small"), "40px favicon dropped (min-dim)");
  ok(review.dropped.some((d) => String(d.reason).startsWith("duplicate")), "duplicate hero dropped");
  ok(Array.isArray(brandColors) && brandColors.includes("#0FB5A6"), `logo colour extracted (${brandColors})`);
  ok(records.every((r) => r.absPath === undefined), "internal absPath stripped from manifest");
  ok(records.find((r) => r.assetType === "logo").brandColors?.includes("#0FB5A6"), "logo record carries brandColors");

  // ---- (D) cross-dedup against a 'screenshot' via the shared deduper ----
  section("Cross-dedup vs screenshots (shared deduper)");
  const shared = makeImageDeduper();
  await shared.add(hero); // simulate a KEPT screenshot equal to the harvested hero
  fs.mkdirSync(ba, { recursive: true });
  const hero3 = path.join(ba, "hero3.png"); fs.copyFileSync(hero, hero3);
  const r2 = await prepareWebsiteAssets({
    job: { user_assets: [] }, jobDir,
    harvest: { files: [mkFile(hero3, { discovery: "og", width: 800, height: 600 })], review: { discovered: 1, downloaded: 1, dropped: [], notes: [] } },
    deduper: shared,
  });
  ok(r2.records.length === 0 && r2.review.dropped.some((d) => String(d.reason).startsWith("duplicate")), "harvested hero that duplicates a screenshot is dropped");

  // ---- (E) security guard (SSRF blocklist + sniff + sanitize) ----
  section("Security guard");
  const B = harvester._internal.isBlockedAddress;
  ok(B("169.254.169.254", 4) === true, "metadata IP blocked");
  ok(B("::ffff:127.0.0.1", 6) === true, "IPv4-mapped loopback blocked");
  ok(B("::ffff:169.254.169.254", 6) === true, "IPv4-mapped metadata blocked");
  ok(B("64:ff9b::a9fe:a9fe", 6) === true, "NAT64 metadata blocked");
  ok(B("::127.0.0.1", 6) === true, "IPv4-compatible ::/96 loopback blocked (review fix)");
  ok(B("::169.254.169.254", 6) === true, "IPv4-compatible ::/96 metadata blocked (review fix)");
  ok(B("2002:a9fe:a9fe::", 6) === true, "6to4 2002::/16 metadata blocked (review fix)");
  ok(B("2002:7f00:1::", 6) === true, "6to4 2002::/16 loopback blocked (review fix)");
  ok(B("8.8.8.8", 4) === false, "public v4 allowed");
  ok(B("2001:4860:4860::8888", 6) === false, "public v6 allowed");
  ok(B("2002:0808:0808::", 6) === false, "6to4 public (8.8.8.8) allowed");
  // sniff: HTML page with an inline <svg> must NOT sniff as an image now
  ok(harvester.sniffImage(Buffer.from("<!DOCTYPE html><html><body><svg width=1></svg>")) === null, "HTML-with-inline-svg NOT sniffed as image (review fix)");
  ok(harvester.sniffImage(Buffer.from('<svg xmlns="x"><rect/></svg>')) === "svg", "real svg still sniffs as svg");
  ok(harvester.sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0])) === "png", "png magic still works");
  // sanitize: closed + UNCLOSED script, @import, SMIL animation all stripped. Legit
  // content precedes the trailing UNCLOSED script (which safely strips to EOF).
  const dirty = '<svg onload="x()"><rect fill="#0FB5A6"/><script>a()</script><style>@import "http://e/x"</style><animate attributeName="href" to="javascript:c()"/><circle/><script>b()';
  const clean = harvester.sanitizeSvg(dirty);
  ok(!/<script|onload=|@import|<animate|<style/i.test(clean), "svg script(closed+unclosed)/handler/@import/animate stripped (review fix)");
  ok(clean.includes("<rect") && clean.includes("<circle"), "svg legit content before the malformed script preserved");

  // ---- (F) M2: pinWebsiteAssets → scenes, logo promotion, kindHint routing ----
  section("M2: pin to scenes + presentation routing");
  const { pinWebsiteAssets } = require("../src/services/website_assets");
  const { classify: vldClassify } = (() => { try { return require("../src/services/visual_layout_director"); } catch { return {}; } })();
  const scenePart = (() => { try { return require("../src/services/scene_kit"); } catch { return {}; } })();
  // Fixtures already on disk from (C): logo.svg (kept), hero.png (kept). Build a manifest.
  const jobDir2 = jobDir; // reuse — brand_assets/logo.svg + hero.png exist
  const rel = (p) => path.relative(jobDir2, p).split(path.sep).join("/");
  const manifest = [
    { path: rel(logoSvg), assetType: "logo", kindHint: "vector", source: ap.WEBSITE_BRAND_SOURCE, isVector: true, hasAlpha: true, width: 240, height: 64, brandColors: ["#0FB5A6"], license: "owner content" },
    { path: rel(hero), assetType: "hero", kindHint: "photo", source: ap.WEBSITE_ASSET_SOURCE, isVector: false, width: 800, height: 600, license: "site content" },
  ];
  const script = { scenes: [
    { id: "s1", start: 0, duration: 3, purpose: "hook" },
    { id: "s2", start: 3, duration: 4, purpose: "feature" },
    { id: "s3", start: 7, duration: 3, purpose: "cta" },
  ] };
  const noUpload = await pinWebsiteAssets({ job: { website_assets: manifest }, script, jobDir: jobDir2, usedSceneIds: new Set(), hasUploadLogo: false, maxPins: 4 });
  ok(noUpload.brandLogo && noUpload.brandLogo.role === "logo" && noUpload.brandLogo.source === ap.WEBSITE_BRAND_SOURCE, "no upload logo → harvested logo promoted to role:logo (website-brand)");
  ok(noUpload.brandPinned.length === 1 && noUpload.brandPinned[0].source === ap.WEBSITE_ASSET_SOURCE, "hero pinned as website-asset");
  ok(noUpload.brandPinned[0].sceneId === "s2", "hero assigned to a showcase (feature) scene");
  ok(noUpload.brandPinned[0].kindHint === "photo" && noUpload.brandLogo.kindHint === "vector", "kindHint carried onto wire records");
  ok(noUpload.brandPinned[0].path.startsWith("ingest/brand_assets/") || noUpload.brandPinned[0].path.includes("brand_assets"), "wire path points at harvested file (no copy needed)");

  const withUpload = await pinWebsiteAssets({ job: { website_assets: manifest }, script, jobDir: jobDir2, usedSceneIds: new Set(), hasUploadLogo: true, maxPins: 4 });
  ok(withUpload.brandLogo === null, "user upload logo present → harvested logo NOT promoted (sovereignty)");

  const usedTest = await pinWebsiteAssets({ job: { website_assets: manifest }, script, jobDir: jobDir2, usedSceneIds: new Set(["s2"]), hasUploadLogo: false, maxPins: 4 });
  ok(usedTest.brandPinned[0].sceneId !== "s2", "hero avoids a scene already claimed by an upload/screenshot");

  // Presentation routing — classify/partitionAssets are INTERNAL (not exported), so
  // exercise them through the real public entry: directLayout must accept harvested
  // assets (source website-brand/website-asset + kindHint) without error and keep them.
  const { directLayout } = require("../src/services/visual_layout_director");
  const wire = [noUpload.brandLogo, ...noUpload.brandPinned].filter(Boolean);
  const storyboard = { scenes: script.scenes.map((s) => ({ ...s, beats: [] })) };
  let dl = null, threw = false;
  try { dl = directLayout({ storyboard, script, assets: wire, framePack: "edition", dims: { width: 1920, height: 1080, fps: 30 } }); } catch { threw = true; }
  ok(!threw && dl && Array.isArray(dl.assets), "directLayout accepts harvested assets without error");
  ok(dl && dl.assets.length === wire.length, "directLayout preserves all harvested assets (logo + imagery)");
  // The harvested hero is a photo, not a screenshot → it is not annotated with a
  // device container (cropFocus present is fine; a browser/phone container is the bug).
  const heroOut = dl && dl.assets.find((a) => a.source === ap.WEBSITE_ASSET_SOURCE && a.kindHint === "photo");
  ok(!heroOut || !/phone|browser|dashboard/i.test(String(heroOut.container || "")), "harvested photo not forced into a device frame");

  // ---- (G) M3: richer classifier + deterministic quality scorer ----
  section("M3: classifier taxonomy + quality scoring");
  const { classify: cls, scoreAssetQuality: score } = require("../src/services/website_assets");
  const mk = (o) => Object.assign({ cls: "", alt: "", url: "", nearHeader: false, isSvg: false, hasAlpha: false, width: 0, height: 0, bytes: 100000 }, o);
  ok(cls(mk({ discovery: "jsonld-logo", isSvg: true, nearHeader: true })).assetType === "logo", "classify: jsonld → logo");
  ok(cls(mk({ discovery: "svg-inline", isSvg: true, nearHeader: true, cls: "site-logo" })).logoVariant?.format === "svg", "classify: svg logo → logoVariant.format=svg");
  ok(cls(mk({ isSvg: true, width: 40, height: 40 })).assetType === "icon", "classify: small svg → icon");
  ok(cls(mk({ width: 1600, height: 900, url: "dashboard.png" })).assetType === "screenshot" && cls(mk({ width: 1600, height: 900, url: "dashboard.png" })).kindHint === "screenshot", "classify: wide UI WITH token → screenshot");
  ok(cls(mk({ width: 1600, height: 900 })).assetType === "hero" && cls(mk({ width: 1600, height: 900 })).kindHint === "photo", "classify: bare wide (no token) → hero photo, NOT device-framed");
  ok(cls(mk({ width: 800, height: 900, alt: "our team photo" })).assetType === "team", "classify: team token → team");
  ok(cls(mk({ width: 1400, height: 500, alt: "promo banner" })).assetType === "marketing", "classify: wide banner → marketing");
  ok(cls(mk({ discovery: "og", width: 1200, height: 630 })).assetType === "hero", "classify: og share image → hero (not screenshot)");
  ok(cls(mk({ width: 200, height: 200, alt: "background pattern" })).assetType === "decorative", "classify: decoration token → decorative");
  ok(cls(mk({})).brandCritical === false && cls(mk({ discovery: "jsonld-logo", isSvg: true, nearHeader: true })).brandCritical === true, "brandCritical is LOGO-only (R2)");
  // quality scorer
  ok(score(mk({ isSvg: true }), null).approved === true && score(mk({ isSvg: true }), null).qualityScore === 85, "quality: svg auto-pass 85");
  ok(score(mk({ width: 40, height: 40 }), { width: 40, height: 40 }).approved === false, "quality: 40px raster rejected (too-small)");
  ok(score(mk({ width: 800, height: 400, bytes: 500 }), { width: 800, height: 400 }).rejectReason === "tiny-file", "quality: 500-byte file rejected (tiny-file)");
  const good = score(mk({ width: 1920, height: 1080, bytes: 400000 }), { width: 1920, height: 1080 });
  ok(good.approved === true && good.qualityScore >= 45 && good.qualityScore <= 100, `quality: full-res raster approved (score ${good.qualityScore})`);
  // REVIEW FIX (major): a short raster wordmark must SURVIVE the quality gate as a logo.
  ok(score(mk({ width: 200, height: 40, hasAlpha: true, bytes: 4000 }), { width: 200, height: 40 }, "logo").approved === true, "quality: 200x40 raster LOGO survives (logo exemption, review fix)");
  ok(score(mk({ width: 200, height: 40, bytes: 4000 }), { width: 200, height: 40 }, "hero").approved === false, "quality: 200x40 non-logo raster still rejected (too-small)");
  // REVIEW FIX (minor): broad 'app' token on a lifestyle photo → hero, NOT device-framed screenshot.
  ok(cls(mk({ width: 1200, height: 800, url: "download-our-app.jpg", alt: "get the app" })).kindHint !== "screenshot", "classify: 'app' lifestyle photo NOT screenshot (review fix)");
  ok(cls(mk({ width: 1600, height: 900, url: "dashboard.png" })).assetType === "screenshot", "classify: specific 'dashboard' token still → screenshot");
  // REVIEW FIX (minor): a wide inline SVG → illustration/vector, NOT hero/photo.
  ok(cls(mk({ isSvg: true, width: 800, height: 400, discovery: "svg-inline" })).kindHint === "vector", "classify: wide inline SVG → vector (not hero photo, review fix)");
  // Integration: a short raster logo fixture survives prepare and becomes a logo record.
  const rlogo = path.join(ba, "rlogo.png"); ff(["-f", "lavfi", "-i", "testsrc=size=200x40:rate=1", "-frames:v", "1", rlogo]);
  const rprep = await prepareWebsiteAssets({ job: { user_assets: [] }, jobDir, harvest: { files: [mkFile(rlogo, { discovery: "img", isSvg: false, nearHeader: true, alt: "Acme logo", cls: "site-logo brand", hasAlpha: true, width: 200, height: 40 })], review: { discovered: 1, downloaded: 1, dropped: [], notes: [] } }, deduper: makeImageDeduper() });
  ok(rprep.records.some((r) => r.assetType === "logo"), "short raster logo survives prepare → logo record (review fix)");
  // records carry qualityScore + logoVariant (re-run prepare on the (C) fixtures)
  const dd2 = makeImageDeduper();
  const prep = await prepareWebsiteAssets({ job: { user_assets: [] }, jobDir, harvest: { files: [mkFile(logoSvg, { discovery: "svg-inline", isSvg: true, nearHeader: true, alt: "Acme logo", cls: "site-logo brand", hasAlpha: true, width: 240, height: 64, mime: "image/svg+xml" }), mkFile(hero, { discovery: "og", alt: "hero", width: 800, height: 600 })], review: { discovered: 2, downloaded: 2, dropped: [], notes: [] } }, deduper: dd2 });
  ok(prep.records.every((r) => typeof r.qualityScore === "number"), "records carry a numeric qualityScore");
  ok(prep.records.find((r) => r.assetType === "logo")?.logoVariant?.format === "svg", "logo record carries logoVariant");

  // ---- (H) M4: brand signals — fonts (name-only) + CSS-computed palette ----
  section("M4: brand signals (fonts + css palette)");
  const { resolveBrandSignals, paletteFromCssList } = require("../src/services/website_assets");
  const sig = resolveBrandSignals({
    fonts: { heading: { family: "Söhne", stack: "Söhne, sans-serif" }, body: { family: "Inter", stack: "Inter, Arial, sans-serif" } },
    fontFaces: ["Söhne", "Roboto"],
    rawColors: ["rgb(83, 58, 253)", "rgb(255,255,255)", "rgb(83, 58, 253)", "rgba(0,0,0,0)", "#533AFD"],
  });
  ok(sig.palette.includes("#533AFD"), `css palette extracts the brand accent (${sig.palette})`);
  ok(!sig.palette.includes("#FFFFFF") && !sig.palette.includes("#000000"), "css palette drops white/black chrome");
  ok(sig.fonts?.heading?.family === "Söhne" && sig.fonts?.body?.family === "Inter", "fonts: heading/body families captured");
  ok(sig.fontsExtracted.includes("Söhne") && !sig.fontsExtracted.includes("Roboto") && !sig.fontsExtracted.includes("Arial"), "fontsExtracted keeps brand fonts, drops generics (Roboto/Arial)");
  ok(resolveBrandSignals(null).palette.length === 0 && resolveBrandSignals(null).fonts === null, "resolveBrandSignals(null) → empty, fail-open");
  ok(paletteFromCssList(["rgb(15,181,166)", "white", "rgb(15,181,166)"]).includes("#0FB5A6"), "paletteFromCssList handles rgb() + frequency");
  // REVIEW FIX: CTA colours LEAD over more-frequent link colours (grouped, not flat frequency).
  const grouped = resolveBrandSignals({ ctaColors: ["rgb(255,107,0)"], accentColors: ["rgb(0,102,204)", "rgb(0,102,204)", "rgb(0,102,204)"] });
  ok(grouped.palette[0] === "#FF6B00", `CTA accent leads over 3x link-blue (${grouped.palette})`);
  // REVIEW FIX: a fully-transparent coloured value is NOT counted as a brand colour.
  ok(paletteFromCssList(["rgba(255,107,0,0)"]).length === 0, "rgba alpha 0 (transparent) dropped");
  ok(paletteFromCssList(["rgba(255,107,0,0.95)"]).includes("#FF6B00"), "rgba alpha ~1 (opaque) kept");
  // brand signals flow onto the ingest result (unit: harvester returns them; disclosure coerces arrays)
  ok(typeof require("../src/services/ingest/website_assets").discoverBrandSignals === "function", "harvester exports discoverBrandSignals");

  // ---- (I) M5: asset usage report + validation gate ----
  section("M5: usage report + validation gate");
  const { buildAssetUsageReport, validateAssetIntelligence } = require("../src/services/asset_usage_report");
  // A branded job: harvested logo (used, key-moment) + 1 approved hero + 1 CD-demoted image.
  const collectedManifest = [
    { path: "ingest/brand_assets/a0.svg", assetType: "logo", kindHint: "vector", source: ap.WEBSITE_BRAND_SOURCE, qualityScore: 80, brandColors: ["#0FB5A6"], role: "logo" },
    { path: "ingest/brand_assets/a1.png", assetType: "hero", kindHint: "photo", source: ap.WEBSITE_ASSET_SOURCE, qualityScore: 70 },
    { path: "ingest/brand_assets/a2.png", assetType: "product", kindHint: "photo", source: ap.WEBSITE_ASSET_SOURCE, qualityScore: 60 },
    { path: "ingest/brand_assets/a3.svg", assetType: "icon", kindHint: "vector", source: ap.WEBSITE_ASSET_SOURCE, qualityScore: 80 },
  ];
  const wireAssets = [
    { path: "ingest/brand_assets/a0.svg", source: ap.WEBSITE_BRAND_SOURCE, role: "logo", sceneId: "s4" },
    { path: "ingest/brand_assets/a1.png", source: ap.WEBSITE_ASSET_SOURCE, sceneId: "s2", visionOk: true, cdProminence: "support" },
    { path: "ingest/brand_assets/a2.png", source: ap.WEBSITE_ASSET_SOURCE, sceneId: "s3", visionOk: false, cdProminence: "background", __layoutDemoted: true },
    // a3 icon collected but NOT pinned into the wire
  ];
  const usageJob = {
    website_assets: collectedManifest, user_assets: [],
    website_screenshots: ["/x/website.png"],
    intent: { logo: { brandColors: ["#0FB5A6"] }, website: { brandColors: ["#0FB5A6", "#122B39"] } },
  };
  const rep = buildAssetUsageReport({ job: usageJob, assets: wireAssets, harvestReport: { kept: 4, brandColorsExtracted: ["#0FB5A6"], fontsExtracted: ["Söhne"], notes: [] }, brandReview: { accents: ["#0FB5A6"], applied: true } });
  ok(rep.assetsCollected === 4, `assetsCollected reconciles intake (${rep.assetsCollected})`);
  ok(rep.assetsApproved === 2, `assetsApproved = logo + approved hero, not the demoted one (${rep.assetsApproved})`);
  ok(rep.logos.length === 1 && rep.logos[0].slot === "logo", "logo listed + key-moment slot");
  ok(rep.icons.length === 1 && rep.icons[0].slot === null && rep.icons[0].usedInScenes.length === 0, "collected-but-unpinned icon: no slot, no scene");
  ok(rep.demotedForRelevance.length === 1 && rep.demotedForRelevance[0].path.endsWith("a2.png"), "CD-demoted image surfaced (M3 deferred item)");
  ok(rep.fontsExtracted.includes("Söhne"), "fonts carried into the report");
  ok(rep.notes.some((n) => /demoted/i.test(n)), "demotion disclosed in notes");
  // Validation gate — branded job: all true; never throws.
  const v = rep.validation;
  ok(v.logoFound.ok && v.brandColorsFound.ok && v.screenshotsFound.ok && v.assetsApproved.ok && v.assetsTagged.ok && v.assetsRanked.ok && v.availableToTemplate.ok, "validation: branded job → all 7 checks true");
  // Unbranded prompt-only job — all false, NEVER throws (non-blocking).
  let threw2 = false, vEmpty = null;
  try { vEmpty = validateAssetIntelligence({ job: { website_assets: [], user_assets: [], website_screenshots: [], intent: {} }, assets: [] }); } catch { threw2 = true; }
  ok(!threw2 && vEmpty && vEmpty.logoFound.ok === false && vEmpty.availableToTemplate.ok === false, "validation: unbranded job → all false, never throws");
  ok(!(() => { try { buildAssetUsageReport({}); return false; } catch { return true; } })(), "buildAssetUsageReport({}) fail-open (no throw)");
  // REVIEW FIX: a null manifest entry must not throw the build (null-guard).
  ok(!(() => { try { buildAssetUsageReport({ job: { website_assets: [null, collectedManifest[0]], user_assets: [] }, assets: [] }); return false; } catch { return true; } })(), "null manifest entry doesn't throw the report build");
  // REVIEW FIX: unknown/missing assetType folds into illustrations (catch-all), never dropped.
  const catchRep = buildAssetUsageReport({ job: { website_assets: [{ path: "x/u.png", assetType: "banner-x", kindHint: "photo", source: ap.WEBSITE_ASSET_SOURCE, qualityScore: 60 }], user_assets: [] }, assets: [], harvestReport: { kept: 1 } });
  ok(catchRep.illustrations.length === 1 && catchRep.assetsCollected === (catchRep.logos.length + catchRep.screenshots.length + catchRep.icons.length + catchRep.illustrations.length + catchRep.videos.length), "unknown assetType folds into illustrations; buckets reconcile with collected");
  // REVIEW FIX: a layout-demoted LOGO is NOT listed as a relevance demotion (approved, not demoted).
  const logoDemRep = buildAssetUsageReport({ job: { website_assets: [{ path: "x/l.svg", assetType: "logo", kindHint: "vector", source: ap.WEBSITE_BRAND_SOURCE, qualityScore: 80, role: "logo" }], user_assets: [] }, assets: [{ path: "x/l.svg", source: ap.WEBSITE_BRAND_SOURCE, role: "logo", sceneId: "s0", __layoutDemoted: true }] });
  ok(logoDemRep.demotedForRelevance.length === 0 && logoDemRep.assetsApproved === 1, "layout-demoted logo counts approved, NOT demoted (review fix)");

  // ---- (J) follow-up fixes: logo over-tagging cap ----
  section("Follow-up: logo cap (icon-heavy site)");
  const logoRecs = [];
  for (let i = 0; i < 5; i++) {
    const p = path.join(ba, `lg${i}.svg`);
    fs.writeFileSync(p, `<svg xmlns="http://www.w3.org/2000/svg" width="${200 + i * 12}" height="60"><rect width="100%" height="100%" fill="#0F${(0x30 + i * 0x11).toString(16)}A6"/><text>brand${i}</text></svg>`);
    logoRecs.push(mkFile(p, { discovery: "svg-inline", isSvg: true, nearHeader: true, alt: "logo", cls: "site-logo brand", hasAlpha: true, width: 200 + i * 12, height: 60, mime: "image/svg+xml" }));
  }
  const capPrep = await prepareWebsiteAssets({ job: { user_assets: [] }, jobDir, harvest: { files: logoRecs, review: { discovered: 5, downloaded: 5, dropped: [], notes: [] } }, deduper: makeImageDeduper() });
  const capLogos = capPrep.records.filter((r) => r.assetType === "logo");
  const capIcons = capPrep.records.filter((r) => r.assetType === "icon");
  ok(capLogos.length === 2, `logo cap: 5 logo-ish SVGs → 2 kept as logos (${capLogos.length})`);
  ok(capIcons.length === 3, `logo cap: the other 3 re-classified as icons (${capIcons.length})`);
  ok(capLogos.every((r) => r.source === ap.WEBSITE_BRAND_SOURCE) && capIcons.every((r) => r.source === ap.WEBSITE_ASSET_SOURCE), "kept logos = website-brand (tier 90); demoted = website-asset (tier 70)");
  ok(capPrep.review.notes.some((n) => /over-tagged/i.test(n)), "over-tagging disclosed in the harvest notes");
  ok(capPrep.brandColors.length > 0, "logo colour still extracted from a capped logo (cap doesn't break the M1 headline)");

  // ---- (K) logo-color site-accent fallback (monochrome mark) ----
  section("Logo-color fallback: monochrome mark → site accent");
  const monoSvg = path.join(ba, "mono.svg");
  // A black wordmark on nothing: declared fills are #000/#FFF → both filter as chrome →
  // extractSvgColors returns []; no styleColors → the mark yields NO brand hue (the live
  // Stripe/Linear/Ghost case). The site's CSS accent must seed the logo tier instead.
  fs.writeFileSync(monoSvg, '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="64"><rect width="240" height="64" fill="#000000"/><text fill="#FFFFFF">Acme</text></svg>');
  const monoFile = () => mkFile(monoSvg, { discovery: "svg-inline", isSvg: true, nearHeader: true, alt: "Acme logo", cls: "site-logo brand", hasAlpha: true, width: 240, height: 64, mime: "image/svg+xml" });
  const monoWithPalette = await prepareWebsiteAssets({
    job: { user_assets: [] }, jobDir,
    harvest: { files: [monoFile()], review: { discovered: 1, downloaded: 1, dropped: [], notes: [] } },
    deduper: makeImageDeduper(), brandPalette: ["#533AFD", "#FFE0D1"],
  });
  ok(monoWithPalette.brandColors.includes("#533AFD") && monoWithPalette.brandColorsSource === "site-accent", `monochrome mark + accent → site-accent fallback (${monoWithPalette.brandColors}, ${monoWithPalette.brandColorsSource})`);
  ok(monoWithPalette.records.find((r) => r.assetType === "logo")?.brandColors?.includes("#533AFD"), "logo record carries the site-accent colour (for the CTA lockup)");
  ok(monoWithPalette.review.notes.some((n) => /site accent/i.test(n)), "site-accent provenance disclosed in notes");
  // No palette → NOTHING fabricated (still 0, exactly as before the fix).
  const monoNoPalette = await prepareWebsiteAssets({
    job: { user_assets: [] }, jobDir,
    harvest: { files: [monoFile()], review: { discovered: 1, downloaded: 1, dropped: [], notes: [] } },
    deduper: makeImageDeduper(),
  });
  ok(monoNoPalette.brandColors.length === 0 && !monoNoPalette.brandColorsSource, "no accent palette → no colour fabricated (fail-safe)");
  // A COLOURED mark still wins as provenance "mark" — the accent is only a fallback.
  const colorPrep = await prepareWebsiteAssets({
    job: { user_assets: [] }, jobDir,
    harvest: { files: [mkFile(logoSvg, { discovery: "svg-inline", isSvg: true, nearHeader: true, alt: "Acme logo", cls: "site-logo brand", hasAlpha: true, width: 240, height: 64, mime: "image/svg+xml" })], review: { discovered: 1, downloaded: 1, dropped: [], notes: [] } },
    deduper: makeImageDeduper(), brandPalette: ["#533AFD"],
  });
  ok(colorPrep.brandColors.includes("#0FB5A6") && colorPrep.brandColorsSource === "mark", "coloured mark keeps 'mark' provenance (accent not used when the mark has a hue)");

  // ---- HARVESTED SVG VISIBILITY -------------------------------------------------
  // Regression: a delivered film (job 9e0fq1724n, prisma-bloc) rendered the composer's ALT
  // TEXT where the brand logo belonged. The site ships its logo inline with the root hidden,
  // `svg.outerHTML` captured that verbatim, and as an <img> it painted nothing. The security
  // sanitizer passed it happily — safe is not the same as visible.
  {
    const S = harvester.sanitizeSvg;
    const rootOf = (s) => (/<svg\b[^>]*>/i.exec(s) || [""])[0];

    const hidden = `<svg viewBox="0 0 10 10" style="visibility: hidden;"><path d="M0 0h10v10H0z"/></svg>`;
    ok(!/visibility/i.test(rootOf(S(hidden))), "root style visibility:hidden is removed");

    const none = `<svg viewBox="0 0 10 10" style="display:none;color:red"><circle cx="5" cy="5" r="4"/></svg>`;
    const noneRoot = rootOf(S(none));
    ok(!/display\s*:\s*none/i.test(noneRoot), "root style display:none is removed");
    ok(/color\s*:\s*red/i.test(noneRoot), "…and the rest of the root style survives");

    const attr = `<svg viewBox="0 0 10 10" visibility="hidden" display="none" opacity="0"><rect width="10" height="10"/></svg>`;
    const attrRoot = rootOf(S(attr));
    ok(!/visibility=|display=|opacity=/i.test(attrRoot), "hidden PRESENTATION attributes are removed too");

    // ROOT ONLY. A logo that packs a light and a dark variant hides one on purpose;
    // un-hiding it would stack both marks on top of each other.
    const variants = `<svg viewBox="0 0 10 10" style="visibility:hidden"><g class="dark" style="display:none"><path d="M0 0h5v5H0z"/></g><g class="light"><path d="M5 5h5v5H5z"/></g></svg>`;
    const vOut = S(variants);
    ok(!/visibility/i.test(rootOf(vOut)), "root is un-hidden");
    ok(/class="dark" style="display:none"/.test(vOut), "an INNER hidden variant is left alone");

    // A vector that paints nothing renders an empty box — indistinguishable from broken.
    ok(harvester.svgPaintsSomething(`<svg><path d="M0 0h1v1H0z"/></svg>`), "a mark with a path paints");
    ok(harvester.svgPaintsSomething(`<svg><use href="#m"/></svg>`), "an internal <use> counts as drawable");
    ok(!harvester.svgPaintsSomething(`<svg viewBox="0 0 10 10"><defs><mask id="m"/></defs></svg>`), "defs-only markup paints nothing");

    // ---- THE NAMESPACE: the defect that actually reached a delivered film ----
    // An inline <svg> needs no xmlns inside HTML (the parser supplies it), but written to a
    // standalone .svg and loaded through <img src> it is parsed as XML, where the namespace
    // is mandatory — no xmlns, no image, and the composer's alt text renders instead.
    const inline = `<svg width="13" height="13" viewBox="0 0 100 100" fill="#E2E4E6"><path d="M0 0h1v1H0z"/></svg>`;
    ok(!/xmlns=/i.test(inline), "fixture really is missing the namespace");
    ok(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(rootOf(S(inline))), "xmlns is added so the file loads as an <img>");

    const already = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h1v1H0z"/></svg>`;
    ok((rootOf(S(already)).match(/xmlns=/gi) || []).length === 1, "an existing namespace is not duplicated");

    const xlink = `<svg viewBox="0 0 10 10"><use xlink:href="#m"/></svg>`;
    ok(/xmlns:xlink=/i.test(rootOf(S(xlink))), "an undeclared xlink: prefix is declared too (same XML parse error)");
    ok(!/xmlns:xlink=/i.test(rootOf(S(inline))), "…and is NOT added when nothing uses xlink");

    // The real files from the audited job, while they are still in the cache.
    const linear = path.join(__dirname, "..", "harvest_cache", "521f3583da1e0468", "a1.svg");
    if (fs.existsSync(linear)) {
      ok(/xmlns=/i.test(rootOf(S(fs.readFileSync(linear, "utf8")))),
        "the real linear.app logo that broke job 9e0fq1724n now carries a namespace");
    }
    const duo = path.join(__dirname, "..", "harvest_cache", "10c8fa41703d5b6a", "a1.svg");
    if (fs.existsSync(duo)) {
      ok(!/visibility\s*:\s*hidden/i.test(rootOf(S(fs.readFileSync(duo, "utf8")))),
        "the real duolingo logo with a hidden root is un-hidden");
    }
  }

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }

  console.log(`\n${fail === 0 ? "✓ ALL PASS" : "✗ FAILURES"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("harness error:", e); process.exit(2); });
