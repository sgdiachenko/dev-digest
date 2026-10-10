import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import results from "../../../../../../../../messages/en/multiAgentResults.json";
import { TabFindingCard } from "./TabFindingCard";

const f = {
  id: "f1",
  review_id: "rev1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded key",
  file: "src/config.ts",
  start_line: 12,
  end_line: null,
  rationale: "Starts with `sk_live_` here.",
  suggestion: "Move it to **env**.",
  confidence: 0.98,
  accepted_at: null,
  dismissed_at: null,
} as unknown as FindingRecord;

const view = (over: Partial<Parameters<typeof TabFindingCard>[0]> = {}) => {
  const props = {
    f,
    focused: false,
    defaultExpanded: false,
    pending: false,
    onAction: vi.fn(),
    onTurnIntoEvalCase: vi.fn(),
    evalDisabledReason: null,
    ...over,
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgentResults: results }}>
      <TabFindingCard {...props} />
    </NextIntlClientProvider>,
  );
  return props;
};

afterEach(cleanup);

describe("TabFindingCard", () => {
  it("collapsed header shows title, category, location and confidence, no body", () => {
    view();
    expect(screen.getByText("Hardcoded key")).toBeTruthy();
    expect(screen.getByText("security")).toBeTruthy();
    expect(screen.getByText("src/config.ts:12")).toBeTruthy();
    expect(screen.getByText("98% conf")).toBeTruthy();
    expect(screen.queryByText("SUGGESTED FIX")).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  });

  it("expands to description, suggested fix with inline code, and the action row", () => {
    const p = view();
    fireEvent.click(screen.getByRole("button", { name: /Hardcoded key/ }));
    expect(screen.getByText("sk_live_").tagName).toBe("CODE");
    expect(screen.getByText("Suggested fix")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(p.onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(p.onAction).toHaveBeenCalledWith("dismiss");
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(p.onTurnIntoEvalCase).toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Learn" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("coming soon")).toBeTruthy();
    expect(screen.queryByText(/reply/i)).toBeNull();
  });

  it("disables the eval button with its reason", () => {
    view({ defaultExpanded: true, evalDisabledReason: "Accept or dismiss first" });
    expect((screen.getByRole("button", { name: "Turn into eval case" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
