// /api/admin/templates — the admin template pipeline. Every route is admin-only.
const express = require("express");
const adminTemplatesController = require("../controllers/admin_templates");
const { requireAdmin } = require("../middleware/auth");

function buildRouter({ enqueueIntake } = {}) {
  const c = adminTemplatesController({ enqueueIntake });
  const router = express.Router();
  router.use(requireAdmin);

  router.post("/templates", c.create);
  router.get("/templates", c.index);
  // The /auto routes are registered BEFORE /templates/:id on purpose: Express
  // matches in order, so "auto" would otherwise be read as a template id.
  router.post("/templates/auto", c.startAuto);
  router.get("/templates/auto", c.autoStatus);
  router.post("/templates/auto/cancel", c.cancelAuto);

  router.get("/templates/:id", c.show);
  router.patch("/templates/:id", c.update);
  router.delete("/templates/:id", c.destroy);
  router.post("/templates/:id/author-film", c.authorFilm);
  router.post("/templates/:id/generate", c.generate);
  router.post("/templates/:id/preview", c.preview);
  router.post("/templates/:id/qa", c.qa);
  router.post("/templates/:id/test", c.test);
  router.post("/templates/:id/publish", c.publish);
  router.post("/templates/:id/unpublish", c.unpublish);
  router.post("/templates/:id/archive", c.archive);
  router.post("/templates/:id/versions", c.createVersion);
  router.get("/templates/:id/events", c.events);
  return router;
}

module.exports = { buildRouter };
