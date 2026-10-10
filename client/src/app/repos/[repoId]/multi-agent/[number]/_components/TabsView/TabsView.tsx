/* TabsView — the agent tabs, the selected agent's summary card and its findings
   as collapsible cards (accept, dismiss, "Turn into eval case"). Learn is a
   disabled "coming soon" stub; there is no Reply control. A finding opened from
   the grouped list arrives as `focusedFindingId` and renders focused and expanded. */
"use client";

import { useTranslations } from "next-intl";
import type { AgentColumn, ReviewRecord } from "@devdigest/shared";
import { EvalCaseModal, useEvalCaseLauncher } from "@/components/eval-case-modal";
import { useAgents } from "@/lib/hooks/agents";
import { useFindingAction } from "@/lib/hooks/reviews";
import { findingsForRun } from "../../helpers";
import { AgentSummaryCard } from "../AgentSummaryCard";
import { AgentTabs, panelId, tabId } from "../AgentTabs";
import { TabFindingCard } from "../TabFindingCard";
import { s } from "./styles";

export function TabsView({
  columns,
  reviews,
  selectedRunId,
  prId,
  focusedFindingId,
  repoFullName,
  onSelectAgent,
  onOpenTrace,
}: {
  columns: AgentColumn[];
  reviews: ReviewRecord[] | undefined;
  selectedRunId: string | null;
  prId: string;
  focusedFindingId: string | null;
  repoFullName: string | null;
  onSelectAgent: (runId: string) => void;
  onOpenTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgentResults");
  const action = useFindingAction();
  const agents = useAgents();
  const evalLauncher = useEvalCaseLauncher(reviews ?? [], agents.data ?? []);
  const selected = columns.find((c) => c.run_id === selectedRunId) ?? null;
  const findings = findingsForRun(reviews, selectedRunId);

  return (
    <div style={s.root}>
      <AgentTabs columns={columns} selectedRunId={selectedRunId} onSelect={onSelectAgent} />
      {selected && (
        <div role="tabpanel" id={panelId(selected.run_id)} aria-labelledby={tabId(selected.run_id)} style={s.panel}>
          <AgentSummaryCard column={selected} onOpenTrace={onOpenTrace} />
          {findings.length === 0 && (
            <p style={s.note}>{selected.status === "running" ? t("tabs.running") : t("tabs.empty")}</p>
          )}
          {findings.map((f) => (
            <TabFindingCard
              key={f.id}
              f={f}
              focused={f.id === focusedFindingId}
              defaultExpanded={f.id === focusedFindingId}
              pending={action.isPending}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
              onTurnIntoEvalCase={() => evalLauncher.open(f.id)}
              evalDisabledReason={evalLauncher.reasonFor(f) ?? null}
            />
          ))}
        </div>
      )}
      {evalLauncher.openFindingId && (
        <EvalCaseModal source={{ kind: "finding", findingId: evalLauncher.openFindingId }} onClose={evalLauncher.close} />
      )}
    </div>
  );
}
