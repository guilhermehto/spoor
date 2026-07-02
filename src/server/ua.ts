/**
 * Coarse user-agent parsing — privacy-first: only broad families are derived;
 * the raw UA string is never persisted.
 */

// ponytail: regex ladder; iPadOS 13+ reports as macOS desktop — acceptable; swap for a parser lib if fidelity ever matters
export function parseUa(ua: string): { browser: string; os: string; device: string } {
  // Order matters: Edge/Opera UAs also contain "Chrome"; Chrome UAs contain "Safari".
  const browser = ua.includes("Edg/")
    ? "Edge"
    : ua.includes("OPR/")
      ? "Opera"
      : ua.includes("Chrome")
        ? "Chrome"
        : ua.includes("Firefox")
          ? "Firefox"
          : ua.includes("Safari")
            ? "Safari"
            : "Other";

  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : ua.includes("Android")
      ? "Android"
      : ua.includes("Windows")
        ? "Windows"
        : ua.includes("Mac OS X")
          ? "macOS"
          : ua.includes("Linux")
            ? "Linux"
            : "Other";

  const device = /Mobi|Android|iPhone/.test(ua) ? "mobile" : "desktop";

  return { browser, os, device };
}
