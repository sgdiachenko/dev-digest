/* TruncatedText — one line with an ellipsis; a keyboard-operable button expands
   it to the full text. Text is rendered as plain text, never as HTML. */
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export function TruncatedText({ text, className }: { text: string; className?: string }) {
  const t = useTranslations("common");
  const [expanded, setExpanded] = useState(false);

  return (
    <span style={s.root} className={className}>
      <span style={expanded ? s.expanded : s.collapsed}>{text}</span>
      <button
        type="button"
        style={s.toggle}
        aria-expanded={expanded}
        aria-label={expanded ? t("truncate.collapse") : t("truncate.expand")}
        title={expanded ? t("truncate.collapse") : t("truncate.expand")}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <Icon.ChevronDown size={12} /> : <Icon.ChevronRight size={12} />}
      </button>
    </span>
  );
}
