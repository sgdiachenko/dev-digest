/* CiRunRow — one stored CI run (AC-80). Missing numbers render "—" with the stored reason as text (AC-94), a run without
   a PR shows "unlinked" (AC-115), a missing agent shows "—" (AC-100), and "differs from export" is text plus icon (AC-180, AC-182). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, SEV } from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared";
import { githubPrUrl } from "@/lib/github-urls";
import { REASON_KEYS, RUN_STATUS_VIEW, VERDICT_KEYS } from "./constants";
import { formatCost, formatDuration, formatTimestamp, shortSha } from "./helpers";
import { s } from "./styles";

const DASH = "—";

const SEVERITIES = [
  ["critical", "CRITICAL"],
  ["warning", "WARNING"],
  ["suggestion", "SUGGESTION"],
] as const;

export function CiRunRow({ run }: { run: CiRun }) {
  const t = useTranslations("ci");
  const status = RUN_STATUS_VIEW[run.status];
  const hasNumbers = run.findings_count !== null;
  // No manifest hash means the runner never read the manifest: nothing to compare (AC-182).
  const differs = run.differs_from_export && run.manifest_sha256 !== null;

  return (
    <tr>
      <td style={s.td}>
        <span className="mono" style={s.mono}>
          {formatTimestamp(run.ran_at) ?? DASH}
        </span>
        <span style={{ ...s.ellipsis, ...s.muted }} title={run.repo}>
          {run.repo}
        </span>
      </td>
      <td style={s.td}>
        {run.pr_number !== null ? (
          <a href={githubPrUrl(run.repo, run.pr_number)} target="_blank" rel="noopener noreferrer" style={s.link}>
            #{run.pr_number}
          </a>
        ) : (
          <span>{t("runs.unlinked")}</span>
        )}{" "}
        <span className="mono" style={{ ...s.mono, ...s.muted }}>
          {shortSha(run.head_sha)}
        </span>
      </td>
      <td style={s.td}>
        {run.agent ? (
          <span style={s.ellipsis} title={`${run.agent} v${run.agent_version ?? "?"}`}>
            {run.agent}
            {run.agent_version !== null && ` v${run.agent_version}`}
          </span>
        ) : (
          <span>{DASH}</span>
        )}
        {differs && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
            {t("runs.differsFromExport")}
          </Badge>
        )}
      </td>
      <td style={s.td}>
        <Badge color="var(--text-secondary)" icon="Workflow">
          {t("runs.sourceGha")}
        </Badge>
      </td>
      <td style={s.td}>{formatDuration(run.duration_s) ?? DASH}</td>
      <td style={s.td}>
        {hasNumbers ? (
          <div style={s.counts}>
            {SEVERITIES.map(([field, sev]) => {
              const I = Icon[SEV[sev].icon];
              return (
                <span key={field} style={{ ...s.count, color: SEV[sev].c }} title={SEV[sev].label}>
                  <I size={12} />
                  <span className="tnum">{run[field] ?? 0}</span>
                </span>
              );
            })}
          </div>
        ) : (
          <>
            <span>{DASH}</span>
            {run.unavailable_reason && <span style={{ ...s.muted, display: "block" }}>{t(REASON_KEYS[run.unavailable_reason])}</span>}
          </>
        )}
      </td>
      <td style={s.td}>
        <span className="mono tnum">{formatCost(run.cost_usd) ?? DASH}</span>
      </td>
      <td style={s.td}>{run.verdict ? t(VERDICT_KEYS[run.verdict]) : DASH}</td>
      <td style={s.td}>
        <Badge color={status.color} bg={status.bg} icon={status.icon}>
          {t(status.labelKey)}
        </Badge>
      </td>
      <td style={s.td}>
        <a
          href={run.github_url}
          target="_blank"
          rel="noopener noreferrer"
          style={s.link}
          aria-label={t("runs.viewOnGitHubFor", { repo: run.repo, run: run.workflow_run_id })}
        >
          {t("runs.viewOnGitHub")}
        </a>
      </td>
    </tr>
  );
}
