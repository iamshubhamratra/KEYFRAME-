// Blog-ingest harness — dry-runs understandBlog against a real post and prints
// what the brief/script would receive, plus which images were downloaded.
//
//   node scripts/blog-harness.js https://stripe.com/blog/some-post
//
// Output lands in scripts/blog-harness-out/ (inspect the downloaded images).

const path = require("node:path");
const { understandBlog } = require("../src/services/ingest/blog");

const url = process.argv[2];
if (!url) { console.error("usage: node scripts/blog-harness.js <blog-post-url>"); process.exit(1); }

(async () => {
  const workDir = path.join(__dirname, "blog-harness-out");
  const blog = await understandBlog({ url, workDir });
  console.log("\n— TITLE    :", blog.title);
  console.log("— AUTHOR   :", blog.author || "(none found)");
  console.log("— PUBLISHED:", blog.published || "(none found)");
  console.log("— SECTIONS :", blog.headings.length ? blog.headings.join(" · ") : "(none)");
  console.log("— TEXT     :", `${blog.text.length} chars — "${blog.text.slice(0, 220).replace(/\s+/g, " ")}…"`);
  console.log("— IMAGES   :", blog.images.length ? blog.images.map((i) => `${path.basename(i.path)}${i.alt ? ` (${i.alt.slice(0, 40)})` : ""}`).join(", ") : "(none downloaded)");
})().catch((e) => { console.error(e); process.exit(1); });
