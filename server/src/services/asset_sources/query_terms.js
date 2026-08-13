// Reduce a scene's asset query to its CONCRETE SUBJECT NOUNS for a stock search.
// Scene queries leak camera/motion direction and generic adjectives from the
// storyboard ("camera pans rapidly crisp", "clean sparkle icon pulses", "fast
// tight macro shot"), which make a stock-VECTOR search return random junk (a
// cartoon tooth, a syringe). Strip those words; if no concrete noun survives,
// the caller should SKIP the fetch — a missing vector beats an off-topic one.

// Direction verbs, camera/edit terms, generic adjectives, fillers — never the subject.
const STOP = new Set([
  // articles / fillers / connectives
  "the", "and", "for", "with", "your", "our", "its", "into", "onto", "from", "that", "this", "new", "all", "one", "two",
  "featuring", "shows", "showing", "show", "using", "via", "then", "also", "more", "less", "any", "each", "per",
  // generic adjectives (not a searchable subject)
  "clean", "messy", "rapid", "rapidly", "quick", "quickly", "fast", "slow", "smart", "easy", "simple", "best",
  "great", "good", "modern", "bold", "calm", "soft", "bright", "dark", "light", "big", "small", "huge", "tiny",
  "real", "live", "seamless", "effortless", "instant", "instantly", "clear", "crisp", "sleek", "premium",
  "minimal", "minimalist", "dynamic", "smooth", "smoothly", "gently", "tight", "wide", "vivid", "subtle",
  // camera / motion / edit direction
  "zoom", "zooms", "zooming", "pan", "pans", "panning", "pull", "pulls", "push", "pushes", "pushing",
  "reveal", "reveals", "revealing", "slide", "slides", "sliding", "fade", "fades", "drift", "drifts",
  "float", "floats", "spin", "spins", "collapse", "collapses", "collapsing", "turn", "turns", "lands",
  "settles", "settle", "focusing", "focus", "across", "back", "over", "around", "dizzying", "sweeping",
  "camera", "shot", "shots", "scene", "angle", "motion", "moving", "frame", "closeup", "close", "macro",
  "transition", "cinematic", "parallax", "cut", "pulse", "pulses", "pulsing", "loop", "loops", "glow", "glows",
  // MOOD, CONDITION AND POSTURE — the expensive omission.
  //
  // A scene direction is written to convey a feeling ("an OVERWHELMED analyst", "TANGLED
  // cables", "a team COLLABORATING"). A stock caption states what is in the frame and
  // essentially never states the mood it was shot in, so every one of these words is a
  // search term no photograph will match and a scoring requirement no candidate can satisfy.
  //
  // Measured on live pools before they were added: "tangled cables scattered paperwork"
  // capped its best available picture at 69/100 and "an overwhelmed analyst at a wall of
  // monitors" at 71 — not because the pictures were wrong, but because half of each query
  // described a mood. Retrieval quality does not depend on them: four query strategies were
  // measured against a fixed yardstick and dropping these words moved the mean best score by
  // +0.5 (77.2 -> 77.7), well inside noise, while freeing a quarter of the relevance
  // denominator for words that can actually be matched.
  "overwhelmed", "stressed", "tangled", "scattered", "cluttered", "chaotic", "messy",
  "tidy", "organised", "organized", "busy", "quiet", "loud", "empty", "full", "open",
  "closed", "happy", "sad", "excited", "confident", "frustrated", "tired", "focused",
  "collaborating", "working", "thinking", "looking", "watching", "holding", "sitting",
  "standing", "walking", "running", "climbing", "rising", "falling", "growing",
  "professional", "casual", "young", "old", "elegant", "vibrant", "muted", "warm", "cool",
  "beautiful", "stunning", "gorgeous", "perfect", "amazing", "fresh", "vast", "endless",
  // Absorbed from asset_requirements' own list when queryFromProse was routed through here,
  // so consolidating the two did not quietly lose the words only one of them knew.
  "are", "our", "you", "see", "sees", "text", "headline", "screen", "left", "right", "down",
  "appears", "appear", "snaps", "three", "every", "very", "just", "like",
]);

// Return a cleaned, space-joined subject query (concrete nouns only), or "" if
// the whole query was direction/adjective/filler (caller should skip the fetch).
function subjectQuery(query) {
  const words = String(query || "").toLowerCase().match(/[a-z][a-z-]{2,}/g) || [];
  const nouns = [];
  for (const w of words) if (!STOP.has(w) && !nouns.includes(w)) nouns.push(w);
  return nouns.slice(0, 4).join(" ").trim();
}

module.exports = { subjectQuery, STOP };
