// Adapter: the admin router's QA stage -> src/services/template_qa.js.
//
// The verdict the service returns already carries { errors, warnings, score },
// which is exactly what the router's normalizeQa reads, so this only bridges the
// location and adds progress chatter for the SSE stream. Kept as its own file
// (rather than pointing the router at the service) so the router's "the two long
// stages live in src/admin/" contract holds for both stages symmetrically.

const { runTemplateQa: runQaService } = require("../services/template_qa");

async function runTemplateQa({ template, version, render = null, onProgress, signal } = {}) {
  const say = typeof onProgress === "function" ? onProgress : () => {};
  say({ step: "rendering the draft and running the gates", pct: 10 });

  const out = await runQaService({ template, version, render, signal });

  say({
    step: out.publishable ? `clean — ${out.label}` : `${out.errors.length} blocking issue(s) — ${out.label}`,
    pct: 90,
  });
  return out;
}

module.exports = { runTemplateQa };
