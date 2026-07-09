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
