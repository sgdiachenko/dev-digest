"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { EvalOverview } from "@devdigest/shared";
import { AgentEvalCard } from "../AgentEvalCard";
import { RecentRunsFeed } from "../RecentRunsFeed";
import { s } from "../styles";

export const FEED_SIZE = 6;

export function OverviewView({
  overview,
  notFound,
  onOpenAgent,
  onRunAll,
  runAllPending = false,
}: {
  overview: EvalOverview;
  notFound: boolean;
  onOpenAgent: (agentId: string) => void;
  onRunAll?: () => void;
  runAllPending?: boolean;
}) {
  const t = useTranslations("eval");
  const noRuns = overview.agents.every((a) => a.latest === null);

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.heading}>{t("overview.title")}</h1>
          <p style={s.subtitle}>{t("overview.subtitle")}</p>
        </div>
        {onRunAll && (
          <div style={s.actions}>
            <Button kind="primary" icon="Play" onClick={onRunAll} disabled={runAllPending}>
              {t("overview.runAllAgents")}
            </Button>
          </div>
        )}
      </div>

      {notFound && (
        <div role="alert" style={{ ...s.notice, ...s.noticeWarn }}>
          {t("overview.notFound")}
        </div>
      )}

      {noRuns && (
        <div style={s.notice}>
          <strong>{t("overview.emptyTitle")}</strong>
          <p style={{ margin: "4px 0 8px" }}>{t("overview.emptyBody")}</p>
          <Link href="/agents" style={s.link}>
            {t("overview.emptyLink")}
          </Link>
        </div>
      )}

      {overview.agents.length > 0 && (
        <>
          <h2 style={s.sectionLabel}>
            <Icon.Cpu size={13} /> {t("overview.agentsSection")}
          </h2>
          <ul style={{ ...s.stack, listStyle: "none", padding: 0, margin: 0 }}>
            {overview.agents.map((a) => (
              <li key={a.agent_id}>
                <AgentEvalCard agent={a} onOpen={onOpenAgent} />
              </li>
            ))}
          </ul>
        </>
      )}

      {overview.recent_runs.length > 0 && (
        <>
          <h2 style={s.sectionLabel}>
            <Icon.History size={13} /> {t("overview.recentRunsAll")}
          </h2>
          <RecentRunsFeed runs={overview.recent_runs.slice(0, FEED_SIZE)} onOpenAgent={onOpenAgent} />
        </>
      )}
    </div>
  );
}
