/* AgentSummaryCard — header of the selected agent's tab panel: accent left
   border, score ring, name in the agent's accent colour, the summary (else the
   verdict) in muted text, and "View trace" above the "time · cost" line. */
"use client";

import { useTranslations } from "next-intl";
import type { AgentColumn } from "@devdigest/shared";
import { formatCost, formatSeconds, agentAccent } from "../../../helpers";
import { agentLabel } from "../../helpers";
import { ScoreRing } from "../ScoreRing";
import { card, s } from "./styles";

export function AgentSummaryCard({
  column,
  onOpenTrace,
}: {
  column: AgentColumn;
  onOpenTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgentResults");
  const label = agentLabel(column, t);
  const accent = agentAccent(label);
  const text = column.summary || column.verdict;

  return (
    <section style={card(accent.color)} aria-label={label}>
      <ScoreRing score={column.score} color={accent.color} label={t("score", { value: column.score ?? "–" })} />
      <div style={s.text}>
        <h3 style={s.name(accent.color)}>{label}</h3>
        {text && <p style={s.summary}>{text}</p>}
      </div>
      <div style={s.side}>
        <button type="button" style={s.trace} onClick={() => onOpenTrace(column.run_id)}>
          {t("viewTrace")}
        </button>
        <span className="mono tnum" style={s.meta}>
          {`${formatSeconds(column.duration_ms)} · ${formatCost(column.cost_usd)}`}
        </span>
      </div>
    </section>
  );
}
