// AUTO GENERATE — the briefs an admin would otherwise have to type.
//
// The generate form asks for intent: a name, a prompt, an orientation, maybe a
// brand colour. That is the right form when you know what you want, and pure
// friction when you just want the library filled. This module supplies the same
// fields from a curated pool so "Auto generate" needs one number and nothing
// else.
//
// The pool is HAND-WRITTEN rather than model-invented, for two reasons. A batch
// of fifteen model-invented briefs converges — ask any model for "a template
// idea" fifteen times and it returns the same three moods in different words —
// and every brief here has to be a subject the six renderer families can
// actually carry. Each entry names its family explicitly, so a run of fifteen
// spans all six rather than landing on whichever family the prompt wording
// happens to suggest.
//
// The prompts still go to the spec generator exactly as a typed one would: the
// palette, the fonts and the ground are the model's, not this file's.

const FAMILY_IDS = [
  "retro-terminal", "healthcare-soft", "data-viz-mono",
  "fintech-dark", "saas-gradient", "liquid-glass",
];

// Four per family, alternating orientation so a batch is not all reels or all
// widescreen. `category` feeds the gallery filter; `style` is a short hint the
// spec generator folds into the brief.
const POOL = [
  // ---- retro-terminal ----
  { slug: "signal-relay", name: "Signal Relay", family: "retro-terminal", orientation: "vertical", category: "developer",
    prompt: "A developer-tool template with the feel of a terminal session: a near-black ground, one phosphor accent, monospaced type, and restrained cursor-like motion. For CLI tools, SDKs and API launches.", style: "phosphor terminal" },
  { slug: "night-shift-ops", name: "Night Shift Ops", family: "retro-terminal", orientation: "horizontal", category: "devops",
    prompt: "An on-call and incident-response template: dark console ground, an amber warning accent, tabular monospaced numbers, and motion that ticks rather than glides.", style: "amber console" },
  { slug: "cold-boot", name: "Cold Boot", family: "retro-terminal", orientation: "vertical", category: "security",
    prompt: "A security-product template with an austere black ground, a single cold cyan accent and hairline rules — for pen-testing, key management and zero-trust stories.", style: "cold cyan" },
  { slug: "green-room-cli", name: "Green Room CLI", family: "retro-terminal", orientation: "horizontal", category: "developer",
    prompt: "An open-source project template: charcoal ground, a soft green accent, generous monospace, and a plain, unhurried pace for changelogs and release notes.", style: "soft green" },

  // ---- healthcare-soft ----
  { slug: "quiet-clinic", name: "Quiet Clinic", family: "healthcare-soft", orientation: "vertical", category: "healthcare",
    prompt: "A patient-facing clinic template: airy off-white ground, one calm teal accent, rounded humanist type and slow, reassuring motion. For appointments, onboarding and care plans.", style: "calm and airy" },
  { slug: "meadow-therapy", name: "Meadow Therapy", family: "healthcare-soft", orientation: "horizontal", category: "wellness",
    prompt: "A mental-health and therapy template in warm sage and cream, with soft edges, an unhurried rhythm and type that never shouts.", style: "warm sage" },
  { slug: "first-light-care", name: "First Light Care", family: "healthcare-soft", orientation: "vertical", category: "healthcare",
    prompt: "A maternity and family-care template: pale blush ground, a muted coral accent, gentle curves and a hopeful, morning-light mood.", style: "blush and coral" },
  { slug: "harbour-wellness", name: "Harbour Wellness", family: "healthcare-soft", orientation: "horizontal", category: "wellness",
    prompt: "A fitness and nutrition template with a light stone ground, one deep marine accent, clean sans type and steady, confident motion.", style: "stone and marine" },

  // ---- data-viz-mono ----
  { slug: "ledger-grid", name: "Ledger Grid", family: "data-viz-mono", orientation: "horizontal", category: "analytics",
    prompt: "An analytics template built around numbers: a near-white ground, one ink-blue accent, a visible measurement grid and tabular figures that count up. For dashboards and reporting.", style: "measured and precise" },
  { slug: "signal-to-noise", name: "Signal To Noise", family: "data-viz-mono", orientation: "vertical", category: "analytics",
    prompt: "A data-storytelling template: paper-grey ground, a single hot accent used only on the number that matters, and everything else in restrained monochrome.", style: "one hot accent" },
  { slug: "survey-plot", name: "Survey Plot", family: "data-viz-mono", orientation: "horizontal", category: "research",
    prompt: "A research and benchmark template with a drafting-paper ground, a graphite ink, thin rules and plotted-point motion. For studies, comparisons and index reports.", style: "drafting paper" },
  { slug: "quarterly-mono", name: "Quarterly Mono", family: "data-viz-mono", orientation: "vertical", category: "finance",
    prompt: "A quarterly-results template: cool white ground, one navy accent, strict alignment and figures that arrive one after another rather than all at once.", style: "cool navy" },

  // ---- fintech-dark ----
  { slug: "vault-terminal", name: "Vault Terminal", family: "fintech-dark", orientation: "horizontal", category: "fintech",
    prompt: "A payments-infrastructure template: deep navy ground, one electric accent, tabular monospaced numbers and restrained, mechanical motion. For revenue, pricing and treasury films.", style: "deep navy, electric accent" },
  { slug: "after-hours-desk", name: "After Hours Desk", family: "fintech-dark", orientation: "vertical", category: "fintech",
    prompt: "A trading and markets template in near-black with a single acid-green accent, thin dividing rules and numbers that tick like a live feed.", style: "acid green on black" },
  { slug: "private-ledger", name: "Private Ledger", family: "fintech-dark", orientation: "horizontal", category: "finance",
    prompt: "A wealth and private-banking template: charcoal ground, a muted brass accent, serif display over sans body, and slow, expensive-feeling motion.", style: "charcoal and brass" },
  { slug: "settlement-layer", name: "Settlement Layer", family: "fintech-dark", orientation: "vertical", category: "crypto",
    prompt: "A blockchain-infrastructure template: ink-black ground, one violet accent, hairline geometry and a cold, technical pace.", style: "ink and violet" },

  // ---- saas-gradient ----
  { slug: "launch-window", name: "Launch Window", family: "saas-gradient", orientation: "vertical", category: "saas",
    prompt: "A product-launch template with a confident gradient ground, bold display type and motion that builds. For feature announcements and changelog films.", style: "bold launch gradient" },
  { slug: "onboard-flow", name: "Onboard Flow", family: "saas-gradient", orientation: "horizontal", category: "saas",
    prompt: "A user-onboarding template: soft indigo-to-magenta gradient, friendly geometric sans, numbered steps and motion that moves the eye forward.", style: "indigo to magenta" },
  { slug: "team-velocity", name: "Team Velocity", family: "saas-gradient", orientation: "vertical", category: "productivity",
    prompt: "A collaboration-tool template in a fresh teal-to-lime gradient with rounded cards, quick cuts and an energetic, optimistic pace.", style: "teal to lime" },
  { slug: "pipeline-sunrise", name: "Pipeline Sunrise", family: "saas-gradient", orientation: "horizontal", category: "sales",
    prompt: "A CRM and sales template with a warm amber-to-rose gradient, large friendly numerals and motion that climbs.", style: "amber to rose" },

  // ---- liquid-glass ----
  { slug: "frosted-suite", name: "Frosted Suite", family: "liquid-glass", orientation: "vertical", category: "premium",
    prompt: "A premium-product template built on frosted glass panels over a deep tinted ground, with soft light blooms and slow parallax. For flagship launches.", style: "frosted glass, deep tint" },
  { slug: "aurora-shell", name: "Aurora Shell", family: "liquid-glass", orientation: "horizontal", category: "premium",
    prompt: "A hardware-launch template: dark ground with an aurora wash behind translucent panels, thin bright edges and cinematic, unhurried motion.", style: "aurora wash" },
  { slug: "studio-vitrine", name: "Studio Vitrine", family: "liquid-glass", orientation: "vertical", category: "design",
    prompt: "A design-studio showreel template with pale glass over a warm stone ground, editorial type and camera moves that drift rather than cut.", style: "warm stone glass" },
  { slug: "atlas-glass", name: "Atlas Glass", family: "liquid-glass", orientation: "horizontal", category: "enterprise",
    prompt: "An enterprise-platform template: cool slate ground, glass cards with a single sapphire edge light, and composed, corporate-calm motion.", style: "slate and sapphire" },
];

