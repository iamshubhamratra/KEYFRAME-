// TEMPLATE LEXICON — the controlled vocabulary the Template Intelligence layer
// matches on, plus the data-driven matcher that uses it.
//
// WHY A LEXICON AND NOT KEYWORD OVERLAP. A prompt says "banking app", a pack's
// vibe says "a counting house, ledger rules, luminance ladder". Raw word overlap
// is zero; they are the same film. So both sides are projected onto the SAME
// small set of labels first (`finance`), and the score is the overlap of LABELS,
// not of words. That is semantic grouping done deterministically — no model, no
// network, no cold start — and it is what lets one table serve 285 packs and
// every prompt that will ever arrive.
//
// WHY NOT if/else. Every axis below is DATA. Adding a vibe, an industry or a
// synonym is one array entry; nothing branches on a template id anywhere in this
// layer. That is the property that has to survive the library growing to
// hundreds of packs.
//
// Tokens are matched as whole words plus adjacent BIGRAMS ("product launch",
// "deep sea"), so multi-word concepts are first-class. Light stemming folds
// plurals and the common -ing/-ed/-er tails, so "investing"/"investor" both
// reach `finance` without listing every form.

// ---------------------------------------------------------------- axes
//
// contentTypes — WHAT KIND OF FILM this is (its job), not what industry it is in.
const CONTENT_TYPES = {
  saas: ["saas", "software", "platform", "app", "web app", "dashboard", "workspace", "crm", "erp", "subscription", "b2b", "workflow", "productivity tool", "no code"],
  "product-demo": ["demo", "product demo", "walkthrough", "product tour", "feature tour", "how it works", "hands on", "screen recording", "in action", "showcase", "preview"],
  launch: ["launch", "launch film", "product launch", "reveal", "unveil", "debut", "introducing", "release", "ship", "shipping", "going live", "coming soon", "teaser", "now available", "version", "flagship", "premiere"],
  marketing: ["promo", "ad", "advert", "advertisement", "campaign", "commercial", "spot", "offer", "sale", "discount", "conversion", "funnel", "landing page", "cta", "sign up", "growth"],
  education: ["explain", "explainer", "teach", "lesson", "course", "learn", "learning", "curriculum", "classroom", "student", "concept", "understand", "guide", "onboarding", "training", "academy", "study"],
  tutorial: ["tutorial", "how to", "step by step", "walk through", "recipe", "instructions", "setup", "install", "diy", "build a", "getting started"],
  finance: ["finance", "financial", "bank", "banking", "money", "invest", "investment", "investor", "portfolio", "trading", "stock", "revenue", "budget", "savings", "loan", "mortgage", "payments", "payroll", "accounting", "ledger", "invoice", "tax", "pricing", "roi", "fund", "capital", "earnings", "quarterly", "shareholder", "annual report", "balance sheet", "cash flow", "valuation", "margin", "forecast", "analytics", "metrics", "kpi", "chart", "figures", "results"],
  storytelling: ["story", "storytelling", "narrative", "journey", "tale", "chapter", "origin", "founder story", "case study", "testimonial", "memoir", "biography", "arc", "once upon"],
  news: ["news", "headline", "breaking", "report", "bulletin", "press", "announcement", "update", "briefing", "coverage", "dispatch", "current events", "election", "market update", "column", "byline", "wire", "front page", "cutline", "on air", "anchor", "newsroom", "correspondent", "gazette", "daily"],
  social: ["instagram", "tiktok", "reel", "reels", "short", "shorts", "story post", "feed", "social", "viral", "influencer", "creator", "youtube short", "swipe up", "follow us", "hashtag"],
  "brand-promotion": ["brand", "branding", "identity", "manifesto", "who we are", "our mission", "values", "culture", "rebrand", "brand film", "anthem"],
  documentary: ["documentary", "docu", "archival", "expose", "investigation", "profile", "portrait of", "chronicle", "field report", "real story", "climate", "history of"],
  technology: ["tech", "technology", "ai", "artificial intelligence", "machine learning", "llm", "neural", "algorithm", "data", "cloud", "infrastructure", "api", "developer", "engineering", "code", "software engineering", "robotics", "automation", "cyber", "blockchain", "quantum"],
  ecommerce: ["shop", "store", "ecommerce", "e commerce", "checkout", "cart", "product page", "catalog", "retail", "dropship", "marketplace", "order", "shipping", "merch"],
  event: ["event", "conference", "keynote", "summit", "webinar", "meetup", "festival", "expo", "launch event", "livestream", "invite", "save the date", "agenda"],
  recruiting: ["hiring", "recruit", "recruiting", "careers", "job", "vacancy", "we are hiring", "join our team", "talent", "employer"],
  portfolio: ["portfolio", "showreel", "my work", "case work", "selected works", "studio reel", "gallery of work"],
};

