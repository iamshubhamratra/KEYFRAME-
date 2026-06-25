/* KEYFRAME landing bridge — injected into the design export (design.html).
   The export is a compiled "dc" app whose own event delegation swallows
   load-time document listeners, so we attach capture-phase click listeners
   DIRECTLY on the CTA buttons (re-attached via interval + MutationObserver,
   which survives the app's re-renders) and postMessage up to the React studio. */
(function () {
  window.__kfHook = "ready";
  try { parent.postMessage({ type: "kf-ready" }, "*"); } catch (e) {}

  function txt(n) { return (n.textContent || "").replace(/\s+/g, " ").trim(); }
  function readPrompt() { var ta = document.querySelector("textarea"); return ta ? (ta.value || "").trim() : ""; }
  function readUrl() { var u = document.querySelector('input[type="url"], input[placeholder*="http"]'); return u ? (u.value || "").trim() : ""; }
  function stop(e) { try { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); } catch (_) {} }

  var CREATE = /^(create film|produce|roll your (first )?film|create your film)/i;
  var GALLERY = /^gallery$/i;

  function onCreate(e) { stop(e); try { parent.postMessage({ type: "kf-create", prompt: readPrompt(), url: readUrl() }, "*"); } catch (_) {} }
  function onGallery(e) { stop(e); try { parent.postMessage({ type: "kf-gallery" }, "*"); } catch (_) {} }

  function hookButtons() {
    var els = document.querySelectorAll("button, a, [role=button]");
    for (var i = 0; i < els.length; i++) {
      var b = els[i];
      if (b.__kf) continue;
      var t = txt(b);
      if (!t || t.length > 40) continue;
      if (CREATE.test(t)) { b.__kf = 1; b.addEventListener("click", onCreate, true); }
      else if (GALLERY.test(t)) { b.__kf = 1; b.addEventListener("click", onGallery, true); }
    }
  }

  hookButtons();
  setInterval(hookButtons, 400);
  try { new MutationObserver(hookButtons).observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}
})();
