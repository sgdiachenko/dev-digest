/* useEvalCaseLauncher — which findings may be turned into an eval case, why not, and which one the
   modal is open for. Pure derivation over the reviews and agents already loaded (AC-1, AC-2, AC-4). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Agent, FindingRecord, ReviewRecord } from "@devdigest/shared";

export interface EvalCaseLauncher {
  /** Why "Turn into eval case" is disabled for `f`; null when it may be used. */
  reasonFor: (f: FindingRecord) => string | null;
  /** Opens the modal for a finding — ignored while `reasonFor` blocks it. */
  open: (findingId: string) => void;
  close: () => void;
  /** The finding the modal is open for, or null. */
  openFindingId: string | null;
}

export function useEvalCaseLauncher(reviews: ReviewRecord[], agents: Agent[]): EvalCaseLauncher {
  const t = useTranslations("prReview");
  const [openFindingId, setOpenFindingId] = React.useState<string | null>(null);

  const reasonFor = (f: FindingRecord): string | null => {
    if (!f.accepted_at && !f.dismissed_at) return t("finding.evalReasonUntriaged");
    const agentId = reviews.find((r) => r.id === f.review_id)?.agent_id ?? null;
    if (agentId === null || !agents.some((a) => a.id === agentId)) return t("finding.evalReasonAgentMissing");
    return null;
  };

  const open = (findingId: string) => {
    const finding = reviews.flatMap((r) => r.findings).find((f) => f.id === findingId);
    if (!finding || reasonFor(finding) !== null) return;
    setOpenFindingId(findingId);
  };

  return { reasonFor, open, close: () => setOpenFindingId(null), openFindingId };
}
