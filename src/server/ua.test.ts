import { describe, it, expect } from "vitest";
import { parseUa } from "./ua";

describe("parseUa", () => {
  it("Chrome on Windows", () => {
    expect(
      parseUa(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      ),
    ).toEqual({ browser: "Chrome", os: "Windows", device: "desktop" });
  });

  it("Safari on iPhone", () => {
    expect(
      parseUa(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      ),
    ).toEqual({ browser: "Safari", os: "iOS", device: "mobile" });
  });

  it("Firefox on Linux", () => {
    expect(
      parseUa("Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0"),
    ).toEqual({ browser: "Firefox", os: "Linux", device: "desktop" });
  });

  it("Edge on Windows (UA also contains Chrome + Safari)", () => {
    expect(
      parseUa(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
      ),
    ).toEqual({ browser: "Edge", os: "Windows", device: "desktop" });
  });

  it("Chrome on Android is mobile", () => {
    expect(
      parseUa(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
      ),
    ).toEqual({ browser: "Chrome", os: "Android", device: "mobile" });
  });

  it("Safari on macOS", () => {
    expect(
      parseUa(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
      ),
    ).toEqual({ browser: "Safari", os: "macOS", device: "desktop" });
  });

  it("Opera on Windows (OPR/ wins over Chrome)", () => {
    expect(
      parseUa(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/110.0.0.0",
      ),
    ).toEqual({ browser: "Opera", os: "Windows", device: "desktop" });
  });

  it("empty string falls through to Other/Other/desktop", () => {
    expect(parseUa("")).toEqual({ browser: "Other", os: "Other", device: "desktop" });
  });
});
