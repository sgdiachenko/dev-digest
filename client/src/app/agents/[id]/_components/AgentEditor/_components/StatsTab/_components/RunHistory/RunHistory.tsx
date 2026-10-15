/* RunHistory — the agent's counted runs, newest first, 20 per page (AC-156). The page is local state;
   the parent resets it with `key={period.from + period.to}`. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Skeleton } from "@devdigest/ui";
import type { AgentRunHistoryItem } from "@devdigest/shared";
import { CostLabel, StatsErrorPanel, TruncatedName } from "../../../../../../../../../components/agent-stats";
import { DASH } from "../../../../../../../../../lib/agent-stats/format";
import type { Period } from "../../../../../../../../../lib/agent-stats/period";
import { useStatsFormat } from "../../../../../../../../../lib/agent-stats/useStatsFormat";
import { useAgentRunHistory } from "../../../../../../../../../lib/hooks/agent-stats";
import { pageRange, prHref, showsTokens } from "./helpers";
import { s } from "./styles";

function RunRow({ run, timeZone }: { run: AgentRunHistoryItem; timeZone?: string }) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  const hasPr = run.repo_id != null && run.pr_number != null;
  const when = f.dateTime(run.ran_at, timeZone);
  return (
    <tr>
      <td style={s.td} className="mono tnum">
        {when}
      </td>
      <td style={s.td}>
        {hasPr ? (
          <Link href={prHref(run.repo_id!, run.pr_number!)} style={{ ...s.link, ...s.prCell }}>
            {run.repo_full_name != null && <TruncatedName name={run.repo_full_name} />}
            <span className="mono">#{run.pr_number}</span>
          </Link>
        ) : (
          <span style={s.muted}>{DASH}</span>
        )}
      </td>
      <td style={s.td} className="mono tnum">
        {showsTokens(run.status) ? f.tokens(run.tokens_in, run.tokens_out) : DASH}
      </td>
      <td style={s.td} className="mono tnum">
        {f.avgUsd(run.cost_usd)}
      </td>
      <td style={s.td} className="tnum">
        {run.findings_count == null ? DASH : f.count(run.findings_count)}
      </td>
      <td style={s.td}>{t(`stats.runHistory.statuses.${run.status}`)}</td>
      <td style={s.td}>
        {hasPr ? (
          <Link
            href={prHref(run.repo_id!, run.pr_number!, run.run_id)}
            style={s.link}
            aria-label={t("stats.runHistory.viewTraceLabel", { time: when })}
          >
            {t("stats.runHistory.viewTrace")}
          </Link>
        ) : (
          <span style={s.muted}>{DASH}</span>
        )}
      </td>
    </tr>
  );
}

export function RunHistory({
  agentId,
  period,
  timeZone,
}: {
  agentId: string;
  period: Pick<Period, "from" | "to">;
  timeZone?: string;
}) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  const [page, setPage] = React.useState(1);
  const q = useAgentRunHistory(agentId, period, page);
  const data = q.data;
  const { start, end } = pageRange(page, data?.items.length ?? 0);

  return (
    <section style={s.section} aria-label={t("stats.runHistory.title")}>
      <h2 style={s.title}>{t("stats.runHistory.title")}</h2>
      {q.isError ? (
        <StatsErrorPanel title={t("stats.runHistory.loadError")} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th scope="col" style={s.th}>{t("stats.runHistory.timestamp")}</th>
                  <th scope="col" style={s.th}>{t("stats.runHistory.pr")}</th>
                  <th scope="col" style={s.th}>{t("stats.runHistory.tokens")}</th>
                  <th scope="col" style={s.th}>
                    <div>{t("stats.runHistory.cost")}</div>
                    <CostLabel />
                  </th>
                  <th scope="col" style={s.th}>{t("stats.runHistory.findings")}</th>
                  <th scope="col" style={s.th}>{t("stats.runHistory.status")}</th>
                  <th scope="col" style={s.th} aria-label={t("stats.runHistory.viewTrace")} />
                </tr>
              </thead>
              {data && (
                <tbody>
                  {data.items.map((run) => (
                    <RunRow key={run.run_id} run={run} timeZone={timeZone} />
                  ))}
                </tbody>
              )}
            </table>
            {!data && (
              <div style={s.skeletons}>
                <Skeleton height={18} />
                <Skeleton height={18} />
                <Skeleton height={18} />
              </div>
            )}
          </div>
          {data && data.items.length > 0 && (
            <div style={s.pager}>
              <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                {t("stats.runHistory.previous")}
              </Button>
              <span className="tnum">
                {t("stats.runHistory.range", { start: f.count(start), end: f.count(end), total: f.count(data.total) })}
              </span>
              <Button size="sm" disabled={end >= data.total} onClick={() => setPage((p) => p + 1)}>
                {t("stats.runHistory.next")}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