const MAX_BATCH = 15;

// Round-robin the families so consecutive templates never share one, and a batch
// of six already covers the whole renderer set. Within a family the entries keep
// their authored order, which alternates orientation.
function interleaveByFamily(briefs) {
  const byFamily = new Map(FAMILY_IDS.map((f) => [f, []]));
  for (const b of briefs) if (byFamily.has(b.family)) byFamily.get(b.family).push(b);
  const out = [];
  for (let round = 0; out.length < briefs.length; round++) {
    let placed = false;
    for (const f of FAMILY_IDS) {
      const list = byFamily.get(f);
      if (list && list[round]) { out.push(list[round]); placed = true; }
    }
    if (!placed) break; // every family exhausted
  }
  return out;
}

// A slug that is free. `taken` must carry BOTH existing template slugs and the
// installed pack names — createTemplate refuses either, and a batch that only
// checked its own table would die on the first collision with frames/.
function freeSlug(base, taken) {
  if (!taken.has(base)) return base;
  for (let n = 2; n <= 99; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return null;
}

/**
 * PURE. Plan an auto batch: `count` create-payloads with free slugs, spread
 * across families. Returns fewer than requested only when the pool runs dry.
 *
 * @param {object} opts
 * @param {number} opts.count  how many templates (clamped to 1..15)
 * @param {Set<string>} opts.taken  slugs already in use (templates + packs)
 * @returns {Array<{name,slug,orientation,category,prompt,style,family,description}>}
 */
function planAutoBatch({ count, taken, orientation } = {}) {
  const n = Math.max(1, Math.min(MAX_BATCH, Math.floor(Number(count) || 0)));
  const used = new Set(taken || []);
  // "vertical"/"horizontal" override every brief's authored orientation; anything
  // else (the default) keeps the pool's own alternating mix.
  const force = orientation === "vertical" || orientation === "horizontal" ? orientation : null;
  const plan = [];
  for (const b of interleaveByFamily(POOL)) {
    if (plan.length >= n) break;
    const slug = freeSlug(b.slug, used);
    if (!slug) continue;
    used.add(slug);
    plan.push({
      name: slug === b.slug ? b.name : `${b.name} ${slug.slice(b.slug.length + 1)}`,
      slug,
      orientation: force || b.orientation,
      category: b.category,
      description: b.style ? `Auto-generated · ${b.style}` : "Auto-generated",
      prompt: b.prompt,
      style: b.style || null,
      family: b.family,
    });
  }
  return plan;
}

module.exports = { planAutoBatch, POOL, FAMILY_IDS, MAX_BATCH };
