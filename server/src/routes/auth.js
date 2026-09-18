// /api/auth — signup, login, session, password reset.
const express = require("express");
const auth = require("../controllers/auth");
const { requireAuth } = require("../middleware/auth");

function buildRouter() {
  const router = express.Router();
  router.post("/signup", auth.signup);
  router.post("/login", auth.login);
  router.post("/logout", auth.logout);
  router.get("/me", requireAuth, auth.me);
  router.post("/forgot/send-otp", auth.sendResetOtp);
  router.post("/forgot/verify-otp", auth.verifyResetOtp);
  router.post("/forgot/set-new-password", auth.setNewPassword);
  return router;
}

module.exports = { buildRouter };
