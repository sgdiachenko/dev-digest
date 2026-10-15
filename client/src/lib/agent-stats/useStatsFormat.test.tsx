import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import messages from "../../../messages/en/agentPerformance.json";
import { useStatsFormat } from "./useStatsFormat";

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
    {children}
  </NextIntlClientProvider>
);

describe("useStatsFormat", () => {
  it("applies the catalog words to the pure formatters (AC-117, AC-135, AC-159)", () => {
    const { result } = renderHook(() => useStatsFormat(), { wrapper });
    const f = result.current;
    expect(f.seconds(6200)).toBe("6.2 s");
    expect(f.seconds(null)).toBe("—");
    expect(f.tokens(14000, 2100)).toBe("16k");
    expect(f.tokens(null, null)).toBe("—");
    expect(f.totalUsd(0.004)).toBe("< $0.01");
    expect(f.totalUsd(1234.56)).toBe("$1,234.56");
    expect(f.percent(0.73)).toBe("73%");
    expect(f.percent(null)).toBe("—");
    expect(f.periodLabel("custom")).toBe("custom range");
  });
});
