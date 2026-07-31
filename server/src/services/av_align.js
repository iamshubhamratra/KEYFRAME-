// A/V ALIGNMENT — does each scene SHOW what it SAYS?
//
// The narration is generated from `script.scenes[i].voiceover` and mixed in at
// that scene's start (audio_mix.js places each VO clip with an `adelay` equal to
// the scene's startSec). The deterministic composers render from the SAME scene
// object, so their words and the narration agree by construction.
//
// The LLM composer is the exception: it receives the storyboard and writes the
// document freely. Its prompt is dense with hard requirements about vectors,
// stickers, camera moves and "spatial fill" — and, until this check existed,
// said nothing at all about the words. A measured premium film scored 25%: the
// narrator said "Still hunting deals everywhere?" while the screen read "INDIA'S
// ULTIMATE / One App. Everything.", and six of eight scenes were showing copy
// scraped off the client's website instead of the scene's own script.
//
// What we assert is deliberately narrow and cheap: a scene must RENDER ITS OWN
// AUTHORED COPY (headline / onScreenText / subtext / emphasis). We compare
// against the authored on-screen text rather than the voiceover on purpose —
// the scriptwriter already wrote those two to agree, and spoken copy spells
// numbers out ("ninety percent", "one ninety nine") where the screen shows
// "90%" / "₹199", which would make a direct VO comparison fire on good films.
//
// Pure string work: no DOM, no browser, no LLM.

// Words too common to prove anything about topic.
const STOP = new Set((
  "the a an and or but of to in on for with your you our we us is are was were be been it its this that " +
  "at as from by more all now get can into than then so up out no not new more most just only also very " +
  "how what when where why who which their there here them they he she his her i me my"
).split(" "));

function contentWords(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/&[a-z]+;|&#\d+;/g, " ")
    .replace(/[^a-z0-9₹$€£%]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && w.length > 2 && !STOP.has(w));
}

// Everything the scene's author put on screen for this beat.
function authoredCopy(scene) {
  if (!scene) return [];
  const parts = [scene.headline, scene.emphasis, scene.subtext, scene.kicker]
    .concat(Array.isArray(scene.onScreenText) ? scene.onScreenText : [])
    .concat(Array.isArray(scene.bullets) ? scene.bullets : [])
    .concat(Array.isArray(scene.chips) ? scene.chips : []);
  return parts.filter(Boolean).map(String);
}

// Packs that animate per character wrap every letter in its own element, so the
// stripped markup reads "D e a l s e v e r y w h e r e ?" — the word boundaries
// are gone and cannot be recovered (the gap between words and the gap between
// letters are both just a tag boundary). Matching therefore also runs against a
// whitespace-squashed form, where "deals" and "everywhere" are still findable
// inside "dealseverywhere".
function squash(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Text a scene's timeline TYPES in at runtime (terminal packs render an empty
// span and fill it from the GSAP script). It never appears in the static
// markup, so without this those scenes look blank to a string parse.
function typedTexts(html) {
  const byScene = new Map();
  const re = /\b(?:type|countTxt)\s*\(\s*["'`]#(s\d+)[^"'`]*["'`]\s*,\s*["'`]([^"'`]{2,})["'`]/g;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const cur = byScene.get(m[1]) || [];
    cur.push(m[2]);
    byScene.set(m[1], cur);
  }
  return byScene;
}

// Visible text of each top-level scene clip, in document order.
function sceneTexts(html) {
  const src = String(html || "");
  const typed = typedTexts(src);
  const re = /<div[^>]*\bid="(s\d+)"[^>]*>/g;
  const marks = [];
  let m;
  while ((m = re.exec(src))) {
    if (marks.some((x) => x.id === m[1])) continue;   // first occurrence wins
    marks.push({ id: m[1], start: m.index });
  }
  return marks.map((mk, i) => {
    const body = src.slice(mk.start, i + 1 < marks.length ? marks[i + 1].start : src.length);
    const markup = body
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      id: mk.id,
      text: [markup, ...(typed.get(mk.id) || [])].join(" ").trim(),
    };
  });
}

// Per-scene topical overlap with the authored copy, plus repair-ready issues.
//
// The bar is "does this scene say ANYTHING its script said", not "does it say
// all of it". Legitimate designs drop material on purpose — a statement scene
// may render only the headline and leave the three bullets out — so demanding
// high coverage flags good deterministic films (measured: 25-50%). A scene that
// shares not one topical word with its own script, however, is showing a
// different subject than the narrator is describing.
//
// Brand and title words are excluded from the comparison: they recur in every
// scene of every film, so matching on them would pass a scene that swapped its
// entire subject but kept the company name.
//   minRatio — fraction of scenes that must pass before we call the film misaligned.
function alignmentReport({ html, scenes, brand, title, minRatio = 0.7 } = {}) {
  const clips = sceneTexts(html);
  const list = Array.isArray(scenes) ? scenes : [];
  const generic = new Set([...contentWords(brand), ...contentWords(title)]);
  const out = [];

  for (let i = 0; i < clips.length && i < list.length; i++) {
    const scene = list[i];
    const authored = authoredCopy(scene);
    const want = new Set(authored.flatMap(contentWords).filter((w) => !generic.has(w)));
    if (!want.size) continue;              // nothing distinctive authored -> nothing to assert
    const seen = new Set(contentWords(clips[i].text));
    const tight = squash(clips[i].text);
    let hit = 0;
    for (const w of want) if (seen.has(w) || tight.includes(w)) hit++;
    out.push({
      id: clips[i].id,
      sceneIndex: i,
      hits: hit,
      coverage: Math.round((hit / want.size) * 100) / 100,
      ok: hit > 0,
      authored: authored.join(" | ").slice(0, 90),
      rendered: clips[i].text.slice(0, 90),
    });
  }

  const counted = out.length;
  const matched = out.filter((s) => s.ok).length;
  const ratio = counted ? matched / counted : 1;
  const issues = [];
  if (counted && ratio < minRatio) {
    const bad = out.filter((s) => !s.ok).slice(0, 6);
    issues.push(
      `A/V MISMATCH: ${counted - matched} of ${counted} scenes render copy unrelated to their own script. ` +
      `The narration is generated from each scene's script and plays over THAT scene, so the words on screen must be the scene's own copy — not text lifted from the website or invented.`,
    );
    for (const s of bad) {
      issues.push(`- ${s.id} must show its script copy "${s.authored}" — it currently shows "${s.rendered}"`);
    }
  }
  return { scenes: out, counted, matched, ratio: Math.round(ratio * 100) / 100, issues };
}

module.exports = { alignmentReport, sceneTexts, authoredCopy, contentWords };
