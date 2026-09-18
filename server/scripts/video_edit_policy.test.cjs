// Static policy scan of server/src/video_edit/** (ENGINE.md §9 `video_edit_policy.test.cjs`).
// Run: node scripts/video_edit_policy.test.cjs
//
// Load-bearing: the AI Video Edit mode uses OpenRouter/KIE only — NO local ML models and no Python
// anywhere (ARCHITECTURE.md "AI provider strategy"), so the Docker image never changes. That promise is
// only real if a module that quietly requires `@huggingface/transformers`, `onnxruntime`, the template
// pipeline's local `asset_clip` / `embeddings` services, `msedge-tts`, spawns `python`, or runs ffmpeg's
// local `whisper` filter fails CI. Two house rules ride along: child processes only through
// services/spawn_compat.js + engine/proc.js (no direct child_process), and `[video-edit]` log lines never
// interpolate client filenames, keys or transcript text.
// Comments are stripped before scanning (a header saying "no python" is fine), and every rule has a
// positive control so a broken scanner cannot pass silently.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${e.message.split("\n").join("\n       ")}`); process.exitCode = 1; }
}

const SRC = path.resolve(__dirname, "..", "src", "video_edit");

// ---- lexer-light: drop comments, blank regex literals, keep strings -----------------------------
function stripComments(src) {
  let out = "";
  let i = 0;
  let lastSig = "";
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { const end = src.indexOf("*/", i + 2); i = end < 0 ? n : end + 2; out += " "; continue; }
    if (c === "'" || c === '"' || c === "`") {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === "\\") j++;
        else if (c !== "`" && src[j] === "\n") break;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      lastSig = c;
      continue;
    }
    if (c === "/" && (lastSig === "" || /[(,=:[!&|?{};+\-*%<>~^]/.test(lastSig) || /\b(?:return|typeof|case|in|of|void)\s*$/.test(out.slice(-12)))) {
      let j = i + 1;
      let inClass = false;
      let ok = false;
      while (j < n && src[j] !== "\n") {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === "[") inClass = true;
        else if (src[j] === "]") inClass = false;
        else if (src[j] === "/" && !inClass) { ok = true; break; }
        j++;
      }
      if (ok) {
        j++;
        while (j < n && /[a-z]/i.test(src[j])) j++;
        out += "/re/";
        i = j;
        lastSig = "/";
        continue;
      }
    }
    out += c;
    if (!/\s/.test(c)) lastSig = c;
    i++;
  }
  return out;
}

