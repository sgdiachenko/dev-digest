/* DisagreementBlock — "Where agents disagree": per finding group the location
   and one cell per agent take (severity, "did not flag" or "no result"). A
   "Show only conflicts" toggle filters the list; "all agree" and "no findings"
   are separate messages. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, SeverityBadge, type Severity } from "@devdigest/ui";
import type { AgentColumn, Conflict, ConflictTake } from "@devdigest/shared";
import { TruncatedText } from "@/components/truncated-text/TruncatedText";
import { agentLabel, agreementState, lineRange, visibleConflicts } from "../../helpers";
import { s } from "./styles";

function TakeCell({ take, columns }: { take: ConflictTake; columns: AgentColumn[] }) {
  const t = useTranslations("multiAgentResults");
  const column = columns.find((c) => c.run_id === take.run_id);
  return (
    <div style={s.cell}>
      <span style={s.cellAgent}>{column ? agentLabel(column, t) : take.persona}</span>
      {take.verdict === "ignored" && <span>{t("didNotFlag")}</span>}
      {take.verdict === "no_result" && <span>{t("noResult")}</span>}
      {take.verdict !== "ignored" && take.verdict !== "no_result" && (
        <SeverityBadge severity={take.verdict as Severity} />
      )}
    </div>
  );
}

export function DisagreementBlock({ conflicts, columns }: { conflicts: Conflict[]; columns: AgentColumn[] }) {
  const t = useTranslations("multiAgentResults");
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);
  const state = agreementState(conflicts, onlyConflicts);

  return (
    <section style={s.root} aria-labelledby="disagreement-heading">
      <div style={s.head}>
        <h2 id="disagreement-heading" style={s.heading}>
          {t("disagreement.heading")}
        </h2>
        <Button
          kind="secondary"
          size="sm"
          active={onlyConflicts}
          aria-pressed={onlyConflicts}
          onClick={() => setOnlyConflicts((v) => !v)}
        >
          {t("disagreement.onlyConflicts")}
        </Button>
      </div>
      {state === "noFindings" && <p style={s.note}>{t("disagreement.noFindings")}</p>}
      {state === "allAgree" && <p style={s.note}>{t("disagreement.allAgree")}</p>}
      {state === "list" && (
        <ul style={s.list}>
          {visibleConflicts(conflicts, onlyConflicts).map((c) => (
            <li key={c.group_id} style={s.row}>
              <TruncatedText text={c.title} />
              <span style={s.where}>
                <TruncatedText text={`${c.file}:${lineRange(c.line, c.end_line)}`} />
              </span>
              <div style={s.cells}>
                {c.takes.map((take) => (
                  <TakeCell key={take.run_id} take={take} columns={columns} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
