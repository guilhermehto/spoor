/**
 * Spoor analytics snippet — dependency-free, cookieless.
 * Usage: <script defer src="/spoor.js" data-project="<publicKey>"></script>
 * Emits: pageview (load + SPA nav), click ([data-track]), custom (window.spoor.track)
 */
(function () {
  "use strict";

  // Derive ingest origin from the script tag so cross-origin embeds work.
  var scriptEl = document.currentScript;
  var ingestOrigin = "";
  if (scriptEl && scriptEl.src) {
    try {
      ingestOrigin = new URL(scriptEl.src).origin;
    } catch (_) {}
  }
  var ingestUrl = ingestOrigin + "/api/ingest";

  var projectKey = scriptEl ? scriptEl.getAttribute("data-project") : "";
  if (!projectKey) return;

  // ── Send ──────────────────────────────────────────────────────────────────

  function send(payload) {
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ingestUrl, body);
      } else {
        fetch(ingestUrl, { method: "POST", body: body, keepalive: true });
      }
    } catch (_) {}
  }

  // ── Pageview ──────────────────────────────────────────────────────────────

  var lastPath = "";

  function trackPageview() {
    var path = location.pathname + location.search + location.hash;
    if (path === lastPath) return;
    lastPath = path;
    send({
      k: projectKey,
      t: "pageview",
      p: path,
      h: location.hostname,
      r: document.referrer || undefined,
    });
  }

  // ── SPA navigation ────────────────────────────────────────────────────────

  function wrapHistory(method) {
    var orig = history[method];
    history[method] = function () {
      orig.apply(this, arguments);
      trackPageview();
    };
  }

  wrapHistory("pushState");
  wrapHistory("replaceState");
  window.addEventListener("popstate", trackPageview);

  // ── Click tracking ────────────────────────────────────────────────────────

  document.addEventListener(
    "click",
    function (e) {
      var el = e.target;
      while (el && el !== document) {
        if (el.dataset && el.dataset.track) {
          send({
            k: projectKey,
            t: "click",
            n: el.dataset.track,
            p: location.pathname + location.search + location.hash,
            h: location.hostname,
          });
          break;
        }
        el = el.parentElement;
      }
    },
    true,
  );

  // ── Public API ────────────────────────────────────────────────────────────

  window.spoor = {
    track: function (name, props) {
      if (!name) return;
      var payload = {
        k: projectKey,
        t: "custom",
        n: String(name),
        p: location.pathname + location.search + location.hash,
        h: location.hostname,
      };
      if (props && typeof props === "object" && !Array.isArray(props)) {
        payload.props = props;
      }
      send(payload);
    },
  };

  // ── Initial pageview ──────────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", trackPageview);
  } else {
    trackPageview();
  }
})();