function moduleSpecifiers(code) {
  const out = [];
  const patterns = [
    /\brequire\s*\(\s*(['"`])([^'"`\n]+)\1\s*\)/g,
    /\bimport\s*\(\s*(['"`])([^'"`\n]+)\1\s*\)/g,
    /\bfrom\s+(['"])([^'"\n]+)\1/g,
    /^\s*import\s+(['"])([^'"\n]+)\1/gm,
  ];
  for (const re of patterns) { let m; while ((m = re.exec(code))) out.push(m[2]); }
  return out;
}

function stringLiterals(code) {
  const out = [];
  const re = /(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g;
  let m;
  while ((m = re.exec(code))) out.push({ quote: m[1], value: m[2] });
  return out;
}

const FORBIDDEN_MODULE_RE = /^(?:@huggingface\/transformers|@xenova\/transformers|onnxruntime(?:-node|-web|-common)?|msedge-tts|@tensorflow\/[a-z-]+|opencv4nodejs|@u4\/opencv4nodejs|opencv(?:-wasm|\.js)?|nodejs-whisper|whisper-node|smart-whisper|sherpa-onnx(?:-node)?|vosk|python-shell|pythonia|node-calls-python)(?:\/.*)?$/i;
const FORBIDDEN_LOCAL_MODULE_RE = /(?:^|[\\/])(?:asset_clip|embeddings)(?:\.c?js)?$/i;
const CHILD_PROCESS_RE = /^(?:node:)?child_process$/;
const PYTHON_CMD_RE = /^(?:.*[\\/])?(?:python[0-9.]*|pythonw|py)(?:\.exe)?$/i;
const PY_SCRIPT_RE = /\.py$/i;
const WHISPER_FILTER_RE = /(?:^|[\s,;[\]])whisper=/i;
const LOG_LEAK_RE = /\$\{[^}]*\b(?:originalname|displayName|filename|apiKey|api_key|[A-Z_]*API_KEY|authorization|password|secret)\b[^}]*\}/;
const LOG_TEXT_RE = /\$\{[^}]*\.text\b(?!\s*\.length)[^}]*\}/;

function scanSource(src) {
  const code = stripComments(src);
  const violations = [];
  for (const spec of moduleSpecifiers(code)) {
    if (FORBIDDEN_MODULE_RE.test(spec)) violations.push({ rule: "local-ml-module", detail: spec });
    if (FORBIDDEN_LOCAL_MODULE_RE.test(spec)) violations.push({ rule: "local-ml-service", detail: spec });
    if (CHILD_PROCESS_RE.test(spec)) violations.push({ rule: "child-process", detail: spec });
  }
  for (const { quote, value } of stringLiterals(code)) {
    const v = value.trim();
    if (PYTHON_CMD_RE.test(v) || PY_SCRIPT_RE.test(v)) violations.push({ rule: "python", detail: v.slice(0, 60) });
    if (WHISPER_FILTER_RE.test(v) || /^whisper$/i.test(v)) violations.push({ rule: "whisper-filter", detail: v.slice(0, 60) });
    if (quote === "`" && value.includes("[video-edit]") && (LOG_LEAK_RE.test(value) || LOG_TEXT_RE.test(value))) {
      violations.push({ rule: "log-leak", detail: value.slice(0, 80) });
    }
  }
  return violations;
}

function walk(dir) {
  const out = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...walk(full));
    else if (d.isFile() && /\.(c|m)?js$/.test(d.name)) out.push(full);
  }
  return out;
}

console.log("\nvideo_edit policy — scanner controls");

const BAD = {
  "local-ml-module": [
    `const { pipeline } = require("@huggingface/transformers");`,
    `import ort from "onnxruntime-node";`,
    `const tts = require('msedge-tts');`,
    `const tf = await import("@tensorflow/tfjs-node");`,
  ],
  "local-ml-service": [
    `const clip = require("../../services/asset_clip");`,
    `const emb = require('../services/embeddings.js');`,
  ],
  "child-process": [`const { spawn } = require("node:child_process");`, `const cp = require('child_process');`],
  python: [`spawnCompat("python3", ["x"]);`, "runProcess(`C:/Python311/python.exe`, []);", `run("py", ["-3", "tool.py"]);`],
  "whisper-filter": [`ffmpeg(["-i", src, "-af", "whisper=model=ggml-base.bin:language=en", "-f", "null", "-"]);`],
  "log-leak": [
    "log.info(`[video-edit] upload name=${file.originalname}`);",
    "console.warn(`[video-edit] key=${process.env.OPENROUTER_API_KEY}`);",
    "say(\"info\", `[video-edit] word=${w.text}`);",
  ],
};
const GOOD = [
  `// no python here, and no require("@huggingface/transformers")\nconst x = 1;`,
  `/* const o = require("onnxruntime-node"); */ const model = "openai/whisper-large-v3-turbo";`,
  "const re = /[\"'`]/g; const s = \"ok\"; log.info(`[video-edit] project=${id} words=${words.length} chars=${w.text.length}`);",
  `const whisper = 1; const y = whisper / 2; const z = (a) / b;`,
  `const { spawnCompat } = require("../../services/spawn_compat"); const p = require("./engine/proc");`,
  "const url = `https://openrouter.ai/api/v1/audio/transcriptions`; const lang = \"pt\";",
];

for (const [rule, snippets] of Object.entries(BAD)) {
  t(`scanner flags ${rule}`, () => {
    for (const s of snippets) {
      const v = scanSource(s);
      assert(v.some((x) => x.rule === rule), `not flagged as ${rule}: ${s}\n got ${JSON.stringify(v)}`);
    }
  });
}

t("scanner does not flag comments, model ids, regex literals or safe logs", () => {
  for (const s of GOOD) assert.deepStrictEqual(scanSource(s), [], `false positive on: ${s}`);
});

console.log("\nvideo_edit policy — src/video_edit/**");

const files = walk(SRC);

t("scan covers the subsystem (engine, media, security, routes)", () => {
  const rel = files.map((f) => path.relative(SRC, f).split(path.sep).join("/"));
  assert(files.length >= 20, `only ${files.length} files found`);
  for (const must of ["index.js", "routes.js", "store.js", "engine/proc.js", "media/admission.js", "security/origin_guard.js"]) {
    assert(rel.includes(must), `missing ${must} from scan`);
  }
});

const violations = [];
for (const f of files) {
  for (const v of scanSource(fs.readFileSync(f, "utf8"))) violations.push(`${path.relative(SRC, f)}: ${v.rule} (${v.detail})`);
}
const byRule = (rule) => violations.filter((v) => v.includes(`: ${rule} (`));

t("no local ML model packages (@huggingface/transformers, onnxruntime, msedge-tts, tfjs, opencv, local whisper)", () => {
  assert.deepStrictEqual(byRule("local-ml-module"), []);
});
t("no template-pipeline local ML services (asset_clip, embeddings)", () => {
  assert.deepStrictEqual(byRule("local-ml-service"), []);
});
t("no python spawn or .py scripts", () => {
  assert.deepStrictEqual(byRule("python"), []);
});
t("no ffmpeg whisper filter", () => {
  assert.deepStrictEqual(byRule("whisper-filter"), []);
});
t("no direct child_process (spawn through spawn_compat / engine/proc)", () => {
  assert.deepStrictEqual(byRule("child-process"), []);
});
t("[video-edit] log lines never interpolate filenames, keys or transcript text", () => {
  assert.deepStrictEqual(byRule("log-leak"), []);
});

console.log(`\n${passed} passed${process.exitCode ? " — WITH FAILURES" : ""} (${files.length} files scanned)\n`);
