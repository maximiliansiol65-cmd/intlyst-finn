import { describe, it, expect } from "vitest";
import { formatKPI } from "../hooks/useCountUp";

describe("formatKPI", () => {
  it("returns em dash for null", () => {
    expect(formatKPI(null)).toBe("—");
  });

  it("returns em dash for undefined", () => {
    expect(formatKPI(undefined)).toBe("—");
  });

  it("returns em dash for NaN", () => {
    expect(formatKPI(NaN)).toBe("—");
  });

  it("formats small numbers with German locale", () => {
    const result = formatKPI(1234);
    expect(result).toMatch(/1/);
  });

  it("abbreviates thousands", () => {
    const result = formatKPI(15000);
    expect(result).toContain("K");
  });

  it("abbreviates millions", () => {
    const result = formatKPI(2_500_000);
    expect(result).toContain("M");
  });

  it("applies prefix", () => {
    const result = formatKPI(100, { prefix: "€" });
    expect(result).toContain("€");
  });

  it("applies suffix", () => {
    const result = formatKPI(50, { suffix: "%" });
    expect(result).toContain("%");
  });

  it("respects decimals option", () => {
    const result = formatKPI(3.14159, { decimals: 2 });
    expect(result).toMatch(/3/);
  });

  it("handles zero", () => {
    expect(formatKPI(0)).toBe("0");
  });

  it("handles negative numbers", () => {
    const result = formatKPI(-500);
    expect(result).toContain("-");
  });
});
