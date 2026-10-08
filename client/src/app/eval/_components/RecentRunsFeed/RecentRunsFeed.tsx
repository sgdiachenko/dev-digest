"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { BarRow } from "@devdigest/ui";
import type { EvalOverview } from "@devdigest/shared";
import { fmtDate, fmtPct, METRIC_COLOR, METRIC_KEYS, metricLabelKey } from "../helpers";
import { s } from "../styles";

type FeedRun = EvalOverview["recent_runs"][number];

/** Newest runs across all agents; every row opens its agent from mouse or keyboard (Enter/Space). */
export function RecentRunsFeed({ runs, onOpenAgent }: { runs: FeedRun[]; onOpenAgent: (agentId: string) => void }) {
  const t = useTranslations("eval");
  const open = (run: FeedRun) => onOpenAgent(run.agent_id);

  return (
    <div style={s.feed}>
      {runs.map((run) => (
        <div
          key={run.id}
          role="button"
          tabIndex={0}
          style={s.feedRow}
          onClick={() => open(run)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              open(run);
            }
          }}
        >
          <span style={{ ...s.ellipsis, fontWeight: 600 }} title={run.agent_name}>
            {run.agent_name}
          </span>
          <span className="mono" style={{ color: "var(--text-muted)" }}>
            {fmtDate(run.started_at)}
          </span>
          <span className="mono" style={{ color: "var(--accent)" }}>
            {t("common.version", { version: run.agent_version })}
          </span>
          <span style={s.bars}>
            {METRIC_KEYS.map((m) => (
              <BarRow
                key={m}
                label={t(`metrics.${metricLabelKey(m)}`)}
                value={run[m] ?? 0}
                max={1}
                color={METRIC_COLOR[m]}
                suffix={fmtPct(run[m])}
              />
            ))}
          </span>
          <span className="tnum" style={{ fontWeight: 600 }}>
            {t("overview.passShort", { passed: run.cases_passed ?? 0, total: run.cases_total })}
          </span>
        </div>
      ))}
    </div>
  );
}
