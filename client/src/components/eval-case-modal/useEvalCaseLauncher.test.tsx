import React from "react";
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, FindingRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../messages/en/prReview.json";
import { useEvalCaseLauncher } from "./useEvalCaseLauncher";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
    {children}
  </NextIntlClientProvider>
);

function finding(id: string, over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id,
    severity: "WARNING",
    category: "bug",
    title: id,
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.8,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

function review(id: string, agentId: string | null, findings: FindingRecord[]): ReviewRecord {
  return {
    id,
    pr_id: "p1",
    agent_id: agentId,
    run_id: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "",
    findings,
  };
}

const AGENTS = [{ id: "ag1" }] as Agent[];

describe("useEvalCaseLauncher", () => {
  it("blocks open findings and findings of a missing agent, allows triaged ones, and opens only those", () => {
    const open = finding("open");
    const accepted = finding("acc", { accepted_at: "2026-10-08" });
    const dismissed = finding("dis", { dismissed_at: "2026-10-08" });
    const orphan = finding("orphan", { accepted_at: "x", review_id: "r2" });
    const gone = finding("gone", { accepted_at: "x", review_id: "r3" });
    const reviews = [
      review("r1", "ag1", [open, accepted, dismissed]),
      review("r2", null, [orphan]),
      review("r3", "deleted-agent", [gone]),
    ];
    const { result } = renderHook(() => useEvalCaseLauncher(reviews, AGENTS), { wrapper });

    expect(result.current.reasonFor(open)).toBe("Accept or dismiss this finding first"); // AC-1, EC-1
    expect(result.current.reasonFor(accepted)).toBeNull(); // AC-2
    expect(result.current.reasonFor(dismissed)).toBeNull(); // EC-30
    expect(result.current.reasonFor(orphan)).toBe("The agent that produced this finding no longer exists"); // AC-4, EC-3
    expect(result.current.reasonFor(gone)).toBe("The agent that produced this finding no longer exists");

    act(() => result.current.open("open"));
    expect(result.current.openFindingId).toBeNull();
    act(() => result.current.open("dis"));
    expect(result.current.openFindingId).toBe("dis");
    act(() => result.current.close());
    expect(result.current.openFindingId).toBeNull();
  });
});
