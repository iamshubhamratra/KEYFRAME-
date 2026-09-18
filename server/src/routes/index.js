// Every API mount, in match order. `deps` carries the job-queue entry points the
// controllers hand work to (see server.js) and the optional AI Video Edit module.
const health = require("./health");
const auth = require("./auth");
const jobs = require("./jobs");
const frames = require("./frames");
const generate = require("./generate");
const projects = require("./projects");
const adminTemplates = require("./admin_templates");

function mountRoutes(app, { enqueue, enqueueIntake, enqueueProduction, videoEdit }) {
  app.use(health.buildRouter());
  app.use("/api/auth", auth.buildRouter());
  app.use("/api", jobs.buildRouter());
  app.use("/api", frames.buildRouter());
  app.use("/api", generate.buildRouter({ enqueue }));
  app.use("/api", projects.buildRouter({ enqueueIntake, enqueueProduction }));
  // Admin-only; borrows enqueueIntake so a template test render is an ordinary
  // queued project job, not a second pipeline.
  app.use("/api/admin", adminTemplates.buildRouter({ enqueueIntake }));
  // AI Video Edit: auth + owner checks + Origin guard live inside its router. Its
  // error handler keeps every failure on this prefix JSON.
  if (videoEdit) {
    app.use("/api/video-edits", videoEdit.buildRouter());
    app.use("/api/video-edits", videoEdit.errorHandler());
  }
}

module.exports = { mountRoutes };
