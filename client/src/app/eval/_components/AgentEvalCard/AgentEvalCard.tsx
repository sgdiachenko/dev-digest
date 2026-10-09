"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Sparkline } from "@devdigest/ui";
import type { EvalOverview } from "@devdigest/shared";
import { fmtDate, fmtPct, METRIC_COLOR, type MetricKey } from "../helpers";
import { s } from "../styles";

type OverviewAgent = EvalOverview["agents"][number];

const SHORT: { key: MetricKey; label: "recallUpper" | "precisionUpper" | "citationAccuracyUpper" }[] = [
  { key: "recall", label: "recallUpper" },
  { key: "precision", label: "precisionUpper" },
  { key: "citation_accuracy", label: "citationAccuracyUpper" },
];

/** One agent: model badge, last run, recall trend, the three metrics. The whole card opens `?agent=`. */
export function AgentEvalCard({ agent, onOpen }: { agent: OverviewAgent; onOpen: (agentId: string) => void }) {
  const t = useTranslations("eval");
  const run = agent.latest;

  return (
    <button type="button" style={s.card} aria-label={t("overview.openAgent", { name: agent.name })} onClick={() => onOpen(agent.agent_id)}>
      <span style={s.cardMain}>
        <span style={s.cardName}>
          <span style={s.ellipsis} title={agent.name}>
            {agent.name}
          </span>
          <Badge mono>{agent.model}</Badge>
        </span>
        <span style={{ ...s.cardMeta, display: "block" }}>
          {run
            ? t("overview.lastRun", {
                version: run.agent_version,
                date: fmtDate(run.started_at),
                passed: run.cases_passed ?? 0,
                total: run.cases_total,
              })
            : t("overview.noRuns")}
        </span>
      </span>
      {agent.recall_trend.length >= 2 && (
        <span role="img" aria-label={t("overview.sparklineLabel")}>
          <Sparkline data={agent.recall_trend} color={METRIC_COLOR.recall} w={84} h={28} />
        </span>
      )}
      <span style={s.cardPcts}>
        {SHORT.map((m) => (
          <span key={m.key} style={s.pct}>
            <span style={s.pctLabel}>{t(`metrics.${m.label}`)}</span>
            <span className="tnum" style={{ ...s.pctValue, color: METRIC_COLOR[m.key] }}>
              {fmtPct(run?.[m.key])}
            </span>
          </span>
        ))}
      </span>
      <Icon.ChevronRight size={16} aria-hidden="true" />
    </button>
  );
}
