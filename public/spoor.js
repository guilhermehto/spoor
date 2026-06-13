/**
 * Spoor analytics snippet — dependency-free, cookieless.
 * Usage: <script defer src="/spoor.js" data-project="<publicKey>"></script>
 * Emits: pageview (load + SPA nav), click ([data-track]), custom (window.spoor.track),
 *        error (window error + unhandledrejection)
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

  // ── Error tracking ──────────────────────────────────────────────────────────

  var MAX_ERRORS_PER_LOAD = 10;
  var MAX_MESSAGE_LEN = 512;
  var MAX_SOURCE_LEN = 256;
  var MAX_STACK_LEN = 1024;
  var errorsSent = 0;

  function truncate(value, max) {
    if (typeof value !== "string") return "";
    return value.length > max ? value.slice(0, max) : value;
  }

  function trackError(fields) {
    // Cap per page load so an error loop can't hammer the ingest endpoint.
    if (errorsSent >= MAX_ERRORS_PER_LOAD) return;
    errorsSent++;
    var props = { kind: fields.kind };
    if (fields.source) props.source = truncate(fields.source, MAX_SOURCE_LEN);
    if (typeof fields.line === "number") props.line = fields.line;
    if (typeof fields.col === "number") props.col = fields.col;
    if (fields.stack) props.stack = truncate(fields.stack, MAX_STACK_LEN);
    send({
      k: projectKey,
      t: "error",
      n: truncate(fields.message || "Unknown error", MAX_MESSAGE_LEN),
      p: location.pathname + location.search + location.hash,
      h: location.hostname,
      props: props,
    });
  }

  window.addEventListener("error", function (e) {
    // Bubble-phase listener only sees script errors (ErrorEvent), not resource
    // load failures; guard anyway so a stray event without detail is ignored.
    if (!e || (!e.message && !e.error)) return;
    trackError({
      kind: "error",
      message: e.message || (e.error && e.error.message),
      source: e.filename,
      line: typeof e.lineno === "number" ? e.lineno : undefined,
      col: typeof e.colno === "number" ? e.colno : undefined,
      stack: e.error && e.error.stack,
    });
  });

  window.addEventListener("unhandledrejection", function (e) {
    var reason = e ? e.reason : undefined;
    var message;
    var stack;
    if (reason && typeof reason === "object") {
      message = reason.message;
      stack = reason.stack;
    } else if (reason !== undefined) {
      message = String(reason);
    }
    trackError({
      kind: "unhandledrejection",
      message: message || "Unhandled promise rejection",
      stack: stack,
    });
  });

  // ── Initial pageview ──────────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", trackPageview);
  } else {
    trackPageview();
  }
})();
