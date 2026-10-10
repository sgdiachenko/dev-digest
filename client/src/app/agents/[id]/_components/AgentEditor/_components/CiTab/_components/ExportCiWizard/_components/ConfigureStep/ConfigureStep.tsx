/* ConfigureStep — trigger toggles (at least one) and "Post results as" (AC-7–AC-9). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { CiTrigger } from "@devdigest/shared";
import { ALL_TRIGGERS, POST_AS_OPTIONS, type PostAs } from "../../constants";
import { step } from "../stepStyles";

export function ConfigureStep({
  triggers,
  onTriggers,
  postAs,
  onPostAs,
}: {
  triggers: CiTrigger[];
  onTriggers: (next: CiTrigger[]) => void;
  postAs: PostAs;
  onPostAs: (next: PostAs) => void;
}) {
  const t = useTranslations("ci");
  const toggle = (trigger: CiTrigger) =>
    onTriggers(triggers.includes(trigger) ? triggers.filter((x) => x !== trigger) : [...triggers, trigger]);

  return (
    <div style={step.body}>
      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend style={step.label}>{t("exportWizard.triggerLabel")}</legend>
        {ALL_TRIGGERS.map((trigger) => (
          <label key={trigger} style={{ ...step.card, marginBottom: 6, alignItems: "center" }}>
            <input type="checkbox" checked={triggers.includes(trigger)} onChange={() => toggle(trigger)} />
            <span className="mono">{`pull_request:${trigger}`}</span>
          </label>
        ))}
        <div role="alert" style={step.error}>
          {triggers.length === 0 ? t("exportWizard.triggerRequired") : null}
        </div>
      </fieldset>

      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend style={step.label}>{t("exportWizard.postResultsLabel")}</legend>
        {POST_AS_OPTIONS.map((o) => (
          <label key={o.value} style={{ ...step.card, ...(postAs === o.value ? step.cardOn : null), marginBottom: 6, alignItems: "center" }}>
            <input type="radio" name="ci-post-as" checked={postAs === o.value} onChange={() => onPostAs(o.value)} />
            <span>{t(o.labelKey)}</span>
            {o.value === "github_review" && <span style={step.hint}>{t("exportWizard.recommended")}</span>}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
