/* PromptModalBody — fullscreen modal body for a prompt block: monospace text +
   a line search. Fixed height so the modal stays stable even when the search
   finds nothing. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { TextInput } from "@devdigest/ui";
import { projectContextHeadingLines, type SkippedDoc } from "../../helpers";

/** Highlight every case-insensitive occurrence of `q` within a single line. */
function highlightLine(line: string, q: string): React.ReactNode {
  if (!q) return line;
  const lower = line.toLowerCase();
  const ql = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  while (i <= line.length) {
    const idx = lower.indexOf(ql, i);
    if (idx === -1) {
      parts.push(line.slice(i));
      break;
    }
    if (idx > i) parts.push(line.slice(i, idx));
    parts.push(
      <mark key={idx} style={{ background: "var(--accent)", color: "var(--bg-primary)", borderRadius: 2 }}>
        {line.slice(idx, idx + q.length)}
      </mark>,
    );
    i = idx + q.length;
  }
  return parts;
}

export function PromptModalBody({
  text,
  headings,
  skipped,
}: {
  text: string;
  /** `### ` heading paths of a Project context block → renders a jump list. */
  headings?: string[];
  /** Documents resolved but not injected, listed above the text. */
  skipped?: SkippedDoc[];
}) {
  const t = useTranslations("runs");
  const [q, setQ] = React.useState("");
  const uid = React.useId();
  const lines = React.useMemo(() => (text || "—").split("\n"), [text]);
  // line index → anchor id, only for real headings (see projectContextHeadingLines)
  const anchors = React.useMemo(() => {
    const m = new Map<number, string>();
    if (headings && headings.length > 0) {
      projectContextHeadingLines(text).forEach((h, i) => m.set(h.line, `${uid}-h${i}`));
    }
    return m;
  }, [text, headings, uid]);
  const ql = q.trim().toLowerCase();
  const shown = ql ? lines.map((l, i) => ({ l, i })).filter(({ l }) => l.toLowerCase().includes(ql)) : [];
  const jump = (i: number) => {
    const id = anchors.get(i);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  };
  const headingLines = [...anchors.keys()];
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "70vh" }}>
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <TextInput
          value={q}
          onChange={setQ}
          placeholder={t("trace.prompt.search")}
          suffix={
            ql ? (
              <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                {shown.length} / {lines.length}
              </span>
            ) : undefined
          }
        />
      </div>
      {skipped && skipped.length > 0 && (
        <div style={{ padding: "8px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0, fontSize: 12 }}>
          <div style={{ fontWeight: 600, color: "var(--warn, var(--text-secondary))" }}>
            {t("trace.projectContext.skipped", { count: skipped.length })}
          </div>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "var(--text-secondary)" }}>
            {skipped.map((d) => (
              <li key={d.path}>
                <span className="mono">{d.path}</span> — {t(`trace.projectContext.reason.${d.reason}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {headingLines.length > 0 && (
        <nav
          aria-label={t("trace.projectContext.jumpList")}
          style={{ padding: "8px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", gap: 6, flexWrap: "wrap" }}
        >
          {headingLines.map((line, n) => {
            const path = headings?.[n] ?? lines[line];
            return (
              <button
                key={line}
                type="button"
                className="mono"
                aria-label={t("trace.projectContext.jumpTo", { path })}
                onClick={() => jump(line)}
                style={{ fontSize: 12, padding: "2px 8px", minHeight: 24, border: "1px solid var(--border)", borderRadius: 5, background: "var(--bg-elevated)", color: "var(--accent-text)", cursor: "pointer" }}
              >
                {path}
              </button>
            );
          })}
        </nav>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {ql && shown.length === 0 ? (
          <div style={{ padding: "32px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            {t("trace.prompt.noMatches", { q: q.trim() })}
          </div>
        ) : (
          <pre
            className="mono"
            style={{ margin: 0, padding: "16px 24px", whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.6 }}
          >
            {ql
              ? shown.map(({ l, i }) => (
                  <div key={i} id={anchors.get(i)}>
                    {highlightLine(l, q)}
                  </div>
                ))
              : lines.map((l, i) => (
                  <React.Fragment key={i}>
                    {anchors.has(i) ? <span id={anchors.get(i)}>{l}</span> : l}
                    {i < lines.length - 1 ? "\n" : null}
                  </React.Fragment>
                ))}
          </pre>
        )}
      </div>
    </div>
  );
}
