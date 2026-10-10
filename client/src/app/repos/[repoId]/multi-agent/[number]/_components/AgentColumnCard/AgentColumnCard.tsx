/* AgentColumnCard — one member run as a card: accent top border, icon tile, name,
   status (text + icon) · time · cost, score ring, findings (severity bar + icon),
   and a footer with "View trace" and the finding count. All text renders as
   plain text; long values are truncated with an expand control. */
"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { TruncatedText } from "@/components/truncated-text/TruncatedText";
import { formatCost, formatSeconds, agentAccent } from "../../../helpers";
import { agentLabel, lineRange, severityMeta, statusMeta } from "../../helpers";
import { ScoreRing } from "../ScoreRing";
import { card, item, s, tile } from "./styles";

export function AgentColumnCard({
  column,
  onOpenTrace,
}: {
  column: AgentColumn;
  onOpenTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgentResults");
  const meta = statusMeta(column.status);
  const StatusIcon = Icon[meta.icon];
  const label = agentLabel(column, t);
  const accent = agentAccent(label);
  const AgentIcon = Icon[accent.icon];

  return (
    <section style={card(accent.color)} aria-label={label}>
      <div style={s.head}>
        <span style={tile(accent.color)} aria-hidden="true">
          <AgentIcon size={18} />
        </span>
        <div style={s.headText}>
          <div style={s.name}>
            <TruncatedText text={label} />
          </div>
          <div style={s.meta}>
            <span style={s.status}>
              <StatusIcon size={12} />
              {t(`status.${meta.key}`)}
            </span>
            <span>{`${formatSeconds(column.duration_ms)} · ${formatCost(column.cost_usd)}`}</span>
          </div>
        </div>
        <ScoreRing score={column.score} color={accent.color} label={t("score", { value: column.score ?? "–" })} />
      </div>

      <div style={s.body}>
        {column.status === "failed" && column.error && (
          <div style={s.error}>
            <TruncatedText text={column.error} />
          </div>
        )}

        {column.status === "done" && column.findings.length === 0 && <p style={s.empty}>{t("noFindings")}</p>}
        {column.findings.length > 0 && (
          <ul style={s.list}>
            {column.findings.map((f) => {
              const sev = severityMeta(f.severity);
              const SevIcon = Icon[sev.icon];
              return (
                <li key={f.id} style={item(sev.color)}>
                  <span style={{ color: sev.color, display: "inline-flex", paddingTop: 2 }}>
                    <SevIcon size={16} aria-label={f.severity} />
                  </span>
                  <div style={s.itemBody}>
                    <span style={s.title}>
                      <TruncatedText text={f.title} />
                    </span>
                    <span style={s.path}>
                      <TruncatedText text={`${f.file}:${lineRange(f.start_line, f.end_line)}`} />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div style={s.footer}>
        <button type="button" style={s.trace} onClick={() => onOpenTrace(column.run_id)}>
          {t("viewTrace")}
        </button>
        <span style={s.count}>{t("findingsCount", { count: column.findings.length })}</span>
      </div>
    </section>
  );
}
