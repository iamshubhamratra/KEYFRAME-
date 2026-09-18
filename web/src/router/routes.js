// Every URL the app answers, in match order (a literal segment like /new must come
// before the :id pattern that would also match it). `name` is the screen App
// renders; `auth` routes send a signed-out visitor to /login and back.

// An AI edit id as the server mints it (same pattern as editApi.js EDIT_ID_RE,
// which this module cannot import: editApi.js uses Vite-only import.meta.glob and
// the router has to load under plain Node for the tests).
const EDIT_ID_RE = /^ve_[0-9a-z]{16}$/;

export const ROUTES = [
  { name: "landing", path: "/", title: "KEYFRAME" },
  { name: "templates", path: "/templates", title: "Templates" },
  { name: "gallery", path: "/gallery", title: "Gallery" },
  { name: "login", path: "/login", title: "Log in" },
  { name: "signup", path: "/signup", title: "Sign up" },

  // The studio: one film's pipeline, create → understanding → script → theater → premiere.
  { name: "create", path: "/studio/new", title: "New film", auth: true },
  { name: "understanding", path: "/studio/:id/understanding", title: "Understanding", auth: true },
  { name: "script", path: "/studio/:id/script", title: "Script", auth: true },
  { name: "theater", path: "/studio/:id/production", title: "In production", auth: true },
  // Public: finished films open straight from the gallery.
  { name: "premiere", path: "/films/:id", title: "Premiere" },

  // AI Video Edit. These screens gate themselves (the server's owner checks are the boundary).
  { name: "aiUpload", path: "/edits/new", title: "AI Edit" },
  { name: "aiEdits", path: "/edits", title: "My edits" },
  { name: "aiEdit", path: "/edits/:id", title: "AI Edit" },

  // Admin template pipeline. The screens refuse non-admins; requireAdmin is the real boundary.
  { name: "adminTemplates", path: "/admin/templates", title: "Admin · Templates" },
  { name: "adminGenerate", path: "/admin/templates/new", title: "Admin · New template" },
  { name: "adminTemplate", path: "/admin/templates/:id", title: "Admin · Template" },
];

export const NOT_FOUND = { name: "notFound", path: null, title: "Not found" };

// Links shared before the app had paths (`?edit=<id>`, `?edits`) keep working.
// An `edit` value that is not a real edit id is not forwarded anywhere.
export function legacyRedirect(search) {
  let params;
  try { params = new URLSearchParams(search); } catch { return null; }
  const edit = params.get("edit");
  if (edit !== null) return EDIT_ID_RE.test(edit) ? `/edits/${edit}` : null;
  if (params.has("edits")) return "/edits";
  return null;
}
