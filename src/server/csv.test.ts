import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

const cols = [
  { key: "a", header: "a" },
  { key: "b", header: "b" },
];

describe("toCsv", () => {
  it("serializes plain values with a header row and LF endings", () => {
    expect(toCsv([{ a: "x", b: 1 }], cols)).toBe("a,b\nx,1\n");
  });

  it("quotes fields containing commas", () => {
    expect(toCsv([{ a: "x,y", b: "z" }], cols)).toBe('a,b\n"x,y",z\n');
  });

  it("doubles embedded quotes", () => {
    expect(toCsv([{ a: 'say "hi"', b: "" }], cols)).toBe('a,b\n"say ""hi""",\n');
  });

  it("quotes fields containing newlines", () => {
    expect(toCsv([{ a: "line1\nline2", b: "z" }], cols)).toBe('a,b\n"line1\nline2",z\n');
  });

  it("serializes null and undefined as empty fields", () => {
    expect(toCsv([{ a: null, b: undefined }], cols)).toBe("a,b\n,\n");
  });

  it("escapes headers too", () => {
    expect(toCsv([], [{ key: "a", header: "a,b" }])).toBe('"a,b"\n');
  });
});
