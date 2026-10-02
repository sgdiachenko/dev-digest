/* RiskItem — one risk: severity (icon + word, never colour alone), title, file
   refs, and an expandable explanation. All model text is rendered as text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { SEVERITY_META } from "../../helpers";
import { BriefFileRef } from "../BriefFileRef";
import { s } from "./styles";

export function RiskItem({
  risk,
  changedFiles,
  onOpenFile,
}: {
  risk: Risk;
  changedFiles: readonly string[];
  onOpenFile: (path: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  const [open, setOpen] = React.useState(false);
  const explanationId = React.useId();
  const meta = SEVERITY_META[risk.severity];
  const SevIcon = Icon[meta.icon];

  return (
    <li style={s.item}>
      <div style={s.head}>
        <span style={s.severity(meta.color, meta.bg)}>
          <SevIcon size={13} aria-hidden="true" />
          {t(`card.severity.${risk.severity}`)}
        </span>
        <span style={s.title}>{risk.title}</span>
        <button
          type="button"
          style={s.toggle}
          aria-expanded={open}
          aria-controls={explanationId}
          aria-label={open ? t("card.collapseRisk") : t("card.expandRisk")}
          title={open ? t("card.collapseRisk") : t("card.expandRisk")}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon.ChevronDown
            size={15}
            style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .12s" }}
          />
        </button>
      </div>
      {risk.file_refs.length > 0 && (
        <div style={s.refs}>
          {risk.file_refs.map((ref) => (
            <BriefFileRef key={ref} fileRef={ref} changedFiles={changedFiles} onOpenFile={onOpenFile} />
          ))}
        </div>
      )}
      {open && (
        <p id={explanationId} style={s.explanation}>
          {risk.explanation}
        </p>
      )}
    </li>
  );
}
