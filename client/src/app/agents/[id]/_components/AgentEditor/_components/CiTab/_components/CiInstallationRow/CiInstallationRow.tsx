/* CiInstallationRow — one repository the agent is installed in: repo, target badge, setup PR link,
   latest stored run (text + icon + relative time) and the outdated / pending-update flags (AC-69, AC-75, AC-76, AC-101). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { Agent, CiInstallation } from "@devdigest/shared";
import { RUN_STATUS_VIEW } from "../../constants";
import { relativeTime } from "../../helpers";
import { s } from "./styles";

export function CiInstallationRow({ installation, agent }: { installation: CiInstallation; agent: Agent }) {
  const t = useTranslations("ci");
  const run = installation.latest_run;
  const view = run ? RUN_STATUS_VIEW[run.status] : null;
  // The server computes both flags; the agent prop keeps them honest while its query is fresher than the list.
  const outdated = installation.outdated || installation.agent_version < agent.version;
  const pendingUpdate = installation.pending_update || installation.ci_fail_on !== agent.ci_fail_on;

  return (
    <li style={s.row}>
      <Icon.GitBranch size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      <span className="mono" style={s.repo} title={installation.repo} aria-label={installation.repo}>
        {installation.repo}
      </span>
      <Badge color="var(--text-secondary)" icon="Workflow">
        {t("ciTab.githubActions")}
      </Badge>
      {installation.pr_url && (
        <a href={installation.pr_url} target="_blank" rel="noopener noreferrer" style={s.link}>
          <Icon.ExternalLink size={12} />
          {t("ciTab.prLink")}
        </a>
      )}
      {outdated && (
        <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
          {t("ciTab.outdated")}
        </Badge>
      )}
      {pendingUpdate && (
        <Badge color="var(--warn)" bg="var(--warn-bg)" icon="Clock">
          {t("ciTab.pendingUpdate")}
        </Badge>
      )}
      {run && view ? (
        <span style={s.run}>
          <Badge color={view.color} bg={view.bg} icon={view.icon}>
            {t(view.labelKey)}
          </Badge>
          <span style={s.when}>{relativeTime(run.ran_at)}</span>
        </span>
      ) : (
        <span style={s.when}>{t("ciTab.noRuns")}</span>
      )}
    </li>
  );
}
