import { describe, it, expect } from "vitest";
import { parseRetentionDays } from "./retention";

describe("parseRetentionDays", () => {
  it("disables on unset/empty/garbage/non-positive", () => {
    expect(parseRetentionDays(undefined)).toBeNull();
    expect(parseRetentionDays("")).toBeNull();
    expect(parseRetentionDays("banana")).toBeNull();
    expect(parseRetentionDays("0")).toBeNull();
    expect(parseRetentionDays("-5")).toBeNull();
  });

  it("enables on a positive number", () => {
    expect(parseRetentionDays("30")).toBe(30);
  });
});
