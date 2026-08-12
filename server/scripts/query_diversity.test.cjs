// The stock library must be asked a DIFFERENT question per scene.
//
// Measured regression: a script describes neighbouring scenes in neighbouring
// language, the planner took the first four words of each visualDirection, and
// every photo request collapsed onto one string — a whole film's photo pool came
// back from a single search ("chatgpt chat ui on smartphone rapid fire task
// chips" -> 0.jpg, 1.jpg, 2.jpg, 3.jpg). Small pool AND no variety.
const { __test_makeQueryDeriver } = require("../src/agents/graph.js");

const STOP = new Set(["the", "a", "an", "with", "and", "of", "in", "on", "over", "into", "across",
  "as", "to", "that", "then", "while", "for", "is", "are", "we", "see", "scene", "text", "headline", "screen"]);

let failed = 0;
const check = (name, cond, detail) => {
  if (cond) { console.log(`  ok    ${name}`); return; }
  failed++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
};

// 1) The exact shape that collapsed: four scenes, near-identical direction lines.
{
  const scenes = [
    { visualDirection: "ChatGPT chat UI on smartphone, rapid fire task chips", headline: "Ask anything" },
    { visualDirection: "ChatGPT chat UI on smartphone with task chips flying", headline: "Instant answers" },
    { visualDirection: "ChatGPT chat UI on a smartphone screen, chips", headline: "Health insights" },
    { visualDirection: "ChatGPT chat interface on phone showing chips", headline: "Trusted sources" },
  ];
  const derive = __test_makeQueryDeriver(STOP);
  const qs = scenes.map(derive).filter(Boolean);
  check("near-identical scenes yield distinct queries",
    qs.length >= 3 && new Set(qs).size === qs.length, JSON.stringify(qs));
}

// 2) A scene whose direction is entirely spent still gets an on-topic query from
//    its own copy rather than returning nothing.
{
  const derive = __test_makeQueryDeriver(STOP);
  derive({ visualDirection: "boards cards timeline planner" });
  const q = derive({ visualDirection: "boards cards timeline planner", headline: "Automation built in", subtext: "No-code rules" });
  check("falls back to the scene's own copy when its direction is spent",
    !!q && /automation|built|code|rules/.test(q), JSON.stringify(q));
}

// 3) Distinct scenes keep their own words — diversification must not scramble
//    a query that was already specific.
{
  const derive = __test_makeQueryDeriver(STOP);
  const a = derive({ visualDirection: "warehouse robots sorting parcels" });
  const b = derive({ visualDirection: "surgeon operating theatre lights" });
  check("unrelated scenes keep their own subject words",
    /warehouse|robots|sorting|parcels/.test(a || "") && /surgeon|operating|theatre|lights/.test(b || ""),
    `${a} | ${b}`);
}

// 4) A single scene still produces a query (no over-eager suppression).
{
  const derive = __test_makeQueryDeriver(STOP);
  check("a lone scene still gets a query", !!derive({ visualDirection: "team planning sprint board" }));
}

console.log(failed ? `\n${failed} check(s) failed` : "\nquery diversification holds");
process.exit(failed ? 1 : 0);
