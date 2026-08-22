/* KEYFRAME CONTENT CONTRACT
   Makes the long-form templates data-driven instead of hardcoded, so a generated
   script can populate them. Loaded after film-kit.js; exposes window.Content.

   The problem it solves: every scene had its copy written into the JSX, so the
   films were demos rather than templates. Now each scene declares which fields it
   consumes, and the host supplies them per scene.

   Host shape — window.OM_CONTENT (optional; demo copy is the fallback):
     { "<SceneName>": { kicker, title, body, stat, unit, label, quote, source,
                        rows: [[left, right], …], items: [string, …] } }

   Every getter falls back to the demo string the template ships, so a film keeps
   working with no content supplied, and a partially-filled job renders the rest
   of its demo copy rather than blank frames. */
(function () {
  const K = window.FilmKit;

  /* Text that outgrows its box is the other half of the problem: generated
     headlines are longer than authored demo strings. `fit` measures a real
     string against a real measure. `lines` gives a wrapping statement the
     capacity of the line count it is meant to occupy, so it keeps its authored
     size and breaks where intended instead of being crushed onto one line. */
  function fit(text, size, maxW, family, weight, lines) {
    return K.fitText(text, size, maxW * (lines || 1) * (lines > 1 ? 0.94 : 1), family, weight);
  }

  function make(demo) {
    const src = () => window.OM_CONTENT || {};

    /* A declared-but-unread field silently swallows host content, which is worse
       than a crash: the job looks filled and renders demo copy. Track reads and
       warn once about anything declared that no scene consumes. */
    const read = {};
    function of(scene) {
      const given = src()[scene] || {};
      const fallback = (demo && demo[scene]) || {};
      read[scene] = read[scene] || {};
      const pick = (k, d) => {
        read[scene][k] = true;
        const v = given[k];
        if (v === undefined || v === null || v === '') return fallback[k] !== undefined ? fallback[k] : d;
        return v;
      };
      return {
        kicker: (d) => pick('kicker', d),
        title: (d) => pick('title', d),
        body: (d) => pick('body', d),
        label: (d) => pick('label', d),
        quote: (d) => pick('quote', d),
        source: (d) => pick('source', d),
        unit: (d) => pick('unit', d),
        stat: (d) => { const v = pick('stat', d); return typeof v === 'number' ? v : parseFloat(v) || d || 0; },
        /* Lists arrive from the generator at unpredictable length; `n` caps them
           to what the layout was designed to hold, so a ten-item answer does not
           break a three-cell grid. */
        items: (d, n) => { const v = pick('items', d) || []; return n ? v.slice(0, n) : v; },
        rows: (d, n) => { const v = pick('rows', d) || []; return n ? v.slice(0, n) : v; },
        /* True when the host supplied anything for this scene — lets a scene
           drop an optional element rather than render an empty frame. */
        given: () => Object.keys(given).length > 0,
      };
    }

    /* Which fields a scene reads, for the host's own validation and for the
       handoff docs. Templates register as they render. */
    const schema = {};
    function declare(scene, fields) { schema[scene] = fields; return of(scene); }

    /* Reports demo fields no scene ever asked for — host content declared here
       but wired to nothing would otherwise render demo copy silently.

       Reads accumulate as scenes render, and scenes are gated to the playhead, so
       a field can only be judged unread once its OWN scene has rendered at least
       once. Auditing before that reports every not-yet-played scene as dead: an
       earlier auto-timer version did exactly that, naming ~29 correctly-wired
       scenes on every load and varying with playhead position. So this is
       on-demand, and it says plainly how much of the film it actually saw. */
    function audit(opts) {
      if (!demo) return { dead: [], covered: 0, declared: 0, complete: true };
      const scenes = Object.keys(demo);
      const seen = scenes.filter((s) => read[s]);
      const dead = [];
      for (const s of seen) {
        for (const k in demo[s]) if (!read[s][k]) dead.push(s + '.' + k);
      }
      const complete = seen.length === scenes.length;
      const out = { dead: dead, covered: seen.length, declared: scenes.length, complete: complete, unseen: scenes.filter((s) => !read[s]) };
      if (!(opts && opts.quiet)) {
        if (dead.length) console.warn('[content] wired to nothing (host values dropped): ' + dead.join(', '));
        if (!complete) console.info('[content] audit saw ' + seen.length + '/' + scenes.length + ' declared scenes; play through, then re-run for the rest.');
        if (complete && !dead.length) console.info('[content] audit clean — all ' + scenes.length + ' declared scenes read every field.');
      }
      return out;
    }

    return { of: of, declare: declare, schema: schema, fit: fit, audit: audit, read: read };
  }

  window.Content = { make: make, fit: fit };
})();
