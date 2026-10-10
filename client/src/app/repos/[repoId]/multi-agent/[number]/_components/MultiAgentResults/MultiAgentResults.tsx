/* MultiAgentResults — /repos/:repoId/multi-agent/:number. Container: the PR's
   latest group (polled while a member runs), the Columns/Tabs views, grouped
   findings and "Where agents disagree". View, agent and trace live in the URL
   (`?view=`, `?agent=`, `?trace=`); unknown values fall back to defaults. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Skeleton } from "@devdigest/ui";
import RunTraceDrawer from "@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer";
import { useMultiAgentRun } from "@/lib/hooks/multi-agent";
import { usePrReviews } from "@/lib/hooks/reviews";
import { useActiveRepo } from "@/lib/repo-context";
import { formatCost, formatSeconds } from "../../../helpers";
import {
  agentLabel,
  allMembersFailed,
  findingsForRun,
  parseView,
  resolveAgentTab,
  resolveTraceRun,
  type ResultsView,
} from "../../helpers";
import { AllFailedNotice } from "../AllFailedNotice";
import { ColumnsView } from "../ColumnsView";
import { DisagreementBlock } from "../DisagreementBlock";
import { GroupedFindings } from "../GroupedFindings";
import { TabsView } from "../TabsView";
import { s } from "./styles";

const VIEWS: ResultsView[] = ["columns", "tabs"];

export function MultiAgentResults({
  repoId,
  number,
  prId,
  pullsLoading,
}: {
  repoId: string;
  number: string;
  prId: string | null;
  pullsLoading: boolean;
}) {
  const t = useTranslations("multiAgentResults");
  const router = useRouter();
  const search = useSearchParams();
  const { activeRepo } = useActiveRepo();
  const group = useMultiAgentRun(prId);
  const reviews = usePrReviews(prId);
  const [focusedFindingId, setFocusedFindingId] = React.useState<string | null>(null);

  const setParams = (changes: Record<string, string | null>) => {
    const sp = new URLSearchParams(search.toString());
    for (const [key, val] of Object.entries(changes)) {
      if (val == null) sp.delete(key);
      else sp.set(key, val);
    }
    const qs = sp.toString();
    router.replace(`/repos/${repoId}/multi-agent/${number}${qs ? `?${qs}` : ""}`);
  };

  const data = group.data;
  const configureHref = `/repos/${repoId}/multi-agent`;

  if (pullsLoading || (prId != null && group.isPending)) {
    return (
      <div style={s.root} aria-busy="true">
        <Skeleton height={28} width={320} />
        <div style={s.skeletons}>
          <Skeleton height={140} />
          <Skeleton height={140} />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={s.root}>
        {group.isError ? (
          <p role="alert" style={s.error}>
            {t("loadError")}
          </p>
        ) : (
          <EmptyState icon="Layers" title={t("empty.title")} body={t("empty.body")} />
        )}
        <Link href={configureHref} style={s.link}>
          {t("empty.cta")}
        </Link>
      </div>
    );
  }

  const view = parseView(search.get("view"));
  const selectedRunId = resolveAgentTab(search.get("agent"), data.columns);
  const traceColumn = resolveTraceRun(search.get("trace"), data.columns);
  const openTrace = (runId: string) => setParams({ trace: runId });
  const openFinding = (runId: string, findingId: string) => {
    setFocusedFindingId(findingId);
    setParams({ view: "tabs", agent: runId });
  };
  const failed = allMembersFailed(data.columns);

  return (
    <div style={s.root}>
      <div style={s.head}>
        <div>
          <h1 style={s.h1}>{t("header.title")}</h1>
          <p style={s.sub}>{t("header.subtitle", { count: data.agent_count, number })}</p>
          <p style={s.sub}>
            {t("header.totals", {
              duration: formatSeconds(data.total_duration_ms),
              cost: formatCost(data.total_cost_usd),
            })}
          </p>
        </div>
        {!failed && (
          <div role="group" aria-label={t("views.label")} style={s.switch}>
            {VIEWS.map((v) => (
              <Button
                key={v}
                kind="secondary"
                size="sm"
                active={view === v}
                aria-pressed={view === v}
                onClick={() => setParams({ view: v })}
              >
                {t(`views.${v}`)}
              </Button>
            ))}
          </div>
        )}
      </div>

      {group.isError && (
        <p role="alert" style={s.error}>
          {t("pollError")}
        </p>
      )}

      {failed ? (
        <AllFailedNotice columns={data.columns} onOpenTrace={openTrace} />
      ) : (
        <>
          {view === "columns" ? (
            <ColumnsView columns={data.columns} onOpenTrace={openTrace} />
          ) : (
            prId && (
              <TabsView
                columns={data.columns}
                reviews={reviews.data}
                selectedRunId={selectedRunId}
                prId={prId}
                focusedFindingId={focusedFindingId}
                repoFullName={activeRepo?.full_name ?? null}
                onOpenTrace={openTrace}
                onSelectAgent={(runId) => {
                  setFocusedFindingId(null);
                  setParams({ agent: runId });
                }}
              />
            )
          )}
          <GroupedFindings groups={data.finding_groups} columns={data.columns} onOpenFinding={openFinding} />
          <DisagreementBlock conflicts={data.conflicts} columns={data.columns} />
        </>
      )}

      {traceColumn && (
        <RunTraceDrawer
          runId={traceColumn.run_id}
          prNumber={data.pr_number ?? Number(number)}
          running={traceColumn.status === "running"}
          findings={findingsForRun(reviews.data, traceColumn.run_id)}
          agentName={agentLabel(traceColumn, t)}
          onClose={() => setParams({ trace: null })}
        />
      )}
    </div>
  );
}
