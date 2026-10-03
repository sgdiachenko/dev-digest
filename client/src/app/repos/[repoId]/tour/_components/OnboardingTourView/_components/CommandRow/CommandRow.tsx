"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { IconBtn } from "@devdigest/ui";
import type { OnboardingCommand } from "@/lib/types";
import { s } from "../../styles";

const warnStyle = { fontSize: 11, color: "var(--warn)", margin: "4px 0 0" } as const;

/** One run-locally command: never truncated (wraps), copy button with a select-text fallback, warnings as text. */
export function CommandRow({
  command,
  number,
  onCopied,
}: {
  command: OnboardingCommand;
  /** 1-based step number within its group. */
  number: number;
  /** Called after a successful copy so the page can announce it in its live region. */
  onCopied?: () => void;
}) {
  const t = useTranslations("onboarding");
  const codeRef = useRef<HTMLElement | null>(null);
  const [fallback, setFallback] = useState(false);

  function selectText() {
    const el = codeRef.current;
    const sel = window.getSelection();
    if (!el || !sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(command.command);
      setFallback(false);
      onCopied?.();
    } catch {
      selectText();
      setFallback(true);
    }
  }

  const source = command.source_path
    ? command.source_key
      ? `${command.source_path} › ${command.source_key}`
      : command.source_path
    : null;

  return (
    <li style={{ ...s.inset, display: "flex", gap: 12, alignItems: "center", listStyle: "none" }}>
      <span style={{ ...s.muted, minWidth: 20 }}>
        <span aria-label={t("runLocally.step", { number })}>{number}.</span>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <code
          ref={codeRef}
          style={{
            display: "block",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 13,
          }}
        >
          {command.command}
        </code>
        <div style={{ ...s.muted, fontSize: 11, marginTop: 4, overflowWrap: "anywhere" }}>
          {source && <span>{t("runLocally.source", { source })}</span>}
          {command.by_convention && <strong style={{ marginLeft: source ? 8 : 0 }}>{t("runLocally.byConvention")}</strong>}
        </div>
        {command.env_names && command.env_names.length > 0 && (
          <div style={{ ...s.muted, fontSize: 11, overflowWrap: "anywhere" }}>
            {t("runLocally.envNames", { names: command.env_names.join(", ") })}
          </div>
        )}
        {command.warnings.map((w, i) => (
          <p key={`${w.kind}-${i}`} style={warnStyle}>
            {t(`runLocally.warning.${w.kind}`, { detail: w.detail })}
          </p>
        ))}
        {fallback && <p style={{ fontSize: 12, margin: "4px 0 0" }}>{t("runLocally.copyFallback")}</p>}
      </div>
      <IconBtn icon="Copy" label={t("runLocally.copyCommand", { command: command.command })} onClick={copy} />
    </li>
  );
}
