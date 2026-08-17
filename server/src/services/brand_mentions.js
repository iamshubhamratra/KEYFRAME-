// Brand mentions — the third-party products a beat NAMES, resolved to the
// simple-icons slug that draws each one.
//
// Measured on a shipped film: the narration walked through "Microsoft, Slack,
// Edge, Chrome" and the frame carried nothing but type — no mark, no screenshot,
// no asset of any of them. The asset planner derives its queries from the beat's
// words and hands them to stock providers, and stock has no picture of "Slack";
// what came back was a generic office photo, or nothing. The one source that
// DOES have a picture of Slack is the brand-mark set, and nothing was asking it.
//
// PRECISION OVER RECALL — A WRONG MARK IS WORSE THAN NO MARK. Three rules, all
// deliberately conservative:
//   1. Curated map only. A slug is never guessed from the word: the simple-icons
//      set 404s on anything it doesn't carry (verified: notarealbrandxyz -> 404),
//      and a near-miss slug would silently draw a DIFFERENT company's mark. Every
//      slug below was probed live against api.iconify.design before it shipped.
//   2. Case-sensitive, word-boundary. Half of this vocabulary is ordinary English
//      — edge, notion, linear, slack, box, drive, meet, square, medium, signal —
//      so "the edge of the frame" and "a linear process" must never match, and
//      "Slacks" must not match "Slack".
//   3. A name that is ALSO a common word (COMMON_WORD below) is rejected at the
//      start of a sentence, where English capitalises every word anyway. "Edge
//      cases pile up." reads exactly like "Edge ships with Windows." to a
//      case test, and only the position tells them apart. Mid-sentence
//      capitalisation is the signal that the writer meant the product.
//
// Rule 3 ALONE is too blunt, though, and it fails on the sentence the complaint
// was actually about: "Slack is where your team lives." would be dropped for
// sitting first. So the film gets a PROOF PASS first — every ambiguous name that
// appears mid-sentence ANYWHERE in the script is thereby proven to be a product,
// and sentence-initial occurrences of that same name are then admitted. A name
// the script never once uses mid-sentence stays rejected everywhere. This buys
// back the recall without weakening rule 3: the evidence is still capitalisation
// in a position English does not explain, just gathered film-wide instead of
// per-occurrence.
//
// ALL-CAPS on-screen copy ("EDGE") is not matched either, and that is intended:
// a headline shouts every word, so its capitalisation carries no evidence.

