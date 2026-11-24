import { describe, expect, it } from "vitest";
import { loginUrl, safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it.each([
    ["/orgs", "/orgs"],
    ["/orgs/abc?tab=1#x", "/orgs/abc?tab=1#x"],
    ["/join?code=OVN-7K2P-QX9M", "/join?code=OVN-7K2P-QX9M"],
    ["/a/../b", "/b"],
  ])("allows %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    [null],
    [""],
    ["orgs"],
    ["//evil.example"],
    ["///evil.example"],
    ["/\\evil.example"],
    ["\\\\evil.example"],
    ["https://evil.example"],
    ["javascript:alert(1)"],
    ["/\tjavascript:alert(1)"],
    ["/\nevil"],
    [" /orgs"],
    ["/" + "a".repeat(3000)],
  ])("rejects %j", (input) => {
    expect(safeNextPath(input)).toBe("/");
  });

  it("uses the given fallback", () => {
    expect(safeNextPath("//x", "/orgs")).toBe("/orgs");
  });
});

describe("loginUrl", () => {
  it("adds a safe next parameter", () => {
    expect(loginUrl("/orgs/1")).toBe("/login?next=%2Forgs%2F1");
    expect(loginUrl("/")).toBe("/login");
    expect(loginUrl("//evil")).toBe("/login");
  });
});
