// /api/projects — the script-checkpoint flow.
const express = require("express");
const projectsController = require("../controllers/projects");
const { hourlyJobLimit } = require("../middleware/rate_limit");
const { projectUploads } = require("../middleware/uploads");

function buildRouter({ enqueueIntake, enqueueProduction }) {
  const projects = projectsController({ enqueueIntake, enqueueProduction });
  const router = express.Router();
  router.post("/projects", hourlyJobLimit(), projectUploads, projects.create);
  router.get("/projects", projects.index);
  router.get("/projects/:id", projects.show);
  router.get("/projects/:id/events", projects.events);
  router.post("/projects/:id/approve", projects.approve);
  router.post("/projects/:id/regenerate", projects.regenerate);
  return router;
}

module.exports = { buildRouter };