// industries — WHAT DOMAIN the subject sits in. Orthogonal to contentTypes:
// "explain how a banking app works" is education + fintech.
const INDUSTRIES = {
  fintech: ["fintech", "bank", "banking", "neobank", "payments", "wallet", "card", "lending", "insurance", "insurtech", "wealth", "brokerage", "treasury", "compliance", "audit", "investor", "shareholder", "hedge", "counting house", "vault", "ledger"],
  crypto: ["crypto", "bitcoin", "ethereum", "web3", "defi", "nft", "token", "blockchain", "mining", "staking", "onchain"],
  "developer-tools": ["developer", "devtool", "sdk", "cli", "terminal", "repo", "git", "ci", "cd", "deploy", "kubernetes", "docker", "database", "api", "open source", "debug", "compiler", "runtime", "framework"],
  ai: ["ai", "artificial intelligence", "machine learning", "deep learning", "llm", "gpt", "model", "agent", "prompt", "inference", "training data", "copilot", "chatbot", "generative"],
  healthcare: ["health", "healthcare", "clinic", "medical", "doctor", "patient", "hospital", "therapy", "wellness", "pharma", "dental", "nurse", "diagnosis", "telehealth", "mental health"],
  fitness: ["fitness", "workout", "gym", "exercise", "run", "running", "yoga", "strength", "muscle", "cardio", "athlete", "coach", "marathon", "nutrition", "weight loss"],
  food: ["food", "restaurant", "cafe", "coffee", "bakery", "kitchen", "chef", "recipe", "menu", "dining", "cook", "cooking", "pizza", "bread", "brew", "wine", "cocktail", "farm to table", "grocery"],
  travel: ["travel", "trip", "journey", "destination", "hotel", "flight", "tourism", "vacation", "itinerary", "backpack", "explore the world", "city guide", "adventure", "hostel", "airline", "resort", "postcard", "passport", "abroad", "wander", "metro", "harbor", "harbour", "departures", "transit", "road trip", "guidebook"],
  realestate: ["real estate", "property", "listing", "apartment", "house", "home tour", "rent", "mortgage", "realtor", "architecture", "interior", "construction"],
  ecommerce: ["ecommerce", "retail", "shop", "store", "product photography", "merch", "dropshipping", "fashion", "apparel", "sneaker", "beauty", "skincare", "cosmetics", "jewelry"],
  education: ["school", "university", "college", "classroom", "teacher", "student", "edtech", "course", "tutoring", "exam", "campus", "library"],
  gaming: ["game", "gaming", "gamer", "esports", "console", "arcade", "rpg", "fps", "twitch", "level up", "quest", "pixel", "speedrun"],
  music: ["music", "song", "album", "band", "artist", "playlist", "streaming music", "concert", "dj", "studio session", "vinyl", "beat", "audio"],
  sports: ["sport", "sports", "match", "league", "team", "tournament", "championship", "football", "soccer", "basketball", "cricket", "racing", "formula", "rodeo", "climbing", "surf", "cycling", "chess"],
  media: ["media", "publisher", "magazine", "newsroom", "journalism", "editorial desk", "podcast", "broadcast", "cinema", "streaming"],
  // "impact" and "cause" are deliberately absent: "impact bursts" is motion
  // vocabulary and put a boxing template in the charity sector.
  nonprofit: ["nonprofit", "charity", "ngo", "donate", "donation", "volunteer", "fundraising", "community program", "philanthropy", "grant"],
  environment: ["climate", "climate change", "sustainability", "sustainable", "conservation", "biodiversity", "ecosystem", "wildlife", "pollution", "recycling", "net zero", "carbon", "emissions", "rainforest", "glacier", "planet", "eco"],
  manufacturing: ["manufacturing", "factory", "assembly", "supply chain", "logistics", "warehouse", "industrial", "machinery", "production line", "quality control"],
  agriculture: ["farm", "farming", "agriculture", "crop", "harvest", "soil", "garden", "greenhouse", "seed", "orchard", "livestock", "allotment"],
  automotive: ["car", "auto", "automotive", "vehicle", "ev", "electric vehicle", "drive", "motor", "engine", "dealership", "road trip"],
  // "grid" is deliberately absent: it is a layout word every second design blurb
  // uses, and it put half the poster packs in the energy sector.
  energy: ["energy", "solar", "wind turbine", "battery", "power grid", "renewable", "oil", "gas", "power plant", "carbon", "emissions", "kilowatt"],
  hospitality: ["hotel", "hospitality", "guest", "booking", "concierge", "spa", "resort", "airbnb", "stay"],
  pets: ["pet", "dog", "cat", "puppy", "kitten", "animal", "vet", "veterinary", "shelter", "adopt a"],
  science: ["science", "research", "lab", "laboratory", "experiment", "physics", "chemistry", "biology", "space", "astronomy", "climate science", "study finds", "peer review", "thesis"],
  legal: ["legal", "law", "lawyer", "attorney", "court", "contract", "regulation", "policy", "governance", "privacy", "gdpr"],
  outdoors: ["outdoor", "hike", "hiking", "camp", "camping", "mountain", "trail", "forest", "wilderness", "ocean", "dive", "diving", "sail", "ski", "alpine", "desert", "jungle", "river"],
};

