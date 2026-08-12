// Replay the real job's 14 asset requests end-to-end through acquire().
const path = require("path");
const fs = require("fs");
const { acquire } = require("../src/services/asset_sources");
const OUT = "C:/Users/kalua/AppData/Local/Temp/claude/C--internship-KEYFRAME/5f370742-6bfa-4061-83ad-460b407215df/scratchpad/replay2";
const anchor = "flipkart online shopping";
const needs = [
  { q: "young man unboxing smartphone smile", r: "inset" },
  { q: "woman holding colorful shopping bags", r: "inset" },
  { q: "hands opening delivery package home", r: "background" },
  { q: "shopping bag", r: "inset" },
  { q: "delivery rider scooter city street", r: "background" },
  { q: "lightning bolt", r: "icon" },
  { q: "fresh vegetables fruits market basket", r: "background" },
  { q: "shopping cart", r: "icon" },
  { q: "coin stack", r: "inset" },
  { q: "gift box", r: "inset" },
  { q: "diverse indian family smiling living room", r: "background" },
  { q: "Need it all", r: "icon" },
  { q: "One app everything", r: "icon" },
  { q: "Open Flipkart", r: "icon" },
];
(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const CONC = Number(process.argv[2] || 4);
  const t0 = Date.now();
  const got = new Array(needs.length).fill(null);
  let cursor = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= needs.length) return;
      const n = needs[i];
      const isIcon = n.r === "icon";
      got[i] = await acquire({
        query: isIcon ? n.q : `${anchor} ${n.q}`, fallbackQueries: [n.q], type: "image",
        orientation: "vertical", outputPath: path.join(OUT, `${i}.jpg`),
        kindPref: isIcon ? "vector" : (n.r === "background" ? "photo" : undefined),
      }).catch(() => null);
    }
  }));
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nRESULT: ${got.filter(Boolean).length}/${needs.length} landed in ${secs}s (fetch concurrency ${CONC})`);
})();
