import type { IntentConfidence } from "@devdigest/shared";

/** Badge color per confidence level (WCAG AA: icon + label, never color alone —
    the caller still renders the confidence WORD, this only picks the accent). */
export function confidenceColor(level: IntentConfidence): { color: string; bg: string } {
  switch (level) {
    case "high":
      return { color: "var(--ok)", bg: "var(--ok-bg)" };
    case "medium":
      return { color: "var(--warn)", bg: "var(--warn-bg)" };
    case "low":
      return { color: "var(--text-muted)", bg: "var(--bg-hover)" };
  }
}
