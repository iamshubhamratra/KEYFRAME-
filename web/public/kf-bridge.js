/* KEYFRAME landing bridge — injected into the v2 design doc (design.html,
   the "film set" landing running on the dc runtime / support.js).
   The dc runtime swallows document-delegated listeners, so we attach
   capture-phase click listeners DIRECTLY on the CTA elements (re-attached via
   interval + MutationObserver, which survives re-renders) and postMessage up
   to the React studio:
     "Start rolling" / "Start your film"  → kf-create   (open the studio)
     "TEMPLATES + GALLERY" / "Browse templates" → kf-templates
     "FULL GALLERY"                       → kf-gallery
     any [data-kf-pack] card (the video wall) → kf-use-style { pack }
     "AI EDIT" / [data-kf-ai-edit]         → kf-ai-edit  (upload footage → AI Video Edit)
   The doc's own <a href="KEYFRAME.dc.html"> links would 404 inside the app,
   so interception also preventDefaults them. */
(function () {
  window.__kfHook = "ready";
  try { parent.postMessage({ type: "kf-ready" }, location.origin); } catch (e) {}

  function txt(n) { return (n.textContent || "").replace(/\s+/g, " ").trim(); }
  function stop(e) { try { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); } catch (_) {} }
  function post(type) { try { parent.postMessage({ type: type }, location.origin); } catch (_) {} }

  var CREATE = /^(start rolling|start your film|create film|roll camera)/i;
  var TEMPLATES = /^(templates \+ gallery|browse templates|all templates|templates)/i;
  var GALLERY = /^(full gallery|gallery)/i;
  var AI_EDIT = /^(ai edit|edit my video)/i;

  function onCreate(e) { stop(e); post("kf-create"); }
  function onAiEdit(e) { stop(e); post("kf-ai-edit"); }
  function onTemplates(e) { stop(e); post("kf-templates"); }
  function onGallery(e) { stop(e); post("kf-gallery"); }
  // Wall cards carry their template's slug; the studio opens with it picked.
  function onPack(e) {
    stop(e);
    var pack = e.currentTarget && e.currentTarget.getAttribute("data-kf-pack");
    try { parent.postMessage({ type: "kf-use-style", pack: pack }, location.origin); } catch (_) {}
  }

  function hook() {
    var cards = document.querySelectorAll("[data-kf-pack]");
    for (var c = 0; c < cards.length; c++) {
      if (cards[c].__kf || !cards[c].getAttribute("data-kf-pack")) continue;
      cards[c].__kf = 1;
      cards[c].addEventListener("click", onPack, true);
      cards[c].addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") onPack(e);
      }, true);
    }
    var els = document.querySelectorAll("a, button, span, [role=button]");
    for (var i = 0; i < els.length; i++) {
      var b = els[i];
      if (b.__kf) continue;
      var t = txt(b);
      if (!t || t.length > 40) continue;
      // only hook elements that ACT like CTAs (anchors, buttons, or clickable spans)
      var tag = b.tagName;
      var clickable = tag === "A" || tag === "BUTTON" ||
        (b.style && b.style.cursor === "pointer") || b.getAttribute("role") === "button";
      if (!clickable) continue;
      if (b.hasAttribute("data-kf-ai-edit") || AI_EDIT.test(t)) { b.__kf = 1; b.addEventListener("click", onAiEdit, true); }
      else if (CREATE.test(t)) { b.__kf = 1; b.addEventListener("click", onCreate, true); }
      else if (TEMPLATES.test(t)) { b.__kf = 1; b.addEventListener("click", onTemplates, true); }
      else if (GALLERY.test(t)) { b.__kf = 1; b.addEventListener("click", onGallery, true); }
    }
  }

  hook();
  setInterval(hook, 400);
  try { new MutationObserver(hook).observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}
})();