// vibes — the VISUAL INTENTION. What the film should look and feel like.
const VIBES = {
  futuristic: ["futuristic", "future", "sci fi", "cyber", "neon", "holographic", "next gen", "space age", "tech noir", "synth", "quantum", "cosmic", "orbital"],
  cinematic: ["cinematic", "film like", "filmic", "movie", "trailer", "epic", "sweeping", "letterboxed", "widescreen", "moody", "atmospheric", "dramatic", "anamorphic"],
  energetic: ["energetic", "high energy", "fast", "punchy", "kinetic", "hype", "explosive", "dynamic", "upbeat", "electric", "adrenaline", "pumping", "rapid"],
  playful: ["playful", "fun", "quirky", "whimsical", "cheeky", "cute", "silly", "cartoon", "toy", "candy", "bouncy", "irreverent", "friendly"],
  premium: ["premium", "luxury", "luxurious", "high end", "refined", "elegant", "sophisticated", "polished", "exclusive", "prestige", "boutique", "couture", "gold"],
  minimal: ["minimal", "minimalist", "clean", "simple", "spare", "uncluttered", "whitespace", "restrained", "quiet", "understated", "essential"],
  corporate: ["corporate", "professional", "business", "enterprise", "b2b", "executive", "boardroom", "trustworthy", "credible", "formal", "institutional", "consulting", "analyst", "quarterly", "investor", "stakeholder", "governance", "strategy", "roadmap", "keynote", "briefing", "counting house", "office"],
  editorial: ["editorial", "magazine", "print", "typographic", "serif", "gallery", "museum", "curated", "literary", "essay", "broadsheet", "publication", "archive"],
  bold: ["bold", "loud", "brutalist", "poster", "punk", "striking", "graphic", "in your face", "maximal", "riot", "stencil", "protest", "shout"],
  technical: ["technical", "engineering", "schematic", "blueprint", "diagram", "analytical", "systems", "precise", "terminal", "monospace", "spec", "wireframe"],
  emotional: ["emotional", "heartfelt", "moving", "touching", "intimate", "tender", "nostalgic", "sentimental", "human", "vulnerable", "poignant", "hopeful"],
  educational: ["educational", "instructive", "clear", "didactic", "chalk", "notebook", "sketchnote", "annotated", "labelled", "explanatory", "textbook"],
  retro: ["retro", "vintage", "throwback", "eighties", "nineties", "analog", "vhs", "crt", "risograph", "letterpress", "old school"],
  organic: ["organic", "natural", "handmade", "craft", "artisanal", "botanical", "earthy", "watercolor", "hand drawn", "textured", "clay", "paper", "stitched", "woven", "rustic"],
  calm: ["calm", "serene", "peaceful", "soothing", "gentle", "slow", "meditative", "soft", "warm", "reassuring", "quiet hours", "ambient"],
  gritty: ["gritty", "raw", "rough", "industrial", "worn", "grunge", "concrete", "steel", "smoke", "noir", "underground", "street"],
};

