// LONG-FORM FILM TEMPLATES — the static route.
//
// Serves <root>/longform_templates over HTTP at /longform, at the SAME relative depth the
// collection was authored with. That depth is load-bearing, not cosmetic: every page resolves its
// siblings by relative URL (`../../kit/film-kit.js`, `../../_ds/organic-…/styles.css`,
// `./<name>-film.jsx`), so flattening the tree or serving a page from a different number of path
// segments breaks every import on it. `file://` does not work either — support.js fetches the JSX.
//
// TWO HANDLERS, IN THIS ORDER:
//
//   1. The page interceptor. A GET for a `.dc.html` is answered from disk with the four OM_*
//      globals substituted from the caller's config (see services/longform_templates.js). It is
//      registered BEFORE the static mount so it wins, and it answers on the page's own URL so the
//      relative imports below it are untouched. With no `cfg` it returns the file unchanged.
//
//   2. express.static for everything else — the JSX, the kit, the design system, the images.
//
// PUBLIC, not admin-guarded. These are shipped design templates, the same class of asset as the
// frame-pack posters already served from public/; nothing here is a draft or a user's job.

const express = require("express");

const lf = require("../services/longform_templates");

/**
 * The collection itself. Mount at `lf.MOUNT`.
 * @returns {import("express").Router}
 */
function buildRouter() {
  const router = express.Router();

  // Only `.dc.html` is intercepted. `:page` is matched loosely and filtered here rather than in the
  // path pattern because the filenames carry spaces ("Pet Story.dc.html") and Express 4's path
  // parser is not the place to be clever about that.
  router.get("/templates/:id/:page", (req, res, next) => {
    if (!req.params.page.endsWith(".dc.html")) return next();
    const tpl = lf.getTemplate(req.params.id);
    if (!tpl || tpl.page !== req.params.page) return next();

    let cfg;
    try {
      cfg = lf.decodeConfig(req.query.cfg);
    } catch (e) {
      return res.status(400).type("text/plain").send(`bad cfg: ${e.message}`);
    }

    let out;
    try {
      out = lf.renderPage(tpl.id, cfg);
    } catch (e) {
      // A config error is the caller's, not ours, and it is worth 400-ing loudly: the alternative
      // is a film that renders for five minutes and is subtly not the one that was asked for.
      if (e instanceof lf.LongformConfigError) return res.status(400).type("text/plain").send(e.message);
      throw e;
    }

    // Never cached. The bytes are a function of the query string, and a stale page is a film
    // rendered with the previous job's brand colour.
    res.setHeader("Cache-Control", "no-store");
    res.type("text/html; charset=utf-8").send(out.html);
  });

  // The third-party runtime, served from our own origin so a render never depends on unpkg.com
  // being reachable. Mounted BEFORE the collection so `_vendor` can never be shadowed by a file of
  // that name appearing in the collection. Content-hashed by version in the filename upstream and
  // pinned here, so it is immutable and cacheable for a year.
  router.use("/_vendor", express.static(lf.VENDOR_DIR, {
    index: false,
    setHeaders(res) { res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); },
  }));

  // Posters, rendered by scripts/make-longform-posters.js. Mounted here rather than left to the
  // public/ static mount because public/longform/<id>.jpg would resolve under THIS router's prefix,
  // which is mounted first and would answer with a 404 out of the collection directory.
  router.use("/_posters", express.static(lf.POSTER_DIR, {
    index: false,
    setHeaders(res) { res.setHeader("Cache-Control", "public, max-age=600"); },
  }));

  router.use(express.static(lf.COLLECTION_DIR, {
    index: false,
    setHeaders(res, filePath) {
      // The JSX is fetched as text by support.js and transpiled in the browser, so the type only
      // has to be something `fetch().text()` will hand over — but naming it explicitly keeps a
      // future Content-Type-sniffing proxy from deciding it is a download.
      if (filePath.endsWith(".jsx")) res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
    },
  }));

  return router;
}

/**
 * The registry, so a host (or the Studio UI) can discover what is installed without hardcoding a
 * table that drifts. Mount at `/api/longform`.
 * @returns {import("express").Router}
 */
function buildApiRouter() {
  const router = express.Router();

  router.get("/templates", (_req, res) => {
    res.json({
      mount: lf.MOUNT,
      energyValues: lf.ENERGY_VALUES,
      templates: lf.listTemplates().map((t) => ({
        id: t.id,
        title: t.title,
        global: t.global,
        url: t.url,
        kits: t.kits,
        hasContent: t.hasContent,
        sceneCount: t.sceneCount,
        durationSec: t.durationSec,
        tweaks: t.tweaks,
        // Rendered by scripts/make-longform-posters.js from the film's own composer. Reported only
        // when it is actually on disk, so a checkout that has not run the script gets `null` and
        // the card falls back rather than showing a broken image.
        posterUrl: lf.posterUrl(t.id),
      })),
    });
  });

  // The shipped timeline for one film — the starting point a caller edits to retime or cut.
  router.get("/templates/:id/scenes", (req, res) => {
    const tpl = lf.getTemplate(req.params.id);
    if (!tpl) return res.status(404).json({ error: "unknown template" });
    res.json({ id: tpl.id, durationSec: tpl.durationSec, scenes: tpl.scenes });
  });

  return router;
}

module.exports = { buildRouter, buildApiRouter };
