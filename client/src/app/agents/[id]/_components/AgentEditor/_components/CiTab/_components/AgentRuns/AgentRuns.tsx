/* AgentRuns — the latest CI runs of this agent, shown on its CI tab, so a result from GitHub
   Actions is visible where the agent is configured. Rows are compact; the full table with
   every column lives on the CI Runs page. Text plus icon for status, never colour alone (C10). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Skeleton } from "@devdigest/ui";
import { useCiRuns } from "@/lib/hooks/ci";
import { githubPrUrl } from "@/lib/github-urls";
import { RUN_STATUS_VIEW } from "../../constants";
import { relativeTime } from "../../helpers";
import { s } from "./styles";

const RUNS_ON_TAB = 20;

export function AgentRuns({ agentId }: { agentId: string }) {
  const t = useTranslations("ci");
  const runs = useCiRuns(RUNS_ON_TAB, agentId);
  const rows = runs.data ?? [];

  let body: React.ReactNode;
  if (runs.isLoading) {
    body = <Skeleton height={48} />;
  } else if (runs.isError && !runs.data) {
    body = <div style={s.muted}>{t("ciTab.runsLoadFailed")}</div>;
  } else if (rows.length === 0) {
    body = <div style={s.muted}>{t("ciTab.noRuns")}</div>;
  } else {
    body = (
      <ul style={s.list}>
        {rows.map((run) => {
          const status = RUN_STATUS_VIEW[run.status];
          return (
            <li key={run.id} style={s.row}>
              <span className="mono" style={s.muted}>{relativeTime(run.ran_at) ?? "—"}</span>
              {run.pr_number !== null && (
                <a href={githubPrUrl(run.repo, run.pr_number)} target="_blank" rel="noopener noreferrer" style={s.link}>
                  {run.repo} #{run.pr_number}
                </a>
              )}
              <Badge color={status.color} bg={status.bg} icon={status.icon}>
                {t(status.labelKey)}
              </Badge>
              {run.findings_count !== null && (
                <span className="tnum" style={s.muted}>{t("ciTab.runsFindings", { count: run.findings_count })}</span>
              )}
              <a href={run.github_url} target="_blank" rel="noopener noreferrer" style={s.viewLink}>
                {t("runs.viewOnGitHub")}
              </a>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section style={s.section} aria-label={t("ciTab.runsTitle")}>
      <h3 style={s.title}>{t("ciTab.runsTitle")}</h3>
      {body}
    </section>
  );
}
