/* ExpectedOutputEditor — the expectations JSON with a valid/invalid badge; the error text sits under
   the field and is linked to it with aria-describedby (AC-145, AC-146). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { ParsedExpected } from "../../../helpers";
import { s } from "../../styles";

const ERROR_ID = "eval-expected-error";

export function ExpectedOutputEditor({
  value,
  onChange,
  parsed,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  parsed: ParsedExpected;
  disabled?: boolean;
}) {
  const t = useTranslations("eval.modal");
  const invalid = !parsed.ok;
  const message = !parsed.ok
    ? parsed.error.key
      ? t(`validation.${parsed.error.key}`, parsed.error.values)
      : parsed.error.message
    : null;
  return (
    <>
      <div style={s.expectedHead}>
        <label htmlFor="eval-expected" style={s.smallLabel}>
          {t("expectedLabel")}
        </label>
        {invalid ? (
          <Badge color="var(--crit)" bg="var(--bg-hover)" icon="AlertTriangle">
            {t("invalidBadge")}
          </Badge>
        ) : (
          <Badge color="var(--ok)" bg="var(--ok-bg)" icon="Check">
            {t("validBadge")}
          </Badge>
        )}
      </div>
      <textarea
        id="eval-expected"
        className="mono"
        value={value}
        disabled={disabled}
        spellCheck={false}
        aria-invalid={invalid}
        aria-describedby={invalid ? ERROR_ID : undefined}
        onChange={(e) => onChange(e.target.value)}
        style={s.textarea(invalid)}
      />
      {message && (
        <div id={ERROR_ID} role="alert" style={s.fieldError}>
          {message}
        </div>
      )}
    </>
  );
}