// Surface spelling as a narrator would WRITE it -> simple-icons slug. Aliases are
// separate keys pointing at the same slug ("Teams", "MS Teams", "Microsoft Teams"),
// because the surface form is what the scene matcher later scores against the
// beat's own words — see the `sees` string the caller builds from `name`.
const BRAND_SLUGS = {
  // messaging / meetings
  "Slack": "slack",
  "Microsoft Teams": "microsoftteams", "MS Teams": "microsoftteams", "Teams": "microsoftteams",
  "Zoom": "zoom", "Google Meet": "googlemeet", "Webex": "webex", "Skype": "skype",
  "Discord": "discord", "WhatsApp": "whatsapp", "Telegram": "telegram", "Signal": "signal",
  "Mattermost": "mattermost", "Gmail": "gmail", "Google Calendar": "googlecalendar",
  // docs / notes / storage
  "Notion": "notion", "Confluence": "confluence", "Evernote": "evernote", "Obsidian": "obsidian",
  "Google Docs": "googledocs", "Docs": "googledocs",
  "Google Sheets": "googlesheets", "Sheets": "googlesheets",
  "Google Slides": "googleslides",
  "Google Drive": "googledrive", "Drive": "googledrive",
  "Word": "microsoftword", "Excel": "microsoftexcel", "PowerPoint": "microsoftpowerpoint",
  "Outlook": "microsoftoutlook", "OneDrive": "microsoftonedrive", "OneNote": "microsoftonenote",
  "SharePoint": "microsoftsharepoint",
  "Dropbox": "dropbox", "Box": "box", "Coda": "coda", "Airtable": "airtable",
  // project / work management
  "Jira": "jira", "Trello": "trello", "Asana": "asana", "Linear": "linear",
  "ClickUp": "clickup", "Basecamp": "basecamp", "Todoist": "todoist", "Shortcut": "shortcut",
  "Miro": "miro", "Calendly": "calendly", "Loom": "loom", "Zapier": "zapier", "IFTTT": "ifttt",
  // design / creative
  "Figma": "figma", "Canva": "canva", "Sketch": "sketch", "Framer": "framer",
  "Adobe": "adobe", "Photoshop": "adobephotoshop", "Illustrator": "adobeillustrator",
  "After Effects": "adobeaftereffects", "Premiere Pro": "adobepremierepro",
  "InDesign": "adobeindesign", "Lightroom": "adobelightroom", "Acrobat": "adobeacrobatreader",
  // browsers
  "Chrome": "googlechrome", "Google Chrome": "googlechrome",
  "Edge": "microsoftedge", "Microsoft Edge": "microsoftedge",
  "Safari": "safari", "Firefox": "firefox", "Brave": "brave", "Opera": "opera",
  // platform vendors
  "Microsoft": "microsoft", "Google": "google", "Apple": "apple", "Amazon": "amazon",
  "Meta": "meta", "IBM": "ibm", "Oracle": "oracle", "SAP": "sap", "Samsung": "samsung",
  "Intel": "intel", "NVIDIA": "nvidia", "Cisco": "cisco", "Atlassian": "atlassian",
  "Windows": "windows", "macOS": "macos", "Android": "android", "iOS": "ios",
  // code hosting / editors / runtimes
  "GitHub": "github", "GitLab": "gitlab", "Bitbucket": "bitbucket", "Git": "git",
  "VS Code": "visualstudiocode", "VSCode": "visualstudiocode", "Visual Studio Code": "visualstudiocode",
  "Visual Studio": "visualstudio", "JetBrains": "jetbrains", "IntelliJ": "intellijidea",
  "Cursor": "cursor", "Replit": "replit", "Stack Overflow": "stackoverflow",
  "Postman": "postman", "npm": "npm", "GraphQL": "graphql", "Prisma": "prisma",
  // cloud / infra
  "AWS": "amazonwebservices", "Amazon Web Services": "amazonwebservices",
  "Azure": "microsoftazure", "Microsoft Azure": "microsoftazure", "Google Cloud": "googlecloud",
  // The office suite, under the three names scripts actually use for it. simple-icons
  // has NO `microsoft365` or `office365` slug (both 404 — probed), so all three
  // resolve to the Office mark; without these the longest-first walk falls through
  // to plain "Microsoft" and a film that says "Microsoft 365" shows the corporate
  // logo instead of the product it named.
  "Microsoft 365": "microsoftoffice", "Office 365": "microsoftoffice", "Microsoft Office": "microsoftoffice",
  "GCP": "googlecloud", "Cloudflare": "cloudflare", "DigitalOcean": "digitalocean",
  "Vercel": "vercel", "Netlify": "netlify", "Heroku": "heroku", "Firebase": "firebase",
  "Supabase": "supabase", "Docker": "docker", "Kubernetes": "kubernetes",
  "Terraform": "terraform", "Jenkins": "jenkins", "CircleCI": "circleci", "Linux": "linux",
  "Ubuntu": "ubuntu",
  // data
  "MongoDB": "mongodb", "PostgreSQL": "postgresql", "Postgres": "postgresql", "MySQL": "mysql",
  "Redis": "redis", "Elasticsearch": "elasticsearch", "Snowflake": "snowflake",
  "Databricks": "databricks", "Tableau": "tableau", "Power BI": "powerbi",
  "Google Analytics": "googleanalytics", "Mixpanel": "mixpanel", "Hotjar": "hotjar",
  "Semrush": "semrush", "Similarweb": "similarweb",
  // observability
  "Sentry": "sentry", "Datadog": "datadog", "New Relic": "newrelic",
  "PagerDuty": "pagerduty", "Grafana": "grafana", "Splunk": "splunk",
  // languages / frameworks a tooling film actually names
  "Python": "python", "TypeScript": "typescript", "JavaScript": "javascript",
  "React": "react", "Node.js": "nodedotjs", "Next.js": "nextdotjs", "Vue": "vuedotjs",
  "Angular": "angular", "Svelte": "svelte", "PHP": "php", "Ruby": "ruby",
  "Swift": "swift", "Kotlin": "kotlin", "Rust": "rust", "Golang": "go",
  // AI
  "OpenAI": "openai", "ChatGPT": "openai", "GPT": "openai",
  "Anthropic": "anthropic", "Claude": "claude", "Gemini": "googlegemini",
  "GitHub Copilot": "githubcopilot", "Copilot": "githubcopilot",
  "Hugging Face": "huggingface", "Perplexity": "perplexity",
  // go-to-market / support / finance
  "Salesforce": "salesforce", "HubSpot": "hubspot", "Zendesk": "zendesk",
  "Intercom": "intercom", "Help Scout": "helpscout", "Marketo": "marketo",
  "Mailchimp": "mailchimp", "SendGrid": "sendgrid", "Twilio": "twilio", "Zoho": "zoho",
  "Stripe": "stripe", "PayPal": "paypal", "Square": "square", "Razorpay": "razorpay",
  "QuickBooks": "quickbooks", "Xero": "xero", "Brex": "brex", "DocuSign": "docusign",
  // storefronts / sites
  "Shopify": "shopify", "WooCommerce": "woocommerce", "WordPress": "wordpress",
  "Webflow": "webflow", "Wix": "wix", "Squarespace": "squarespace",
  // identity
  "Okta": "okta", "Auth0": "auth0", "1Password": "1password", "LastPass": "lastpass",
  // consumer names that show up as examples in explainer scripts
  "YouTube": "youtube", "LinkedIn": "linkedin", "Instagram": "instagram",
  "Facebook": "facebook", "TikTok": "tiktok", "Pinterest": "pinterest",
  "Reddit": "reddit", "Snapchat": "snapchat", "Twitch": "twitch", "Medium": "medium",
  // simple-icons retired the bird; "Twitter" is still what a narrator says, and
  // the mark it should draw is filed under the new name.
  "X (formerly Twitter)": "x", "Twitter": "x",
  "Substack": "substack", "Patreon": "patreon", "Spotify": "spotify", "Netflix": "netflix",
  "Vimeo": "vimeo", "Uber": "uber", "Lyft": "lyft", "DoorDash": "doordash",
  "Airbnb": "airbnb", "Grammarly": "grammarly", "Duolingo": "duolingo",
  "Coursera": "coursera", "Udemy": "udemy", "Khan Academy": "khanacademy",
};

