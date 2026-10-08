/* InputTabs — the case input: the diff fragment and the PR meta (title, body). Plain-text fields only (DD-10). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Tabs } from "@devdigest/ui";
import type { EvalDiffSource } from "@devdigest/shared";
import type { DraftFields } from "../../../helpers";
import { s } from "../../styles";

type TabKey = "diff" | "meta";

export function InputTabs({
  fields,
  onChange,
  diffSource,
  disabled,
}: {
  fields: DraftFields;
  onChange: <K extends keyof DraftFields>(key: K, value: DraftFields[K]) => void;
  diffSource: EvalDiffSource;
  disabled?: boolean;
}) {
  const t = useTranslations("eval.modal");
  const [tab, setTab] = React.useState<TabKey>("diff");
  const tabs = [
    { key: "diff", label: t("tabDiff") },
    { key: "meta", label: t("tabPrMeta") },
  ];
  return (
    <>
      <div style={s.sectionLabel}>{t("inputLabel")}</div>
      <Tabs tabs={tabs} value={tab} onChange={(k) => setTab(k as TabKey)} pad="0 16px" />
      <div style={s.tabBody}>
        {tab === "diff" ? (
          <>
            {diffSource === "current_pr_files" && (
              <div role="note" style={s.warning}>
                <Icon.AlertTriangle size={14} style={{ color: "var(--warn)", flexShrink: 0 }} aria-hidden />
                <span>{t("diffSourceWarning")}</span>
              </div>
            )}
            <textarea
              className="mono"
              aria-label={t("diffLabel")}
              value={fields.diff}
              disabled={disabled}
              spellCheck={false}
              onChange={(e) => onChange("diff", e.target.value)}
              style={s.textarea()}
            />
          </>
        ) : (
          <>
            <label style={s.smallLabel} htmlFor="eval-pr-title">
              {t("prTitleLabel")}
            </label>
            <input
              id="eval-pr-title"
              value={fields.prTitle}
              disabled={disabled}
              onChange={(e) => onChange("prTitle", e.target.value)}
              style={{ ...s.textarea(), minHeight: 0, resize: "none", fontSize: 14 }}
            />
            <label style={s.smallLabel} htmlFor="eval-pr-body">
              {t("prBodyLabel")}
            </label>
            <textarea
              id="eval-pr-body"
              value={fields.prBody}
              disabled={disabled}
              onChange={(e) => onChange("prBody", e.target.value)}
              style={{ ...s.textarea(), minHeight: 120, fontSize: 14 }}
            />
          </>
        )}
      </div>
    </>
  );
}
