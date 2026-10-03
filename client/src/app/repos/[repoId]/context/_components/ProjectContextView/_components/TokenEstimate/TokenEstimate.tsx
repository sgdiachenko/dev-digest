"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s } from "../../styles";

/** `≈n` tokenizer estimate (or `—` when the document was not read) with a keyboard-reachable tooltip. */
export function TokenEstimate({ tokens }: { tokens: number | null }) {
  const t = useTranslations("context");
  const [open, setOpen] = React.useState(false);
  const tooltipId = React.useId();
  return (
    <span style={s.tokenWrap}>
      <span
        tabIndex={0}
        className="tnum"
        style={s.token}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {tokens == null ? t("tokens.none") : t("tokens.estimate", { count: tokens })}
      </span>
      {open && (
        <span role="tooltip" id={tooltipId} style={s.tooltip}>
          {t("tokens.tooltip")}
        </span>
      )}
    </span>
  );
}
