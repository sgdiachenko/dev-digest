/* TabFindingCard — one finding as a collapsible card. Collapsed: severity tile,
   title, category tag, then file:line and confidence. Expanded: description,
   "Suggested fix", and Accept / Dismiss / Learn (disabled "coming soon" stub) /
   Turn into eval case. There is no Reply control (spec decision D-1). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Markdown } from "@devdigest/ui";
import type { FindingActionKind, FindingRecord } from "@devdigest/shared";
import { categoryIcon, confidenceMeta, lineRange, severityMeta } from "../../helpers";
import { action, card, s, tile } from "./styles";

export function TabFindingCard({
  f,
  focused,
  defaultExpanded,
  pending,
  onAction,
  onTurnIntoEvalCase,
  evalDisabledReason,
}: {
  f: FindingRecord;
  focused: boolean;
  defaultExpanded: boolean;
  pending: boolean;
  onAction: (action: FindingActionKind) => void;
  onTurnIntoEvalCase: () => void;
  /** Why the eval button is disabled; null = enabled. */
  evalDisabledReason: string | null;
}) {
  const t = useTranslations("multiAgentResults");
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const sev = severityMeta(f.severity);
  const SevIcon = Icon[sev.icon];
  const CatIcon = Icon[categoryIcon(f.category)];
  const ChevronDown = Icon.ChevronDown;
  const conf = confidenceMeta(f.confidence);
  const accepted = !!f.accepted_at;
  const dismissed = !!f.dismissed_at;
  const bodyId = `finding-body-${f.id}`;
  const soonId = `learn-soon-${f.id}`;
  const evalReasonId = `eval-reason-${f.id}`;

  return (
    <div data-finding-id={f.id} style={card(focused, sev.color, accepted || dismissed)}>
      <button type="button" style={s.header} aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded((e) => !e)}>
        <span style={tile(sev.color)}>
          <SevIcon size={16} aria-label={f.severity} />
        </span>
        <span style={s.main}>
          <span style={s.titleRow}>
            <span style={s.title(dismissed)}>{f.title}</span>
            <span style={s.category}>
              <CatIcon size={13} aria-hidden="true" />
              {f.category}
            </span>
            {accepted && <span style={s.state}>{t("finding.accepted")}</span>}
            {dismissed && <span style={s.state}>{t("finding.dismissed")}</span>}
          </span>
          <span style={s.metaRow}>
            <span className="mono" style={s.path}>
              {t("finding.location", { file: f.file, lines: lineRange(f.start_line, f.end_line) })}
            </span>
            <span className="mono tnum" style={s.conf} title={t("finding.confidenceTitle")}>
              <span style={s.dot(conf.color)} aria-hidden="true" />
              {t("finding.confidence", { value: conf.pct })}
            </span>
          </span>
        </span>
        <ChevronDown size={16} style={s.chevron(expanded)} aria-hidden="true" />
      </button>

      {expanded && (
        <div id={bodyId} style={s.body}>
          <Markdown>{f.rationale}</Markdown>
          {f.suggestion && (
            <div>
              <div style={s.fixLabel}>{t("finding.suggestedFix")}</div>
              <Markdown>{f.suggestion}</Markdown>
            </div>
          )}
          <div style={s.actions}>
            <button type="button" style={action(accepted)} disabled={pending} onClick={() => onAction("accept")}>
              <Icon.Check size={16} aria-hidden="true" />
              {t("finding.accept")}
            </button>
            <button type="button" style={action(dismissed)} disabled={pending} onClick={() => onAction("dismiss")}>
              <Icon.X size={16} aria-hidden="true" />
              {t("finding.dismiss")}
            </button>
            <span style={s.learnWrap}>
              <button type="button" style={{ ...action(false), ...s.disabled }} disabled aria-describedby={soonId}>
                <Icon.Brain size={16} aria-hidden="true" />
                {t("learn.label")}
              </button>
              <span id={soonId} style={s.soon}>
                {t("learn.comingSoon")}
              </span>
            </span>
            <button
              type="button"
              style={{ ...action(false), ...(evalDisabledReason ? s.disabled : null) }}
              disabled={!!evalDisabledReason}
              title={evalDisabledReason ?? undefined}
              aria-describedby={evalDisabledReason ? evalReasonId : undefined}
              onClick={onTurnIntoEvalCase}
            >
              <Icon.FlaskConical size={16} aria-hidden="true" />
              {t("finding.turnIntoEvalCase")}
            </button>
            {evalDisabledReason && (
              <span id={evalReasonId} style={s.visuallyHidden}>
                {evalDisabledReason}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
