/* FailCiOn — single-choice "Fail CI on" control (AC-71–AC-74). Saves through the agent update route;
   a failed save restores the previous selection and shows the reason. `any` selects nothing and shows a note. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Agent, CiFailOn } from "@devdigest/shared";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { FAIL_ON_OPTIONS } from "../../constants";
import { s } from "./styles";

export function FailCiOn({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const update = useUpdateAgent();
  // The choice shown while the save is in flight; cleared on settle so a failure falls back to the stored value.
  const [pending, setPending] = React.useState<CiFailOn | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const selected = pending ?? agent.ci_fail_on;

  const choose = (value: CiFailOn) => {
    if (value === selected) return;
    setError(null);
    setPending(value);
    update.mutate(
      { id: agent.id, patch: { ci_fail_on: value } },
      {
        onError: (e) => setError(e instanceof Error ? e.message : String(e)),
        onSettled: () => setPending(null),
      },
    );
  };

  return (
    <div style={s.card}>
      <div style={s.text}>
        <div id="fail-ci-on-label" style={s.title}>
          {t("ciTab.failOn.title")}
        </div>
        <div style={s.hint}>{t("ciTab.failOn.hint")}</div>
        {agent.ci_fail_on === "any" && pending === null && <div style={s.note}>{t("ciTab.failOn.any")}</div>}
        <div role="alert" style={s.error}>
          {error ? t("ciTab.failOn.saveFailed", { message: error }) : null}
        </div>
      </div>
      <div role="radiogroup" aria-labelledby="fail-ci-on-label" style={s.group}>
        {FAIL_ON_OPTIONS.map((o) => {
          const on = selected === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(o.value)}
              style={{ ...s.option, ...(on ? s.optionOn : null) }}
            >
              {t(o.labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