// tones — the EMOTIONAL REGISTER of the copy/delivery, separate from the look.
const TONES = {
  confident: ["confident", "assured", "decisive", "assertive", "certain", "no nonsense"],
  warm: ["warm", "friendly", "welcoming", "kind", "approachable", "human", "caring"],
  urgent: ["urgent", "limited", "hurry", "act fast", "deadline", "countdown", "last chance"],
  authoritative: ["authoritative", "expert", "definitive", "rigorous", "credible", "proven", "leading", "gravitas"],
  witty: ["witty", "clever", "wry", "humorous", "funny", "tongue in cheek", "sarcastic", "dry humor"],
  serious: ["serious", "sober", "grave", "solemn", "weighty", "critical"],
  inspiring: ["inspiring", "aspirational", "uplifting", "motivational", "visionary", "empowering"],
  reassuring: ["reassuring", "safe", "secure", "reliable", "trusted", "dependable", "steady", "protected"],
};

// visualStyle — surface character. Derived structurally for packs (ground
// luminance, flat vs gradient) and lexically for prompts.
const VISUAL_STYLES = {
  dark: ["dark", "black", "midnight", "noir", "nocturnal", "night", "deep space", "shadow", "low key", "obsidian"],
  light: ["light", "white", "bright", "airy", "daylight", "porcelain", "ivory", "cream", "high key"],
  vivid: ["vivid", "saturated", "colorful", "colourful", "rainbow", "neon", "candy", "pop"],
  muted: ["muted", "desaturated", "pastel", "subtle", "washed", "faded", "earth tone", "sepia"],
  monochrome: ["monochrome", "black and white", "grayscale", "greyscale", "duotone", "single color"],
  glassy: ["glass", "glassmorphism", "frosted", "translucent", "blur", "glow", "bloom", "aurora"],
  textured: ["texture", "textured", "grain", "grainy", "paper stock", "risograph", "halftone", "print texture", "canvas"],
};

// typographyStyle — the display face's character.
const TYPOGRAPHY_STYLES = {
  serif: ["serif", "bodoni", "didone", "garamond", "fraunces", "playfair", "old style"],
  sans: ["sans", "grotesk", "helvetica", "inter", "geometric sans", "neue"],
  mono: ["mono", "monospace", "typewriter"],
  display: ["display", "headline face", "poster type", "condensed", "extended", "heavy weight", "black weight"],
  handwritten: ["handwritten", "script", "marker", "chalk", "brush", "signature", "scrawl"],
};

// animationStyle — how the film MOVES.
const ANIMATION_STYLES = {
  kinetic: ["kinetic", "kinetic typography", "type animation", "text driven", "punchy cuts"],
  camera: ["camera", "dolly", "parallax", "push in", "pull back", "one take", "tracking shot", "3d camera"],
  glitch: ["glitch", "distort", "scanline", "datamosh", "flicker", "static"],
  particle: ["particle", "particles", "bokeh", "sparkle", "dust", "confetti", "snow", "embers"],
  drawn: ["hand drawn", "draws itself", "sketch", "doodle", "line art", "illustrated motion", "stop motion"],
  dimensional: ["3d", "three d", "webgl", "volumetric", "depth", "extruded", "isometric"],
  restrained: ["subtle motion", "minimal motion", "still", "slow drift", "calm motion", "quiet motion"],
};

const AXES = {
  contentTypes: CONTENT_TYPES,
  industries: INDUSTRIES,
  vibes: VIBES,
  tones: TONES,
  visualStyles: VISUAL_STYLES,
  typographyStyles: TYPOGRAPHY_STYLES,
  animationStyles: ANIMATION_STYLES,
};

// ---------------------------------------------------------------- matcher

// Words carried by nearly every prompt AND nearly every pack blurb. Left in, they
// make everything look 60% similar to everything.
const STOP = new Set([
  "the", "and", "for", "with", "your", "our", "you", "that", "this", "from", "are", "was", "its",
  "into", "all", "any", "how", "why", "what", "who", "when", "where", "will", "can", "has", "have",
  "not", "but", "out", "own", "over", "then", "than", "them", "they", "their", "there", "here",
  "one", "two", "three", "each", "every", "some", "more", "most", "much", "very", "just", "only",
  "also", "about", "after", "before", "again", "make", "makes", "made", "get", "gets", "use",
  "used", "using", "like", "well", "new", "same", "such", "video", "film", "scene",
  "scenes", "beat", "beats", "template", "pack", "shipped", "authored", "rendered", "bundle",
  "words", "pictures", "change", "native", "portrait", "landscape", "second", "seconds",
]);