// Names that are ALSO ordinary English. These only count mid-sentence (rule 3
// above) — at a sentence start their capital letter proves nothing.
const COMMON_WORD = new Set([
  "Teams", "Zoom", "Signal", "Notion", "Confluence", "Obsidian", "Docs", "Sheets",
  "Drive", "Word", "Excel", "Outlook", "Box", "Linear", "Sketch", "Framer",
  "Illustrator", "After Effects", "Edge", "Safari", "Brave", "Opera", "Apple",
  "Amazon", "Meta", "Windows", "Git", "Cursor", "Postman", "Snowflake", "Sentry",
  "React", "Angular", "Vue", "Swift", "Rust", "Ruby", "Square", "Stripe",
  "Medium", "Loom", "Slack", "Gemini", "Copilot", "Claude", "Oracle", "Discord",
  "Shortcut", "Coda", "Perplexity", "Terraform", "Intel",
]);

const RE_ESC = /[.*+?^${}()|[\]\\]/g;
// Longest first, because regex alternation takes the FIRST branch that matches,
// not the longest: unsorted, "Microsoft Teams" would be consumed as "Microsoft"
// and "Google Docs" as "Google", and both would draw the wrong company's mark.
// The boundaries are explicit character classes rather than \b — \b sits between
// a space and the "1" of "1Password" either way, but it would also fire inside
// "Node.js" and cut the name in half.
const MENTION_SRC = `(?<![A-Za-z0-9])(?:${Object.keys(BRAND_SLUGS).sort((a, b) => b.length - a.length).map((n) => n.replace(RE_ESC, "\\$&")).join("|")})(?![A-Za-z0-9])`;

// True when `at` opens a sentence — the position where English capitalises a word
// for grammar, not for branding. A terminator (or nothing at all) precedes it.
function opensSentence(text, at) {
  const head = text.slice(0, at).replace(/\s+$/, "");
  return head === "" || /[.!?…:;–—-]$/.test(head);
}

