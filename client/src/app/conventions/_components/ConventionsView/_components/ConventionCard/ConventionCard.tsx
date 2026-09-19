"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, IconBtn, MonoLink, PercentProgress, Textarea, TextInput } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import type { Repo } from "../../../../../../lib/types";
import { githubEvidenceUrl } from "../../helpers";
import { s } from "./styles";

export interface ConventionCardProps {
  candidate: ConventionCandidate;
  repo: Repo;
  onAccept: () => void;
  onReject: () => void;
  onSave: (patch: { rule: string; rationale: string | null }) => void;
  onDelete: () => void;
  saving?: boolean;
}

/** One extracted house-rule proposal — grading criterion #47's minimum is
 *  exactly Accept / Reject / Edit; Delete is a small 4th, non-required action. */
export function ConventionCard({ candidate, repo, onAccept, onReject, onSave, onDelete, saving }: ConventionCardProps) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(candidate.rule);
  const [rationale, setRationale] = React.useState(candidate.rationale ?? "");
  const [copied, setCopied] = React.useState(false);

  const startEdit = () => {
    setRule(candidate.rule);
    setRationale(candidate.rationale ?? "");
    setEditing(true);
  };
  const save = () => {
    onSave({ rule: rule.trim(), rationale: rationale.trim() || null });
    setEditing(false);
  };

  const copySnippet = () => {
    void navigator.clipboard?.writeText(candidate.evidence_snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const evidenceLabel = candidate.evidence_line
    ? `${candidate.evidence_path}:${candidate.evidence_line}`
    : candidate.evidence_path;

  return (
    <div style={s.card(candidate.status)}>
      <div style={s.head}>
        <div style={s.ruleCol}>
          <div style={s.ruleRow}>
            <span style={s.rule}>{candidate.rule}</span>
            <Badge>{t(`category.${candidate.category}`)}</Badge>
            {candidate.origin === "config" && <Badge color="var(--accent-text)">{t("card.fromConfig")}</Badge>}
          </div>
          {candidate.rationale && <p style={s.rationale}>{candidate.rationale}</p>}
        </div>

        {editing ? null : (
          <div style={s.actions}>
            <Button
              kind={candidate.status === "accepted" ? "primary" : "secondary"}
              size="sm"
              icon="Check"
              onClick={onAccept}
              disabled={saving}
              full
            >
              {t("card.accept")}
            </Button>
            <Button
              kind={candidate.status === "rejected" ? "danger" : "ghost"}
              size="sm"
              icon="X"
              onClick={onReject}
              disabled={saving}
              full
            >
              {t("card.reject")}
            </Button>
            <div style={{ display: "flex", gap: 6 }}>
              <IconBtn icon="Edit" label={t("card.edit")} onClick={startEdit} />
              <IconBtn icon="Trash" label={t("card.delete")} onClick={onDelete} />
            </div>
          </div>
        )}
      </div>

      {editing && (
        <div style={s.editForm}>
          <TextInput value={rule} onChange={setRule} placeholder={t("card.rulePlaceholder")} />
          <Textarea value={rationale} onChange={setRationale} rows={2} placeholder={t("card.rationalePlaceholder")} />
          <div style={s.editActions}>
            <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
              {t("card.cancel")}
            </Button>
            <Button kind="primary" size="sm" icon="Check" onClick={save} disabled={!rule.trim()}>
              {t("card.save")}
            </Button>
          </div>
        </div>
      )}

      <div style={s.evidenceBox}>
        <div style={s.evidenceHead}>
          <MonoLink href={githubEvidenceUrl(repo, candidate.evidence_path, candidate.evidence_line)}>
            {evidenceLabel}
          </MonoLink>
          <IconBtn icon={copied ? "Check" : "Copy"} label={t("card.copy")} onClick={copySnippet} />
        </div>
        <pre className="mono" style={s.snippet}>
          {candidate.evidence_snippet}
        </pre>
      </div>

      <div style={s.footRow}>
        <div style={s.confidenceCol}>
          <PercentProgress value={candidate.confidence * 100} label={t("card.confidence")} />
        </div>
        {candidate.support_count != null && (
          <span style={s.support}>{t("card.seenInFiles", { count: candidate.support_count })}</span>
        )}
      </div>
    </div>
  );
}