// Light, deliberately conservative stemmer: plurals and the three tails that
// actually cost matches (-ing/-ed/-er). Aggressive stemming collides unrelated
// words, which is worse here than a missed synonym — the lexicon can always list
// the form explicitly.
function stem(w) {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("ers")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("er")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith("es") && !w.endsWith("ses")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Split text into stemmed unigrams (stopwords dropped) and adjacent bigrams. */
function tokenize(text) {
  const raw = String(text || "").toLowerCase().match(/[a-z][a-z0-9]+/g) || [];
  const uni = [];
  for (const w of raw) {
    if (w.length < 2 || STOP.has(w)) continue;
    uni.push(stem(w));
  }
  const bi = [];
  for (let i = 0; i + 1 < raw.length; i++) bi.push(`${stem(raw[i])} ${stem(raw[i + 1])}`);
  return { uni, bi, rawCount: raw.length };
}

// token -> Set(label), built once per axis. Multi-word lexicon entries are
// indexed as stemmed bigrams so they can only match adjacent words.
const _index = new Map();
function indexFor(axisName) {
  if (_index.has(axisName)) return _index.get(axisName);
  const axis = AXES[axisName] || {};
  const idx = new Map();
  const add = (key, label) => {
    let s = idx.get(key);
    if (!s) idx.set(key, (s = new Set()));
    s.add(label);
  };
  for (const [label, terms] of Object.entries(axis)) {
    for (const term of terms) {
      const parts = String(term).toLowerCase().match(/[a-z][a-z0-9]+/g) || [];
      if (!parts.length) continue;
      if (parts.length === 1) add(stem(parts[0]), label);
      // 2+ word phrases index their FIRST adjacent pair — a good enough anchor,
      // and it keeps the index to uni+bigrams (one pass, no window scanning).
      else add(`${stem(parts[0])} ${stem(parts[1])}`, label);
    }
  }
  _index.set(axisName, idx);
  return idx;
}

/**
 * Project text onto one axis. Returns Map<label, hits> — hits, not a boolean, so
 * a prompt that says "bank" five times outranks one that says it once.
 */
function labelsFor(text, axisName) {
  const idx = indexFor(axisName);
  const { uni, bi } = typeof text === "string" ? tokenize(text) : text;
  const out = new Map();
  const bump = (label, n) => out.set(label, (out.get(label) || 0) + n);
  for (const t of uni) { const s = idx.get(t); if (s) for (const l of s) bump(l, 1); }
  // A matched BIGRAM is a stronger signal than two loose words ("deep sea" vs
  // "deep" and "sea" scattered), so it is worth two hits.
  for (const t of bi) { const s = idx.get(t); if (s) for (const l of s) bump(l, 2); }
  return out;
}

/** Project text onto every axis at once (tokenizes once). */
function profileText(text) {
  const toks = tokenize(text);
  const out = { tokens: toks };
  for (const axis of Object.keys(AXES)) out[axis] = labelsFor(toks, axis);
  return out;
}

/**
 * Overlap of two label maps, normalised to 0..1.
 *
 * Deliberately asymmetric: the denominator is the DEMAND side (the prompt) only.
 * A pack that also carries labels the prompt never asked for is not penalised —
 * breadth is not a defect — but a prompt label the pack cannot serve costs the
 * full share of that label. Weighted by hit strength on the demand side, so the
 * prompt's dominant theme dominates the score.
 */
function overlap(demand, supply) {
  if (!demand || !demand.size) return 0;
  let total = 0, hit = 0;
  for (const [label, n] of demand) {
    const w = Math.min(3, n); // one strong signal is enough; cap runaway repetition
    total += w;
    if (supply && supply.has(label)) hit += w;
  }
  return total ? hit / total : 0;
}

/** The labels a demand map wanted and the supply map actually served. */
function matchedLabels(demand, supply) {
  const out = [];
  for (const [label] of demand || []) if (supply && supply.has(label)) out.push(label);
  return out;
}

/** Top-N labels of a map by hit count. */
function topLabels(map, n = 4) {
  return [...(map || [])].sort((a, b) => b[1] - a[1]).slice(0, n).map(([l]) => l);
}

module.exports = {
  AXES, CONTENT_TYPES, INDUSTRIES, VIBES, TONES,
  VISUAL_STYLES, TYPOGRAPHY_STYLES, ANIMATION_STYLES,
  tokenize, stem, labelsFor, profileText, overlap, matchedLabels, topLabels, STOP,
};