// WHAT THE VIEWER HEARS, THEN WHAT THEY READ. The complaint is about narration,
// so the voiceover leads and its match order is the order the marks come back in.
// On-screen copy is scanned too — a beat that PRINTS "Figma" should also show the
// mark — but sentence-cased there is rarer, so it contributes far fewer hits.
function narrationOf(scene) {
  if (!scene || typeof scene !== "object") return "";
  const os = Array.isArray(scene.onScreenText) ? scene.onScreenText.join(". ") : "";
  const bullets = Array.isArray(scene.bullets) ? scene.bullets.join(". ") : "";
  return [scene.voiceover, os, scene.headline, scene.subtext, scene.body, bullets]
    .filter((t) => typeof t === "string" && t.trim())
    .join(". ");
}

// Its OWN /g regex per scan, not one shared module-level object: a generator that
// carried a shared `lastIndex` would hand a half-consumed cursor to whichever
// caller resumed it next, and the proof pass and the match pass walk the same
// text back to back.
function* scan(text) {
  const re = new RegExp(MENTION_SRC, "g");
  for (let m; (m = re.exec(text)) !== null;) yield { name: m[0], at: m.index };
}

// The proof pass: the ambiguous names this text capitalises somewhere English
// would not, which is the evidence that its writer meant the product.
function provenBrands(text) {
  const proven = new Set();
  for (const { name, at } of scan(text)) {
    if (COMMON_WORD.has(name) && opensSentence(text, at)) continue;
    proven.add(name);
  }
  return proven;
}

// The products ONE beat names, in narration order, de-duplicated by slug.
// `max` is a per-scene cap: three marks is already a full row of logos, and past
// that the beat is a logo wall instead of the shot the script asked for.
// `proven` is the film-wide proof set; on its own a scene proves only itself.
function brandMentions(scene, { max = 3, proven = null } = {}) {
  const text = narrationOf(scene);
  if (!text) return [];
  const ok = proven || provenBrands(text);
  const out = [];
  const seen = new Set();
  for (const { name, at } of scan(text)) {
    if (COMMON_WORD.has(name) && opensSentence(text, at) && !ok.has(name)) continue;
    const slug = BRAND_SLUGS[name];
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ name, slug });
    if (out.length >= max) break;
  }
  return out;
}

// Every mark the FILM should acquire, pinned to the scene that names it.
//
// De-duplicated by slug across the whole film: a script that says "Slack" in the
// problem beat and again in the CTA needs ONE fetch and ONE mark, and the first
// mention is the beat that earns the pin (it is where the product is introduced).
// `max` bounds the film so a tools round-up doesn't turn into a logo reel — the
// marks are an addition to each beat, not the beat's picture, and past some count
// they stop being an addition. MEASURED by rendering one pack per family plus the
// scene-kit against a 6-asset fixture and sweeping the mark count 0..7: seven of
// the nine renderers paint the same pictures at every count, while the scene-kit
// holds all six of its pictures to 3 marks, drops one at 4 and two at 7 — pool
// slots the marks win on relevance. 6 covers the film this came from (Microsoft,
// Slack, Edge, Chrome and two more) on the cheap side of that knee. The ceiling is
// renderer-bound, not a property of the marks: it rises the day a pack seats a
// mark in a slot of its own instead of one a picture was competing for.
function planBrandMarks(script, { perScene = 3, max = 6 } = {}) {
  const scenes = (script && Array.isArray(script.scenes)) ? script.scenes : [];
  // Sentence-joined, so a scene's opening word still reads as a sentence opening
  // and cannot be proven by the previous scene's last line running into it.
  const proven = provenBrands(scenes.map(narrationOf).filter(Boolean).join(". "));
  const taken = new Set();
  const plan = [];
  for (const scene of scenes) {
    if (!scene || scene.id == null) continue;
    for (const { name, slug } of brandMentions(scene, { max: perScene, proven })) {
      if (taken.has(slug)) continue;
      taken.add(slug);
      plan.push({ sceneId: scene.id, startSec: scene.start, durationSec: scene.duration, name, slug });
      if (plan.length >= max) return plan;
    }
  }
  return plan;
}

module.exports = { brandMentions, planBrandMarks, BRAND_SLUGS };
