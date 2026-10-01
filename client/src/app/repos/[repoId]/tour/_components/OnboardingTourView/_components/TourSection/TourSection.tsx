"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronUp } from "lucide-react";
import { Card, Icon, type IconName } from "@devdigest/ui";

/** Icon tile per section anchor (one of SECTION_IDS). */
const ICONS: Record<string, IconName> = {
  architecture: "Layers",
  "critical-paths": "Activity",
  "run-locally": "Command",
  "reading-path": "ListChecks",
  "first-tasks": "Target",
};

/** A tour section: labelled origin, focusable heading (anchor target), collapse button, empty-message slot. */
export function TourSection({
  id,
  title,
  origin,
  expanded,
  onToggle,
  emptyMessage,
  children,
}: {
  /** Anchor id (one of SECTION_IDS). */
  id: string;
  title: string;
  /** "facts" = built from repository facts, "ai" = written by the narrative. */
  origin: "facts" | "ai";
  expanded: boolean;
  onToggle: () => void;
  /** When set, shown instead of children (the section has no items). */
  emptyMessage?: ReactNode;
  children?: ReactNode;
}) {
  const t = useTranslations("onboarding");
  const headingId = `${id}-heading`;
  const SectionIcon = ICONS[id] ? Icon[ICONS[id]] : null;
  const Chevron = expanded ? ChevronUp : Icon.ChevronDown;
  return (
    <section id={id} aria-labelledby={headingId} style={{ scrollMarginTop: 72 }}>
      <Card style={{ padding: 20, borderRadius: 12 }}>
        <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {SectionIcon && (
            <span
              aria-hidden="true"
              style={{
                display: "inline-grid",
                placeItems: "center",
                flex: "0 0 36px",
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "var(--accent-bg)",
                color: "var(--accent-text)",
              }}
            >
              <SectionIcon size={18} />
            </span>
          )}
          <h2
            id={headingId}
            tabIndex={-1}
            style={{ fontSize: 17, fontWeight: 600, margin: 0, scrollMarginTop: 72, flex: 1, minWidth: 0 }}
          >
            {title}
          </h2>
          <span
            style={{
              fontSize: 11,
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "2px 10px",
              whiteSpace: "nowrap",
            }}
          >
            {origin === "ai" ? t("aiWritten") : t("fromFacts")}
          </span>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`${id}-body`}
            aria-label={t(expanded ? "collapse" : "expand", { section: title })}
            onClick={onToggle}
            style={{
              display: "inline-grid",
              placeItems: "center",
              width: 30,
              height: 30,
              borderRadius: 6,
              border: "1px solid transparent",
              background: "transparent",
              color: "var(--text-secondary)",
            }}
          >
            <Chevron size={16} aria-hidden="true" />
          </button>
        </header>
        <div id={`${id}-body`} hidden={!expanded} style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          {expanded && (emptyMessage ? <p style={{ margin: 0, color: "var(--text-secondary)" }}>{emptyMessage}</p> : children)}
        </div>
      </Card>
    </section>
  );
}
