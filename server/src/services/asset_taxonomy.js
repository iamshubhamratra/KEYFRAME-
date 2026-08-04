// Lightweight industry/category taxonomy for asset relevance + template matching.
//
// Classifies a film's subject into a product category, then supplies per-category
// signals used across the asset pipeline:
//   - `avoid`   : concepts that are almost always off-topic for this category
//                 (e.g. glamour/jewelry for SaaS) — fed to the Creative Director.
//   - `prefer`  : visual style descriptors the assets should lean toward
//                 (asset-to-template matching, area 7).
//   - kindForPurpose(): the asset KIND a scene wants given its narrative purpose
//                 (hook → hero photo, feature → product UI, proof → people, …).
//
// Deliberately keyword-based (no model): fast, deterministic, and good enough to
// steer retrieval + give the vision agent category context. Falls back to a
// neutral "generic" profile so it never over-constrains an unknown subject.

const CATEGORIES = {
  saas: {
    label: "SaaS / software product",
    match: ["saas", "software", "platform", "dashboard", "workflow", "productivity", "crm", "tool", "app for teams", "b2b"],
    prefer: ["clean UI", "product screenshots", "modern workspace", "real people using software"],
    avoid: ["jewelry", "gemstones", "physical printers or appliances", "literal keyword puns", "clip-art mascots"],
  },
  ai: {
    label: "AI / machine-learning product",
    match: ["ai", "artificial intelligence", "machine learning", "ml", "neural", "gpt", "llm", "generative", "chatbot", "automation"],
    prefer: ["futuristic interfaces", "glowing UI", "abstract data/particles", "neural network motifs", "sleek tech"],
    avoid: ["robots as toys", "sci-fi movie stills", "literal brains", "clip-art", "jewelry"],
  },
  fintech: {
    label: "finance / fintech",
    match: ["finance", "fintech", "bank", "banking", "payment", "invoice", "investing", "trading", "crypto", "wallet", "money", "accounting"],
    prefer: ["clean charts", "secure/trust cues", "professional people", "cards and dashboards"],
    avoid: ["gold bars", "cash piles", "diamonds as value metaphor", "casino imagery", "clip-art"],
  },
  healthcare: {
    label: "healthcare / wellness",
    match: ["health", "healthcare", "medical", "clinic", "patient", "wellness", "fitness", "therapy", "care", "dental", "pharma"],
    prefer: ["real clinicians and patients", "calm clean settings", "warm trustworthy tones"],
    avoid: ["graphic surgery", "stock clip-art doctors", "unrelated lab glassware", "jewelry"],
  },
  ecommerce: {
    label: "e-commerce / retail",
    match: ["ecommerce", "e-commerce", "shop", "store", "retail", "product", "checkout", "cart", "marketplace", "subscription box", "dtc"],
    prefer: ["clean product shots", "lifestyle in-use", "packaging", "shopping moments"],
    avoid: ["literal shipping-container puns", "unrelated warehouses", "clip-art", "jewelry unless the product"],
  },
  education: {
    label: "education / e-learning",
    match: ["education", "learn", "learning", "course", "school", "student", "teacher", "training", "edtech", "tutorial", "academy"],
    prefer: ["students and mentors", "bright approachable settings", "books/screens in use"],
    avoid: ["dated classroom clip-art", "unrelated stock lecture halls", "jewelry"],
  },
  technology: {
    label: "technology / hardware",
    match: ["tech", "technology", "hardware", "device", "gadget", "iot", "cloud", "infrastructure", "developer", "api", "cyber", "security"],
    prefer: ["sleek devices", "data centers", "clean tech close-ups", "code/terminals"],
    avoid: ["cheesy hacker-in-a-hoodie", "green matrix code", "clip-art", "jewelry"],
  },
  corporate: {
    label: "corporate / enterprise",
    match: ["corporate", "enterprise", "business", "consulting", "agency", "company", "team", "office", "professional services", "b2b"],
    prefer: ["real professionals", "clean offices", "subtle confident tone", "meetings and collaboration"],
    avoid: ["corporate-handshake clip-art", "fake smiling stock", "jewelry", "literal puns"],
  },
  startup: {
    label: "startup launch",
    match: ["startup", "launch", "founder", "raise", "seed", "mvp", "disrupt", "beta", "early access"],
    prefer: ["bold energetic imagery", "high-contrast", "young builders", "momentum and motion"],
    avoid: ["stiff corporate stock", "clip-art", "jewelry"],
  },
  marketing: {
    label: "marketing / promotion",
    match: ["marketing", "promo", "campaign", "ad", "advertising", "brand", "growth", "social media", "influencer", "sale", "offer"],
    prefer: ["vibrant lifestyle", "bold graphic energy", "aspirational moments"],
    avoid: ["generic thumbs-up stock", "clip-art", "off-brand luxury metaphors"],
  },
};

const GENERIC = {
  label: "general product / brand",
  match: [],
  prefer: ["modern professional imagery", "on-subject real photography", "clean design"],
  avoid: ["clip-art", "watermarked stock", "off-topic literal keyword puns", "glamour metaphors (diamonds, gold, sports cars) for software/brands"],
};

// Scene narrative purpose -> the asset KIND that best serves it. Used to set
// kindPref for retrieval so a "proof" scene fetches people, not another chart.
const PURPOSE_KIND = {
  hook: "photo",        // a bold, on-subject hero
  feature: "screenshot",// show the product / UI
  how: "screenshot",
  demo: "screenshot",
  proof: "people",      // testimonials / real users
  testimonial: "people",
  quote: "people",      // a canonical scene_role — a quote wants a face, not a chart
  context: "photo",
  benefit: "photo",
  data: "vector",       // charts / abstract data
  stat: "vector",
  cta: "icon",          // clean brand mark / arrow
  outro: "icon",
};

const norm = (s) => String(s || "").toLowerCase();

// Classify a subject/brief into a category key. Scores each category by how many
// of its match terms appear in the combined text; returns the best, or "generic".
function classify({ subject, brief } = {}) {
  const text = norm([
    subject,
    brief && brief.subject, brief && brief.improvedPrompt, brief && brief.goal,
    brief && (brief.keyMessages || []).join(" "), brief && brief.audience,
  ].filter(Boolean).join(" "));
  if (!text) return "generic";
  let best = null, bestScore = 0;
  for (const [key, c] of Object.entries(CATEGORIES)) {
    let score = 0;
    for (const m of c.match) if (text.includes(m)) score += (m.includes(" ") ? 2 : 1);
    if (score > bestScore) { bestScore = score; best = key; }
  }
  return best || "generic";
}

function profileFor(category) {
  return CATEGORIES[category] || GENERIC;
}

// The kind of asset a scene wants, given its purpose. Falls back to "photo".
function kindForPurpose(purpose) {
  return PURPOSE_KIND[norm(purpose)] || "photo";
}

// A compact, human-readable brief for the Creative Director prompt.
function describeForDirector(category) {
  const p = profileFor(category);
  return [
    `Product category: ${p.label}.`,
    `Assets should lean toward: ${p.prefer.join(", ")}.`,
    `Reject as off-category: ${p.avoid.join(", ")}.`,
  ].join(" ");
}

module.exports = { classify, profileFor, kindForPurpose, describeForDirector, CATEGORIES, GENERIC };
