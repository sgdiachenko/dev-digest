/* AgentTabs — WAI-ARIA tablist over the group's member runs: roles,
   aria-selected, roving tabIndex, ArrowLeft/Right, Home and End. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { AgentColumn } from "@devdigest/shared";
import { Icon } from "@devdigest/ui";
import { agentAccent } from "../../../helpers";
import { agentLabel, scoreColor } from "../../helpers";
import { s } from "./styles";

export const tabId = (runId: string) => `agent-tab-${runId}`;
export const panelId = (runId: string) => `agent-panel-${runId}`;

export function AgentTabs({
  columns,
  selectedRunId,
  onSelect,
}: {
  columns: AgentColumn[];
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
}) {
  const t = useTranslations("multiAgentResults");
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const move = (index: number) => {
    const target = columns[(index + columns.length) % columns.length];
    if (!target) return;
    onSelect(target.run_id);
    refs.current[target.run_id]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight") move(index + 1);
    else if (e.key === "ArrowLeft") move(index - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(columns.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div role="tablist" aria-label={t("tabs.label")} style={s.list}>
      {columns.map((c, i) => {
        const selected = c.run_id === selectedRunId;
        const label = agentLabel(c, t);
        const accent = agentAccent(label);
        const AgentIcon = Icon[accent.icon];
        return (
          <button
            key={c.run_id}
            ref={(el) => {
              refs.current[c.run_id] = el;
            }}
            type="button"
            role="tab"
            id={tabId(c.run_id)}
            aria-selected={selected}
            aria-controls={panelId(c.run_id)}
            tabIndex={selected ? 0 : -1}
            style={s.tab(selected, accent.color)}
            onClick={() => onSelect(c.run_id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <span style={s.icon(accent.color)} aria-hidden="true">
              <AgentIcon size={16} />
            </span>
            <span style={s.name}>{label}</span>
            {c.score != null && (
              <span className="tnum" style={s.score(scoreColor(c.score))}>
                {Math.round(c.score)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
