// Structured logger — the observability foundation for the pipeline.
//
// Design goals (Path C professionalization, requirement #8):
//   - Levels (debug < info < warn < error) gated by LOG_LEVEL (default "info").
//   - ISO-8601 timestamps on every line.
//   - Per-job correlation: logger.child({ jobId, tag }) stamps every line so a
//     single job's lifecycle is greppable across concurrent renders.
//   - BACKWARD COMPATIBLE: still writes to console.{log,warn,error}, so existing
//     tooling / the [tag] grep patterns keep working — lines are just richer now.
//   - Optional JSON-lines output (LOG_JSON=1) for ingestion by a log platform.
//
// This is plain server code (Node) — Date/timestamps are fine here (unlike the
// composition <script>, which forbids non-deterministic calls).

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const THRESHOLD = LEVELS[String(process.env.LOG_LEVEL || "info").toLowerCase()] ?? LEVELS.info;
const AS_JSON = process.env.LOG_JSON === "1" || process.env.LOG_JSON === "true";

function sinkFor(level) {
  return level === "error" ? console.error : level === "warn" ? console.warn : console.log;
}

// Render an extra-data object compactly; skip when empty.
function fmtExtra(extra) {
  if (!extra || typeof extra !== "object") return "";
  const keys = Object.keys(extra);
  if (!keys.length) return "";
  try { return " " + JSON.stringify(extra); } catch { return ""; }
}

function emit(level, ctx, msg, extra) {
  if (LEVELS[level] < THRESHOLD) return;
  const t = new Date().toISOString();
  if (AS_JSON) {
    let rec;
    try { rec = JSON.stringify({ t, level, ...ctx, msg, ...(extra || {}) }); }
    catch { rec = JSON.stringify({ t, level, msg: String(msg) }); }
    sinkFor(level)(rec);
    return;
  }
  // Pretty: "2026-07-01T… INFO  [pipeline:ab12] message {extra}"
  const tag = ctx && ctx.jobId ? `[${ctx.tag || "job"}:${ctx.jobId}] `
            : ctx && ctx.tag ? `[${ctx.tag}] ` : "";
  sinkFor(level)(`${t} ${level.toUpperCase().padEnd(5)} ${tag}${msg}${fmtExtra(extra)}`);
}

function make(ctx) {
  return {
    debug: (msg, extra) => emit("debug", ctx, msg, extra),
    info:  (msg, extra) => emit("info", ctx, msg, extra),
    warn:  (msg, extra) => emit("warn", ctx, msg, extra),
    error: (msg, extra) => emit("error", ctx, msg, extra),
    // Derive a child logger that carries additional context (e.g. jobId, stage).
    child: (extra) => make({ ...ctx, ...extra }),
    level: () => Object.keys(LEVELS).find((k) => LEVELS[k] === THRESHOLD) || "info",
  };
}

// Default export is the root logger; `.child({...})` for scoped/correlated logs.
module.exports = make({ tag: "keyframe" });
